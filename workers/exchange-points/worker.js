// Worker 8: POST /api/exchange-points
// Body: { uid, points, walletAddress }
// Returns: { success: true, data: { txHash, odcSent } }

import * as StellarSdk from '@stellar/stellar-sdk'

const MINING_FEE         = 0.1
const MIN_EXCHANGE_POINTS = 10

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return cors(null, 204)
    if (request.method !== 'POST') return cors(json({ success: false, error: 'Method not allowed' }), 405)

    const uid = verifyJwt(request.headers.get('Authorization') ?? '')
    if (!uid) return cors(json({ success: false, error: 'Unauthorized' }), 401)

    let body
    try { body = await request.json() }
    catch { return cors(json({ success: false, error: 'Invalid JSON' }), 400) }

    const { uid: bodyUid, points, walletAddress } = body
    if (bodyUid !== uid) return cors(json({ success: false, error: 'Unauthorized' }), 401)
    if (!Number.isInteger(points) || points < MIN_EXCHANGE_POINTS) {
      return cors(json({ success: false, error: 'Invalid points (min 10)' }), 400)
    }
    if (!walletAddress || !walletAddress.startsWith('G') || walletAddress.length !== 56) {
      return cors(json({ success: false, error: 'Invalid Stellar wallet address' }), 400)
    }

    const serviceToken = await getServiceAccountToken(env)
    const projectId = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT).project_id
    const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/miners/${uid}`

    const docRes = await fetch(docUrl, {
      headers: { 'Authorization': `Bearer ${serviceToken}` },
    })
    if (docRes.status !== 200) return cors(json({ success: false, error: 'Miner not found' }), 404)

    const doc = await docRes.json()
    const currentPoints = parseInt(doc.fields?.points?.integerValue ?? '0')
    if (currentPoints < points) {
      return cors(json({ success: false, error: 'Insufficient points', code: 'INSUFFICIENT_POINTS' }), 400)
    }

    const odcAmount = Math.max(0, points - MINING_FEE).toFixed(7)

    // Stellar: Distributor → walletAddress
    const isMainnet = env.STELLAR_NETWORK === 'mainnet'
    const networkPassphrase = isMainnet ? StellarSdk.Networks.PUBLIC : StellarSdk.Networks.TESTNET
    const server = new StellarSdk.Horizon.Server(
      isMainnet ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org'
    )
    const ODC_ASSET   = new StellarSdk.Asset('ODC', env.STELLAR_ISSUER_ADDRESS)
    const distKeypair = StellarSdk.Keypair.fromSecret(env.STELLAR_DISTRIBUTOR_PRIVATE_KEY)
    const feeKeypair  = StellarSdk.Keypair.fromSecret(env.STELLAR_FEEBUMP_PRIVATE_KEY)

    let txHash
    try {
      const distAccount = await server.loadAccount(distKeypair.publicKey())
      const tx = new StellarSdk.TransactionBuilder(distAccount, { fee: '1000', networkPassphrase })
        .addOperation(StellarSdk.Operation.payment({
          destination: walletAddress,
          asset:       ODC_ASSET,
          amount:      odcAmount,
        }))
        .setTimeout(60)
        .build()
      tx.sign(distKeypair)

      const feeBump = StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
        feeKeypair, '2000', tx, networkPassphrase
      )
      feeBump.sign(feeKeypair)

      const result = await server.submitTransaction(feeBump)
      txHash = result.hash
    } catch (err) {
      return cors(json({ success: false, error: `Stellar transfer failed: ${err.message}` }), 500)
    }

    // Deduct points
    const maskParams = 'updateMask.fieldPaths=points'
    await fetch(`${docUrl}?${maskParams}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${serviceToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { points: { integerValue: String(currentPoints - points) } } }),
    })

    return cors(json({ success: true, data: { txHash, odcSent: parseFloat(odcAmount) } }))
  },
}

function verifyJwt(authHeader) {
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const pad = s => s + '='.repeat((4 - s.length % 4) % 4)
    const payload = JSON.parse(atob(pad(parts[1].replace(/-/g, '+').replace(/_/g, '/'))))
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload.sub
  } catch { return null }
}

async function getServiceAccountToken(env) {
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)
  const now = Math.floor(Date.now() / 1000)
  const toB64url = obj =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const header  = toB64url({ alg: 'RS256', typ: 'JWT' })
  const payload = toB64url({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  })
  const sigInput = `${header}.${payload}`
  const keyPem = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----\n?/, '')
    .replace(/\n?-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '')
  const binaryKey = Uint8Array.from(atob(keyPem), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )
  const sigBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(sigInput)
  )
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const jwt = `${sigInput}.${sig}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })
  const { access_token } = await res.json()
  return access_token
}

const json = obj => new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } })
const cors = (res, status = 200) => {
  const h = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  }
  return res
    ? new Response(res.body, { status, headers: { ...Object.fromEntries(res.headers), ...h } })
    : new Response(null, { status, headers: h })
}
