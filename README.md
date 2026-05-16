# OpenDrive

App cộng đồng phi lợi nhuận cho tài xế xe công nghệ. Mô hình đấu giá ngược: khách đặt xe → nhiều tài xế báo giá → khách chọn.

## Tech Stack

- **Frontend:** React Native + Expo (EAS Build, không dùng Expo Go)
- **Auth:** Firebase Auth (OTP SMS)
- **Database:** Cloud Firestore + Firebase Realtime Database (REST only)
- **Push:** Firebase FCM
- **API:** Cloudflare Workers (6 workers)
- **Blockchain:** Stellar (lịch sử chuyến + token ODC)
- **WebRTC:** react-native-webrtc + Cloudflare TURN
- **Bản đồ:** MapLibre + OpenFreeMap tiles
- **Routing:** OSRM public API (gọi thẳng từ app)
- **i18n:** i18next (Tiếng Việt mặc định + English)

## Quick Start

```bash
# 1. Cài dependencies
npm install

# 2. Cấu hình môi trường
cp .env.example .env
# Điền các key vào .env

# 3. Cài EAS CLI
npm install -g eas-cli
eas login

# 4. Build Dev Client (bắt buộc, không dùng Expo Go)
eas build --profile development --platform android

# 5. Sau khi cài apk lên máy/emulator → hot reload bình thường
npx expo start --dev-client
```

## Cấu Trúc Thư Mục

```
app/                    Expo Router screens
  (auth)/               Xác thực SĐT, đăng ký
  (driver)/             Màn hình tài xế
  (customer)/           Màn hình khách
  (mining)/             Màn hình đào coin
src/
  types/                TypeScript types toàn dự án
  constants/            Hằng số (ODC rules, colors, endpoints)
  i18n/                 Đa ngôn ngữ (vi.json, en.json)
  services/             Firebase, Firestore, Cloudflare, WebRTC, ODC, Location
  components/           Shared UI components
  hooks/                Custom hooks
  utils/                Helpers (format, storage, nanoid)
cloudflare-workers/     6 Cloudflare Workers
firestore.rules         Firebase Security Rules
database.rules.json     Realtime Database Rules
```

## Cloudflare Workers

| Worker | Endpoint | Mô tả |
|---|---|---|
| create-wallet | POST /api/create-wallet | Tạo ví Stellar + tặng 100 ODC |
| notify-drivers | POST /api/notify-drivers | FCM batch đến tài xế gần |
| notify-selected | POST /api/notify-selected-driver | FCM tài xế được chọn |
| stellar-record | POST /api/stellar-record | Ký + ghi giao dịch Stellar |
| turn-credentials | GET /api/turn-credentials | TURN credentials cho WebRTC |
| cleanup-trips | Cron 3h sáng UTC+7 | Dọn tripId cũ > 24h |

* `stellar-record` hiện dùng kiến trúc 4 ví Stellar tách biệt: Issuer, Distributor, Transaction vault và Fee-bump/Sponsor.

## Deploy Workers

```bash
cd cloudflare-workers/create-wallet
npx wrangler deploy

# Set secrets for create-wallet
npx wrangler secret put MASTER_ENCRYPTION_KEY
npx wrangler secret put STELLAR_ISSUER_PRIVATE_KEY
npx wrangler secret put STELLAR_FEEBUMP_PRIVATE_KEY
npx wrangler secret put STELLAR_ISSUER_ADDRESS

# Set secrets for stellar-record
cd ../stellar-record
npx wrangler deploy
npx wrangler secret put MASTER_ENCRYPTION_KEY
npx wrangler secret put STELLAR_FEEBUMP_PRIVATE_KEY
npx wrangler secret put STELLAR_DISTRIBUTOR_PRIVATE_KEY
npx wrangler secret put STELLAR_ISSUER_ADDRESS
npx wrangler secret put STELLAR_TRANSACTION_ADDRESS
npx wrangler secret put STELLAR_DISTRIBUTOR_ADDRESS
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT
```

## Tài Liệu

Xem [CLAUDE.md](./CLAUDE.md) để biết đầy đủ kiến trúc, luồng sự kiện, cơ chế ODC, và các lưu ý quan trọng.
