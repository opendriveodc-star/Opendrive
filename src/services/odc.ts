// src/services/odc.ts
// ODC business logic: tính phí, kiểm tra số dư, encode memo Stellar

import { ODC, STELLAR } from '../constants'
import type { ODCFeeCalculation, RatingValue } from '../types'

// Tính phí ODC cho 1 chuyến
export function calcODCFee(tripPrice: number, rating: RatingValue | null): ODCFeeCalculation {
  const baseFee = tripPrice * ODC.FEE_MULTIPLIER

  let penaltyFee = 0
  if (rating === 2) penaltyFee = baseFee * 1
  if (rating === 1) penaltyFee = baseFee * 2

  let refundFee = 0
  if (rating === 5) refundFee = baseFee * 1
  if (rating === 4) refundFee = baseFee * 0.5

  const netFee = baseFee + penaltyFee - refundFee

  return { tripPrice, baseFee, penaltyFee, refundFee, netFee }
}

// Kiểm tra tài xế có đủ ODC để báo giá không
// ODC tối thiểu = giá_báo × 0.00001 × 3 (worst case hủy chuyến)
export function hasEnoughODC(quotedPrice: number, currentBalance: number): boolean {
  const minRequired = quotedPrice * ODC.FEE_MULTIPLIER * ODC.MIN_ODC_MULTIPLIER
  return currentBalance >= minRequired
}

export function minODCRequired(quotedPrice: number): number {
  return quotedPrice * ODC.FEE_MULTIPLIER * ODC.MIN_ODC_MULTIPLIER
}

// Encode 27-byte Stellar memo
// [0-4]   SĐT tài xế  – BCD 5 bytes (10 chữ số)
// [5-9]   SĐT khách   – BCD 5 bytes
// [10-17] Geohash đón – 8 ký tự ASCII
// [18-25] Geohash đến – 8 ký tự ASCII
// [26]    Rating       – 1 byte
export function encodeMemo(
  driverPhone:  string,
  customerPhone: string,
  pickupGeohash: string,  // 8 ký tự
  dropGeohash:   string,  // 8 ký tự
  rating:        RatingValue,
): string {
  const buf = new Uint8Array(27)

  // BCD encode SĐT (10 chữ số → 5 bytes)
  const encodeBCD = (phone: string, offset: number) => {
    const digits = phone.replace(/\D/g, '').padStart(10, '0').slice(-10)
    for (let i = 0; i < 5; i++) {
      buf[offset + i] = (parseInt(digits[i * 2]) << 4) | parseInt(digits[i * 2 + 1])
    }
  }

  encodeBCD(driverPhone,   0)
  encodeBCD(customerPhone, 5)

  // Geohash 8 ký tự ASCII
  const pickup = pickupGeohash.slice(0, 8).padEnd(8, '0')
  const drop   = dropGeohash.slice(0, 8).padEnd(8, '0')
  for (let i = 0; i < 8; i++) {
    buf[10 + i] = pickup.charCodeAt(i)
    buf[18 + i] = drop.charCodeAt(i)
  }

  // Rating 1 byte
  buf[26] = rating

  // base64 encode không dùng Buffer
  let binary = ''
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
  return btoa(binary)
}

// Encode 27-byte SOS memo
// [0-4]   SĐT tài xế  – BCD 5 bytes
// [5-9]   SĐT khách   – BCD 5 bytes
// [10-13] Latitude  × 1,000,000 → int32 big-endian (±0.1m)
// [14-17] Longitude × 1,000,000 → int32 big-endian (±0.1m)
// [18-25] Dự phòng – zeros
// [26]    Người kích hoạt – 0x01 = tài xế, 0x02 = khách
// Timestamp không cần encode – blockchain tự ghi thời gian ledger
export function encodeSosMemo(
  driverPhone:   string,
  customerPhone: string,
  lat:           number,
  lng:           number,
  triggeredBy:   'driver' | 'customer',
): string {
  const buf = new Uint8Array(27)

  const encodeBCD = (phone: string, offset: number) => {
    const digits = phone.replace(/\D/g, '').padStart(10, '0').slice(-10)
    for (let i = 0; i < 5; i++) {
      buf[offset + i] = (parseInt(digits[i * 2]) << 4) | parseInt(digits[i * 2 + 1])
    }
  }

  encodeBCD(driverPhone,   0)
  encodeBCD(customerPhone, 5)

  const encodeInt32 = (val: number, offset: number) => {
    const v = Math.round(val * 1_000_000) | 0   // int32
    buf[offset]     = (v >>> 24) & 0xff
    buf[offset + 1] = (v >>> 16) & 0xff
    buf[offset + 2] = (v >>>  8) & 0xff
    buf[offset + 3] =  v         & 0xff
  }

  encodeInt32(lat, 10)
  encodeInt32(lng, 14)

  buf[26] = triggeredBy === 'driver' ? 0x01 : 0x02

  let binary = ''
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
  return btoa(binary)
}

// Lấy số dư ODC từ Stellar Horizon
export async function getODCBalance(stellarWallet: string): Promise<number> {
  const res  = await fetch(`${STELLAR.HORIZON_URL}/accounts/${stellarWallet}`)
  if (!res.ok) return 0
  const data = await res.json()
  const balance = data.balances?.find(
    (b: { asset_code?: string; asset_issuer?: string; balance: string }) =>
      b.asset_code === STELLAR.ODC_ASSET_CODE && b.asset_issuer === STELLAR.ISSUER_ADDRESS
  )
  return balance ? parseFloat(balance.balance) : 0
}
