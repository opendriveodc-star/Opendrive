// app/(customer)/rating.tsx
// Màn hình đánh giá tài xế sau chuyến

import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { sendMessage } from '../../src/services/webrtc'
import { COLORS } from '../../src/constants'
import type { RatingValue, DCRatingMessage } from '../../src/types'

const STAR_VALUES: RatingValue[] = [1, 2, 3, 4, 5]

export default function RatingScreen() {
  const { t } = useTranslation()
  const { tripId } = useLocalSearchParams<{ tripId: string }>()
  const [selected, setSelected] = useState<RatingValue | null>(null)

  function handleSubmit() {
    if (!selected || !tripId) return
    const msg: DCRatingMessage = { type: 'rating', value: selected }
    sendMessage(tripId, msg)
    router.replace('/(customer)/home')
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('trip.rateDriver')}</Text>
      <Text style={styles.subtitle}>{t('trip.ratePlaceholder')}</Text>

      <View style={styles.stars}>
        {STAR_VALUES.map((v) => (
          <TouchableOpacity
            key={v}
            style={styles.starButton}
            onPress={() => setSelected(v)}
          >
            <Text style={[styles.star, selected !== null && v <= selected && styles.starActive]}>
              ★
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.button, !selected && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={!selected}
      >
        <Text style={styles.buttonText}>{t('common.confirm')}</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: COLORS.customer.background,
    alignItems:      'center',
    justifyContent:  'center',
    padding:         32,
  },
  title: {
    fontSize:     24,
    fontWeight:   '700',
    color:        COLORS.customer.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize:     15,
    color:        COLORS.customer.textSecondary,
    marginBottom: 32,
  },
  stars: {
    flexDirection: 'row',
    marginBottom:  40,
    gap:           8,
  },
  starButton: {
    padding: 4,
  },
  star: {
    fontSize: 48,
    color:    '#D1D5DB',
  },
  starActive: {
    color: '#F59E0B',
  },
  button: {
    backgroundColor: COLORS.customer.primary,
    paddingVertical:   14,
    paddingHorizontal: 48,
    borderRadius:      10,
    width:             '100%',
    alignItems:        'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color:      '#FFFFFF',
    fontSize:   16,
    fontWeight: '700',
  },
})
