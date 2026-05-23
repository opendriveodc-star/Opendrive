// Worker 7: POST /api/mining-report
// Body: { uid, rounds }
// Returns: { success: true, data: { points: number } }

const MAX_SESSIONS_PER_DAY = 3
const MAX_ROUNDS = 100
const MIN_ROUNDS = 10

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return cors(null, 204)
    if (request.method !== 'POST') return cors(json({ success: false, error: 'Method not allowed' }), 405)

    const uid = verifyJwt(request.headers.get('Authorization') ?? '')
    if (!uid) return cors(json({ success: false, error: 'Unauthorized' }), 401)

    let body
    try { body = await request.json() }
    catch { return cors(json({ success: false, error: 'Invalid JSON' }), 400) }

    const { uid: bodyUid, rounds } = body
    if (bodyUid !== uid) return cors(json({ success: false, error: 'Unauthorized' }), 401)
    if (!Number.isInteger(rounds) || rounds < MIN_ROUNDS || rounds > MAX_ROUNDS) {
      return cors(json({ success: false, error: 'Invalid rounds (10–100)' }), 400)
    }

    const serviceToken = await getServiceAccountToken(env)
    const projectId = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT).project_id
    const today = new Date().toISOString().split('T')[0]
    const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/miners/${uid}`

    const docRes = await fetch(docUrl, {
      headers: { 'Authorization': `Bearer ${serviceToken}` },
    })

    let currentPoints = 0, sessionCount = 0, exists = false

    if (docRes.status === 200) {
      const doc = await docRes.json()
      exists = true
      currentPoints = getInt(doc, 'points')
      const storedDate = getStr(doc, 'lastMiningDate')
      sessionCount = storedDate === today ? getInt(doc, 'sessionCount') : 0
    }

    if (sessionCount >= MAX_SESSIONS_PER_DAY) {
      return cors(json({ success: false, error: 'Session limit reached', code: 'SESSION_LIMIT' }), 400)
    }

    const newPoints = currentPoints + rounds
    const newSessionCount = sessionCount + 1

    if (exists) {
      await patchDoc(docUrl, serviceToken, {
        points:         { integerValue: String(newPoints) },
        sessionCount:   { integerValue: String(newSessionCount) },
        lastMiningDate: { stringValue: today },
      })
    } else {
      await fetch(docUrl, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${serviceToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            uid:            { stringValue: uid },
            phone:          { stringValue: '' },
            points:         { integerValue: String(newPoints) },
            sessionCount:   { integerValue: String(newSessionCount) },
            lastMiningDate: { stringValue: today },
            createdAt:      { timestampValue: new Date().toISOString() },
          },
        }),
      })
    }

    return cors(json({ success: true, data: { points: newPoints } }))
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

async function patchDoc(docUrl, serviceToken, fields) {
  const maskParams = Object.keys(fields)
    .map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&')
  return fetch(`${docUrl}?${maskParams}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${serviceToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
}

const getInt = (doc, f) => parseInt(doc.fields?.[f]?.integerValue ?? '0')
const getStr = (doc, f) => doc.fields?.[f]?.stringValue ?? ''
const json   = obj => new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } })
const cors   = (res, status = 200) => {
  const h = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  }
  return res
    ? new Response(res.body, { status, headers: { ...Object.fromEntries(res.headers), ...h } })
    : new Response(null, { status, headers: h })
}
