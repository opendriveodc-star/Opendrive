// src/constants/index.ts

export const STELLAR = {
  NETWORK:            process.env.EXPO_PUBLIC_STELLAR_NETWORK ?? 'testnet',
  HORIZON_URL:        process.env.EXPO_PUBLIC_STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org',
  ODC_ASSET_CODE:     'ODC',
  ISSUER_ADDRESS:     process.env.EXPO_PUBLIC_STELLAR_ISSUER_ADDRESS ?? '',
  DISTRIBUTOR_ADDRESS: process.env.EXPO_PUBLIC_STELLAR_DISTRIBUTOR_ADDRESS ?? '',
  TRANSACTION_ADDRESS: process.env.EXPO_PUBLIC_STELLAR_TRANSACTION_ADDRESS ?? '',
  SOS_ADDRESS:         process.env.EXPO_PUBLIC_STELLAR_SOS_ADDRESS ?? '',
} as const

export const FIREBASE = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  databaseURL:       process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL ?? '',
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
} as const

export const WORKER = {
  CREATE_WALLET:     'https://opendrive-create-wallet.opendrive-odc.workers.dev',
  NOTIFY_DRIVERS:    'https://opendrive-notify-drivers.opendrive-odc.workers.dev',
  NOTIFY_SELECTED:   'https://opendrive-notify-selected.opendrive-odc.workers.dev',
  STELLAR_RECORD:    'https://opendrive-stellar-record.opendrive-odc.workers.dev',
  CLEANUP_TRIPS:     'https://opendrive-cleanup-trips.opendrive-odc.workers.dev',
  MINING_REPORT:     'https://opendrive-mining-report.opendrive-odc.workers.dev',
  EXCHANGE_POINTS:   'https://opendrive-exchange-points.opendrive-odc.workers.dev',
  NOTIFY_CANCEL:     'https://opendrive-notify-cancel.opendrive-odc.workers.dev',
  SOS_ALERT:         'https://opendrive-sos-alert.opendrive-odc.workers.dev',
} as const

export const APP = {
  TERMS_VERSION:   process.env.EXPO_PUBLIC_TERMS_VERSION ?? '1.0',
  TERMS_URL:       process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://opendrive.pages.dev/terms',
} as const

// ODC business rules
export const ODC = {
  FEE_MULTIPLIER:        0.00001,   // phí cơ bản = giá × 0.00001
  MIN_ODC_MULTIPLIER:    3,         // ODC tối thiểu = giá × 0.00001 × 3
  SIGNUP_BONUS:          100,       // ODC tặng khi đăng ký
  FIRST_TRIP_BONUS:      10,        // ODC tặng khi hoàn thành chuyến đầu
  REFERRAL_BONUS:        10,        // ODC tặng người giới thiệu
  MINING_FEE:            0.1,       // ODC phí đổi điểm
  MIN_EXCHANGE_POINTS:   10,        // điểm tối thiểu để đổi
  MAX_MINING_ROUNDS:     100,       // lượt xem tối đa/phiên
  MIN_MINING_ROUNDS:     10,        // lượt xem tối thiểu để lưu điểm
  MAX_SESSIONS_PER_DAY:  3,         // phiên đào tối đa/ngày
} as const

// Trip rules
export const TRIP = {
  QUOTE_POLL_INTERVAL_MS:  5000,    // polling báo giá mỗi 5s
  QUOTE_POLL_MAX_ATTEMPTS: 5,       // tối đa 5 lần = 25s
  GRACE_PERIOD_MINUTES:    10,      // khách hủy sau 10 phút không phạt
  LOCK_HOURS_CANCEL_1:     2,       // lock 2h lần hủy 1
  LOCK_HOURS_CANCEL_2:     48,      // lock 48h lần hủy 2
  LOCK_HOURS_FRAUD:        24,      // lock 24h khi phát hiện gian lận
} as const

// Location
export const LOCATION = {
  GEOHASH_QUERY_LENGTH:  6,         // 6 ký tự cho Firestore query (±610m)
  GEOHASH_MEMO_LENGTH:   8,         // 8 ký tự cho Stellar memo (±19m)
  UPDATE_INTERVAL_MS:    60000,     // cập nhật vị trí mỗi 1 phút
  UPDATE_MIN_DISTANCE_M: 1000,      // chỉ cập nhật khi di chuyển > 1km
  RTDB_INTERVAL_MS: 3000,           // gửi vị trí qua RTDB mỗi 3s
} as const

// OSRM
export const OSRM = {
  BASE_URL: 'http://router.project-osrm.org/route/v1/driving',
} as const

// Brand color – lấy từ logo Logo_OD.PNG (navy đậm)
// Toàn app dùng chung 1 tone màu thay vì tách màu theo role
const B = {
  primary:       '#1A2E5E',   // navy chủ đạo (từ logo)
  light:         '#E8EDF6',   // navy nhạt (background card)
  muted:         '#F0F4FB',   // navy rất nhạt (page background)
  surface:       '#FFFFFF',
  textPrimary:   '#1A2E5E',
  textSecondary: '#64748B',
  danger:        '#DC2626',
  badge:         '#F59E0B',
} as const

export const COLORS = {
  // Canonical brand palette – dùng cho screen mới
  brand: {
    primary:       B.primary,
    primaryLight:  B.light,
    primaryMuted:  B.muted,
    background:    B.muted,
    surface:       B.surface,
    textPrimary:   B.textPrimary,
    textSecondary: B.textSecondary,
    danger:        B.danger,
    odcBadge:      B.badge,
  },
  // Driver – giữ key cũ để backward compat, đồng màu brand
  driver: {
    primary:      B.primary,
    primaryLight: B.light,
    primaryMuted: B.muted,
    background:   B.muted,
    surface:      B.surface,
    textPrimary:  B.textPrimary,
    danger:       B.danger,
    odcBadge:     B.badge,
  },
  // Customer – giữ key cũ, đồng màu brand
  customer: {
    primary:       B.primary,
    primaryLight:  B.light,
    primaryMuted:  B.muted,
    background:    B.muted,
    surface:       B.surface,
    textPrimary:   B.textPrimary,
    textSecondary: B.textSecondary,
    danger:        B.danger,
    odcBadge:      B.badge,
  },
  // Mining – giữ key cũ, đồng màu brand
  mining: {
    primary:      B.primary,
    primaryLight: B.light,
    primaryMuted: B.muted,
    background:   B.muted,
    surface:      B.surface,
    textPrimary:  B.textPrimary,
    pointsBadge:  B.primary,
  },
} as const
