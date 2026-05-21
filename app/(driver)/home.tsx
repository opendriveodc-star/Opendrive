// app/(driver)/home.tsx

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  AppState, AppStateStatus, Animated, Image, StatusBar, Platform, ActivityIndicator,
} from 'react-native'
import { showAlert } from '../../src/components/GlobalAlert'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as SecureStore from 'expo-secure-store'
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { updateDriverStatus, updateDriverLocation, updateDriverFcmToken } from '../../src/services/firestore'
import { getCurrentLocation, geohashForQuery, distanceKm } from '../../src/services/location'
import { getODCBalance } from '../../src/services/odc'
import { rtdb } from '../../src/services/firebase'
import { savePendingTrip } from '../../src/utils/storage'
import NetworkAlert from '../../src/components/NetworkAlert'
import { SecureStoreKey, DriverInfo, DriverStatus, PendingTrip } from '../../src/types'
import type { TripRealtimeInfo, TripQuote } from '../../src/types'

const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'
const BTN_SIZE    = 148
const RING_OFFSET = 18

// Cache ngoài React – giữ giá trị giữa các lần navigate, tránh flash màn trắng
let _cachedDriverInfo: DriverInfo | null = null
let _cachedBalance = 0

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  true,
    shouldSetBadge:   false,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
})

export default function DriverHomeScreen() {
  const { t } = useTranslation()

  const [driverInfo,    setDriverInfo]    = useState<DriverInfo | null>(_cachedDriverInfo)
  const [odcBalance,    setOdcBalance]    = useState(_cachedBalance)
  const [showWifiAlert, setShowWifiAlert] = useState(false)
  const [goingOnline,   setGoingOnline]   = useState(false)
  const appStateRef    = useRef(AppState.currentState)
  const isAnimatingRef = useRef(false)
  const navigatingRef  = useRef(false)
  const lastPosRef     = useRef({ lat: 0, lng: 0 })
  const pulseAnim      = useRef(new Animated.Value(1)).current
  const pulseRef       = useRef<Animated.CompositeAnimation | null>(null)

  useEffect(() => {
    navigatingRef.current = false
    setGoingOnline(false)
    loadDriverInfo()
    registerFcmToken()
    // FCM new_trip được xử lý bởi online.tsx – home chỉ cần handle trip_selected khi offline
    const subResp = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse)
    const appSub  = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (appStateRef.current !== 'active' && state === 'active') registerFcmToken()
      appStateRef.current = state
    })
    return () => {
      subResp.remove()
      appSub.remove()
    }
  }, [])

  useEffect(() => {
    if (pulseRef.current) { pulseRef.current.stop(); pulseRef.current = null }
    if (driverInfo?.status === 'ready') {
      pulseRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.06, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
        ])
      )
      pulseRef.current.start()
    } else {
      pulseAnim.setValue(1)
    }
    return () => { if (pulseRef.current) pulseRef.current.stop() }
  }, [driverInfo?.status])

  async function registerFcmToken() {
    try {
      const { status: existing } = await Notifications.getPermissionsAsync()
      const finalStatus = existing === 'granted'
        ? existing
        : (await Notifications.requestPermissionsAsync()).status
      if (finalStatus !== 'granted') return
      const tokenData = await Notifications.getDevicePushTokenAsync()
      const fcmToken  = tokenData.data as string
      if (!fcmToken) return
      const raw = await SecureStore.getItemAsync(SecureStoreKey.DRIVER_INFO)
      if (!raw) return
      const info: DriverInfo = JSON.parse(raw)
      if (info.fcmToken !== fcmToken) {
        await updateDriverFcmToken(info.uid, fcmToken)
        const updated = { ...info, fcmToken }
        await SecureStore.setItemAsync(SecureStoreKey.DRIVER_INFO, JSON.stringify(updated))
        if (!navigatingRef.current) setDriverInfo(updated)
      }
    } catch {}
  }

  function handleNotificationResponse(response: Notifications.NotificationResponse) {
    const data = response.notification.request.content.data as Record<string, string> | undefined
    if (!data) return
    if (data.type === 'trip_selected' && data.tripId) handleTripSelectedNotification(data.tripId)
  }

  function handleNewTripNotification(tripId: string) {
    router.push({ pathname: '/(driver)/online', params: { expandTripId: tripId } })
  }

  async function handleTripSelectedNotification(tripId: string) {
    try {
      const raw = await SecureStore.getItemAsync(SecureStoreKey.DRIVER_INFO)
      if (!raw) return
      const info: DriverInfo = JSON.parse(raw)
      const [tripInfo, quote] = await Promise.all([
        rtdb.get<TripRealtimeInfo>(`trips/${tripId}/info`),
        rtdb.get<TripQuote>(`trips/${tripId}/quotes/${info.uid}`),
      ])
      if (!tripInfo || !quote) return
      const pendingTrip: PendingTrip = {
        tripId,
        driverUid:     info.uid,
        tripPrice:     quote.quotedPrice,
        startedAt:     new Date().toISOString(),
        pickupGeohash: tripInfo.pickupGeohash,
        dropGeohash:   tripInfo.dropGeohash,
        customerPhone: tripInfo.customerPhone,
        rating:        null,
      }
      await savePendingTrip(pendingTrip)
      await updateDriverStatus(info.uid, 'busy')
      const updated = { ...info, status: 'busy' as DriverStatus }
      await SecureStore.setItemAsync(SecureStoreKey.DRIVER_INFO, JSON.stringify(updated))
      setDriverInfo(updated)
      router.replace('/(driver)/trip')
    } catch {
      showAlert(t('common.error'), t('error.serverError'))
    }
  }

  async function loadDriverInfo() {
    const raw = await SecureStore.getItemAsync(SecureStoreKey.DRIVER_INFO)
    if (!raw) return
    const info: DriverInfo = JSON.parse(raw)
    const resetInfo = { ...info, status: 'offline' as DriverStatus }
    _cachedDriverInfo = resetInfo
    if (!navigatingRef.current) setDriverInfo(resetInfo)
    await SecureStore.setItemAsync(SecureStoreKey.DRIVER_INFO, JSON.stringify(resetInfo))
    updateDriverStatus(info.uid, 'offline').catch(() => {})
    const balance = await getODCBalance(info.stellarWallet)
    if (balance !== _cachedBalance && !navigatingRef.current) {
      _cachedBalance = balance
      setOdcBalance(balance)
    }
  }

  const updateLocation = useCallback(async (info: DriverInfo) => {
    if (info.status !== 'ready') return
    try {
      const { lat, lng } = await getCurrentLocation()
      const { lat: lastLat, lng: lastLng } = lastPosRef.current
      const dist = distanceKm(lastLat, lastLng, lat, lng)
      if (dist < 1 && lastLat !== 0) return
      const geohash = geohashForQuery(lat, lng)
      await updateDriverLocation(info.uid, geohash)
      lastPosRef.current = { lat, lng }
    } catch {}
  }, [])

  function toggleStatus() {
    if (!driverInfo) return
    if (driverInfo.status === 'offline') {
      navigatingRef.current = true
      setGoingOnline(true)
      SecureStore.setItemAsync(
        SecureStoreKey.DRIVER_INFO,
        JSON.stringify({ ...driverInfo, status: 'ready' as DriverStatus }),
      ).catch(() => {})
      updateDriverStatus(driverInfo.uid, 'ready').catch(() => {})
      setTimeout(() => router.push('/(driver)/online'), 1000)
      return
    }
    const updated = { ...driverInfo, status: 'offline' as DriverStatus }
    _cachedDriverInfo = updated
    setDriverInfo(updated)
    SecureStore.setItemAsync(SecureStoreKey.DRIVER_INFO, JSON.stringify(updated)).catch(() => {})
    updateDriverStatus(driverInfo.uid, 'offline').catch(() => {})
  }

  function handleButtonPress() {
    if (isAnimatingRef.current || !driverInfo) return
    isAnimatingRef.current = true
    toggleStatus()
    isAnimatingRef.current = false
  }



  if (!driverInfo) return (
    <SafeAreaView style={[styles.safe, { justifyContent: 'center', alignItems: 'center' }]} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F9FD" />
    </SafeAreaView>
  )

  const isReady = driverInfo.status === 'ready'
  const balanceDisplay = Number.isInteger(odcBalance)
    ? String(odcBalance)
    : odcBalance.toFixed(2)

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F9FD" />
      <NetworkAlert visible={showWifiAlert} onDismiss={() => setShowWifiAlert(false)} />

      {/* ── Header card ── */}
      <View style={styles.headerCard}>
        {/* Left: avatar + name + rating */}
        <View style={styles.headerLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>
              {driverInfo.name?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.driverName} numberOfLines={1}>{driverInfo.name}</Text>
            <Text style={styles.ratingText}>
              ★ {driverInfo.rating.toFixed(1)}
            </Text>
          </View>
        </View>

        {/* Right: ODC balance + settings */}
        <View style={styles.headerRight}>
          <View style={styles.balanceStack}>
            <View style={styles.balanceLabelRow}>
              <Ionicons name="wallet-outline" size={15} color={BRAND} />
              <Text style={styles.balanceODC}>ODC</Text>
            </View>
            <Text style={styles.balancePillText}>{balanceDisplay}</Text>
          </View>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => router.push('/(driver)/settings')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="settings-outline" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Logo + Slogan ── */}
      <View style={styles.logoWrap}>
        <Image
          source={require('../../assets/logo_od.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.slogan}>{t('roleSelect.slogan')}</Text>
      </View>

      {/* ── Ready button + ring ── */}
      <View style={styles.btnArea}>
        {/* Track ring */}
        <View style={[styles.trackRing, isReady && styles.trackRingOnline]} />

        {/* Pulse ring (online, idle) */}
        {isReady && (
          <Animated.View
            style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]}
          />
        )}

        <TouchableOpacity
          style={[styles.readyBtn, isReady ? styles.readyBtnOn : styles.readyBtnOff]}
          onPress={handleButtonPress}
          activeOpacity={0.82}
          disabled={goingOnline}
        >
          {goingOnline
            ? <ActivityIndicator color={BRAND} size="small" />
            : <Text style={[styles.readyLabel, isReady ? styles.readyLabelOn : styles.readyLabelOff]}>
                {isReady ? t('driver.readyOn') : t('driver.readyOff')}
              </Text>
          }
        </TouchableOpacity>
      </View>

      <Text style={[styles.statusLine, isReady && styles.statusLineOn]}>
        {t(`driver.status.${driverInfo.status}`)}
      </Text>

      {/* ── Ad panel ── */}
      <View style={styles.adPanel}>
        <Ionicons name="megaphone-outline" size={16} color="#94A3B8" />
        <Text style={styles.adLabel}>{t('driver.adLabel')}</Text>
      </View>
    </SafeAreaView>
  )
}

const RING_SIZE = BTN_SIZE + RING_OFFSET * 2

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F7F9FD',
    alignItems: 'center',
    paddingBottom: 56,
  },

  // ── Header card ──
  headerCard: {
    marginHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 10,
    borderWidth: 1,
    borderColor: BRAND_LIGHT,
    ...Platform.select({
      ios: {
        shadowColor: BRAND,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.10,
        shadowRadius: 10,
      },
      android: {
        elevation: 0,
      },
    }),
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: BRAND_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: '700',
    color: BRAND,
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
  },
  driverName: {
    fontSize: 15,
    fontWeight: '700',
    color: BRAND,
    flexShrink: 1,
  },
  ratingText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginLeft: 20,
  },
  balanceStack: {
    alignItems: 'center',
    gap: 1,
    minWidth: 64,
  },
  balanceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  balanceODC: {
    fontSize: 11,
    fontWeight: '700',
    color: BRAND,
  },
  balancePillText: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND,
    textAlign: 'center',
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  // ── Logo + Slogan ──
  logoWrap: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 8,
  },
  logo: {
    width: 260,
    height: 160,
  },
  slogan: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
    letterSpacing: 0.3,
    marginTop: -8,
  },

  // ── Button area ──
  btnArea: {
    width: RING_SIZE + 8,
    height: RING_SIZE + 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
  },
  trackRing: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  trackRingOnline: {
    borderColor: BRAND_LIGHT,
  },
  spinArc: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 3,
    borderTopColor: BRAND,
    borderRightColor: BRAND,
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  pulseRing: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2.5,
    borderColor: BRAND,
    opacity: 0.35,
  },
  readyBtn: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  readyBtnOff: {
    backgroundColor: '#fff',
  },
  readyBtnOn: {
    backgroundColor: BRAND,
  },
  readyLabel: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.5,
  },
  readyLabelOff: {
    color: BRAND,
  },
  readyLabelOn: {
    color: '#fff',
  },

  statusLine: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 0.3,
  },
  statusLineOn: {
    color: '#15803D',
  },

  // ── Ad panel ──
  adPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 56,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  adLabel: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
})
