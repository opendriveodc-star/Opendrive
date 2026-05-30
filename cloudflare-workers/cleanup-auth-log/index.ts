// cloudflare-workers/cleanup-auth-log/index.ts
// Worker 11: Cron job – xóa auth_log records > 24h trên Firestore

interface WorkerEnv {
  FIREBASE_SERVICE_ACCOUNT: string
  FIREBASE_PROJECT_ID:      string
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
    console.log('[cleanup-auth-log] Starting cleanup...')
    try {
      const token     = await getFirebaseAccessToken(env.FIREBASE_SERVICE_ACCOUNT)
      const projectId = env.FIREBASE_PROJECT_ID
      const cutoff    = Date.now() - 24 * 60 * 60 * 1000

      // Query auth_log where verifiedAt < cutoff
      const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`
      const queryRes = await fetch(queryUrl, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'auth_log' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'verifiedAt' },
                op:    'LESS_THAN',
                value: { integerValue: String(cutoff) },
              },
            },
          },
        }),
      })

      const results = await queryRes.json() as Array<{ document?: { name: string } }>
      const docs    = results.filter(r => r.document?.name)
      if (!docs.length) {
        console.log('[cleanup-auth-log] Nothing to clean.')
        return
      }

      // Xóa từng doc
      let deleted = 0
      await Promise.allSettled(
        docs.map(async r => {
          const delRes = await fetch(
            `https://firestore.googleapis.com/v1/${r.document!.name}`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
          )
          if (delRes.ok) deleted++
        }),
      )

      console.log(`[cleanup-auth-log] Done. Deleted ${deleted}/${docs.length} records.`)
    } catch (err) {
      console.error('[cleanup-auth-log] Error:', err)
    }
  },
}
