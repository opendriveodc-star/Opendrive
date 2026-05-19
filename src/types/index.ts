// src/types/index.ts
// Tạo file này ĐẦU TIÊN trước khi code bất cứ module nào.
// Tất cả modules import types từ đây – đảm bảo interface nhất quán toàn dự án.

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

export type DriverStatus = 'ready' | 'busy' | 'offline'
export type VehicleType    = 'motorbike' | 'car4' | 'car7' | 'pickup' | 'truck'
export type TransportModel = 'passenger' | 'freight'
export type TripStatus   = 'waiting' | 'matched' | 'ongoing' | 'done' | 'cancelled'
export type RatingValue  = 1 | 2 | 3 | 4 | 5
export type Language     = 'vi' | 'en'
export type UserRole     = 'driver' | 'customer' | 'miner'

// SecureStore keys – dùng enum tránh typo
export enum SecureStoreKey {
  DRIVER_INFO          = 'driver_info',
  DRIVER_ENCRYPTED_KEY = 'driver_encrypted_key',
  DRIVER_LOCK_UNTIL    = 'driver_lock_until',
  PENDING_TRIP         = 'pending_trip',
  CUSTOMER_INFO        = 'customer_info',
  CUSTOMER_LOCK_UNTIL  = 'customer_lock_until',
  MINER_INFO           = 'miner_info',
  MINER_SESSION        = 'miner_session',
  USER_ROLE            = 'user_role',
}

// AsyncStorage keys – auto quote settings tài xế
export enum AsyncStorageKey {
  AUTO_QUOTE_SETTINGS = 'auto_quote_settings',
  APP_LANGUAGE        = 'app_language',
}

// ─────────────────────────────────────────────────────────────────────────────
// FIRESTORE DOCUMENTS
// ─────────────────────────────────────────────────────────────────────────────

export interface DriverDoc {
  uid:                 string
  phone:               string
  name:                string
  vehicleType:         VehicleType
  transportModel:      TransportModel
  vehicleBrand:        string
  vehicleColor:        string
  licensePlate:        string
  avatarUrl?:          string
  stellarWallet:       string        // public key Stellar – bất biến
  encryptedPrivateKey: string        // blob AES-256-GCM – bất biến
  geohash:             string        // 6 ký tự, cập nhật khi bật ready
  status:              DriverStatus
  rating:              number        // trung bình, tính từ ratingCount
  ratingCount:         number
  firstTripDone:       boolean
  referralCount:       number
  referredBy:          string | null
  random_id:           number        // 0-5, cố định mãi
  termsAcceptedAt:     FirebaseTimestamp
  termsVersion:        string        // vd: "1.0"
  updatedAt:           FirebaseTimestamp
  fcmToken?:           string        // FCM push token, cập nhật mỗi lần app mở
}

export interface BlacklistCustomerDoc {
  uid:          string
  phone:        string
  cancelCount:  1 | 2
  lockedUntil:  FirebaseTimestamp
  createdAt:    FirebaseTimestamp
}

export interface MinerDoc {
  uid:             string
  phone:           string
  points:          number    // tổng điểm tích lũy – chỉ Worker mới cộng được
  sessionCount:    number    // số phiên đào hôm nay (0-3)
  lastMiningDate:  string    // 'YYYY-MM-DD'
  createdAt:       FirebaseTimestamp
}

// Firebase Timestamp type (dùng khi đọc từ Firestore)
export type FirebaseTimestamp = {
  seconds:     number
  nanoseconds: number
  toDate():    Date
}

// ─────────────────────────────────────────────────────────────────────────────
// SECURESTORE DATA
// ─────────────────────────────────────────────────────────────────────────────

// Lưu trong SecureStore 'driver_info' – không có encryptedPrivateKey
export interface DriverInfo {
  uid:             string
  phone:           string
  name:            string
  vehicleType:     VehicleType
  transportModel:  TransportModel
  vehicleBrand:    string
  vehicleColor:    string
  licensePlate:    string
  avatarUrl?:      string
  stellarWallet:   string
  status:          DriverStatus
  rating:          number
  ratingCount:     number
  firstTripDone:   boolean
  referralCount:   number
  termsVersion:    string
  fcmToken?:       string
}

// Lưu trong SecureStore 'customer_info'
export interface CustomerInfo {
  uid:          string
  phone:        string
  cancelCount:  number
}

// Lưu trong SecureStore 'miner_info'
export interface MinerInfo {
  uid:    string
  phone:  string
  points: number    // sync từ Firestore, cập nhật sau mỗi phiên
}

// Lưu trong SecureStore 'miner_session'
export interface MinerSession {
  sessionCount:   number    // số phiên hôm nay (0-3)
  lastMiningDate: string    // 'YYYY-MM-DD'
}

// Lưu trong SecureStore 'pending_trip'
export interface PendingTrip {
  tripId:        string
  driverUid:     string
  tripPrice:     number       // VNĐ
  startedAt:     string       // ISO timestamp
  pickupGeohash: string       // 8 ký tự
  dropGeohash:   string       // 8 ký tự
  customerPhone: string
  rating:        RatingValue | null  // null cho đến khi khách đánh giá
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO QUOTE SETTINGS (AsyncStorage)
// ─────────────────────────────────────────────────────────────────────────────

export interface AutoQuoteSettings {
  autoQuoteEnabled:   boolean
  baseKm:             number    // số km đầu tiên (vd: 2)
  basePrice:          number    // giá km đầu tiên (vd: 15000)
  pricePerKm:         number    // giá từ km tiếp theo (vd: 5000)
  peakHourMultiplier: number    // vd: 1.15
  rainMultiplier:     number    // vd: 1.20
  rainModeEnabled:    boolean   // tài xế tự bật khi trời mưa
  minKm:              number
  maxKm:              number
}

export const DEFAULT_AUTO_QUOTE_SETTINGS: AutoQuoteSettings = {
  autoQuoteEnabled:   false,
  baseKm:             2,
  basePrice:          15000,
  pricePerKm:         5000,
  peakHourMultiplier: 1.0,
  rainMultiplier:     1.2,
  rainModeEnabled:    false,
  minKm:              0,
  maxKm:              50,
}

// ─────────────────────────────────────────────────────────────────────────────
// CLOUDFLARE WORKER API
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkerResponse<T = void> {
  success: boolean
  data?:   T
  error?:  string
  code?:   string   // error code vd: 'INSUFFICIENT_ODC', 'INVALID_UID'
}

export interface CreateWalletRequest {
  uid: string
}
export interface CreateWalletResponse {
  stellarWallet:       string   // public key
  encryptedPrivateKey: string   // blob AES-256-GCM
}

export interface NotifyDriversRequest {
  tripId:      string
  geohash:     string   // 6 ký tự vị trí khách
  vehicleType: VehicleType
}

export interface NotifySelectedDriverRequest {
  tripId:    string
  driverUid: string
}

export interface StellarRecordRequest {
  driverUid:           string
  rating:              RatingValue
  tripPrice:           number       // VNĐ
  memo27bytes:         string       // 27 bytes encoded
  isCancelled:         boolean
  encryptedPrivateKey: string       // blob từ SecureStore client
}
export interface StellarRecordResponse {
  txHash:     string    // Stellar transaction hash
  odcCharged: number    // ODC đã trừ
}

export interface TurnCredentials {
  urls:       string
  username:   string
  credential: string
  ttl:        number
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBRTC & DATACHANNEL
// ─────────────────────────────────────────────────────────────────────────────

export type DataChannelMessageType =
  | 'location'
  | 'status'
  | 'trip_info'
  | 'rating'
  | 'ping'
  | 'pong'

export interface DCLocationMessage {
  type:      'location'
  lat:       number
  lng:       number
  timestamp: number
}

export interface DCStatusMessage {
  type:   'status'
  status: 'going_to_pickup' | 'arrived' | 'picked_up' | 'completed'
}

export interface DCTripInfoMessage {
  type:         'trip_info'
  driverName:   string
  driverPhone:  string
  licensePlate: string
  vehicleBrand: string
}

export interface DCRatingMessage {
  type:  'rating'
  value: RatingValue
}

export interface DCPingMessage {
  type:      'ping' | 'pong'
  timestamp: number
}

export type DataChannelMessage =
  | DCLocationMessage
  | DCStatusMessage
  | DCTripInfoMessage
  | DCRatingMessage
  | DCPingMessage

// Quản lý nhiều RTCPeerConnection cùng lúc (multiple cuốc)
export interface PeerConnectionEntry {
  tripId:     string
  pc:         any
  dc:         any | null
  customerId: string
  createdAt:  number
}

// ─────────────────────────────────────────────────────────────────────────────
// REALTIME DATABASE (Firebase)
// ─────────────────────────────────────────────────────────────────────────────

export interface TripRealtimeInfo {
  customerPhone: string
  pickupGeohash: string
  dropGeohash:   string
  vehicleType:   VehicleType
  estimatedKm:   number
  createdAt:     number    // Unix timestamp
  status:        TripStatus
}

export interface TripQuote {
  driverUid:    string
  driverName:   string
  vehicleBrand: string
  vehicleColor: string
  licensePlate: string
  avatarUrl?:   string
  rating:       number
  ratingCount:  number
  quotedPrice:  number    // VNĐ
  createdAt:    number
}

export interface IceCandidatePayload {
  candidate:     string
  sdpMid:        string | null
  sdpMLineIndex: number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// STELLAR / ODC
// ─────────────────────────────────────────────────────────────────────────────

export interface ODCFeeCalculation {
  tripPrice:  number   // VNĐ
  baseFee:    number   // ODC = tripPrice × 0.00001
  penaltyFee: number   // ODC phạt thêm nếu rating thấp
  refundFee:  number   // ODC hoàn nếu rating cao
  netFee:     number   // ODC thực tế bị trừ
}

// ─────────────────────────────────────────────────────────────────────────────
// UI / NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────

export type RootStackParamList = {
  Splash:           undefined
  RoleSelect:       undefined
  PhoneAuth:        { role: UserRole }
  DriverRegister:   undefined
  DriverMain:       undefined
  CustomerMain:     undefined
  MinerMain:        undefined
  TermsWebView:     { onAccepted: () => void }
  TripInProgress:   { tripId: string }
  TripComplete:     { tripId: string; finalPrice: number }
  LockScreen:       { lockedUntil: number; reason: string }
  PendingTrip:      { pendingTrip: PendingTrip }
}

export interface LockState {
  locked:      boolean
  lockedUntil: number | null   // Unix timestamp
  reason:      string | null
}
