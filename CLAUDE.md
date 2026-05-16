# CLAUDE.md – Dự Án OpenDrive

> Tài liệu hướng dẫn đầy đủ cho Claude Code Agent khi build dự án OpenDrive.
> Đọc kỹ toàn bộ file này trước khi bắt đầu bất kỳ task nào.

---

## 0. TRẠNG THÁI HIỆN TẠI *(cập nhật mỗi khi kết thúc session)*

**Cập nhật lần cuối:** 2026-05-16 (session 3)

### ✅ Đã hoàn thành – Scaffold + Core Implementation + Bug Fixes + Hạ Tầng
Toàn bộ 66 file skeleton đã được tạo tại `D:\OpenDrive\`. Đã implement các luồng core chính với Firebase, WebRTC, và Cloudflare Workers. Đã fix toàn bộ bugs, deploy hạ tầng hoàn chỉnh.

| Nhóm | File | Trạng thái |
|---|---|---|
| Config gốc | package.json, app.json, eas.json, tsconfig.json, .env, .gitignore | ✅ Xong |
| Types | src/types/index.ts | ✅ Xong (thêm `fcmToken` vào DriverDoc & DriverInfo) |
| Constants | src/constants/index.ts | ✅ Xong (thêm WORKER.MINING_REPORT + WORKER.EXCHANGE_POINTS) |
| i18n | vi.json, en.json, index.ts | ✅ Xong |
| Services | firebase, firestore, cloudflare, webrtc, location, odc, network | ✅ Xong |
| Components | ODCBalance, NetworkAlert, QuoteList, BlacklistBanner, MapView | ✅ Xong |
| Hooks | useODCBalance, useDriverInfo, useCountdown | ✅ Xong (useODCBalance thêm polling 30s) |
| Utils | nanoid, format, storage | ✅ Xong |
| App screens | Tất cả screens (auth, driver, customer, mining, lock) | ✅ Xong |
| Cloudflare Workers | **8 workers** deployed + secrets đầy đủ | ✅ Xong |
| Firebase Rules | firestore.rules, database.rules.json | ✅ Deployed lên Firebase |
| Firebase Config | google-services.json, .firebaserc, firebase.json | ✅ Xong |
| Docs | CLAUDE.md, README.md | ✅ Xong |
| **Firebase Auth** | Phone OTP thật với Firebase Auth + reCAPTCHA | ✅ **Xong** |
| **Trip Creation** | Customer đặt xe + geocoding OSRM thật | ✅ **Xong** |
| **WebRTC Signaling** | P2P connection + DataChannel cho tracking | ✅ **Xong** |
| **Dependencies** | react-native-webrtc, firebase, expo-firebase-recaptcha, **expo-notifications** | ✅ **Xong** |
| **Trip Completion** | Driver nhận rating DataChannel → gọi recordTrip → xóa RTDB | ✅ **Xong** |
| **FCM Token** | Đăng ký + lưu Firestore + xử lý new_trip / trip_selected | ✅ **Xong** |
| **Mining Report** | stopMining gọi Worker thật, ghi điểm Firestore | ✅ **Xong** |
| **Exchange Points** | Đổi điểm → ODC thực sự qua Distributor wallet | ✅ **Xong** |
| **Phone Validation** | Validate 19 đầu số di động VN đầy đủ | ✅ **Xong** |
| **OSRM Resilience** | Retry 2 lần + Haversine fallback khi OSRM down | ✅ **Xong** |
| **Hạ tầng Firebase** | Phone Auth, Firestore, RTDB, FCM – đã cấu hình & deployed rules | ✅ **Xong** |
| **Hạ tầng Cloudflare** | 8 workers deployed, tất cả secrets đã set | ✅ **Xong** |
| **Hạ tầng Stellar** | 4 ví testnet, 1B ODC phát hành, secrets set vào Workers | ✅ **Xong** |
| **TURN Server** | Cloudflare Realtime TURN activated, worker fix + deploy | ✅ **Xong** |
| **MapView** | WebView + Leaflet.js + **OpenFreeMap** tiles, real-time marker qua injectJavaScript | ✅ **Xong** |
| **EAS Build setup** | Git, EAS CLI, projectId, assets, .npmrc, package versions đồng bộ SDK 53 | ✅ **Xong** |
| **APK Build #1** | Build thành công – thiếu react-native-safe-area-context | ❌ Crash |
| **APK Build #2** | Thêm safe-area-context + screens, fix TypeScript errors | 🔄 **Đang build** |
| **Firebase Auth persistence** | initializeAuth + indexedDBLocalPersistence | ✅ **Xong** |
| **expo-firebase-recaptcha** | Xóa, thay mock verifier – dùng được Firebase test phone numbers | ✅ **Xong** |

### 🔲 Việc cần làm tiếp theo (theo thứ tự)

**Bước 4 – EAS Build** *(đang hoàn tất)*
- [x] Tạo tài khoản Expo → `eas login` ✅
- [x] `eas build:configure` → projectId `be952562-1ee2-41c0-b74f-e9741042862b` ✅
- [x] APK Build #1 thành công nhưng crash (thiếu safe-area-context) ✅
- [x] APK Build #2 đang chạy – bao gồm safe-area-context + screens ✅
- [ ] Cài APK #2 lên emulator → chọn Y khi hỏi "Install and run on emulator?"
- [ ] Chạy `npx expo start --dev-client` → test app
- [ ] iOS: chờ Apple Developer account kích hoạt → build iOS sau

**Bước 5 – Implement từng Phase còn lại** *(theo mục 9 bên dưới)*
- [x] Phase 1: Auth & Ví Stellar – Firebase Auth + Worker create-wallet ✅
- [x] Phase 2: Bản đồ & Vị trí – OSRM geocoding ✅
- [x] Phase 3: Đặt xe & Báo giá – Trip creation ✅
- [x] Phase 4: WebRTC – Signaling + TURN ✅
- [x] Phase 5: Trong chuyến & Hoàn thành – recordTrip + rating ✅
- [ ] Phase 6: Polish & Monetization (AdMob interstitial, UI polish)

### 📌 Ghi chú session 2026-05-16 (session 3)

**Packages đã thay đổi so với thiết kế ban đầu:**
- `expo-firebase-recaptcha` → **XÓA** (deprecated, lỗi Gradle 8.13). Thay bằng mock verifier trong `app/(auth)/phone.tsx`. Chỉ dùng được Firebase test phone number (`+84900000000` / OTP `123456`). **Cần fix trước production.**
- `@maplibre/maplibre-react-native` → **XÓA** (codegen lỗi RN 0.79, cần RN ≥ 0.80). Thay bằng WebView + Leaflet.js + OpenFreeMap. MapLibre thêm lại khi Expo SDK 54 ra.
- `react-native` → nâng từ `0.76.9` lên `0.79.6` (yêu cầu Expo SDK 53)
- `expo-router` → nâng từ `~4.0.20` lên `~5.1.11`
- `expo-clipboard` → nâng từ `^5.0.0` lên `~7.1.5`
- `expo-notifications` → nâng từ `^0.29.14` lên `~0.31.5`
- Thêm: `react-native-safe-area-context`, `react-native-screens`, `ajv@^8`
- Thêm: `.npmrc` với `legacy-peer-deps=true`

**MapView – kiến trúc mới:**
- `src/components/MapView.tsx`: WebView + Leaflet.js + OpenFreeMap tiles (free, không giới hạn)
- Real-time tracking: `mapRef.current?.updateDriverMarker(lat, lng)` → `injectJavaScript` → Leaflet dịch marker + pan map
- `MapViewHandle` ref: `{ updateDriverMarker(lat, lng): void }`
- Dẫn đường thật: deep link Google Maps (không đổi)

**Firebase Auth:**
- `src/services/firebase.ts`: dùng `initializeAuth` + `indexedDBLocalPersistence` thay `getAuth`
- Có try/catch xử lý hot reload re-initialization

**EAS Build – các lỗi đã fix:**
- `ajv@^8` + `.npmrc legacy-peer-deps` → fix module resolution
- `google-services.json` bỏ khỏi `.gitignore` → fix prebuild
- `assets/` tạo placeholder PNG → fix icon prebuild
- `npx expo install --fix` → đồng bộ tất cả package SDK 53
- Xóa deprecated packages → fix Gradle 8.13

**Emulator:** Android Studio, Pixel 6, API 35, Google APIs (không có Google Play Store tab – dùng Google APIs là đủ cho FCM)

**TypeScript:** PASS hoàn toàn (0 errors)

### 📌 Ghi chú session 2026-05-16
- **Đã hoàn thành session này:**
  - Cài Firebase CLI + đăng nhập, tạo `.firebaserc` + `firebase.json`
  - Deploy `firestore.rules` và `database.rules.json` lên Firebase
  - Xác nhận `google-services.json` đã có trong project root (đúng project `opendrive-8aa5d`)
  - Điền Stellar public keys vào `.env`
  - Cài Wrangler CLI + đăng nhập Cloudflare
  - Deploy 2 worker mới: `opendrive-mining-report` + `opendrive-exchange-points`
  - Set đầy đủ secrets cho tất cả 8 workers (FIREBASE_SERVICE_ACCOUNT, FIREBASE_PROJECT_ID, FIREBASE_DATABASE_URL, STELLAR_*, MASTER_ENCRYPTION_KEY, CLOUDFLARE_TURN_KEY_ID)
  - Fix bug `turn-credentials` worker: `CLOUDFLARE_ACCOUNT_ID` → `CLOUDFLARE_TURN_KEY_ID` + redeploy
  - Kích hoạt Cloudflare Realtime TURN, tạo TURN key (`d5d85df1...`)
  - Tạo lại `MASTER_ENCRYPTION_KEY` (key cũ bị mất), lưu tại `Desktop\MASTER_KEY_BACKUP.txt`
- **Secrets tổng kết:**
  - `MASTER_ENCRYPTION_KEY`: đã set cho `create-wallet` + `stellar-record`
  - `CLOUDFLARE_TURN_KEY_ID`: `d5d85df137464cf88629f794c75c1eac`
  - Firebase Service Account: `firebase-adminsdk-fbsvc@opendrive-8aa5d.iam.gserviceaccount.com`
- **Còn lại:** EAS build Android (đang chờ tài khoản Expo), iOS chờ Apple Developer kích hoạt
- `src/components/MapView.tsx`: placeholder, cần native build để dùng MapLibre

---

## 1. TỔNG QUAN DỰ ÁN

- **Tên:** OpenDrive
- **Mô hình:** App cộng đồng phi lợi nhuận cho tài xế xe công nghệ
- **Doanh thu:** Quảng cáo in-app (nuôi hạ tầng)
- **Platform:** Android & iOS (React Native + Expo)
- **Ngôn ngữ:** Tiếng Việt & English (chuyển đổi trong Settings, mặc định Tiếng Việt)
- **Đặc điểm nổi bật:**
  - Mô hình **đấu giá ngược**: khách đặt xe → nhiều tài xế báo giá → khách chọn
  - Kết nối tài xế-khách qua **WebRTC P2P** sau khi khớp chuyến
  - Lưu lịch sử chuyến lên **Blockchain Stellar**
  - Hệ thống token **ODC (OpenDrive Coin)** để ràng buộc chất lượng dịch vụ
  - Toàn bộ stack hướng **zero cost** ở giai đoạn MVP

---

## 2. TECH STACK

### Frontend
```
React Native + Expo (EAS Build từ đầu – KHÔNG dùng Expo Go)
Lý do: WebRTC yêu cầu native module, Expo Go không hỗ trợ và sẽ không bao giờ hỗ trợ
Dev workflow: EAS Build → Expo Dev Client trên thiết bị thật/emulator
Sau lần build đầu: hot reload hoạt động bình thường như Expo Go
```

### Build & Deploy
```
EAS Build (Expo Application Services)
- Development: eas build --profile development
- Production:  eas build --profile production
- Test UI:     expo-dev-client (thay thế Expo Go)
```

### Backend Services (tất cả free tier)
| Service | Dùng cho | Giới hạn free |
|---|---|---|
| Firebase Auth | Xác thực SĐT (OTP) | 10.000 SMS/tháng |
| Firebase Realtime Database | Chuyến xe, báo giá, ICE signaling | 10GB bandwidth/tháng, 100 connections |
| Cloud Firestore | Thông tin tài xế, blacklist khách | 50K reads/ngày, 20K writes/ngày, 10GB bandwidth/tháng |
| Firebase FCM | Push notification | Miễn phí không giới hạn |
| Cloudflare Workers | API gateway, FCM dispatcher, Stellar signing | 100K requests/ngày |
| Cloudflare Realtime TURN | WebRTC relay fallback | 1TB/tháng miễn phí |
| Stellar Blockchain | Lưu lịch sử chuyến + ODC token | Phí ~0.00001 XLM/giao dịch |

### Bản đồ & Routing
```
Hiển thị bản đồ:  MapLibre GL JS + OpenFreeMap tiles (miễn phí, không giới hạn)
Tính khoảng cách: OSRM public API hoặc Stadia Maps (2.500 req/ngày free)
Dẫn đường:        Google Maps app (deep link, không cần SDK, không tốn quota)
Khi scale:        Tự host Valhalla trên VPS ~$20/tháng khi vượt 2.500 req/ngày
```

---

## 3. KIẾN TRÚC DATABASE

### 3.1 Cloud Firestore – Dữ liệu tĩnh, cần query phức tạp

**3 collection trong Firestore:**

```
── Collection 1: drivers/{uid} ─────────────────────────────────────────────
{
  uid:                  string,      // Firebase Auth UID (document ID)
  phone:                string,      // SĐT đã xác thực qua OTP
  name:                 string,      // Tên tài xế
  vehicleType:          string,      // "motorbike" | "car4" | "car7" | "pickup"
  vehicleBrand:         string,      // Hãng xe
  licensePlate:         string,      // Biển số xe
  geohash:              string,      // 6 ký tự (~610m) – dùng query tìm tài xế gần (không cần lat/lng riêng)
  status:               string,      // "ready" | "busy" | "offline"
  rating:               number,      // Điểm uy tín trung bình (1.0 - 5.0)
  ratingCount:          number,      // Tổng số lần được đánh giá
  stellarWallet:        string,      // Public key ví Stellar cá nhân
  encryptedPrivateKey:  string,      // Private key đã mã hóa AES-256-GCM bằng MASTER_ENCRYPTION_KEY
  referredBy:           string|null, // UID người giới thiệu (null nếu không có)
  firstTripDone:        boolean,     // Đã hoàn thành chuyến đầu tiên chưa
  referralCount:        number,      // Số tài xế đã giới thiệu thành công
  random_id:            number,      // 0-5, cố định khi tạo tài khoản, dùng để lọc notify ngẫu nhiên
  termsAcceptedAt:      timestamp,   // thời điểm người dùng bấm đồng ý điều khoản
  termsVersion:         string,      // version điều khoản đã đồng ý (vd: "1.0")
  updatedAt:            timestamp    // Lần cập nhật cuối
}

── Collection 2: blacklist_customers/{uid} ──────────────────────────────────
{
  uid:            string,      // Firebase Auth UID (document ID)
  phone:          string,      // SĐT khách (để hiển thị, không dùng làm key)
  cancelCount:    number       // 1 = hủy lần 1 (lock 2h) | 2 = hủy lần 2 (lock 48h)
}

── Collection 3: miners/{uid} ───────────────────────────────────────────────
{
  uid:              string,    // Firebase Auth UID (document ID)
  phone:            string,    // SĐT đã xác thực qua OTP
  points:           number,    // Số điểm tích lũy (1 điểm = 1 ODC)
  sessionCount:     number,    // Số phiên đã dùng hôm nay (reset mỗi ngày, tối đa 3)
  lastMiningDate:   string,    // "YYYY-MM-DD" – để reset sessionCount hàng ngày
  createdAt:        timestamp  // Ngày đăng ký đào coin
}
```

**Quy tắc cập nhật vị trí tài xế:**
- Chỉ cập nhật khi `status = "ready"`
- Cập nhật mỗi 1 phút, chỉ khi di chuyển > 1km so với lần trước
- Không cập nhật khi `status = "busy"` hoặc `"offline"`
- KHÔNG nén data trong Firestore – mất khả năng query geohash + status

**Query tìm tài xế:**
```javascript
db.collection("drivers")
  .where("geohash", ">=", geohashPrefix)
  .where("geohash", "<=", geohashPrefix + "~")
  .where("status", "==", "ready")
  .where("vehicleType", "==", requestedType)
```

### 3.2 Firebase Realtime Database – Dữ liệu tạm thời

```
/trips/{tripId}/
  info: { customerPhone, pickupGeohash, dropGeohash, vehicleType, status, createdAt }
  quotes/{driverUid}: { price, estimatedDistance, driverName, rating, vehicleInfo }
  ice/{peerId}: { candidates: [...], offer/answer: {...} }

/drivers_online/{uid}/lastSeen: timestamp
```

**Quy tắc:**
- Dùng **REST API only** – không dùng SDK realtime listener (tránh chiếm 100 connections)
- **tripId = "phòng chờ" matchmaking + re-signaling fallback** – tồn tại suốt chuyến đi
- **Ai xóa tripId:**
  1. Khách bấm hủy (trước khi chọn tài xế) → khách xóa `/trips/{tripId}`
  2. Hết 25s polling không có tài xế → client khách tự xóa `/trips/{tripId}`
  3. **Tài xế bấm "Kết thúc chuyến"** → tài xế xóa toàn bộ `/trips/{tripId}`
- **Worker 6 Cron 3h sáng** dọn tripId > 24h trên Realtime DB

---

## 4. HỆ THỐNG ODC (OPENDRIVE COIN)

### 4.1 Thông Tin Token
```
Tên:       ODC – OpenDrive Coin
Phát hành: 1.000.000.000 ODC trên Stellar blockchain
Network:   Testnet (dev/test) → Mainnet (khi ra mắt chính thức)

Hệ thống gồm 4 ví vận hành tách biệt:

Ví Issuer:
  - Là issuer account của ODC trên Stellar
  - Giữ toàn bộ ODC chưa phân phối
  - Phát hành ODC cho Ví Distributor khi cần phân phối thưởng/phạt
  - Không dùng để nhận phí ghi chuyến trực tiếp

Ví Distributor:
  - Ví phân phối ODC, xử lý thưởng và phạt
  - Nhận các khoản phạt hủy chuyến và rating thấp
  - Trả thưởng rating cao, thưởng hoàn thành chuyến đầu và thưởng giới thiệu
  - Giữ ODC để trả lại bonus/refund cho tài xế

Ví Transaction:
  - Chỉ nhận ODC phí ghi chuyến từ tài xế khi chuyến hoàn thành
  - Dùng để audit doanh thu và theo dõi tổng số ODC ghi chuyến
  - Không trả lại driver

Ví Fee-bump/Sponsor:
  - Giữ XLM để trả fee bump cho mọi giao dịch Stellar của tài xế
  - Sponsor reserve XLM cho ví tài xế mới khi tạo tài khoản
  - Không cần trustline ODC
```

### 4.2 Bảng Cơ Chế ODC

**Công thức phí cơ bản:**
```
Phí cơ bản = giá_chuyến × 0.00001
Ví dụ: chuyến 10.000đ → phí cơ bản = 0.1 ODC
```

| Rating | → Ví Transaction | → Ví Distributor | Net tài xế |
|---|---|---|---|
| 5 sao | +phí ×1 | -phí ×1 | **0** |
| 4 sao | +phí ×1 | -phí ×0.5 | **-phí ×0.5** |
| 3 sao | +phí ×1 | – | **-phí ×1** |
| Không đánh giá | +phí ×1 | – | **-phí ×1** |
| 2 sao | +phí ×1 | +phí ×1 | **-phí ×2** |
| 1 sao | +phí ×1 | +phí ×2 | **-phí ×3** |
| Hủy chuyến | – | +phí ×3 | **-phí ×3** |

**Điều kiện báo giá: ODC tối thiểu = giá_báo × 0.00001 × 3**

### 4.3 Kiến Trúc Ví Tài Xế – Custodial Managed by Cloudflare
```
- Tài xế KHÔNG cần biết blockchain, private key, hay XLM là gì
- Mất điện thoại / xóa app / đổi máy → chỉ cần xác thực SĐT là xong
- Mọi giao dịch Stellar do Worker ký thay
- android:allowBackup="false" trong AndroidManifest – BẮT BUỘC
```

---

## 5. LUỒNG SỰ KIỆN CHÍNH

### 5.1 Đặt Xe (Phía Khách)
```
0. Kiểm tra blacklist → bị khóa: hiển thị thời gian còn lại, không cho đặt
1. Chọn điểm đón, điểm đến, loại xe
2. Tính khoảng cách ước tính qua OSRM API
   → Client gọi THẲNG từ app, KHÔNG qua Cloudflare Worker
   → URL: http://router.project-osrm.org/route/v1/driving/{lngA},{latA};{lngB},{latB}?overview=false
3. Gửi REST request tạo /trips/{tripId} trên Realtime DB
4. Gọi Cloudflare Worker → query Firestore tìm tài xế ready trong 1km
   → gửi FCM batch đến tất cả tài xế
5. Polling Realtime DB mỗi 5s, tối đa 5 lần (25s)
6. Hết 25s không có tài xế → client xóa /trips/{tripId}, thông báo thử lại
7. Khách chọn tài xế → Cloudflare Worker gửi FCM cho tài xế được chọn
8. Bắt đầu WebRTC signaling
```

### 5.2 Hoàn Thành Chuyến
```
1. Tài xế bấm "Hoàn thành" → tín hiệu DataChannel → khách
2. Khách đánh giá 1-5 sao → gửi qua DataChannel → tài xế
3. Tài xế encode 27 bytes memo (xem mục Stellar Memo)
4. Gửi { driverUid, rating, tripPrice, memo, isCancelled, encryptedPrivateKey }
   lên Cloudflare Worker: stellar-record
5. Worker: giải mã key → ký giao dịch → submit Stellar → cập nhật Firestore
6. App xóa pendingTrip khỏi SecureStore
7. Tài xế xóa toàn bộ /trips/{tripId} khỏi Realtime DB
8. Hiện quảng cáo Interstitial AdMob
```

### 5.3 Stellar Memo – 27 Bytes
```
[Bytes 0-4]   SĐT tài xế   – BCD encoding (10 chữ số → 5 bytes)
[Bytes 5-9]   SĐT khách    – BCD encoding (10 chữ số → 5 bytes)
[Bytes 10-17] Geohash đón  – 8 ký tự ASCII (8 bytes, ±19m)
[Bytes 18-25] Geohash đến  – 8 ký tự ASCII (8 bytes, ±19m)
[Byte 26]     Rating       – 1 byte (giá trị 1-5)
Tổng: 27 bytes
```

---

## 6. CLOUDFLARE WORKERS – CÁC ENDPOINT

```
Worker 1: POST /api/create-wallet
  Body: { uid }
  → Generate Stellar keypair → mã hóa → sponsored reserve → tặng 100 ODC
  → Trả về: { stellarWallet, encryptedPrivateKey }
  KHÔNG trả về raw private key

Worker 2: POST /api/notify-drivers
  Body: { tripId, geohash, vehicleType }
  → Query Firestore tài xế gần → FCM batch

Worker 3: POST /api/notify-selected-driver
  Body: { tripId, driverUid }
  → FCM đến tài xế được chọn

Worker 4: POST /api/stellar-record
  Body: { driverUid, rating, tripPrice, memo27bytes, isCancelled, encryptedPrivateKey }
  → Giải mã blob → ký giao dịch → submit Stellar → cập nhật Firestore

Worker 5: GET /api/turn-credentials
  → Cloudflare Realtime API → temporary TURN credentials (TTL 48h)

Worker 6: Cron job – chạy mỗi ngày lúc 3h sáng UTC+7
  → Quét xóa các tripId có createdAt > 24h trên Realtime DB

Worker 7: POST /api/mining-report
  Body: { uid, rounds }
  → Verify JWT uid khớp body uid → cộng floor(rounds/10) điểm vào Firestore miners/{uid}
  → Cập nhật sessionCount, lastMiningDate → Trả về: { points: newTotal }
  Secrets: FIREBASE_SERVICE_ACCOUNT, FIREBASE_PROJECT_ID

Worker 8: POST /api/exchange-points
  Body: { uid, points, walletAddress }
  → Verify JWT → kiểm tra miners/{uid}.points >= points
  → Trừ điểm Firestore → gửi (points - 0.1) ODC từ Ví Distributor → walletAddress
  → Fee-bump bởi Ví Fee-bump → Trả về: { txHash, odcSent }
  Secrets: FIREBASE_SERVICE_ACCOUNT, FIREBASE_PROJECT_ID,
           STELLAR_DISTRIBUTOR_PRIVATE_KEY, STELLAR_ISSUER_ADDRESS,
           STELLAR_FEEBUMP_PRIVATE_KEY, STELLAR_NETWORK
```

---

## 7. BẢO MẬT

```
Client (điện thoại tài xế):
  ✅ Firebase Auth JWT
  ✅ driver_info: { uid, phone, name, stellarWallet, status, ... }
  ✅ driver_encrypted_key: blob AES-256-GCM (vô nghĩa nếu không có MASTER_ENCRYPTION_KEY)
  ❌ KHÔNG có raw private key tài xế
  ❌ KHÔNG có Issuer private key
  ❌ KHÔNG có Firebase service account

Cloudflare Worker Secrets:
  - STELLAR_ISSUER_PRIVATE_KEY
  - STELLAR_ISSUER_ADDRESS
  - STELLAR_FEEBUMP_PRIVATE_KEY
  - STELLAR_DISTRIBUTOR_PRIVATE_KEY
  - STELLAR_DISTRIBUTOR_ADDRESS
  - STELLAR_TRANSACTION_ADDRESS
  - FIREBASE_SERVICE_ACCOUNT
  - MASTER_ENCRYPTION_KEY

Điểm rủi ro duy nhất: Cloudflare Secrets
  → Bảo vệ Cloudflare Secrets = bảo vệ toàn bộ hệ thống
```

---

## 8. PHÂN CHIA MODULE CODE

```
/app
  /(auth)
    register.tsx        # Đăng ký + OTP + gọi Worker tạo ví
    login.tsx
  /(driver)
    home.tsx            # Toggle sẵn sàng, kiểm tra ODC balance
    bidding.tsx         # Xem chuyến, nhập báo giá
    trip.tsx            # Đang chờ khách (DataChannel + deeplink Maps)
    history.tsx         # Lịch sử chuyến
    wallet.tsx          # Số dư ODC, chuyển ODC
    referral.tsx        # Mã giới thiệu, danh sách giới thiệu
  /(customer)
    home.tsx            # Đặt xe + chọn điểm
    waiting.tsx         # Chờ báo giá (polling 5s × 5)
    tracking.tsx        # Theo dõi tài xế (MapLibre + DataChannel)
    rating.tsx          # Đánh giá sau chuyến
  /(mining)
    home.tsx            # Số điểm tích lũy, nút xem quảng cáo, nút đổi điểm
    exchange.tsx        # Nhập ví tài xế, nhập số điểm, xác nhận đổi
  /components
    MapView.tsx
    QuoteList.tsx
    NetworkAlert.tsx
    ODCBalance.tsx
    BlacklistBanner.tsx
  /services
    firebase.ts
    firestore.ts
    webrtc.ts
    cloudflare.ts
    stellar.ts
    location.ts
    network.ts
    odc.ts

/cloudflare-workers
  create-wallet/
  notify-drivers/
  notify-selected/
  stellar-record/
  turn-credentials/
  cleanup-trips/
```

---

## 9. WORKFLOW PHÁT TRIỂN

```bash
# Setup
npx create-expo-app OpenDrive --template blank-typescript
cd OpenDrive
npm install -g eas-cli && eas login && eas build:configure

# Packages cần native module
npx expo install react-native-webrtc
npx expo install @config-plugins/react-native-webrtc
npx expo install expo-secure-store
npx expo install expo-location
npx expo install @react-native-community/netinfo
npx expo install maplibre-gl-react-native
npm install @stellar/stellar-sdk
npm install i18next react-i18next
npm install @react-native-async-storage/async-storage
npm install firebase
npm install expo-firebase-recaptcha

# Build Dev Client (1 lần đầu)
eas build --profile development --platform android
```

---

## 10. LƯU Ý QUAN TRỌNG CHO CLAUDE CODE

**✅ ĐÃ HOÀN THÀNH:**
- Firebase Phone Auth OTP thật với reCAPTCHA
- Customer trip creation với OSRM geocoding thật
- WebRTC signaling flow hoàn chỉnh (offer/answer + ICE candidates)
- Dependencies đã install và fix conflicts
- TypeScript type checking: PASS

**📋 CÒN LẠI:**
- Cấu hình Firebase project thật
- Deploy Cloudflare Workers
- Setup Stellar testnet
- EAS build đầu tiên

1. **KHÔNG dùng Expo Go** – EAS Development Client từ đầu
2. **KHÔNG lưu raw private key trên client** – chỉ lưu blob đã mã hóa (`driver_encrypted_key` trong SecureStore)
3. **KHÔNG dùng Firebase SDK realtime listener** – REST API only
4. **KHÔNG nén data Firestore** – mất khả năng query
5. **Có nén Stellar memo** – 27 bytes: BCD SĐT + 8-char geohash + rating
6. **Geohash 6 ký tự** cho Firestore query (±610m), **8 ký tự** cho Stellar memo (±19m)
7. **Nhắc tắt WiFi** – NetworkAlert khi bật sẵn sàng hoặc đặt xe
8. **Polling 5s × 5** cho chờ báo giá
9. **Tài xế xóa tripId** khi bấm "Kết thúc chuyến"
10. **ODC tối thiểu đóng** = giá_báo × 0.00001 × 3
11. **2 ví vận hành tách biệt**: Ví Issuer/Phân Phối và Ví Giao Dịch
12. **Ví Giao Dịch KHÔNG cần XLM** – Ví Issuer trả fee bump cho TẤT CẢ giao dịch
13. **Hủy chuyến → Ví Issuer toàn bộ** – KHÔNG qua Ví Giao Dịch
14. **Ngừng share vị trí DataChannel** khi tài xế bấm "Đã đón khách" – chỉ ngừng connection của cuộc đó
15. **Re-signaling WebRTC** qua /trips/{tripId}/ice nếu mất kết nối – KHÔNG phạt
16. **Multiple RTCPeerConnection**: tài xế có thể mở nhiều connection cùng lúc – dùng Map(tripId → RTCPeerConnection)
17. **Worker 6 Cron 3h sáng** dọn tripId > 24h trên Realtime DB
18. **Fee Bump Transaction** – Ví Issuer trả XLM cho TẤT CẢ giao dịch của tài xế
19. **Grace period 10 phút** – khách hủy sau 10 phút tài xế chưa đến → không phạt
20. **Không phạt mất mạng** – chỉ phạt khi chủ động bấm hủy
21. **firstTripDone** – mint bonus ODC đúng 1 lần, xử lý trong Worker 4
22. **Deep link Google Maps** – zero cost, không cần SDK
23. **Báo giá nhiều chuyến cùng lúc được phép** – khi được chọn: tự xóa báo giá các tripId còn lại
24. **Đào coin lưu trong RAM** trong phiên đào – không ghi đâu. Bấm "Dừng đào" mới ghi Firestore nếu ≥ 10 lượt
25. **Đổi điểm tối thiểu 10 điểm** – phí cố định 0.1 ODC/lần → Ví Issuer
26. **Người đào KHÔNG có ví Stellar** – chỉ có điểm trong Firestore miners/{uid}
27. **random_id (0-5) cố định mãi** – sinh 1 lần khi tạo ví, lưu Firestore
28. **pendingTrip chỉ lưu SecureStore local** – ghi khi được chọn, xóa sau khi ghi blockchain thành công
29. **App bị tắt đột ngột (hết pin / lỡ tay)** – SecureStore còn nguyên → có 'pending_trip' → KHÔNG lock, yêu cầu hoàn thành chuyến
30. **Xóa app cố tình trốn nghĩa vụ** – SecureStore bị xóa → mất 'pending_trip' → status Firestore = "busy" → lock 24h
31. **Sponsored Reserve**: Ví Issuer bảo trợ toàn bộ ví tài xế → tài xế không bao giờ cần XLM
32. **MASTER_ENCRYPTION_KEY** chỉ tồn tại trong Cloudflare Secrets – không hardcode, không log
33. **encryptedPrivateKey** lưu cả Firestore (backup) lẫn SecureStore (nguồn chính)
34. **android:allowBackup="false"** trong AndroidManifest – bắt buộc, tránh SecureStore bị backup ra ngoài
35. **termsVersion** lưu trong Firestore – khi ra điều khoản mới: app so sánh version → hiện màn hình yêu cầu đồng ý lại
36. **Client-first cho thẻ đào**: sessionCount + lastMiningDate đọc từ SecureStore local trước
37. **points thẻ đào** chỉ cập nhật local sau khi Worker xác nhận thành công – KHÔNG tự cộng trước
38. **OSRM gọi THẲNG từ app** – KHÔNG qua Cloudflare Worker trong bất kỳ trường hợp nào
39. **MapView dùng WebView + Leaflet.js + OpenStreetMap** – KHÔNG dùng MapLibre (cần RN ≥ 0.80). Real-time update qua `mapRef.current?.updateDriverMarker(lat, lng)` → `injectJavaScript` vào Leaflet. Dẫn đường thật dùng deep link Google Maps app.
