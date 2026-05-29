import { useState, useEffect, useRef, useMemo } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator,
  Animated, Dimensions, Modal, PanResponder,
} from 'react-native'
import { showAlert } from '../../src/components/GlobalAlert'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import MapViewComponent, { type MapViewHandle } from '../../src/components/MapView'
import QuoteList from '../../src/components/QuoteList'
import { rtdb } from '../../src/services/firebase'
import { incrementCustomerPenalty } from '../../src/services/firestore'
import { notifyDrivers, notifySelectedDriver } from '../../src/services/cloudflare'
import {
  getCurrentLocation, reverseGeocode, searchAddresses,
  getRouteDistanceKm, geohashForQuery,
} from '../../src/services/location'
import { isOnWifi } from '../../src/services/network'
import NetworkAlert from '../../src/components/NetworkAlert'
import type { CustomerInfo, VehicleType, TripQuote, FreightInfo } from '../../src/types'
import { SecureStoreKey } from '../../src/types'
import { TRANSPORT_MODELS } from '../../src/data/vehicles'
import type { TransportModel } from '../../src/data/vehicles'
import { TRIP } from '../../src/constants'
import * as Notifications from 'expo-notifications'
import { nanoid } from '../../src/utils/nanoid'

const BRAND = '#1A2E5E'
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')

// Sheet snap levels
const HANDLE_H            = 52
const FULL_H              = Math.round(SCREEN_H * 0.85)
const PARTIAL_H_PASSENGER = 490
// freight step 3: header(52) + 2 info card(~96×2) + dist(~38) + note(~72) + button(~74) ≈ 470
const PARTIAL_H_FREIGHT   = Math.min(490, FULL_H - 4)

function getSnapY(level: 0|1|2, pH: number): number {
  if (level === 2) return 0
  if (level === 1) return FULL_H - pH
  return FULL_H - HANDLE_H
}

// Vehicle carousel card width – 3 cards vừa khít, vẫn scroll nếu thêm xe
const INNER_W = SCREEN_W - 40
const CARD_W  = Math.floor((INNER_W - 20) / 3)  // 20 = 2 gaps × 10

const INIT_LAT = 10.7769
const INIT_LNG = 106.7009

const SAVED_KEY = 'opendrive_saved_locs'

type Step = 0 | 1 | 2 | 3 | 4

interface LocPoint { lat: number; lng: number; address: string }
interface SavedLoc  { name: string; lat: number; lng: number; address: string }
interface SuggItem  { lat: number; lng: number; name: string }

// ─────────────────────────────────────────────
export default function CustomerHomeScreen() {
  const { t }    = useTranslation()
  const insets   = useSafeAreaInsets()
  const topBarH  = insets.top + 50   // safe area + buttons row

  const [step,             setStep]             = useState<Step>(0)
  const [pickup,           setPickup]           = useState<LocPoint | null>(null)
  const [dest,             setDest]             = useState<LocPoint | null>(null)
  const [pickupText,       setPickupText]       = useState('')
  const [destText,         setDestText]         = useState('')
  const [note,             setNote]             = useState('')
  const [vehicle,          setVehicle]          = useState<VehicleType>('motorbike')
  const [transportModel,   setTransportModel]   = useState<TransportModel>('passenger')

  // partialH tính thẳng từ transportModel – không bao giờ stale
  const partialH = transportModel === 'freight' ? PARTIAL_H_FREIGHT : PARTIAL_H_PASSENGER

  // Crosshair % for level 1 (default) – used as initial MapView prop
  const pinTopPct = useMemo(() => {
    const frac = (topBarH + (SCREEN_H - topBarH - partialH) / 2) / SCREEN_H
    return Math.round(frac * 100)
  }, [topBarH, partialH])
  const [senderName,       setSenderName]       = useState('')
  const [senderPhone,      setSenderPhone]      = useState('')
  const [recipientName,    setRecipientName]    = useState('')
  const [recipientPhone,   setRecipientPhone]   = useState('')
  const [distKm,           setDistKm]           = useState<number | null>(null)
  const [savedLocs,        setSavedLocs]        = useState<SavedLoc[]>([])
  const [bookLoading,      setBookLoading]      = useState(false)
  const [showWifi,         setShowWifi]         = useState(false)
  const [saveModalVisible, setSaveModalVisible] = useState(false)
  const [saveModalName,    setSaveModalName]    = useState('')
  const [saveModalPoint,   setSaveModalPoint]   = useState<LocPoint | null>(null)
  const [pickupSugg,       setPickupSugg]       = useState<SuggItem[]>([])
  const [destSugg,         setDestSugg]         = useState<SuggItem[]>([])
  const [activeTripId,     setActiveTripId]     = useState<string | null>(null)
  const [quotes,           setQuotes]           = useState<TripQuote[]>([])
  const [quotesSearching,  setQuotesSearching]  = useState(true)
  const [searchFailed,     setSearchFailed]     = useState(false)
  const [countdown,        setCountdown]        = useState(25)
  const [sheetLevel,       setSheetLevel]       = useState<0|1|2>(1)
  const [contentLevel,     setContentLevel]     = useState<0|1|2>(1)

  const mapRef          = useRef<MapViewHandle>(null)
  const partialHRef     = useRef(PARTIAL_H_PASSENGER)
  partialHRef.current   = partialH   // luôn đồng bộ với transportModel
  const panelX          = useRef(new Animated.Value(0)).current
  const sheetY          = useRef(new Animated.Value(getSnapY(1, PARTIAL_H_PASSENGER))).current
  const isAnimating     = useRef(false)
  const stepRef         = useRef<Step>(0)
  const retryPickupRef  = useRef<{ lat: number; lng: number } | null>(null)
  const sheetLvlRef     = useRef<0|1|2>(1)
  const contentLevelRef = useRef<0|1|2>(1)
  const progPan      = useRef(false)
  const mapCenter    = useRef<{ lat: number; lng: number }>({ lat: INIT_LAT, lng: INIT_LNG })
  const revTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suggTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCount    = useRef(0)
  const quotesRef    = useRef<TripQuote[]>([])
  const topBarHRef   = useRef(topBarH)

  useEffect(() => { topBarHRef.current = topBarH }, [topBarH])
  useEffect(() => { stepRef.current = step }, [step])
  useEffect(() => { quotesRef.current = quotes }, [quotes])
  useEffect(() => {
    loadSavedLocs()
    checkLockAndRetry()
    Notifications.getDevicePushTokenAsync()
      .then(td => { if (td.data) SecureStore.setItemAsync(SecureStoreKey.CUSTOMER_FCM_TOKEN, td.data as string) })
      .catch(() => {})
  }, [])
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  // Quote polling when entering step 4
  useEffect(() => {
    if (step !== 4 || !activeTripId) return
    setQuotes([])
    setQuotesSearching(true)
    setSearchFailed(false)
    setCountdown(25)
    pollCount.current = 0
    const id = activeTripId

    const timer = setInterval(async () => {
      pollCount.current++
      setCountdown(Math.max(0, 25 - pollCount.current * 5))
      try {
        const data = await rtdb.get<Record<string, TripQuote>>(`trips/${id}/quotes`)
        if (data) {
          const list = Object.values(data).sort((a, b) => a.quotedPrice - b.quotedPrice)
          if (list.length > 0) { setQuotes(list); setQuotesSearching(false) }
        }
      } catch {}
      if (pollCount.current >= TRIP.QUOTE_POLL_MAX_ATTEMPTS) {
        clearInterval(timer)
        pollRef.current = null
        setQuotesSearching(false)
        if (quotesRef.current.length === 0) setSearchFailed(true)
      }
    }, TRIP.QUOTE_POLL_INTERVAL_MS)

    pollRef.current = timer
    return () => { clearInterval(timer); pollRef.current = null }
  }, [step, activeTripId])

  // panelContent height: step 4 level 2 expands to fill full sheet, others fixed
  const panelContentH = step === 4 && contentLevel === 2
    ? FULL_H - HANDLE_H
    : partialH - HANDLE_H

  // ── Sheet padding helpers ──────────────────────────────────────────────────
  function visiblePad(level: 0|1|2) {
    const panelH = level === 0 ? HANDLE_H : level === 1 ? partialHRef.current : FULL_H
    return { top: topBarHRef.current, bottom: panelH + (insets.bottom ?? 0) }
  }

  function crosshairFrac(level: 0|1|2) {
    const { top, bottom } = visiblePad(level)
    return (top + (SCREEN_H - top - bottom) / 2) / SCREEN_H
  }

  function snapToLevel(level: 0|1|2) {
    const prevLevel = contentLevelRef.current
    sheetLvlRef.current = level
    setSheetLevel(level)
    // Collapse: shrink panelContent immediately so layout stays correct during animation
    if (level < prevLevel) {
      contentLevelRef.current = level
      setContentLevel(level)
    }
    Animated.spring(sheetY, {
      toValue: getSnapY(level, partialHRef.current),
      useNativeDriver: true,
      tension: 68,
      friction: 12,
    }).start(() => {
      // Expand: grow panelContent after sheet reaches new position
      if (level > prevLevel) {
        contentLevelRef.current = level
        setContentLevel(level)
      }
    })
    mapRef.current?.setCrosshairPosition(crosshairFrac(level))
    panTo(mapCenter.current.lat, mapCenter.current.lng, level)
  }

  // PanResponder for sheet drag handle
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) =>
      Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => {
      const isStep4 = stepRef.current === 4
      const pH      = partialHRef.current
      const maxLvl  = isStep4 ? 2 : 1
      const minLvl  = isStep4 ? 1 : 0
      const base    = getSnapY(sheetLvlRef.current, pH)
      const next    = Math.max(getSnapY(maxLvl, pH), Math.min(getSnapY(minLvl, pH), base + g.dy))
      sheetY.setValue(next)
    },
    onPanResponderRelease: (_, g) => {
      const isStep4 = stepRef.current === 4
      const pH      = partialHRef.current
      const base    = getSnapY(sheetLvlRef.current, pH)
      const projY   = base + g.dy + g.vy * 120
      const lvls    = isStep4 ? ([1, 2] as const) : ([0, 1] as const)
      const dists   = lvls.map(l => ({ l, d: Math.abs(getSnapY(l, pH) - projY) }))
      const target  = dists.reduce((a, b) => a.d < b.d ? a : b).l
      snapToLevel(target)
    },
  })).current

  // ── Map pan helpers ────────────────────────────────────────────────────────
  function panTo(lat: number, lng: number, level?: 0|1|2) {
    const lv = level ?? sheetLvlRef.current
    const { top, bottom } = visiblePad(lv)
    progPan.current = true
    mapRef.current?.panTo(lat, lng, top, bottom)
    setTimeout(() => { progPan.current = false }, 900)
  }

  async function fetchCurrentLocation() {
    // Khi khôi phục dữ liệu chuyến bị hủy, hiển thị bản đồ tại điểm đón đã lưu
    if (retryPickupRef.current) {
      const { lat, lng } = retryPickupRef.current
      retryPickupRef.current = null
      panTo(lat, lng)
      return
    }
    try {
      const loc     = await getCurrentLocation()
      mapCenter.current = { lat: loc.lat, lng: loc.lng }
      panTo(loc.lat, loc.lng)
      const address = await reverseGeocode(loc.lat, loc.lng)
      const point   = { lat: loc.lat, lng: loc.lng, address }
      if (stepRef.current === 1) { setPickupText(address); setPickup(point) }
      else if (stepRef.current === 2) { setDestText(address); setDest(point) }
    } catch {
      showAlert(t('common.error'), 'Không lấy được vị trí hiện tại.')
    }
  }

  function handleCenterChange(lat: number, lng: number) {
    if (progPan.current) return
    mapCenter.current = { lat, lng }
    if (revTimer.current) clearTimeout(revTimer.current)
    revTimer.current = setTimeout(async () => {
      try {
        const address = await reverseGeocode(lat, lng)
        if (stepRef.current === 1) { setPickupText(address); setPickup({ lat, lng, address }) }
        else if (stepRef.current === 2) { setDestText(address); setDest({ lat, lng, address }) }
      } catch {}
    }, 600)
  }

  function handlePickupType(text: string) {
    setPickupText(text); setPickupSugg([])
    if (suggTimer.current) clearTimeout(suggTimer.current)
    if (text.length < 3) return
    suggTimer.current = setTimeout(async () => {
      const { lat, lng } = mapCenter.current
      const results = await searchAddresses(text, 4, lat, lng)
      setPickupSugg(results)
    }, 600)
  }

  function handleDestType(text: string) {
    setDestText(text); setDestSugg([])
    if (suggTimer.current) clearTimeout(suggTimer.current)
    if (text.length < 3) return
    suggTimer.current = setTimeout(async () => {
      const { lat, lng } = mapCenter.current
      const results = await searchAddresses(text, 4, lat, lng)
      setDestSugg(results)
    }, 600)
  }

  function handlePickupSuggSelect(s: SuggItem) {
    setPickupText(s.name); setPickup({ lat: s.lat, lng: s.lng, address: s.name })
    setPickupSugg([]); panTo(s.lat, s.lng)
  }

  function handleDestSuggSelect(s: SuggItem) {
    setDestText(s.name); setDest({ lat: s.lat, lng: s.lng, address: s.name })
    setDestSugg([]); panTo(s.lat, s.lng)
  }

  async function checkLockAndRetry() {
    const lockRaw = await SecureStore.getItemAsync(SecureStoreKey.CUSTOMER_LOCK_UNTIL).catch(() => null)
    if (lockRaw) {
      const lockTs = parseInt(lockRaw)
      if (lockTs > Date.now()) {
        router.replace({ pathname: '/lock-screen', params: { lockedUntil: lockRaw, reason: 'frequentCancel' } })
        return
      } else {
        SecureStore.deleteItemAsync(SecureStoreKey.CUSTOMER_LOCK_UNTIL).catch(() => {})
      }
    }
    try {
      const raw = await AsyncStorage.getItem('retry_trip_data')
      if (!raw) return
      await AsyncStorage.removeItem('retry_trip_data')
      const d = JSON.parse(raw)
      if (d.transportModel) {
        setTransportModel(d.transportModel)
        const model = TRANSPORT_MODELS.find((x: any) => x.key === d.transportModel) ?? TRANSPORT_MODELS[0]
        setVehicle(d.vehicleType ?? model.vehicles[0].key)
      } else if (d.vehicleType) {
        setVehicle(d.vehicleType)
      }
      if (d.pickupLat && d.pickupAddress) {
        setPickup({ lat: d.pickupLat, lng: d.pickupLng, address: d.pickupAddress })
        setPickupText(d.pickupAddress)
        retryPickupRef.current = { lat: d.pickupLat, lng: d.pickupLng }
      }
      if (d.dropLat && d.destAddress) {
        setDest({ lat: d.dropLat, lng: d.dropLng, address: d.destAddress })
        setDestText(d.destAddress)
      }
      if (d.note) setNote(d.note)
      if (d.estimatedKm) setDistKm(d.estimatedKm)
      if (d.senderName)     setSenderName(d.senderName)
      if (d.senderPhone)    setSenderPhone(d.senderPhone)
      if (d.recipientName)  setRecipientName(d.recipientName)
      if (d.recipientPhone) setRecipientPhone(d.recipientPhone)
      setTimeout(() => goToStep(1), 300)
    } catch {}
  }

  // ── Saved locations ───────────────────────────────────────────────────────
  async function loadSavedLocs() {
    try {
      const raw = await AsyncStorage.getItem(SAVED_KEY)
      if (raw) setSavedLocs(JSON.parse(raw))
    } catch {}
  }

  function selectSavedLoc(loc: SavedLoc) {
    if (stepRef.current === 1) { setPickupText(loc.address); setPickup({ lat: loc.lat, lng: loc.lng, address: loc.address }) }
    else if (stepRef.current === 2) { setDestText(loc.address); setDest({ lat: loc.lat, lng: loc.lng, address: loc.address }) }
    panTo(loc.lat, loc.lng)
  }

  function openSaveModal() {
    const point = stepRef.current === 1 ? pickup : dest
    if (!point) return
    setSaveModalPoint(point); setSaveModalName(''); setSaveModalVisible(true)
  }

  async function handleSaveConfirm() {
    if (!saveModalPoint || !saveModalName.trim()) return
    const name    = saveModalName.trim().slice(0, 20)
    const newList = [{ name, ...saveModalPoint }, ...savedLocs.filter(l => l.name !== name)].slice(0, 6)
    setSavedLocs(newList)
    await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(newList)).catch(() => {})
    setSaveModalVisible(false)
  }

  async function handleRemoveSaved(name: string) {
    const newList = savedLocs.filter(l => l.name !== name)
    setSavedLocs(newList)
    await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(newList)).catch(() => {})
  }

  function handleTransportModelChange(m: TransportModel) {
    setTransportModel(m)
    const model = TRANSPORT_MODELS.find(x => x.key === m) ?? TRANSPORT_MODELS[0]
    setVehicle(model.vehicles[0].key as VehicleType)
    const newPH = m === 'freight' ? PARTIAL_H_FREIGHT : PARTIAL_H_PASSENGER
    // Cập nhật ref ngay để animation dùng đúng giá trị (state update async)
    partialHRef.current = newPH
    Animated.spring(sheetY, {
      toValue: getSnapY(sheetLvlRef.current, newPH),
      useNativeDriver: true,
      tension: 68,
      friction: 12,
    }).start()
    mapRef.current?.setCrosshairPosition(crosshairFrac(sheetLvlRef.current))
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  function goToStep(next: Step) {
    if (isAnimating.current) return
    isAnimating.current = true
    const goingForward = next > stepRef.current
    Animated.timing(panelX, {
      toValue: goingForward ? -SCREEN_W : SCREEN_W,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setStep(next)
      requestAnimationFrame(() => {
        panelX.setValue(goingForward ? SCREEN_W : -SCREEN_W)
        Animated.spring(panelX, {
          toValue: 0, tension: 85, friction: 11, useNativeDriver: true,
        }).start(() => { isAnimating.current = false })
      })
    })
  }

  function handleBack() {
    if (step === 0) return
    goToStep((step - 1) as Step)
  }

  function confirmVehicle() { goToStep(1) }

  function confirmPickup() {
    if (!pickup) { showAlert(t('common.error'), t('trip.pickupPlaceholder')); return }
    if (transportModel === 'freight') {
      if (!senderName.trim())  { showAlert(t('common.error'), 'Vui lòng nhập tên người giao hàng'); return }
      if (!senderPhone.trim()) { showAlert(t('common.error'), 'Vui lòng nhập số điện thoại người giao hàng'); return }
    }
    goToStep(2)
  }

  async function confirmDest() {
    if (!dest) { showAlert(t('common.error'), t('trip.destPlaceholder')); return }
    if (transportModel === 'freight') {
      if (!recipientName.trim())  { showAlert(t('common.error'), 'Vui lòng nhập tên người nhận hàng'); return }
      if (!recipientPhone.trim()) { showAlert(t('common.error'), 'Vui lòng nhập số điện thoại người nhận hàng'); return }
    }
    goToStep(3)
    if (pickup) {
      try {
        const km = await getRouteDistanceKm(pickup.lat, pickup.lng, dest.lat, dest.lng)
        setDistKm(Math.max(0.1, Math.round(km * 10) / 10))
      } catch { setDistKm(null) }
    }
  }

  async function doLogout() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (activeTripId) await rtdb.delete(`trips/${activeTripId}`).catch(() => {})
    mapRef.current?.hideDriverMarker()
    await SecureStore.deleteItemAsync(SecureStoreKey.CUSTOMER_INFO).catch(() => {})
    await SecureStore.deleteItemAsync(SecureStoreKey.USER_ROLE).catch(() => {})
    router.replace('/role-select')
  }

  async function applyPenaltyThenRun(onDone: () => void) {
    try {
      const raw = await SecureStore.getItemAsync(SecureStoreKey.CUSTOMER_INFO)
      if (!raw) { onDone(); return }
      const info: CustomerInfo = JSON.parse(raw)
      const storedRaw  = await SecureStore.getItemAsync(SecureStoreKey.CUSTOMER_CANCEL_COUNT).catch(() => null)
      const localCount = storedRaw ? parseFloat(storedRaw) : 0
      const newLocal   = localCount + 0.5
      await SecureStore.setItemAsync(SecureStoreKey.CUSTOMER_CANCEL_COUNT, String(newLocal)).catch(() => {})
      const newCount = await incrementCustomerPenalty(info.phone, 0.5).catch(() => newLocal)
      if (newCount >= 3) {
        const lockUntil = Date.now() + 48 * 60 * 60 * 1000
        await SecureStore.setItemAsync(SecureStoreKey.CUSTOMER_LOCK_UNTIL, String(lockUntil)).catch(() => {})
        // cleanup trip trước rồi lock
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        if (activeTripId) await rtdb.delete(`trips/${activeTripId}`).catch(() => {})
        router.replace({ pathname: '/lock-screen', params: { lockedUntil: String(lockUntil), reason: 'frequentCancel' } })
        return
      }
    } catch {}
    onDone()
  }

  function handleLogout() {
    // Bước 4 đã có báo giá → cảnh báo + penalty trước khi logout
    if (stepRef.current === 4 && quotesRef.current.length > 0) {
      showAlert(
        t('cancel.title'),
        t('cancel.abandonHasQuotes'),
        [
          { text: t('cancel.no'), style: 'cancel' },
          {
            text: t('settings.logout'), style: 'destructive',
            onPress: () => applyPenaltyThenRun(doLogout),
          },
        ],
      )
      return
    }
    showAlert(
      t('settings.logout'),
      t('settings.logoutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.logout'), style: 'destructive', onPress: doLogout },
      ],
    )
  }

  function handleHistory() {
    router.push('/(customer)/history')
  }

  // ── Book ride ─────────────────────────────────────────────────────────────
  async function handleBook() {
    if (!pickup || !dest) return
    const onWifi = await isOnWifi()
    if (onWifi) { setShowWifi(true); return }

    setBookLoading(true)
    try {
      const raw = await SecureStore.getItemAsync(SecureStoreKey.CUSTOMER_INFO)
      if (!raw) { router.replace('/role-select'); return }
      const info: CustomerInfo = JSON.parse(raw)

      const pickupGeohash = geohashForQuery(pickup.lat, pickup.lng)
      const dropGeohash   = geohashForQuery(dest.lat,   dest.lng)
      const km = distKm ?? await getRouteDistanceKm(pickup.lat, pickup.lng, dest.lat, dest.lng)

      let customerFcmToken = ''
      try {
        const tokenData = await Notifications.getDevicePushTokenAsync()
        customerFcmToken = tokenData.data as string
      } catch {}
      if (!customerFcmToken) {
        customerFcmToken = (await SecureStore.getItemAsync(SecureStoreKey.CUSTOMER_FCM_TOKEN)) ?? ''
      }

      const tripId = nanoid()
      await rtdb.set(`trips/${tripId}/info`, {
        customerPhone:    info.phone,
        pickupGeohash,
        dropGeohash,
        pickupLat:        pickup.lat,
        pickupLng:        pickup.lng,
        dropLat:          dest.lat,
        dropLng:          dest.lng,
        vehicleType:      vehicle,
        transportModel,
        estimatedKm:      Math.max(1, Math.round(km * 10) / 10),
        pickupAddress:    pickup.address,
        destAddress:      dest.address,
        note:             note.trim(),
        createdAt:        Date.now(),
        status:           'waiting',
        customerFcmToken,
      })
      await notifyDrivers(tripId, pickupGeohash, vehicle)
      setActiveTripId(tripId)
      goToStep(4)
    } catch (e: unknown) {
      showAlert(t('common.error'), (e as Error).message)
    } finally {
      setBookLoading(false)
    }
  }

  function handlePreviewDriver(quote: TripQuote) {
    if (!quote.driverLat || !quote.driverLng || !pickup) return
    mapRef.current?.showDriverMarker(quote.driverLat, quote.driverLng)
    mapRef.current?.showCustomerMarker(pickup.lat, pickup.lng)
    mapRef.current?.fitBoundsToMarkers(
      pickup.lat, pickup.lng,
      quote.driverLat, quote.driverLng,
      partialHRef.current,
    )
  }

  async function handleSelectDriver(quote: TripQuote) {
    if (!activeTripId) return
    try {
      const still = await rtdb.get(`trips/${activeTripId}/quotes/${quote.driverUid}`)
      if (!still) {
        showAlert('Tài xế đã hủy', 'Tài xế này đã hủy báo giá, vui lòng chọn tài xế khác.')
        setQuotes(prev => prev.filter(q => q.driverUid !== quote.driverUid))
        return
      }
    } catch {}

    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    try {
      if (transportModel === 'freight') {
        const fi: FreightInfo = {
          senderName:    senderName.trim(),
          senderPhone:   senderPhone.trim(),
          recipientName: recipientName.trim(),
          recipientPhone: recipientPhone.trim(),
        }
        console.log('[home] writing freight_info:', JSON.stringify(fi), 'tripId:', activeTripId)
        try {
          await rtdb.set(`trips/${activeTripId}/freight_info`, fi)
          console.log('[home] freight_info write OK')
        } catch (e) { console.log('[home] freight_info write FAILED:', e) }
      }
      await notifySelectedDriver(activeTripId, quote.driverUid)
      router.push({
        pathname: '/(customer)/tracking',
        params: {
          tripId:         activeTripId,
          driverUid:      quote.driverUid,
          driverName:     quote.driverName,
          vehicleBrand:   quote.vehicleBrand,
          vehicleColor:   quote.vehicleColor,
          licensePlate:   quote.licensePlate,
          tripPrice:      String(quote.quotedPrice),
          transportModel: transportModel,
          senderName:     senderName,
          senderPhone:    senderPhone,
          recipientName:  recipientName,
          recipientPhone: recipientPhone,
        },
      })
    } catch (e: unknown) {
      showAlert(t('common.error'), (e as Error).message)
    }
  }

  async function cancelSearchCleanup() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (activeTripId) await rtdb.delete(`trips/${activeTripId}`).catch(() => {})
    mapRef.current?.hideDriverMarker()
    setActiveTripId(null); setQuotes([]); setSearchFailed(false)
    goToStep(3)
  }

  function handleCancelSearch() {
    if (quotesRef.current.length === 0) {
      cancelSearchCleanup()
      return
    }
    showAlert(
      t('cancel.title'),
      t('cancel.abandonHasQuotes'),
      [
        { text: t('cancel.no'), style: 'cancel' },
        {
          text: t('cancel.yes'), style: 'destructive',
          onPress: () => applyPenaltyThenRun(cancelSearchCleanup),
        },
      ],
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <NetworkAlert visible={showWifi} onDismiss={() => setShowWifi(false)} />

      {/* Map full screen */}
      <MapViewComponent
        ref={mapRef}
        lat={INIT_LAT}
        lng={INIT_LNG}
        mode="picker"
        crosshairTopPct={pinTopPct}
        onCenterChange={handleCenterChange}
        onMapReady={fetchCurrentLocation}
      />

      {/* Top bar */}
      <SafeAreaView style={styles.topBar} edges={['top']}>
        {/* Left: logout (ALL steps) */}
        <TouchableOpacity style={styles.topBtn} onPress={handleLogout} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="log-out-outline" size={20} color={BRAND} />
        </TouchableOpacity>

        {/* Center */}
        <View style={styles.dotsArea}>
          {(step === 1 || step === 2) ? (
            <View style={styles.dragHintPill}>
              <Ionicons name="hand-left-outline" size={13} color="#fff" />
              <Text style={styles.dragHintText}>{t('trip.dragToAdjust')}</Text>
            </View>
          ) : step < 4 ? (
            ([0, 1, 2, 3] as const).map(i => (
              <View key={i} style={[styles.dot, step >= i && styles.dotActive]} />
            ))
          ) : quotesSearching && !searchFailed ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : null}
        </View>

        {/* Right: history (ALL steps) */}
        <TouchableOpacity style={styles.topBtn} onPress={handleHistory} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="time-outline" size={20} color={BRAND} />
        </TouchableOpacity>
      </SafeAreaView>


      {/* Sheet – full-width, bottom-anchored, slide levels */}
      <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetY }] }]}>
        {/* Drag handle */}
        <View style={styles.handleArea} {...panResponder.panHandlers}>
          <View style={styles.handleBar} />
        </View>

        {/* Content – horizontally animated between steps */}
        <Animated.View style={[styles.panelContent, { height: panelContentH }, { transform: [{ translateX: panelX }] }]}>
          {step === 0 && (
            <VehiclePanel
              vehicle={vehicle}
              transportModel={transportModel}
              onVehicleChange={setVehicle}
              onTransportModelChange={handleTransportModelChange}
              onConfirm={confirmVehicle}
              insetBottom={insets.bottom}
              t={t}
            />
          )}
          {step === 1 && (
            <PickupPanel
              text={pickupText}
              onChangeText={handlePickupType}
              onClear={() => { setPickupText(''); setPickupSugg([]) }}
              savedLocs={savedLocs}
              onSelectSaved={selectSavedLoc}
              onRemoveSaved={handleRemoveSaved}
              suggestions={pickupSugg}
              onSelectSugg={handlePickupSuggSelect}
              onConfirm={confirmPickup}
              onBack={handleBack}
              onSave={openSaveModal}
              onLocate={fetchCurrentLocation}
              insetBottom={insets.bottom}
              transportModel={transportModel}
              senderName={senderName}
              senderPhone={senderPhone}
              onSenderNameChange={setSenderName}
              onSenderPhoneChange={setSenderPhone}
              t={t}
            />
          )}
          {step === 2 && (
            <DestPanel
              text={destText}
              onChangeText={handleDestType}
              onClear={() => { setDestText(''); setDestSugg([]) }}
              savedLocs={savedLocs}
              onSelectSaved={selectSavedLoc}
              onRemoveSaved={handleRemoveSaved}
              suggestions={destSugg}
              onSelectSugg={handleDestSuggSelect}
              onConfirm={confirmDest}
              onBack={handleBack}
              onSave={openSaveModal}
              onLocate={fetchCurrentLocation}
              insetBottom={insets.bottom}
              transportModel={transportModel}
              recipientName={recipientName}
              recipientPhone={recipientPhone}
              onRecipientNameChange={setRecipientName}
              onRecipientPhoneChange={setRecipientPhone}
              t={t}
            />
          )}
          {step === 3 && (
            <BookPanel
              pickup={pickup!}
              dest={dest!}
              note={note}
              distKm={distKm}
              onNoteChange={setNote}
              onBook={handleBook}
              loading={bookLoading}
              onBack={handleBack}
              insetBottom={insets.bottom}
              transportModel={transportModel}
              senderName={senderName}
              senderPhone={senderPhone}
              recipientName={recipientName}
              recipientPhone={recipientPhone}
              onSenderPress={() => pickup && panTo(pickup.lat, pickup.lng)}
              onRecipientPress={() => dest && panTo(dest.lat, dest.lng)}
              t={t}
            />
          )}
          {step === 4 && (
            <QuotesPanel
              searching={quotesSearching}
              searchFailed={searchFailed}
              countdown={countdown}
              quotes={quotes}
              onPreviewDriver={handlePreviewDriver}
              onSelectDriver={handleSelectDriver}
              onCancel={handleCancelSearch}
              t={t}
            />
          )}
        </Animated.View>
      </Animated.View>

      {/* Save location modal */}
      <Modal
        visible={saveModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSaveModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{t('trip.saveLocTitle')}</Text>
            <View style={styles.modalAddress}>
              <Ionicons name="location-outline" size={16} color={BRAND} />
              <Text style={styles.modalAddressText} numberOfLines={2}>
                {saveModalPoint?.address}
              </Text>
            </View>
            <Text style={styles.modalFieldLabel}>{t('trip.saveLocNameLabel')}</Text>
            <TextInput
              style={styles.modalInput}
              value={saveModalName}
              onChangeText={setSaveModalName}
              placeholder={t('trip.saveLocNamePlaceholder')}
              placeholderTextColor="#94A3B8"
              autoFocus
              maxLength={20}
              returnKeyType="done"
              onSubmitEditing={handleSaveConfirm}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setSaveModalVisible(false)}>
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, !saveModalName.trim() && { opacity: 0.45 }]}
                onPress={handleSaveConfirm}
                disabled={!saveModalName.trim()}
              >
                <Text style={styles.modalSaveText}>{t('trip.saveLocBtn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function AddressInput({
  value, onChangeText, placeholder, autoFocus, onBookmark, onClear,
}: { value: string; onChangeText: (t: string) => void; placeholder: string; autoFocus?: boolean; onBookmark?: () => void; onClear?: () => void }) {
  return (
    <View style={sub.inputWrap}>
      <Ionicons name="location-outline" size={14} color={BRAND} style={{ marginRight: 6 }} />
      <TextInput
        style={sub.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        autoFocus={autoFocus}
        returnKeyType="search"
      />
      {onClear && value.length > 0 && (
        <TouchableOpacity
          onPress={onClear}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center', marginRight: 4 }}
        >
          <Ionicons name="close" size={14} color="#64748B" />
        </TouchableOpacity>
      )}
      {onBookmark && (
        <TouchableOpacity
          onPress={onBookmark}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 4 }}
          style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#E8EDF6', justifyContent: 'center', alignItems: 'center' }}
        >
          <Ionicons name="bookmark" size={16} color={BRAND} />
        </TouchableOpacity>
      )}
    </View>
  )
}

function SuggRow({ item, onPress }: { item: SuggItem; onPress: () => void }) {
  return (
    <TouchableOpacity style={sub.suggRow} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name="location-outline" size={15} color="#94A3B8" style={{ marginRight: 8, flexShrink: 0 }} />
      <Text style={sub.suggText} numberOfLines={2}>{item.name}</Text>
    </TouchableOpacity>
  )
}

function SavedChips({
  savedLocs, onSelect, onRemove, onLocate, selectedChip, t,
}: { savedLocs: SavedLoc[]; onSelect: (l: SavedLoc) => void; onRemove: (name: string) => void; onLocate: () => void; selectedChip: string | null; t: any }) {
  return (
    <View style={sub.chipsWrap}>
      {/* Chip vị trí hiện tại – cố định đầu, không có X */}
      {(() => {
        const sel = selectedChip === 'locate'
        return (
          <View style={[sub.chipContainer, sel && sub.chipContainerSel]}>
            <TouchableOpacity style={[sub.chipContent, { paddingRight: 10 }]} onPress={onLocate}>
              <Ionicons name="locate" size={13} color={sel ? '#fff' : BRAND} />
              <Text style={[sub.chipText, sel && sub.chipTextSel]}>{t('trip.currentLocation')}</Text>
            </TouchableOpacity>
          </View>
        )
      })()}
      {savedLocs.map((loc, i) => {
        const sel = selectedChip === loc.name
        return (
          <View key={i} style={[sub.chipContainer, sel && sub.chipContainerSel]}>
            <TouchableOpacity style={sub.chipContent} onPress={() => onSelect(loc)}>
              <Ionicons name="bookmark-outline" size={13} color={sel ? '#fff' : BRAND} />
              <Text style={[sub.chipText, sel && sub.chipTextSel]}>{loc.name}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={sub.chipRemoveBtn}
              onPress={() => onRemove(loc.name)}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 6 }}
            >
              <Ionicons name="close-outline" size={14} color={sel ? '#fff' : '#94A3B8'} />
            </TouchableOpacity>
          </View>
        )
      })}
    </View>
  )
}

// Panel 0 – Transport model + Vehicle carousel
function VehiclePanel({ vehicle, transportModel, onVehicleChange, onTransportModelChange, onConfirm, insetBottom, t }: any) {
  const modelConfig = TRANSPORT_MODELS.find((m: any) => m.key === transportModel) ?? TRANSPORT_MODELS[0]
  const vehicles    = modelConfig.vehicles
  return (
    <View style={sub.panelFlex}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={[sub.panelTitle, { textAlign: 'center' }]}>{t('trip.selectVehicleTitle')}</Text>

        <Text style={[sub.sectionLabel, { marginTop: 10 }]}>{t('trip.transportModel')}</Text>
        <View style={sub.transportRow}>
          {TRANSPORT_MODELS.map((model: any) => {
            const active = transportModel === model.key
            return (
              <TouchableOpacity
                key={model.key}
                style={[sub.transportBtn, active && sub.transportBtnActive]}
                onPress={() => onTransportModelChange(model.key)}
                activeOpacity={0.8}
              >
                <Ionicons name={model.icon} size={18} color={active ? '#fff' : BRAND} />
                <Text style={[sub.transportLabel, active && sub.transportLabelActive]}>
                  {t(model.labelKey)}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <Text style={sub.sectionLabel}>{t('trip.vehicleType')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEnabled={vehicles.length > 3}
          snapToInterval={CARD_W + 10}
          snapToAlignment="start"
          decelerationRate="fast"
          contentContainerStyle={vehicles.length <= 3 ? { flex: 1, gap: 10, paddingVertical: 2 } : { paddingRight: 4 }}
          style={{ marginBottom: 2 }}
        >
          {vehicles.map((v: any) => {
            const active = vehicle === v.key
            return (
              <TouchableOpacity
                key={`${transportModel}-${v.key}`}
                style={[sub.vehicleCard, active && sub.vehicleCardActive, vehicles.length <= 3 ? { flex: 1 } : { width: CARD_W, marginRight: 10 }]}
                onPress={() => onVehicleChange(v.key)}
                activeOpacity={0.75}
              >
                <Ionicons name={v.icon} size={26} color={active ? '#fff' : BRAND} />
                <Text style={[sub.vehicleCardLabel, active && sub.vehicleCardLabelActive]}>
                  {t(`vehicle.${v.key}`)}
                </Text>
                {v.passengers != null ? (
                  <View style={sub.passengerRow}>
                    <Text style={[sub.passengerCount, active && sub.passengerCountActive]}>{v.passengers}</Text>
                    <Ionicons name="person" size={11} color={active ? 'rgba(255,255,255,0.85)' : '#64748B'} />
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 }}>
                    <Ionicons name="cube-outline" size={11} color={active ? 'rgba(255,255,255,0.75)' : '#64748B'} />
                    <Text style={[sub.vehicleCardSpec, active && sub.vehicleCardSpecActive]}>{t(v.specKey)}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
        {vehicles.length > 3 && (
          <Text style={sub.vehicleScrollHint}>{t('trip.vehicleScrollHint')}</Text>
        )}
      </ScrollView>

      <TouchableOpacity style={[sub.confirmBtn, { marginBottom: (insetBottom || 0) + 16 }]} onPress={onConfirm} activeOpacity={0.85}>
        <Text style={sub.confirmBtnText}>{t('common.continue')}</Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  )
}

// Panel 1 – Pickup location
function PickupPanel({ text, onChangeText, onClear, savedLocs, onSelectSaved, onRemoveSaved, suggestions, onSelectSugg, onConfirm, onBack, onSave, onLocate, insetBottom, transportModel, senderName, senderPhone, onSenderNameChange, onSenderPhoneChange, t }: any) {
  const [activeChip, setActiveChip] = useState<string | null>('locate')
  const showSugg  = suggestions.length > 0
  const isFreight = transportModel === 'freight'
  return (
    <View style={sub.panelFlex}>
      <View style={sub.panelHeaderRow}>
        <TouchableOpacity style={sub.panelBackBtn} onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={BRAND} />
        </TouchableOpacity>
        <Text style={sub.panelTitleCenter}>
          {isFreight ? t('trip.stepPickupFreight') : t('trip.stepPickup')}
        </Text>
        <View style={{ width: 36 }} />
      </View>
      {isFreight && (
        <View style={[sub.freightContactRow, { marginBottom: 8 }]}>
          <View style={[sub.freightInputWrap, { flex: 6 }]}>
            <Ionicons name="person-outline" size={14} color={BRAND} style={{ marginRight: 6 }} />
            <TextInput
              style={sub.freightInput}
              value={senderName}
              onChangeText={(v) => onSenderNameChange(v.replace(/(^|\s)\S/g, c => c.toUpperCase()))}
              placeholder={t('trip.senderNamePlaceholder')}
              placeholderTextColor="#94A3B8"
              autoCapitalize="words"
              autoFocus={false}
              returnKeyType="next"
            />
          </View>
          <View style={[sub.freightInputWrap, { flex: 4, marginLeft: 8 }]}>
            <Ionicons name="call-outline" size={14} color={BRAND} style={{ marginRight: 6 }} />
            <TextInput
              style={sub.freightInput}
              value={senderPhone}
              onChangeText={onSenderPhoneChange}
              placeholder={t('trip.senderPhonePlaceholder')}
              placeholderTextColor="#94A3B8"
              keyboardType="number-pad"
              returnKeyType="done"
            />
          </View>
        </View>
      )}
      <AddressInput
        value={text}
        onChangeText={(v: string) => { setActiveChip(null); onChangeText(v) }}
        onClear={() => { setActiveChip(null); onClear() }}
        placeholder={isFreight ? t('trip.pickupFreightPlaceholder') : t('trip.pickupPlaceholder')}
        onBookmark={onSave}
      />
      <ScrollView
        style={{ flex: 1 }}
        scrollEnabled
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {showSugg ? (
          <View style={sub.suggList}>
            {suggestions.map((s: SuggItem, i: number) => (
              <SuggRow key={i} item={s} onPress={() => { setActiveChip(null); onSelectSugg(s) }} />
            ))}
          </View>
        ) : (
          <SavedChips
            savedLocs={savedLocs}
            onSelect={(loc: SavedLoc) => { setActiveChip(loc.name); onSelectSaved(loc) }}
            onRemove={onRemoveSaved}
            onLocate={() => { setActiveChip('locate'); onLocate() }}
            selectedChip={activeChip}
            t={t}
          />
        )}
      </ScrollView>
      <TouchableOpacity style={[sub.confirmBtn, { marginBottom: (insetBottom || 0) + 16 }]} onPress={onConfirm} activeOpacity={0.85}>
        <Text style={sub.confirmBtnText}>
          {isFreight ? t('trip.confirmPickupFreight') : t('trip.confirmPickup')}
        </Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  )
}

// Panel 2 – Destination
function DestPanel({ text, onChangeText, onClear, savedLocs, onSelectSaved, onRemoveSaved, suggestions, onSelectSugg, onConfirm, onBack, onSave, onLocate, insetBottom, transportModel, recipientName, recipientPhone, onRecipientNameChange, onRecipientPhoneChange, t }: any) {
  const [activeChip, setActiveChip] = useState<string | null>(null)
  const showSugg  = suggestions.length > 0
  const isFreight = transportModel === 'freight'
  return (
    <View style={sub.panelFlex}>
      <View style={sub.panelHeaderRow}>
        <TouchableOpacity style={sub.panelBackBtn} onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={BRAND} />
        </TouchableOpacity>
        <Text style={sub.panelTitleCenter}>
          {isFreight ? t('trip.stepDestFreight') : t('trip.stepDest')}
        </Text>
        <View style={{ width: 36 }} />
      </View>
      {isFreight && (
        <View style={[sub.freightContactRow, { marginBottom: 8 }]}>
          <View style={[sub.freightInputWrap, { flex: 6 }]}>
            <Ionicons name="person-outline" size={14} color={BRAND} style={{ marginRight: 6 }} />
            <TextInput
              style={sub.freightInput}
              value={recipientName}
              onChangeText={(v) => onRecipientNameChange(v.replace(/(^|\s)\S/g, c => c.toUpperCase()))}
              placeholder={t('trip.recipientNamePlaceholder')}
              placeholderTextColor="#94A3B8"
              autoCapitalize="words"
              autoFocus={false}
              returnKeyType="next"
            />
          </View>
          <View style={[sub.freightInputWrap, { flex: 4, marginLeft: 8 }]}>
            <Ionicons name="call-outline" size={14} color={BRAND} style={{ marginRight: 6 }} />
            <TextInput
              style={sub.freightInput}
              value={recipientPhone}
              onChangeText={onRecipientPhoneChange}
              placeholder={t('trip.recipientPhonePlaceholder')}
              placeholderTextColor="#94A3B8"
              keyboardType="number-pad"
              returnKeyType="done"
            />
          </View>
        </View>
      )}
      <AddressInput
        value={text}
        onChangeText={(v: string) => { setActiveChip(null); onChangeText(v) }}
        onClear={() => { setActiveChip(null); onClear() }}
        placeholder={isFreight ? t('trip.destFreightPlaceholder') : t('trip.destPlaceholder')}
        onBookmark={onSave}
      />
      <ScrollView
        style={{ flex: 1 }}
        scrollEnabled
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {showSugg ? (
          <View style={sub.suggList}>
            {suggestions.map((s: SuggItem, i: number) => (
              <SuggRow key={i} item={s} onPress={() => { setActiveChip(null); onSelectSugg(s) }} />
            ))}
          </View>
        ) : (
          <SavedChips
            savedLocs={savedLocs}
            onSelect={(loc: SavedLoc) => { setActiveChip(loc.name); onSelectSaved(loc) }}
            onRemove={onRemoveSaved}
            onLocate={() => { setActiveChip('locate'); onLocate() }}
            selectedChip={activeChip}
            t={t}
          />
        )}
      </ScrollView>
      <TouchableOpacity style={[sub.confirmBtn, { marginBottom: (insetBottom || 0) + 16 }]} onPress={onConfirm} activeOpacity={0.85}>
        <Text style={sub.confirmBtnText}>
          {isFreight ? t('trip.confirmDestFreight') : t('trip.confirmDest')}
        </Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  )
}

// Panel 3 – Summary + Note + Book
const BOOK_PAGE_W = SCREEN_W - 40   // panelContent has paddingHorizontal 20 each side

function BookPanel({ pickup, dest, note, distKm, onNoteChange, onBook, loading, onBack, insetBottom, transportModel, senderName, senderPhone, recipientName, recipientPhone, onSenderPress, onRecipientPress, t }: any) {
  const isFreight = transportModel === 'freight'
  return (
    <View style={sub.panelFlex}>
      <View style={sub.panelHeaderRow}>
        <TouchableOpacity style={sub.panelBackBtn} onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={BRAND} />
        </TouchableOpacity>
        <Text style={sub.panelTitleCenter}>
          {isFreight ? t('trip.bookTitleFreight') : t('trip.bookTitle')}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {isFreight ? (
        /* ── Freight: 4 thẻ dọc – thẻ là sibling trực tiếp trong panelFlex ── */
        <>
          {/* Thẻ 1: Thông tin người gửi (tappable → pan to pickup) */}
          <TouchableOpacity style={sub.freightInfoCard} onPress={onSenderPress} activeOpacity={0.75}>
            <View style={sub.freightCardHeader}>
              <Text style={sub.freightCardTitle}>{t('trip.senderLabel')}</Text>
              <Ionicons name="locate-outline" size={14} color={BRAND} />
            </View>
            <View style={sub.freightInfoRow}>
              <Ionicons name="person-outline" size={13} color={BRAND} style={sub.freightInfoIcon} />
              <Text style={sub.freightInfoName} numberOfLines={1} ellipsizeMode="tail">{senderName}  ·  {senderPhone}</Text>
            </View>
            <View style={[sub.freightInfoRow, { marginBottom: 0 }]}>
              <Ionicons name="location-outline" size={13} color={BRAND} style={sub.freightInfoIcon} />
              <Text style={sub.freightInfoAddress} numberOfLines={1} ellipsizeMode="tail">{pickup?.address}</Text>
            </View>
          </TouchableOpacity>

          {/* Thẻ 2: Thông tin người nhận (tappable → pan to dest) */}
          <TouchableOpacity style={sub.freightInfoCard} onPress={onRecipientPress} activeOpacity={0.75}>
            <View style={sub.freightCardHeader}>
              <Text style={sub.freightCardTitle}>{t('trip.recipientLabel')}</Text>
              <Ionicons name="locate-outline" size={14} color={BRAND} />
            </View>
            <View style={sub.freightInfoRow}>
              <Ionicons name="person-outline" size={13} color={BRAND} style={sub.freightInfoIcon} />
              <Text style={sub.freightInfoName} numberOfLines={1} ellipsizeMode="tail">{recipientName}  ·  {recipientPhone}</Text>
            </View>
            <View style={[sub.freightInfoRow, { marginBottom: 0 }]}>
              <Ionicons name="location-outline" size={13} color={BRAND} style={sub.freightInfoIcon} />
              <Text style={sub.freightInfoAddress} numberOfLines={1} ellipsizeMode="tail">{dest?.address}</Text>
            </View>
          </TouchableOpacity>

          {/* Thẻ 3: Khoảng cách */}
          {distKm != null && (
            <View style={sub.freightDistCard}>
              <Ionicons name="navigate-outline" size={14} color="#64748B" />
              <Text style={sub.freightInfoDist}>{t('trip.estDistance', { km: distKm })}</Text>
            </View>
          )}

          {/* Thẻ 4: Ghi chú */}
          <View style={sub.freightNoteCard}>
            <Text style={sub.freightNoteLabel}>{t('trip.note')} <Text style={{ fontWeight: '400', color: '#B45309' }}>{note.length}/100</Text></Text>
            <TextInput
              style={[sub.noteInput, { paddingVertical: 0 }]}
              value={note}
              onChangeText={onNoteChange}
              placeholder={t('trip.notePlaceholder')}
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={2}
              maxLength={100}
            />
          </View>

          <View style={{ flex: 1 }} />
        </>
      ) : (
        /* ── Passenger: 4 thẻ dọc giống freight ── */
        <>
          {/* Thẻ 1: Điểm đón (tappable → pan to pickup) */}
          <TouchableOpacity style={sub.freightInfoCard} onPress={onSenderPress} activeOpacity={0.75}>
            <View style={sub.freightCardHeader}>
              <Text style={sub.freightCardTitle}>{t('trip.pickupLabel')}</Text>
              <Ionicons name="locate-outline" size={14} color={BRAND} />
            </View>
            <View style={[sub.freightInfoRow, { marginBottom: 0 }]}>
              <Ionicons name="location-outline" size={13} color={BRAND} style={sub.freightInfoIcon} />
              <Text style={sub.freightInfoAddress} numberOfLines={1} ellipsizeMode="tail">{pickup?.address}</Text>
            </View>
          </TouchableOpacity>

          {/* Thẻ 2: Điểm đến (tappable → pan to dest) */}
          <TouchableOpacity style={sub.freightInfoCard} onPress={onRecipientPress} activeOpacity={0.75}>
            <View style={sub.freightCardHeader}>
              <Text style={sub.freightCardTitle}>{t('trip.destLabel')}</Text>
              <Ionicons name="locate-outline" size={14} color={BRAND} />
            </View>
            <View style={[sub.freightInfoRow, { marginBottom: 0 }]}>
              <Ionicons name="location-outline" size={13} color={BRAND} style={sub.freightInfoIcon} />
              <Text style={sub.freightInfoAddress} numberOfLines={1} ellipsizeMode="tail">{dest?.address}</Text>
            </View>
          </TouchableOpacity>

          {/* Thẻ 3: Khoảng cách */}
          {distKm != null && (
            <View style={sub.freightDistCard}>
              <Ionicons name="navigate-outline" size={14} color="#64748B" />
              <Text style={sub.freightInfoDist}>{t('trip.estDistance', { km: distKm })}</Text>
            </View>
          )}

          {/* Thẻ 4: Ghi chú */}
          <View style={sub.freightNoteCard}>
            <Text style={sub.freightNoteLabel}>{t('trip.note')} <Text style={{ fontWeight: '400', color: '#B45309' }}>{note.length}/100</Text></Text>
            <TextInput
              style={[sub.noteInput, { paddingVertical: 0 }]}
              value={note}
              onChangeText={onNoteChange}
              placeholder={t('trip.notePlaceholder')}
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={2}
              maxLength={100}
            />
          </View>

          <View style={{ flex: 1 }} />
        </>
      )}

      <TouchableOpacity
        style={[sub.confirmBtn, { marginBottom: (insetBottom || 0) + 16 }, loading && { opacity: 0.7 }]}
        onPress={onBook}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <><Text style={sub.confirmBtnText}>{t('trip.bookRide')}</Text>
              <Ionicons name="megaphone-outline" size={18} color="#fff" /></>
        }
      </TouchableOpacity>
    </View>
  )
}

// Panel 4 – Quotes from drivers
function QuotesPanel({ searching, searchFailed, countdown, quotes, onPreviewDriver, onSelectDriver, onCancel, t }: any) {
  return (
    <View style={sub.panelFlex}>
      <View style={sub.panelHeaderRow}>
        <TouchableOpacity style={sub.panelBackBtn} onPress={onCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={BRAND} />
        </TouchableOpacity>
        <Text style={sub.panelTitleCenter}>
          {searchFailed
            ? t('trip.noDriver')
            : quotes.length > 0
              ? t('trip.quotes')
              : t('trip.searching')}
        </Text>
        {searching && !searchFailed
          ? <Text style={[sub.quotesCountdown, { minWidth: 36, textAlign: 'right' }]}>{countdown}s</Text>
          : <View style={{ width: 36 }} />
        }
      </View>

      <View style={{ flex: 1 }}>
        {quotes.length > 0 ? (
          <QuoteList quotes={quotes} onSelect={onSelectDriver} onPreview={onPreviewDriver} />
        ) : searching ? (
          <View style={sub.quotesCenter}>
            <ActivityIndicator size="large" color={BRAND} />
            <Text style={sub.quotesHint}>{t('trip.searching')}</Text>
          </View>
        ) : (
          <View style={sub.quotesCenter}>
            <Ionicons name="search-outline" size={44} color="#CBD5E1" />
            <Text style={sub.quotesHint}>{t('trip.noDriver')}</Text>
          </View>
        )}
      </View>
    </View>
  )
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8,
    zIndex: 10,
  },
  topBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
    elevation: 2,
    shadowColor: BRAND, shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  dotsArea: {
    flex: 1, flexDirection: 'row', gap: 6,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4,
  },
  dot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { backgroundColor: '#fff' },

  dragHintPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
  },
  dragHintText: { color: '#fff', fontSize: 12 },

  locateBtn: {
    position: 'absolute', right: 16,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
    elevation: 2, shadowColor: BRAND, shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    zIndex: 20,
  },

  // Sheet
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    height: FULL_H,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    elevation: 16,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: -4 },
  },
  handleArea: {
    height: HANDLE_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleBar: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },
  panelContent: {
    overflow: 'hidden',
    paddingHorizontal: 20,
  },

  // Save modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-start', alignItems: 'center',
    paddingTop: 120, paddingHorizontal: 24,
  },
  modalBox:          { width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 20 },
  modalTitle:        { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  modalAddress:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginBottom: 14 },
  modalAddressText:  { flex: 1, fontSize: 13, color: '#334155', lineHeight: 18 },
  modalFieldLabel:   { fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 },
  modalInput:        { borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#0F172A', backgroundColor: '#F8FAFC', marginBottom: 16 },
  modalBtns:         { flexDirection: 'row', gap: 10 },
  modalCancelBtn:    { flex: 1, height: 46, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12 },
  modalCancelText:   { fontSize: 14, fontWeight: '600', color: '#64748B' },
  modalSaveBtn:      { flex: 1, height: 46, justifyContent: 'center', alignItems: 'center', backgroundColor: BRAND, borderRadius: 12 },
  modalSaveText:     { fontSize: 14, fontWeight: '700', color: '#fff' },
})

const sub = StyleSheet.create({
  panelFlex:  { flex: 1, flexDirection: 'column' },

  panelTitle: {
    fontSize: 16, fontWeight: '700', color: '#0F172A',
    marginBottom: 12, marginTop: 4,
  },

  panelHeaderRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 4 },
  panelBackBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', shadowColor: BRAND, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  panelTitleCenter: { flex: 1, fontSize: 16, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
  panelTitleInRow:  { flex: 1, fontSize: 16, fontWeight: '700', color: '#0F172A' },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 2,
    backgroundColor: '#F8FAFC', marginBottom: 8,
  },
  input: { flex: 1, fontSize: 14, color: '#0F172A', paddingVertical: 10 },

  // Saved chips
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 },
  chipContainer: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20,
    backgroundColor: '#F8FAFC', overflow: 'hidden',
  },
  chipContent:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 10, paddingVertical: 7, paddingRight: 4 },
  chipText:           { fontSize: 12, color: BRAND, fontWeight: '500' },
  chipTextSel:        { color: '#fff', fontWeight: '700' },
  chipRemoveBtn:      { paddingVertical: 7, paddingLeft: 2, paddingRight: 8 },
  chipContainerSel:   { backgroundColor: BRAND, borderColor: BRAND },

  // Autocomplete
  suggList: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, overflow: 'hidden', marginTop: 4 },
  suggRow:  { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  suggText: { flex: 1, fontSize: 13, color: '#0F172A', lineHeight: 18 },

  confirmBtn:     { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, height: 50, backgroundColor: BRAND, borderRadius: 14, marginTop: 8 },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  backBtnWide:     { height: 42, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14, marginTop: 6 },
  backBtnWideText: { color: '#64748B', fontSize: 14, fontWeight: '600' },

  cancelBtn:     { height: 50, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#E53E3E', borderRadius: 14, marginTop: 8 },
  cancelBtnText: { color: '#E53E3E', fontSize: 15, fontWeight: '700' },

  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#64748B', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 },

  // Transport model toggle
  transportRow:         { flexDirection: 'row', gap: 8, marginBottom: 12 },
  transportBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: BRAND, borderRadius: 10, paddingVertical: 10, backgroundColor: '#fff' },
  transportBtnActive:   { backgroundColor: BRAND },
  transportLabel:       { fontSize: 13, fontWeight: '600', color: BRAND },
  transportLabelActive: { color: '#fff' },

  // Vehicle carousel cards
  vehicleCard:          { borderWidth: 1.5, borderColor: BRAND, borderRadius: 12, padding: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', minHeight: 88 },
  vehicleCardActive:    { backgroundColor: BRAND },
  vehicleCardLabel:     { fontSize: 13, fontWeight: '700', color: BRAND, marginTop: 6, textAlign: 'center' },
  vehicleCardLabelActive: { color: '#fff' },
  vehicleCardSpec:      { fontSize: 11, fontWeight: '700', color: '#64748B', textAlign: 'center', marginTop: 2 },
  vehicleCardSpecActive:  { color: 'rgba(255,255,255,0.75)' },
  iconWrap: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  passengerRow: { flexDirection: 'row' as const, gap: 3, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: 3 },
  passengerCount: { fontSize: 12, fontWeight: '700' as const, color: '#64748B' },
  passengerCountActive: { color: 'rgba(255,255,255,0.85)' },
  vehicleScrollHint:    { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginTop: 6, marginBottom: 2 },

  // Route summary (step 3)
  routeSummary:    { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginBottom: 12 },
  routeRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  routeIcon:       { marginTop: 13, flexShrink: 0 },
  routePointLabel: { fontSize: 10, fontWeight: '700', color: BRAND, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 1 },
  routeText:       { fontSize: 13, color: '#0F172A', fontWeight: '500', paddingTop: 2 },
  routeLine:       { width: 2, height: 8, backgroundColor: '#CBD5E1', marginLeft: 7, marginVertical: 2 },

  noteWrap:  { borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 12, backgroundColor: '#F8FAFC', marginBottom: 4 },
  noteInput: { fontSize: 14, color: '#0F172A', paddingVertical: 10, textAlignVertical: 'top' },

  swipeHint: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginBottom: 8, fontStyle: 'italic' },

  // Freight contact fields (steps 1-2)
  freightContactBlock: { marginBottom: 8, marginTop: 4 },
  freightContactTitle: { fontSize: 12, fontWeight: '600', color: BRAND, marginBottom: 5, letterSpacing: 0.3 },
  freightContactRow:  { flexDirection: 'row' },
  freightInputWrap:   {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 8, backgroundColor: '#F8FAFC',
  },
  freightInput:       { flex: 1, fontSize: 13, color: '#0F172A', paddingVertical: 0 },

  // Freight summary (step 3, page 2) – legacy, kept for safety
  freightSummaryRow:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  freightSummaryLabel: { fontSize: 10, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 1 },
  freightSummaryValue: { fontSize: 13, color: '#0F172A', fontWeight: '600' },
  freightSummaryPhone: { fontSize: 12, color: '#64748B', marginTop: 1 },

  // Freight step 3 – cards
  freightInfoCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  freightCardHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  freightCardTitle:   { fontSize: 11, fontWeight: '700', color: BRAND, textTransform: 'uppercase', letterSpacing: 0.5 },
  freightInfoRow:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  freightInfoIcon:    { marginTop: 2, marginRight: 6, flexShrink: 0 },
  freightInfoName:    { flex: 1, fontSize: 14, fontWeight: '600', color: BRAND, lineHeight: 20 },
  freightInfoAddress: { flex: 1, fontSize: 13, color: '#475569', lineHeight: 19 },
  freightDistCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8,
  },
  freightInfoDist:    { fontSize: 13, color: '#475569', fontWeight: '600' },
  freightInfoDivider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 8 },

  // Freight step 3 – note card
  freightNoteCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 0,
  },
  freightNoteLabel: { fontSize: 11, fontWeight: '700', color: '#92400E', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Quotes panel
  quotesHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, marginTop: 4 },
  quotesTitle:     { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  quotesCountdown: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  quotesCenter:    { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  quotesHint:      { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 10 },
})
