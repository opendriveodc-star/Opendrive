import React from 'react'
import { FlatList, View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import type { TripQuote } from '../types'

const BRAND = '#1A2E5E'

interface QuoteListProps {
  quotes:      TripQuote[]
  onSelect:    (quote: TripQuote) => void
  onPreview?:  (quote: TripQuote) => void
}

function QuoteItem({ quote, onSelect, onPreview }: {
  quote: TripQuote
  onSelect:   (q: TripQuote) => void
  onPreview?: (q: TripQuote) => void
}) {
  const { t } = useTranslation()
  const initials = quote.driverName.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase()

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPreview?.(quote)} activeOpacity={0.85}>
      <View style={styles.row}>
        {/* Avatar */}
        {quote.avatarUrl ? (
          <Image source={{ uri: quote.avatarUrl }} style={styles.avatarImg} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        )}

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.driverName} numberOfLines={1}>{quote.driverName}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="star" size={12} color="#F59E0B" />
            <Text style={styles.meta}> {quote.rating.toFixed(1)} · {quote.ratingCount} {t('trip.trips')}</Text>
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            {[quote.vehicleBrand, quote.licensePlate, quote.vehicleColor].filter(Boolean).join(' · ')}
          </Text>
        </View>

        {/* Price + Chọn */}
        <View style={styles.rightCol}>
          <Text style={styles.price} numberOfLines={1}>
            {quote.quotedPrice.toLocaleString('vi-VN')}
            <Text style={styles.priceUnit}>đ</Text>
          </Text>
          <TouchableOpacity
            style={styles.selectBtn}
            onPress={() => onSelect(quote)}
            activeOpacity={0.85}
          >
            <Text style={styles.selectText}>Chọn</Text>
            <Ionicons name="arrow-forward" size={13} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  )
}

export default function QuoteList({ quotes, onSelect, onPreview }: QuoteListProps) {
  return (
    <FlatList
      data={quotes}
      keyExtractor={(item) => item.driverUid}
      renderItem={({ item }) => (
        <QuoteItem quote={item} onSelect={onSelect} onPreview={onPreview} />
      )}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
    />
  )
}

const styles = StyleSheet.create({
  list: { paddingVertical: 6, paddingHorizontal: 12 },

  card: {
    backgroundColor: '#fff',
    borderRadius:    14,
    paddingHorizontal: 12,
    paddingVertical:   12,
    marginVertical:  5,
    elevation:       3,
    shadowColor:     BRAND,
    shadowOpacity:   0.08,
    shadowRadius:    8,
    shadowOffset:    { width: 0, height: 2 },
  },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  avatarImg:  { width: 44, height: 44, borderRadius: 22, flexShrink: 0 },
  avatar:     { width: 44, height: 44, borderRadius: 22, backgroundColor: BRAND, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  info:       { flex: 1, gap: 2 },
  driverName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  metaRow:    { flexDirection: 'row', alignItems: 'center' },
  meta:       { fontSize: 12, color: '#64748B' },

  rightCol:   { alignItems: 'center', gap: 6, flexShrink: 0 },
  price:      { fontSize: 20, fontWeight: '800', color: BRAND, textAlign: 'center' },
  priceUnit:  { fontSize: 13, fontWeight: '600', color: BRAND },

  selectBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  selectText: { color: '#fff', fontSize: 13, fontWeight: '700' },
})
