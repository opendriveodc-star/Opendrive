// app/(customer)/tracking.tsx

import React, { useEffect, useState, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { showAlert } from '../../src/components/GlobalAlert'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import MapView, { type MapViewHandle } from '../../src/components/MapView'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { TRIP } from '../../src/constants'
import { rtdb } from '../../src/services/firebase'
import { distanceKm, getCurrentLocation } from '../../src/services/location'
import { incrementCustomerPenalty, setCustomerLockedUntil } from '../../src/services/firestore'
import { SecureStoreKey } from '../../src/types'
import type { CustomerInfo, TripRealtimeInfo } from '../../src/types'

const RETRY_TRIP_KEY = 'retry_trip_data'
const LOCK_48H = 48 * 60 * 60 * 1000

const BRAND = '#1A2E5E'

type TripStatus = 'going_to_pickup' | 'picked_up' | 'completed'

const STATUS_CONFIG: Record<TripStatus, { label: string; color: string; icon: string }> = {
  going_to_pickup: { label: 'trip.driverComing',  color: '#F59E0B', icon: 'navigate-outline' },
  picked_up:       { label: 'trip.inProgress',    color: BRAND,     icon: 'car-outline'      },
  completed:       { label: 'trip.completed',      color: '#10B981', icon: 'checkmark-circle-outline' },
}

export default function TrackingScreen() {
  const { t } = useTranslation()
  const { tripId } = useLocalSearchParams<{ tripId: string }>()

  const [driverLat,  setDriverLat]  = useState<number>(10.7769)
  const [driverLng,  setDriverLng]  = useState<number>(106.7009)
  const [tripStatus, setTripStatus] = useState<TripStatus>('going_to_pickup')
  const [driverInfo, setDriverInfo] = useState<{ name: string; licensePlate: string; vehicleBrand: string } | null>(null)
  const [canCancel,  setCanCancel]  = useState(true)

  const startedAtRef    = useRef<number>(Date.now())
  const mapRef          = useRef<MapViewHandle>(null)
  const completedRef    = useRef(false)
  const pickupLatRef    = useRef<number | null>(null)
  const pickupLngRef    = useRef<number | null>(null)
  const initialDistRef  = useRef<number | null>(null)
  const driverLatRef    = useRef<number>(10.7769)
  const driverLngRef    = useRef<number>(106.7009)
  const tripInfoRef     = useRef<TripRealtimeInfo | null>(null)
  const driverInfoRef   = useRef<{ name: string; licensePlate: string; vehicleBrand: string } | null>(null)
  const locationPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const statusPollRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const infoPollRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelPollRef   = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load trip info để lấy tọa độ điểm đón
  useEffect(() => {
    if (!tripId) return
    rtdb.get<TripRealtimeInfo>(`trips/${tripId}/info`).then(info => {
      if (!info) return
      tripInfoRef.current = info
      if (info.pickupLat) pickupLatRef.current = info.pickupLat
      if (info.pickupLng) pickupLngRef.current = info.pickupLng
    }).catch(() => {})
  }, [tripId])

  // Grace period
  useEffect(() => {
    const check = setInterval(() => {
      if (Date.now() - startedAtRef.current > TRIP.GRACE_PERIOD_MINUTES * 60 * 1000) {
        setCanCancel(false)
        clearInterval(check)
      }
    }, 5000)
    return () => clearInterval(check)
  }, [])

  // RTDB polling: vị trí + status + trip_info
  useEffect(() => {
    if (!tripId) return

    locationPollRef.current = setInterval(async () => {
      try {
        const loc = await rtdb.get<{ lat: number; lng: number }>(`trips/${tripId}/location`)
        if (loc?.lat != null) {
          setDriverLat(loc.lat)
          setDriverLng(loc.lng)
          driverLatRef.current = loc.lat
          driverLngRef.current = loc.lng
          mapRef.current?.updateDriverMarker(loc.lat, loc.lng)
          mapRef.current?.panTo(loc.lat, loc.lng)
          if (initialDistRef.current === null && pickupLatRef.current && pickupLngRef.current) {
            initialDistRef.current = distanceKm(loc.lat, loc.lng, pickupLatRef.current, pickupLngRef.current)
          }
        }
      } catch {}
    }, 3000)

    statusPollRef.current = setInterval(async () => {
      try {
        const status = await rtdb.get<string>(`trips/${tripId}/trip_status`)
        if (status === 'picked_up') setTripStatus('picked_up')
        if (status === 'completed' && !completedRef.current) navigateToRating()
      } catch {}
    }, 3000)

    cancelPollRef.current = setInterval(async () => {
      if (completedRef.current) return
      try {
        const cancelled = await rtdb.get<string>(`trips/${tripId}/cancelled`)
        if (cancelled === 'driver') {
          completedRef.current = true
          clearAllPolls()
          showAlert(t('cancel.driverCancelled'), undefined, [{
            text: 'OK',
            onPress: async () => {
              const info = tripInfoRef.current
              if (info) {
                await AsyncStorage.setItem(RETRY_TRIP_KEY, JSON.stringify({
                  vehicleType:   info.vehicleType,
                  pickupLat:     info.pickupLat,
                  pickupLng:     info.pickupLng,
                  pickupAddress: info.pickupAddress ?? '',
                  dropLat:       info.dropLat,
                  dropLng:       info.dropLng,
                  destAddress:   info.destAddress ?? '',
                  note:          info.note ?? '',
                  estimatedKm:   info.estimatedKm,
                })).catch(() => {})
              }
              rtdb.delete(`trips/${tripId}`).catch(() => {})
              router.replace('/(customer)/home')
            },
          }])
        }
      } catch {}
    }, 3000)

    const tryGetTripInfo = async () => {
      try {
        const info = await rtdb.get<{ driverName: string; licensePlate: string; vehicleBrand: string }>(`trips/${tripId}/trip_info`)
        if (info?.driverName) {
          const di = { name: info.driverName, licensePlate: info.licensePlate, vehicleBrand: info.vehicleBrand }
          setDriverInfo(di)
          driverInfoRef.current = di
          if (infoPollRef.current) { clearInterval(infoPollRef.current); infoPollRef.current = null }
        }
      } catch {}
    }
    tryGetTripInfo()
    infoPollRef.current = setInterval(tryGetTripInfo, 5000)

    return () => clearAllPolls()
  }, [tripId])

  function clearAllPolls() {
    if (locationPollRef.current) { clearInterval(locationPollRef.current); locationPollRef.current = null }
    if (statusPollRef.current)   { clearInterval(statusPollRef.current);   statusPollRef.current   = null }
    if (infoPollRef.current)     { clearInterval(infoPollRef.current);     infoPollRef.current     = null }
    if (cancelPollRef.current)   { clearInterval(cancelPollRef.current);   cancelPollRef.current   = null }
  }

  function navigateToRating() {
    if (completedRef.current) return
    completedRef.current = true
    clearAllPolls()
    router.replace({
      pathname: '/(customer)/rating',
      params: {
        tripId,
        pickupAddress: tripInfoRef.current?.pickupAddress ?? '',
        destAddress:   tripInfoRef.current?.destAddress ?? '',
        estimatedKm:   String(tripInfoRef.current?.estimatedKm ?? 0),
        vehicleType:   tripInfoRef.current?.vehicleType ?? '',
        driverName:    driverInfoRef.current?.name ?? '',
        vehicleBrand:  driverInfoRef.current?.vehicleBrand ?? '',
        licensePlate:  driverInfoRef.current?.licensePlate ?? '',
      },
    })
  }

  // Khi đã lên xe, kiểm tra vị trí khách mỗi 5s – hiện bảng đánh giá khi còn ≤100m đến điểm đến
  useEffect(() => {
    if (tripStatus !== 'picked_up') return

    const check = setInterval(async () => {
      if (completedRef.current) { clearInterval(check); return }
      const dropLat = tripInfoRef.current?.dropLat
      const dropLng = tripInfoRef.current?.dropLng
      if (!dropLat || !dropLng) return
      try {
        const loc  = await getCurrentLocation()
        const dist = distanceKm(loc.lat, loc.lng, dropLat, dropLng)
        if (dist <= 0.1) {
          clearInterval(check)
          navigateToRating()
        }
      } catch {}
    }, 5000)

    return () => clearInterval(check)
  }, [tripStatus])

  function handleCancel() {
    showAlert(t('cancel.title'), t('cancel.confirm'), [
      { text: t('cancel.no'), style: 'cancel' },
      {
        text: t('cancel.yes'), style: 'destructive',
        onPress: async () => {
          clearRtdbPolls()
          bridgeRef.current?.stop()
          if (tripId) await rtdb.set(`trips/${tripId}/cancelled`, 'customer').catch(() => {})

          // Tính penalty
          const penaltyAmount = _calcCancelPenalty()
          if (penaltyAmount > 0) await _applyCustomerPenalty(penaltyAmount)

          router.replace('/(customer)/home')
        },
      },
    ])
  }

  function _calcCancelPenalty(): number {
    if (tripStatus === 'picked_up') return 0  // đã lên xe, không thể hủy
    if (!pickupLatRef.current || !pickupLngRef.current) return 0
    // Tài xế đã ở điểm đón (trong vòng 300m) → phạt 2
    const currentDist = distanceKm(driverLatRef.current, driverLngRef.current, pickupLatRef.current, pickupLngRef.current)
    if (currentDist <= 0.3) return 2
    // Tài xế đã đi >50% quãng đường đến đón → phạt 1
    const init = initialDistRef.current
    if (init && init > 0 && (init - currentDist) / init > 0.5) return 1
    return 0
  }

  async function _applyCustomerPenalty(amount: number) {
    try {
      const raw = await SecureStore.getItemAsync(SecureStoreKey.CUSTOMER_INFO)
      if (!raw) return
      const info: CustomerInfo = JSON.parse(raw)
      const newCount = await incrementCustomerPenalty(info.phone, amount)
      const updated = { ...info, cancelCount: newCount }
      await SecureStore.setItemAsync(SecureStoreKey.CUSTOMER_INFO, JSON.stringify(updated))
      if (newCount >= 3) {
        const lockUntil = Date.now() + LOCK_48H
        await SecureStore.setItemAsync(SecureStoreKey.CUSTOMER_LOCK_UNTIL, String(lockUntil))
        setCustomerLockedUntil(info.phone, lockUntil).catch(() => {})
        showAlert(
          t('lock.title'),
          t('lock.reason.frequentCancel'),
          [{ text: 'OK', onPress: () => router.replace({ pathname: '/lock-screen', params: { lockedUntil: String(lockUntil), reason: t('lock.reason.frequentCancel') } }) }],
        )
      }
    } catch {}
  }

  const statusCfg = STATUS_CONFIG[tripStatus]
  const initials  = driverInfo?.name?.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase() ?? '?'

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        <MapView ref={mapRef} lat={driverLat} lng={driverLng} />
      </View>

      <SafeAreaView style={styles.panel} edges={['bottom']}>
        <View style={styles.handle} />

        {driverInfo ? (
          <View style={styles.driverRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.driverInfo}>
              <Text style={styles.driverName} numberOfLines={1}>{driverInfo.name}</Text>
              <Text style={styles.driverMeta}>{driverInfo.vehicleBrand} · {driverInfo.licensePlate}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.driverRow}>
            <View style={[styles.avatar, { backgroundColor: '#E2E8F0' }]}>
              <Ionicons name="person-outline" size={22} color="#94A3B8" />
            </View>
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>{t('trip.connecting')}</Text>
            </View>
          </View>
        )}

        <View style={styles.divider} />

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusCfg.color }]} />
          <Ionicons name={statusCfg.icon as any} size={16} color={statusCfg.color} style={{ marginRight: 6 }} />
          <Text style={[styles.statusText, { color: statusCfg.color }]}>{t(statusCfg.label)}</Text>
        </View>

        {canCancel && tripStatus === 'going_to_pickup' && (
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.75}>
            <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
            <Text style={styles.cancelText}>{t('cancel.title')}</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#fff' },
  mapContainer: { flex: 1 },
  panel: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
    elevation: 12, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -4 },
  },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginBottom: 16 },
  driverRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  avatar:     { width: 48, height: 48, borderRadius: 24, backgroundColor: BRAND, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  driverInfo: { flex: 1 },
  driverName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  driverMeta: { fontSize: 13, color: '#64748B', marginTop: 2 },
  divider:    { height: 1, backgroundColor: '#F1F5F9', marginBottom: 12 },
  statusRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  statusDot:  { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 14, fontWeight: '600' },
  cancelBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#DC2626', borderRadius: 12, paddingVertical: 12, marginBottom: 4 },
  cancelText: { color: '#DC2626', fontWeight: '600', fontSize: 15 },
})
