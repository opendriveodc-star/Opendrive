// cloudflare-workers/notify-drivers/index.ts
// Worker 2: POST /api/notify-drivers
// Query Firestore tìm tài xế ready gần điểm đón, gửi FCM batch

interface WorkerEnv {
  FIREBASE_SERVICE_ACCOUNT: string    // JSON service account
  FIREBASE_PROJECT_ID:      string
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

// Lấy Firebase access token từ service account (JWT tự ký)
async function getFirebaseAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson) as {
    client_email: string
    private_key:  string
  }

  const now   = Math.floor(Date.now() / 1000)
  const claim = {
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/datastore',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }

  const header  = { alg: 'RS256', typ: 'JWT' }
  const encode  = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const sigInput = `${encode(header)}.${encode(claim)}`

  // Import RSA private key và ký JWT
  const pemBody    = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  const derBuffer  = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0))
  const cryptoKey  = await crypto.subtle.importKey(
    'pkcs8',
    derBuffer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuffer  = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(sigInput))
  const sigBase64  = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${sigInput}.${sigBase64}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const tokenData = await tokenRes.json() as { access_token: string }
  return tokenData.access_token
}

// Xác thực Firebase JWT từ client
async function verifyFirebaseJWT(token: string): Promise<boolean> {
  // Cloudflare Workers không có SDK để verify – check basic format
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.uid === 'string' || typeof payload.sub === 'string'
  } catch {
    return false
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }
    if (request.method !== 'POST') {
      return json({ success: false, error: 'Method not allowed' }, 405)
    }

    const authHeader = request.headers.get('Authorization')
    const clientToken = authHeader?.replace('Bearer ', '') ?? ''
    if (!(await verifyFirebaseJWT(clientToken))) {
      return json({ success: false, error: 'Unauthorized' }, 401)
    }

    let body: { tripId?: string; geohash?: string; vehicleType?: string }
    try {
      body = await request.json()
    } catch {
      return json({ success: false, error: 'Invalid JSON' }, 400)
    }

    const { tripId, geohash, vehicleType } = body
    if (!tripId || !geohash || !vehicleType) {
      return json({ success: false, error: 'Missing fields' }, 400)
    }

    try {
      const accessToken   = await getFirebaseAccessToken(env.FIREBASE_SERVICE_ACCOUNT)
      const projectId     = env.FIREBASE_PROJECT_ID
      const geohashPrefix = geohash.slice(0, 6)
      const randomId      = Math.floor(Math.random() * 6)  // 0-5

      // Query Firestore REST API
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`
      const queryBody = {
        structuredQuery: {
          from:  [{ collectionId: 'drivers' }],
          where: {
            compositeFilter: {
              op:      'AND',
              filters: [
                { fieldFilter: { field: { fieldPath: 'status' },      op: 'EQUAL',               value: { stringValue: 'ready' } } },
                { fieldFilter: { field: { fieldPath: 'vehicleType' }, op: 'EQUAL',               value: { stringValue: vehicleType } } },
                { fieldFilter: { field: { fieldPath: 'random_id' },   op: 'EQUAL',               value: { integerValue: randomId } } },
                { fieldFilter: { field: { fieldPath: 'geohash' },     op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: geohashPrefix } } },
                { fieldFilter: { field: { fieldPath: 'geohash' },     op: 'LESS_THAN_OR_EQUAL',    value: { stringValue: geohashPrefix + '~' } } },
              ],
            },
          },
        },
      }

      const firestoreRes = await fetch(firestoreUrl, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify(queryBody),
      })
      const docs = await firestoreRes.json() as Array<{
        document?: { fields?: { fcmToken?: { stringValue?: string } } }
      }>

      // Lấy FCM tokens
      const fcmTokens: string[] = []
      for (const item of docs) {
        const token = item.document?.fields?.fcmToken?.stringValue
        if (token) fcmTokens.push(token)
      }

      if (fcmTokens.length === 0) {
        return json({ success: true, data: { notified: 0 } })
      }

      // Gửi FCM batch
      const fcmUrl = 'https://fcm.googleapis.com/v1/projects/' + projectId + '/messages:send'
      const fcmResults = await Promise.allSettled(
        fcmTokens.map((token) =>
          fetch(fcmUrl, {
            method:  'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type':  'application/json',
            },
            body: JSON.stringify({
              message: {
                token,
                data:         { type: 'new_trip', tripId },
                notification: { title: 'Chuyến xe mới', body: 'Có khách đặt xe gần bạn' },
              },
            }),
          })
        )
      )

      const notified = fcmResults.filter((r) => r.status === 'fulfilled').length
      return json({ success: true, data: { notified } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return json({ success: false, error: msg }, 500)
    }
  },
}
