// src/components/BlacklistBanner.tsx
// Banner đỏ full-width hiển thị khi tài khoản bị khóa, đếm ngược HH:MM:SS

import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'

interface BlacklistBannerProps {
  lockedUntil: number   // Unix timestamp (ms)
  reason:      string
}

function calcTimeLeft(lockedUntil: number): number {
  return Math.max(0, lockedUntil - Date.now())
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

export default function BlacklistBanner({ lockedUntil, reason }: BlacklistBannerProps) {
  const { t } = useTranslation()
  const [timeLeft, setTimeLeft] = useState<number>(() => calcTimeLeft(lockedUntil))

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(calcTimeLeft(lockedUntil))
    }, 1000)
    return () => clearInterval(interval)
  }, [lockedUntil])

  return (
    <View style={styles.banner}>
      <Text style={styles.title}>{t('lock.title')}</Text>
      <Text style={styles.reason}>{reason}</Text>
      <Text style={styles.countdown}>
        {t('lock.unlockIn', { time: formatMs(timeLeft) })}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#DC2626',
    paddingVertical:   12,
    paddingHorizontal: 16,
    width:             '100%',
  },
  title: {
    color:        '#FFFFFF',
    fontSize:     14,
    fontWeight:   '700',
    marginBottom: 2,
  },
  reason: {
    color:        '#FECACA',
    fontSize:     13,
    marginBottom: 4,
  },
  countdown: {
    color:      '#FFFFFF',
    fontSize:   18,
    fontWeight: '800',
    letterSpacing: 1,
  },
})
