// app/(customer)/rating.tsx

import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { rtdb } from '../../src/services/firebase'
import type { RatingValue } from '../../src/types'

const BRAND      = '#1A2E5E'
const STAR_HINTS = ['Rất tệ', 'Chưa hài lòng', 'Bình thường', 'Tốt lắm!', 'Tuyệt vời!']
const STAR_VALUES: RatingValue[] = [1, 2, 3, 4, 5]
const HISTORY_KEY = 'customer_trip_history'

export default function RatingScreen() {
  const { t } = useTranslation()
  const {
    tripId, pickupAddress, destAddress, estimatedKm,
    vehicleType, driverName, vehicleBrand, licensePlate,
  } = useLocalSearchParams<{
    tripId: string; pickupAddress?: string; destAddress?: string
    estimatedKm?: string; vehicleType?: string
    driverName?: string; vehicleBrand?: string; licensePlate?: string
  }>()
  const [selected, setSelected] = useState<RatingValue | null>(null)

  async function saveHistory(rating: number | null) {
    const entry = {
      tripId:        tripId ?? '',
      pickupAddress: pickupAddress ?? '',
      destAddress:   destAddress ?? '',
      driverName:    driverName ?? '',
      vehicleBrand:  vehicleBrand ?? '',
      licensePlate:  licensePlate ?? '',
      estimatedKm:   parseFloat(estimatedKm ?? '0'),
      vehicleType:   vehicleType ?? '',
      rating,
      completedAt:   Date.now(),
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

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <Ionicons name="checkmark-circle" size={64} color={BRAND} />
        </View>

        <Text style={styles.title}>{t('trip.completed')}</Text>
        <Text style={styles.subtitle}>{t('trip.rateDriver')}</Text>

        <View style={styles.starsRow}>
          {STAR_VALUES.map((v) => {
            const filled = selected !== null && v <= selected
            return (
              <TouchableOpacity key={v} onPress={() => setSelected(v)} activeOpacity={0.7} style={styles.starBtn}>
                <Ionicons
                  name={filled ? 'star' : 'star-outline'}
                  size={48}
                  color={filled ? '#F59E0B' : '#CBD5E1'}
                />
              </TouchableOpacity>
            )
          })}
        </View>

        <Text style={styles.hintText}>
          {selected ? STAR_HINTS[selected - 1] : t('trip.ratePlaceholder')}
        </Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitBtn, !selected && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!selected}
          activeOpacity={0.85}
        >
          <Text style={styles.submitText}>{t('common.confirm')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipBtn}
          onPress={handleSkip}
        >
          <Text style={styles.skipText}>{t('common.skip')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, gap: 12 },

  iconWrap: { marginBottom: 4 },
  title:    { fontSize: 24, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#64748B', textAlign: 'center' },

  starsRow: { flexDirection: 'row', gap: 4, marginTop: 8 },
  starBtn:  { padding: 4 },

  hintText: { fontSize: 16, fontWeight: '600', color: BRAND, minHeight: 24 },

  footer:            { padding: 24, paddingBottom: 28, gap: 10 },
  submitBtn:         { height: 56, backgroundColor: BRAND, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.35 },
  submitText:        { color: '#fff', fontSize: 17, fontWeight: '700' },
  skipBtn:           { alignItems: 'center', paddingVertical: 8 },
  skipText:          { fontSize: 15, color: '#94A3B8' },
})
