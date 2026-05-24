// Worker 9: Cron 3am UTC+7 (0 20 * * * UTC)
// Dọn dẹp blacklist_customers đã hết hạn (updatedAt > 72h + lockedUntil đã qua)

export default {
  async scheduled(_event, env, _ctx) {
    await cleanupBlacklist(env)
  },

  // Cho phép trigger thủ công qua HTTP (debug)
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
    const result = await cleanupBlacklist(env)
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
  },
}

async function cleanupBlacklist(env) {
  const serviceToken = await getServiceAccountToken(env)
  const projectId = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT).project_id
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/blacklist_customers`
  const now = Date.now()
  const cutoff72h = now - 72 * 60 * 60 * 1000

  let deleted = 0
  let pageToken = null

  do {
    const url = pageToken ? `${baseUrl}?pageToken=${pageToken}` : baseUrl
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${serviceToken}` } })
    if (!res.ok) break

    const body = await res.json()
    const docs = body.documents ?? []
    pageToken = body.nextPageToken ?? null

    for (const doc of docs) {
      const updatedAt = getTimestamp(doc, 'updatedAt')
      const lockedUntil = getInt(doc, 'lockedUntil')

      const lockExpired = !lockedUntil || lockedUntil < now
      const stale = updatedAt > 0 && updatedAt < cutoff72h

      if (stale && lockExpired) {
        const delRes = await fetch(doc.name, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${serviceToken}` },
        })
        if (delRes.ok) deleted++
      }
    }
  } while (pageToken)

  return { deleted, timestamp: new Date().toISOString() }
}

function getInt(doc, field) {
  const v = doc.fields?.[field]
  if (!v) return 0
  return parseInt(v.integerValue ?? v.doubleValue ?? '0')
}

function getTimestamp(doc, field) {
  const v = doc.fields?.[field]
  if (!v) return 0
  if (v.timestampValue) return new Date(v.timestampValue).getTime()
  if (v.stringValue)    return new Date(v.stringValue).getTime()
  return 0
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
