// Worker 5: GET /api/turn-credentials
// Verify Firebase JWT → Cloudflare Realtime TURN API → return credentials

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return cors(null, 204)

    const authHeader = request.headers.get('Authorization') ?? ''
    const idToken = authHeader.replace('Bearer ', '').trim()
    if (!idToken) return cors(json({ success: false, error: 'Unauthorized' }), 401)

    // Lightweight JWT check: valid structure + not expired
    try {
      const parts = idToken.split('.')
      if (parts.length !== 3) throw new Error('bad token')
      const pad = (s) => s + '='.repeat((4 - s.length % 4) % 4)
      const payload = JSON.parse(atob(pad(parts[1].replace(/-/g, '+').replace(/_/g, '/'))))
      if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
        throw new Error('expired')
      }
    } catch {
      return cors(json({ success: false, error: 'Unauthorized' }), 401)
    }

    // Call Cloudflare Realtime TURN API
    const cfRes = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${env.CLOUDFLARE_TURN_KEY_ID}/credentials/generate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: 172800 }),
      }
    )

    if (!cfRes.ok) {
      const err = await cfRes.text()
      return cors(json({ success: false, error: `CF TURN ${cfRes.status}: ${err}` }), 502)
    }

    const data = await cfRes.json()
    // Response: { iceServers: [{ urls, username, credential }] }
    const server = Array.isArray(data.iceServers) ? data.iceServers[0] : data
    return cors(json({
      success: true,
      data: {
        urls:       server.urls,
        username:   server.username,
        credential: server.credential,
        ttl:        172800,
      },
    }))
  },
}

const json = (obj) => new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } })

const cors = (res, status = 200) => {
  const h = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }
  return res
    ? new Response(res.body, { status, headers: { ...Object.fromEntries(res.headers), ...h } })
    : new Response(null, { status, headers: h })
}
