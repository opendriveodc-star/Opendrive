import { useState, useEffect, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Easing,
} from 'react-native'
import { showAlert } from '../../src/components/GlobalAlert'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { rtdb } from '../../src/services/firebase'
import { notifySelectedDriver } from '../../src/services/cloudflare'
import QuoteList from '../../src/components/QuoteList'
import type { TripQuote } from '../../src/types'
import { TRIP } from '../../src/constants'

const BRAND = '#1A2E5E'

export default function WaitingScreen() {
  const { t }    = useTranslation()
  const { tripId } = useLocalSearchParams<{ tripId: string; geohash: string }>()

  const [quotes,   setQuotes]   = useState<TripQuote[]>([])
  const [attempts, setAttempts] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pulseAnim   = useRef(new Animated.Value(1)).current

  useEffect(() => {
    startPulse()
    startPolling()
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  function startPulse() {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start()
  }

  function startPolling() {
    intervalRef.current = setInterval(async () => {
      setAttempts((prev) => {
        const next = prev + 1
        if (next >= TRIP.QUOTE_POLL_MAX_ATTEMPTS) {
          clearInterval(intervalRef.current!)
          rtdb.delete(`trips/${tripId}`).catch(() => {})
          showAlert(t('trip.noDriver'))
          router.back()
        }
        return next
      })

      const quotesData = await rtdb.get<Record<string, TripQuote>>(`trips/${tripId}/quotes`)
      if (quotesData) {
        const list = Object.values(quotesData)
        setQuotes(list.sort((a, b) => a.quotedPrice - b.quotedPrice))
        clearInterval(intervalRef.current!)
      }
    }, TRIP.QUOTE_POLL_INTERVAL_MS)
  }

  async function selectDriver(quote: TripQuote) {
    try {
      await notifySelectedDriver(tripId, quote.driverUid)
      router.replace({ pathname: '/(customer)/tracking', params: { tripId, driverUid: quote.driverUid } })
    } catch (e: unknown) {
      showAlert(t('common.error'), (e as Error).message)
    }
  }

  async function handleCancel() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    await rtdb.delete(`trips/${tripId}`).catch(() => {})
    router.back()
  }

  const secondsLeft = Math.max(0,
    (TRIP.QUOTE_POLL_MAX_ATTEMPTS - attempts) * (TRIP.QUOTE_POLL_INTERVAL_MS / 1000)
  )

  // Quotes received – show list
  if (quotes.length > 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.quotesHeader}>
          <Text style={styles.quotesTitle}>{t('trip.quotes')}</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{quotes.length}</Text>
          </View>
        </View>
        <QuoteList quotes={quotes} onSelect={selectDriver} />
        <View style={styles.cancelRow}>
          <TouchableOpacity onPress={handleCancel}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // Searching state
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.center}>
        <View style={styles.circleWrap}>
          <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />
          <View style={styles.innerCircle}>
            <Ionicons name="car-outline" size={34} color="#fff" />
          </View>
        </View>

        <Text style={styles.countdown}>{secondsLeft}s</Text>
        <Text style={styles.searchingText}>{t('trip.searching')}</Text>
        <Text style={styles.searchingHint}>Đang tìm tài xế gần bạn...</Text>
      </View>

      <View style={styles.cancelRow}>
        <TouchableOpacity onPress={handleCancel}>
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },

  circleWrap:  { width: 120, height: 120, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  pulseRing:   { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(26,46,94,0.12)' },
  innerCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: BRAND, justifyContent: 'center', alignItems: 'center' },

  countdown:     { fontSize: 52, fontWeight: '800', color: BRAND },
  searchingText: { fontSize: 17, fontWeight: '600', color: '#0F172A' },
  searchingHint: { fontSize: 14, color: '#64748B' },

  quotesHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 20, paddingBottom: 12 },
  quotesTitle:  { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  countBadge:   { backgroundColor: BRAND, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  countText:    { color: '#fff', fontSize: 13, fontWeight: '700' },

  cancelRow:  { padding: 16, paddingBottom: 28, alignItems: 'center' },
  cancelText: { color: '#DC2626', fontSize: 16, fontWeight: '600' },
})
