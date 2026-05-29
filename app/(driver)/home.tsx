// app/(driver)/home.tsx

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
  AppState, AppStateStatus, Animated, Image, StatusBar,
} from 'react-native'
import { showAlert } from '../../src/components/GlobalAlert'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as SecureStore from 'expo-secure-store'
import * as Notifications from 'expo-notifications'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { updateDriverStatus, updateDriverFcmToken, getDriver, setDriverPendingTrip } from '../../src/services/firestore'
import { getCurrentLocation } from '../../src/services/location'
import { getODCBalance } from '../../src/services/odc'
import { rtdb } from '../../src/services/firebase'
import { savePendingTrip, getPendingTrip, clearPendingTrip, getPenaltyTrip, clearPenaltyTrip, getEncryptedKey, getDriverInfo, saveDriverInfo } from '../../src/utils/storage'
import { recordTrip } from '../../src/services/cloudflare'
import NetworkAlert from '../../src/components/NetworkAlert'
import { SecureStoreKey, DriverInfo, DriverStatus, PendingTrip, RatingValue } from '../../src/types'
import type { TripRealtimeInfo, TripQuote } from '../../src/types'

const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'
const BTN_SIZE    = 148
const RING_OFFSET = 18
const RING_SIZE   = BTN_SIZE + RING_OFFSET * 2

let _cachedDriverInfo: DriverInfo | null = null
let _cachedBalance    = 0
let _fraudChecked     = false

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false,
    shouldShowBanner: true, shouldShowList: true,
  }),
})

export default function DriverHomeScreen() {
  const { t } = useTranslation()

  const [driverInfo,     setDriverInfo]     = useState<DriverInfo | null>(_cachedDriverInfo)
  const [odcBalance,     setOdcBalance]     = useState(_cachedBalance)
  const [showWifiAlert,  setShowWifiAlert]  = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [goingOnline,    setGoingOnline]    = useState(false)

  const appStateRef    = useRef(AppState.currentState)
  const isAnimatingRef = useRef(false)
  const navigatingRef  = useRef(false)

  const spinAnim    = useRef(new Animated.Value(0)).current
  const spinRef     = useRef<Animated.CompositeAnimation | null>(null)
  const isMountedRef = useRef(false)

  // Returning from online.tsx via router.back() – reset navigation state only, no spinner
  useFocusEffect(useCallback(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true
      return
    }
    navigatingRef.current = false
    setGoingOnline(false)
    loadDriverInfo()
  }, []))

  useEffect(() => {
    navigatingRef.current = false
    setGoingOnline(false)
    setIsInitializing(true)
    spinAnim.setValue(0)

    startSpinner()
    initAll()
    registerFcmToken()

    const subResp = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse)
    const appSub  = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (appStateRef.current !== 'active' && s === 'active') registerFcmToken()
      appStateRef.current = s
    })
    return () => {
      subResp.remove()
      appSub.remove()
      spinRef.current?.stop()
    }
  }, [])

  function startSpinner() {
    spinRef.current?.stop()
    spinAnim.setValue(0)
    spinRef.current = Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 1100, useNativeDriver: true })
    )
    spinRef.current.start()
  }

  async function initAll() {
    await loadDriverInfo()

    // ── Kiểm tra gian lận: tài xế có pendingTrip=true trên Firestore không? ──
    if (!_fraudChecked) {
      _fraudChecked = true
      const raw = await SecureStore.getItemAsync(SecureStoreKey.DRIVER_INFO)
      if (raw) {
        const info: DriverInfo = JSON.parse(raw)
        const lockRaw = await SecureStore.getItemAsync(SecureStoreKey.DRIVER_LOCK_UNTIL)
        if (lockRaw) {
          const lockTs = parseInt(lockRaw)
          if (lockTs > Date.now()) {
            // Đang bị khóa → chuyển sang lock-screen
            router.replace({ pathname: '/lock-screen', params: { lockedUntil: lockRaw, reason: 'fraud' } })
            return
          } else {
            // Lock đã hết hạn → xóa local + Firestore
            await SecureStore.deleteItemAsync(SecureStoreKey.DRIVER_LOCK_UNTIL)
            setDriverPendingTrip(info.uid, false).catch(() => {})
          }
        } else {
          // Không có lock local → kiểm tra Firestore (trường hợp xóa data rồi đăng nhập lại)
          const driverDoc = await getDriver(info.uid).catch(() => null)
          if (driverDoc?.referralCount != null && driverDoc.referralCount !== info.referralCount) {
            saveDriverInfo({ ...info, referralCount: driverDoc.referralCount }).catch(() => {})
          }
          if (driverDoc?.pendingTrip === true) {
            const lockUntil = Date.now() + 48 * 60 * 60 * 1000
            await SecureStore.setItemAsync(SecureStoreKey.DRIVER_LOCK_UNTIL, String(lockUntil))
            router.replace({ pathname: '/lock-screen', params: { lockedUntil: String(lockUntil), reason: 'fraud' } })
            return
          }
        }
      }
    }

    await Promise.allSettled([
      warmupLocation(),
      new Promise(r => setTimeout(r, 1400)),  // tối thiểu 1.4s để animation hiển thị
    ])

    spinRef.current?.stop()
    spinRef.current = null
    setIsInitializing(false)
  }

  async function warmupLocation() {
    try { await getCurrentLocation() } catch {}
  }

  async function registerFcmToken() {
    try {
      const { status: existing } = await Notifications.getPermissionsAsync()
      const finalStatus = existing === 'granted'
        ? existing
        : (await Notifications.requestPermissionsAsync()).status
      if (finalStatus !== 'granted') return

      const raw = await SecureStore.getItemAsync(SecureStoreKey.DRIVER_INFO)
      if (!raw) return
      const info: DriverInfo = JSON.parse(raw)

      let fcmToken = ''
      try {
        const tokenData = await Notifications.getDevicePushTokenAsync()
        fcmToken = tokenData.data as string
      } catch {}

      if (fcmToken) {
        // Bước 2: token tươi → update Firestore + SecureStore nếu khác
        if (info.fcmToken !== fcmToken) {
          await updateDriverFcmToken(info.uid, fcmToken)
          const updated = { ...info, fcmToken }
          await SecureStore.setItemAsync(SecureStoreKey.DRIVER_INFO, JSON.stringify(updated))
          if (!navigatingRef.current) setDriverInfo(updated)
        }
      } else if (!info.fcmToken) {
        // Bước 3: fallback → SecureStore chưa có token, lấy từ Firestore
        const doc = await getDriver(info.uid)
        if (doc?.fcmToken) {
          const updated = { ...info, fcmToken: doc.fcmToken }
          await SecureStore.setItemAsync(SecureStoreKey.DRIVER_INFO, JSON.stringify(updated))
          if (!navigatingRef.current) setDriverInfo(updated)
        }
      }
    } catch {}
  }

  function handleNotificationResponse(response: Notifications.NotificationResponse) {
    const data = response.notification.request.content.data as Record<string, string> | undefined
    if (!data) return
    if (data.type === 'trip_selected' && data.tripId) handleTripSelectedNotification(data.tripId)
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
        pickupLat:     tripInfo.pickupLat ?? 0,
        pickupLng:     tripInfo.pickupLng ?? 0,
        customerPhone: tripInfo.customerPhone,
        rating:        null,
      }
      await savePendingTrip(pendingTrip)
      setDriverPendingTrip(info.uid, true).catch(() => {})
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
    ;(async () => {
      for (let i = 0; i < 3; i++) {
        try { await updateDriverStatus(info.uid, 'offline'); break } catch { await new Promise(r => setTimeout(r, 1500 * (i + 1))) }
      }
    })()
    const balance = await getODCBalance(info.stellarWallet)
    if (balance !== _cachedBalance && !navigatingRef.current) {
      _cachedBalance = balance
      setOdcBalance(balance)
    }
  }

  async function handleButtonPress() {
    if (isAnimatingRef.current || isInitializing || goingOnline || !driverInfo) return

    // Kiểm tra penaltyTrip — phải xử lý trước khi cho Sẵn sàng
    const penalty = await getPenaltyTrip()
    if (penalty) {
      isAnimatingRef.current = true
      setGoingOnline(true)
      startSpinner()

      let odcSuccess = false
      try {
        const key = await getEncryptedKey()
        if (key) {
          for (let i = 0; i < 3; i++) {
            try {
              await Promise.race([
                recordTrip({ driverUid: penalty.driverUid, rating: 1, tripPrice: penalty.tripPrice, memo27bytes: penalty.memo27Base64, isCancelled: true, encryptedPrivateKey: key }),
                new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 8000)),
              ])
              odcSuccess = true
              break
            } catch {
              if (i < 2) await new Promise<void>(r => setTimeout(r, 3000))
            }
          }
        }
      } catch {}

      if (!odcSuccess) {
        spinRef.current?.stop()
        spinRef.current = null
        setGoingOnline(false)
        isAnimatingRef.current = false
        showAlert('Không thể xử lý', 'Không thể trừ ODC phạt hủy chuyến. Vui lòng thử lại.')
        return
      }

      await clearPenaltyTrip()
      spinRef.current?.stop()
      spinRef.current = null
      setGoingOnline(false)
      isAnimatingRef.current = false
      showAlert('Thông báo', 'Đã trừ ODC do hủy chuyến trước đó.', [
        { text: 'OK', onPress: () => goOnline() },
      ])
      return
    }

    // Kiểm tra pendingTrip — blockchain fail sau khi hoàn thành chuyến
    const pending = await getPendingTrip()
    if (pending) {
      if (pending.completed) {
        // Blockchain đã submit nhưng clearPendingTrip chưa chạy kịp — chỉ cần xóa
        await clearPendingTrip().catch(() => {})
      } else if (pending.memo27Base64 && pending.rating != null) {
        // Cần re-submit blockchain
        isAnimatingRef.current = true
        setGoingOnline(true)
        startSpinner()

        let success = false
        try {
          const key = await getEncryptedKey()
          if (key) {
            for (let i = 0; i < 3; i++) {
              try {
                await Promise.race([
                  recordTrip({ driverUid: pending.driverUid, rating: pending.rating as RatingValue, tripPrice: pending.tripPrice, memo27bytes: pending.memo27Base64!, isCancelled: false, encryptedPrivateKey: key }),
                  new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 8000)),
                ])
                success = true
                break
              } catch {
                if (i < 2) await new Promise<void>(r => setTimeout(r, 3000))
              }
            }
          }
        } catch {}

        if (!success) {
          spinRef.current?.stop()
          spinRef.current = null
          setGoingOnline(false)
          isAnimatingRef.current = false
          showAlert('Không thể xử lý', 'Không thể ghi chuyến lên blockchain. Vui lòng thử lại.')
          return
        }

        await clearPendingTrip()
        spinRef.current?.stop()
        spinRef.current = null
        setGoingOnline(false)
        isAnimatingRef.current = false
        showAlert('Thông báo', 'Đã ghi chuyến thành công.', [
          { text: 'OK', onPress: () => goOnline() },
        ])
        return
      } else {
        // Format cũ không đủ dữ liệu re-submit — xóa để không block mãi
        await clearPendingTrip().catch(() => {})
      }
    }

    goOnline()
  }

  function goOnline() {
    if (!driverInfo) return
    isAnimatingRef.current = true
    setGoingOnline(true)
    navigatingRef.current = true
    startSpinner()
    setDriverPendingTrip(driverInfo.uid, false).catch(() => {})
    SecureStore.setItemAsync(
      SecureStoreKey.DRIVER_INFO,
      JSON.stringify({ ...driverInfo, status: 'ready' as DriverStatus }),
    ).catch(() => {})
    updateDriverStatus(driverInfo.uid, 'ready').catch(() => {})
    setTimeout(() => router.push('/(driver)/online'), 500)
    isAnimatingRef.current = false
  }

  const balanceDisplay = Number.isInteger(odcBalance) ? String(odcBalance) : odcBalance.toFixed(2)
  const spinRotate = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const showSpinArc = isInitializing || goingOnline

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
      <NetworkAlert visible={showWifiAlert} onDismiss={() => setShowWifiAlert(false)} />

      {/* ── Header card ── */}
      <View style={styles.headerCard}>
        <View style={styles.headerLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>
              {driverInfo?.name?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.driverName} numberOfLines={1}>{driverInfo?.name ?? '…'}</Text>
            <Text style={styles.ratingText}>★ {driverInfo?.rating?.toFixed(1) ?? '–'}</Text>
          </View>
        </View>

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

      <View style={{ flex: 1 }} />

      <View style={{ marginTop: -48, alignItems: 'center' }}>
        <Image
          source={require('../../assets/logo_od.png')}
          style={styles.sloganLogo}
          resizeMode="contain"
        />
        <Text style={styles.slogan}>{t('roleSelect.slogan')}</Text>
      </View>
      <Text style={styles.greeting}>
        {t('driver.greeting', { name: driverInfo?.name?.split(' ').pop() ?? 'bạn' })}
      </Text>
      <Text style={styles.subGreeting}>{t('driver.readyQuestion')}</Text>

      <View style={{ height: 20 }} />

      {/* ── Button area ── */}
      <View style={styles.btnArea}>
        <View style={styles.trackRing} />
        {showSpinArc && (
          <Animated.View style={[styles.spinArc, { transform: [{ rotate: spinRotate }] }]} />
        )}
        <TouchableOpacity
          style={styles.readyBtn}
          onPress={handleButtonPress}
          activeOpacity={0.82}
          disabled={isInitializing || goingOnline}
        >
          <Text style={styles.readyLabel}>
            {t('driver.readyOff')}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.statusLine}>
        {isInitializing
          ? 'Đang khởi động…'
          : t(`driver.status.${driverInfo?.status ?? 'offline'}`)}
      </Text>

      <View style={{ flex: 2 }} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F7F9FD',
    alignItems: 'center',
  },

  // ── Header card ──
  headerCard: {
    alignSelf: 'stretch',
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
      ios: { shadowColor: BRAND, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 10 },
      android: { elevation: 0 },
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
  },

  sloganLogo: {
    width:        144,
    height:       144,
    marginBottom: -22,
  },
  slogan: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND,
    marginBottom: 6,
  },
  subGreeting: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 0,
    alignSelf: 'stretch',
    textAlign: 'center',
    paddingHorizontal: 24,
  },

  // ── Button area ──
  btnArea: {
    width: RING_SIZE + 8,
    height: RING_SIZE + 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackRing: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    borderColor: '#E2E8F0',
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
  readyBtn: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  readyLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: BRAND,
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.5,
  },
  statusLine: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 0.3,
  },
})
