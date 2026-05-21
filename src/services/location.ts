// src/services/location.ts
// GPS + Geohash utilities

import * as ExpoLocation from 'expo-location'
import { LOCATION } from '../constants'

// Geohash encoding (không dùng thư viện ngoài để giảm bundle size)
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'

export function encodeGeohash(lat: number, lng: number, precision: number): string {
  let idx    = 0
  let bit    = 0
  let evenBit = true
  let geohash = ''
  let minLat = -90, maxLat = 90
  let minLng = -180, maxLng = 180

  while (geohash.length < precision) {
    if (evenBit) {
      const midLng = (minLng + maxLng) / 2
      if (lng >= midLng) { idx = idx * 2 + 1; minLng = midLng }
      else               { idx = idx * 2;     maxLng = midLng }
    } else {
      const midLat = (minLat + maxLat) / 2
      if (lat >= midLat) { idx = idx * 2 + 1; minLat = midLat }
      else               { idx = idx * 2;     maxLat = midLat }
    }
    evenBit = !evenBit
    if (++bit === 5) {
      geohash += BASE32[idx]
      bit = 0
      idx = 0
    }
  }
  return geohash
}

export function decodeGeohash(geohash: string): { lat: number; lng: number } {
  let evenBit = true
  let minLat = -90, maxLat = 90
  let minLng = -180, maxLng = 180
  for (const c of geohash) {
    const idx = BASE32.indexOf(c)
    for (let bits = 4; bits >= 0; bits--) {
      if (evenBit) {
        const midLng = (minLng + maxLng) / 2
        if (idx >> bits & 1) minLng = midLng; else maxLng = midLng
      } else {
        const midLat = (minLat + maxLat) / 2
        if (idx >> bits & 1) minLat = midLat; else maxLat = midLat
      }
      evenBit = !evenBit
    }
  }
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 }
}

// 6 ký tự cho Firestore query (±610m)
export function geohashForQuery(lat: number, lng: number): string {
  return encodeGeohash(lat, lng, LOCATION.GEOHASH_QUERY_LENGTH)
}

// 8 ký tự cho Stellar memo (±19m)
export function geohashForMemo(lat: number, lng: number): string {
  return encodeGeohash(lat, lng, LOCATION.GEOHASH_MEMO_LENGTH)
}

// Lấy vị trí hiện tại
export async function getCurrentLocation(): Promise<{ lat: number; lng: number }> {
  const { status } = await ExpoLocation.requestForegroundPermissionsAsync()
  if (status !== 'granted') throw new Error('Location permission denied')

  const loc = await ExpoLocation.getCurrentPositionAsync({
    accuracy: ExpoLocation.Accuracy.Balanced,
  })
  return { lat: loc.coords.latitude, lng: loc.coords.longitude }
}

// Tính khoảng cách giữa 2 điểm (Haversine) – đơn vị: km
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// OSRM – tính khoảng cách thực tế qua đường bộ
// Gọi THẲNG từ app, KHÔNG qua Cloudflare Worker
export async function getRouteDistanceKm(
  originLat: number, originLng: number,
  destLat: number,   destLng: number,
): Promise<number> {
  const url = `http://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=false`

  // Retry 2 lần với timeout 8s mỗi lần; fallback về Haversine ×1.3 nếu OSRM down
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController()
      const timeout    = setTimeout(() => controller.abort(), 8000)
      const res  = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)
      const data = await res.json()
      if (data.code === 'Ok') return data.routes[0].distance / 1000
    } catch {
      // thử lại lần sau hoặc dùng fallback
    }
  }

  // Haversine ×1.3 – ước tính đường bộ xấp xỉ ±30%
  return distanceKm(originLat, originLng, destLat, destLng) * 1.3
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
  const encoded = encodeURIComponent(address)
  const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'OpenDrive/1.0',
    },
  })
  const results = await res.json()
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('Không tìm thấy địa chỉ. Vui lòng thử lại.')
  }
  const place = results[0]
  return {
    lat: Number(place.lat),
    lng: Number(place.lon),
  }
}

// Reverse geocode: tọa độ → tên địa chỉ ngắn (dùng Nominatim)
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`
  const res  = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'OpenDrive/1.0' },
  })
  const data = await res.json()
  if (data.error) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`

  // Ghép địa chỉ ngắn: số nhà + đường + phường/quận
  const a = data.address ?? {}
  const parts = [
    a.house_number,
    a.road ?? a.pedestrian ?? a.footway ?? a.path,
    a.suburb ?? a.neighbourhood ?? a.quarter,
    a.city_district ?? a.county,
  ].filter(Boolean)

  if (parts.length > 0) return parts.slice(0, 3).join(', ')
  // Fallback: lấy 2 phần đầu của display_name
  return (data.display_name ?? '').split(',').slice(0, 2).join(',').trim()
    || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

// Gợi ý địa chỉ theo từ khóa – dùng cho autocomplete (Nominatim)
// nearLat/nearLng: vị trí hiện tại → thêm viewbox ~17km để ưu tiên kết quả gần
export async function searchAddresses(
  query: string,
  limit = 4,
  nearLat?: number,
  nearLng?: number,
): Promise<{ lat: number; lng: number; name: string }[]> {
  if (query.length < 3) return []
  try {
    const encoded = encodeURIComponent(query)
    const delta   = 0.15  // ~17km mỗi phía
    const viewbox = nearLat != null && nearLng != null
      ? `&viewbox=${nearLng - delta},${nearLat - delta},${nearLng + delta},${nearLat + delta}`
      : ''
    const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=${limit}&addressdetails=0&countrycodes=vn${viewbox}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'OpenDrive/1.0' },
      signal: controller.signal,
    })
    clearTimeout(timer)
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data.map((r: any) => ({
      lat:  Number(r.lat),
      lng:  Number(r.lon),
      name: (r.display_name as string).split(',').slice(0, 3).join(',').trim(),
    }))
  } catch {
    return []
  }
}

// Deep link Google Maps để dẫn đường (không cần SDK)
export function openGoogleMapsNavigation(destLat: number, destLng: number): string {
  return `google.navigation:q=${destLat},${destLng}`
}
