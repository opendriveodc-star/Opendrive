// cloudflare-workers/sos-alert/index.ts
// Worker 10: POST /api/sos-alert
// Ghi cảnh báo SOS lên Stellar blockchain với 27-byte memo
// Người gửi: Distributor → SOS Wallet (fee-bumped)
// Lần đầu: tự tạo ODC trustline cho SOS wallet bằng SOS_PRIVATE_KEY

import {
  Keypair,
  Asset,
  TransactionBuilder,
  Operation,
  Networks,
  Horizon,
  FeeBumpTransaction,
  Transaction,
  Memo,
  BASE_FEE,
} from '@stellar/stellar-sdk'

interface WorkerEnv {
  STELLAR_NETWORK:                 string
  STELLAR_SOS_ADDRESS:             string
  STELLAR_ISSUER_ADDRESS:          string
  STELLAR_DISTRIBUTOR_ADDRESS:     string
  STELLAR_SOS_PRIVATE_KEY:         string
  STELLAR_DISTRIBUTOR_PRIVATE_KEY: string
  STELLAR_FEEBUMP_PRIVATE_KEY:     string
  FIREBASE_SERVICE_ACCOUNT:        string
}

interface SosAlertBody {
  driverPhone:   string
  customerPhone: string
  lat:           number
  lng:           number
  triggeredBy:   'driver' | 'customer'
  memo27bytes:   string   // base64 27-byte SOS memo (pre-encoded by client)
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

async function verifyFirebaseJWT(token: string): Promise<boolean> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.uid === 'string' || typeof payload.sub === 'string'
  } catch { return false }
}

async function hasTrustline(server: Horizon.Server, address: string, assetCode: string, issuer: string): Promise<boolean> {
  try {
    const account = await server.loadAccount(address)
    return account.balances.some(
      (b: any) => b.asset_code === assetCode && b.asset_issuer === issuer,
    )
  } catch { return false }
}

async function setupTrustline(
  server:      Horizon.Server,
  sosKp:       Keypair,
  ODC_ASSET:   Asset,
  networkPass: string,
): Promise<void> {
  const sosAccount = await server.loadAccount(sosKp.publicKey())
  const tx = new TransactionBuilder(sosAccount, { fee: BASE_FEE, networkPassphrase: networkPass })
    .addOperation(Operation.changeTrust({ asset: ODC_ASSET }))
    .setTimeout(60)
    .build()
  tx.sign(sosKp)
  await server.submitTransaction(tx)
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
    if (request.method !== 'POST')   return json({ success: false, error: 'Method not allowed' }, 405)

    const authHeader  = request.headers.get('Authorization')
    const clientToken = authHeader?.replace('Bearer ', '') ?? ''
    if (!(await verifyFirebaseJWT(clientToken))) return json({ success: false, error: 'Unauthorized' }, 401)

    let body: SosAlertBody
    try { body = await request.json() }
    catch { return json({ success: false, error: 'Invalid JSON' }, 400) }

    const { memo27bytes } = body
    if (!memo27bytes) return json({ success: false, error: 'Missing memo27bytes' }, 400)

    try {
      const isTestnet    = env.STELLAR_NETWORK !== 'mainnet'
      const networkPass  = isTestnet ? Networks.TESTNET : Networks.PUBLIC
      const horizonUrl   = isTestnet ? 'https://horizon-testnet.stellar.org' : 'https://horizon.stellar.org'
      const server       = new Horizon.Server(horizonUrl)
      const ODC_ASSET    = new Asset('ODC', env.STELLAR_ISSUER_ADDRESS)

      const distributorKp = Keypair.fromSecret(env.STELLAR_DISTRIBUTOR_PRIVATE_KEY)
      const feeBumpKp     = Keypair.fromSecret(env.STELLAR_FEEBUMP_PRIVATE_KEY)
      const sosKp         = Keypair.fromSecret(env.STELLAR_SOS_PRIVATE_KEY)

      // Tự setup trustline lần đầu nếu chưa có
      const hasTrust = await hasTrustline(server, env.STELLAR_SOS_ADDRESS, 'ODC', env.STELLAR_ISSUER_ADDRESS)
      if (!hasTrust) {
        await setupTrustline(server, sosKp, ODC_ASSET, networkPass)
      }

      // Decode base64 memo → 27 bytes, pad to 32 bytes, convert to hex
      const raw    = Uint8Array.from(atob(memo27bytes), c => c.charCodeAt(0))
      const padded = new Uint8Array(32)
      padded.set(raw)
      const memoHex = Array.from(padded).map(b => b.toString(16).padStart(2, '0')).join('')

      // Distributor gửi 0.0000001 ODC → SOS wallet với SOS memo
      const distributorAccount = await server.loadAccount(distributorKp.publicKey())
      const innerTx = new TransactionBuilder(distributorAccount, { fee: '100', networkPassphrase: networkPass })
        .addOperation(Operation.payment({
          destination: env.STELLAR_SOS_ADDRESS,
          asset:       ODC_ASSET,
          amount:      '0.0000001',
        }))
        .addMemo(Memo.hash(memoHex))
        .setTimeout(60)
        .build()
      innerTx.sign(distributorKp)

      const feeBump = TransactionBuilder.buildFeeBumpTransaction(
        feeBumpKp, '200', innerTx as Transaction, networkPass,
      )
      feeBump.sign(feeBumpKp)
      const result = await server.submitTransaction(feeBump)
      const txHash = (result as { hash: string }).hash

      return json({ success: true, data: { txHash } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return json({ success: false, error: msg }, 500)
    }
  },
}
