import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'

const BRAND       = '#1A2E5E'
const HISTORY_KEY = 'customer_trip_history'

interface TripEntry {
  tripId:        string
  pickupAddress: string
  destAddress:   string
  driverName:    string
  vehicleBrand:  string
  licensePlate:  string
  estimatedKm:   number
  vehicleType:   string
  rating:        number | null
  completedAt:   number
}

function StarRow({ rating }: { rating: number | null }) {
  if (rating === null) return <Text style={s.noRating}>Chưa đánh giá</Text>
  return (
    <View style={s.starsRow}>
      {[1, 2, 3, 4, 5].map(v => (
        <Ionicons
          key={v}
          name={v <= rating ? 'star' : 'star-outline'}
          size={14}
          color={v <= rating ? '#F59E0B' : '#CBD5E1'}
        />
      ))}
    </View>
  )
}

function TripCard({ item, index }: { item: TripEntry; index: number }) {
  const date = new Date(item.completedAt)
  const dateStr = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}  ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`

  return (
    <View style={s.card}>
      {/* Header row: số thứ tự + ngày giờ */}
      <View style={s.cardHeader}>
        <View style={s.indexBadge}>
          <Text style={s.indexText}>#{index + 1}</Text>
        </View>
        <Text style={s.dateText}>{dateStr}</Text>
        <StarRow rating={item.rating} />
      </View>

      {/* Route */}
      <View style={s.routeBlock}>
        <View style={s.routeRow}>
          <View style={[s.routeDot, { backgroundColor: BRAND }]} />
          <Text style={s.routeText} numberOfLines={2}>{item.pickupAddress || '—'}</Text>
        </View>
        <View style={s.routeLine} />
        <View style={s.routeRow}>
          <View style={[s.routeDot, { backgroundColor: '#EA580C' }]} />
          <Text style={s.routeText} numberOfLines={2}>{item.destAddress || '—'}</Text>
        </View>
      </View>

      {/* Driver + km info */}
      <View style={s.metaRow}>
        {item.driverName ? (
          <View style={s.metaChip}>
            <Ionicons name="person-outline" size={13} color="#64748B" />
            <Text style={s.metaText}>{item.driverName}</Text>
          </View>
        ) : null}
        {item.vehicleBrand ? (
          <View style={s.metaChip}>
            <Ionicons name="car-outline" size={13} color="#64748B" />
            <Text style={s.metaText}>{item.vehicleBrand} · {item.licensePlate}</Text>
          </View>
        ) : null}
        {item.estimatedKm > 0 ? (
          <View style={s.metaChip}>
            <Ionicons name="navigate-outline" size={13} color="#64748B" />
            <Text style={s.metaText}>{item.estimatedKm} km</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

export default function CustomerHistoryScreen() {
  const { t } = useTranslation()
  const [trips, setTrips] = useState<TripEntry[]>([])

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(HISTORY_KEY)
      if (raw) setTrips(JSON.parse(raw))
    } catch {}
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={22} color={BRAND} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('history.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        data={trips}
        keyExtractor={(item, i) => item.tripId || String(i)}
        renderItem={({ item, index }) => <TripCard item={item} index={index} />}
        contentContainerStyle={trips.length === 0 ? s.emptyContainer : s.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Ionicons name="car-outline" size={52} color="#CBD5E1" />
            <Text style={s.emptyTitle}>{t('history.empty')}</Text>
            <Text style={s.emptySub}>{t('history.emptySub')}</Text>
          </View>
        }
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
    elevation: 2, shadowColor: BRAND, shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#0F172A' },

  listContent:   { paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  emptyWrap:  { alignItems: 'center', gap: 10, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#94A3B8', textAlign: 'center' },
  emptySub:   { fontSize: 13, color: '#CBD5E1', textAlign: 'center', lineHeight: 20 },

  card: {
    backgroundColor: '#fff', borderRadius: 14,
    padding: 14,
    elevation: 2,
    shadowColor: BRAND, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  indexBadge: { backgroundColor: '#E8EDF6', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  indexText:  { fontSize: 12, fontWeight: '700', color: BRAND },
  dateText:   { flex: 1, fontSize: 12, color: '#64748B' },
  starsRow:   { flexDirection: 'row', gap: 1 },
  noRating:   { fontSize: 12, color: '#94A3B8', fontStyle: 'italic' },

  routeBlock: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginBottom: 10 },
  routeRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  routeDot:   { width: 9, height: 9, borderRadius: 5, marginTop: 4, flexShrink: 0 },
  routeText:  { flex: 1, fontSize: 13, color: '#0F172A', lineHeight: 18 },
  routeLine:  { width: 2, height: 8, backgroundColor: '#E2E8F0', marginLeft: 3.5, marginVertical: 2 },

  metaRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  metaText: { fontSize: 12, color: '#64748B' },
})
