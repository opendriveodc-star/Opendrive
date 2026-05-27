// src/components/BlacklistBanner.tsx
// Banner inline khi tài khoản bị khóa (dùng trong các màn hình khác, không phải lock-screen)

import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'

const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'
const BRAND_MUTED = '#F0F4FB'

interface BlacklistBannerProps {
  lockedUntil: number   // Unix timestamp (ms)
  reason:      string
}

function calcTimeLeft(lockedUntil: number): number {
  return Math.max(0, lockedUntil - Date.now())
}

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}

export default function BlacklistBanner({ lockedUntil, reason }: BlacklistBannerProps) {
  const { t } = useTranslation()
  const [timeLeft, setTimeLeft] = useState(() => calcTimeLeft(lockedUntil))

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(calcTimeLeft(lockedUntil)), 1000)
    return () => clearInterval(id)
  }, [lockedUntil])

  return (
    <View style={s.banner}>
      <View style={s.row}>
        <View style={s.iconWrap}>
          <Ionicons name="lock-closed" size={16} color={BRAND} />
        </View>
        <View style={s.texts}>
          <Text style={s.title}>{t('lock.title')}</Text>
          <Text style={s.reason}>{t(`lock.reason.${reason}`, { defaultValue: reason })}</Text>
        </View>
      </View>
      <View style={s.countRow}>
        <Ionicons name="time-outline" size={13} color="#64748B" />
        <Text style={s.countdown}>
          {t('lock.unlockIn', { time: formatMs(timeLeft) })}
        </Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  banner: {
    backgroundColor: BRAND_MUTED,
    borderBottomWidth: 1, borderBottomColor: BRAND_LIGHT,
    paddingVertical: 14, paddingHorizontal: 16,
  },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  iconWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: BRAND_LIGHT,
    alignItems: 'center', justifyContent: 'center',
  },
  texts:   { flex: 1 },
  title:   { fontSize: 13, fontWeight: '700', color: BRAND, marginBottom: 2 },
  reason:  { fontSize: 12, color: '#64748B' },
  countRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  countdown: { fontSize: 14, fontWeight: '800', color: BRAND, letterSpacing: 0.5 },
})
