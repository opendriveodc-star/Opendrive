// app/(driver)/history.tsx

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Linking, StatusBar, ActivityIndicator, TextInput, Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { getDriverInfo } from '../../src/utils/storage'
import { STELLAR } from '../../src/constants'

const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'
const BRAND_MUTED = '#F0F4FB'
const PAGE_SIZE   = 20

interface TripRecord {
  id:        string
  hash:      string
  createdAt: string
  rating:    number | null
  odcNet:    number | null
}

async function fetchOdcPayments(address: string): Promise<Map<string, number>> {
  const netMap = new Map<string, number>()
  try {
    const url = `${STELLAR.HORIZON_URL}/accounts/${address}/payments?order=desc&limit=200`
    const res = await fetch(url)
    if (!res.ok) return netMap
    const json = await res.json()
    for (const r of (json._embedded?.records ?? [])) {
      if (r.type !== 'payment') continue
      if (r.asset_code !== STELLAR.ODC_ASSET_CODE) continue
      const amount = parseFloat(r.amount)
      if (isNaN(amount)) continue
      const cur = netMap.get(r.transaction_hash) ?? 0
      netMap.set(r.transaction_hash, r.to === address ? cur + amount : cur - amount)
    }
  } catch {}
  return netMap
}

function decodeMemo(memoBase64: string): { rating: number } | null {
  try {
    const bytes = Uint8Array.from(atob(memoBase64), c => c.charCodeAt(0))
    if (bytes.length < 27) return null
    return { rating: bytes[26] }
  } catch { return null }
}

function starLabel(r: number): string { return '★'.repeat(r) + '☆'.repeat(5 - r) }
function ratingColor(r: number): string {
  if (r >= 4) return '#16A34A'
  if (r === 3) return '#D97706'
  return '#DC2626'
}
function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}
function formatOdc(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(4)
}
function calcRevenue(odcNet: number | null, rating: number | null): number | null {
  if (odcNet === null || odcNet >= 0) return null
  const absOdc = Math.abs(odcNet)
  let mult = 1
  if (rating === 4) mult = 0.5
  else if (rating === 2) mult = 2
  else if (rating === 1) mult = 3
  return Math.round(absOdc / mult / 0.00001)
}
function formatVnd(n: number): string {
  return Math.round(n).toLocaleString('vi-VN') + 'đ'
}
function parseVNDate(s: string): Date | null {
  const p = s.trim().split('/')
  if (p.length !== 3) return null
  const [dd, mm, yyyy] = p.map(Number)
  if (!dd || !mm || !yyyy || yyyy < 2020) return null
  const d = new Date(yyyy, mm - 1, dd)
  return isNaN(d.getTime()) ? null : d
}

// Gõ số thuần → tự chèn dấu /  (e.g. "01122025" → "01/12/2025")
function autoFormatDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return digits.slice(0, 2) + '/' + digits.slice(2)
  return digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4)
}

export default function HistoryScreen() {
  const { t } = useTranslation()

  const [walletAddress, setWalletAddress] = useState('')
  const [driverRating,  setDriverRating]  = useState<number>(0)
  const [trips,   setTrips]   = useState<TripRecord[]>([])
  const [cursor,  setCursor]  = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const [showFilter, setShowFilter] = useState(false)
  const [fromDate,   setFromDate]   = useState('')
  const [toDate,     setToDate]     = useState('')

  const odcMapRef = useRef<Map<string, number>>(new Map())
  const spinAnim  = useRef(new Animated.Value(0)).current
  const spinRef   = useRef<Animated.CompositeAnimation | null>(null)

  useEffect(() => {
    getDriverInfo().then(info => {
      if (info?.stellarWallet) setWalletAddress(info.stellarWallet)
      if (info?.rating) setDriverRating(Number(info.rating))
    })
  }, [])

  const fetchPage = useCallback(async (address: string, pagingToken?: string, autoLoad = false) => {
    if (!address) return
    setLoading(true)
    setError(null)
    try {
      let netMap = odcMapRef.current
      const limit = autoLoad ? 200 : PAGE_SIZE
      const txUrl = `${STELLAR.HORIZON_URL}/accounts/${address}/transactions?limit=${limit}&order=desc`
        + (pagingToken ? `&cursor=${pagingToken}` : '')

      if (!pagingToken) {
        const [txRes, newOdcMap] = await Promise.all([fetch(txUrl), fetchOdcPayments(address)])
        odcMapRef.current = newOdcMap
        if (!txRes.ok) throw new Error(`HTTP ${txRes.status}`)
        const records = buildRecords(await txRes.json(), newOdcMap)
        setTrips(records)
        const last = records[records.length - 1]
        setCursor(last ? last.id : null)
        setHasMore(records.length === limit)
      } else {
        const txRes = await fetch(txUrl)
        if (!txRes.ok) throw new Error(`HTTP ${txRes.status}`)
        const records = buildRecords(await txRes.json(), odcMapRef.current)
        setTrips(prev => [...prev, ...records])
        const last = records[records.length - 1]
        setCursor(last ? last.id : null)
        setHasMore(records.length === limit)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  function buildRecords(json: any, netMap: Map<string, number>): TripRecord[] {
    return (json._embedded?.records ?? [])
      .filter((r: any) => r.memo_type === 'hash')
      .map((r: any) => ({
        id: r.id, hash: r.hash, createdAt: r.created_at,
        rating: decodeMemo(r.memo)?.rating ?? null,
        odcNet: netMap.get(r.hash) ?? null,
      }))
  }

  useEffect(() => {
    if (walletAddress) fetchPage(walletAddress)
  }, [walletAddress, fetchPage])

  // Spin animation khi đang auto-load
  useEffect(() => {
    if (filterActive && loading) {
      spinAnim.setValue(0)
      spinRef.current = Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 1000, useNativeDriver: true })
      )
      spinRef.current.start()
    } else {
      spinRef.current?.stop()
      spinRef.current = null
    }
    return () => { spinRef.current?.stop() }
  }, [filterActive, loading])

  // Tự động load thêm khi filter đang bật mà dữ liệu chưa đủ
  useEffect(() => {
    if (!filterActive || !hasMore || loading || !walletAddress || !cursor) return
    const from = parseVNDate(fromDate)
    if (!from) return
    if (trips.length === 0) return
    const oldest = new Date(trips[trips.length - 1].createdAt)
    if (oldest > from) fetchPage(walletAddress, cursor, true)
  }, [trips, fromDate, filterActive, hasMore, loading, walletAddress, cursor])

  function clearFilter() {
    setFromDate(''); setToDate('')
  }

  // Filter tự động reactive – không cần bấm nút, chỉ cần nhập đủ ngày hợp lệ
  const filteredTrips = useMemo(() => {
    const from = parseVNDate(fromDate)
    const to   = parseVNDate(toDate)
    if (!from && !to) return trips
    if (to) to.setHours(23, 59, 59, 999)
    return trips.filter(tr => {
      const d = new Date(tr.createdAt)
      if (from && d < from) return false
      if (to   && d > to)   return false
      return true
    })
  }, [trips, fromDate, toDate])

  const filterActive = !!(parseVNDate(fromDate) || parseVNDate(toDate))

  const stats = useMemo(() => {
    const totalOdc     = filteredTrips.reduce((s, t) => s + (t.odcNet ?? 0), 0)
    const totalRevenue = filteredTrips.reduce((s, t) => s + (calcRevenue(t.odcNet, t.rating) ?? 0), 0)
    const avgRating    = driverRating
    const formatShort  = (iso: string) => {
      const d = new Date(iso)
      return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    }
    let dateRange = ''
    if (filterActive) {
      const from = fromDate || '?'
      const to   = toDate   || '?'
      dateRange = `${from} – ${to}`
    } else if (filteredTrips.length > 0) {
      const oldest = filteredTrips[filteredTrips.length - 1].createdAt
      const newest = filteredTrips[0].createdAt
      dateRange = filteredTrips.length === 1
        ? formatShort(newest)
        : `${formatShort(oldest)} – ${formatShort(newest)}`
    }
    return { total: filteredTrips.length, totalOdc, avgRating, totalRevenue, dateRange }
  }, [filteredTrips, filterActive, fromDate, toDate, driverRating])

  function openStellar(hash: string) {
    const base = STELLAR.NETWORK === 'mainnet'
      ? 'https://stellar.expert/explorer/public/tx/'
      : 'https://stellar.expert/explorer/testnet/tx/'
    Linking.openURL(base + hash)
  }

  const renderItem = ({ item, index }: { item: TripRecord; index: number }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIconWrap}>
          <Ionicons name="navigate-outline" size={18} color={BRAND} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
          <Text style={styles.tripLabel}>{t('history.tripNo', { n: filteredTrips.length - index })}</Text>
          <TouchableOpacity style={styles.chainBtn} onPress={() => openStellar(item.hash)} activeOpacity={0.75}>
            <Ionicons name="open-outline" size={12} color="#2563EB" />
            <Text style={styles.chainBtnText}>
              {item.hash.slice(0, 8)}…{item.hash.slice(-8)}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.cardRight}>
          {item.rating !== null && (
            <Text style={[styles.cardStars, { color: ratingColor(item.rating) }]}>
              {starLabel(item.rating)}
            </Text>
          )}
          {calcRevenue(item.odcNet, item.rating) !== null && (
            <Text style={styles.revenueText}>
              {formatVnd(calcRevenue(item.odcNet, item.rating)!)}
            </Text>
          )}
          {item.odcNet !== null && (
            <Text style={[styles.odcAmount, { color: item.odcNet >= 0 ? '#16A34A' : '#DC2626' }]}>
              {formatOdc(item.odcNet)} ODC
            </Text>
          )}
        </View>
      </View>
    </View>
  )

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={BRAND} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>{t('nav.history')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
            {filterActive && loading && (
              <Animated.View style={{
                position: 'absolute', width: 36, height: 36, borderRadius: 18,
                borderWidth: 2, borderTopColor: BRAND, borderRightColor: BRAND,
                borderBottomColor: 'transparent', borderLeftColor: 'transparent',
                transform: [{ rotate: spinAnim.interpolate({ inputRange: [0,1], outputRange: ['0deg','360deg'] }) }],
              }} />
            )}
            <TouchableOpacity
              style={[styles.iconBtn, showFilter && styles.iconBtnActive]}
              onPress={() => setShowFilter(v => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="calendar-outline" size={19} color={showFilter ? '#fff' : BRAND} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => { clearFilter(); walletAddress && fetchPage(walletAddress) }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="refresh-outline" size={19} color={BRAND} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter panel */}
      {showFilter && (
        <View style={styles.filterCard}>
          <View style={styles.filterRow}>
            <View style={styles.dateWrap}>
              <Text style={styles.dateLabel}>{t('history.fromDate')}</Text>
              <TextInput
                style={styles.dateInput}
                placeholder="DD/MM/YYYY"
                placeholderTextColor="#94A3B8"
                value={fromDate}
                onChangeText={v => setFromDate(autoFormatDate(v))}
                keyboardType="numeric"
                maxLength={10}
              />
            </View>
            <Ionicons name="arrow-forward-outline" size={14} color="#94A3B8" style={{ marginBottom: 7 }} />
            <View style={styles.dateWrap}>
              <Text style={styles.dateLabel}>{t('history.toDate')}</Text>
              <TextInput
                style={styles.dateInput}
                placeholder="DD/MM/YYYY"
                placeholderTextColor="#94A3B8"
                value={toDate}
                onChangeText={v => setToDate(autoFormatDate(v))}
                keyboardType="numeric"
                maxLength={10}
              />
            </View>
            <TouchableOpacity
              style={[styles.clearBtn, { marginBottom: 4 }]}
              onPress={clearFilter}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="close-circle" size={22} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Rating tổng */}
      {driverRating > 0 && (
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={16} color="#D97706" />
          <Text style={styles.ratingLbl}>{t('history.avgRating')}</Text>
          <Text style={styles.ratingVal}>{driverRating.toFixed(1)}</Text>
          <Text style={styles.ratingStars}>{'★'.repeat(Math.round(driverRating))}{'☆'.repeat(5 - Math.round(driverRating))}</Text>
        </View>
      )}

      {/* Stats bar */}
      {filteredTrips.length > 0 && (
        <View style={styles.statsBar}>
          {stats.dateRange !== '' && (
            <View style={styles.statRow}>
              <Text style={styles.statLbl}>{t('history.period')}</Text>
              <Text style={[styles.statVal, { fontSize: 12 }]}>{stats.dateRange}</Text>
            </View>
          )}
          <View style={styles.statRow}>
            <Text style={styles.statLbl}>{t('history.tripCount')}</Text>
            <Text style={styles.statVal}>{stats.total}{!filterActive && hasMore ? '+' : ''}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLbl}>{t('common.odc')}</Text>
            <Text style={[styles.statVal, { color: stats.totalOdc >= 0 ? '#16A34A' : '#DC2626' }]}>
              {formatOdc(stats.totalOdc)}
            </Text>
          </View>
          {stats.totalRevenue > 0 && (
            <View style={styles.statRow}>
              <Text style={styles.statLbl}>{t('history.revenue')}</Text>
              <Text style={[styles.statVal, { color: '#0369A1' }]}>{formatVnd(stats.totalRevenue)}</Text>
            </View>
          )}
        </View>
      )}

      {error ? (
        <View style={styles.center}>
          <Ionicons name="warning-outline" size={40} color="#DC2626" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => walletAddress && fetchPage(walletAddress)}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : !walletAddress && !loading ? (
        <View style={styles.center}>
          <Ionicons name="wallet-outline" size={40} color="#94A3B8" />
          <Text style={styles.emptyText}>{t('history.noWallet')}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTrips}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={loading ? null : (
            <View style={styles.center}>
              <Ionicons name="time-outline" size={56} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>{t('history.empty')}</Text>
              <Text style={styles.emptySub}>
                {filterActive
                  ? t('history.emptyFilter')
                  : t('history.emptySub')}
              </Text>
            </View>
          )}
          ListFooterComponent={
            loading ? (
              <View style={styles.footerLoad}>
                <ActivityIndicator size="small" color={BRAND} />
                <Text style={styles.loadingText}>{t('common.loading')}</Text>
              </View>
            ) : hasMore && trips.length > 0 ? (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={() => walletAddress && cursor && fetchPage(walletAddress, cursor)}
                activeOpacity={0.8}
              >
                <Text style={styles.loadMoreText}>{t('history.loadMore')}</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: '#F7F9FD' },
  topBar:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, position: 'relative' },
  backBtn:  { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: BRAND, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  topTitle: { fontSize: 17, fontWeight: '700', color: BRAND, position: 'absolute', left: 0, right: 0, textAlign: 'center' },
  iconBtn:  { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: BRAND_LIGHT, alignItems: 'center', justifyContent: 'center' },
  iconBtnActive: { backgroundColor: BRAND, borderColor: BRAND },

  filterCard:  { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: BRAND_LIGHT },
  filterRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  dateWrap:    { flex: 1, minWidth: 0 },
  dateLabel:   { fontSize: 11, fontWeight: '600', color: BRAND, marginBottom: 4 },
  dateInput:   { borderWidth: 1.5, borderColor: BRAND_LIGHT, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7, fontSize: 14, color: '#1E293B', backgroundColor: BRAND_MUTED },
  clearBtn:    { padding: 2 },

  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginBottom: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: BRAND_LIGHT },
  ratingLbl: { fontSize: 13, fontWeight: '500', color: '#64748B', flex: 1 },
  ratingVal: { fontSize: 15, fontWeight: '800', color: '#D97706' },
  ratingStars: { fontSize: 13, color: '#D97706' },

  statsBar: { marginHorizontal: 16, marginBottom: 8, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: BRAND_LIGHT, elevation: 1, gap: 8 },
  statRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statVal:  { fontSize: 15, fontWeight: '800', color: BRAND },
  statLbl:  { fontSize: 13, fontWeight: '500', color: '#64748B' },

  list:     { padding: 16, paddingBottom: 48 },

  card:           { backgroundColor: '#fff', borderRadius: 14, padding: 11, marginBottom: 8, borderWidth: 1.5, borderColor: BRAND_LIGHT },
  cardHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIconWrap:   { width: 34, height: 34, borderRadius: 10, backgroundColor: BRAND_MUTED, alignItems: 'center', justifyContent: 'center' },
  cardDate:       { fontSize: 11, color: '#94A3B8' },
  tripLabel:      { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  cardRight:      { alignItems: 'flex-end', gap: 4 },
  revenueText:    { fontSize: 13, fontWeight: '700', color: '#0369A1' },
  cardStars:      { fontSize: 13, fontWeight: '700' },
  odcAmount:      { fontSize: 13, fontWeight: '700' },
  chainBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: BRAND_LIGHT, backgroundColor: BRAND_MUTED },
  chainBtnText:   { fontSize: 12, fontWeight: '600', color: '#2563EB' },

  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#94A3B8', marginTop: 12 },
  emptySub:   { fontSize: 13, color: '#CBD5E1', textAlign: 'center', marginTop: 4 },
  emptyText:  { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 12 },
  errorText:  { fontSize: 13, color: '#DC2626', textAlign: 'center', marginTop: 10 },
  retryBtn:   { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: BRAND, borderRadius: 10 },
  retryText:  { color: '#fff', fontWeight: '700', fontSize: 14 },

  footerLoad:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  loadingText:  { fontSize: 13, color: '#64748B' },
  loadMoreBtn:  { alignSelf: 'center', marginVertical: 12, paddingHorizontal: 28, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: BRAND_LIGHT, backgroundColor: BRAND_MUTED },
  loadMoreText: { fontSize: 14, fontWeight: '600', color: BRAND },
})
