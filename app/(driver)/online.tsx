// app/(driver)/online.tsx

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput, Switch,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, Animated, Dimensions, StatusBar,
} from 'react-native'
import { showAlert } from '../../src/components/GlobalAlert'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as SecureStore from 'expo-secure-store'
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { rtdb } from '../../src/services/firebase'
import { updateDriverStatus } from '../../src/services/firestore'
import { getCurrentLocation } from '../../src/services/location'
import { hasEnoughODC, getODCBalance } from '../../src/services/odc'
import { maskPhone } from '../../src/utils/format'
import { savePendingTrip } from '../../src/utils/storage'
import MapView from '../../src/components/MapView'
import type { MapViewHandle } from '../../src/components/MapView'
import {
  SecureStoreKey, AsyncStorageKey, DriverInfo, DriverStatus,
  TripRealtimeInfo, TripQuote, AutoQuoteSettings,
  DEFAULT_AUTO_QUOTE_SETTINGS, PendingTrip,
} from '../../src/types'

const { height: SCREEN_H } = Dimensions.get('window')
const SHEET_HEIGHT  = Math.round(SCREEN_H * 0.56)
const COLLAPSED_Y   = SHEET_HEIGHT - 72   // chỉ handle bar lộ ra
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

function calcAutoPrice(info: TripRealtimeInfo, s: AutoQuoteSettings): number {
  const km    = info.estimatedKm ?? 0
  const extra = Math.max(0, km - s.baseKm) * s.pricePerKm
  let price   = s.basePrice + extra
  if (s.rainModeEnabled) price *= s.rainMultiplier
  return Math.round(price / 1000) * 1000
}

export default function OnlineScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const mapRef = useRef<MapViewHandle>(null)

  const [driverName,   setDriverName]   = useState('')
  const [driverRating, setDriverRating] = useState(0)
  const [odcBalance,   setOdcBalance]   = useState(0)
  const [mapLat,       setMapLat]       = useState(10.7769)
  const [mapLng,       setMapLng]       = useState(106.7009)
  const [trips,        setTrips]        = useState<TripCard[]>([])
  const [autoSettings, setAutoSettings] = useState<AutoQuoteSettings>(DEFAULT_AUTO_QUOTE_SETTINGS)
  const [sheetOpen,    setSheetOpen]    = useState(false)

  const driverInfoRef   = useRef<DriverInfo | null>(null)
  const odcBalanceRef   = useRef(0)
  const autoSettingsRef = useRef<AutoQuoteSettings>(DEFAULT_AUTO_QUOTE_SETTINGS)
  const mapInitRef      = useRef(false)

  // Sheet animation
  const sheetAnim = useRef(new Animated.Value(COLLAPSED_Y)).current

  useEffect(() => { odcBalanceRef.current   = odcBalance   }, [odcBalance])
  useEffect(() => { autoSettingsRef.current = autoSettings }, [autoSettings])

  // Auto-expand sheet khi có chuyến mới
  useEffect(() => {
    if (trips.length > 0 && !sheetOpen) {
      openSheet()
    } else if (trips.length === 0 && sheetOpen) {
      closeSheet()
    }
  }, [trips.length])

  function openSheet() {
    setSheetOpen(true)
    Animated.spring(sheetAnim, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 180,
    }).start()
  }

  function closeSheet() {
    setSheetOpen(false)
    Animated.spring(sheetAnim, {
      toValue: COLLAPSED_Y,
      useNativeDriver: true,
      damping: 20,
      stiffness: 180,
    }).start()
  }

  function toggleSheet() {
    sheetOpen ? closeSheet() : openSheet()
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


    const balance = await getODCBalance(info.stellarWallet)
    setOdcBalance(balance)

    const settingsRaw = await AsyncStorage.getItem(AsyncStorageKey.AUTO_QUOTE_SETTINGS)
    if (settingsRaw) {
      const s = JSON.parse(settingsRaw) as AutoQuoteSettings
      setAutoSettings(s)
      autoSettingsRef.current = s
    }

    try {
      const { lat, lng } = await getCurrentLocation()
      setMapLat(lat)
      setMapLng(lng)
      mapInitRef.current = true
    } catch {}
  }

  useEffect(() => {
    if (mapLat !== 10.7769 && mapInitRef.current) {
      mapRef.current?.updateDriverMarker(mapLat, mapLng)
    }
  }, [mapLat, mapLng])

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
    if (data.type === 'trip_selected' && data.tripId) handleTripSelected(data.tripId)
  }

  // ── Thêm chuyến mới ──────────────────────────────────────────────────────────
  const addTrip = useCallback(async (tripId: string) => {
    setTrips(prev => {
      if (prev.find(t => t.tripId === tripId)) return prev
      return [...prev, { tripId, info: null, loading: true, cardState: 'idle', priceInput: '', autoQuoted: false }]
    })
    try {
      const info = await rtdb.get<TripRealtimeInfo>(`trips/${tripId}/info`)
      if (!info || info.status !== 'waiting') {
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
            ? { ...t, info, loading: false, cardState: 'quoted', priceInput: String(autoPrice), autoQuoted: true }
            : t,
          ))
          return
        }
      }
      setTrips(prev => prev.map(t => t.tripId === tripId ? { ...t, info, loading: false } : t))
    } catch {
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
    }
    await rtdb.set(`trips/${tripId}/quotes/${drv.uid}`, quote)
  }

  async function handleManualQuote(tripId: string, priceStr: string) {
    const price = parseInt(priceStr, 10)
    if (!price || price <= 0) { showAlert(t('common.error'), 'Vui lòng nhập giá hợp lệ'); return }
    if (!hasEnoughODC(price, odcBalanceRef.current)) {
      showAlert(t('common.error'), t('error.insufficientODC'))
      return
    }
    const drv = driverInfoRef.current
    if (!drv) return
    try {
      await submitQuote(tripId, price, drv)
      setTrips(prev => prev.map(t => t.tripId === tripId ? { ...t, cardState: 'quoted' } : t))
    } catch {
      showAlert(t('common.error'), t('error.serverError'))
    }
  }

  async function handleCancelQuote(tripId: string) {
    const drv = driverInfoRef.current
    if (!drv) return
    try {
      await rtdb.delete(`trips/${tripId}/quotes/${drv.uid}`)
      setTrips(prev => prev.map(t =>
        t.tripId === tripId ? { ...t, cardState: 'idle', priceInput: '' } : t,
      ))
    } catch {
      showAlert(t('common.error'), t('error.serverError'))
    }
  }

  // ── Được khách chọn ──────────────────────────────────────────────────────────
  async function handleTripSelected(tripId: string) {
    const drv = driverInfoRef.current
    if (!drv) return
    try {
      const [tripInfo, quote] = await Promise.all([
        rtdb.get<TripRealtimeInfo>(`trips/${tripId}/info`),
        rtdb.get<TripQuote>(`trips/${tripId}/quotes/${drv.uid}`),
      ])
      if (!tripInfo || !quote) return
      const pending: PendingTrip = {
        tripId,
        driverUid:     drv.uid,
        tripPrice:     quote.quotedPrice,
        startedAt:     new Date().toISOString(),
        pickupGeohash: tripInfo.pickupGeohash,
        dropGeohash:   tripInfo.dropGeohash,
        customerPhone: tripInfo.customerPhone,
        rating:        null,
      }
      await savePendingTrip(pending)
      await updateDriverStatus(drv.uid, 'busy')
      await SecureStore.setItemAsync(
        SecureStoreKey.DRIVER_INFO,
        JSON.stringify({ ...drv, status: 'busy' as DriverStatus }),
      )
      router.replace('/(driver)/trip')
    } catch {
      showAlert(t('common.error'), t('error.serverError'))
    }
  }

  // ── Tắt sẵn sàng ────────────────────────────────────────────────────────────
  async function handleGoOffline() {
    const drv = driverInfoRef.current
    if (!drv) return
    try {
      await updateDriverStatus(drv.uid, 'offline')
      await SecureStore.setItemAsync(
        SecureStoreKey.DRIVER_INFO,
        JSON.stringify({ ...drv, status: 'offline' as DriverStatus }),
      )
      router.replace('/(driver)/home')
    } catch {
      showAlert(t('common.error'), t('error.serverError'))
    }
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
      return (
        <View style={styles.card}>
          <ActivityIndicator color={BRAND} size="small" />
        </View>
      )
    }
    const { info } = item
    const vehicleLabel: Record<string, string> = {
      motorbike: t('vehicle.motorbike'), car4: t('vehicle.car4'), car7: t('vehicle.car7'),
      pickup: t('vehicle.pickup'), truck: t('vehicle.truck'),
    }
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardIconWrap}>
            <Ionicons name="navigate-outline" size={18} color={BRAND} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>
              {vehicleLabel[info.vehicleType] ?? info.vehicleType}
              {'  '}
              <Text style={styles.cardKm}>{info.estimatedKm?.toFixed(1) ?? '?'} km</Text>
            </Text>
            <Text style={styles.cardSub}>{t('online.customer')}: {maskPhone(info.customerPhone)}</Text>
          </View>
          {item.cardState === 'idle' && (
            <TouchableOpacity
              style={styles.quoteBtn}
              onPress={() => setTrips(prev => prev.map(t =>
                t.tripId === item.tripId ? { ...t, cardState: 'expanded' } : t,
              ))}
            >
              <Text style={styles.quoteBtnText}>{t('online.quote')}</Text>
            </TouchableOpacity>
          )}
          {item.cardState === 'quoted' && (
            <View style={styles.quotedBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#15803D" />
              <Text style={styles.quotedBadgeText}>{t('online.quoteSent')}</Text>
            </View>
          )}
        </View>

        {item.cardState === 'expanded' && (
          <View style={styles.expandedArea}>
            <TextInput
              style={styles.priceInput}
              placeholder={t('online.pricePlaceholder')}
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              value={item.priceInput}
              onChangeText={v => setTrips(prev => prev.map(t =>
                t.tripId === item.tripId ? { ...t, priceInput: v } : t,
              ))}
            />
            <View style={styles.expandedBtns}>
              <TouchableOpacity
                style={styles.sendBtn}
                onPress={() => handleManualQuote(item.tripId, item.priceInput)}
              >
                <Text style={styles.sendBtnText}>{t('online.sendQuote')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setTrips(prev => prev.map(t =>
                  t.tripId === item.tripId ? { ...t, cardState: 'idle' } : t,
                ))}
              >
                <Text style={styles.closeBtnText}>{t('online.close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {item.cardState === 'quoted' && (
          <View style={styles.quotedRow}>
            <Text style={styles.quotedText}>
              {parseInt(item.priceInput || '0').toLocaleString('vi-VN')}đ
              {item.autoQuoted ? `  ${t('online.autoTag')}` : ''}
            </Text>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => handleCancelQuote(item.tripId)}
            >
              <Text style={styles.cancelBtnText}>{t('online.cancelQuote')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    )
  }

  // ── UI ───────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar translucent barStyle="dark-content" backgroundColor="transparent" />

      {/* Bản đồ full màn hình */}
      <View style={StyleSheet.absoluteFill}>
        <MapView ref={mapRef} lat={mapLat} lng={mapLng} />
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
              <Ionicons name="wallet-outline" size={18} color={BRAND} />
              <Text style={styles.balanceText}>{odcBalance % 1 === 0 ? odcBalance : odcBalance.toFixed(2)} ODC</Text>
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

      {/* Bottom sheet – danh sách chuyến */}
      <Animated.View
        style={[
          styles.sheet,
          { transform: [{ translateY: sheetAnim }] },
        ]}
      >
        {/* Handle + header */}
        <TouchableOpacity
          style={styles.sheetHandle}
          onPress={toggleSheet}
          activeOpacity={0.8}
        >
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

            {/* Toggle trời mưa */}
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
        </TouchableOpacity>

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
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
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
    marginTop: 8,
    backgroundColor: '#ffffffee',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BRAND_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND,
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
  },
  driverName: {
    fontSize: 14,
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
    gap: 2,
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
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
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
    gap: 8,
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

  // ── Card chuyến ──
  card: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: BRAND_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  cardKm: {
    fontWeight: '500',
    color: '#64748B',
    fontSize: 13,
  },
  cardSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  quoteBtn: {
    backgroundColor: BRAND,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  quoteBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  quotedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  quotedBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  expandedArea: {
    marginTop: 12,
    gap: 8,
  },
  priceInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
    color: '#0F172A',
  },
  expandedBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  sendBtn: {
    flex: 1,
    backgroundColor: BRAND,
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  sendBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  closeBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 18,
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#64748B',
    fontWeight: '600',
  },
  quotedRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  quotedText: {
    flex: 1,
    fontSize: 13,
    color: '#15803D',
    fontWeight: '600',
  },
  cancelBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cancelBtnText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 13,
  },
})
