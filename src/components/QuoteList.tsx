// src/components/QuoteList.tsx
// FlatList hiển thị danh sách TripQuote từ tài xế

import React from 'react'
import {
  FlatList,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TripQuote } from '../types'

interface QuoteListProps {
  quotes:   TripQuote[]
  onSelect: (quote: TripQuote) => void
}

function QuoteItem({
  quote,
  onSelect,
}: {
  quote:    TripQuote
  onSelect: (quote: TripQuote) => void
}) {
  const { t } = useTranslation()

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.driverName}>{quote.driverName}</Text>
          <Text style={styles.meta}>
            ⭐ {quote.rating.toFixed(1)} · {quote.ratingCount} {t('trip.selectDriver')}
          </Text>
          <Text style={styles.meta}>
            {quote.vehicleBrand} · {quote.licensePlate}
          </Text>
        </View>
        <View style={styles.priceBlock}>
          <Text style={styles.price}>
            {quote.quotedPrice.toLocaleString('vi-VN')}đ
          </Text>
        </View>
      </View>
      <TouchableOpacity style={styles.button} onPress={() => onSelect(quote)}>
        <Text style={styles.buttonText}>{t('trip.selectDriver')}</Text>
      </TouchableOpacity>
    </View>
  )
}

export default function QuoteList({ quotes, onSelect }: QuoteListProps) {
  return (
    <FlatList
      data={quotes}
      keyExtractor={(item) => item.driverUid}
      renderItem={({ item }) => (
        <QuoteItem quote={item} onSelect={onSelect} />
      )}
      contentContainerStyle={styles.list}
    />
  )
}

const styles = StyleSheet.create({
  list: {
    paddingVertical: 8,
  },
  card: {
    backgroundColor:  '#FFFFFF',
    borderRadius:     12,
    padding:          16,
    marginHorizontal: 16,
    marginVertical:   6,
    shadowColor:      '#000',
    shadowOpacity:    0.08,
    shadowRadius:     4,
    elevation:        2,
  },
  row: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   12,
  },
  info: {
    flex: 1,
  },
  driverName: {
    fontSize:     16,
    fontWeight:   '700',
    color:        '#0F172A',
    marginBottom: 4,
  },
  meta: {
    fontSize:  13,
    color:     '#64748B',
    marginTop: 2,
  },
  priceBlock: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  price: {
    fontSize:   22,
    fontWeight: '800',
    color:      '#15803D',
  },
  button: {
    backgroundColor: '#1A56DB',
    paddingVertical: 10,
    borderRadius:    8,
    alignItems:      'center',
  },
  buttonText: {
    color:      '#FFFFFF',
    fontSize:   15,
    fontWeight: '600',
  },
})
