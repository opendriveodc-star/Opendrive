// app/(customer)/tracking.tsx

import React, { useEffect, useState, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated, PanResponder, Linking } from 'react-native'
import { showAlert } from '../../src/components/GlobalAlert'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import MapView, { type MapViewHandle } from '../../src/components/MapView'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import * as Notifications from 'expo-notifications'
import { TRIP } from '../../src/constants'
import { rtdb } from '../../src/services/firebase'
import { notifyCancel, sosAlert } from '../../src/services/cloudflare'
import { getCurrentLocation, distanceKm } from '../../src/services/location'
import { encodeSosMemo } from '../../src/services/odc'
import SosButton from '../../src/components/SosButton'
import { SecureStoreKey } from '../../src/types'
import type { CustomerInfo, TripRealtimeInfo } from '../../src/types'

const RETRY_TRIP_KEY = 'retry_trip_data'

const BRAND         = '#1A2E5E'
const SOS_SECTION_H = 220

type TripStatus = 'going_to_pickup' | 'picked_up' | 'completed'

const STATUS_CONFIG: Record<TripStatus, { label: string; icon: string }> = {
  going_to_pickup: { label: 'trip.driverComing', icon: 'navigate-outline'         },
  picked_up:       { label: 'trip.inProgress',   icon: 'car-outline'              },
  completed:       { label: 'trip.completed',     icon: 'checkmark-circle-outline' },
}

export default function TrackingScreen() {
  const { t }      = useTranslation()
  const insets     = useSafeAreaInsets()
  const { tripId, driverName, vehicleBrand, vehicleColor, licensePlate, transportModel,
          senderName, senderPhone, recipientName, recipientPhone } = useLocalSearchParams<{
    tripId: string; driverName: string; vehicleBrand: string; vehicleColor: string; licensePlate: string
    transportModel: string; senderName: string; senderPhone: string; recipientName: string; recipientPhone: string
  }>()

  // Khởi tạo ngay từ params — không cần chờ poll trip_info
  const initDriverInfo = driverName
    ? { name: driverName, licensePlate: licensePlate ?? '', vehicleBrand: vehicleBrand ?? '', vehicleColor: vehicleColor ?? '' }
    : null

  const [driverLat,  setDriverLat]  = useState<number>(10.7769)
  const [driverLng,  setDriverLng]  = useState<number>(106.7009)
  const [tripStatus, setTripStatus] = useState<TripStatus>('going_to_pickup')
  const [driverInfo, setDriverInfo] = useState(initDriverInfo)
  const [sosSent,      setSosSent]      = useState(false)
  const [driverPhone,  setDriverPhone]  = useState<string>('')

  const driverPhoneRef   = useRef<string>('')
  const customerPhoneRef = useRef<string>('')

  const mapRef             = useRef<MapViewHandle>(null)
  const completedRef       = useRef(false)
  const pickupLatRef       = useRef<number | null>(null)
  const pickupLngRef       = useRef<number | null>(null)
  const tripInfoRef        = useRef<TripRealtimeInfo | null>(null)
  const driverInfoRef      = useRef(initDriverInfo)
  const driverArrivedRef   = useRef(false)
  const arrivedNotifIdRef  = useRef<string | null>(null)
  const driverFcmTokenRef  = useRef<string>('')
  const cancelledHandledRef = useRef(false)
  const panelHRef           = useRef(0)
  const bottomPadRef        = useRef(0)
  const driverLatRef        = useRef(10.7769)
  const driverLngRef        = useRef(106.7009)

  const panelAnim       = useRef(new Animated.Value(SOS_SECTION_H)).current
  const panelLevelRef   = useRef(0)
  const panStartValRef  = useRef(SOS_SECTION_H)
  const panResponder    = useRef(PanResponder.create({
    onStartShouldSetPanResponder: ()       => true,
    onMoveShouldSetPanResponder:  (_, gs)  => Math.abs(gs.dy) > 4,
    onPanResponderGrant: () => {
      panStartValRef.current = panelLevelRef.current === 1 ? 0 : SOS_SECTION_H
    },
    onPanResponderMove: (_, gs) => {
      panelAnim.setValue(Math.max(0, Math.min(SOS_SECTION_H, panStartValRef.current + gs.dy)))
    },
    onPanResponderRelease: (_, gs) => {
      const expand = panelLevelRef.current === 1 ? gs.dy <= 30 : gs.dy <= -30
      panelLevelRef.current = expand ? 1 : 0
      Animated.spring(panelAnim, { toValue: expand ? 0 : SOS_SECTION_H, useNativeDriver: true, bounciness: 4 }).start(() => {
        bottomPadRef.current = expand ? panelHRef.current : panelHRef.current - SOS_SECTION_H
        mapRef.current?.panTo(driverLatRef.current, driverLngRef.current, 0, bottomPadRef.current)
      })
    },
  })).current

  const locationPollRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const statusPollRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const infoPollRef        = useRef<ReturnType<typeof setInterval> | null>(null)
  const arrivedPollRef     = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load trip info để lấy tọa độ điểm đón
  useEffect(() => {
    if (!tripId) return
    rtdb.get<TripRealtimeInfo>(`trips/${tripId}/info`).then(info => {
      if (!info) return
      tripInfoRef.current = info
      if (info.pickupLat) pickupLatRef.current = info.pickupLat
      if (info.pickupLng) pickupLngRef.current = info.pickupLng
    }).catch(() => {})

    // Load customerPhone từ SecureStore
    SecureStore.getItemAsync(SecureStoreKey.CUSTOMER_INFO).then(raw => {
      if (!raw) return
      try { customerPhoneRef.current = (JSON.parse(raw) as CustomerInfo).phone } catch {}
    }).catch(() => {})
  }, [tripId])

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
          mapRef.current?.panTo(loc.lat, loc.lng, 0, bottomPadRef.current)
        }
      } catch {}
    }, 3000)

    statusPollRef.current = setInterval(async () => {
      try {
        // Backup: phát hiện tài xế hủy nếu FCM không đến
        const driverCancelled = await rtdb.get<boolean>(`trips/${tripId}/cancelled_by_driver`)
        if (driverCancelled === true && !cancelledHandledRef.current) {
          clearAllPolls()
          handleDriverCancelledAlert()
          return
        }
        const status = await rtdb.get<string>(`trips/${tripId}/trip_status`)
        if (status === 'picked_up') {
          setTripStatus('picked_up')
          driverArrivedRef.current = true  // đảm bảo set dù arrivedPollRef chưa kịp fire
          // Dừng tất cả poll — khách tự bấm hủy nếu cần, proximity trigger lo rating
          if (locationPollRef.current) { clearInterval(locationPollRef.current); locationPollRef.current = null }
          if (statusPollRef.current)   { clearInterval(statusPollRef.current);   statusPollRef.current   = null }
          if (arrivedPollRef.current)  { clearInterval(arrivedPollRef.current);  arrivedPollRef.current  = null }
        }
      } catch {}
    }, 3000)

    const tryGetTripInfo = async () => {
      try {
        const info = await rtdb.get<{ driverPhone?: string; driverFcmToken?: string }>(`trips/${tripId}/trip_info`)
        if (info?.driverPhone) {
          setDriverPhone(info.driverPhone)
          driverPhoneRef.current = info.driverPhone
        }
        if (info?.driverFcmToken) driverFcmTokenRef.current = info.driverFcmToken
        // Dừng poll khi có đủ cả hai — driver ghi trip_info 1 lần nguyên khối
        if (info?.driverPhone && info?.driverFcmToken && infoPollRef.current) {
          clearInterval(infoPollRef.current)
          infoPollRef.current = null
        }
      } catch {}
    }
    tryGetTripInfo()
    infoPollRef.current = setInterval(tryGetTripInfo, 3000)

    // Poll phát hiện tài xế đã đến điểm đón
    arrivedPollRef.current = setInterval(async () => {
      if (driverArrivedRef.current) return
      try {
        const arrived = await rtdb.get<boolean>(`trips/${tripId}/driver_at_pickup`)
        if (arrived === true) {
          driverArrivedRef.current = true
          if (arrivedPollRef.current) { clearInterval(arrivedPollRef.current); arrivedPollRef.current = null }
          Notifications.scheduleNotificationAsync({
            content: {
              title: '🚗 Tài xế đã đến điểm đón',
              body: 'Hãy ra xe ngay nhé!',
              data: {},
            },
            trigger: null,
          }).then(id => { arrivedNotifIdRef.current = id }).catch(() => {})
        }
      } catch {}
    }, 3000)

    return () => clearAllPolls()
  }, [tripId])

  // FCM foreground listener: nhận thông báo tài xế hủy ngay lập tức
  useEffect(() => {
    if (!tripId) return
    const sub = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data as Record<string, string>
      if (data?.type !== 'trip_cancelled' || data?.reason !== 'driver') return
      handleDriverCancelledAlert(data?.cancellerName)
    })
    return () => sub.remove()
  }, [tripId])

  function clearAllPolls() {
    if (locationPollRef.current)  { clearInterval(locationPollRef.current);  locationPollRef.current  = null }
    if (statusPollRef.current)    { clearInterval(statusPollRef.current);    statusPollRef.current    = null }
    if (infoPollRef.current)      { clearInterval(infoPollRef.current);      infoPollRef.current      = null }
    if (arrivedPollRef.current)   { clearInterval(arrivedPollRef.current);   arrivedPollRef.current   = null }
  }

  function dismissArrivedNotif() {
    if (arrivedNotifIdRef.current) {
      Notifications.dismissNotificationAsync(arrivedNotifIdRef.current).catch(() => {})
      arrivedNotifIdRef.current = null
    }
  }

  function handleDriverCancelledAlert(cancellerName?: string) {
    if (cancelledHandledRef.current) return
    cancelledHandledRef.current = true
    completedRef.current = true
    clearAllPolls()
    dismissArrivedNotif()
    const title = cancellerName
      ? t('cancel.driverCancelledBy', { name: cancellerName })
      : t('cancel.driverCancelled')
    showAlert(title, undefined, [{
      text: 'OK',
      onPress: async () => {
        const info = tripInfoRef.current
        if (info) {
          await AsyncStorage.setItem(RETRY_TRIP_KEY, JSON.stringify({
            vehicleType:    info.vehicleType,
            transportModel: transportModel ?? 'passenger',
            pickupLat:      info.pickupLat,
            pickupLng:      info.pickupLng,
            pickupAddress:  info.pickupAddress ?? '',
            dropLat:        info.dropLat,
            dropLng:        info.dropLng,
            destAddress:    info.destAddress ?? '',
            note:           info.note ?? '',
            estimatedKm:    info.estimatedKm,
            senderName:     senderName ?? '',
            senderPhone:    senderPhone ?? '',
            recipientName:  recipientName ?? '',
            recipientPhone: recipientPhone ?? '',
          })).catch(() => {})
        }
        if (tripId) rtdb.delete(`trips/${tripId}`).catch(() => {})
        router.replace('/(customer)/home')
      },
    }])
  }

  function navigateToRating() {
    if (completedRef.current) return
    completedRef.current = true
    clearAllPolls()
    dismissArrivedNotif()
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

  // Khi đã lên xe, kiểm tra vị trí khách mỗi 5s – hiện bảng đánh giá khi còn ≤150m đến điểm đến
  useEffect(() => {
    if (tripStatus !== 'picked_up') return

    const check = setInterval(async () => {
      if (completedRef.current) { clearInterval(check); return }
      // Backup: tài xế hủy sau khi đón khách
      try {
        const driverCancelled = await rtdb.get<boolean>(`trips/${tripId}/cancelled_by_driver`)
        if (driverCancelled === true && !cancelledHandledRef.current) {
          clearInterval(check)
          handleDriverCancelledAlert()
          return
        }
      } catch {}
      const dropLat = tripInfoRef.current?.dropLat
      const dropLng = tripInfoRef.current?.dropLng
      if (!dropLat || !dropLng) return
      try {
        const loc  = await getCurrentLocation()
        const dist = distanceKm(loc.lat, loc.lng, dropLat, dropLng)
        if (dist <= 0.15) {
          clearInterval(check)
          navigateToRating()
        }
      } catch {}
    }, 5000)

    return () => clearInterval(check)
  }, [tripStatus])

  async function handleSOS() {
    if (sosSent) return
    setSosSent(true)

    // Location fail vẫn gửi SOS với toạ độ 0 — còn hơn không ghi blockchain
    let lat = 0, lng = 0
    try {
      const loc = await getCurrentLocation()
      lat = loc.lat
      lng = loc.lng
    } catch {}

    const dPhone = driverPhoneRef.current
    const cPhone = customerPhoneRef.current
    const plate  = driverInfoRef.current?.licensePlate ?? ''
    const memo27bytes = encodeSosMemo(dPhone, cPhone, lat, lng, plate, 'customer')
    sosAlert({ driverPhone: dPhone, customerPhone: cPhone, lat, lng, triggeredBy: 'customer', memo27bytes }).catch(() => {})
  }

  function handleOpenMaps() {
    const info = tripInfoRef.current
    const lat  = tripStatus === 'going_to_pickup' ? pickupLatRef.current      : info?.dropLat ?? null
    const lng  = tripStatus === 'going_to_pickup' ? pickupLngRef.current      : info?.dropLng ?? null
    if (!lat || !lng) return
    const mode = info?.vehicleType === 'motorbike' ? 'l' : 'd'
    Linking.openURL(`google.navigation:q=${lat},${lng}&mode=${mode}`).catch(() => {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`)
    })
  }

  function handleCancel() {
    showAlert(t('cancel.title'), t('cancel.confirm'), [
      { text: t('cancel.no'), style: 'cancel' },
      {
        text: t('cancel.yes'), style: 'destructive',
        onPress: async () => {
          cancelledHandledRef.current = true
          clearAllPolls()
          // Đánh dấu RTDB — tài xế đọc được nếu FCM không đến
          if (tripId) rtdb.set(`trips/${tripId}/cancelled_by_customer`, true).catch(() => {})
          // Notify tài xế qua FCM — fallback fetch token nếu ref rỗng
          if (tripId) {
            let fcmToken = driverFcmTokenRef.current
            if (!fcmToken) {
              try {
                const info = await rtdb.get<{ driverFcmToken?: string }>(`trips/${tripId}/trip_info`)
                fcmToken = info?.driverFcmToken ?? ''
              } catch {}
            }
            if (fcmToken) notifyCancel(tripId, 'customer', fcmToken).catch(() => {})
          }

          // Lưu dữ liệu chuyến để khôi phục ở bước chọn điểm đón
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

          router.replace('/(customer)/home')
        },
      },
    ])
  }

  const statusCfg = STATUS_CONFIG[tripStatus]
  const initials  = driverInfo?.name?.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase() ?? '?'

  return (
    <View style={styles.container}>
      {/* Map full screen */}
      <View style={{ ...StyleSheet.absoluteFillObject }}>
        <MapView
          ref={mapRef}
          lat={driverLat}
          lng={driverLng}
          onMapReady={() => {
            if (bottomPadRef.current > 0)
              mapRef.current?.setBottomPadding(bottomPadRef.current)
          }}
        />
      </View>

      {/* Bottom panel — swipe handle up to reveal SOS section */}
      <Animated.View
        style={[styles.panel, { transform: [{ translateY: panelAnim }], paddingBottom: Math.max(insets.bottom, 16) }]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height
          if (h === panelHRef.current) return
          panelHRef.current = h
          bottomPadRef.current = panelLevelRef.current === 1 ? h : h - SOS_SECTION_H
        }}
      >
        <View {...panResponder.panHandlers} style={styles.handleArea}>
          <View style={styles.handle} />
          <Text style={styles.handleHint}>Trượt lên để thấy nút SOS</Text>
        </View>

        {driverInfo ? (
          <View style={styles.driverRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.driverInfo}>
              <Text style={styles.driverName} numberOfLines={1}>{driverInfo.name}</Text>
              <Text style={styles.driverMeta} numberOfLines={1}>
                {[driverInfo.vehicleBrand, driverInfo.licensePlate].filter(Boolean).join(' - ')}
              </Text>
              {!!driverInfo.vehicleColor && (
                <Text style={styles.driverMeta} numberOfLines={1}>Màu: {driverInfo.vehicleColor}</Text>
              )}
            </View>
            <TouchableOpacity
              style={[styles.callChip, !driverPhone && styles.callChipDisabled]}
              onPress={() => driverPhone && Linking.openURL(`tel:${driverPhone}`)}
              activeOpacity={driverPhone ? 0.75 : 1}
            >
              <Ionicons name="call-outline" size={13} color={driverPhone ? '#fff' : '#94A3B8'} />
              <Text style={[styles.callChipText, !driverPhone && styles.callChipTextDisabled]}>
                {driverPhone ? `***${driverPhone.slice(-3)}` : '···'}
              </Text>
            </TouchableOpacity>
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
          <View style={styles.statusDot} />
          <Ionicons name={statusCfg.icon as any} size={16} color={BRAND} style={{ marginRight: 6 }} />
          <Text style={styles.statusText}>{t(statusCfg.label)}</Text>
        </View>

        {transportModel !== 'freight' && tripStatus !== 'completed' && (
          <TouchableOpacity style={styles.mapsBtn} onPress={handleOpenMaps} activeOpacity={0.8}>
            <Ionicons name="map-outline" size={16} color={BRAND} />
            <Text style={styles.mapsBtnText}>
              {tripStatus === 'going_to_pickup' ? 'Dẫn đường đến điểm đón' : 'Dẫn đường đến điểm đến'}
            </Text>
          </TouchableOpacity>
        )}
        {tripStatus !== 'completed' && (
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.75}>
            <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
            <Text style={styles.cancelText}>{t('cancel.title')}</Text>
          </TouchableOpacity>
        )}

        {/* SOS section — hidden below screen by default, revealed on swipe-up */}
        <View style={styles.sosDivider} />
        <View style={styles.sosSection}>
          <SosButton onTriggered={handleSOS} disabled={sosSent} />
        </View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  panel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 12,
    elevation: 20, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -4 },
  },
  handleArea:  { alignItems: 'center', paddingTop: 10, paddingBottom: 10, marginBottom: 4 },
  handle:      { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0' },
  handleHint:  { fontSize: 11, color: 'rgba(26,46,94,0.45)', fontWeight: '600', marginTop: 5 },
  sosDivider:  { height: 1, backgroundColor: '#E2E8F0', marginHorizontal: -20, marginTop: 8 },
  sosSection:  { alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  driverRow:           { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  callChip:            { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0, backgroundColor: BRAND, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20 },
  callChipDisabled:    { backgroundColor: '#CBD5E1' },
  callChipText:        { fontSize: 12, fontWeight: '600', color: '#fff' },
  callChipTextDisabled:{ color: '#94A3B8' },
  avatar:     { width: 48, height: 48, borderRadius: 24, backgroundColor: BRAND, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  driverInfo: { flex: 1 },
  driverName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  driverMeta: { fontSize: 13, color: '#64748B', marginTop: 2 },
  divider:    { height: 1, backgroundColor: '#F1F5F9', marginBottom: 12 },
  statusRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  statusDot:  { width: 8, height: 8, borderRadius: 4, marginRight: 6, backgroundColor: BRAND },
  statusText: { fontSize: 14, fontWeight: '600', color: BRAND },
  mapsBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: BRAND, borderRadius: 12, paddingVertical: 11, marginBottom: 8 },
  mapsBtnText: { color: BRAND, fontWeight: '600', fontSize: 14 },
  cancelBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#DC2626', borderRadius: 12, paddingVertical: 12, marginBottom: 4 },
  cancelText:  { color: '#DC2626', fontWeight: '600', fontSize: 15 },
})
