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

// ── Geohash helpers ──────────────────────────────────────────────────────────
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'

function geohashDecode(hash: string) {
  let isLng = true
  const lat = [-90.0, 90.0], lng = [-180.0, 180.0]
  for (const c of hash) {
    const v = BASE32.indexOf(c)
    for (let b = 4; b >= 0; b--) {
      const range = isLng ? lng : lat
      const mid   = (range[0] + range[1]) / 2
      if ((v >> b) & 1) range[0] = mid; else range[1] = mid
      isLng = !isLng
    }
  }
  return {
    lat:    (lat[0] + lat[1]) / 2,
    lng:    (lng[0] + lng[1]) / 2,
    latErr: (lat[1] - lat[0]) / 2,
    lngErr: (lng[1] - lng[0]) / 2,
  }
}

function geohashEncode(lat: number, lng: number, prec: number): string {
  let isLng = true, ch = 0, bit = 0, result = ''
  const latR = [-90.0, 90.0], lngR = [-180.0, 180.0]
  while (result.length < prec) {
    const range = isLng ? lngR : latR
    const val   = isLng ? lng  : lat
    const mid   = (range[0] + range[1]) / 2
    if (val >= mid) { ch |= 1 << (4 - bit); range[0] = mid } else range[1] = mid
    isLng = !isLng
    if (++bit === 5) { result += BASE32[ch]; bit = 0; ch = 0 }
  }
  return result
}

function geohashNeighbors(hash: string): string[] {
  const prec = hash.length
  const { lat, lng, latErr, lngErr } = geohashDecode(hash)
  const cells = new Set([hash])
  for (const [dlat, dlng] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]] as [number,number][]) {
    const nLat = lat + dlat * latErr * 2
    const nLng = lng + dlng * lngErr * 2
    if (nLat > -90 && nLat < 90 && nLng > -180 && nLng < 180)
      cells.add(geohashEncode(nLat, nLng, prec))
  }
  return [...cells]
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
      const accessToken  = await getFirebaseAccessToken(env.FIREBASE_SERVICE_ACCOUNT)
      const projectId    = env.FIREBASE_PROJECT_ID
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`

      // 9 ô geohash: center + 8 neighbors
      const cells    = geohashNeighbors(geohash.slice(0, 6))
      const startId  = Math.floor(Math.random() * 6)

      type DriverDoc = { document?: { fields?: { fcmToken?: { stringValue?: string }; uid?: { stringValue?: string } } } }

      async function queryCell(prefix: string, randomId: number): Promise<DriverDoc[]> {
        const body = {
          structuredQuery: {
            from:  [{ collectionId: 'drivers' }],
            where: {
              compositeFilter: {
                op: 'AND',
                filters: [
                  { fieldFilter: { field: { fieldPath: 'status' },      op: 'EQUAL',                 value: { stringValue: 'ready' } } },
                  { fieldFilter: { field: { fieldPath: 'vehicleType' }, op: 'EQUAL',                 value: { stringValue: vehicleType } } },
                  { fieldFilter: { field: { fieldPath: 'random_id' },   op: 'EQUAL',                 value: { integerValue: randomId } } },
                  { fieldFilter: { field: { fieldPath: 'geohash' },     op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: prefix } } },
                  { fieldFilter: { field: { fieldPath: 'geohash' },     op: 'LESS_THAN_OR_EQUAL',    value: { stringValue: prefix + '~' } } },
                ],
              },
            },
          },
        }
        const res = await fetch(firestoreUrl, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) return []
        try { return await res.json() as DriverDoc[] } catch { return [] }
      }

      const fcmTokens: string[] = []
      const seenUids  = new Set<string>()

      // Thử từng random_id cho đến khi tìm được tài xế
      for (let i = 0; i < 6; i++) {
        const randomId = (startId + i) % 6
        // Chạy 9 ô song song
        const results = await Promise.allSettled(cells.map(c => queryCell(c, randomId)))
        for (const r of results) {
          if (r.status !== 'fulfilled') continue
          for (const item of r.value) {
            const uid   = item.document?.fields?.uid?.stringValue
            const token = item.document?.fields?.fcmToken?.stringValue
            if (token && uid && !seenUids.has(uid)) {
              seenUids.add(uid)
              fcmTokens.push(token)
            }
          }
        }
        if (fcmTokens.length > 0) break
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
