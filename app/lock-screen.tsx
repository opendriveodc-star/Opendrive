// app/lock-screen.tsx
// Màn hình khóa tài khoản – đếm ngược đến khi hết hạn

import React, { useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import BlacklistBanner from '../src/components/BlacklistBanner'
import { useCountdown } from '../src/hooks/useCountdown'
import { COLORS } from '../src/constants'

export default function LockScreen() {
  const { t } = useTranslation()
  const { lockedUntil, reason } = useLocalSearchParams<{
    lockedUntil: string
    reason:      string
  }>()

  const targetTimestamp = parseInt(lockedUntil ?? '0', 10)
  const { expired } = useCountdown(targetTimestamp)

  // Tự động chuyển về home khi hết giờ
  useEffect(() => {
    if (expired) {
      router.replace('/')
    }
  }, [expired])

  return (
    <View style={styles.container}>
      <BlacklistBanner
        lockedUntil={targetTimestamp}
        reason={reason ?? t('lock.reason.cancelTrip')}
      />
      <View style={styles.body}>
        <Text style={styles.icon}>🔒</Text>
        <Text style={styles.title}>{t('lock.title')}</Text>
        <Text style={styles.reason}>{reason ?? t('lock.reason.cancelTrip')}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: '#FEF2F2',
  },
  body: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    padding:        24,
  },
  icon: {
    fontSize:     64,
    marginBottom: 16,
  },
  title: {
    fontSize:     22,
    fontWeight:   '700',
    color:        COLORS.driver.danger,
    marginBottom: 12,
    textAlign:    'center',
  },
  reason: {
    fontSize:  15,
    color:     '#374151',
    textAlign: 'center',
    lineHeight: 22,
  },
})
