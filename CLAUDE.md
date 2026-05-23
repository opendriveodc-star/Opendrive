# CLAUDE.md – OpenDrive

> Hướng dẫn cho Claude Code Agent. Đọc trước khi bắt đầu bất kỳ task nào.

---

## 0. TRẠNG THÁI (cập nhật mỗi session)

**Cập nhật lần cuối:** 2026-05-23 (session 27 hoàn thành)

### Đã hoàn thành
Toàn bộ scaffold + implementation hoàn chỉnh. App chạy được trên emulator (Android Studio, Pixel 6, API 35).

- Config, types, constants, i18n (vi/en), services, hooks, utils ✅
- Tất cả screens: auth, driver, customer, mining ✅
- 9 Cloudflare Workers deployed ✅
- Firebase Rules deployed, EAS Build APK chạy được ✅
- Customer home: 5-panel horizontal flow (Vehicle→Pickup→Dest→Book→Quotes) ✅
- Driver flow: Stack navigation, online screen, settings, wallet, referral ✅
- MapView: MapLibre GL JS + OpenFreeMap, mode picker + tracking ✅
- **Session 16:** Avatar tài xế, Blockchain explorer, Guide screen ✅
- **Session 17:** GlobalAlert singleton, back button chuẩn hóa, OTP auto-submit ✅
- **Session 18:** Fix register bugs, responsive isSmall, scale animation, APK preview ✅
- **Session 19:** Firestore REST API, FCM native setup, composite index. **FCM e2e verified ✅**
- **Session 20:** RTDB polling thay WebRTC. Flow e2e: FCM ✅, vị trí tài xế ✅, status ✅, rating ✅
- **Session 21:** **Flow e2e hoàn chỉnh 100%** ✅
  - Hybrid WebRTC (5s timeout) → RTDB fallback
  - Fix `encodeMemo`: thay `Buffer` (Node.js) bằng `Uint8Array`+`btoa` (Hermes-safe)
  - Fix Worker stellar-record: `Buffer.from()` → `Uint8Array+atob`, thêm `Memo` import, `nodejs_compat`
  - Fix `updateFirestoreDriver`: `updateMask.fieldPaths` dùng repeated params thay comma-separated
  - First-trip bonus alert: "Chúc mừng chuyến đầu tiên + 10 ODC"
- **Session 22:** UI polish driver screens + history/wallet hoạt động ✅
  - `online.tsx`: card header redesign (icon + mã chuyến - khoảng cách), note field, cancel quote flow (xóa RTDB + filter card), geohash 9-cell query trong Worker
  - `trip.tsx`: dest address, note, gọi điện từ chip SĐT, button flow (đến đón → hoàn thành), Maps label đúng phase, fitBounds khi map load, ODC penalty khi hủy chuyến
  - `online.tsx` header ODC: `[wallet icon] ODC / {số}` — đồng nhất với `home.tsx`
  - `history.tsx`: fetch Stellar Horizon payments của ví tài xế, filter memo 27 bytes → lịch sử chuyến + rating
  - `wallet.tsx` (trong Settings): fetch **tất cả** ODC payments → lịch sử giao dịch đầy đủ (thưởng/phạt/phí), link sang history screen
- **Session 23:** Mining feature + online.tsx polish ✅
  - **Mining UI** (`app/(mining)/home.tsx`): stats card (điểm + dots phiên), pulsing animation khi đào, progress bar, quảng cáo stub +1 điểm, submit Worker 7
  - **Worker 7** (`workers/mining-report`): cộng điểm, giới hạn 3 phiên/ngày, deployed ✅
  - **Worker 8** (`workers/exchange-points`): đổi điểm → ODC từ Distributor, feebump, deployed ✅
  - **i18n** vi/en: thêm ~15 keys mining (totalPoints, todaySessions, rule1-4, startSession, exchangeSuccess…)
  - **Bug fixes:** `processPendingPenalty` memo double-encoding, `trip.tsx` btoa double-encode, `PendingTrip` thiếu `pickupLat/pickupLng`
  - **`online.tsx` polish:** map không giật (getLastKnownPositionAsync + AsyncStorage cache), `navigateAway()` slide panel xuống trước khi navigate, bottom sheet 3-level (handle/partial/expand), nút định vị render sau sheet (`elevation: 25`), `L2_GAP = 120` để sheet không che nút định vị
- **Session 24:** Anti-fraud + Customer penalty system ✅
  - **Driver fraud:** Firestore `pendingTrip: boolean` flag trên `drivers/{uid}` — set `true` khi nhận chuyến, set `false` sau blockchain submit. Nếu tài xế xóa data rồi đăng nhập lại mà `pendingTrip=true` → lock 48h từ đầu. Timer chỉ lưu SecureStore (xóa data = tính lại từ đầu — đây là thiết kế có chủ đích)
  - **Thông báo hủy chuyến** qua RTDB: khách hủy → ghi `trips/{tripId}/cancelled = 'customer'` → tài xế detect trong poll → alert → về online; tài xế hủy → ghi `'driver'` → khách detect → lưu thông tin chuyến vào AsyncStorage `retry_trip_data` → về home với thông tin đã điền sẵn
  - **Pickup proximity lock** (`trip.tsx`): nút "Đã đến điểm đón" bị khóa cho đến khi tài xế cách điểm đón ≤100m. Kiểm tra mỗi 5s. Hiện khoảng cách còn lại khi chưa đến.
  - **Dropoff proximity lock** (`trip.tsx`): tương tự, nút "Hoàn thành chuyến" khóa cho đến khi cách điểm đến ≤100m.
  - **Customer penalty system** (`blacklist_customers/{phone}` dùng phone làm doc ID):
    - Khách hủy khi tài xế đi được >50% quảng đường → +1 `cancelCount`
    - Khách hủy khi tài xế đã đến điểm đón (≤300m) → +2
    - Tài xế hủy tại điểm đón (khách không lên) → +2 vào `cancelCount` của khách
    - `cancelCount >= 3` → lock 48h (in-session: hiện countdown, không kick; re-auth sau xóa data: check Firestore blacklist trước khi vào)
    - Khi lock hết hạn: xóa khỏi Firestore blacklist, reset SecureStore
  - **Worker 9** (`workers/cleanup-blacklist`): cron `0 20 * * *` (3am UTC+7), dọn `blacklist_customers` docs có `updatedAt > 48h` và `lockedUntil` đã qua. Cần `npx wrangler secret put FIREBASE_SERVICE_ACCOUNT` trong thư mục worker này.
  - **Firestore rules** cập nhật: `blacklist_customers/{phone}` — client chỉ được tăng `cancelCount` (max +2 mỗi lần), tài xế có thể đọc, Worker Admin SDK xóa
  - **`src/types/index.ts`**: `DriverDoc.pendingTrip?: boolean`, `TripRealtimeInfo.cancelled?: 'customer'|'driver'`, `BlacklistCustomerDoc` dùng `phone` thay `uid`
  - **`src/services/firestore.ts`**: `setDriverPendingTrip()`, `getCustomerPenalty()`, `incrementCustomerPenalty()`, `setCustomerLockedUntil()`
  - **i18n** vi/en: thêm `cancel.driverCancelled`, `cancel.customerCancelled`, `lock.reason.frequentCancel`

- **Session 25:** Auto quote config + Splash + FCM referral + MapView padding + Customer home redesign ✅
  - **`quote-config.tsx`**: redesign layout label-trái/input-phải, TimePicker modal 24h, % input cho multiplier, sections (Giá cơ bản / Giờ cao điểm / Mưa), `isPeakHour()` hỗ trợ overnight range
  - **`src/types/index.ts`**: `AutoQuoteSettings` thêm `peakHourEnabled`, `peakHourStart`, `peakHourEnd`
  - **`online.tsx`**: `isPeakHour()` + `calcAutoPrice()` áp dụng peakHourMultiplier; `visiblePad(level)` + `panTo` dùng MapLibre padding; driver dot luôn ở giữa vùng map trống; `driverLat/driverLng` thêm vào quote khi báo giá
  - **`app/index.tsx`**: splash screen redesign (logo + tên + slogan + spinning arc), `checkSession` dùng `Promise.all` parallel
  - **`cloudflare-workers/stellar-record`**: FCM push khi tài xế giới thiệu được thưởng 10 ODC; deployed
  - **i18n** vi/en: thêm `referral.*` block đầy đủ, `autoQuote.peakEnabled/peakTimeRange/peakFrom/peakTo/sectionBase/sectionPeak/sectionRain`
  - **`src/components/MapView.tsx`**: thêm `setCrosshairPosition`, `showDriverMarker`, `hideDriverMarker`; picker mode `panTo` dùng padding thay offset; `fitBoundsToMarkers` trong picker mode; CSS `.driver-car-marker`
  - **`src/components/QuoteList.tsx`**: thêm `onPreview?(quote)` callback — tap card → xem vị trí tài xế; card full-width, giá+đ cùng hàng, màu xe, nút "Chọn" nhỏ dưới giá
  - **`app/(customer)/home.tsx`**: redesign hoàn toàn:
    - Panel full-width (hết margin 16px mỗi bên)
    - Back button trong topBar (thay vì trong panel) cho steps 1-3
    - Sheet 3 mức (handle/partial/full) với PanResponder
    - Locate button nổi trên panel cho steps 1-2
    - Crosshair tự động cập nhật theo level qua `setCrosshairPosition`
    - Tap card tài xế → `showDriverMarker` + `fitBoundsToMarkers` để xem vị trí tài xế và khách
    - `TripQuote.driverLat/driverLng` từ `lastPosRef.current` của tài xế lúc báo giá

- **Session 26:** Customer home polish + History screen + Rating trigger proximity ✅
  - **`app/(customer)/home.tsx`** tiếp tục:
    - TopBar: logout luôn trái, history luôn phải (tất cả steps) — nút nền trắng, icon BRAND
    - Back button dạng button dài (`backBtnWide`) nằm dưới nút xác nhận trong panel 1-2-3
    - Bookmark icon nằm trong ô nhập địa chỉ (bên phải TextInput), vòng tròn xanh nhạt
    - `handleHistory` → navigate sang `/(customer)/history`
    - Preview driver: gọi thêm `showCustomerMarker(pickup)` để thấy cả 2 điểm khi fitBounds
  - **`app/(customer)/history.tsx`** — màn hình mới: lịch sử chuyến khách, đọc AsyncStorage `customer_trip_history`, hiện card (ngày giờ, sao, pickup→dest, tài xế, xe, km), empty state
  - **`app/(customer)/rating.tsx`**: đọc params từ tracking, `saveHistory(rating)` lưu vào AsyncStorage `customer_trip_history` (tối đa 50) khi submit hoặc bỏ qua
  - **`app/(customer)/tracking.tsx`**:
    - Thêm `driverInfoRef` mirror state
    - Pass trip data params sang rating: `pickupAddress`, `destAddress`, `estimatedKm`, `vehicleType`, `driverName`, `vehicleBrand`, `licensePlate`
    - Tách `navigateToRating()` dùng chung cho status poll và proximity trigger
    - **Proximity trigger**: khi `tripStatus === 'picked_up'`, poll GPS khách mỗi 5s — nếu ≤100m đến `dropLat/dropLng` → tự hiện bảng đánh giá
  - **`src/components/QuoteList.tsx`** redesign:
    - Card full-width (bỏ `paddingHorizontal` list)
    - Giá + "đ" cùng hàng, `toLocaleString('vi-VN')` (dấu chấm ngàn)
    - Thêm dòng màu xe (`vehicleColor`)
    - Nút "Chọn" nhỏ gọn nằm dưới giá (cột phải), bỏ nút dài full-width cũ
  - **`src/components/MapView.tsx`**: thêm `showCustomerMarker`/`hideCustomerMarker` vào picker mode HTML

- **Session 27:** Driver UX fixes + proximity 100m + Maps notification ✅
  - **`app/(driver)/history.tsx`**: rating row riêng (icon sao + `driverRating` từ SecureStore) đặt trên stats bar, bỏ tính `avgRating` từ lịch sử; tiêu đề "Lịch sử chuyến" căn giữa (`position: absolute, left:0, right:0`)
  - **`app/(driver)/referral.tsx`**: bỏ rule2 ("tài xế mới nhận 100 ODC"), mã giới thiệu = full UID (không slice 8 ký tự), `referralCount` đọc từ SecureStore (không fetch Firestore riêng)
  - **`app/(driver)/home.tsx`**: retry offline status 3 lần với backoff 1.5s; piggyback sync `referralCount` từ Firestore trong `getDriver()` call có sẵn
  - **`app/index.tsx`**: nếu `info.status === 'ready'` → route thẳng vào `/(driver)/online` (fix tài xế offline vẫn nhận FCM do Firestore status cũ)
  - **`app/(driver)/online.tsx`**: icon mã chuyến đổi thành `#` nền navy (`hashBadge` 14×14, borderRadius 3)
  - **`app/(driver)/trip.tsx` + `app/(customer)/tracking.tsx`**: ngưỡng proximity 200m → **100m** (Haversine đường chim bay), cập nhật cả logic `dist <= 0.1` lẫn text alert
  - **`app/(driver)/trip.tsx`**: persistent local notification khi tài xế mở Google Maps
    - `navNotifIdRef` lưu notification ID
    - `dismissNavNotif()` helper dùng chung
    - `sticky: true` — không thể vuốt bỏ, tap để quay lại app
    - Tiêu đề context-aware: "📍 Đang đến điểm đón" / "📍 Đang đến điểm đến"
    - Tự dismiss ở 5 điểm: đến điểm đón (100m), đến điểm đến (100m), hoàn thành chuyến, tài xế hủy, khách hủy

### Bàn giao Session 28 – Bắt đầu từ đây

**Tình trạng:** Driver + Customer flow hoàn chỉnh và ổn định.

### Việc cần làm tiếp theo

**Bước 7 – Polish & Monetization**
- [ ] AdMob interstitial sau khi kết thúc chuyến
- [ ] Build APK production (EAS reset 01/06/2026)
- [ ] iOS build (chờ Apple Developer account)

---

## 1. TỔNG QUAN DỰ ÁN

- **Tên:** OpenDrive – App cộng đồng phi lợi nhuận cho tài xế xe công nghệ
- **Doanh thu:** Quảng cáo in-app
- **Platform:** Android & iOS (React Native + Expo, EAS Build – KHÔNG dùng Expo Go)
- **Ngôn ngữ:** Tiếng Việt & English (chuyển trong Settings, mặc định VI)
- **Đặc điểm:** Đấu giá ngược (khách đặt → nhiều tài xế báo → khách chọn), Stellar blockchain, ODC token, zero-cost stack

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
  info: { customerPhone, pickupGeohash, dropGeohash, pickupLat, pickupLng, dropLat, dropLng,
          vehicleType, estimatedKm, pickupAddress, destAddress, note, status, createdAt }
  quotes/{driverUid}: { price, estimatedDistance, driverName, rating, vehicleInfo }
  location: { lat, lng, timestamp }          // tài xế ghi mỗi 3s khi đến đón
  trip_status: 'picked_up' | 'completed'     // tài xế ghi
  trip_info: { driverName, driverPhone, vehicleBrand, licensePlate }  // tài xế ghi 1 lần
  rating: 1-5                                // khách ghi sau khi trip_status=completed
/drivers_online/{uid}/lastSeen
```

**Ai xóa tripId:** Khách hủy → khách xóa; hết 25s → client khách xóa; tài xế kết thúc → tài xế xóa. Worker 6 cron 3h sáng dọn >24h.

**WebRTC đã bị xóa hoàn toàn** – không còn dùng react-native-webrtc, ICE, TURN, DataChannel. Toàn bộ in-trip messaging qua RTDB REST API polling 3s.

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
| 9 | Cron 3h sáng UTC+7 | Dọn blacklist_customers đã hết hạn >48h |

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

**Back button chuẩn (tất cả màn hình):**
- Style: `width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff'`
- Shadow: `shadowColor: BRAND, shadowOffset: {0,2}, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2`
- Icon: `<Ionicons name="chevron-back" size={22} color={BRAND} />`
- `hitSlop: { top: 10, bottom: 10, left: 10, right: 10 }`
- Layout: nằm trong `topBar` row (`flexDirection: 'row', alignItems: 'center'`), KHÔNG dùng `position: absolute`
- Tất cả màn hình dùng `SafeAreaView edges={['top']}` → topBar → `KeyboardAvoidingView` → `ScrollView`

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
- **Panel:** full-width (left:0, right:0), `HANDLE_H=52, PARTIAL_H=min(SCREEN_H*0.46,380), FULL_H=SCREEN_H*0.72`
- **Sheet snap:** `SNAP_Y = {2:0, 1:FULL_H-PARTIAL_H, 0:FULL_H-HANDLE_H}` — PanResponder trên handle area; `snapToLevel(level)` dùng spring animation
- **panelContent height:** cố định `PARTIAL_H - HANDLE_H` (không flex:1) — confirm button luôn visible ở level 1
- **Animation:** `panelX` Animated.Value horizontal slide dùng `SCREEN_W` làm unit (full-width); `isAnimating` ref guard
- **Top bar:** logout ← trái (ALL steps); dots/drag-hint/spinner ← giữa; history ← phải (ALL steps, trừ steps 1-2 → bookmark)
- **Top bar button style:** `backgroundColor: '#fff'`, shadow BRAND, icon BRAND — giống chuẩn các màn hình khác
- **Back button:** button dài (`backBtnWide`, border xám nhạt) nằm dưới nút xác nhận trong panel 1-2-3
- **Bookmark:** icon trong ô TextInput (bên phải), vòng tròn `#E8EDF6`, gọi `openSaveModal`
- **Locate button:** floating absolute, `bottom: PARTIAL_H + 16`, chỉ hiện ở steps 1-2
- **MapView padding:** `visiblePad(level)` = `{top: insets.top+50, bottom: panelH+insets.bottom}`; `panTo()` truyền padding; `setCrosshairPosition(topFrac)` update crosshair khi level thay đổi
- **Driver marker (step 4):** tap card → `handlePreviewDriver` → `showDriverMarker` + `fitBoundsToMarkers`; `TripQuote.driverLat/driverLng` từ `lastPosRef` của tài xế lúc báo giá
- **Saved locations:** AsyncStorage key `opendrive_saved_locs`, tối đa 6 (KHÔNG còn GPS chip — thay bằng locate button nổi)
- Autocomplete: `searchAddresses()` debounce 600ms, tối đa 4 gợi ý
- Save modal: `paddingTop: 120` (thay hardcode TOP_BAR_H)

### Firestore & Network
- **`withTimeout(20000)`** bọc tất cả Firestore ops
- Ops critical (login, register): throw error → Alert user
- Ops best-effort (status update, location): `.catch(() => {})`
- Ops UI-blocking (bấm Sẵn sàng): optimistic update – navigate ngay, Firestore sync ngầm
- Logout: `Promise.race([updateDriverStatus, timeout3s])`
- **Mỗi lần mở app:** `home.tsx` reset status → `'offline'` – tài xế phải bấm Sẵn sàng thủ công
- `_layout.tsx` filter `console.warn` có `@firebase/firestore` – ẩn WebChannel noise
- `auth/network-request-failed` = lỗi mạng, không phải code bug
- **Firestore WRITE dùng REST API** (`firestoreRest.patch` trong `firebase.ts`), KHÔNG dùng `updateDoc` SDK – WebChannel/gRPC fail silent trên Android 4G
- Firestore READ (getDoc) vẫn dùng SDK vì chỉ đọc 1 lần, không cần persistent connection

### FCM & Push Notifications
- `google-services.json` phải có trong **`android/app/`** (không phải root) cho local debug build
- `android/build.gradle`: cần `classpath('com.google.gms:google-services:4.4.2')`
- `android/app/build.gradle`: cần `apply plugin: "com.google.gms.google-services"`
- `google-services.json` tại root có `package_name: com.kgt.opendrive` – đã thêm `com.opendrive.app` vào client array
- FCM token đăng ký ở `home.tsx:registerFcmToken()` → `updateDriverFcmToken()` → Firestore

### Firestore Indexes
- `firestore.indexes.json` đã tạo composite index: `status(ASC) + vehicleType(ASC) + random_id(ASC) + geohash(ASC)`
- Index này bắt buộc cho Worker query tìm tài xế (5 filters: 4 equality + geohash range)
- Khi thêm xe mới hoặc thay đổi query: cập nhật `firestore.indexes.json` → `npx firebase deploy --only firestore:indexes`

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

### GlobalAlert (`src/components/GlobalAlert.tsx`)
- **Singleton pattern:** `let _set: ((s: State) => void) | null = null` – set bởi component, gọi từ mọi nơi
- `showAlert(title, message?, buttons?)` – Modal fade overlay, brand colors
- `showActionSheet(title, options[])` – bottom sheet slide, mỗi option có `{ label, icon?, style?, onPress }`, icon là Ionicons name
- **Import:** `import { showAlert, showActionSheet } from '../../src/components/GlobalAlert'`
- Mount tại `app/_layout.tsx` như sibling của `<Stack>` bên trong Fragment
- **KHÔNG dùng `Alert` từ react-native** – thay tất cả bằng `showAlert`/`showActionSheet`

### Avatar hint (`app/(auth)/register.tsx`)
- Dòng bên dưới avatar dùng key `register.avatarHint` (không dùng `roleSelect.slogan`)
- Style riêng `s.avatarHint`: fontSize 12, italic, opacity 0.75

### OTP Screen (`app/(auth)/phone.tsx`)
- Auto-submit khi nhập đủ 6 chữ số: `onChangeText` gọi `verifyOTPWithValue(text)` khi `text.length === 6`
- Nút Xác nhận disabled khi `otp.length < 6` – tránh gọi API với OTP rỗng
- Dùng `verifyOTPWithValue(value: string)` riêng (không dùng state `otp`) để tránh stale closure

### Wallet Balance Card
- Số tiền: `balance.toFixed(2)` (không kèm đơn vị)
- Chữ "ODC": `<Text>` riêng bên dưới, `fontSize: 22, fontWeight: '700'`
- Label "Số dư": `fontSize: 16, opacity: 0.7`

### Android rendering
- `settingsBtn` (và các nút tròn tương tự trong card): KHÔNG dùng `elevation` + `overflow: 'hidden'` để tránh artifact đường trắng và ripple vuông
- Card `headerCard`: `elevation: 0` trên Android, dùng `borderWidth: 1` thay thế
- Responsive: `const isSmall = SCREEN_H < 750` để điều chỉnh size/spacing trên màn nhỏ
- Button animation: dùng `scaleAnim` (scale bounce 0.88→1) thay spin arc — tránh conditional render gây jank
- Map pin nhảy lúc đầu (online screen): **đã fix** – dùng `getLastKnownPositionAsync()` + AsyncStorage cache `last_gps_pos` → map render ngay với vị trí gần đúng, GPS chính xác dùng `panTo()` sau

### In-trip Communication (Hybrid WebRTC + RTDB)
- **Hybrid:** WebRTC DataChannel thử trước (timeout 5s), nếu không kết nối → RTDB polling
- **WebRTC thành công** trong production nhờ TURN relay (Cloudflare Realtime, Worker 5) — TURN bridge mọi NAT type, không cần IPv6. Đây là path chính.
- **RTDB fallback** chỉ khi TURN fail hoặc test với emulator (emulator có network stack ảo hóa không ổn định với TURN)
- Tài xế ghi `trips/{tripId}/location` mỗi 3s (chỉ khi chưa đón khách)
- Tài xế ghi `trips/{tripId}/trip_info` một lần khi vào trip screen
- Tài xế ghi `trips/{tripId}/trip_status` khi đón khách (`picked_up`) và kết thúc (`completed`)
- Khách poll `location` + `trip_status` mỗi 3s trong `tracking.tsx`
- Khách ghi `trips/{tripId}/rating` (1-5) trong `rating.tsx`
- Tài xế poll `rating` mỗi 2s sau khi gửi `completed`, timeout 30s → default rating 3
- `decodeGeohash()` có trong `location.ts` – dùng khi cần convert geohash → tọa độ
- Nút Maps trong `trip.tsx` dùng `pickupLat/pickupLng` từ `PendingTrip` (tọa độ thật, không phải geohash)

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
