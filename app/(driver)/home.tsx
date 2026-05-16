// app/(driver)/home.tsx
// Màn hình chính tài xế: toggle sẵn sàng, hiện ODC balance, nhận FCM

import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert, AppState, AppStateStatus } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { updateDriverStatus, updateDriverLocation, updateDriverFcmToken } from '../../src/services/firestore'
import { getCurrentLocation, geohashForQuery, distanceKm } from '../../src/services/location'
import { isOnWifi } from '../../src/services/network'
import { getODCBalance } from '../../src/services/odc'
import { rtdb } from '../../src/services/firebase'
import { savePendingTrip } from '../../src/utils/storage'
import ODCBalance from '../../src/components/ODCBalance'
import NetworkAlert from '../../src/components/NetworkAlert'
import { SecureStoreKey, DriverInfo, DriverStatus, PendingTrip } from '../../src/types'
import type { TripRealtimeInfo, TripQuote } from '../../src/types'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  false,
  }),
})

export default function DriverHomeScreen() {
  const { t } = useTranslation()

  const [driverInfo,    setDriverInfo]    = useState<DriverInfo | null>(null)
  const [odcBalance,    setOdcBalance]    = useState(0)
  const [showWifiAlert, setShowWifiAlert] = useState(false)
  const [lastLat,       setLastLat]       = useState(0)
  const [lastLng,       setLastLng]       = useState(0)
  const appStateRef = useRef(AppState.currentState)

  useEffect(() => {
    loadDriverInfo()
    registerFcmToken()

    // Lắng nghe FCM notification khi app đang foreground
    const sub = Notifications.addNotificationReceivedListener(handleForegroundNotification)
    // Lắng nghe khi user tap notification (background / killed)
    const subResp = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse)

    const appSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (appStateRef.current !== 'active' && state === 'active') {
        // App vừa trở về foreground – refresh FCM token phòng khi rotate
        registerFcmToken()
      }
      appStateRef.current = state
    })

    return () => {
      Notifications.removeNotificationSubscription(sub)
      Notifications.removeNotificationSubscription(subResp)
      appSub.remove()
    }
  }, [])

  async function registerFcmToken() {
    try {
      const { status: existing } = await Notifications.getPermissionsAsync()
      const finalStatus = existing === 'granted'
        ? existing
        : (await Notifications.requestPermissionsAsync()).status

      if (finalStatus !== 'granted') return

      // getDevicePushTokenAsync trả về raw FCM token (Android) / APNs token (iOS)
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
        setDriverInfo(updated)
      }
    } catch {
      // FCM setup chưa hoàn chỉnh – bỏ qua
    }
  }

  function handleForegroundNotification(notification: Notifications.Notification) {
    const data = notification.request.content.data as Record<string, string> | undefined
    if (!data) return
    if (data.type === 'new_trip' && data.tripId) {
      handleNewTripNotification(data.tripId)
    } else if (data.type === 'trip_selected' && data.tripId) {
      handleTripSelectedNotification(data.tripId)
    }
  }

  function handleNotificationResponse(response: Notifications.NotificationResponse) {
    const data = response.notification.request.content.data as Record<string, string> | undefined
    if (!data) return
    if (data.type === 'new_trip' && data.tripId) {
      handleNewTripNotification(data.tripId)
    } else if (data.type === 'trip_selected' && data.tripId) {
      handleTripSelectedNotification(data.tripId)
    }
  }

  async function handleNewTripNotification(tripId: string) {
    // Điều hướng đến bidding, lấy thông tin chuyến từ RTDB
    try {
      const info = await rtdb.get<TripRealtimeInfo>(`trips/${tripId}/info`)
      if (!info) return
      router.push({
        pathname:  '/(driver)/bidding',
        params:    {
          tripId,
          estimatedKm:   String(info.estimatedKm ?? 0),
          vehicleType:   info.vehicleType,
          pickupGeohash: info.pickupGeohash,
          dropGeohash:   info.dropGeohash,
          customerPhone: info.customerPhone,
        },
      })
    } catch {
      // trip có thể đã bị xóa, bỏ qua
    }
  }

  async function handleTripSelectedNotification(tripId: string) {
    // Tài xế được chọn: load info + quote → tạo pendingTrip → chuyển đến trip screen
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
      Alert.alert(t('common.error'), t('error.serverError'))
    }
  }

  async function loadDriverInfo() {
    const raw = await SecureStore.getItemAsync(SecureStoreKey.DRIVER_INFO)
    if (!raw) return
    const info: DriverInfo = JSON.parse(raw)
    setDriverInfo(info)

    const balance = await getODCBalance(info.stellarWallet, process.env.EXPO_PUBLIC_STELLAR_ISSUER ?? '')
    setOdcBalance(balance)
  }

  const updateLocation = useCallback(async (info: DriverInfo) => {
    if (info.status !== 'ready') return
    try {
      const { lat, lng } = await getCurrentLocation()
      const dist = distanceKm(lastLat, lastLng, lat, lng)
      if (dist < 1 && lastLat !== 0) return

      const geohash = geohashForQuery(lat, lng)
      await updateDriverLocation(info.uid, geohash)
      setLastLat(lat)
      setLastLng(lng)

      const updated = { ...info, status: info.status }
      await SecureStore.setItemAsync(SecureStoreKey.DRIVER_INFO, JSON.stringify(updated))
    } catch {}
  }, [lastLat, lastLng])

  async function toggleStatus() {
    if (!driverInfo) return

    const newStatus: DriverStatus = driverInfo.status === 'ready' ? 'offline' : 'ready'

    if (newStatus === 'ready') {
      const onWifi = await isOnWifi()
      if (onWifi) { setShowWifiAlert(true); return }
    }

    try {
      await updateDriverStatus(driverInfo.uid, newStatus)
      const updated = { ...driverInfo, status: newStatus }
      setDriverInfo(updated)
      await SecureStore.setItemAsync(SecureStoreKey.DRIVER_INFO, JSON.stringify(updated))

      if (newStatus === 'ready') updateLocation(updated)
    } catch (e: unknown) {
      Alert.alert(t('common.error'), (e as Error).message)
    }
  }

  if (!driverInfo) return null

  const isReady = driverInfo.status === 'ready'

  return (
    <View style={styles.container}>
      <NetworkAlert visible={showWifiAlert} onDismiss={() => setShowWifiAlert(false)} />

      <View style={styles.header}>
        <Text style={styles.name}>{driverInfo.name}</Text>
        <ODCBalance balance={odcBalance} />
      </View>

      <View style={styles.ratingRow}>
        <Text style={styles.rating}>
          {t('driver.rating', { rating: driverInfo.rating.toFixed(1), count: driverInfo.ratingCount })}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.toggleBtn, isReady ? styles.btnOffline : styles.btnOnline]}
        onPress={toggleStatus}
      >
        <Text style={styles.toggleBtnText}>
          {isReady ? t('driver.goOffline') : t('driver.goOnline')}
        </Text>
      </TouchableOpacity>

      <Text style={[styles.statusText, isReady ? { color: '#15803D' } : { color: '#64748B' }]}>
        {t(`driver.status.${driverInfo.status}`)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container:     { flex: 1, padding: 24, backgroundColor: '#F0FDF4' },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  name:          { fontSize: 20, fontWeight: '700', color: '#14532D' },
  ratingRow:     { marginBottom: 48 },
  rating:        { fontSize: 14, color: '#15803D' },
  toggleBtn:     { height: 64, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  btnOnline:     { backgroundColor: '#15803D' },
  btnOffline:    { backgroundColor: '#DC2626' },
  toggleBtnText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  statusText:    { textAlign: 'center', fontSize: 16, fontWeight: '600' },
})
