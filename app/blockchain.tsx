// app/blockchain.tsx
// Blockchain explorer – hiển thị lịch sử giao dịch ghi chuyến từ ví Transaction

import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  StatusBar, ActivityIndicator, Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { STELLAR } from '../src/constants'

const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'
const BRAND_MUTED = '#F0F4FB'

const PAGE_SIZE = 20

interface TxRecord {
  id:         string
  hash:       string
  createdAt:  string
  memo:       string | null
  rating:     number | null
}

function decodeMemo(memoHex: string): { rating: number } | null {
  try {
    // memo là base64 từ Horizon
    const bytes = Uint8Array.from(atob(memoHex), c => c.charCodeAt(0))
    if (bytes.length < 27) return null
    return { rating: bytes[26] }
  } catch {
    return null
  }
}

function starLabel(rating: number | null): string {
  if (!rating) return ''
  return '★'.repeat(rating) + '☆'.repeat(5 - rating)
}

function ratingColor(r: number | null) {
  if (!r) return '#94A3B8'
  if (r >= 4) return '#16A34A'
  if (r === 3) return '#D97706'
  return '#DC2626'
}

export default function BlockchainScreen() {
  const { t } = useTranslation()
  const [txs,     setTxs]     = useState<TxRecord[]>([])
  const [cursor,  setCursor]  = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const address = STELLAR.TRANSACTION_ADDRESS

  const fetchPage = useCallback(async (paging_token?: string) => {
    if (!address) { setError(t('blockchain.noAddress')); return }
    setLoading(true)
    setError(null)
    try {
      const url = `${STELLAR.HORIZON_URL}/accounts/${address}/transactions?limit=${PAGE_SIZE}&order=desc`
        + (paging_token ? `&cursor=${paging_token}` : '')
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const records: TxRecord[] = (json._embedded?.records ?? []).map((r: any) => {
        const memoDecoded = r.memo_type === 'hash' ? decodeMemo(r.memo) : null
        return {
          id:        r.id,
          hash:      r.hash,
          createdAt: r.created_at,
          memo:      r.memo ?? null,
          rating:    memoDecoded?.rating ?? null,
        }
      })
      setTxs(prev => paging_token ? [...prev, ...records] : records)
      const last = records[records.length - 1]
      setCursor(last ? last.id : null)
      setHasMore(records.length === PAGE_SIZE)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [address, t])

  useEffect(() => { fetchPage() }, [fetchPage])

  function openStellar(hash: string) {
    const base = STELLAR.NETWORK === 'mainnet'
      ? 'https://stellar.expert/explorer/public/tx/'
      : 'https://stellar.expert/explorer/testnet/tx/'
    Linking.openURL(base + hash)
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  }

  function shortHash(hash: string) {
    return hash.slice(0, 8) + '...' + hash.slice(-8)
  }

  const renderItem = ({ item, index }: { item: TxRecord; index: number }) => (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View style={s.indexBadge}>
          <Text style={s.indexText}>#{txs.length - index}</Text>
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

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={BRAND} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>{t('blockchain.title')}</Text>
          <Text style={s.headerSub}>{t('blockchain.subtitle')}</Text>
        </View>
        <TouchableOpacity style={s.refreshBtn} onPress={() => fetchPage()} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={20} color={BRAND} />
        </TouchableOpacity>
      </View>

      {/* Stats bar */}
      {txs.length > 0 && (
        <View style={s.statsBar}>
          <Ionicons name="cube-outline" size={14} color={BRAND} />
          <Text style={s.statsText}>{txs.length}{hasMore ? '+' : ''} {t('blockchain.txHash')}</Text>
        </View>
      )}

      {error ? (
        <View style={s.center}>
          <Ionicons name="warning-outline" size={40} color="#DC2626" />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => fetchPage()}>
            <Text style={s.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : !address ? (
        <View style={s.center}>
          <Ionicons name="wallet-outline" size={40} color="#94A3B8" />
          <Text style={s.emptyText}>{t('blockchain.noAddress')}</Text>
        </View>
      ) : (
        <FlatList
          data={txs}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            loading ? null : (
              <View style={s.center}>
                <Ionicons name="receipt-outline" size={40} color="#94A3B8" />
                <Text style={s.emptyText}>{t('blockchain.empty')}</Text>
              </View>
            )
          }
          ListFooterComponent={
            loading ? (
              <View style={s.footerLoad}>
                <ActivityIndicator size="small" color={BRAND} />
                <Text style={s.loadingText}>{t('blockchain.loading')}</Text>
              </View>
            ) : hasMore && txs.length > 0 ? (
              <TouchableOpacity style={s.loadMoreBtn} onPress={() => fetchPage(cursor ?? undefined)} activeOpacity={0.8}>
                <Text style={s.loadMoreText}>{t('blockchain.loadMore')}</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#fff' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BRAND_LIGHT },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#1A2E5E', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: 16, fontWeight: '700', color: BRAND },
  headerSub:    { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  refreshBtn:   { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: BRAND_LIGHT, alignItems: 'center', justifyContent: 'center' },

  statsBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: BRAND_MUTED, borderBottomWidth: 1, borderBottomColor: BRAND_LIGHT },
  statsText: { fontSize: 12, color: BRAND, fontWeight: '600' },

  list: { padding: 16, paddingBottom: 40 },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: BRAND_LIGHT },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  indexBadge: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: BRAND_MUTED, borderRadius: 6 },
  indexText:  { fontSize: 11, fontWeight: '700', color: BRAND },
  dateText:   { flex: 1, fontSize: 12, color: '#64748B' },
  ratingText: { fontSize: 13, fontWeight: '700' },
  hashText:   { fontSize: 12, color: '#94A3B8', fontFamily: 'monospace', marginBottom: 10 },

  viewBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: BRAND_LIGHT, backgroundColor: BRAND_MUTED },
  viewBtnText: { fontSize: 12, fontWeight: '600', color: BRAND },

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
