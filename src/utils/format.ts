// src/utils/format.ts
// Các hàm định dạng dữ liệu dùng trong UI

export function formatPrice(amount: number): string {
  return `${amount.toLocaleString('vi-VN')}đ`
}

export function formatODC(amount: number): string {
  return `${amount.toFixed(2)} ODC`
}

export function formatDate(timestamp: number): string {
  const d = new Date(timestamp)
  const dd   = String(d.getDate()).padStart(2, '0')
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh   = String(d.getHours()).padStart(2, '0')
  const min  = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`
}

export function maskPhone(phone: string): string {
  if (phone.length < 7) return phone
  const start = phone.slice(0, 4)
  const end   = phone.slice(-3)
  return `${start}***${end}`
}

export function shortenHash(hash: string, chars = 8): string {
  if (hash.length <= chars * 2) return hash
  return `${hash.slice(0, chars)}...${hash.slice(-chars)}`
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}
