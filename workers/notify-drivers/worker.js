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
var BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
function geohashDecode(hash) {
  let isLng = true;
  const lat = [-90, 90], lng = [-180, 180];
  for (const c of hash) {
    const v = BASE32.indexOf(c);
    for (let b = 4; b >= 0; b--) {
      const range = isLng ? lng : lat;
      const mid = (range[0] + range[1]) / 2;
      if (v >> b & 1) range[0] = mid;
      else range[1] = mid;
      isLng = !isLng;
    }
  }
  return {
    lat: (lat[0] + lat[1]) / 2,
    lng: (lng[0] + lng[1]) / 2,
    latErr: (lat[1] - lat[0]) / 2,
    lngErr: (lng[1] - lng[0]) / 2
  };
}
__name(geohashDecode, "geohashDecode");
function geohashEncode(lat, lng, prec) {
  let isLng = true, ch = 0, bit = 0, result = "";
  const latR = [-90, 90], lngR = [-180, 180];
  while (result.length < prec) {
    const range = isLng ? lngR : latR;
    const val = isLng ? lng : lat;
    const mid = (range[0] + range[1]) / 2;
    if (val >= mid) {
      ch |= 1 << 4 - bit;
      range[0] = mid;
    } else range[1] = mid;
    isLng = !isLng;
    if (++bit === 5) {
      result += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return result;
}
__name(geohashEncode, "geohashEncode");
function geohashNeighbors(hash) {
  const prec = hash.length;
  const { lat, lng, latErr, lngErr } = geohashDecode(hash);
  const cells = /* @__PURE__ */ new Set([hash]);
  for (const [dlat, dlng] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nLat = lat + dlat * latErr * 2;
    const nLng = lng + dlng * lngErr * 2;
    if (nLat > -90 && nLat < 90 && nLng > -180 && nLng < 180)
      cells.add(geohashEncode(nLat, nLng, prec));
  }
  return [...cells];
}
__name(geohashNeighbors, "geohashNeighbors");
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
    const { tripId, geohash, vehicleType } = body;
    if (!tripId || !geohash || !vehicleType) {
      return json({ success: false, error: "Missing fields" }, 400);
    }
    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_SERVICE_ACCOUNT);
      const projectId = env.FIREBASE_PROJECT_ID;
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
      const cells = geohashNeighbors(geohash.slice(0, 6));
      const startId = Math.floor(Math.random() * 6);
      async function queryCell(prefix, randomId) {
        const body2 = {
          structuredQuery: {
            from: [{ collectionId: "drivers" }],
            where: {
              compositeFilter: {
                op: "AND",
                filters: [
                  { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "ready" } } },
                  { fieldFilter: { field: { fieldPath: "vehicleType" }, op: "EQUAL", value: { stringValue: vehicleType } } },
                  { fieldFilter: { field: { fieldPath: "random_id" }, op: "EQUAL", value: { integerValue: randomId } } },
                  { fieldFilter: { field: { fieldPath: "geohash" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: prefix } } },
                  { fieldFilter: { field: { fieldPath: "geohash" }, op: "LESS_THAN_OR_EQUAL", value: { stringValue: prefix + "~" } } }
                ]
              }
            }
          }
        };
        const res = await fetch(firestoreUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(body2)
        });
        if (!res.ok) return [];
        try {
          return await res.json();
        } catch {
          return [];
        }
      }
      __name(queryCell, "queryCell");
      const fcmTokens = [];
      const seenUids = /* @__PURE__ */ new Set();
      for (let i = 0; i < 6; i++) {
        const randomId = (startId + i) % 6;
        const results = await Promise.allSettled(cells.map((c) => queryCell(c, randomId)));
        for (const r of results) {
          if (r.status !== "fulfilled") continue;
          for (const item of r.value) {
            const uid = item.document?.fields?.uid?.stringValue;
            const token = item.document?.fields?.fcmToken?.stringValue;
            if (token && uid && !seenUids.has(uid)) {
              seenUids.add(uid);
              fcmTokens.push(token);
            }
          }
        }
        if (fcmTokens.length > 0) break;
      }
      if (fcmTokens.length === 0) {
        return json({ success: true, data: { notified: 0 } });
      }
      const fcmUrl = "https://fcm.googleapis.com/v1/projects/" + projectId + "/messages:send";
      const fcmResults = await Promise.allSettled(
        fcmTokens.map(
          (token) => fetch(fcmUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              message: {
                token,
                data: { type: "new_trip", tripId },
                notification: { title: "Chuy\u1EBFn xe m\u1EDBi", body: "C\xF3 kh\xE1ch \u0111\u1EB7t xe g\u1EA7n b\u1EA1n" }
              }
            })
          })
        )
      );
      const notified = fcmResults.filter((r) => r.status === "fulfilled").length;
      return json({ success: true, data: { notified } });
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
