// app/blockchain.tsx
// Blockchain explorer – nhật ký chuyến xe + nhật ký SOS
// Giữ tiêu đề 5 giây để chuyển sang chế độ SOS

import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  StatusBar, ActivityIndicator, Linking, Vibration,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { STELLAR } from '../src/constants'

const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'
const BRAND_MUTED = '#F0F4FB'
const SOS_RED     = '#DC2626'
const SOS_LIGHT   = '#FEF2F2'

const PAGE_SIZE = 20

// ─── Trip record ────────────────────────────────────────────────────────────
interface TxRecord {
  id:        string
  hash:      string
  createdAt: string
  memo:      string | null
  rating:    number | null
}

function decodeTripMemo(memoBase64: string): { rating: number } | null {
  try {
    const bytes = Uint8Array.from(atob(memoBase64), c => c.charCodeAt(0))
    if (bytes.length < 27) return null
    return { rating: bytes[26] }
  } catch { return null }
}

// ─── SOS record ─────────────────────────────────────────────────────────────
interface SosRecord {
  id:          string
  hash:        string
  createdAt:   string
  driverPhone: string
  custPhone:   string
  lat:         number
  lng:         number
  plate:       string
  by:          'driver' | 'customer' | 'unknown'
}

function decodeSosMemo(memoBase64: string): Omit<SosRecord, 'id' | 'hash' | 'createdAt'> | null {
  try {
    const bytes = Uint8Array.from(atob(memoBase64), c => c.charCodeAt(0))
    if (bytes.length < 18) return null

    const decodePhone = (off: number) => {
      let s = ''
      for (let i = 0; i < 5; i++) {
        s += ((bytes[off + i] >> 4) & 0xf).toString()
        s += (bytes[off + i] & 0xf).toString()
      }
      return s
    }

    const decodeInt32 = (off: number) => {
      // << tự nhiên cho signed int32 trong JS
      const v = (bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3]
      return v / 1_000_000
    }

    const driverPhone = decodePhone(0)
    const custPhone   = decodePhone(5)
    const lat         = decodeInt32(10)
    const lng         = decodeInt32(14)

    let plate = ''
    let by: SosRecord['by'] = 'unknown'

    if (bytes.length >= 29) {
      // Format mới 32 bytes: [18-27] biển số, [28] triggeredBy
      for (let i = 0; i < 10; i++) {
        if (bytes[18 + i] === 0) break
        plate += String.fromCharCode(bytes[18 + i])
      }
      by = bytes[28] === 0x01 ? 'driver' : bytes[28] === 0x02 ? 'customer' : 'unknown'
    } else if (bytes.length >= 27) {
      // Format cũ 27 bytes: [26] triggeredBy, không có biển số
      by = bytes[26] === 0x01 ? 'driver' : bytes[26] === 0x02 ? 'customer' : 'unknown'
    }

    return { driverPhone, custPhone, lat, lng, plate, by }
  } catch { return null }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function starLabel(rating: number | null) {
  if (!rating) return ''
  return '★'.repeat(rating) + '☆'.repeat(5 - rating)
}

function ratingColor(r: number | null) {
  if (!r) return '#94A3B8'
  if (r >= 4) return '#16A34A'
  if (r === 3) return '#D97706'
  return '#DC2626'
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function shortHash(hash: string) { return hash.slice(0, 8) + '...' + hash.slice(-8) }

function last3(s: string) {
  if (!s) return '—'
  if (s.length <= 3) return s
  return '*'.repeat(s.length - 3) + s.slice(-3)
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function BlockchainScreen() {
  const { t } = useTranslation()

  const [mode,     setMode]     = useState<'trip' | 'sos'>('trip')
  const [trips,    setTrips]    = useState<TxRecord[]>([])
  const [sosList,  setSosList]  = useState<SosRecord[]>([])
  const [cursor,   setCursor]   = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [hasMore,  setHasMore]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)


  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchPage = useCallback(async (m: 'trip' | 'sos', paging_token?: string) => {
    const address = m === 'trip' ? STELLAR.TRANSACTION_ADDRESS : STELLAR.SOS_ADDRESS
    if (!address) { setError(t('blockchain.noAddress')); return }
    setLoading(true)
    setError(null)
    try {
      const url = `${STELLAR.HORIZON_URL}/accounts/${address}/transactions?limit=${PAGE_SIZE}&order=desc`
        + (paging_token ? `&cursor=${paging_token}` : '')
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()

      if (m === 'trip') {
        const records: TxRecord[] = (json._embedded?.records ?? []).map((r: any) => {
          const decoded = r.memo_type === 'hash' ? decodeTripMemo(r.memo) : null
          return { id: r.id, hash: r.hash, createdAt: r.created_at, memo: r.memo ?? null, rating: decoded?.rating ?? null }
        })
        setTrips(prev => paging_token ? [...prev, ...records] : records)
        const last = records[records.length - 1]
        setCursor(last ? last.id : null)
        setHasMore(records.length === PAGE_SIZE)
      } else {
        const records: SosRecord[] = (json._embedded?.records ?? []).map((r: any) => {
          const decoded = r.memo_type === 'hash' ? decodeSosMemo(r.memo) : null
          if (!decoded) return null
          return { id: r.id, hash: r.hash, createdAt: r.created_at, ...decoded }
        }).filter(Boolean) as SosRecord[]
        setSosList(prev => paging_token ? [...prev, ...records] : records)
        const last = records[records.length - 1]
        setCursor(last ? last.id : null)
        setHasMore(records.length === PAGE_SIZE)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { fetchPage('trip') }, [fetchPage])

  // ── Chuyển chế độ ─────────────────────────────────────────────────────────
  function switchMode() {
    const next = mode === 'trip' ? 'sos' : 'trip'
    setMode(next)
    setCursor(null)
    setHasMore(true)
    setError(null)
    if (next === 'trip') { setTrips([]); fetchPage('trip') }
    else                 { setSosList([]); fetchPage('sos') }
  }

  function onTitleLongPress() {
    Vibration.vibrate([0, 80, 100, 80])
    switchMode()
  }

  // ── Mở Stellar Explorer ───────────────────────────────────────────────────
  function openStellar(hash: string) {
    const base = STELLAR.NETWORK === 'mainnet'
      ? 'https://stellar.expert/explorer/public/tx/'
      : 'https://stellar.expert/explorer/testnet/tx/'
    Linking.openURL(base + hash)
  }

  function openMaps(lat: number, lng: number) {
    Linking.openURL(`https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`)
  }

  // ── Render trip card ───────────────────────────────────────────────────────
  const renderTrip = ({ item, index }: { item: TxRecord; index: number }) => (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View style={s.indexBadge}>
          <Text style={s.indexText}>#{trips.length - index}</Text>
        </View>
        <Text style={s.dateText}>{formatDate(item.createdAt)}</Text>
        {item.rating !== null && (
          <Text style={[s.ratingText, { color: ratingColor(item.rating) }]}>
            {starLabel(item.rating)}
          </Text>
        )}
      </View>
      <Text style={s.hashText}>{shortHash(item.hash)}</Text>
      <TouchableOpacity style={s.viewBtn} onPress={() => openStellar(item.hash)} activeOpacity={0.8}>
        <Ionicons name="open-outline" size={13} color={BRAND} />
        <Text style={s.viewBtnText}>{t('blockchain.viewOnStellar')}</Text>
      </TouchableOpacity>
    </View>
  )

  // ── Render SOS card ────────────────────────────────────────────────────────
  const renderSos = ({ item, index }: { item: SosRecord; index: number }) => {
    const isDriver = item.by === 'driver'
    const triggerLabel = isDriver ? 'Tài xế' : item.by === 'customer' ? 'Khách' : 'Không rõ'
    return (
      <View style={[s.card, s.sosCard]}>
        {/* Header */}
        <View style={s.cardHeader}>
          <View style={[s.indexBadge, { backgroundColor: BRAND }]}>
            <Text style={[s.indexText, { color: '#fff' }]}>#{sosList.length - index}</Text>
          </View>
          <Text style={s.dateText}>{formatDate(item.createdAt)}</Text>
        </View>

        {/* 3 chips đều nhau: SĐT tài xế · SĐT khách · Biển số */}
        <View style={s.chipsRow}>
          <View style={s.infoChip}>
            <View style={s.chipTop}>
              <Ionicons name="car-outline" size={12} color={BRAND} />
              <Text style={s.chipLabel}>Tài xế</Text>
            </View>
            <Text style={s.chipVal}>{last3(item.driverPhone)}</Text>
          </View>
          <View style={s.infoChip}>
            <View style={s.chipTop}>
              <Ionicons name="person-outline" size={12} color={BRAND} />
              <Text style={s.chipLabel}>Hành khách</Text>
            </View>
            <Text style={s.chipVal}>{last3(item.custPhone)}</Text>
          </View>
          <View style={s.infoChip}>
            <View style={s.chipTop}>
              <Ionicons name="card-outline" size={12} color={BRAND} />
              <Text style={s.chipLabel}>Biển số</Text>
            </View>
            <Text style={s.chipVal}>{item.plate ? last3(item.plate) : '—'}</Text>
          </View>
        </View>

        {/* Tọa độ */}
        <View style={s.sosRow}>
          <Ionicons name="location-outline" size={13} color={BRAND} style={s.rowIcon} />
          <Text style={s.sosLabel}>Tọa độ</Text>
          <Text style={s.sosValue}>{item.lat.toFixed(5)}°, {item.lng.toFixed(5)}°</Text>
        </View>

        {/* Kích hoạt bởi */}
        <View style={[s.sosRow, { marginBottom: 10 }]}>
          <Ionicons name="finger-print-outline" size={13} color={BRAND} style={s.rowIcon} />
          <Text style={s.sosLabel}>Kích hoạt</Text>
          <Text style={s.sosValue}>{triggerLabel}</Text>
        </View>

        <View style={s.sosBtnRow}>
          <TouchableOpacity style={s.viewBtn} onPress={() => openMaps(item.lat, item.lng)} activeOpacity={0.8}>
            <Ionicons name="map-outline" size={13} color={BRAND} />
            <Text style={s.viewBtnText}>Bản đồ</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.viewBtn} onPress={() => openStellar(item.hash)} activeOpacity={0.8}>
            <Ionicons name="open-outline" size={13} color={BRAND} />
            <Text style={s.viewBtnText}>{t('blockchain.viewOnStellar')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  const isSos      = mode === 'sos'
  const listData   = isSos ? sosList : trips
  const totalCount = listData.length

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={BRAND} />
        </TouchableOpacity>

        {/* Tiêu đề – giữ 5 giây để chuyển chế độ */}
        <TouchableOpacity
          style={s.headerCenter}
          activeOpacity={0.6}
          onLongPress={onTitleLongPress}
          delayLongPress={5000}
        >
          <View style={s.titleRow}>
            <Text style={[s.headerTitle, isSos && { color: SOS_RED }]}>
              {isSos ? 'Nhật ký SOS' : t('blockchain.title')}
            </Text>
          </View>
          <Text style={[s.headerSub, isSos && { color: '#F87171' }]}>
            {isSos ? 'Cảnh báo khẩn cấp' : t('blockchain.subtitle')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.refreshBtn}
          onPress={() => {
            setCursor(null); setHasMore(true)
            if (isSos) { setSosList([]); fetchPage('sos') }
            else       { setTrips([]);   fetchPage('trip') }
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh-outline" size={20} color={BRAND} />
        </TouchableOpacity>
      </View>

      {/* Stats bar */}
      {totalCount > 0 && (
        <View style={[s.statsBar, isSos && { backgroundColor: SOS_LIGHT }]}>
          <Ionicons name={isSos ? 'shield-outline' : 'cube-outline'} size={14} color={isSos ? SOS_RED : BRAND} />
          <Text style={[s.statsText, isSos && { color: SOS_RED }]}>
            {totalCount}{hasMore ? '+' : ''} {isSos ? 'cảnh báo' : t('blockchain.txHash')}
          </Text>
        </View>
      )}

      {error ? (
        <View style={s.center}>
          <Ionicons name="warning-outline" size={40} color="#DC2626" />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => fetchPage(mode)}>
            <Text style={s.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={listData as any[]}
          keyExtractor={item => item.id}
          renderItem={isSos
            ? (info) => renderSos(info as { item: SosRecord; index: number })
            : (info) => renderTrip(info as { item: TxRecord; index: number })
          }
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            loading ? null : (
              <View style={s.center}>
                <Ionicons name={isSos ? 'shield-checkmark-outline' : 'receipt-outline'} size={40} color="#94A3B8" />
                <Text style={s.emptyText}>
                  {isSos ? 'Chưa có cảnh báo SOS nào' : t('blockchain.empty')}
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            loading ? (
              <View style={s.footerLoad}>
                <ActivityIndicator size="small" color={isSos ? SOS_RED : BRAND} />
                <Text style={s.loadingText}>{t('blockchain.loading')}</Text>
              </View>
            ) : hasMore && totalCount > 0 ? (
              <TouchableOpacity
                style={[s.loadMoreBtn, isSos && { borderColor: '#FCA5A5', backgroundColor: SOS_LIGHT }]}
                onPress={() => fetchPage(mode, cursor ?? undefined)}
                activeOpacity={0.8}
              >
                <Text style={[s.loadMoreText, isSos && { color: SOS_RED }]}>{t('blockchain.loadMore')}</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BRAND_LIGHT },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: BRAND, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  headerCenter: { flex: 1, alignItems: 'center' },
  titleRow:     { flexDirection: 'row', alignItems: 'center' },
headerTitle:  { fontSize: 16, fontWeight: '700', color: BRAND },
  headerSub:    { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  refreshBtn:   { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: BRAND_LIGHT, alignItems: 'center', justifyContent: 'center' },

  statsBar:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: BRAND_MUTED, borderBottomWidth: 1, borderBottomColor: BRAND_LIGHT },
  statsText: { fontSize: 12, color: BRAND, fontWeight: '600' },

  list: { padding: 16, paddingBottom: 40 },

  // ── Trip card ────────────────────────────────────────────────────────────
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: BRAND_LIGHT },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  indexBadge: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: BRAND_MUTED, borderRadius: 6 },
  indexText:  { fontSize: 11, fontWeight: '700', color: BRAND },
  dateText:   { flex: 1, fontSize: 12, color: '#64748B' },
  ratingText: { fontSize: 13, fontWeight: '700' },
  hashText:   { fontSize: 12, color: '#94A3B8', fontFamily: 'monospace', marginBottom: 10 },
  viewBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: BRAND_LIGHT, backgroundColor: BRAND_MUTED },
  viewBtnText: { fontSize: 12, fontWeight: '600', color: BRAND },

  // ── SOS card ─────────────────────────────────────────────────────────────
  sosCard:   { borderColor: '#FCA5A5', backgroundColor: '#FFFAFA' },

  chipsRow:  { flexDirection: 'row', gap: 6, marginBottom: 10 },
  infoChip:  { flex: 1, alignItems: 'center', paddingHorizontal: 4, paddingVertical: 9, backgroundColor: BRAND_MUTED, borderRadius: 10, borderWidth: 1, borderColor: BRAND_LIGHT },
  chipTop:   { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 5 },
  chipLabel: { fontSize: 10, color: '#64748B', fontWeight: '600' },
  chipVal:   { fontSize: 11, fontWeight: '700', color: BRAND, textAlign: 'center' },

  sosRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 4 },
  rowIcon:   { marginRight: 2 },
  sosLabel:  { fontSize: 12, color: '#64748B', marginRight: 2 },
  sosValue:  { fontSize: 12, color: BRAND, fontWeight: '600' },
  sosBtnRow: { flexDirection: 'row', gap: 8 },

  // ── Common ───────────────────────────────────────────────────────────────
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 60 },
  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 12 },
  errorText: { fontSize: 13, color: '#DC2626', textAlign: 'center', marginTop: 10 },
  retryBtn:  { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: BRAND, borderRadius: 10 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  footerLoad:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  loadingText:  { fontSize: 13, color: '#64748B' },
  loadMoreBtn:  { alignSelf: 'center', marginVertical: 12, paddingHorizontal: 28, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: BRAND_LIGHT, backgroundColor: BRAND_MUTED },
  loadMoreText: { fontSize: 14, fontWeight: '600', color: BRAND },
})
