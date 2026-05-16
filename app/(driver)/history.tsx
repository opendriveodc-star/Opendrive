// app/(driver)/history.tsx
// Màn hình lịch sử chuyến tài xế

import React from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { COLORS, STELLAR } from '../../src/constants'
import { formatDate, formatPrice, formatODC, shortenHash } from '../../src/utils/format'

interface TripHistoryItem {
  id:        string
  date:      number    // Unix timestamp ms
  price:     number    // VNĐ
  rating:    number
  odcCharged: number
  txHash:    string
}

// TODO: Lấy data từ Stellar Horizon API
const MOCK_DATA: TripHistoryItem[] = []

function HistoryItem({ item }: { item: TripHistoryItem }) {
  const { t } = useTranslation()

  function openBlockchain() {
    const baseUrl = STELLAR.NETWORK === 'testnet'
      ? 'https://stellar.expert/explorer/testnet/tx'
      : 'https://stellar.expert/explorer/public/tx'
    Linking.openURL(`${baseUrl}/${item.txHash}`)
  }

  return (
    <View style={styles.card}>
      <Text style={styles.date}>{t('history.date', { date: formatDate(item.date) })}</Text>
      <Text style={styles.price}>{t('history.price', { amount: formatPrice(item.price) })}</Text>
      <Text style={styles.rating}>{t('history.rating', { value: item.rating })}</Text>
      <Text style={styles.odc}>{t('history.odc', { amount: formatODC(item.odcCharged) })}</Text>
      <Text style={styles.hash}>
        {t('history.txHash', { hash: shortenHash(item.txHash) })}
      </Text>
      <TouchableOpacity onPress={openBlockchain}>
        <Text style={styles.link}>{t('history.viewOnChain')}</Text>
      </TouchableOpacity>
    </View>
  )
}

export default function HistoryScreen() {
  const { t } = useTranslation()

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('history.title')}</Text>
      {MOCK_DATA.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('history.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={MOCK_DATA}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <HistoryItem item={item} />}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: COLORS.driver.background,
    padding:         16,
  },
  title: {
    fontSize:     22,
    fontWeight:   '700',
    color:        COLORS.driver.textPrimary,
    marginBottom: 16,
  },
  list: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius:    12,
    padding:         16,
    marginBottom:    12,
    elevation:       2,
  },
  date: {
    fontSize:     13,
    color:        '#64748B',
    marginBottom: 4,
  },
  price: {
    fontSize:     16,
    fontWeight:   '700',
    color:        '#0F172A',
    marginBottom: 4,
  },
  rating: {
    fontSize:     14,
    color:        '#F59E0B',
    marginBottom: 2,
  },
  odc: {
    fontSize:     13,
    color:        '#DC2626',
    marginBottom: 4,
  },
  hash: {
    fontSize:     12,
    color:        '#9CA3AF',
    marginBottom: 4,
    fontFamily:   'monospace',
  },
  link: {
    fontSize:   13,
    color:      '#2563EB',
    fontWeight: '600',
  },
  empty: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color:    '#9CA3AF',
  },
})
