// cloudflare-workers/turn-credentials/index.ts
// Worker 5: GET /api/turn-credentials
// Lấy TURN credentials từ Cloudflare Realtime API (TTL 48h)

interface WorkerEnv {
  CLOUDFLARE_TURN_KEY_ID: string
  CLOUDFLARE_API_TOKEN:   string
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
    if (request.method !== 'GET') {
      return json({ success: false, error: 'Method not allowed' }, 405)
    }

    const authHeader  = request.headers.get('Authorization')
    const clientToken = authHeader?.replace('Bearer ', '') ?? ''
    if (!(await verifyFirebaseJWT(clientToken))) {
      return json({ success: false, error: 'Unauthorized' }, 401)
    }

    try {
      const TTL = 172800  // 48 giờ

      const url = `https://rtc.live.cloudflare.com/v1/turn/keys/${env.CLOUDFLARE_TURN_KEY_ID}/credentials/generate`
      const res = await fetch(url, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ ttl: TTL }),
      })

      if (!res.ok) {
        const errText = await res.text()
        return json({ success: false, error: errText }, 502)
      }

      const data = await res.json() as {
        iceServers: {
          urls:       string | string[]
          username:   string
          credential: string
        }[]
      }

      const turnServer = data.iceServers.find((s) =>
        Array.isArray(s.urls)
          ? s.urls.some((u) => u.startsWith('turn:'))
          : s.urls.startsWith('turn:')
      )

      if (!turnServer) {
        return json({ success: false, error: 'No TURN server in response' }, 502)
      }

      const urls = Array.isArray(turnServer.urls) ? turnServer.urls[0] : turnServer.urls

      return json({
        success: true,
        data: {
          urls,
          username:   turnServer.username,
          credential: turnServer.credential,
          ttl:        TTL,
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return json({ success: false, error: msg }, 500)
    }
  },
}
