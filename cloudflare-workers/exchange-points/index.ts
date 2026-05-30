// cloudflare-workers/exchange-points/index.ts
// Worker 8: POST /api/exchange-points
// Đổi điểm đào coin → ODC: trừ điểm Firestore, gửi ODC từ Distributor đến ví tài xế

import {
  Keypair,
  Asset,
  TransactionBuilder,
  Operation,
  Networks,
  Horizon,
  Transaction,
  Memo,
} from '@stellar/stellar-sdk'

interface WorkerEnv {
  FIREBASE_SERVICE_ACCOUNT:       string
  FIREBASE_PROJECT_ID:            string
  STELLAR_DISTRIBUTOR_PRIVATE_KEY: string
  STELLAR_ISSUER_ADDRESS:         string
  STELLAR_FEEBUMP_PRIVATE_KEY:    string
  STELLAR_NETWORK:                string
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const EXCHANGE_FEE_ODC = 0.1   // phí cố định 0.1 ODC mỗi lần đổi
const MIN_POINTS       = 10    // điểm tối thiểu

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

async function getFirebaseAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson) as { client_email: string; private_key: string }
  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/datastore',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }
  const header   = { alg: 'RS256', typ: 'JWT' }
  const encode   = (o: unknown) => btoa(JSON.stringify(o)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  const sigInput = `${encode(header)}.${encode(claim)}`
  const pemBody  = sa.private_key.replace(/-----[^-]+-----/g,'').replace(/\s/g,'')
  const derBuf   = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey('pkcs8', derBuf.buffer, { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' }, false, ['sign'])
  const sigBuf   = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(sigInput))
  const sig      = btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  const jwt      = `${sigInput}.${sig}`
  const res      = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:   `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const data = await res.json() as { access_token: string }
  return data.access_token
}

async function verifyFirebaseJWT(token: string): Promise<string | null> {
  try {
    const parts   = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')))
    return (payload.uid ?? payload.sub ?? null) as string | null
  } catch { return null }
}

type FirestoreField = { integerValue?: string; doubleValue?: number }

async function getMinerPoints(
  projectId: string, accessToken: string, uid: string,
): Promise<number> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/miners/${uid}`
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error('Miner not found')
  const doc  = await res.json() as { fields?: Record<string, FirestoreField> }
  return Number(doc.fields?.points?.integerValue ?? doc.fields?.points?.doubleValue ?? 0)
}

async function deductMinerPoints(
  projectId: string, accessToken: string, uid: string, newPoints: number,
): Promise<void> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/miners/${uid}?updateMask.fieldPaths=points`
  await fetch(url, {
    method:  'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields: { points: { integerValue: String(newPoints) } } }),
  })
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
    if (request.method !== 'POST')   return json({ success: false, error: 'Method not allowed' }, 405)

    const authHeader = request.headers.get('Authorization')
    const jwtUid     = await verifyFirebaseJWT(authHeader?.replace('Bearer ', '') ?? '')
    if (!jwtUid) return json({ success: false, error: 'Unauthorized' }, 401)

    let body: { uid?: string; points?: number; walletAddress?: string; memo?: string }
    try { body = await request.json() }
    catch { return json({ success: false, error: 'Invalid JSON' }, 400) }

    const { uid, points, walletAddress, memo } = body
    if (!uid || !points || !walletAddress) return json({ success: false, error: 'Missing fields' }, 400)
    if (jwtUid !== uid)                    return json({ success: false, error: 'UID mismatch' }, 403)
    if (points < MIN_POINTS)               return json({ success: false, error: `Min ${MIN_POINTS} points` }, 400)
    if (!walletAddress.startsWith('G') || walletAddress.length !== 56) {
      return json({ success: false, error: 'Invalid Stellar wallet' }, 400)
    }

    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_SERVICE_ACCOUNT)
      const projectId   = env.FIREBASE_PROJECT_ID

      const currentPoints = await getMinerPoints(projectId, accessToken, uid)
      if (currentPoints < points) return json({ success: false, error: 'Insufficient points' }, 400)

      // Trừ điểm trong Firestore trước khi gửi ODC (atomic-enough cho scale MVP)
      await deductMinerPoints(projectId, accessToken, uid, currentPoints - points)

      // Gửi ODC từ Distributor → walletAddress
      const isTestnet      = env.STELLAR_NETWORK !== 'mainnet'
      const networkPass    = isTestnet ? Networks.TESTNET : Networks.PUBLIC
      const horizonUrl     = isTestnet ? 'https://horizon-testnet.stellar.org' : 'https://horizon.stellar.org'
      const server         = new Horizon.Server(horizonUrl)
      const distributorKp  = Keypair.fromSecret(env.STELLAR_DISTRIBUTOR_PRIVATE_KEY)
      const feeBumpKp      = Keypair.fromSecret(env.STELLAR_FEEBUMP_PRIVATE_KEY)
      const ODC_ASSET      = new Asset('ODC', env.STELLAR_ISSUER_ADDRESS)

      // 1 điểm = 1 ODC, trừ phí 0.1 ODC
      const odcSent = points - EXCHANGE_FEE_ODC

      const distAccount = await server.loadAccount(distributorKp.publicKey())
      const txBuilder = new TransactionBuilder(distAccount, { fee: '100', networkPassphrase: networkPass })
        .addOperation(Operation.payment({
          destination: walletAddress,
          asset:       ODC_ASSET,
          amount:      odcSent.toFixed(7),
        }))
        .setTimeout(60)
      // Luôn thêm text memo: dùng để wallet.tsx nhận biết giao dịch từ miner
      txBuilder.addMemo(Memo.text(memo?.trim() || 'MDC'))
      const innerTx = txBuilder.build()
      innerTx.sign(distributorKp)

      const feeBump = TransactionBuilder.buildFeeBumpTransaction(
        feeBumpKp, '200', innerTx as Transaction, networkPass,
      )
      feeBump.sign(feeBumpKp)
      const result = await server.submitTransaction(feeBump)
      const txHash = (result as { hash: string }).hash

      return json({ success: true, data: { txHash, odcSent } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return json({ success: false, error: msg }, 500)
    }
  },
}
