// app/(customer)/waiting.tsx
// Chờ báo giá: polling 5s × 5, hiện danh sách tài xế đã báo giá

import { useState, useEffect, useRef } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { rtdb } from '../../src/services/firebase'
import { notifySelectedDriver } from '../../src/services/cloudflare'
import QuoteList from '../../src/components/QuoteList'
import type { TripQuote } from '../../src/types'
import { TRIP } from '../../src/constants'

export default function WaitingScreen() {
  const { t }    = useTranslation()
  const params   = useLocalSearchParams<{ tripId: string; geohash: string }>()
  const { tripId, geohash } = params

  const [quotes,   setQuotes]   = useState<TripQuote[]>([])
  const [attempts, setAttempts] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    startPolling()
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  function startPolling() {
    intervalRef.current = setInterval(async () => {
      setAttempts((prev) => {
        const next = prev + 1
        if (next >= TRIP.QUOTE_POLL_MAX_ATTEMPTS) {
          clearInterval(intervalRef.current!)
          // Hết 25s không có tài xế → xóa trip
          rtdb.delete(`trips/${tripId}`).catch(() => {})
          Alert.alert(t('trip.noDriver'))
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
      Alert.alert(t('common.error'), (e as Error).message)
    }
  }

  const secondsLeft = (TRIP.QUOTE_POLL_MAX_ATTEMPTS - attempts) * (TRIP.QUOTE_POLL_INTERVAL_MS / 1000)

  return (
    <View style={styles.container}>
      {quotes.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.searching}>{t('trip.searching')}</Text>
          <Text style={styles.timer}>{secondsLeft}s</Text>
        </View>
      ) : (
        <>
          <Text style={styles.title}>{t('trip.quotes')}</Text>
          <QuoteList quotes={quotes} onSelect={selectDriver} />
        </>
      )}

      <TouchableOpacity style={styles.cancelBtn} onPress={async () => {
        await rtdb.delete(`trips/${tripId}`)
        router.back()
      }}>
        <Text style={styles.cancelText}>{t('common.cancel')}</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container:  { flex: 1, padding: 24, backgroundColor: '#F8FAFC' },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searching:  { fontSize: 18, color: '#1A56DB', marginBottom: 12 },
  timer:      { fontSize: 48, fontWeight: '700', color: '#0F172A' },
  title:      { fontSize: 20, fontWeight: '700', color: '#0F172A', marginBottom: 16 },
  cancelBtn:  { height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  cancelText: { color: '#DC2626', fontSize: 16, fontWeight: '600' },
})
