import { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator,
  Animated, Dimensions, Modal,
} from 'react-native'
import { showAlert } from '../../src/components/GlobalAlert'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import MapViewComponent, { type MapViewHandle } from '../../src/components/MapView'
import QuoteList from '../../src/components/QuoteList'
import { rtdb } from '../../src/services/firebase'
import { notifyDrivers, notifySelectedDriver } from '../../src/services/cloudflare'
import {
  getCurrentLocation, reverseGeocode, searchAddresses,
  getRouteDistanceKm, geohashForQuery,
} from '../../src/services/location'
import { isOnWifi } from '../../src/services/network'
import NetworkAlert from '../../src/components/NetworkAlert'
import type { CustomerInfo, VehicleType, TripQuote } from '../../src/types'
import { SecureStoreKey } from '../../src/types'
import { TRANSPORT_MODELS } from '../../src/data/vehicles'
import type { TransportModel } from '../../src/data/vehicles'
import { TRIP } from '../../src/constants'
import { nanoid } from '../../src/utils/nanoid'

const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')

const PANEL_H = Math.min(Math.round(SCREEN_H * 0.46), 380)
const PANEL_W = SCREEN_W - 32

// Increase AD_BOTTOM_H to 60 when AdMob banner is enabled
const AD_BOTTOM_H  = 0
const PANEL_BOTTOM = 16 + AD_BOTTOM_H

// Pin tip is centered in the visible map area above the panel
const TOP_BAR_H   = 80
const PANEL_TOP_Y = SCREEN_H - PANEL_BOTTOM - PANEL_H
const PIN_TOP_PCT = Math.round(((TOP_BAR_H + PANEL_TOP_Y) / 2 / SCREEN_H) * 100)

// Vehicle carousel card width
const INNER_W = PANEL_W - 40
const CARD_W  = Math.floor(INNER_W / 2.2)

const INIT_LAT = 10.7769
const INIT_LNG = 106.7009

type Step = 0 | 1 | 2 | 3 | 4

interface LocPoint { lat: number; lng: number; address: string }
interface SavedLoc  { name: string; lat: number; lng: number; address: string }
interface SuggItem  { lat: number; lng: number; name: string }

const SAVED_KEY = 'opendrive_saved_locs'

// ─────────────────────────────────────────────
export default function CustomerHomeScreen() {
  const { t } = useTranslation()

  const [step,             setStep]             = useState<Step>(0)
  const [pickup,           setPickup]           = useState<LocPoint | null>(null)
  const [dest,             setDest]             = useState<LocPoint | null>(null)
  const [pickupText,       setPickupText]       = useState('')
  const [destText,         setDestText]         = useState('')
  const [note,             setNote]             = useState('')
  const [vehicle,          setVehicle]          = useState<VehicleType>('motorbike')
  const [transportModel,   setTransportModel]   = useState<TransportModel>('passenger')
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

  const mapRef      = useRef<MapViewHandle>(null)
  const panelX      = useRef(new Animated.Value(0)).current
  const isAnimating = useRef(false)
  const stepRef     = useRef<Step>(0)
  const progPan     = useRef(false)
  const mapCenter   = useRef<{ lat: number; lng: number }>({ lat: INIT_LAT, lng: INIT_LNG })
  const revTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suggTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCount   = useRef(0)
  const quotesRef   = useRef<TripQuote[]>([])

  useEffect(() => { stepRef.current = step }, [step])
  useEffect(() => { quotesRef.current = quotes }, [quotes])
  useEffect(() => { loadSavedLocs() }, [])

  // Cleanup poll on unmount
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
          if (list.length > 0) {
            setQuotes(list)
            setQuotesSearching(false)
          }
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

  // ── Helpers ───────────────────────────────────────────────────────────────
  function panTo(lat: number, lng: number) {
    progPan.current = true
    mapRef.current?.panTo(lat, lng)
    setTimeout(() => { progPan.current = false }, 900)
  }

  async function fetchCurrentLocation() {
    try {
      const loc     = await getCurrentLocation()
      mapCenter.current = { lat: loc.lat, lng: loc.lng }
      panTo(loc.lat, loc.lng)
      const address = await reverseGeocode(loc.lat, loc.lng)
      const point   = { lat: loc.lat, lng: loc.lng, address }
      if (stepRef.current === 1) {
        setPickupText(address); setPickup(point)
      } else if (stepRef.current === 2) {
        setDestText(address); setDest(point)
      }
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
        if (stepRef.current === 1) {
          setPickupText(address); setPickup({ lat, lng, address })
        } else if (stepRef.current === 2) {
          setDestText(address); setDest({ lat, lng, address })
        }
      } catch {}
    }, 600)
  }

  function handlePickupType(text: string) {
    setPickupText(text)
    setPickupSugg([])
    if (suggTimer.current) clearTimeout(suggTimer.current)
    if (text.length < 3) return
    suggTimer.current = setTimeout(async () => {
      const { lat, lng } = mapCenter.current
      const results = await searchAddresses(text, 4, lat, lng)
      setPickupSugg(results)
    }, 600)
  }

  function handleDestType(text: string) {
    setDestText(text)
    setDestSugg([])
    if (suggTimer.current) clearTimeout(suggTimer.current)
    if (text.length < 3) return
    suggTimer.current = setTimeout(async () => {
      const { lat, lng } = mapCenter.current
      const results = await searchAddresses(text, 4, lat, lng)
      setDestSugg(results)
    }, 600)
  }

  function handlePickupSuggSelect(s: SuggItem) {
    setPickupText(s.name)
    setPickup({ lat: s.lat, lng: s.lng, address: s.name })
    setPickupSugg([])
    panTo(s.lat, s.lng)
  }

  function handleDestSuggSelect(s: SuggItem) {
    setDestText(s.name)
    setDest({ lat: s.lat, lng: s.lng, address: s.name })
    setDestSugg([])
    panTo(s.lat, s.lng)
  }

  // ── Saved locations ───────────────────────────────────────────────────────
  async function loadSavedLocs() {
    try {
      const raw = await AsyncStorage.getItem(SAVED_KEY)
      if (raw) setSavedLocs(JSON.parse(raw))
    } catch {}
  }

  function selectSavedLoc(loc: SavedLoc) {
    if (stepRef.current === 1) {
      setPickupText(loc.address); setPickup({ lat: loc.lat, lng: loc.lng, address: loc.address })
    } else if (stepRef.current === 2) {
      setDestText(loc.address); setDest({ lat: loc.lat, lng: loc.lng, address: loc.address })
    }
    panTo(loc.lat, loc.lng)
  }

  function openSaveModal() {
    const point = stepRef.current === 1 ? pickup : dest
    if (!point) return
    setSaveModalPoint(point)
    setSaveModalName('')
    setSaveModalVisible(true)
  }

  async function handleSaveConfirm() {
    if (!saveModalPoint || !saveModalName.trim()) return
    const name    = saveModalName.trim().slice(0, 20)
    const newList = [
      { name, ...saveModalPoint },
      ...savedLocs.filter(l => l.name !== name),
    ].slice(0, 6)
    setSavedLocs(newList)
    await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(newList)).catch(() => {})
    setSaveModalVisible(false)
  }

  async function handleRemoveSaved(name: string) {
    const newList = savedLocs.filter(l => l.name !== name)
    setSavedLocs(newList)
    await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(newList)).catch(() => {})
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  function goToStep(next: Step) {
    if (isAnimating.current) return
    isAnimating.current = true
    const goingForward = next > stepRef.current
    Animated.timing(panelX, {
      toValue: goingForward ? -PANEL_W : PANEL_W,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setStep(next)
      requestAnimationFrame(() => {
        panelX.setValue(goingForward ? PANEL_W : -PANEL_W)
        Animated.spring(panelX, {
          toValue: 0, tension: 85, friction: 11, useNativeDriver: true,
        }).start(() => { isAnimating.current = false })
      })
    })
  }

  function confirmVehicle() { goToStep(1) }

  function confirmPickup() {
    if (!pickup) { showAlert(t('common.error'), t('trip.pickupPlaceholder')); return }
    goToStep(2)
  }

  async function confirmDest() {
    if (!dest) { showAlert(t('common.error'), t('trip.destPlaceholder')); return }
    goToStep(3)
    if (pickup) {
      try {
        const km = await getRouteDistanceKm(pickup.lat, pickup.lng, dest.lat, dest.lng)
        setDistKm(Math.max(0.1, Math.round(km * 10) / 10))
      } catch { setDistKm(null) }
    }
  }

  function handleLogout() {
    showAlert(
      t('settings.logout'),
      t('settings.logoutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.logout'), style: 'destructive',
          onPress: async () => {
            await SecureStore.deleteItemAsync(SecureStoreKey.CUSTOMER_INFO).catch(() => {})
            await SecureStore.deleteItemAsync(SecureStoreKey.USER_ROLE).catch(() => {})
            router.replace('/role-select')
          },
        },
      ],
    )
  }

  function handleHistory() {
    showAlert(t('history.title'), 'Tính năng đang phát triển.')
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

      const tripId = nanoid()
      await rtdb.set(`trips/${tripId}/info`, {
        customerPhone:  info.phone,
        pickupGeohash,
        dropGeohash,
        pickupLat:      pickup.lat,
        pickupLng:      pickup.lng,
        dropLat:        dest.lat,
        dropLng:        dest.lng,
        vehicleType:    vehicle,
        transportModel,
        estimatedKm:    Math.max(1, Math.round(km * 10) / 10),
        pickupAddress:  pickup.address,
        destAddress:    dest.address,
        note:           note.trim(),
        createdAt:      Date.now(),
        status:         'waiting',
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

  async function handleSelectDriver(quote: TripQuote) {
    if (!activeTripId) return
    try {
      // Kiểm tra quote còn trên RTDB không — tài xế có thể đã hủy trong 5s
      const still = await rtdb.get(`trips/${activeTripId}/quotes/${quote.driverUid}`)
      if (!still) {
        showAlert('Tài xế đã hủy', 'Tài xế này đã hủy báo giá, vui lòng chọn tài xế khác.')
        setQuotes(prev => prev.filter(q => q.driverUid !== quote.driverUid))
        return
      }
    } catch {}

    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    try {
      await notifySelectedDriver(activeTripId, quote.driverUid)
      router.push({
        pathname: '/(customer)/tracking',
        params: { tripId: activeTripId, driverUid: quote.driverUid },
      })
    } catch (e: unknown) {
      showAlert(t('common.error'), (e as Error).message)
    }
  }

  async function handleCancelSearch() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (activeTripId) await rtdb.delete(`trips/${activeTripId}`).catch(() => {})
    setActiveTripId(null)
    setQuotes([])
    setSearchFailed(false)
    goToStep(3)
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
        crosshairTopPct={PIN_TOP_PCT}
        onCenterChange={handleCenterChange}
        onMapReady={fetchCurrentLocation}
      />

      {/* Top bar */}
      <SafeAreaView style={styles.topBar} edges={['top']}>
        <TouchableOpacity style={styles.topBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#fff" />
        </TouchableOpacity>

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
          ) : (
            <ActivityIndicator color="#fff" size="small" />
          )}
        </View>

        <TouchableOpacity style={styles.topBtn} onPress={handleHistory}>
          <Ionicons name="time-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </SafeAreaView>

      {/* Panel: outer View = shadow only, inner View = overflow:hidden clip */}
      <View style={styles.panelContainer}>
        <View style={styles.panelClipper}>
          <Animated.View style={[styles.panelContent, { transform: [{ translateX: panelX }] }]}>
            {step === 0 && (
              <VehiclePanel
                vehicle={vehicle}
                transportModel={transportModel}
                onVehicleChange={setVehicle}
                onTransportModelChange={(m: TransportModel) => {
                  setTransportModel(m)
                  const model = TRANSPORT_MODELS.find(x => x.key === m) ?? TRANSPORT_MODELS[0]
                  setVehicle(model.vehicles[0].key as VehicleType)
                }}
                onConfirm={confirmVehicle}
                t={t}
              />
            )}
            {step === 1 && (
              <PickupPanel
                text={pickupText}
                onChangeText={handlePickupType}
                onGPS={fetchCurrentLocation}
                onSave={openSaveModal}
                savedLocs={savedLocs}
                onSelectSaved={selectSavedLoc}
                onRemoveSaved={handleRemoveSaved}
                suggestions={pickupSugg}
                onSelectSugg={handlePickupSuggSelect}
                onBack={() => goToStep(0)}
                onConfirm={confirmPickup}
                t={t}
              />
            )}
            {step === 2 && (
              <DestPanel
                text={destText}
                onChangeText={handleDestType}
                onGPS={fetchCurrentLocation}
                onSave={openSaveModal}
                savedLocs={savedLocs}
                onSelectSaved={selectSavedLoc}
                onRemoveSaved={handleRemoveSaved}
                suggestions={destSugg}
                onSelectSugg={handleDestSuggSelect}
                onBack={() => goToStep(1)}
                onConfirm={confirmDest}
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
                onBack={() => goToStep(2)}
                onBook={handleBook}
                loading={bookLoading}
                t={t}
              />
            )}
            {step === 4 && (
              <QuotesPanel
                searching={quotesSearching}
                searchFailed={searchFailed}
                countdown={countdown}
                quotes={quotes}
                onSelectDriver={handleSelectDriver}
                onCancel={handleCancelSearch}
                t={t}
              />
            )}
          </Animated.View>
        </View>
      </View>

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
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setSaveModalVisible(false)}
              >
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
  value, onChangeText, placeholder, autoFocus,
}: { value: string; onChangeText: (t: string) => void; placeholder: string; autoFocus?: boolean }) {
  return (
    <View style={sub.inputWrap}>
      <Ionicons name="location-outline" size={18} color={BRAND} style={{ marginRight: 8 }} />
      <TextInput
        style={sub.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        autoFocus={autoFocus}
        returnKeyType="search"
      />
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
  savedLocs, onSelect, onRemove, onGPS, t,
}: { savedLocs: SavedLoc[]; onSelect: (l: SavedLoc) => void; onRemove: (name: string) => void; onGPS: () => void; t: any }) {
  return (
    <View style={sub.chipsWrap}>
      {/* GPS chip – permanent, cannot be deleted */}
      <TouchableOpacity
        style={[sub.chipContainer, sub.chipGps]}
        onPress={onGPS}
        activeOpacity={0.75}
      >
        <Ionicons name="locate-outline" size={13} color="#fff" />
        <Text style={[sub.chipText, sub.chipGpsText]}>{t('trip.useMyLocation')}</Text>
      </TouchableOpacity>

      {/* Saved chips */}
      {savedLocs.map((loc, i) => (
        <View key={i} style={sub.chipContainer}>
          <TouchableOpacity style={sub.chipContent} onPress={() => onSelect(loc)}>
            <Ionicons name="bookmark-outline" size={13} color={BRAND} />
            <Text style={sub.chipText}>{loc.name}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={sub.chipRemoveBtn}
            onPress={() => onRemove(loc.name)}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 6 }}
          >
            <Ionicons name="close-outline" size={14} color="#94A3B8" />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  )
}

// Panel 0 – Transport model + Vehicle carousel
function VehiclePanel({
  vehicle, transportModel, onVehicleChange, onTransportModelChange, onConfirm, t,
}: any) {
  const modelConfig = TRANSPORT_MODELS.find((m: any) => m.key === transportModel) ?? TRANSPORT_MODELS[0]
  const vehicles    = modelConfig.vehicles

  return (
    <View style={sub.panelFlex}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={sub.panelHeader}>
          <Text style={sub.panelTitle}>{t('trip.selectVehicleTitle')}</Text>
        </View>

        {/* Transport model toggle */}
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

        {/* Vehicle carousel */}
        <Text style={sub.sectionLabel}>{t('trip.vehicleType')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_W + 10}
          decelerationRate="fast"
          contentContainerStyle={{ paddingRight: 4 }}
          style={{ marginBottom: 2 }}
        >
          {vehicles.map((v: any) => {
            const active = vehicle === v.key
            return (
              <TouchableOpacity
                key={`${transportModel}-${v.key}`}
                style={[sub.vehicleCard, active && sub.vehicleCardActive, { width: CARD_W, marginRight: 10 }]}
                onPress={() => onVehicleChange(v.key)}
                activeOpacity={0.75}
              >
                <Ionicons name={v.icon} size={28} color={active ? '#fff' : BRAND} />
                <Text style={[sub.vehicleCardLabel, active && sub.vehicleCardLabelActive]}>
                  {t(`vehicle.${v.key}`)}
                </Text>
                <Text style={[sub.vehicleCardSpec, active && sub.vehicleCardSpecActive]}>
                  {t(v.specKey)}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
        <Text style={sub.vehicleScrollHint}>{t('trip.vehicleScrollHint')}</Text>
      </ScrollView>

      <TouchableOpacity style={[sub.confirmBtn, { marginTop: 6 }]} onPress={onConfirm} activeOpacity={0.85}>
        <Text style={sub.confirmBtnText}>{t('common.continue')}</Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  )
}

// Panel 1 – Pickup location
function PickupPanel({
  text, onChangeText, onGPS, onSave, savedLocs, onSelectSaved, onRemoveSaved,
  suggestions, onSelectSugg, onBack, onConfirm, t,
}: any) {
  const showSugg = suggestions.length > 0
  return (
    <View style={sub.panelFlex}>
      <View style={sub.panelHeader}>
        <TouchableOpacity style={sub.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back-outline" size={18} color={BRAND} />
        </TouchableOpacity>
        <Text style={sub.panelTitle}>{t('trip.stepPickup')}</Text>
        <TouchableOpacity style={sub.iconBtn} onPress={onSave}>
          <Ionicons name="bookmark-outline" size={18} color={BRAND} />
        </TouchableOpacity>
      </View>
      <AddressInput
        value={text}
        onChangeText={onChangeText}
        placeholder={t('trip.pickupPlaceholder')}
      />
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {showSugg ? (
          <View style={sub.suggList}>
            {suggestions.map((s: SuggItem, i: number) => (
              <SuggRow key={i} item={s} onPress={() => onSelectSugg(s)} />
            ))}
          </View>
        ) : (
          <SavedChips
            savedLocs={savedLocs}
            onSelect={onSelectSaved}
            onRemove={onRemoveSaved}
            onGPS={onGPS}
            t={t}
          />
        )}
      </ScrollView>
      <TouchableOpacity style={[sub.confirmBtn, { marginTop: 8 }]} onPress={onConfirm} activeOpacity={0.85}>
        <Text style={sub.confirmBtnText}>{t('trip.confirmPickup')}</Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  )
}

// Panel 2 – Destination
function DestPanel({
  text, onChangeText, onGPS, onSave, savedLocs, onSelectSaved, onRemoveSaved,
  suggestions, onSelectSugg, onBack, onConfirm, t,
}: any) {
  const showSugg = suggestions.length > 0
  return (
    <View style={sub.panelFlex}>
      <View style={sub.panelHeader}>
        <TouchableOpacity style={sub.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back-outline" size={18} color={BRAND} />
        </TouchableOpacity>
        <Text style={sub.panelTitle}>{t('trip.stepDest')}</Text>
        <TouchableOpacity style={sub.iconBtn} onPress={onSave}>
          <Ionicons name="bookmark-outline" size={18} color={BRAND} />
        </TouchableOpacity>
      </View>
      <AddressInput
        value={text}
        onChangeText={onChangeText}
        placeholder={t('trip.destPlaceholder')}
        autoFocus
      />
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {showSugg ? (
          <View style={sub.suggList}>
            {suggestions.map((s: SuggItem, i: number) => (
              <SuggRow key={i} item={s} onPress={() => onSelectSugg(s)} />
            ))}
          </View>
        ) : (
          <SavedChips
            savedLocs={savedLocs}
            onSelect={onSelectSaved}
            onRemove={onRemoveSaved}
            onGPS={onGPS}
            t={t}
          />
        )}
      </ScrollView>
      <TouchableOpacity style={[sub.confirmBtn, { marginTop: 8 }]} onPress={onConfirm} activeOpacity={0.85}>
        <Text style={sub.confirmBtnText}>{t('trip.confirmDest')}</Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  )
}

// Panel 3 – Summary + Note + Book
function BookPanel({
  pickup, dest, note, distKm,
  onNoteChange, onBack, onBook, loading, t,
}: any) {
  return (
    <View style={sub.panelFlex}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={sub.routeSummary}>
          <View style={sub.routeRow}>
            <Ionicons name="location-sharp" size={16} color={BRAND} style={sub.routeIcon} />
            <View style={{ flex: 1 }}>
              <Text style={sub.routePointLabel}>{t('trip.pickupLabel')}</Text>
              <Text style={sub.routeText} numberOfLines={1}>{pickup?.address}</Text>
            </View>
          </View>
          <View style={sub.routeLine} />
          <View style={sub.routeRow}>
            <Ionicons name="location-sharp" size={16} color={BRAND} style={sub.routeIcon} />
            <View style={{ flex: 1 }}>
              <Text style={sub.routePointLabel}>{t('trip.destLabel')}</Text>
              <Text style={sub.routeText} numberOfLines={1}>{dest?.address}</Text>
            </View>
          </View>
          {distKm != null && (
            <>
              <View style={sub.routeLine} />
              <View style={[sub.routeRow, { alignItems: 'center' }]}>
                <Ionicons name="navigate-outline" size={16} color={BRAND} style={{ flexShrink: 0 }} />
                <View style={{ flex: 1 }}>
                  <Text style={sub.routeText}>{t('trip.estDistance', { km: distKm })}</Text>
                </View>
              </View>
            </>
          )}
        </View>

        <Text style={sub.sectionLabel}>{t('trip.note')}</Text>
        <View style={sub.noteWrap}>
          <TextInput
            style={sub.noteInput}
            value={note}
            onChangeText={onNoteChange}
            placeholder={t('trip.notePlaceholder')}
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={2}
            maxLength={100}
          />
        </View>
      </ScrollView>

      <TouchableOpacity
        style={[sub.confirmBtn, { marginTop: 8 }, loading && { opacity: 0.7 }]}
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

      <TouchableOpacity style={sub.backTextBtn} onPress={onBack}>
        <Ionicons name="arrow-back-outline" size={14} color="#64748B" />
        <Text style={sub.backTextBtnLabel}>{t('common.back')}</Text>
      </TouchableOpacity>
    </View>
  )
}

// Panel 4 – Quotes from drivers
function QuotesPanel({
  searching, searchFailed, countdown, quotes, onSelectDriver, onCancel, t,
}: any) {
  return (
    // Negative margins to fill the panel container including padding
    <View style={{ flex: 1, flexDirection: 'column', margin: -20 }}>
      {/* Header */}
      <View style={[sub.panelHeader, { paddingHorizontal: 20, paddingTop: 16, marginBottom: 4 }]}>
        <Text style={[sub.panelTitle, { textAlign: 'left' }]}>
          {searchFailed
            ? t('trip.noDriver')
            : quotes.length > 0
              ? t('trip.quotes')
              : t('trip.searching')}
        </Text>
        {searching && !searchFailed && (
          <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '600' }}>{countdown}s</Text>
        )}
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {quotes.length > 0 ? (
          <QuoteList quotes={quotes} onSelect={onSelectDriver} />
        ) : searching ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={BRAND} />
            <Text style={{ marginTop: 10, fontSize: 13, color: '#94A3B8' }}>
              {t('trip.searching')}
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
            <Ionicons name="search-outline" size={44} color="#CBD5E1" />
            <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 10 }}>
              {t('trip.noDriver')}
            </Text>
          </View>
        )}
      </View>

      {/* Cancel button */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
        <TouchableOpacity style={sub.cancelBtn} onPress={onCancel} activeOpacity={0.85}>
          <Text style={sub.cancelBtnText}>
            {searchFailed ? t('common.retry') : t('cancel.yes')}
          </Text>
        </TouchableOpacity>
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
  },
  topBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: BRAND, justifyContent: 'center', alignItems: 'center',
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4,
  },
  dotsArea: { flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  dot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { backgroundColor: '#fff' },

  dragHintPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
  },
  dragHintText: { color: '#fff', fontSize: 12 },

  panelContainer: {
    position: 'absolute', bottom: PANEL_BOTTOM, left: 16, right: 16,
    borderRadius: 20, backgroundColor: '#fff',
    elevation: 10,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: -4 },
  },
  panelClipper: { overflow: 'hidden', borderRadius: 20, height: PANEL_H },
  panelContent:  { padding: 20, height: PANEL_H },

  // Save modal – appears in map area, not over the panel
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-start', alignItems: 'center',
    paddingTop: TOP_BAR_H + 48, paddingHorizontal: 24,
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
  // Common panel flex container
  panelFlex: { flex: 1, flexDirection: 'column' },

  panelHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  panelTitle:  { flex: 1, fontSize: 16, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
  backBtn:     { width: 32, height: 32, borderRadius: 16, backgroundColor: BRAND_LIGHT, justifyContent: 'center', alignItems: 'center' },
  iconBtn:     { width: 32, height: 32, borderRadius: 16, backgroundColor: BRAND_LIGHT, justifyContent: 'center', alignItems: 'center' },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 2,
    backgroundColor: '#F8FAFC', marginBottom: 8,
  },
  input: { flex: 1, fontSize: 14, color: '#0F172A', paddingVertical: 10 },

  // Saved chips – wrap layout
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 },
  chipContainer: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20,
    backgroundColor: '#F8FAFC', overflow: 'hidden',
  },
  chipGps: {
    backgroundColor: BRAND, borderColor: BRAND,
    paddingLeft: 10, paddingRight: 10, paddingVertical: 7,
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  chipGpsText: { color: '#fff' },
  chipContent:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 10, paddingVertical: 7, paddingRight: 4 },
  chipText:      { fontSize: 12, color: BRAND, fontWeight: '500' },
  chipRemoveBtn: { paddingVertical: 7, paddingLeft: 2, paddingRight: 8 },

  // Autocomplete suggestions
  suggList: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, overflow: 'hidden', marginTop: 4 },
  suggRow:  { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  suggText: { flex: 1, fontSize: 13, color: '#0F172A', lineHeight: 18 },

  confirmBtn:     { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, height: 50, backgroundColor: BRAND, borderRadius: 14 },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  cancelBtn:     { height: 50, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#E53E3E', borderRadius: 14 },
  cancelBtnText: { color: '#E53E3E', fontSize: 15, fontWeight: '700' },

  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#64748B', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 },

  // Transport model toggle
  transportRow:         { flexDirection: 'row', gap: 8, marginBottom: 12 },
  transportBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: BRAND, borderRadius: 10, paddingVertical: 10, backgroundColor: '#fff' },
  transportBtnActive:   { backgroundColor: BRAND },
  transportLabel:       { fontSize: 13, fontWeight: '600', color: BRAND },
  transportLabelActive: { color: '#fff' },

  // Vehicle carousel cards
  vehicleCard:          {
    borderWidth: 1.5, borderColor: BRAND, borderRadius: 12, padding: 12,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    minHeight: 88,
  },
  vehicleCardActive:    { backgroundColor: BRAND },
  vehicleCardLabel:     { fontSize: 13, fontWeight: '700', color: BRAND, marginTop: 6, textAlign: 'center' },
  vehicleCardLabelActive: { color: '#fff' },
  vehicleCardSpec:      { fontSize: 11, color: '#64748B', textAlign: 'center', marginTop: 2 },
  vehicleCardSpecActive:  { color: 'rgba(255,255,255,0.75)' },

  // Route summary (step 3)
  routeSummary:    { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginBottom: 12 },
  routeRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  routeIcon:       { marginTop: 13, flexShrink: 0 },
  routePointLabel: { fontSize: 10, fontWeight: '700', color: BRAND, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 1 },
  routeText:       { fontSize: 13, color: '#0F172A', fontWeight: '500', paddingTop: 2 },
  routeLine:       { width: 2, height: 8, backgroundColor: '#CBD5E1', marginLeft: 7, marginVertical: 2 },

  // Vehicle carousel scroll hint
  vehicleScrollHint: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginTop: 6, marginBottom: 2 },

  noteWrap:  { borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 12, backgroundColor: '#F8FAFC', marginBottom: 4 },
  noteInput: { fontSize: 14, color: '#0F172A', paddingVertical: 10, textAlignVertical: 'top' },

  backTextBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10 },
  backTextBtnLabel: { fontSize: 13, color: '#64748B' },
})
