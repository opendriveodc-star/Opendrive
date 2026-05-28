// app/(driver)/online.tsx

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput, Switch,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, Animated, Easing, Dimensions, StatusBar, PanResponder,
} from 'react-native'
import { showAlert } from '../../src/components/GlobalAlert'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as SecureStore from 'expo-secure-store'
import * as Notifications from 'expo-notifications'
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { rtdb } from '../../src/services/firebase'
import * as ExpoLocation from 'expo-location'
import { updateDriverStatus, updateDriverLocation, setDriverPendingTrip } from '../../src/services/firestore'
import { getCurrentLocation, distanceKm, geohashForQuery } from '../../src/services/location'
import { LOCATION } from '../../src/constants'
import { hasEnoughODC, getODCBalance } from '../../src/services/odc'
import { maskPhone } from '../../src/utils/format'
import { savePendingTrip, getDriverInfo } from '../../src/utils/storage'
import MapView from '../../src/components/MapView'
import type { MapViewHandle } from '../../src/components/MapView'
import {
  SecureStoreKey, AsyncStorageKey, DriverInfo, DriverStatus,
  TripRealtimeInfo, TripQuote, AutoQuoteSettings,
  DEFAULT_AUTO_QUOTE_SETTINGS, PendingTrip,
} from '../../src/types'

const { height: SCREEN_H } = Dimensions.get('window')
const L1_VISIBLE_H  = Math.round(SCREEN_H * 0.44) + 7  // chiều cao hiển thị ở level 1
const HEADER_H      = 82   // chiều cao header card (không tính safe area)
const L2_GAP        = 120  // khoảng cách từ đáy header đến đỉnh sheet ở level 2
const BRAND         = '#1A2E5E'
const BRAND_LIGHT   = '#E8EDF6'

type CardState = 'idle' | 'expanded' | 'quoted'

interface TripCard {
  tripId:     string
  info:       TripRealtimeInfo | null
  loading:    boolean
  cardState:  CardState
  priceInput: string
  autoQuoted: boolean
}

function isPeakHour(s: AutoQuoteSettings): boolean {
  if (!s.peakHourEnabled) return false
  const now = new Date()
  const cur = now.getHours() * 60 + now.getMinutes()
  const [sh, sm] = (s.peakHourStart ?? '00:00').split(':').map(Number)
  const [eh, em] = (s.peakHourEnd   ?? '00:00').split(':').map(Number)
  const start = sh * 60 + sm
  const end   = eh * 60 + em
  // hỗ trợ khung qua đêm (vd: 22:00 → 05:00)
  return start <= end ? (cur >= start && cur <= end) : (cur >= start || cur <= end)
}

function calcAutoPrice(info: TripRealtimeInfo, s: AutoQuoteSettings): number {
  const km    = info.estimatedKm ?? 0
  const extra = Math.max(0, km - s.baseKm) * s.pricePerKm
  let price   = s.basePrice + extra
  if (s.rainModeEnabled) price *= s.rainMultiplier
  if (isPeakHour(s))     price *= s.peakHourMultiplier
  return Math.round(price / 1000) * 1000
}

export default function OnlineScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const mapRef = useRef<MapViewHandle>(null)
  const { expandTripId } = useLocalSearchParams<{ expandTripId?: string }>()
  const pendingExpandRef = useRef<string | null>(expandTripId ?? null)

  const [driverName,   setDriverName]   = useState('')
  const [driverRating, setDriverRating] = useState(0)
  const [odcBalance,   setOdcBalance]   = useState(0)
  const [mapInit,      setMapInit]      = useState<{ lat: number; lng: number } | null>(null)
  const [trips,        setTrips]        = useState<TripCard[]>([])
  const [autoSettings, setAutoSettings] = useState<AutoQuoteSettings>(DEFAULT_AUTO_QUOTE_SETTINGS)
  const [sheetLevel,   setSheetLevel]   = useState<0|1|2>(0)
  const [quotingTripId, setQuotingTripId] = useState<string | null>(null)
  const [quotingPrice,  setQuotingPrice]  = useState('')

  const driverInfoRef   = useRef<DriverInfo | null>(null)
  const odcBalanceRef   = useRef(0)
  const autoSettingsRef = useRef<AutoQuoteSettings>(DEFAULT_AUTO_QUOTE_SETTINGS)
  const lastPosRef          = useRef<{ lat: number; lng: number } | null>(null)
  const activeMarkerTripRef = useRef<string | null>(null)
  const processingTrips = useRef<Set<string>>(new Set())
  const sheetLevelRef   = useRef<0|1|2>(0)
  const mountDone       = useRef(false)

  // Snap points – tính sau khi có insets
  const sheetHRef = useRef(SCREEN_H)   // chiều cao thực của sheet
  const l0YRef    = useRef(SCREEN_H - 60)
  const l1YRef    = useRef(SCREEN_H - L1_VISIBLE_H)
  const [sheetH,  setSheetH]  = useState(SCREEN_H)

  // Sheet animation – bắt đầu ngoài màn hình, trượt vào sau mount
  const sheetAnim = useRef(new Animated.Value(SCREEN_H)).current

  useEffect(() => { odcBalanceRef.current   = odcBalance    }, [odcBalance])
  useEffect(() => { autoSettingsRef.current = autoSettings  }, [autoSettings])
  useEffect(() => { sheetLevelRef.current   = sheetLevel    }, [sheetLevel])

  // Tính lại snap points khi insets thay đổi
  useEffect(() => {
    const h = Math.max(300, SCREEN_H - insets.bottom - (insets.top + HEADER_H + L2_GAP))
    sheetHRef.current = h
    setSheetH(h)
    l0YRef.current = h - 60
    l1YRef.current = Math.max(0, h - L1_VISIBLE_H)
  }, [insets.top, insets.bottom])

  // Reload driver info + settings mỗi khi quay lại màn hình (từ Settings / driver-info)
  useFocusEffect(
    React.useCallback(() => {
      getDriverInfo().then(info => {
        if (!info) return
        driverInfoRef.current = info
        setDriverName(info.name)
        setDriverRating(info.rating)
      })
      AsyncStorage.getItem(AsyncStorageKey.AUTO_QUOTE_SETTINGS).then(raw => {
        if (!raw) return
        const s = { ...JSON.parse(raw) as AutoQuoteSettings, rainModeEnabled: false }
        setAutoSettings(s)
        autoSettingsRef.current = s
      })
    }, [])
  )

  // PanResponder cho handle – kéo lên/xuống, 3 snap points
  const handlePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  (_, gs) => Math.abs(gs.dy) > 6,
      onPanResponderGrant: () => { sheetAnim.stopAnimation() },
      onPanResponderMove: (_, gs) => {
        const base = sheetLevelRef.current === 0 ? l0YRef.current
                   : sheetLevelRef.current === 1 ? l1YRef.current
                   : 0
        const next = Math.max(0, Math.min(l0YRef.current, base + gs.dy))
        sheetAnim.setValue(next)
      },
      onPanResponderRelease: (_, gs) => {
        const lv = sheetLevelRef.current
        if (Math.abs(gs.dy) < 6 && Math.abs(gs.dx) < 6) {
          if (lv === 0)      openSheet()
          else if (lv === 1) expandSheet()
          else               closeSheet()
        } else if (gs.dy < -20 || gs.vy < -0.3) {
          if (lv === 0)      openSheet()
          else               expandSheet()
        } else if (gs.dy > 20 || gs.vy > 0.3) {
          if (lv === 2)      openSheet()
          else               closeSheet()
        }
      },
    })
  ).current

  // Trượt panel vào sau khi insets sẵn sàng (chỉ 1 lần)
  useEffect(() => {
    if (mountDone.current || insets.top === 0) return
    mountDone.current = true
    sheetAnim.setValue(sheetHRef.current + 80)
    Animated.timing(sheetAnim, {
      toValue: l0YRef.current,
      duration: 320,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start()
  }, [insets.top])

  function navigateAway(path: string) {
    if (path === '/(driver)/home') {
      router.replace('/(driver)/home')
    } else {
      Animated.timing(sheetAnim, {
        toValue: sheetHRef.current + 80,
        duration: 220,
        useNativeDriver: true,
        easing: Easing.in(Easing.cubic),
      }).start(() => router.replace(path as any))
    }
  }

  // Auto-expand sheet khi có chuyến mới
  useEffect(() => {
    if (trips.length > 0 && sheetLevel === 0) {
      openSheet()
    } else if (trips.length === 0 && sheetLevel > 0) {
      closeSheet()
    }
  }, [trips.length])

  // Tính padding MapLibre theo level sheet hiện tại
  function visiblePad(level: 0|1|2) {
    return {
      top:    insets.top + HEADER_H,
      bottom: level === 0 ? 60 + insets.bottom
            : level === 1 ? L1_VISIBLE_H + insets.bottom
            : sheetHRef.current + insets.bottom,
    }
  }

  function openSheet() {
    setSheetLevel(1)
    sheetLevelRef.current = 1
    const { top, bottom } = visiblePad(1)
    const last = lastPosRef.current
    if (last) mapRef.current?.panTo(last.lat, last.lng, top, bottom)
    Animated.timing(sheetAnim, {
      toValue: l1YRef.current,
      duration: 280,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start()
  }

  function expandSheet() {
    setSheetLevel(2)
    sheetLevelRef.current = 2
    const { top, bottom } = visiblePad(2)
    const last = lastPosRef.current
    if (last) mapRef.current?.panTo(last.lat, last.lng, top, bottom)
    Animated.timing(sheetAnim, {
      toValue: 0,
      duration: 280,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start()
  }

  function closeSheet() {
    setSheetLevel(0)
    sheetLevelRef.current = 0
    const { top, bottom } = visiblePad(0)
    const last = lastPosRef.current
    if (last) mapRef.current?.panTo(last.lat, last.lng, top, bottom)
    Animated.timing(sheetAnim, {
      toValue: l0YRef.current,
      duration: 250,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start()
  }

  function toggleSheet() {
    sheetLevel === 0 ? openSheet() : closeSheet()
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => { init() }, [])

  async function init() {
    const raw = await SecureStore.getItemAsync(SecureStoreKey.DRIVER_INFO)
    if (!raw) { router.replace('/(driver)/home'); return }
    const info: DriverInfo = JSON.parse(raw)
    driverInfoRef.current = info
    setDriverName(info.name)
    setDriverRating(info.rating)


    // Render map NGAY – ưu tiên: cached GPS → AsyncStorage → default VN center
    let initLat = 10.7769, initLng = 106.7009   // fallback: TP.HCM
    try {
      const stored = await AsyncStorage.getItem('last_gps_pos')
      if (stored) { const p = JSON.parse(stored); initLat = p.lat; initLng = p.lng }
    } catch {}
    try {
      const last = await ExpoLocation.getLastKnownPositionAsync()
      if (last) { initLat = last.coords.latitude; initLng = last.coords.longitude }
    } catch {}
    setMapInit({ lat: initLat, lng: initLng })
    lastPosRef.current = { lat: initLat, lng: initLng }

    // Các tác vụ mạng chạy song song – không block map
    const [balance, settingsRaw] = await Promise.all([
      getODCBalance(info.stellarWallet).catch(() => 0),
      AsyncStorage.getItem(AsyncStorageKey.AUTO_QUOTE_SETTINGS),
    ])
    setOdcBalance(balance)

    if (settingsRaw) {
      const s = { ...JSON.parse(settingsRaw) as AutoQuoteSettings, rainModeEnabled: false }
      setAutoSettings(s)
      autoSettingsRef.current = s
      await AsyncStorage.setItem(AsyncStorageKey.AUTO_QUOTE_SETTINGS, JSON.stringify(s))
    }

    // Đảm bảo Firestore luôn sync status=ready — retry 3 lần nếu mạng chậm
    ;(async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await updateDriverStatus(info.uid, 'ready')
          await SecureStore.setItemAsync(
            SecureStoreKey.DRIVER_INFO,
            JSON.stringify({ ...info, status: 'ready' as DriverStatus }),
          )
          return
        } catch {
          if (i < 2) await new Promise<void>(r => setTimeout(r, 2000))
        }
      }
    })()

    // GPS chính xác trong nền – dùng panTo thay vì setMapInit để tránh re-render
    try {
      const { lat, lng } = await getCurrentLocation()
      lastPosRef.current = { lat, lng }
      const { top, bottom } = visiblePad(sheetLevelRef.current)
      mapRef.current?.panTo(lat, lng, top, bottom)
      updateDriverLocation(info.uid, geohashForQuery(lat, lng)).catch(() => {})
      AsyncStorage.setItem('last_gps_pos', JSON.stringify({ lat, lng })).catch(() => {})
    } catch {}

    if (pendingExpandRef.current) {
      const tid = pendingExpandRef.current
      pendingExpandRef.current = null
      addTrip(tid, true)
    }
  }

  // ── Cập nhật vị trí – watchPositionAsync (GPS listener native, không cần mạng) ──
  useEffect(() => {
    let mounted = true
    let locationSub: ExpoLocation.LocationSubscription | null = null

    // GPS listener: callback mỗi khi di chuyển ≥3m hoặc mỗi 2s
    ExpoLocation.watchPositionAsync(
      { accuracy: ExpoLocation.Accuracy.High, timeInterval: 2000 },
      ({ coords }) => {
        if (!mounted) return
        const { latitude: lat, longitude: lng } = coords
        mapRef.current?.updateDriverMarker(lat, lng)
        lastPosRef.current = { lat, lng }
      },
    ).then(sub => {
      if (!mounted) sub.remove()
      else locationSub = sub
    }).catch(() => {})

    // Firestore geohash: 60s/lần, chỉ khi di chuyển >1km so với lần ghi trước
    const lastFirestorePos = { lat: 0, lng: 0 }
    const firestoreInterval = setInterval(() => {
      const drv  = driverInfoRef.current
      const last = lastPosRef.current
      if (!drv || !last) return
      if (lastFirestorePos.lat !== 0 && distanceKm(lastFirestorePos.lat, lastFirestorePos.lng, last.lat, last.lng) < 1) return
      lastFirestorePos.lat = last.lat
      lastFirestorePos.lng = last.lng
      updateDriverLocation(drv.uid, geohashForQuery(last.lat, last.lng)).catch(() => {})
    }, LOCATION.UPDATE_INTERVAL_MS)

    return () => {
      mounted = false
      locationSub?.remove()
      clearInterval(firestoreInterval)
    }
  }, [])

  // ── FCM listeners ────────────────────────────────────────────────────────────
  useEffect(() => {
    const sub     = Notifications.addNotificationReceivedListener(onForegroundNotif)
    const subResp = Notifications.addNotificationResponseReceivedListener(onNotifResponse)
    return () => {
      sub.remove()
      subResp.remove()
    }
  }, [])

  function onForegroundNotif(n: Notifications.Notification) {
    const data = n.request.content.data as Record<string, string> | undefined
    if (!data) return
    if (data.type === 'new_trip'      && data.tripId) addTrip(data.tripId)
    if (data.type === 'trip_selected' && data.tripId) handleTripSelected(data.tripId)
  }

  function onNotifResponse(r: Notifications.NotificationResponse) {
    const data = r.notification.request.content.data as Record<string, string> | undefined
    if (!data) return
    if (data.type === 'new_trip'      && data.tripId) addTrip(data.tripId, true)
    if (data.type === 'trip_selected' && data.tripId) handleTripSelected(data.tripId)
  }

  // ── Thêm chuyến mới ──────────────────────────────────────────────────────────
  const addTrip = useCallback(async (tripId: string, autoExpand = false) => {
    if (processingTrips.current.has(tripId)) return
    processingTrips.current.add(tripId)
    setTrips(prev => [...prev, { tripId, info: null, loading: true, cardState: 'idle', priceInput: '', autoQuoted: false }])
    try {
      const info = await rtdb.get<TripRealtimeInfo>(`trips/${tripId}/info`)
      console.log('[addTrip] tripId:', tripId, 'info:', JSON.stringify(info))
      if (!info || info.status !== 'waiting') {
        console.log('[addTrip] removed – info null or status:', info?.status)
        processingTrips.current.delete(tripId)
        setTrips(prev => prev.filter(t => t.tripId !== tripId))
        return
      }
      const s   = autoSettingsRef.current
      const drv = driverInfoRef.current
      const bal = odcBalanceRef.current
      if (s.autoQuoteEnabled && drv) {
        const autoPrice = calcAutoPrice(info, s)
        if (hasEnoughODC(autoPrice, bal)) {
          await submitQuote(tripId, autoPrice, drv)
          setTrips(prev => prev.map(t => t.tripId === tripId
            ? { ...t, info, loading: false, cardState: 'quoted', priceInput: String(autoPrice).replace(/\B(?=(\d{3})+(?!\d))/g, '.'), autoQuoted: true }
            : t,
          ))
          return
        }
      }
      const initialState: CardState = autoExpand ? 'expanded' : 'idle'
      setTrips(prev => prev.map(t => t.tripId === tripId ? { ...t, info, loading: false, cardState: initialState } : t))
    } catch (e) {
      console.log('[addTrip] catch error:', String(e))
      processingTrips.current.delete(tripId)
      setTrips(prev => prev.filter(t => t.tripId !== tripId))
    }
  }, [])

  // ── Gửi báo giá ─────────────────────────────────────────────────────────────
  async function submitQuote(tripId: string, price: number, drv: DriverInfo) {
    const quote: TripQuote = {
      driverUid:    drv.uid,
      driverName:   drv.name,
      vehicleBrand: drv.vehicleBrand,
      vehicleColor: drv.vehicleColor ?? '',
      licensePlate: drv.licensePlate,
      avatarUrl:    drv.avatarUrl,
      rating:       drv.rating,
      ratingCount:  drv.ratingCount,
      quotedPrice:  price,
      createdAt:    Date.now(),
      driverLat:    lastPosRef.current?.lat,
      driverLng:    lastPosRef.current?.lng,
    }
    await rtdb.set(`trips/${tripId}/quotes/${drv.uid}`, quote)
  }

  async function handleFloatingQuote() {
    if (!quotingTripId) return
    await handleManualQuote(quotingTripId, quotingPrice)
    setQuotingTripId(null)
    setQuotingPrice('')
  }

  async function handleManualQuote(tripId: string, priceStr: string) {
    const price = parseInt(priceStr.replace(/\./g, ''), 10)
    if (!price || price <= 0) { showAlert(t('common.error'), 'Vui lòng nhập giá hợp lệ'); return }
    if (!hasEnoughODC(price, odcBalanceRef.current)) {
      showAlert(t('common.error'), t('error.insufficientODC'))
      return
    }
    const drv = driverInfoRef.current
    if (!drv) return
    try {
      await submitQuote(tripId, price, drv)
      setTrips(prev => prev.map(t => t.tripId === tripId
        ? { ...t, cardState: 'quoted', priceInput: priceStr }
        : t,
      ))
    } catch {
      showAlert(t('common.error'), t('error.serverError'))
    }
  }

  function handleCancelQuote(tripId: string) {
    showAlert(
      t('online.cancelQuoteConfirmTitle'),
      t('online.cancelQuoteConfirmMsg'),
      [
        {
          text: t('common.confirm'),
          onPress: async () => {
            const drv = driverInfoRef.current
            if (!drv) return
            try {
              await rtdb.delete(`trips/${tripId}/quotes/${drv.uid}`)
              setTrips(prev => prev.filter(t => t.tripId !== tripId))
              if (activeMarkerTripRef.current === tripId) {
                mapRef.current?.hideCustomerMarker()
                activeMarkerTripRef.current = null
              }
            } catch {
              showAlert(t('common.error'), t('error.serverError'))
            }
          },
        },
        { text: t('common.cancel') },
      ],
    )
  }

  // ── Được khách chọn ──────────────────────────────────────────────────────────
  async function handleTripSelected(tripId: string) {
    const drv = driverInfoRef.current
    if (!drv) { console.log('[selected] no driverInfo'); return }
    try {
      console.log('[selected] fetching tripInfo + quote for', tripId, drv.uid)
      const [tripInfo, quote] = await Promise.all([
        rtdb.get<TripRealtimeInfo>(`trips/${tripId}/info`),
        rtdb.get<TripQuote>(`trips/${tripId}/quotes/${drv.uid}`),
      ])
      console.log('[selected] tripInfo:', !!tripInfo, 'quote:', !!quote, quote?.quotedPrice)
      if (!tripInfo || !quote) { console.log('[selected] missing data, abort'); return }
      const pending: PendingTrip = {
        tripId,
        driverUid:     drv.uid,
        tripPrice:     quote.quotedPrice,
        startedAt:     new Date().toISOString(),
        pickupGeohash: tripInfo.pickupGeohash,
        dropGeohash:   tripInfo.dropGeohash,
        pickupLat:     tripInfo.pickupLat ?? 0,
        pickupLng:     tripInfo.pickupLng ?? 0,
        customerPhone: tripInfo.customerPhone,
        rating:        null,
      }
      console.log('[selected] savePendingTrip...')
      await savePendingTrip(pending)
      setDriverPendingTrip(drv.uid, true).catch(() => {})
      console.log('[selected] updateDriverStatus busy...')
      await updateDriverStatus(drv.uid, 'busy')
      const freshInfo = await getDriverInfo()
      await SecureStore.setItemAsync(
        SecureStoreKey.DRIVER_INFO,
        JSON.stringify({ ...(freshInfo ?? drv), status: 'busy' as DriverStatus }),
      )
      console.log('[selected] navigate trip...')
      navigateAway('/(driver)/trip')
    } catch (e) {
      console.log('[selected] ERROR:', String(e))
      showAlert(t('common.error'), t('error.serverError'))
    }
  }

  // ── Tắt sẵn sàng ────────────────────────────────────────────────────────────
  async function handleGoOffline() {
    const drv = driverInfoRef.current
    if (!drv) return
    try {
      await updateDriverStatus(drv.uid, 'offline')
      const freshInfo = await getDriverInfo()
      await SecureStore.setItemAsync(
        SecureStoreKey.DRIVER_INFO,
        JSON.stringify({ ...(freshInfo ?? drv), status: 'offline' as DriverStatus }),
      )
      navigateAway('/(driver)/home')
    } catch {
      showAlert(t('common.error'), t('error.serverError'))
    }
  }

  async function toggleAutoQuote() {
    const updated = { ...autoSettings, autoQuoteEnabled: !autoSettings.autoQuoteEnabled }
    setAutoSettings(updated)
    autoSettingsRef.current = updated
    await AsyncStorage.setItem(AsyncStorageKey.AUTO_QUOTE_SETTINGS, JSON.stringify(updated))
  }

  async function toggleRainMode() {
    const updated = { ...autoSettings, rainModeEnabled: !autoSettings.rainModeEnabled }
    setAutoSettings(updated)
    autoSettingsRef.current = updated
    await AsyncStorage.setItem(AsyncStorageKey.AUTO_QUOTE_SETTINGS, JSON.stringify(updated))
  }

  // ── Render card chuyến ───────────────────────────────────────────────────────
  function renderCard({ item }: { item: TripCard }) {
    if (item.loading || !item.info) {
      return <View style={styles.card}><ActivityIndicator color={BRAND} size="small" /></View>
    }
    const { info }   = item
    const shortId    = item.tripId.slice(0, 8).toUpperCase()
    const isQuoted = item.cardState === 'quoted'

    function panToPickup() {
      if (!info.pickupLat || !info.pickupLng) return
      activeMarkerTripRef.current = item.tripId
      mapRef.current?.showCustomerMarker(info.pickupLat, info.pickupLng)
      const drv = lastPosRef.current
      if (drv) {
        mapRef.current?.fitBoundsToMarkers(info.pickupLat, info.pickupLng, drv.lat, drv.lng)
      } else {
        mapRef.current?.panTo(info.pickupLat, info.pickupLng)
      }
    }

    return (
      <TouchableOpacity style={styles.card} onPress={panToPickup} activeOpacity={0.88}>
        {/* Hàng 1: mã chuyến - khoảng cách + giá */}
        <View style={styles.cardIdRow}>
          <View style={styles.cardIdLeft}>
            <View style={styles.hashBadge}><Text style={styles.hashText}>#</Text></View>
            <Text style={styles.cardId} numberOfLines={1}>
              {shortId}
              <Text style={styles.cardIdLabel}> - </Text>
              {info.estimatedKm?.toFixed(1) ?? '?'} km
            </Text>
          </View>
          {isQuoted && (
            <View style={styles.quotedInline}>
              <Ionicons name="checkmark-circle" size={13} color="#15803D" />
              <Text style={styles.quotedPriceBold}> {item.priceInput}đ</Text>
            </View>
          )}
        </View>
        {/* Hàng 2: địa chỉ (cột trái) + nút (phải, căn dưới) */}
        <View style={styles.cardBottomRow}>
          <View style={{ flex: 1 }}>
            {!!info.pickupAddress && (
              <View style={[styles.cardAddrRow, { marginTop: 2 }]}>
                <Ionicons name="location-sharp" size={12} color={BRAND} />
                <Text style={styles.cardAddr} numberOfLines={1}> {info.pickupAddress}</Text>
              </View>
            )}
            {!!info.destAddress && (
              <View style={[styles.cardAddrRow, { marginTop: 2 }]}>
                <Ionicons name="location-sharp" size={12} color="#94A3B8" />
                <Text style={styles.cardAddr} numberOfLines={1}> {info.destAddress}</Text>
              </View>
            )}
            {!!info.note && (
              <View style={[styles.cardAddrRow, { marginTop: 3 }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={12} color="#F59E0B" />
                <Text style={styles.noteContent} numberOfLines={2}> <Text style={{ fontWeight: '700', fontStyle: 'normal' }}>Ghi chú:</Text> {info.note}</Text>
              </View>
            )}
          </View>
          {isQuoted ? (
            <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancelQuote(item.tripId)}>
              <Text style={styles.cancelBtnText}>{t('online.cancelQuote')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.quoteBtn}
              onPress={() => { setQuotingTripId(item.tripId); setQuotingPrice('') }}
            >
              <Text style={styles.quoteBtnText}>{t('online.quote')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  // ── UI ───────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
      {/* Bản đồ full màn hình – chỉ render 1 lần khi có GPS, update sau qua injectJavaScript */}
      <View style={StyleSheet.absoluteFill}>
        {mapInit && (
          <MapView
            ref={mapRef}
            lat={mapInit.lat}
            lng={mapInit.lng}
            onMapReady={() => mapRef.current?.setBottomPadding(68)}
          />
        )}
      </View>

      {/* Header overlay */}
      <SafeAreaView style={styles.overlay} edges={['top']} pointerEvents="box-none">
        <View style={styles.headerCard}>
          {/* Avatar + tên + rating */}
          <View style={styles.headerLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarLetter}>
                {driverName?.[0]?.toUpperCase() ?? '?'}
              </Text>
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.driverName} numberOfLines={1}>{driverName}</Text>
              <Text style={styles.ratingText}>★ {driverRating.toFixed(1)}</Text>
            </View>
          </View>

          {/* ODC balance + settings */}
          <View style={styles.headerRight}>
            <View style={styles.balanceStack}>
              <View style={styles.balanceLabelRow}>
                <Ionicons name="wallet-outline" size={15} color={BRAND} />
                <Text style={styles.balanceODC}>ODC</Text>
              </View>
              <Text style={styles.balanceText}>{odcBalance % 1 === 0 ? odcBalance : odcBalance.toFixed(2)}</Text>
            </View>
            <View style={styles.headerDivider} />
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => router.push('/(driver)/settings')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="settings-outline" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* Floating báo giá – giữa vùng bản đồ trống */}
      {quotingTripId && (
        <View
          style={[
            styles.quotingOverlay,
            { top: Math.round((insets.top + HEADER_H + L2_GAP + (SCREEN_H - insets.bottom - (insets.top + HEADER_H + L2_GAP)) / 2) - 100) },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.quotingCard}>
            <Text style={styles.quotingTitle}>{t('online.quote')}</Text>
            <View style={styles.quotingInputRow}>
              <TextInput
                style={styles.quotingInput}
                placeholder="Nhập giá mong muốn của bạn"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                value={quotingPrice}
                autoFocus
                onChangeText={v => {
                  const digits = v.replace(/\D/g, '')
                  setQuotingPrice(digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.'))
                }}
              />
              <Text style={styles.quotingUnit}>đ</Text>
            </View>
            <View style={styles.quotingBtnRow}>
              <TouchableOpacity style={styles.quotingSendBtn} onPress={handleFloatingQuote}>
                <Text style={styles.quotingSendText}>{t('online.sendQuote')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quotingCloseBtn} onPress={() => { setQuotingTripId(null); setQuotingPrice('') }}>
                <Text style={styles.quotingCloseBtnText}>Đóng</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Bottom sheet – danh sách chuyến */}
      <Animated.View
        style={[
          styles.sheet,
          { bottom: insets.bottom, height: sheetH },
          { transform: [{ translateY: sheetAnim }] },
        ]}
      >
        {/* Handle + header – kéo lên/xuống hoặc tap để toggle */}
        <View style={styles.sheetHandle} {...handlePan.panHandlers}>
          <View style={styles.handleBar} />
          <View style={styles.sheetHeaderRow}>
            {/* Nút tắt sẵn sàng + badge số chuyến */}
            <View style={styles.sheetTitleWrap}>
              <TouchableOpacity style={styles.offlineBtn} onPress={handleGoOffline}>
                <Ionicons name="power" size={13} color="#fff" />
                <Text style={styles.offlineBtnText}>{t('online.goOffline')}</Text>
              </TouchableOpacity>
              {trips.length > 0 && (
                <View style={styles.tripBadge}>
                  <Text style={styles.tripBadgeText}>{trips.length}</Text>
                </View>
              )}
            </View>

            {/* Toggle mưa */}
            <View style={styles.autoToggleWrap}>
              <Ionicons name="rainy-outline" size={15} color="#64748B" />
              <Text style={styles.autoToggleLabel}>{t('autoQuote.rainMode')}</Text>
              <Switch
                value={autoSettings.rainModeEnabled}
                onValueChange={toggleRainMode}
                thumbColor={autoSettings.rainModeEnabled ? '#fff' : '#94A3B8'}
                trackColor={{ false: '#CBD5E1', true: BRAND }}
                ios_backgroundColor="#CBD5E1"
              />
            </View>
          </View>
        </View>

        {/* List */}
        <FlatList
          data={trips}
          keyExtractor={item => item.tripId}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="car-outline" size={40} color="#CBD5E1" />
              <Text style={styles.emptyText}>{t('online.empty')}</Text>
            </View>
          }
        />
      </Animated.View>

      {/* Nút định vị – render SAU sheet để luôn nổi lên trên */}
      <TouchableOpacity
        style={[styles.locateBtn, { top: insets.top + 80 }]}
        onPress={() => {
          const last = lastPosRef.current
          if (!last) return
          const { top, bottom } = visiblePad(sheetLevelRef.current)
          mapRef.current?.panTo(last.lat, last.lng, top, bottom)
        }}
      >
        <Ionicons name="locate" size={18} color={BRAND} />
      </TouchableOpacity>
    </KeyboardAvoidingView>
  )
}

function DetailRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, highlight && styles.detailHighlight]} numberOfLines={3}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#E8EDF6',
  },

  // ── Header overlay ──
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginTop: 10,
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    gap: 10,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E2E8F0',
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
  balanceText: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  locateBtn: {
    position: 'absolute',
    right: 28,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 25,
  },
  offlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: BRAND,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  offlineBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Bottom sheet ──
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 20,
  },
  sheetHandle: {
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tripBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  autoToggleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  autoToggleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  autoPinText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  listContent: {
    padding: 14,
    gap: 10,
    paddingBottom: 32,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 40,
    gap: 12,
  },
  emptyText: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 22,
  },

  // ── Floating báo giá ──
  quotingOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 50,
  },
  quotingCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 12,
    gap: 12,
  },
  quotingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: BRAND,
    textAlign: 'center',
    marginBottom: 2,
  },
  quotingInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND_LIGHT,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 0,
    gap: 4,
  },
  quotingInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '400',
    color: BRAND,
    paddingVertical: 8,
  },
  quotingUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND,
  },
  quotingBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quotingSendBtn: {
    flex: 7,
    backgroundColor: BRAND,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  quotingCloseBtn: {
    flex: 3,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  quotingSendText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  quotingCloseBtnText: {
    color: '#64748B',
    fontWeight: '700',
    fontSize: 14,
  },

  // ── Card chuyến ──
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  cardIdLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  hashBadge: {
    width: 14, height: 14, borderRadius: 3,
    backgroundColor: BRAND,
    alignItems: 'center', justifyContent: 'center',
  },
  hashText: { fontSize: 9, fontWeight: '800', color: '#fff', lineHeight: 14 },
  cardIdRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  cardIdLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '400',
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 1,
    gap: 8,
  },
  cardId: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND,
    flexShrink: 1,
  },
  quotedPriceBold: {
    fontSize: 15,
    fontWeight: '800',
    color: '#15803D',
  },
  cardAddrRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  noteContent: {
    fontSize: 13,
    color: '#92400E',
    fontStyle: 'italic',
    lineHeight: 17,
    flex: 1,
  },
  cardAddr: {
    fontSize: 13,
    lineHeight: 17,
    color: '#475569',
    flex: 1,
  },
  quoteBtn: {
    backgroundColor: BRAND,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    marginBottom: 2,
  },
  quoteBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  quotedInline: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expandedArea: {
    marginTop: 12,
    gap: 10,
  },
  detailSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
  },
  detailLabel: {
    fontSize: 12,
    color: '#94A3B8',
    width: 72,
    flexShrink: 0,
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    textAlign: 'right',
  },
  detailHighlight: {
    color: BRAND,
  },
  priceInput: {
    flex: 1,
    backgroundColor: BRAND_LIGHT,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    fontWeight: '600',
    color: BRAND,
  },
  sendBtn: {
    backgroundColor: BRAND,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  sendBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quotedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cancelBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    marginBottom: 2,
  },
  cancelBtnText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 12,
  },
})
