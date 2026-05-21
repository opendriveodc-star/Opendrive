// app/(driver)/history.tsx

import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Linking, StatusBar, ActivityIndicator,
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
  cancelled: boolean
}

function decodeMemo(memoBase64: string): { rating: number } | null {
  try {
    const bytes = Uint8Array.from(atob(memoBase64), c => c.charCodeAt(0))
    if (bytes.length < 27) return null
    return { rating: bytes[26] }
  } catch {
    return null
  }
}

function starLabel(rating: number): string {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating)
}

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

export default function HistoryScreen() {
  const { t } = useTranslation()
  const [walletAddress, setWalletAddress] = useState('')
  const [trips,   setTrips]   = useState<TripRecord[]>([])
  const [cursor,  setCursor]  = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    getDriverInfo().then(info => {
      if (info?.stellarWallet) setWalletAddress(info.stellarWallet)
    })
  }, [])

  const fetchPage = useCallback(async (address: string, pagingToken?: string) => {
    if (!address) return
    setLoading(true)
    setError(null)
    try {
      const url = `${STELLAR.HORIZON_URL}/accounts/${address}/transactions?limit=${PAGE_SIZE}&order=desc`
        + (pagingToken ? `&cursor=${pagingToken}` : '')
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const records: TripRecord[] = (json._embedded?.records ?? [])
        .filter((r: any) => r.memo_type === 'hash')
        .map((r: any) => {
          const decoded = decodeMemo(r.memo)
          const rating = decoded?.rating ?? null
          return {
            id:        r.id,
            hash:      r.hash,
            createdAt: r.created_at,
            rating,
            cancelled: rating === 1,
          }
        })
      setTrips(prev => pagingToken ? [...prev, ...records] : records)
      const last = records[records.length - 1]
      setCursor(last ? last.id : null)
      setHasMore(records.length === PAGE_SIZE)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (walletAddress) fetchPage(walletAddress)
  }, [walletAddress, fetchPage])

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
          <Ionicons
            name={item.cancelled ? 'close-circle-outline' : 'navigate-outline'}
            size={18}
            color={item.cancelled ? '#DC2626' : BRAND}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
          {item.cancelled ? (
            <Text style={styles.cancelledLabel}>Hủy chuyến</Text>
          ) : (
            <Text style={styles.tripLabel}>Chuyến #{trips.length - index}</Text>
          )}
        </View>
        {item.rating !== null && !item.cancelled && (
          <Text style={[styles.cardStars, { color: ratingColor(item.rating) }]}>
            {starLabel(item.rating)}
          </Text>
        )}
      </View>
      <TouchableOpacity style={styles.chainBtn} onPress={() => openStellar(item.hash)} activeOpacity={0.75}>
        <Ionicons name="open-outline" size={13} color="#2563EB" />
        <Text style={styles.chainBtnText}>
          {item.hash.slice(0, 8)}...{item.hash.slice(-8)}
        </Text>
      </TouchableOpacity>
    </View>
  )

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F9FD" />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={BRAND} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>{t('nav.history')}</Text>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => walletAddress && fetchPage(walletAddress)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="refresh-outline" size={20} color={BRAND} />
        </TouchableOpacity>
      </View>

      {trips.length > 0 && (
        <View style={styles.statsBar}>
          <Ionicons name="cube-outline" size={14} color={BRAND} />
          <Text style={styles.statsText}>{trips.length}{hasMore ? '+' : ''} chuyến</Text>
        </View>
      )}

      {error ? (
        <View style={styles.center}>
          <Ionicons name="warning-outline" size={40} color="#DC2626" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => walletAddress && fetchPage(walletAddress)}>
            <Text style={styles.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : !walletAddress && !loading ? (
        <View style={styles.center}>
          <Ionicons name="wallet-outline" size={40} color="#94A3B8" />
          <Text style={styles.emptyText}>Chưa có ví Stellar</Text>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            loading ? null : (
              <View style={styles.center}>
                <Ionicons name="time-outline" size={56} color="#CBD5E1" />
                <Text style={styles.emptyTitle}>{t('history.empty')}</Text>
                <Text style={styles.emptySubtitle}>Các chuyến hoàn thành sẽ hiện ở đây</Text>
              </View>
            )
          }
          ListFooterComponent={
            loading ? (
              <View style={styles.footerLoad}>
                <ActivityIndicator size="small" color={BRAND} />
                <Text style={styles.loadingText}>Đang tải...</Text>
              </View>
            ) : hasMore && trips.length > 0 ? (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={() => walletAddress && cursor && fetchPage(walletAddress, cursor)}
                activeOpacity={0.8}
              >
                <Text style={styles.loadMoreText}>Tải thêm</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#F7F9FD' },
  topBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: BRAND, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  topTitle:  { fontSize: 17, fontWeight: '700', color: BRAND },
  refreshBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: BRAND_LIGHT, alignItems: 'center', justifyContent: 'center' },

  statsBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: BRAND_MUTED, borderBottomWidth: 1, borderBottomColor: BRAND_LIGHT },
  statsText: { fontSize: 12, color: BRAND, fontWeight: '600' },

  list:      { padding: 16, paddingBottom: 48 },

  card:      { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: BRAND_LIGHT },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  cardIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: BRAND_MUTED, alignItems: 'center', justifyContent: 'center' },
  cardDate:  { fontSize: 12, color: '#94A3B8', marginBottom: 2 },
  tripLabel: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  cancelledLabel: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
  cardStars: { fontSize: 14, fontWeight: '700' },

  chainBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: BRAND_LIGHT, backgroundColor: BRAND_MUTED },
  chainBtnText: { fontSize: 12, fontWeight: '600', color: '#2563EB' },

  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#94A3B8', marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: '#CBD5E1', textAlign: 'center', marginTop: 4 },
  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 12 },
  errorText: { fontSize: 13, color: '#DC2626', textAlign: 'center', marginTop: 10 },
  retryBtn:  { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: BRAND, borderRadius: 10 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  footerLoad:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  loadingText:  { fontSize: 13, color: '#64748B' },
  loadMoreBtn:  { alignSelf: 'center', marginVertical: 12, paddingHorizontal: 28, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: BRAND_LIGHT, backgroundColor: BRAND_MUTED },
  loadMoreText: { fontSize: 14, fontWeight: '600', color: BRAND },
})
