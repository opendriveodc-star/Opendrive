import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { sendMessage } from '../../src/services/webrtc'
import type { RatingValue, DCRatingMessage } from '../../src/types'

const BRAND      = '#1A2E5E'
const STAR_HINTS = ['Rất tệ', 'Chưa hài lòng', 'Bình thường', 'Tốt lắm!', 'Tuyệt vời!']
const STAR_VALUES: RatingValue[] = [1, 2, 3, 4, 5]

export default function RatingScreen() {
  const { t }    = useTranslation()
  const { tripId } = useLocalSearchParams<{ tripId: string }>()
  const [selected, setSelected] = useState<RatingValue | null>(null)

  function handleSubmit() {
    if (!selected || !tripId) return
    const msg: DCRatingMessage = { type: 'rating', value: selected }
    sendMessage(tripId, msg)
    router.replace('/(customer)/home')
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.center}>
        {/* Icon */}
        <View style={styles.iconWrap}>
          <Ionicons name="checkmark-circle" size={64} color={BRAND} />
        </View>

        <Text style={styles.title}>{t('trip.completed')}</Text>
        <Text style={styles.subtitle}>{t('trip.rateDriver')}</Text>

        {/* Stars */}
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

        {/* Hint text */}
        <Text style={styles.hintText}>
          {selected ? STAR_HINTS[selected - 1] : t('trip.ratePlaceholder')}
        </Text>
      </View>

      {/* Footer buttons */}
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
          onPress={() => router.replace('/(customer)/home')}
        >
          <Text style={styles.skipText}>Bỏ qua</Text>
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
