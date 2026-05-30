// cloudflare-workers/mining-report/index.ts
// Worker 7: POST /api/mining-report
// Nhận số lượt xem quảng cáo từ client, cộng điểm vào Firestore miners/{uid}

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
  const sa = JSON.parse(serviceAccountJson) as { client_email: string; private_key: string }
  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/datastore',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }
  const header  = { alg: 'RS256', typ: 'JWT' }
  const encode  = (o: unknown) => btoa(JSON.stringify(o)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  const sigInput = `${encode(header)}.${encode(claim)}`
  const pemBody  = sa.private_key.replace(/-----[^-]+-----/g,'').replace(/\s/g,'')
  const derBuf   = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey('pkcs8', derBuf.buffer, { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' }, false, ['sign'])
  const sigBuf   = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(sigInput))
  const sig      = btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  const jwt      = `${sigInput}.${sig}`
  const res      = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:   `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const data = await res.json() as { access_token: string }
  return data.access_token
}

async function verifyFirebaseJWT(token: string): Promise<string | null> {
  try {
    const parts   = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')))
    return (payload.uid ?? payload.sub ?? null) as string | null
  } catch { return null }
}

type FirestoreField = { integerValue?: string; doubleValue?: number; stringValue?: string }

async function getMinerDoc(
  projectId: string, accessToken: string, uid: string,
): Promise<{ points: number; sessionCount: number; lastMiningDate: string } | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/miners/${uid}`
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) return null
  const doc  = await res.json() as { fields?: Record<string, FirestoreField> }
  if (!doc.fields) return null
  const f = doc.fields
  return {
    points:          Number(f.points?.integerValue ?? f.points?.doubleValue ?? 0),
    sessionCount:    Number(f.sessionCount?.integerValue ?? f.sessionCount?.doubleValue ?? 0),
    lastMiningDate:  f.lastMiningDate?.stringValue ?? '',
  }
}

async function updateMinerDoc(
  projectId: string, accessToken: string, uid: string,
  points: number, sessionCount: number, lastMiningDate: string,
): Promise<void> {
  const url  = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/miners/${uid}?updateMask.fieldPaths=points&updateMask.fieldPaths=sessionCount&updateMask.fieldPaths=lastMiningDate`
  await fetch(url, {
    method:  'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      fields: {
        points:         { doubleValue: points },
        sessionCount:   { integerValue: String(sessionCount) },
        lastMiningDate: { stringValue: lastMiningDate },
      },
    }),
  })
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
    if (request.method !== 'POST')   return json({ success: false, error: 'Method not allowed' }, 405)

    const authHeader = request.headers.get('Authorization')
    const jwtUid     = await verifyFirebaseJWT(authHeader?.replace('Bearer ', '') ?? '')
    if (!jwtUid) return json({ success: false, error: 'Unauthorized' }, 401)

    let body: { uid?: string; rounds?: number }
    try { body = await request.json() }
    catch { return json({ success: false, error: 'Invalid JSON' }, 400) }

    const { uid, rounds } = body
    if (!uid || typeof rounds !== 'number' || rounds < 10) {
      return json({ success: false, error: 'Missing or invalid fields' }, 400)
    }

    // uid trong JWT phải khớp với uid trong body
    if (jwtUid !== uid) return json({ success: false, error: 'UID mismatch' }, 403)

    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_SERVICE_ACCOUNT)
      const projectId   = env.FIREBASE_PROJECT_ID
      const doc         = await getMinerDoc(projectId, accessToken, uid)
      if (!doc) return json({ success: false, error: 'Miner not found' }, 404)

      const today        = new Date().toISOString().split('T')[0]
      const sessionCount = doc.lastMiningDate === today ? doc.sessionCount + 1 : 1
      const earnedPoints = Math.round(rounds * 0.1 * 10) / 10   // 0.1 điểm/lượt, làm tròn 1 chữ số
      const newPoints    = Math.round((doc.points + earnedPoints) * 10) / 10

      await updateMinerDoc(projectId, accessToken, uid, newPoints, sessionCount, today)

      return json({ success: true, data: { points: newPoints } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return json({ success: false, error: msg }, 500)
    }
  },
}
