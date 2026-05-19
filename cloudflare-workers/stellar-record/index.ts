// cloudflare-workers/stellar-record/index.ts
// Worker 4: POST /api/stellar-record
// Giải mã key tài xế, ký giao dịch Stellar với 4 ví tách biệt, cập nhật Firestore

import {
  Keypair,
  Asset,
  TransactionBuilder,
  Operation,
  Networks,
  Horizon,
  FeeBumpTransaction,
  Transaction,
} from '@stellar/stellar-sdk'

interface WorkerEnv {
  MASTER_ENCRYPTION_KEY:          string
  STELLAR_ISSUER_ADDRESS:         string
  STELLAR_TRANSACTION_ADDRESS:    string
  STELLAR_DISTRIBUTOR_PRIVATE_KEY: string
  STELLAR_DISTRIBUTOR_ADDRESS:    string
  STELLAR_FEEBUMP_PRIVATE_KEY:    string
  FIREBASE_SERVICE_ACCOUNT:       string
  STELLAR_NETWORK:                string
}

interface RecordBody {
  driverUid:           string
  rating:              number
  tripPrice:           number
  memo27bytes:         string
  isCancelled:         boolean
  encryptedPrivateKey: string
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

// AES-256-GCM decrypt
async function decryptPrivateKey(blob: string, masterKey: string): Promise<string> {
  const combined  = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0))
  const iv        = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const keyMat    = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterKey.slice(0, 32).padEnd(32, '0')),
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  )
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    keyMat,
    ciphertext,
  )
  return new TextDecoder().decode(plainBuf)
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

async function updateFirestoreDriver(
  projectId:    string,
  accessToken:  string,
  driverUid:    string,
  fields:       Record<string, unknown>,
): Promise<void> {
  const fieldNames = Object.keys(fields).join(',')
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/drivers/${driverUid}?updateMask.fieldPaths=${fieldNames}`
  const body: { fields: Record<string, unknown> } = { fields: {} }
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'number') body.fields[k] = { doubleValue: v }
    else if (typeof v === 'boolean') body.fields[k] = { booleanValue: v }
    else body.fields[k] = { stringValue: String(v) }
  }
  await fetch(url, {
    method:  'PATCH',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
}

async function getFirestoreDriver(
  projectId:   string,
  accessToken: string,
  driverUid:   string,
): Promise<Record<string, { stringValue?: string; doubleValue?: number; booleanValue?: boolean; integerValue?: string }>> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/drivers/${driverUid}`
  const res  = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } })
  const doc  = await res.json() as { fields?: Record<string, { stringValue?: string; doubleValue?: number; booleanValue?: boolean; integerValue?: string }> }
  return doc.fields ?? {}
}

async function sendODC(
  server:      Server,
  signerKp:    Keypair,
  ODC_ASSET:   Asset,
  networkPass: string,
  destination: string,
  amount:      string,
): Promise<void> {
  const signerAccount = await server.loadAccount(signerKp.publicKey())
  const tx = new TransactionBuilder(signerAccount, { fee: '100', networkPassphrase: networkPass })
    .addOperation(Operation.payment({ destination, asset: ODC_ASSET, amount }))
    .setTimeout(60)
    .build()
  tx.sign(signerKp)
  await server.submitTransaction(tx)
}

async function verifyFirebaseJWT(token: string): Promise<boolean> {
  try {
    const parts   = token.split('.')
    if (parts.length !== 3) return false
    const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')))
    return typeof payload.uid === 'string' || typeof payload.sub === 'string'
  } catch { return false }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
    if (request.method !== 'POST')   return json({ success: false, error: 'Method not allowed' }, 405)

    const authHeader  = request.headers.get('Authorization')
    const clientToken = authHeader?.replace('Bearer ','') ?? ''
    if (!(await verifyFirebaseJWT(clientToken))) return json({ success: false, error: 'Unauthorized' }, 401)

    let body: RecordBody
    try { body = await request.json() }
    catch { return json({ success: false, error: 'Invalid JSON' }, 400) }

    const { driverUid, rating, tripPrice, memo27bytes, isCancelled, encryptedPrivateKey } = body
    if (!driverUid || !encryptedPrivateKey) return json({ success: false, error: 'Missing fields' }, 400)

    try {
      const isTestnet    = env.STELLAR_NETWORK !== 'mainnet'
      const networkPass  = isTestnet ? Networks.TESTNET : Networks.PUBLIC
      const horizonUrl   = isTestnet ? 'https://horizon-testnet.stellar.org' : 'https://horizon.stellar.org'
      const server             = new Horizon.Server(horizonUrl)
      const distributorKp      = Keypair.fromSecret(env.STELLAR_DISTRIBUTOR_PRIVATE_KEY)
      const feeBumpKp          = Keypair.fromSecret(env.STELLAR_FEEBUMP_PRIVATE_KEY)
      const ODC_ASSET          = new Asset('ODC', env.STELLAR_ISSUER_ADDRESS)

      const driverSecret = await decryptPrivateKey(encryptedPrivateKey, env.MASTER_ENCRYPTION_KEY)
      const driverKp     = Keypair.fromSecret(driverSecret)

      const baseFee      = tripPrice * 0.00001
      let txHash         = ''
      let odcCharged     = baseFee

      if (isCancelled) {
        // Hủy chuyến: tài xế trả phạt 3× baseFee về Ví Distributor
        const driverAccount = await server.loadAccount(driverKp.publicKey())
        const innerTx = new TransactionBuilder(driverAccount, { fee: '100', networkPassphrase: networkPass })
          .addOperation(Operation.payment({
            destination: env.STELLAR_DISTRIBUTOR_ADDRESS,
            asset:       ODC_ASSET,
            amount:      (baseFee * 3).toFixed(7),
          }))
          .setTimeout(60)
          .build()
        innerTx.sign(driverKp)

        const feeBump = TransactionBuilder.buildFeeBumpTransaction(
          feeBumpKp,
          '200',
          innerTx as Transaction,
          networkPass,
        )
        feeBump.sign(feeBumpKp)
        const result = await server.submitTransaction(feeBump)
        txHash     = (result as { hash: string }).hash
        odcCharged = baseFee * 3
      } else {
        const driverAccount = await server.loadAccount(driverKp.publicKey())
        const txBuilder = new TransactionBuilder(driverAccount, { fee: '100', networkPassphrase: networkPass })
          .addOperation(Operation.payment({
            destination: env.STELLAR_TRANSACTION_ADDRESS,
            asset:       ODC_ASSET,
            amount:      baseFee.toFixed(7),
          }))

        if (memo27bytes) {
          txBuilder.addMemo({ type: 'hash', value: Buffer.from(memo27bytes, 'base64') } as never)
        }

        if (rating === 1 || rating === 2) {
          const penaltyAmt = rating === 1 ? baseFee * 2 : baseFee * 1
          txBuilder.addOperation(Operation.payment({
            destination: env.STELLAR_DISTRIBUTOR_ADDRESS,
            asset:       ODC_ASSET,
            amount:      penaltyAmt.toFixed(7),
          }))
          odcCharged += penaltyAmt
        }

        const innerTx1 = txBuilder
          .setTimeout(60)
          .build()
        innerTx1.sign(driverKp)

        const feeBump1 = TransactionBuilder.buildFeeBumpTransaction(
          feeBumpKp, '200', innerTx1 as Transaction, networkPass,
        )
        feeBump1.sign(feeBumpKp)
        const result1 = await server.submitTransaction(feeBump1)
        txHash = (result1 as { hash: string }).hash

        if (rating === 4 || rating === 5) {
          const refundAmt = rating === 5 ? baseFee * 1 : baseFee * 0.5
          await sendODC(server, distributorKp, ODC_ASSET, networkPass, driverKp.publicKey(), refundAmt.toFixed(7))
          odcCharged -= refundAmt
        }
      }

      // Cập nhật Firestore
      const projectId   = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT).project_id as string
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_SERVICE_ACCOUNT)
      const driverFields = await getFirestoreDriver(projectId, accessToken, driverUid)

      const oldRatingCount = Number(driverFields.ratingCount?.doubleValue ?? driverFields.ratingCount?.integerValue ?? 0)
      const oldRating      = Number(driverFields.rating?.doubleValue ?? 0)
      const newRatingCount = oldRatingCount + (isCancelled ? 0 : 1)
      const newRating      = newRatingCount > 0
        ? ((oldRating * oldRatingCount) + rating) / newRatingCount
        : oldRating

      const firstTripDone = driverFields.firstTripDone?.booleanValue ?? false
      const referredBy    = driverFields.referredBy?.stringValue ?? null

      const updateFields: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      }
      if (!isCancelled) {
        updateFields.rating      = newRating
        updateFields.ratingCount = newRatingCount
      }

      if (!firstTripDone && !isCancelled) {
        updateFields.firstTripDone = true
        // Bonus +10 ODC cho tài xế hoàn thành chuyến đầu
        await sendODC(server, distributorKp, ODC_ASSET, networkPass, driverKp.publicKey(), '10')
        // Bonus +10 ODC cho referrer nếu có
        if (referredBy) {
          const referrerFields = await getFirestoreDriver(projectId, accessToken, referredBy)
          const referrerWallet = referrerFields.stellarWallet?.stringValue
          if (referrerWallet) {
            await sendODC(server, distributorKp, ODC_ASSET, networkPass, referrerWallet, '10')
            const oldRefCount = Number(referrerFields.referralCount?.doubleValue ?? referrerFields.referralCount?.integerValue ?? 0)
            await updateFirestoreDriver(projectId, accessToken, referredBy, { referralCount: oldRefCount + 1 })
          }
        }
      }

      await updateFirestoreDriver(projectId, accessToken, driverUid, updateFields)

      return json({ success: true, data: { txHash, odcCharged } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return json({ success: false, error: msg }, 500)
    }
  },
}
