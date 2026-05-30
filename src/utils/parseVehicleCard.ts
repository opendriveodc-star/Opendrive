// src/utils/parseVehicleCard.ts
// Parse OCR text từ Giấy chứng nhận đăng ký xe
// Dùng keyword tiếng Anh (Brand/Color/Seats/Type) vì OCR đọc ASCII chính xác hơn chữ có dấu

export interface ParsedVehicleCard {
  licensePlate?: string
  plateColor?:   'yellow' | 'white' | 'blue' | 'unknown'
  vehicleBrand?:  string
  vehicleColor?:  string
  vehicleType?:   string
}

function normalize(s: string): string {
  return s
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
    .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
    .replace(/[ìíịỉĩ]/g, 'i')
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
    .replace(/[ùúụủũưừứựửữ]/g, 'u')
    .replace(/[ỳýỵỷỹ]/g, 'y')
    .replace(/[đ]/g, 'd')
    .toUpperCase()
}

// Tìm giá trị sau dấu ":" trên cùng dòng, bỏ qua label phụ trong ngoặc
function extractAfterColon(line: string): string {
  const idx = line.lastIndexOf(':')
  if (idx === -1) return ''
  return line.slice(idx + 1).trim().replace(/^[^A-Z0-9]+/, '')
}

export function parseVehicleCard(rawText: string): ParsedVehicleCard {
  const result: ParsedVehicleCard = {}
  const norm = normalize(rawText)
  const normLines = norm.split('\n').map(l => l.trim()).filter(Boolean)

  // ── Biển số + màu biển (V)/(T)/(X) ──
  const plateMatch = rawText.match(/(\d{2}[A-ZĐa-zđ]{1,2}[-\s][\d.]{4,9})/)
  if (plateMatch) {
    result.licensePlate = plateMatch[1].replace(/[\s–—]/g, '-').replace(/\.$/, '').toUpperCase()

    // Tìm (V)/(T)/(X) trong vùng ±150 ký tự quanh biển số
    const idx   = plateMatch.index ?? 0
    const zone  = rawText.slice(Math.max(0, idx - 150), idx + plateMatch[0].length + 150)
    const colorMatch = zone.match(/\(\s*([TVX])\s*\)/i)
    if (colorMatch) {
      const code = colorMatch[1].toUpperCase()
      result.plateColor = code === 'V' ? 'yellow' : code === 'T' ? 'white' : 'blue'
    } else {
      result.plateColor = 'unknown'
    }
  }

  // ── Nhãn hiệu (Brand) ──
  // Tìm "BRAND" trước vì OCR đọc ASCII chính xác hơn "NHAN HIEU" có dấu
  for (let i = 0; i < normLines.length; i++) {
    if (normLines[i].includes('BRAND')) {
      const val = extractAfterColon(normLines[i])
      if (val && val.length > 1) {
        result.vehicleBrand = val.split(/\s+/)[0]
      } else if (i + 1 < normLines.length) {
        const next = normLines[i + 1].replace(/^[^A-Z]+/, '').split(/\s+/)[0]
        if (next && next.length > 1) result.vehicleBrand = next
      }
      break
    }
  }
  // Fallback: scan toàn văn bản tìm thương hiệu phổ biến
  if (!result.vehicleBrand) {
    const BRANDS = [
      'HONDA', 'YAMAHA', 'SUZUKI', 'PIAGGIO', 'SYM', 'KYMCO',
      'TOYOTA', 'HYUNDAI', 'KIA', 'FORD', 'MAZDA', 'MITSUBISHI',
      'NISSAN', 'ISUZU', 'HINO', 'VINFAST', 'MERCEDES', 'BMW',
      'LEXUS', 'DAEWOO', 'CHEVROLET', 'THACO',
    ]
    for (const b of BRANDS) {
      if (norm.includes(b)) { result.vehicleBrand = b; break }
    }
  }

  // ── Màu sơn (Color) ──
  const COLOR_MAP: Record<string, string> = {
    'DEN': 'Đen',      'TRANG': 'Trắng',  'DO': 'Đỏ',
    'XANH LAM': 'Xanh lam', 'XANH LA': 'Xanh lá', 'XANH': 'Xanh',
    'VANG': 'Vàng',    'CAM': 'Cam',       'TIM': 'Tím',
    'NAU': 'Nâu',      'XAM': 'Xám',       'BAC': 'Bạc', 'NGAN': 'Bạc',
    'HONG': 'Hồng',    'BE': 'Be',
  }
  for (let i = 0; i < normLines.length; i++) {
    if (normLines[i].includes('COLOR')) {
      const val = extractAfterColon(normLines[i])
      let raw = val
      if (!raw && i + 1 < normLines.length) raw = normLines[i + 1].trim()
      if (raw) {
        const words = raw.split(/\s+/)
        const two   = words.slice(0, 2).join(' ')
        result.vehicleColor = COLOR_MAP[two] ?? COLOR_MAP[words[0]] ?? words.slice(0, 2).join(' ')
      }
      break
    }
  }

  // ── Số chỗ ngồi (Seats/Sit) ──
  // OCR thường tách label và số ra nhiều dòng → tìm số đứng độc lập trong 20 dòng kế
  let seats = 0
  for (let i = 0; i < normLines.length; i++) {
    const line = normLines[i]
    if (line.includes('SEAT') || line.includes('SIT')) {
      // Thử tìm số trên cùng dòng trước
      const sameLine = line.match(/[:\s]\s*(\d{1,2})\s*$/)
      if (sameLine) { seats = parseInt(sameLine[1]); break }
      // Không có → tìm trong 20 dòng tiếp
      for (let j = i + 1; j < Math.min(i + 20, normLines.length); j++) {
        const onlyNum = normLines[j].match(/^\s*(\d{1,2})\s*$/)
        if (onlyNum) { seats = parseInt(onlyNum[1]); break }
      }
      break
    }
  }

  // ── Loại xe ──
  const TRUCK_BRANDS = ['ISUZU', 'HINO', 'THACO', 'DONGFENG', 'FOTON', 'JAC', 'FUSO', 'VEAM']
  const isTruckBrand = TRUCK_BRANDS.some(b => norm.includes(b))
  const hasTonage    = norm.includes('TAI TRONG') || norm.includes('TRONG TAI')
    || norm.includes('PAYLOAD') || norm.includes('GVW')

  if (seats > 0) {
    if (seats >= 1 && seats <= 3) {
      result.vehicleType = isTruckBrand ? 'truck' : 'pickup'
    } else if (seats >= 7) {
      result.vehicleType = 'car6'
    } else {
      result.vehicleType = 'car4'
    }
  } else {
    // Không có SEAT → xe máy (xe máy không có trường này)
    result.vehicleType = 'motorbike'
  }

  return result
}
