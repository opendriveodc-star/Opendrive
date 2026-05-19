# CLAUDE.md – OpenDrive

> Hướng dẫn cho Claude Code Agent. Đọc trước khi bắt đầu bất kỳ task nào.

---

## 0. TRẠNG THÁI (cập nhật mỗi session)

**Cập nhật lần cuối:** 2026-05-19 (session 16)

### Đã hoàn thành
Toàn bộ scaffold + implementation hoàn chỉnh. App chạy được trên emulator (Android Studio, Pixel 6, API 35).

- Config, types, constants, i18n (vi/en), services, hooks, utils ✅
- Tất cả screens: auth, driver, customer, mining ✅
- 8 Cloudflare Workers deployed + secrets đầy đủ ✅
- Firebase Rules deployed, EAS Build APK chạy được ✅
- Customer home: 5-panel horizontal flow (Vehicle→Pickup→Dest→Book→Quotes) ✅
- Driver flow: Stack navigation, online screen, settings, wallet, referral ✅
- MapView: MapLibre GL JS + OpenFreeMap, mode picker + tracking ✅
- **Session 16:** Avatar tài xế (Firebase Storage upload, picker, QuoteList image), trường màu xe, Blockchain explorer, Guide screen, toggle UX đổi chỗ ✅

### Việc cần làm tiếp theo

**Bước 6 – Test end-to-end**
- [ ] Flow đặt xe: customer home → QuotesPanel → tracking
- [ ] Nhận chuyến phía tài xế: online → báo giá
- [ ] WebRTC P2P kết nối sau khi khách chọn tài xế
- [ ] Hoàn thành chuyến + rating + ghi Stellar
- [ ] Mining + đổi điểm

**Bước 7 – Polish & Monetization**
- [ ] AdMob interstitial sau khi kết thúc chuyến
- [ ] Test trên điện thoại thật
- [ ] iOS build (chờ Apple Developer account)

---

## 1. TỔNG QUAN DỰ ÁN

- **Tên:** OpenDrive – App cộng đồng phi lợi nhuận cho tài xế xe công nghệ
- **Doanh thu:** Quảng cáo in-app
- **Platform:** Android & iOS (React Native + Expo, EAS Build – KHÔNG dùng Expo Go)
- **Ngôn ngữ:** Tiếng Việt & English (chuyển trong Settings, mặc định VI)
- **Đặc điểm:** Đấu giá ngược (khách đặt → nhiều tài xế báo → khách chọn), WebRTC P2P, Stellar blockchain, ODC token, zero-cost stack

---

## 2. TECH STACK

| Layer | Công nghệ |
|---|---|
| Frontend | React Native + Expo SDK 53, Expo Router v5 |
| Build | EAS Build (`eas build --profile development/production`) |
| Auth | Firebase Phone OTP (`appVerificationDisabledForTesting=true` để test) |
| Database | Cloud Firestore (tĩnh) + Firebase Realtime DB (tạm thời, REST only) |
| Push | Firebase FCM |
| API | Cloudflare Workers (100K req/ngày free) |
| WebRTC | react-native-webrtc + Cloudflare Realtime TURN |
| Blockchain | Stellar testnet → mainnet |
| Bản đồ | MapLibre GL JS (WebView) + OpenFreeMap vector tiles |
| Routing | OSRM public API (gọi thẳng từ app) |
| Dẫn đường | Google Maps deep link (zero cost) |

**Test phone:** `+84933772449` / OTP `123456` (đã set trong Firebase Console)

---

## 3. KIẾN TRÚC DATABASE

### Firestore Collections

```
drivers/{uid}:
  uid, phone, name, vehicleType, transportModel, vehicleBrand, vehicleColor, licensePlate
  avatarUrl(optional), geohash(6), status("ready"|"busy"|"offline"), rating, ratingCount
  stellarWallet, encryptedPrivateKey, referredBy, firstTripDone, referralCount
  random_id(0-5), termsAcceptedAt, termsVersion, updatedAt

blacklist_customers/{uid}: uid, phone, cancelCount

miners/{uid}: uid, phone, points, sessionCount, lastMiningDate, createdAt
```

**Query tìm tài xế:**
```js
db.collection("drivers")
  .where("geohash", ">=", prefix).where("geohash", "<=", prefix + "~")
  .where("status", "==", "ready").where("vehicleType", "==", type)
```

**Cập nhật vị trí:** chỉ khi `status="ready"`, mỗi 1 phút, khi di chuyển >1km. KHÔNG nén data.

### Realtime Database (REST API only)

```
/trips/{tripId}/
  info: { customerPhone, pickupGeohash, dropGeohash, vehicleType, status, createdAt }
  quotes/{driverUid}: { price, estimatedDistance, driverName, rating, vehicleInfo }
  ice/{peerId}: { candidates, offer/answer }
/drivers_online/{uid}/lastSeen
```

**Ai xóa tripId:** Khách hủy → khách xóa; hết 25s → client khách xóa; tài xế kết thúc → tài xế xóa. Worker 6 cron 3h sáng dọn >24h.

---

## 4. HỆ THỐNG ODC

**4 ví vận hành:**
- **Issuer** – phát hành ODC, giữ ODC chưa phân phối
- **Distributor** – thưởng/phạt (nhận phạt, trả thưởng rating cao/giới thiệu)
- **Transaction** – chỉ nhận phí ghi chuyến, không hoàn trả
- **Fee-bump/Sponsor** – giữ XLM trả fee cho mọi giao dịch tài xế

**Phí cơ bản:** `giá_chuyến × 0.00001`

| Rating | → Transaction | → Distributor | Net tài xế |
|---|---|---|---|
| 5 sao | +phí×1 | -phí×1 | 0 |
| 4 sao | +phí×1 | -phí×0.5 | -phí×0.5 |
| 3 sao / không đánh giá | +phí×1 | – | -phí×1 |
| 2 sao | +phí×1 | +phí×1 | -phí×2 |
| 1 sao | +phí×1 | +phí×2 | -phí×3 |
| Hủy chuyến | – | +phí×3 | -phí×3 |

**Điều kiện báo giá:** ODC tối thiểu = `giá_báo × 0.00001 × 3`

**Ví tài xế:** custodial, mọi giao dịch do Worker ký. Tài xế không cần biết XLM/blockchain.

**Stellar Memo – 27 bytes:**
```
[0-4]  SĐT tài xế  – BCD (5 bytes)
[5-9]  SĐT khách   – BCD (5 bytes)
[10-17] Geohash đón – ASCII 8 ký tự (±19m)
[18-25] Geohash đến – ASCII 8 ký tự
[26]   Rating      – 1 byte (1-5)
```

---

## 5. CLOUDFLARE WORKERS

| Worker | Endpoint | Chức năng |
|---|---|---|
| 1 | POST /api/create-wallet | Tạo Stellar keypair, mã hóa, sponsored reserve, tặng 100 ODC |
| 2 | POST /api/notify-drivers | Query Firestore + FCM batch đến tài xế gần |
| 3 | POST /api/notify-selected-driver | FCM đến tài xế được chọn |
| 4 | POST /api/stellar-record | Giải mã key, ký giao dịch, submit Stellar, cập nhật Firestore |
| 5 | GET /api/turn-credentials | Cloudflare Realtime TURN (TTL 48h) |
| 6 | Cron 3h sáng UTC+7 | Xóa tripId >24h trên Realtime DB |
| 7 | POST /api/mining-report | Cộng điểm đào coin vào Firestore miners |
| 8 | POST /api/exchange-points | Đổi điểm → ODC từ Distributor |

**Secrets:** `STELLAR_ISSUER_PRIVATE_KEY`, `STELLAR_DISTRIBUTOR_PRIVATE_KEY`, `STELLAR_FEEBUMP_PRIVATE_KEY`, `STELLAR_ISSUER_ADDRESS`, `STELLAR_DISTRIBUTOR_ADDRESS`, `STELLAR_TRANSACTION_ADDRESS`, `FIREBASE_SERVICE_ACCOUNT`, `MASTER_ENCRYPTION_KEY`, `CLOUDFLARE_TURN_KEY_ID`

---

## 6. LUỒNG SỰ KIỆN

### Đặt xe (khách)
1. Kiểm tra blacklist → bị khóa: hiện thời gian còn lại
2. Chọn loại xe (VehiclePanel) → điểm đón → điểm đến → BookPanel
3. OSRM tính khoảng cách (gọi THẲNG từ app, KHÔNG qua Worker)
4. Tạo `/trips/{tripId}` trên RTDB → gọi Worker notify-drivers
5. QuotesPanel polling RTDB `trips/{tripId}/quotes` mỗi 5s × 5 lần (25s)
6. Hết 25s → xóa trip, thông báo thử lại
7. Chọn tài xế → Worker notify-selected → WebRTC signaling

### Hoàn thành chuyến (tài xế)
1. Bấm "Hoàn thành" → DataChannel → khách đánh giá
2. Encode 27 bytes memo → gửi Worker stellar-record
3. Worker: giải mã → ký → submit Stellar → cập nhật Firestore
4. Xóa pendingTrip SecureStore + xóa RTDB trip
5. Hiện AdMob Interstitial

---

## 7. BẢO MẬT

**Client lưu:** Firebase JWT, `driver_info` (uid/phone/name/wallet/status...), `driver_encrypted_key` (blob AES-256-GCM)

**Client KHÔNG có:** raw private key, Issuer key, Firebase service account

**Điểm rủi ro duy nhất:** Cloudflare Secrets → bảo vệ đó = bảo vệ toàn bộ hệ thống

---

## 8. QUY TẮC QUAN TRỌNG

### Navigation & Layout
- `(driver)/_layout.tsx`: **Stack**, không dùng Tabs – navigate bằng `router.push()`
- `(customer)/_layout.tsx`: Stack, `headerShown: false`
- Back button auth: `router.replace('/role-select')` (không dùng `router.back()`)
- `online.tsx` tắt sẵn sàng: `router.replace('/(driver)/home')` (không dùng `router.back()`)

### Design System
- **Màu chính:** `BRAND = '#1A2E5E'`, `BRAND_LIGHT = '#E8EDF6'`, `BRAND_MUTED = '#F0F4FB'`
- Logo: `assets/logo_od.png` 160×160, `marginBottom: -28`
- Divider: `width: 70%, height: 1, backgroundColor: #E2E8F0, marginVertical: 20`
- Section header: thanh accent `3×16px` navy + text uppercase bold
- Header card: `borderRadius: 18, elevation: 5, shadowOpacity: 0.10`
- Bottom sheet: `position: absolute, bottom: 0, height: SCREEN_H * 0.56`, spring animation, `borderTopLeftRadius: 24`
- Nút tròn settings: `width/height: 36, borderRadius: 18, backgroundColor: BRAND`
- Switch: `thumbColor` trắng khi ON, `trackColor` navy khi ON

### MapView (`src/components/MapView.tsx`)
- **Engine:** MapLibre GL JS (WebView, không phải native module)
- **Style:** `https://tiles.openfreemap.org/styles/positron`
- **Tọa độ:** `[lng, lat]` (khác Leaflet `[lat, lng]`)
- **Zoom mặc định:** 18
- **HTML sinh 1 lần lúc mount** – đừng thay đổi `lat/lng` props sau mount (gây reload)

**mode='tracking'** (default): marker navy `#1A2E5E` 15px + ripple, update qua `injectJavaScript` → `window.updateMarkerPosition(lat, lng)`

**mode='picker'**: pin CSS cố định (không phải marker), `moveend` → postMessage `{type:'center', lat, lng}` → `onCenterChange`; zoom 17; `onMapReady` callback

**Props:**
- `crosshairTopPct` (default 50): % chiều cao WebView cho đầu pin
- `onCenterChange(lat, lng)`: callback khi map di chuyển (picker mode)
- `onMapReady()`: fired khi `map.on('load')` – chỉ gọi `panTo` lần đầu ở đây

**Ref method `panTo(lat, lng)`:** dùng `flyTo` với `offset: [0, offsetY]` để pin chỉ đúng target

**`progPan` ref:** bật trước `panTo()`, tắt sau 900ms → tránh feedback loop reverseGeocode

### Customer Home (`app/(customer)/home.tsx`)
- **5 steps:** 0=Vehicle, 1=Pickup, 2=Dest, 3=Book, 4=Quotes
- **Animation:** `panelX` Animated.Value horizontal slide; `isAnimating` ref guard double-tap; `stepRef` tránh stale closure
- **QuotesPanel (step 4):** inline, KHÔNG navigate sang `waiting.tsx`; polling 5s×5; `quotesRef` tránh stale closure
- **`AD_BOTTOM_H = 0`** – tăng ~60 khi bật AdMob → panel tự nhích lên
- **`PIN_TOP_PCT`** = midpoint giữa `TOP_BAR_H` và `PANEL_TOP_Y` / `SCREEN_H`
- **Top bar:** logout (trái) + dotsArea (giữa, linh động) + history (phải)
- **Saved locations:** AsyncStorage key `opendrive_saved_locs`, tối đa 6 (1 GPS cố định + 5 lưu)
- GPS chip luôn hiện (navy, `locate-outline`), không có nút X
- Autocomplete: `searchAddresses()` debounce 600ms, tối đa 4 gợi ý
- Save modal: `justifyContent: 'flex-start'` + `paddingTop: TOP_BAR_H + 48`

### Firestore & Network
- **`withTimeout(20000)`** bọc tất cả Firestore ops
- Ops critical (login, register): throw error → Alert user
- Ops best-effort (status update, location): `.catch(() => {})`
- Ops UI-blocking (bấm Sẵn sàng): optimistic update – navigate ngay, Firestore sync ngầm
- Logout: `Promise.race([updateDriverStatus, timeout3s])`
- **Mỗi lần mở app:** `home.tsx` reset status → `'offline'` – tài xế phải bấm Sẵn sàng thủ công
- `_layout.tsx` filter `console.warn` có `@firebase/firestore` – ẩn WebChannel noise
- `auth/network-request-failed` = lỗi mạng, không phải code bug

### Xe & Firestore Rules
- Mỗi khi thêm xe mới: cập nhật `vehicles.ts` + regex `vehicleType` trong `firestore.rules` + **redeploy**
- `transportModel`: `'passenger'|'freight'` – tài xế cũ fallback về `'passenger'`
- Mã giới thiệu = `uid.slice(0,8).toUpperCase()`

### Avatar tài xế
- Upload: `uploadDriverAvatar(uid, imageUri)` trong `src/services/firebase.ts` → Firebase Storage `avatars/{uid}.jpg`
- Lưu URL trong `DriverInfo.avatarUrl` (SecureStore) và Firestore `drivers/{uid}.avatarUrl`
- `TripQuote` truyền `avatarUrl` lên RTDB → `QuoteList` hiện `<Image>` nếu có, fallback initials
- `expo-image-picker` version `~16.1.4` đã thêm vào `package.json` (cần `npx expo install` sau)

### Screens mới (session 16)
- `app/blockchain.tsx`: Stellar Transaction wallet explorer – Horizon API pagination, decode 27-byte memo lấy rating, link ra stellar.expert; mainnet/testnet tự động theo `STELLAR.NETWORK`
- `app/guide.tsx`: Hướng dẫn sử dụng 3 tab (Tài xế/Khách/Người đào), content hardcoded vi/en theo `i18n.language`, stepper timeline UI

### Wallet Balance Card
- Số tiền: `balance.toFixed(2)` (không kèm đơn vị)
- Chữ "ODC": `<Text>` riêng bên dưới, `fontSize: 22, fontWeight: '700'`
- Label "Số dư": `fontSize: 16, opacity: 0.7`

### Quy tắc bất biến
- **KHÔNG dùng Expo Go** – EAS Dev Client
- **KHÔNG lưu raw private key trên client**
- **KHÔNG dùng Firebase SDK realtime listener** – REST API only
- **KHÔNG nén data Firestore** – mất khả năng query geohash
- **OSRM gọi thẳng từ app** – không qua Worker
- **Geohash 6 ký tự** cho Firestore query, **8 ký tự** cho Stellar memo
- **android:allowBackup="false"** trong AndroidManifest – bắt buộc
- Polling báo giá: **5s × 5 lần (25s)**
- **Tài xế xóa tripId** khi kết thúc chuyến
- `encryptedPrivateKey` lưu cả Firestore (backup) lẫn SecureStore (nguồn chính)
- `waiting.tsx` tồn tại nhưng không dùng (customer home dùng QuotesPanel inline)
