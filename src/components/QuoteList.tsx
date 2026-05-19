import React from 'react'
import { FlatList, View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import type { TripQuote } from '../types'

const BRAND = '#1A2E5E'

interface QuoteListProps {
  quotes:   TripQuote[]
  onSelect: (quote: TripQuote) => void
}

function QuoteItem({ quote, onSelect }: { quote: TripQuote; onSelect: (q: TripQuote) => void }) {
  const { t } = useTranslation()
  const initials = quote.driverName.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase()

  return (
    <View style={styles.card}>
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
          <Text style={styles.driverName}>{quote.driverName}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="star" size={13} color="#F59E0B" />
            <Text style={styles.meta}> {quote.rating.toFixed(1)} · {quote.ratingCount} chuyến</Text>
          </View>
          <Text style={styles.meta}>{quote.vehicleBrand} · {quote.licensePlate}</Text>
        </View>

        {/* Price */}
        <View style={styles.priceBlock}>
          <Text style={styles.price}>{quote.quotedPrice.toLocaleString('vi-VN')}</Text>
          <Text style={styles.priceUnit}>đ</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.selectBtn} onPress={() => onSelect(quote)} activeOpacity={0.85}>
        <Text style={styles.selectText}>{t('trip.selectDriver')}</Text>
        <Ionicons name="arrow-forward" size={16} color="#fff" />
      </TouchableOpacity>
    </View>
  )
}

export default function QuoteList({ quotes, onSelect }: QuoteListProps) {
  return (
    <FlatList
      data={quotes}
      keyExtractor={(item) => item.driverUid}
      renderItem={({ item }) => <QuoteItem quote={item} onSelect={onSelect} />}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
    />
  )
}

const styles = StyleSheet.create({
  list: { paddingVertical: 8, paddingHorizontal: 16 },

  card: {
    backgroundColor: '#fff',
    borderRadius:    14,
    padding:         14,
    marginVertical:  6,
    elevation:       3,
    shadowColor:     BRAND,
    shadowOpacity:   0.08,
    shadowRadius:    8,
    shadowOffset:    { width: 0, height: 2 },
  },
  row:   { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },

  avatarImg:  { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  avatar:     { width: 44, height: 44, borderRadius: 22, backgroundColor: BRAND, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  info:    { flex: 1 },
  driverName: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 3 },
  metaRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  meta:       { fontSize: 12, color: '#64748B' },

  priceBlock: { alignItems: 'flex-end' },
  price:      { fontSize: 22, fontWeight: '800', color: BRAND },
  priceUnit:  { fontSize: 12, color: '#64748B', fontWeight: '600' },

  selectBtn:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: BRAND, borderRadius: 10, paddingVertical: 10 },
  selectText: { color: '#fff', fontSize: 14, fontWeight: '700' },
})
