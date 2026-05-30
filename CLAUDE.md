# CLAUDE.md – OpenDrive

> Hướng dẫn cho Claude Code Agent. Đọc trước khi bắt đầu bất kỳ task nào.

---

## 0. TRẠNG THÁI (cập nhật mỗi session)

**Cập nhật lần cuối:** 2026-05-31 (session 45 hoàn thành)

### Đã hoàn thành
Toàn bộ scaffold + implementation hoàn chỉnh. App chạy được trên emulator (Android Studio, Pixel 6, API 35).

- Config, types, constants, i18n (vi/en), services, hooks, utils ✅
- Tất cả screens: auth, driver, customer, mining ✅
- 11 Cloudflare Workers deployed ✅
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
  - **Thông báo hủy chuyến** (cơ chế cũ, đã thay bằng FCM ở Session 30): qua RTDB field `cancelled` + poll 3s
  - **Pickup proximity lock** (`trip.tsx`): nút "Đã đến điểm đón" bị khóa cho đến khi tài xế cách điểm đón ≤100m. Kiểm tra mỗi 5s. Hiện khoảng cách còn lại khi chưa đến.
  - **Dropoff proximity lock** (`trip.tsx`): tương tự, nút "Hoàn thành chuyến" khóa cho đến khi cách điểm đến ≤100m.
  - **Customer penalty system** (`blacklist_customers/{phone}` dùng phone làm doc ID):
    - Khách hủy bất kỳ lúc nào → +1 `cancelCount`
    - Khách hủy khi tài xế đã bấm "Đã đến điểm đón" (`driver_at_pickup=true`) → +2
    - Tài xế hủy sau khi đã bấm "Đã đến điểm đón" → +2 vào `cancelCount` của khách
    - `cancelCount >= 3` → lock 72h (in-session: hiện countdown, không kick; re-auth sau xóa data: check Firestore blacklist trước khi vào)
    - Khi lock hết hạn: xóa khỏi Firestore blacklist, reset SecureStore
  - **Worker 9** (`workers/cleanup-blacklist`): cron `0 20 * * *` (3am UTC+7), dọn `blacklist_customers` docs có `updatedAt > 72h` và `lockedUntil` đã qua. Cần `npx wrangler secret put FIREBASE_SERVICE_ACCOUNT` trong thư mục worker này.
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

- **Session 28:** QR codes, vehicle icons, car6 rename, build fixes ✅
  - **Map pin thu nhỏ** (`src/components/MapView.tsx`): SVG picker pin `width/height: 30×38` → `22×28` (viewBox giữ nguyên); shadow thu nhỏ tương ứng
  - **Fix referral code corruption** (`app/(auth)/register.tsx`): input mã giới thiệu đổi `autoCapitalize="characters"` → `"none"` — Firebase UID là lowercase, auto-uppercase ghi sai `referredBy` vào Firestore khiến Worker stellar-record không tìm được referrer
  - **QR code trong trang giới thiệu** (`app/(driver)/referral.tsx`): WebView hiện SVG QR sinh bởi `qrcode.toString(uid, { type: 'svg' })` — pure JS, Hermes-safe
  - **QR scanner trong đăng ký** (`app/(auth)/register.tsx`): lazy require `expo-camera`, Modal với `CameraView`, detect barcode → điền mã giới thiệu tự động
  - **Wallet QR screen mới** (`app/(driver)/wallet-qr.tsx`): hiện QR địa chỉ ví Stellar, Canvas trong WebView convert SVG→PNG base64, lưu ảnh về máy qua `expo-file-system` + `expo-media-library`; truy cập từ nút "QR" bên cạnh nút copy trong `wallet.tsx`
  - **Vehicle passenger icons**: thêm `passengers?: number` vào `VehicleOption` (vehicles.ts); nếu có → render icon `<Ionicons name="person" size={10} />` × N thay chữ; áp dụng `register.tsx`, `driver-info.tsx`, `home.tsx` (customer VehiclePanel)
    - motorbike: 1 người, car4: 4 người (tăng từ 3), car6: 6 người
  - **car7 → car6 đổi tên hoàn toàn**: `src/types/index.ts` (VehicleType), `src/data/vehicles.ts` (key + labelKey + specKey), `src/i18n/vi.json` + `en.json` (4 keys), `firestore.rules` (regex vehicleType), `database.rules.json` (regex vehicleType) → redeploy Firebase rules
  - **"Loại hình vận chuyển"**: i18n `register.transportModel` + `trip.transportModel` đổi từ "Mô hình vận tải"/"Transport model" → "Loại hình vận chuyển"/"Transport type" (không ảnh hưởng query Worker vì query dùng `transportModel` field, không phải label)
  - **Packages mới**: `expo-camera ~16.1.4`, `expo-media-library ~17.1.6`, `expo-file-system ~18.1.10`, `qrcode ^1.5.4` — cần prebuild lại sau khi install
  - **Gradle 8.14**: `android/gradle/wrapper/gradle-wrapper.properties` cập nhật để hỗ trợ Java 25 (OpenJDK Temurin 25.0.3). Gradle 8.8 lỗi "class file major version 69", Gradle 8.13 lỗi "Error resolving plugin [id: 'com.facebook.react.settings'] > 25.0.3"

- **Session 29:** Customer penalty refactor + RTDB poll optimization ✅
  - **`app/(customer)/tracking.tsx`** — penalty logic mới:
    - Bất kỳ lần hủy nào → +1 (bỏ điều kiện 50% quãng đường)
    - Tài xế đã bấm "Đã đến điểm đón" (`driverArrivedRef.current = true`) → +2
    - Lock duration: `LOCK_48H` → `LOCK_72H` (72h = 3 ngày)
    - Fix bug: `clearRtdbPolls()` → `clearAllPolls()`, xóa `bridgeRef.current?.stop()` không tồn tại
  - **`app/(customer)/tracking.tsx`** — notification tài xế đến điểm đón:
    - `arrivedPollRef`: poll `trips/{id}/driver_at_pickup` mỗi 3s
    - Khi `true` → local notification "🚗 Tài xế đã đến điểm đón / Hãy ra xe ngay nhé!"
    - `dismissArrivedNotif()` gọi khi trip kết thúc hoặc bị hủy
  - **`app/(customer)/tracking.tsx`** — RTDB poll optimization:
    - Khi detect `picked_up`: stop `locationPollRef` + `statusPollRef` + `arrivedPollRef` luôn
    - Sau pickup: **0 RTDB request** trong suốt hành trình, chỉ còn proximity trigger GPS nội bộ
    - Nút "Hủy chuyến" hiện cả khi `tripStatus === 'picked_up'` — khách tự hủy nếu cần, không cần poll
  - **`app/(driver)/trip.tsx`**:
    - `handlePickedUp()`: ghi `driver_at_pickup = true` lên RTDB trước khi ghi `trip_status`
    - `handleAbandon()`: điều kiện phạt khách đổi từ `nearPickup` (GPS) → `pickedUpRef.current` (đã bấm nút)
    - Fix bug: xóa `bridgeRef.current?.stop()` không tồn tại
  - **`workers/cleanup-blacklist`**: cutoff 48h → 72h, **redeploy thành công** ✅

- **Session 31:** Nút SOS blockchain + Worker 10 sos-alert ✅
  - **Nút SOS** (`src/components/SosButton.tsx`): nút tròn đỏ 72px, 3 vòng ripple animation staggered 600ms, giữ 3s → đếm ngược 3→2→1 → "Tín hiệu đã gửi"; disabled sau khi kích hoạt; instruction text bên dưới
  - **SOS Wallet mới:** `GBXS3WEDTC6ZJONLNA7OYMZ34OXC43PPCDMEVRR2MKBMOOJREDRUEHFW` — funded testnet 10,000 XLM, ODC trustline đã tạo; private key lưu `OneDrive/Desktop/sos-wallet-keys.txt`
  - **Worker 10** (`cloudflare-workers/sos-alert`): Distributor → SOS wallet, 0.0000001 ODC, fee-bump; tự tạo ODC trustline nếu chưa có; deployed + tất cả secrets set ✅
  - **`sosAlert()`** (`src/services/cloudflare.ts`): gọi Worker 10, fire-and-forget (`.catch(() => {})`)
  - **`src/constants/index.ts`**: thêm `STELLAR.SOS_ADDRESS`, `WORKER.SOS_ALERT`
  - **`app/(driver)/trip.tsx`**: `handleSOS()` lấy GPS hiện tại → encode memo → gọi Worker ngầm; `sosSent` state prevent double-trigger
  - **`app/(customer)/tracking.tsx`**: tương tự; đọc thêm `driverPhone` từ `trips/{id}/trip_info`, `customerPhone` từ SecureStore CUSTOMER_INFO

- **Session 32:** SOS UX redesign + Blockchain SOS log + vehicle spec icon + proximity 150m ✅
  - **`SosButton.tsx`** redesign: nút xanh lá (GREEN `#22C55E`) 64px, vòng tròn tiến độ (half-circle technique, `useNativeDriver`), 3 ripple waves xanh nhạt, `Vibration` khi kích hoạt; bỏ đỏ, bỏ floating
  - **SOS ẩn trong panel** (`trip.tsx` + `tracking.tsx`): `SOS_SECTION_H = 220` — panel dịch xuống 220px ban đầu (ẩn phần SOS); kéo tay cầm lên để tiết lộ. `PanResponder` trên `handleArea`, `Animated.spring` snap 2 mức (collapsed / expanded). Xóa `panelH` state + `LayoutChangeEvent`
  - **`encodeSosMemo()`** (`src/services/odc.ts`): nâng lên **32 bytes** — thêm `licensePlate` param; [18-27] biển số ASCII null-padded, [28] triggeredBy; gọi trong `handleSOS()` của cả 2 màn hình
  - **`app/blockchain.tsx`** — chế độ SOS: giữ tiêu đề **5 giây** → `Vibration` + chuyển mode `trip ↔ sos`; `decodeSosMemo()` decode 32-byte (hỗ trợ cả format cũ 27-byte); card đỏ nhạt hiện SĐT (ẩn giữa), biển số, tọa độ, nút "Bản đồ" + "Stellar"
  - **`tracking.tsx`**: thêm `driverPhone` state + chip gọi điện (SĐT ẩn giữa, `Linking.openURL tel:`); `vehicleColor` trong `driverInfo`; `driverPhone` lấy từ `trip_info` (không cần poll riêng)
  - **`register.tsx` + `driver-info.tsx`**: xe không có passengers (freight) hiện `cube-outline` icon + bold spec text thay vì plain text
  - **Ngưỡng proximity: 100m → 150m** — pickup lock, dropoff lock, rating trigger (cả driver + customer)
  - **i18n**: `bookTitle` = "Xác nhận điểm đón và đến", `selectVehicleTitle` cải thiện, `specTruck` đơn giản hóa

- **Session 30:** FCM cancel notification + Worker 10 ✅
  - **Vấn đề cũ:** hủy chuyến dùng RTDB `trips/{id}/cancelled` + `cancelPollRef` 3s → tốn băng thông, không hoạt động khi app bị kill/background
  - **Worker 10** (`cloudflare-workers/notify-cancel`): POST `/api/notify-cancel` — nhận `{ tripId, reason, targetFcmToken, cancellerName? }`, gửi FCM với `notification` (system tray) + `data` payload. Deployed + secrets set ✅
  - **`app/(customer)/home.tsx`**: lấy `customerFcmToken` qua `Notifications.getDevicePushTokenAsync()` trước khi tạo trip, lưu vào `trips/{tripId}/info`
  - **`app/(driver)/trip.tsx`**: đọc `customerFcmToken` từ RTDB info khi vào màn hình; ghi `driverFcmToken` vào `trip_info`; `handleAbandon()` gọi `notifyCancel()` thay RTDB write; FCM foreground listener + `cancelledHandledRef` chống double alert
  - **`app/(customer)/tracking.tsx`**: đọc `driverFcmToken` từ `trip_info`; `handleDriverCancelledAlert(cancellerName?)` hiện tên tài xế nếu có từ FCM data; `handleCancel()` gọi `notifyCancel()` thay RTDB write; FCM foreground listener
  - **Xóa hoàn toàn:** `cancelPollRef` (3s RTDB poll) + `trips/{id}/cancelled` RTDB field — 0 RTDB request cho cancel detection
  - **`src/constants/index.ts`**: thêm `WORKER.NOTIFY_CANCEL`
  - **`src/services/cloudflare.ts`**: thêm `notifyCancel(tripId, reason, targetFcmToken, cancellerName?)`
  - **i18n** vi/en: thêm `cancel.driverCancelledBy` = "{{name}} đã hủy chuyến" / "{{name}} cancelled your trip"
  - **RTDB rules:** không cần cập nhật — `customerFcmToken` trong `info` (write-once), `driverFcmToken` trong `trip_info` (write allowed)

- **Session 33:** UX polish tracking + call chip + retry trip flow ✅
  - **`app/(customer)/tracking.tsx`**: chip gọi tài xế (BRAND, `***{last3}`, disabled/xám khi chưa load); `vehicleColor` trong `driverInfo`; `tryGetTripInfo` poll 3s (từ 5s); status text căn giữa, tất cả trạng thái dùng màu BRAND (bỏ multi-color); `handleCancel()` lưu `retry_trip_data` trước khi về home
  - **`app/(driver)/trip.tsx`**: ghi `vehicleColor` vào RTDB `trip_info`; xóa status pill khỏi header; chip SĐT khách đổi sang `***{last3}`
  - **`src/components/QuoteList.tsx`**: thông tin xe gộp 1 dòng `Honda · 51G-12345 · Trắng` (`[vehicleBrand, licensePlate, vehicleColor].filter(Boolean).join(' · ')`)
  - **`app/(customer)/home.tsx`**: `retryPickupRef` — sau hủy chuyến, map pan đến pickup đã lưu thay vì GPS; `checkLockAndRetry()` quay về step 1 (pickup) thay step 3 (book)

- **Session 34:** UI polish — cancel button, map pin centering, quote card margin, SOS button ✅
  - **`app/(driver)/trip.tsx`**: `headerRow` đổi `justifyContent: 'space-between'` → `'flex-end'` — nút hủy chuyến canh lề phải
  - **`app/(customer)/home.tsx`**: `snapToLevel` thêm `panTo(mapCenter.current.lat, mapCenter.current.lng, level)` sau `setCrosshairPosition` — map tự căn giữa vùng trống khi kéo panel
  - **`src/components/QuoteList.tsx`**: thêm `paddingHorizontal: 12` vào `list` style — thẻ báo giá không chạm cạnh màn hình
  - **`src/components/SosButton.tsx`** polish:
    - Bóng nút: `shadowColor '#DC2626'` → `'#000'`, opacity nhạt, `elevation 4`; nút sent: `elevation: 0`
    - Màu số đếm ngược: `NAVY` → `#DC2626` (đỏ cùng tông nút SOS)
    - Label sau kích hoạt: rút còn 1 dòng `'Hệ thống đã kích hoạt'` (tránh panel giật)

- **Session 35:** Lock screen redesign + SOS blockchain card + i18n polish ✅
  - **`app/lock-screen.tsx`** redesign hoàn toàn: icon navy + pulse animation, reason chip căn giữa, countdown card navy (3 ô Giờ/Phút/Giây), nút logout → `/role-select` + xóa cả `CUSTOMER_LOCK_UNTIL` và `DRIVER_LOCK_UNTIL`
  - **`src/components/BlacklistBanner.tsx`**: redesign theo phong cách app (navy/trắng), fix `reason` dùng `t('lock.reason.${reason}', { defaultValue: reason })` tránh hiện key thô
  - **Bug fix lock screen:** `const { h, m, s } = splitTime(timeLeft)` shadow `const s = StyleSheet.create(...)` → đổi thành `sec` — toàn bộ style bị `undefined` im lặng
  - **Bug fix i18n race:** navigate sang lock-screen truyền key (`'frequentCancel'`) thay vì `t(...)` — tránh race condition khi i18n chưa load; lock-screen tự dịch bằng `t('lock.reason.${reason}', { defaultValue: reason })`
  - **Lock duration:** `LOCK_72H` → `LOCK_48H` (48h thay vì 72h)
  - **i18n** vi/en: thêm 7 keys mới vào block `lock`: `subtitle`, `unlockAfter`, `hours`, `minutes`, `seconds`, `note`, `logout`
  - **`app/blockchain.tsx`** SOS card redesign: bỏ accent bar, 3 chip đều flex-1 (icon+label trên / giá trị căn giữa dưới), ký tự che = `*`.repeat(length-3)+last3, badge `#N` navy, hash → row "Kích hoạt: Tài xế/Khách", cả 2 nút cùng màu BRAND

- **Session 36:** Customer home UX polish + anti-abuse logout/cancel ✅
  - **Fix double-cap màu xe:** xóa `.replace(/\b\w/g, c => c.toUpperCase())` trong save logic của `driver-info.tsx` và `register.tsx` — `\w` ASCII-only gây viết hoa 2 ký tự đầu chữ tiếng Việt (VD: "ĐEn Đỏ"); giữ `autoCapitalize="words"` trên keyboard
  - **`app/(customer)/home.tsx`** – nhiều thay đổi:
    - `PARTIAL_H = 380` (hardcode, bỏ công thức động)
    - `contentLevel` state + `panelContentH` động: step 4 level 2 → `FULL_H - HANDLE_H`, còn lại → `PARTIAL_H - HANDLE_H`
    - `snapToLevel`: collapse shrink ngay, expand grow sau animation
    - **PanResponder step 4:** min level 1 (không thể kéo xuống level 0); `lvls = [1,2]` thay `[0,1,2]`
    - **BookPanel** redesign: horizontal paginated ScrollView 2 trang — Page 1 (thông tin tuyến + hint "Vuốt sang để thêm ghi chú"), Page 2 (ô nhập ghi chú); nút "Đăng tin tìm xe" cố định bên ngoài scroll
    - **QuotesPanel header** đổi sang: chevron-back trái / tiêu đề giữa / đếm ngược phải — đồng nhất với các step khác
    - **`handleCancelSearch`** + **`handleLogout`**: nếu step 4 đã có báo giá → confirm dialog → `applyPenaltyThenRun()` (+0.5 `cancelCount` SecureStore + Firestore) → nếu ≥ 3 → lock 48h; nếu chưa có báo giá → cancel/logout bình thường
    - Helper `cancelSearchCleanup()`, `applyPenaltyThenRun()`, `doLogout()` tách riêng tránh code trùng
  - **`src/types/index.ts`**: thêm `CUSTOMER_CANCEL_COUNT = 'customer_cancel_count'` vào `SecureStoreKey`
  - **i18n** vi/en: thêm `trip.swipeForNote`, `cancel.abandonHasQuotes`

- **Session 37:** Driver cancel flow redesign + pendingPenalty array + Google Maps navigation ✅
  - **`app/(driver)/trip.tsx`** — `handleAbandon()` viết lại hoàn toàn:
    - `abandoningRef` guard chặn double-tap tuyệt đối
    - `abandoning` state: button đổi màu "Đang xử lý..." + spinner card giữa map
    - Lưu `cancelling: true` vào SecureStore **trước** spinner — bảo vệ TH app bị kill
    - ODC deduction chạy ngầm (`getEncryptedKey → recordTrip`), fail → `addPendingPenalty` tích lũy
    - FCM thông báo khách: best-effort (gửi 1 lần, fail kệ)
    - **Blocking** Firestore: `updateDriverStatus('ready')` + `setDriverPendingTrip(false)` retry 3 lần × 2s
    - Xong → `clearPendingTrip` + `saveDriverInfo(status:'ready')` → navigate
  - **`app/(driver)/online.tsx`** — `init()`: `updateDriverStatus('ready')` retry 3 lần thay vì fire-and-forget; cập nhật SecureStore sau khi Firestore OK
  - **`src/types/index.ts`**: `PendingTrip` thêm `cancelling?: boolean` — cờ phân biệt "đang hủy dở" vs "chuyến đang chạy dở"
  - **`app/index.tsx`** — `checkSession()` TH2 detection:
    - `pendingTrip.cancelling === true` → không phải gian lận, không phải pending-trip → dọn dẹp local + Firestore retry ngầm → `/(driver)/home` (processPendingPenalty chạy ở đây)
    - `pendingTrip` không có `cancelling` + `status=busy` → pending-trip screen (flow cũ)
  - **`src/utils/storage.ts`** — pendingPenalty đổi sang **mảng tích lũy**:
    - `getPendingPenalties()` → `PendingPenalty[]`, backward-compat với format object cũ
    - `addPendingPenalty()` append vào mảng (không ghi đè)
    - `savePendingPenalties()` lưu mảng đã xử lý
  - **`app/(driver)/home.tsx`** — `processPendingPenalty()` xử lý từng phần tử, giữ lại cái fail, xóa cái thành công, thông báo tổng số lần đã trừ
  - **`app/(driver)/trip.tsx`** — `handleOpenMaps()`: deep link `google.navigation:q=lat,lng&mode=X` — tự động chọn mode `l` (xe máy) hoặc `d` (ô tô) từ `driverInfo.vehicleType`; fallback web URL nếu không có Google Maps

- **Session 38:** Security hardening — penalty attribution, cancel flag RTDB, OTP rate limiting ✅
  - **Penalty ghi từ phía tài xế:** `blacklist_customers` chỉ cho tài xế ghi (`isDriver()` rule) — khách không thể tự thao túng bằng cách tắt mạng; Firestore rule đã deploy
  - **`app/(driver)/trip.tsx`** — `handleCustomerCancelledAlert()`: ghi penalty cho khách (+1 bình thường, +2 nếu `pickedUpRef.current`) trước khi hiện alert; `handleAbandon()`: kiểm tra `cancelled_by_customer` RTDB flag — nếu set → khách đã hủy trước, tài xế là nạn nhân → ghi penalty cho khách thay vì phạt tài xế; chỉ xóa RTDB khi khách đã hủy trước
  - **`app/(customer)/tracking.tsx`** — `handleCancel()`: ghi `cancelled_by_customer: true` lên RTDB trước khi gửi FCM; `statusPollRef` + proximity loop kiểm tra `cancelled_by_driver` RTDB flag làm backup khi FCM fail
  - **Bỏ penalty phía khách:** xóa `LOCK_48H` (dùng đúng hằng), `_calcCancelPenalty()`, `_applyCustomerPenalty()`, import `incrementCustomerPenalty`/`setCustomerLockedUntil` khỏi `tracking.tsx`
  - **RTDB rules:** thêm `cancelled_by_customer` + `cancelled_by_driver` (boolean, write-once true); `driver_at_pickup` đã có
  - **Poll optimization** (`tracking.tsx`): `tryGetTripInfo()` chỉ fetch `driverPhone` + `driverFcmToken` (thông tin tài xế khác đã có từ TripQuote params); stop poll khi CẢ HAI field đã nhận được
  - **Navigation params**: `home.tsx → tracking.tsx` truyền `driverName`, `vehicleBrand`, `vehicleColor`, `licensePlate` từ TripQuote; `initDriverInfo` set ngay từ params
  - **OTP rate limiting** (chống xóa app + xác thực lại liên tục):
    - Firestore collection `auth_log/{role}_{phone}` — lưu `verifiedAt` timestamp mỗi lần OTP thành công
    - `checkAndRecordAuthLog(phone, role)` trong `firestore.ts` — chặn re-verify trong 24h cùng role
    - `phone.tsx` — gọi check ngay sau `signInWithCredential`, `signOut` + alert nếu bị block
    - Firestore rule: chỉ đúng số điện thoại Firebase của mình mới đọc/ghi; delete blocked
    - **Worker 11** (`cloudflare-workers/cleanup-auth-log`): cron `0 20 * * *`, query `verifiedAt < now - 24h` → xóa expired docs; deployed ✅
    - **i18n** vi/en: thêm `auth.rateLimitTitle` + `auth.rateLimitBody`
    - **Secrets cần set:** `FIREBASE_SERVICE_ACCOUNT` + `FIREBASE_PROJECT_ID` cho Worker 11

- **Session 39:** Freight UX cho customer flow ✅
  - **Bước 1 & 2 (freight):** panel title đổi thành "Thông tin người giao/nhận hàng"; ô tên + SĐT (icon `person-outline` + `call-outline`, màu BRAND) nằm **trên** ô địa chỉ; bookmark `flex:1` fill phần còn lại tự nhiên
  - **Chip "Vị trí hiện tại":** thay nút locate floating trên map; luôn là chip đầu tiên, không có X, sáng lên mặc định khi vào bước 1; selected state = nền BRAND/chữ trắng
  - **Ô địa chỉ:** thêm nút X xóa nhanh khi có text; icon địa chỉ thu nhỏ về `size=14` đồng đều với freight icons
  - **Bước 3 (freight):** title "Xác nhận thông tin giao nhận hàng"; page 2 hiện người giao/nhận dạng `Tên – SĐT` trên 1 dòng
  - **`database.rules.json`:** thêm node `freight_info` (write-once); fix regex vehicleType thêm `truck`
  - **`handleSelectDriver()`:** ghi `freight_info` lên RTDB trước khi notify tài xế được chọn (privacy)
  - **`app/(driver)/trip.tsx`:** tài xế freight thấy trang vuốt ngang page 2 với thông tin người giao/nhận + nút gọi điện
  - **Polish:** xóa `autoFocus` khỏi DestPanel (bàn phím không tự bật khi chuyển bước); swipe hint đổi "Vuốt sang" → "Vuốt qua phải"

- **Session 40:** Driver freight panel + map centering + customer tracking UX ✅
  - **Fix stale SecureStore** (`app/(driver)/online.tsx`): `handleTripSelected` dùng `getDriverInfo()` đọc dữ liệu mới nhất từ SecureStore trước khi ghi `status:'busy'` — fix bug `transportModel` bị reset về `'passenger'` do `driverInfoRef.current` load từ lúc khởi động app
  - **`app/(driver)/trip.tsx`** — freight info panel redesign:
    - `freightInfo` fetch không điều kiện khi load (không check `transportModel`) — dùng `!!freightInfo` để phân nhánh layout
    - 4 thẻ riêng: **[giá báo + nút gọi khách]** / **[Thông tin người gửi: tên + call chip + địa chỉ đón]** / **[Thông tin người nhận: tên + call chip + địa chỉ đến]** / **[Ghi chú vàng nhạt]**
    - `ScrollView flex:1` cho info section, `minHeight: SCREEN_H * 0.82` cho panel — nút action luôn visible, scroll được trên màn nhỏ
    - Layout hành khách (else branch) giữ nguyên
  - **`app/(driver)/trip.tsx`** — driver dot luôn canh giữa vùng map trống phía trên panel:
    - `PANEL_H = Math.round(SCREEN_H * 0.82)` — chiều cao panel
    - `bottomPadRef` lưu bottom padding hiện tại (init = `PANEL_H - SOS_SECTION_H`)
    - `onMapReady`: gọi `setBottomPadding(bottomPadRef.current)` sau `fitBoundsToMarkers`
    - Interval `panTo`: truyền `bottomPadRef.current` làm `bottomPad`
    - `onPanResponderRelease` spring callback: cập nhật `bottomPadRef` + `setBottomPadding` sau animation xong (collapsed → `PANEL_H - SOS_SECTION_H`, expanded → `PANEL_H`)
  - **`app/(driver)/trip.tsx`** — proximity check interval: **5s → 15s** (cả pickup lẫn dropoff)
  - **`app/(customer)/tracking.tsx`** — UX fixes:
    - Separator thông tin xe: `·` → `-` (`Honda - 51G-12345 - Trắng`)
    - Bỏ grace period 10 phút — cho phép hủy chuyến mọi lúc (trừ khi `completed`); xóa `canCancel` state + `startedAtRef` + grace period `useEffect`
    - Thêm nút **"Dẫn đường Google Maps"** cho hành khách (ẩn với freight): khi `going_to_pickup` → navigate đến điểm đón, khi `picked_up` → navigate đến điểm đến; mode `l` (xe máy) hoặc `d` (ô tô) từ `vehicleType`; fallback web URL nếu không có Google Maps

- **Session 41:** Bug fix FCM hủy chuyến + UI polish BookPanel ✅
  - **Root cause FCM:** `phone.tsx` load Firestore nhưng **không copy `fcmToken`** vào `DriverInfo` khi lưu SecureStore → mỗi lần đăng nhập lại `driverInfo.fcmToken = undefined` → `trip_info.driverFcmToken = ''` → khách hủy chuyến tài xế không nhận được FCM
  - **Fix `phone.tsx`:** thêm `fcmToken: doc.fcmToken` vào object `DriverInfo` khi lưu SecureStore lúc đăng nhập
  - **Fix `trip.tsx`:** đảo thứ tự lấy token — `getDevicePushTokenAsync()` trước (luôn tươi từ OS), fallback SecureStore
  - **BookPanel UI** (`home.tsx`): xóa `borderWidth`/`borderColor` khỏi `freightInfoCard`, `freightDistCard`, `freightNoteCard` — cả passenger lẫn freight

- **Session 42:** FCM giao hàng freight + redeploy Worker notify-cancel ✅
  - **Vấn đề:** freight không có proximity trigger rating (khách không đi cùng tài xế) → rating screen không bao giờ hiện
  - **Giải pháp:** tài xế hoàn thành giao hàng → gửi FCM `delivery_complete` cho khách → khách nhận FCM (foreground hoặc tap notification) → `navigateToRating()`
  - **Worker `notify-cancel`:** thêm case `reason: 'delivery_complete'` — title "Giao hàng thành công", body mời đánh giá, `data.type = 'delivery_complete'`; deployed ✅
  - **`cloudflare.ts`:** mở rộng type `reason` của `notifyCancel` thêm `'delivery_complete'`
  - **`trip.tsx` (tài xế):** `handleEndTrip()` phân nhánh freight/passenger; `handleEndFreightTrip()` gửi FCM rồi submit blockchain ngay với rating mặc định 5 (không chờ poll)
  - **`tracking.tsx` (khách):** FCM listener gộp — xử lý cả `trip_cancelled/driver` lẫn `delivery_complete`; thêm `addNotificationResponseReceivedListener` cho trường hợp khách tap notification khi app background
  - **i18n** vi/en: thêm `trip.freightCompleteConfirm`, `trip.processingDelivery`

- **Session 43:** Refactor toàn bộ flow hủy chuyến + hoàn thành chuyến + FCM rating ✅
  - **Flow hủy chuyến (`handleAbandon`) viết lại:**
    - Bỏ `cancelling?` flag khỏi `PendingTrip`
    - Thay `pendingPenalties[]` array → `penaltyTrip` object đơn (`getPenaltyTrip/savePenaltyTrip/clearPenaltyTrip`)
    - `saveDriverInfo({ status:'ready' })` SecureStore **trước tiên** (crash recovery: `pendingTrip+status=ready` → home, không phải pending-trip screen)
    - ODC deduction **blocking** retry 3×8s, 3s between; fail → `savePenaltyTrip` → alert → home; success → online
    - Firestore update fire-and-forget (home.tsx tự fix khi mở)
  - **Flow hoàn thành chuyến (`doEndTrip`) viết lại — unified passenger + freight:**
    - Xóa rating poll 30s + `startRatingPoll/stopRatingPoll/submitTrip/handleEndFreightTrip`
    - `saveDriverInfo({ status:'ready' })` SecureStore **trước tiên**
    - Đọc RTDB `rating` 1 lần → default 3 nếu null
    - Lưu `rating` + `memo27Base64` vào `pendingTrip` (crash recovery)
    - Freight: FCM `delivery_complete` giữ nguyên (fire-and-forget)
    - Blockchain **blocking** retry 3×8s, 3s between; fail → giữ `pendingTrip` → alert → home; success → đánh dấu `completed:true` → clear → online
    - `updateDriverStatus` + `setDriverPendingTrip` fire-and-forget (không blocking)
  - **FCM `approaching_dropoff` tại 150m:**
    - `trip.tsx` `proximityRef`: khi ≤150m đến điểm đến → gửi FCM `approaching_dropoff` cho khách (cả passenger lẫn freight)
    - `tracking.tsx`: xóa proximity useEffect tự tính GPS; FCM listener handle cả `approaching_dropoff` lẫn `delivery_complete` → `navigateToRating()`
    - Worker `notify-cancel`: thêm case `approaching_dropoff` ("Tài xế đã đến nơi") → deployed ✅
  - **home.tsx Sẵn sàng blocking — kiểm tra theo thứ tự:**
    1. `penaltyTrip` tồn tại → blocking retry ODC → fail → block; success → tiếp tục
    2. `pendingTrip` tồn tại → re-submit blockchain (dùng `memo27Base64`+`rating` đã lưu) → fail → block; `completed=true` → chỉ xóa
    3. `setDriverPendingTrip(false)` mỗi lần Sẵn sàng → fix stale Firestore nếu bước trước fail
  - **`index.tsx`:** xóa `cancelling` check; `pendingTrip+status=busy` → pending-trip screen; `pendingTrip+status≠busy` → xóa artifact → home
  - **`PendingTrip` type:** thêm `memo27Base64?` và `completed?`
  - **i18n** vi/en: `waitForRating`/`processingDelivery` → `completedConfirm`/`processingTrip`

- **Session 44:** Scan giấy đăng ký xe (OCR) cho tài xế ✅
  - **Package mới:** `@react-native-ml-kit/text-recognition ^2.0.0` — on-device OCR, free, offline
  - **`src/utils/parseVehicleCard.ts`** — parser OCR giấy đăng ký xe VN:
    - Dùng keyword tiếng Anh (Brand/Color/Seat/Sit) vì OCR đọc ASCII chính xác hơn chữ có dấu
    - Biển số: regex `\d{2}[A-Z]{1,2}-[\d.]{4,9}`
    - Màu biển `(V)/(T)/(X)`: tìm trong vùng ±150 ký tự quanh biển số (bắt được cả khi nằm trên/dưới/cạnh)
    - Loại xe: có `Seat` → xác định theo số chỗ (1-3=truck, 4-6=car4, 7+=car6); không có `Seat` → xe máy
    - `extractAfterColon()`: lấy phần sau dấu `:` cuối dòng, bỏ qua label phụ tiếng Anh
  - **`app/(auth)/register.tsx`** + **`app/(driver)/driver-info.tsx`**:
    - Nút "Scan thẻ ĐK xe" nền navy cạnh section header "Thông tin xe"
    - Sau scan: tự điền + khóa nhãn hiệu, màu, biển số, loại xe — không cho tự nhập
    - `transportModel` tự lock nếu xe chỉ thuộc 1 model (car4/car6→passenger, truck/pickup→freight); xe máy tự do chọn
    - Biển `(V)` → cho đăng ký; biển `(T)/(X)` → điền thông tin nhưng disable nút + banner cảnh báo; unknown → block với thông báo "không xác định được màu biển, chụp lại rõ hơn"
    - Xe máy: bỏ qua kiểm tra màu biển hoàn toàn
    - `plateInvalid` + `plateInvalidMsg` state — thông báo khác nhau cho trắng/xanh vs không rõ
  - **i18n** vi/en: thêm 11 keys mới dưới `register.*` — `scanBtn`, `scanPlaceholder`, `scanIncompleteTitle`, `scanIncompleteBody`, `scanError`, `scanRequired`, `plateInvalidYellow`, `plateInvalidUnknown`, `scanMissingPlate/Brand/Color`
  - **Logic biển số cuối cùng:**
    - `(V)` → cho qua
    - `(X)` → block "Xe không hợp lệ – chỉ chấp nhận xe kinh doanh biển vàng"
    - `(T)/unknown` + không có SEAT → xe máy → cho qua
    - `(T)` + có SEAT → block "Xe không hợp lệ – chỉ chấp nhận xe kinh doanh biển vàng"
    - `unknown` + có SEAT → block "Không xác định được màu biển số, vui lòng chụp lại rõ hơn" (phân biệt với biển trắng xác nhận)
  - **Tài xế tự chọn:** loại xe + loại hình vận chuyển (không lock sau scan)

- **Session 45:** AdMob Rewarded + Mining UX + Exchange redesign ✅
  - **Fix back button** `(mining)/home.tsx`: `router.back()` → `router.replace('/role-select')` (root screen không có gì để back)
  - **AdMob Rewarded Ad** (`react-native-google-mobile-ads@14`): tích hợp vào màn hình đào coin; test ads hoạt động; prebuild required khi thêm
  - **Fix bug điểm tích lũy không cộng được:** `phone.tsx` bỏ qua không lưu `MinerInfo` vào SecureStore khi đăng nhập miner → `minerInfo = null` → `stopMining` silent return; fix: load/create Firestore doc + lưu SecureStore đúng cách
  - **Fix `session = null`:** `loadMinerData` giờ luôn khởi tạo `{ sessionCount: 0 }` nếu không tìm thấy ở đâu
  - **0.1 điểm/lượt xem quảng cáo:** Worker 7 đổi sang `doubleValue`, công thức `rounds * 0.1`; UI hiện điểm thập phân; nút đổi thành "Xem quảng cáo (+0,1 điểm)"
  - **Exchange screen redesign** (`(mining)/exchange.tsx`):
    - Layout mới: Số coin → Địa chỉ ví + nút Scan → Memo ghi chú
    - QR scan: 1 nút Scan → action sheet chọn Camera / Thư viện ảnh
    - **jsQR offline** (`src/utils/qrScannerHtml.ts`): jsQR bundled vào app, scan từ ảnh không cần internet; `metro.config.js` thêm `assetExts.push('html')`
    - Memo field: đếm bytes UTF-8 (max 28 bytes Stellar MEMO_TEXT), chặn khi đầy
    - Back button + topBar cùng vị trí với home.tsx (SafeAreaView là root)
    - Nút Scan + nút Đổi điểm → màu navy
  - **"Nhận từ người đào coin"** trong ví tài xế: Worker exchange-points luôn thêm text memo `MDC`; wallet.tsx thêm `&join=transactions` vào Horizon API để đọc memo; label mới `history.rewardMiner` vi/en
  - **ODC coin icon** thay diamond trong màn hình đào: vòng tròn navy viền + nền `BRAND_MUTED` + chữ "ODC" đậm (giống CoinIcon ở role-select)
  - **Worker 7 + 8 deployed** ✅
  - **Packages mới:** `react-native-google-mobile-ads@14`, `jsqr@1.4.0`

### Bàn giao Session 46 – Bắt đầu từ đây

**Tình trạng:** Mining flow hoàn chỉnh — AdMob rewarded, điểm tích lũy, exchange với QR scan offline hoạt động.

**Việc cần làm ngay:**
- [ ] Xóa `console.log('=== OCR RAW ===')` trong `register.tsx` và `driver-info.tsx` trước khi build production
- [ ] Set secrets Worker 11: `npx wrangler secret put FIREBASE_SERVICE_ACCOUNT` + `FIREBASE_PROJECT_ID` trong `cloudflare-workers/cleanup-auth-log/`

### Việc cần làm tiếp theo

**Bước 7 – Polish & Monetization**
- [ ] AdMob interstitial sau khi kết thúc chuyến (driver trip.tsx + customer rating.tsx)
- [ ] Build APK production (EAS reset 01/06/2026)
- [ ] iOS build (chờ Apple Developer account)

---

## 1. QUY TRÌNH BUILD & CHẠY APP (ĐỌC TRƯỚC KHI BUILD)

### Môi trường
- **Java:** Chỉ có Java 25 (Temurin) trên hệ thống — **KHÔNG dùng được** với Gradle
- **JAVA_HOME đúng:** `C:\Program Files\Android\Android Studio\jbr` (Java 21, embedded trong Android Studio)
- **ANDROID_HOME:** `$env:LOCALAPPDATA\Android\Sdk`
- **Gradle:** 8.14 (đã cache sau lần build đầu, không cần download lại)
- **Samsung:** `R5GL24QSTMR` (SM-A175F), kết nối USB

### Build + chạy trên emulator (Pixel 6)
```powershell
# 1. Khởi động emulator (nếu chưa mở)
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd Pixel_6 -no-snapshot-load

# 2. Chờ boot xong
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" wait-for-device shell getprop sys.boot_completed

# 3. Build + install (dùng Java 21 của Android Studio)
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
Set-Location D:\OpenDrive
npx expo run:android
```

> Lần đầu build ~12 phút. Lần sau ~2-3 phút (Gradle cache).
> Nếu lỗi `INSTALL_FAILED_UPDATE_INCOMPATIBLE`: uninstall app cũ trước
> ```powershell
> & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" uninstall com.opendrive.app
> ```

### Build + chạy trên Samsung thật (USB)
```powershell
# 1. Build APK (Java 21)
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
Set-Location D:\OpenDrive
npx expo run:android   # tự detect Samsung nếu là thiết bị duy nhất

# Hoặc chỉ định thiết bị cụ thể:
$env:ANDROID_SERIAL = "R5GL24QSTMR"
npx expo run:android

# 2. Nếu build đã có APK rồi, chỉ cần install + forward:
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb -s R5GL24QSTMR install -r "D:\OpenDrive\android\app\build\outputs\apk\debug\app-debug.apk"
& $adb -s R5GL24QSTMR reverse tcp:8081 tcp:8081
& $adb -s R5GL24QSTMR reverse tcp:8082 tcp:8082

# 3. Khởi động Metro riêng (nếu chưa chạy)
npx expo start --port 8081
```

> Samsung phải bật **USB Debugging**. Nếu bị chặn: tắt "Hạn chế USB" trong Bảo mật & Quyền riêng tư.
> ADB reverse giúp Samsung kết nối Metro trên máy tính qua cáp USB (không cần cùng WiFi).

### Kiểm tra kết nối
```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices -l
# Phải thấy: R5GL24QSTMR (Samsung) và/hoặc emulator-5554
```

### Khi cần prebuild lại (thêm native module mới)
```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
Set-Location D:\OpenDrive
npx expo prebuild --clean --platform android
# Sau đó build lại bình thường
```

---

## 2. TỔNG QUAN DỰ ÁN

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
          vehicleType, estimatedKm, pickupAddress, destAddress, note, status, createdAt,
          customerFcmToken }                 // khách ghi lúc tạo trip (dùng để Worker 10 notify)
  quotes/{driverUid}: { price, estimatedDistance, driverName, rating, vehicleInfo }
  location: { lat, lng, timestamp }          // tài xế ghi mỗi 3s khi đến đón
  trip_status: 'picked_up' | 'completed'     // tài xế ghi
  trip_info: { driverName, driverPhone, vehicleBrand, licensePlate, driverFcmToken }  // tài xế ghi 1 lần
  driver_at_pickup: true                     // tài xế ghi khi bấm "Đã đến điểm đón"
  rating: 1-5                                // khách ghi sau khi trip_status=completed
/drivers_online/{uid}/lastSeen
```

**Ai xóa tripId:** Khách hủy → khách xóa; hết 25s → client khách xóa; tài xế kết thúc → tài xế xóa. Worker 6 cron 3h sáng dọn >24h.

**Hủy chuyến:** KHÔNG dùng RTDB field `cancelled` — toàn bộ qua FCM (Worker 10). App killed/background vẫn nhận được.

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

**Stellar Memo – Trip (27 bytes):**
```
[0-4]   SĐT tài xế  – BCD (5 bytes)
[5-9]   SĐT khách   – BCD (5 bytes)
[10-17] Geohash đón – ASCII 8 ký tự (±19m)
[18-25] Geohash đến – ASCII 8 ký tự
[26]    Rating      – 1 byte (1-5)
```

**Stellar Memo – SOS (32 bytes):**
```
[0-4]   SĐT tài xế  – BCD (5 bytes)
[5-9]   SĐT khách   – BCD (5 bytes)
[10-13] Latitude × 1,000,000 – int32 big-endian
[14-17] Longitude × 1,000,000 – int32 big-endian
[18-27] Biển số xe – ASCII null-terminated, tối đa 10 ký tự
[28]    Người kích hoạt – 0x01 = tài xế, 0x02 = khách
[29-31] Dự phòng – zeros
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
| 9 | Cron 3h sáng UTC+7 | Dọn blacklist_customers đã hết hạn >72h |
| 10 | POST /api/sos-alert | Ghi SOS lên Stellar: Distributor → SOS wallet, 27-byte memo (lat/lng/SĐT/ai nhấn) |
| 10 | POST /api/notify-cancel | FCM thông báo hủy chuyến đến bên kia (tài xế hoặc khách) |
| 11 | Cron 3h sáng UTC+7 | Xóa `auth_log` records có `verifiedAt > 24h` trên Firestore |

**Secrets:** `STELLAR_ISSUER_PRIVATE_KEY`, `STELLAR_DISTRIBUTOR_PRIVATE_KEY`, `STELLAR_FEEBUMP_PRIVATE_KEY`, `STELLAR_ISSUER_ADDRESS`, `STELLAR_DISTRIBUTOR_ADDRESS`, `STELLAR_TRANSACTION_ADDRESS`, `STELLAR_SOS_ADDRESS`, `STELLAR_SOS_PRIVATE_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `MASTER_ENCRYPTION_KEY`, `CLOUDFLARE_TURN_KEY_ID`

**SOS Wallet:** `GBXS3WEDTC6ZJONLNA7OYMZ34OXC43PPCDMEVRR2MKBMOOJREDRUEHFW` — private key trong `OneDrive/Desktop/sos-wallet-keys.txt`; testnet funded + ODC trustline tạo sẵn

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
- Mã giới thiệu = **full Firebase UID** (lowercase, case-sensitive) — KHÔNG slice, KHÔNG uppercase; input `autoCapitalize="none"`

### QR Code (React Native / Hermes)
- **SVG generation:** `qrcode.toString(text, { type: 'svg' })` — pure JS, không dùng Canvas/browser API → hoạt động trong Hermes runtime
- **Display:** inject SVG string vào WebView HTML (`source={{ html: ... }}`)
- **SVG→PNG export:** Canvas trong WebView JS (`ctx.drawImage(img, ...)` + `toDataURL('image/png')`) → `postMessage` base64 về RN
- **Lưu ảnh:** `expo-file-system` ghi file tạm → `expo-media-library` save vào gallery
- **QR Scanner:** lazy require `expo-camera` (tránh crash khi quyền bị từ chối); Modal với `CameraView barcodeScannerSettings={{ barcodeTypes: ['qr'] }}`, `onBarcodeScanned` callback

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
