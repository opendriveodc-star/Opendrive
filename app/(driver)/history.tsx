// app/(driver)/history.tsx

import React from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Linking, StatusBar,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { STELLAR } from '../../src/constants'
import { formatDate, formatPrice, formatODC, shortenHash } from '../../src/utils/format'

const BRAND = '#1A2E5E'

interface TripHistoryItem {
  id:         string
  date:       number
  price:      number
  rating:     number
  odcCharged: number
  txHash:     string
}

const MOCK_DATA: TripHistoryItem[] = []

export default function HistoryScreen() {
  const { t } = useTranslation()

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F9FD" />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={BRAND} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>{t('nav.history')}</Text>
        <View style={{ width: 36 }} />
      </View>

      {MOCK_DATA.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="time-outline" size={56} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>{t('history.empty')}</Text>
          <Text style={styles.emptySubtitle}>
            {t('history.emptyHint') ?? 'Các chuyến hoàn thành sẽ hiện ở đây'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={MOCK_DATA}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <TripCard item={item} t={t} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  )
}

function TripCard({ item, t }: { item: TripHistoryItem; t: (k: string, o?: any) => string }) {
  function openBlockchain() {
    const base = STELLAR.NETWORK === 'testnet'
      ? 'https://stellar.expert/explorer/testnet/tx'
      : 'https://stellar.expert/explorer/public/tx'
    Linking.openURL(`${base}/${item.txHash}`)
  }

  const stars = '★'.repeat(item.rating) + '☆'.repeat(5 - item.rating)

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIconWrap}>
          <Ionicons name="navigate-outline" size={18} color={BRAND} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
          <Text style={styles.cardPrice}>{formatPrice(item.price)}đ</Text>
        </View>
        <Text style={styles.cardStars}>{stars}</Text>
      </View>
      <View style={styles.cardFooter}>
        <View style={styles.odcBadge}>
          <Text style={styles.odcBadgeText}>−{formatODC(item.odcCharged)} ODC</Text>
        </View>
        <TouchableOpacity style={styles.chainBtn} onPress={openBlockchain}>
          <Ionicons name="open-outline" size={13} color="#2563EB" />
          <Text style={styles.chainBtnText}>{shortenHash(item.txHash, 4)}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#F7F9FD' },
  topBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: BRAND, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  topTitle:  { fontSize: 17, fontWeight: '700', color: BRAND },
  list:      { padding: 16, paddingBottom: 48 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#94A3B8' },
  emptySubtitle: { fontSize: 13, color: '#CBD5E1', textAlign: 'center' },
  card:      { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, elevation: 3, shadowColor: BRAND, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  cardIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8EDF6', alignItems: 'center', justifyContent: 'center' },
  cardDate:  { fontSize: 12, color: '#94A3B8', marginBottom: 2 },
  cardPrice: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  cardStars: { fontSize: 15, color: '#F59E0B' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  odcBadge:  { backgroundColor: '#FEF2F2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  odcBadgeText: { fontSize: 12, fontWeight: '600', color: '#DC2626' },
  chainBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chainBtnText: { fontSize: 12, color: '#2563EB', fontWeight: '600' },
})
