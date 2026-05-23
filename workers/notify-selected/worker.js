var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.ts
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS }
  });
}
__name(json, "json");
async function getFirebaseAccessToken(serviceAccountJson) {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1e3);
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };
  const header = { alg: "RS256", typ: "JWT" };
  const encode = /* @__PURE__ */ __name((obj) => btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"), "encode");
  const sigInput = `${encode(header)}.${encode(claim)}`;
  const pemBody = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const derBuffer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    derBuffer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(sigInput));
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(sigBuffer))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const jwt = `${sigInput}.${sigBase64}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}
__name(getFirebaseAccessToken, "getFirebaseAccessToken");
async function getDriverFcmToken(projectId, accessToken, driverUid) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/drivers/${driverUid}`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  if (!res.ok) return null;
  const doc = await res.json();
  return doc.fields?.fcmToken?.stringValue ?? null;
}
__name(getDriverFcmToken, "getDriverFcmToken");
async function verifyFirebaseJWT(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.uid === "string" || typeof payload.sub === "string";
  } catch {
    return false;
  }
}
__name(verifyFirebaseJWT, "verifyFirebaseJWT");
var index_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return json({ success: false, error: "Method not allowed" }, 405);
    }
    const authHeader = request.headers.get("Authorization");
    const clientToken = authHeader?.replace("Bearer ", "") ?? "";
    if (!await verifyFirebaseJWT(clientToken)) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, error: "Invalid JSON" }, 400);
    }
    const { tripId, driverUid } = body;
    if (!tripId || !driverUid) {
      return json({ success: false, error: "Missing fields" }, 400);
    }
    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_SERVICE_ACCOUNT);
      const projectId = env.FIREBASE_PROJECT_ID;
      const fcmToken = await getDriverFcmToken(projectId, accessToken, driverUid);
      if (!fcmToken) {
        return json({ success: false, error: "Driver FCM token not found" }, 404);
      }
      const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
      await fetch(fcmUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: {
            token: fcmToken,
            data: { type: "trip_selected", tripId },
            notification: { title: "B\u1EA1n \u0111\u01B0\u1EE3c ch\u1ECDn!", body: "Kh\xE1ch \u0111\xE3 ch\u1ECDn b\u1EA1n cho chuy\u1EBFn xe" }
          }
        })
      });
      return json({ success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return json({ success: false, error: msg }, 500);
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
