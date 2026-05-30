// app/lock-screen.tsx
import React, { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useCountdown } from '../src/hooks/useCountdown'
import { signOutAndClearRole } from '../src/services/firebase'
import * as SecureStore from 'expo-secure-store'
import { SecureStoreKey } from '../src/types'

const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'
const BRAND_MUTED = '#F0F4FB'

function splitTime(ms: number) {
  const total = Math.floor(Math.max(0, ms) / 1000)
  return {
    h:   String(Math.floor(total / 3600)).padStart(2, '0'),
    m:   String(Math.floor((total % 3600) / 60)).padStart(2, '0'),
    sec: String(total % 60).padStart(2, '0'),
  }
}

function TimeBox({ value, unit }: { value: string; unit: string }) {
  return (
    <View style={s.timeBox}>
      <Text style={s.timeNum}>{value}</Text>
      <Text style={s.timeUnit}>{unit}</Text>
    </View>
  )
}

export default function LockScreen() {
  const { t } = useTranslation()
  const { lockedUntil, reason } = useLocalSearchParams<{
    lockedUntil: string
    reason:      string
  }>()

  const targetTimestamp = parseInt(lockedUntil ?? '0', 10)
  const { timeLeft, expired } = useCountdown(targetTimestamp)

  const pulse = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 1000, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])

  useEffect(() => {
    if (expired) router.replace('/')
  }, [expired])

  const { h, m, sec } = splitTime(timeLeft)
  // reason có thể là key ('frequentCancel') hoặc đã dịch sẵn ('Bạn đã hủy...')
  const reasonText = reason
    ? t(`lock.reason.${reason}`, { defaultValue: reason })
    : t('lock.reason.cancelTrip')

  async function handleLogout() {
    await SecureStore.deleteItemAsync(SecureStoreKey.USER_ROLE).catch(() => {})
    await SecureStore.deleteItemAsync(SecureStoreKey.CUSTOMER_INFO).catch(() => {})
    await SecureStore.deleteItemAsync(SecureStoreKey.CUSTOMER_LOCK_UNTIL).catch(() => {})
    await SecureStore.deleteItemAsync(SecureStoreKey.DRIVER_LOCK_UNTIL).catch(() => {})
    await signOutAndClearRole().catch(() => {})
    router.replace('/role-select')
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.root}>

        {/* Icon */}
        <View style={s.iconSection}>
          <Animated.View style={[s.glow, { transform: [{ scale: pulse }] }]} />
          <View style={s.iconCircle}>
            <Ionicons name="lock-closed" size={40} color="#fff" />
          </View>
        </View>

        {/* Tiêu đề */}
        <Text style={s.title}>{t('lock.title')}</Text>
        <Text style={s.subtitle}>{t('lock.subtitle')}</Text>

        {/* Lý do */}
        <View style={s.reasonRow}>
          <Ionicons name="alert-circle-outline" size={14} color={BRAND} />
          <Text style={s.reasonText}>{reasonText}</Text>
        </View>

        {/* Card đếm ngược */}
        <View style={s.card}>
          <Text style={s.cardLabel}>{t('lock.unlockAfter')}</Text>
          <View style={s.timeRow}>
            <TimeBox value={h} unit={t('lock.hours')} />
            <Text style={s.colon}>:</Text>
            <TimeBox value={m} unit={t('lock.minutes')} />
            <Text style={s.colon}>:</Text>
            <TimeBox value={sec} unit={t('lock.seconds')} />
          </View>
        </View>

        {/* Ghi chú */}
        <Text style={s.note}>{t('lock.note')}</Text>

        {/* Nút đăng xuất */}
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={16} color="#64748B" />
          <Text style={s.logoutText}>{t('lock.logout')}</Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },

  // Icon
  iconSection: { alignSelf: 'center', marginBottom: 28 },
  glow: {
    position: 'absolute',
    alignSelf: 'center',
    width: 116, height: 116, borderRadius: 58,
    backgroundColor: BRAND_LIGHT,
    top: -14, left: -14,
  },
  iconCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: BRAND,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 10,
  },

  // Texts
  title:    { fontSize: 22, fontWeight: '800', color: BRAND, textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginBottom: 20 },

  reasonRow: {
    alignItems: 'center', gap: 6,
    backgroundColor: BRAND_MUTED,
    borderWidth: 1, borderColor: BRAND_LIGHT,
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12,
    marginBottom: 32,
  },
  reasonText: { fontSize: 13, color: BRAND, fontWeight: '600', textAlign: 'center', lineHeight: 20 },

  // Card
  card: {
    backgroundColor: BRAND,
    borderRadius: 22,
    paddingVertical: 26, paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 28,
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22, shadowRadius: 20, elevation: 8,
  },
  cardLabel: {
    fontSize: 11, color: 'rgba(255,255,255,0.55)',
    fontWeight: '700', letterSpacing: 1.5,
    marginBottom: 18,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10,
    width: 80,
  },
  timeNum:  { fontSize: 36, fontWeight: '800', color: '#fff', lineHeight: 42 },
  timeUnit: { fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: '600', marginTop: 3 },
  colon:    { fontSize: 28, fontWeight: '800', color: 'rgba(255,255,255,0.4)', marginBottom: 18, marginHorizontal: 4 },

  // Note
  note: { fontSize: 12, color: '#94A3B8', textAlign: 'center', lineHeight: 20, marginBottom: 28 },

  // Logout
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  logoutText: { fontSize: 13, color: '#64748B', fontWeight: '500' },
})
