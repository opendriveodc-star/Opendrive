// cloudflare-workers/cleanup-trips/index.ts
// Worker 6: Cron job – xóa các trip node > 24h trên Firebase Realtime DB

interface WorkerEnv {
  FIREBASE_DATABASE_URL:    string
  FIREBASE_SERVICE_ACCOUNT: string
}

async function getFirebaseAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson) as { client_email: string; private_key: string }
  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }
  const header   = { alg: 'RS256', typ: 'JWT' }
  const encode   = (o: unknown) => btoa(JSON.stringify(o)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  const sigInput = `${encode(header)}.${encode(claim)}`
  const pemBody  = sa.private_key.replace(/-----[^-]+-----/g,'').replace(/\s/g,'')
  const derBuf   = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', derBuf.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(sigInput))
  const sig    = btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  const jwt    = `${sigInput}.${sig}`
  const res    = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const data = await res.json() as { access_token: string }
  return data.access_token
}

export default {
  async scheduled(_event: ScheduledEvent, env: WorkerEnv, _ctx: ExecutionContext): Promise<void> {
    console.log('[cleanup-trips] Starting cleanup...')

    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_SERVICE_ACCOUNT)
      const dbUrl       = env.FIREBASE_DATABASE_URL.replace(/\/$/, '')

      // Lấy tất cả trips
      const res = await fetch(`${dbUrl}/trips.json?auth=${accessToken}&shallow=true`)
      if (!res.ok) {
        console.error('[cleanup-trips] Failed to fetch trips:', res.status)
        return
      }

      const tripsIndex = await res.json() as Record<string, boolean> | null
      if (!tripsIndex) {
        console.log('[cleanup-trips] No trips found.')
        return
      }

      const tripIds    = Object.keys(tripsIndex)
      const cutoff     = Date.now() - 86400000  // 24h
      let   deleted    = 0

      await Promise.allSettled(
        tripIds.map(async (tripId) => {
          // Lấy createdAt của trip
          const tripRes = await fetch(`${dbUrl}/trips/${tripId}/info/createdAt.json?auth=${accessToken}`)
          if (!tripRes.ok) return

          const createdAt = await tripRes.json() as number | null
          if (createdAt === null || createdAt > cutoff) return

          // Xóa trip cũ
          const delRes = await fetch(`${dbUrl}/trips/${tripId}.json?auth=${accessToken}`, {
            method: 'DELETE',
          })
          if (delRes.ok) {
            deleted++
            console.log(`[cleanup-trips] Deleted trip: ${tripId}`)
          }
        })
      )

      console.log(`[cleanup-trips] Done. Deleted ${deleted}/${tripIds.length} trips.`)
    } catch (err) {
      console.error('[cleanup-trips] Error:', err)
    }
  },
}
