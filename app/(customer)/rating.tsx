// app/(customer)/rating.tsx

import React, { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { rtdb } from '../../src/services/firebase'
import type { RatingValue } from '../../src/types'

const BRAND       = '#1A2E5E'
const GREEN       = '#16A34A'
const GREEN_LIGHT = '#F0FDF4'
const HISTORY_KEY = 'customer_trip_history'

const STAR_HINTS: Record<number, string> = {
  1: 'Rất tệ',
  2: 'Chưa hài lòng',
  3: 'Bình thường',
  4: 'Tốt lắm!',
  5: 'Tuyệt vời! ✨',
}

export default function RatingScreen() {
  const { t } = useTranslation()
  const {
    tripId, pickupAddress, destAddress,
    driverName, vehicleBrand, licensePlate,
    tripPrice, pickedUpAt,
  } = useLocalSearchParams<{
    tripId: string; pickupAddress?: string; destAddress?: string
    driverName?: string; vehicleBrand?: string; licensePlate?: string
    tripPrice?: string; pickedUpAt?: string
  }>()

  const [selected, setSelected] = useState<RatingValue | null>(null)
  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 1100, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])

  async function saveHistory(rating: number | null) {
    const entry = {
      tripId:        tripId ?? '',
      pickupAddress: pickupAddress ?? '',
      destAddress:   destAddress ?? '',
      driverName:    driverName ?? '',
      vehicleBrand:  vehicleBrand ?? '',
      licensePlate:  licensePlate ?? '',
      tripPrice:     parseInt(tripPrice ?? '0'),
      rating,
      completedAt: Date.now(),
    }
    try {
      const raw  = await AsyncStorage.getItem(HISTORY_KEY)
      const list = raw ? JSON.parse(raw) : []
      list.unshift(entry)
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 50)))
    } catch {}
  }

  async function handleSubmit() {
    if (!selected || !tripId) return
    await rtdb.set(`trips/${tripId}/rating`, selected).catch(() => {})
    await saveHistory(selected)
    router.replace('/(customer)/home')
  }

  async function handleSkip() {
    await saveHistory(null)
    router.replace('/(customer)/home')
  }

  const tripIdShort = (tripId ?? '').slice(0, 8).toUpperCase()
  const price = parseInt(tripPrice ?? '0')
  const priceFormatted = price > 0 ? price.toLocaleString('vi-VN') + ' đ' : ''

  const pickedUpTs  = parseInt(pickedUpAt ?? '0')
  const durationMin = pickedUpTs > 0 ? Math.floor((Date.now() - pickedUpTs) / 60000) : 0
  const durationText = durationMin > 0 ? `${durationMin} phút` : ''

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.root} showsVerticalScrollIndicator={false}>

        {/* Icon section */}
        <View style={s.iconSection}>
          <Animated.View style={[s.glow, { transform: [{ scale: pulse }] }]} />
          <View style={s.iconCircle}>
            <Ionicons name="checkmark" size={42} color="#fff" />
          </View>
        </View>

        <Text style={s.title}>Chuyến hoàn thành!</Text>
        <Text style={s.subtitle}>{t('trip.rateDriver')}</Text>

        {/* Trip info card */}
        <View style={s.card}>
          <Text style={s.cardHeader}>CHI TIẾT CHUYẾN ĐI</Text>

          <CardRow icon="pricetag-outline"  label="Mã chuyến"  value={`#${tripIdShort}`} />
          {!!durationText && (
            <>
              <View style={s.divRow} />
              <CardRow icon="time-outline"      label="Thời gian"  value={durationText} />
            </>
          )}
          {!!pickupAddress && (
            <>
              <View style={s.divRow} />
              <CardRow icon="location-outline"  label="Điểm đón"   value={pickupAddress} />
            </>
          )}
          {!!destAddress && (
            <>
              <View style={s.divRow} />
              <CardRow icon="flag-outline"      label="Điểm đến"   value={destAddress} />
            </>
          )}
          {!!priceFormatted && (
            <>
              <View style={s.divRow} />
              <CardRow icon="cash-outline"      label="Giá tiền"   value={priceFormatted} highlight />
            </>
          )}
        </View>

        {/* Rating */}
        <Text style={s.ratingLabel}>{t('trip.rateDriver')}</Text>
        <View style={s.starsRow}>
          {([1, 2, 3, 4, 5] as RatingValue[]).map(v => (
            <TouchableOpacity key={v} onPress={() => setSelected(v)} activeOpacity={0.7} style={s.starBtn}>
              <Ionicons
                name={selected !== null && v <= selected ? 'star' : 'star-outline'}
                size={46}
                color={selected !== null && v <= selected ? '#F59E0B' : '#CBD5E1'}
              />
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.hintText}>
          {selected ? STAR_HINTS[selected] : t('trip.ratePlaceholder')}
        </Text>

      </ScrollView>

      {/* Footer */}
      <View style={s.footer}>
        <TouchableOpacity
          style={[s.submitBtn, !selected && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!selected}
          activeOpacity={0.85}
        >
          <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
          <Text style={s.submitText}>{t('common.confirm')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.skipBtn} onPress={handleSkip} activeOpacity={0.6}>
          <Text style={s.skipText}>{t('common.skip')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

function CardRow({
  icon, label, value, highlight,
}: { icon: string; label: string; value: string; highlight?: boolean }) {
  return (
    <View style={s.cardRow}>
      <View style={s.cardRowLeft}>
        <Ionicons name={icon as any} size={13} color="rgba(255,255,255,0.5)" />
        <Text style={s.cardRowLabel}>{label}</Text>
      </View>
      <Text style={[s.cardRowValue, highlight && s.cardRowHighlight]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  root: { paddingHorizontal: 28, paddingTop: 36, paddingBottom: 16 },

  // Icon
  iconSection: { alignSelf: 'center', marginBottom: 24 },
  glow: {
    position: 'absolute', alignSelf: 'center',
    width: 116, height: 116, borderRadius: 58,
    backgroundColor: GREEN_LIGHT,
    top: -14, left: -14,
  },
  iconCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28, shadowRadius: 16, elevation: 10,
  },

  title:    { fontSize: 22, fontWeight: '800', color: BRAND, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginBottom: 24 },

  // Card
  card: {
    backgroundColor: BRAND, borderRadius: 22,
    paddingVertical: 20, paddingHorizontal: 18,
    marginBottom: 28,
    shadowColor: BRAND, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22, shadowRadius: 20, elevation: 8,
  },
  cardHeader: {
    fontSize: 10, color: 'rgba(255,255,255,0.5)',
    fontWeight: '700', letterSpacing: 1.5, marginBottom: 16,
  },
  divRow:       { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 10 },
  cardRow:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  cardRowLeft:  { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 0.42 },
  cardRowLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  cardRowValue: { fontSize: 13, color: '#fff', fontWeight: '600', flex: 0.58, textAlign: 'right' },
  cardRowHighlight: { fontSize: 16, fontWeight: '800', color: '#FCD34D' },

  // Rating
  ratingLabel: { fontSize: 14, fontWeight: '700', color: BRAND, textAlign: 'center', marginBottom: 12 },
  starsRow:    { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 10 },
  starBtn:     { padding: 2 },
  hintText:    { fontSize: 16, fontWeight: '600', color: BRAND, textAlign: 'center', minHeight: 24, marginBottom: 8 },

  // Footer
  footer:            { paddingHorizontal: 28, paddingBottom: 24, gap: 10 },
  submitBtn:         { height: 56, backgroundColor: BRAND, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitBtnDisabled: { opacity: 0.35 },
  submitText:        { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipBtn:           { alignItems: 'center', paddingVertical: 8 },
  skipText:          { fontSize: 14, color: '#94A3B8' },
})
