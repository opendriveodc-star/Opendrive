// cloudflare-workers/notify-selected/index.ts
// Worker 3: POST /api/notify-selected-driver
// Gửi FCM đến tài xế được khách chọn

interface WorkerEnv {
  FIREBASE_SERVICE_ACCOUNT: string
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

  const pemBody   = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  const derBuffer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    derBuffer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuffer = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(sigInput))
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const jwt = `${sigInput}.${sigBase64}`

  const tokenRes  = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const tokenData = await tokenRes.json() as { access_token: string }
  return tokenData.access_token
}

async function getDriverFcmToken(
  projectId:    string,
  accessToken:  string,
  driverUid:    string,
): Promise<string | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/drivers/${driverUid}`
  const res  = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const doc = await res.json() as {
    fields?: { fcmToken?: { stringValue?: string } }
  }
  return doc.fields?.fcmToken?.stringValue ?? null
}

async function verifyFirebaseJWT(token: string): Promise<boolean> {
  try {
    const parts   = token.split('.')
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

    const authHeader  = request.headers.get('Authorization')
    const clientToken = authHeader?.replace('Bearer ', '') ?? ''
    if (!(await verifyFirebaseJWT(clientToken))) {
      return json({ success: false, error: 'Unauthorized' }, 401)
    }

    let body: { tripId?: string; driverUid?: string }
    try {
      body = await request.json()
    } catch {
      return json({ success: false, error: 'Invalid JSON' }, 400)
    }

    const { tripId, driverUid } = body
    if (!tripId || !driverUid) {
      return json({ success: false, error: 'Missing fields' }, 400)
    }

    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_SERVICE_ACCOUNT)
      const projectId   = env.FIREBASE_PROJECT_ID
      const fcmToken    = await getDriverFcmToken(projectId, accessToken, driverUid)

      if (!fcmToken) {
        return json({ success: false, error: 'Driver FCM token not found' }, 404)
      }

      const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`
      await fetch(fcmUrl, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          message: {
            token:        fcmToken,
            data:         { type: 'trip_selected', tripId },
            notification: { title: 'Bạn được chọn!', body: 'Khách đã chọn bạn cho chuyến xe' },
          },
        }),
      })

      return json({ success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return json({ success: false, error: msg }, 500)
    }
  },
}
