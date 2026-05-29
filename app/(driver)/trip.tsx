// app/(driver)/trip.tsx

import React, { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Linking, Animated, PanResponder,
  ActivityIndicator, StatusBar, ScrollView, Dimensions,
} from 'react-native'
import { showAlert } from '../../src/components/GlobalAlert'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import * as Notifications from 'expo-notifications'
import MapView from '../../src/components/MapView'
import type { MapViewHandle } from '../../src/components/MapView'
import { getPendingTrip, getDriverInfo, getEncryptedKey, clearPendingTrip, saveDriverInfo, savePenaltyTrip } from '../../src/utils/storage'
import { recordTrip, notifyCancel, sosAlert } from '../../src/services/cloudflare'
import { updateDriverStatus, setDriverPendingTrip, incrementCustomerPenalty, setCustomerLockedUntil } from '../../src/services/firestore'
import { encodeMemo, encodeSosMemo } from '../../src/services/odc'
import SosButton from '../../src/components/SosButton'
import { rtdb } from '../../src/services/firebase'
import { distanceKm } from '../../src/services/location'
import { LOCATION } from '../../src/constants'
import type {
  PendingTrip, DriverInfo, RatingValue, TripRealtimeInfo, FreightInfo,
} from '../../src/types'

const SCREEN_W = Dimensions.get('window').width
const SCREEN_H = Dimensions.get('window').height
const INFO_PAGE_W = SCREEN_W - 40  // panel paddingHorizontal 20 each side

const BRAND          = '#1A2E5E'
const BRAND_LIGHT    = '#E8EDF6'
const SOS_SECTION_H  = 220
const PANEL_H        = Math.round(SCREEN_H * 0.82)

export default function TripScreen() {
  const { t }    = useTranslation()
  const insets   = useSafeAreaInsets()
  const mapRef   = useRef<MapViewHandle>(null)

  const [pendingTrip,      setPendingTrip]      = useState<PendingTrip | null>(null)
  const [driverInfo,       setDriverInfo]       = useState<DriverInfo | null>(null)
  const [mapInit,          setMapInit]          = useState<{ lat: number; lng: number } | null>(null)
  const [pickedUp,         setPickedUp]         = useState(false)
  const [waitingForRating, setWaitingForRating] = useState(false)
  const [submitting,       setSubmitting]       = useState(false)
  const [pickupAddress,    setPickupAddress]    = useState('')
  const [destAddress,      setDestAddress]      = useState('')
  const [tripNote,         setTripNote]         = useState('')
  const [dropLat,          setDropLat]          = useState<number | null>(null)
  const [dropLng,          setDropLng]          = useState<number | null>(null)
  const [nearPickup,       setNearPickup]       = useState(false)
  const [distToPickup,     setDistToPickup]     = useState<number | null>(null)
  const [nearDropoff,      setNearDropoff]      = useState(false)
  const [distToDropoff,    setDistToDropoff]    = useState<number | null>(null)
  const [sosSent,          setSosSent]          = useState(false)
  const [abandoning,       setAbandoning]       = useState(false)
  const [freightInfo,      setFreightInfo]      = useState<FreightInfo | null>(null)
  const intervalRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const pickedUpRef      = useRef(false)
  const pendingTripRef      = useRef<PendingTrip | null>(null)
  const driverInfoRef       = useRef<DriverInfo | null>(null)
  const mapInitRef          = useRef<{ lat: number; lng: number } | null>(null)
  const proximityRef        = useRef<ReturnType<typeof setInterval> | null>(null)
  const pickupProximityRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const dropLatRef          = useRef<number | null>(null)
  const dropLngRef          = useRef<number | null>(null)
  const customerFcmTokenRef = useRef<string>('')
  const cancelledHandledRef = useRef(false)
  const abandoningRef       = useRef(false)

  const panelAnim        = useRef(new Animated.Value(SOS_SECTION_H)).current
  const panelLevelRef    = useRef(0)
  const panStartValRef   = useRef(SOS_SECTION_H)
  const bottomPadRef     = useRef(PANEL_H - SOS_SECTION_H)
  const panResponder     = useRef(PanResponder.create({
    onStartShouldSetPanResponder: ()        => true,
    onMoveShouldSetPanResponder:  (_, gs)   => Math.abs(gs.dy) > 4,
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
        const pad = expand ? PANEL_H : PANEL_H - SOS_SECTION_H
        bottomPadRef.current = pad
        mapRef.current?.setBottomPadding(pad)
      })
    },
  })).current

  useEffect(() => {
    async function load() {
      const [trip, drv] = await Promise.all([getPendingTrip(), getDriverInfo()])
      setPendingTrip(trip)
      pendingTripRef.current = trip
      setDriverInfo(drv)
      driverInfoRef.current = drv

      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        const pos2d = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setMapInit(pos2d)
        mapInitRef.current = pos2d
      } catch {}

      if (trip) {
        try {
          const info = await rtdb.get<TripRealtimeInfo>(`trips/${trip.tripId}/info`)
          if (info?.pickupAddress)    setPickupAddress(info.pickupAddress)
          if (info?.destAddress)      setDestAddress(info.destAddress)
          if (info?.note)             setTripNote(info.note)
          if (info?.dropLat)          { setDropLat(info.dropLat);  dropLatRef.current = info.dropLat }
          if (info?.dropLng)          { setDropLng(info.dropLng);  dropLngRef.current = info.dropLng }
          if (info?.customerFcmToken) customerFcmTokenRef.current = info.customerFcmToken as string
        } catch {}

        try {
          const fi = await rtdb.get<FreightInfo>(`trips/${trip.tripId}/freight_info`)
          if (fi) setFreightInfo(fi)
        } catch {}

        // Kiểm tra khoảng cách đến điểm đón mỗi 5s
        if (trip.pickupLat && trip.pickupLng) {
          pickupProximityRef.current = setInterval(async () => {
            if (pickedUpRef.current) {
              if (pickupProximityRef.current) { clearInterval(pickupProximityRef.current); pickupProximityRef.current = null }
              return
            }
            try {
              const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
              const dist = distanceKm(loc.coords.latitude, loc.coords.longitude, trip.pickupLat!, trip.pickupLng!)
              setDistToPickup(dist)
              if (dist <= 0.15) {
                setNearPickup(true)
                if (pickupProximityRef.current) { clearInterval(pickupProximityRef.current); pickupProximityRef.current = null }
              }
            } catch {}
          }, 15000)
        } else {
          setNearPickup(true) // Không có tọa độ → cho phép bấm luôn
        }
      }
    }
    load()
    return () => {
      if (pickupProximityRef.current) clearInterval(pickupProximityRef.current)
    }
  }, [])

  function handleCustomerCancelledAlert() {
    if (cancelledHandledRef.current) return
    cancelledHandledRef.current = true
    if (intervalRef.current)        { clearInterval(intervalRef.current);        intervalRef.current        = null }
    if (proximityRef.current)       { clearInterval(proximityRef.current);       proximityRef.current       = null }
    if (pickupProximityRef.current) { clearInterval(pickupProximityRef.current); pickupProximityRef.current = null }

    // Tài xế ghi penalty thay khách — tránh khách tắt mạng để lách phạt
    const customerPhone = pendingTripRef.current?.customerPhone
    if (customerPhone) {
      const amount = pickedUpRef.current ? 2 : 1
      incrementCustomerPenalty(customerPhone, amount)
        .then(newCount => {
          if (newCount >= 3) {
            setCustomerLockedUntil(customerPhone, Date.now() + 48 * 60 * 60 * 1000).catch(() => {})
          }
        })
        .catch(() => {})
    }

    showAlert(t('cancel.customerCancelled'), undefined, [{
      text: 'OK',
      onPress: async () => {
        await clearPendingTrip()
        if (driverInfoRef.current) {
          setDriverPendingTrip(driverInfoRef.current.uid, false).catch(() => {})
          updateDriverStatus(driverInfoRef.current.uid, 'ready').catch(() => {})
        }
        if (pendingTripRef.current) await rtdb.delete(`trips/${pendingTripRef.current.tripId}`).catch(() => {})
        router.replace('/(driver)/online')
      },
    }])
  }

  // FCM foreground listener: tài xế nhận thông báo khách hủy ngay lập tức
  useEffect(() => {
    if (!pendingTrip) return
    const sub = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data as Record<string, string>
      if (data?.type !== 'trip_cancelled' || data?.reason !== 'customer') return
      handleCustomerCancelledAlert()
    })
    return () => sub.remove()
  }, [pendingTrip])

  // Ghi trip_info lên RTDB 1 lần
  useEffect(() => {
    if (!pendingTrip || !driverInfo) return
    const write = async () => {
      const fcmToken = driverInfo.fcmToken ?? ''
      rtdb.set(`trips/${pendingTrip.tripId}/trip_info`, {
        driverName:     driverInfo.name,
        driverPhone:    driverInfo.phone,
        vehicleBrand:   driverInfo.vehicleBrand,
        vehicleColor:   driverInfo.vehicleColor ?? '',
        licensePlate:   driverInfo.licensePlate,
        driverFcmToken: fcmToken,
      }).catch(() => {})
    }
    write()
  }, [pendingTrip, driverInfo])

  // Bắt đầu gửi vị trí qua RTDB ngay khi vào màn hình
  useEffect(() => {
    if (!pendingTrip) return
    const tripId = pendingTrip.tripId

    intervalRef.current = setInterval(async () => {
      if (pickedUpRef.current) return
      try {
        // Cập nhật map ngay bằng last known (instant) — không chờ GPS
        const last = await Location.getLastKnownPositionAsync()
        if (last) {
          mapRef.current?.updateDriverMarker(last.coords.latitude, last.coords.longitude)
          mapRef.current?.panTo(last.coords.latitude, last.coords.longitude, 0, bottomPadRef.current)
        }
        // Lấy GPS chính xác để gửi RTDB + cập nhật lại marker
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        const lat = loc.coords.latitude
        const lng = loc.coords.longitude
        mapRef.current?.updateDriverMarker(lat, lng)
        mapRef.current?.panTo(lat, lng, 0, bottomPadRef.current)
        await rtdb.set(`trips/${tripId}/location`, { lat, lng, timestamp: Date.now() })
      } catch {}
    }, LOCATION.RTDB_INTERVAL_MS)

    return () => {
      if (intervalRef.current)        clearInterval(intervalRef.current)
      if (proximityRef.current)       clearInterval(proximityRef.current)
      if (pickupProximityRef.current) clearInterval(pickupProximityRef.current)
    }
  }, [pendingTrip])

  async function handleSOS() {
    if (sosSent || !driverInfoRef.current || !pendingTripRef.current) return
    setSosSent(true)

    // Location fail vẫn gửi SOS với toạ độ 0 — còn hơn không ghi blockchain
    let lat = 0, lng = 0
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      lat = loc.coords.latitude
      lng = loc.coords.longitude
    } catch {}

    const drv  = driverInfoRef.current
    const trip = pendingTripRef.current
    const memo27bytes = encodeSosMemo(drv.phone, trip.customerPhone, lat, lng, drv.licensePlate ?? '', 'driver')
    sosAlert({ driverPhone: drv.phone, customerPhone: trip.customerPhone, lat, lng, triggeredBy: 'driver', memo27bytes }).catch(() => {})
  }

  function handleAbandon() {
    if (abandoningRef.current) return
    showAlert(t('trip.abandonTrip'), t('trip.abandonConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('trip.abandonTrip'), style: 'destructive', onPress: doAbandon },
    ])
  }

  async function doAbandon() {
    if (abandoningRef.current) return
    abandoningRef.current = true

    const trip = pendingTripRef.current
    const drv  = driverInfoRef.current

    setAbandoning(true)

    if (intervalRef.current)        { clearInterval(intervalRef.current);        intervalRef.current = null }
    if (pickupProximityRef.current) { clearInterval(pickupProximityRef.current); pickupProximityRef.current = null }
    if (proximityRef.current)       { clearInterval(proximityRef.current);       proximityRef.current = null }

    // SecureStore status='ready' trước tất cả — crash recovery sẽ nhận ra đây không phải chuyến active
    if (drv) await saveDriverInfo({ ...drv, status: 'ready' }).catch(() => {})

    // Kiểm tra khách có hủy trước không (FCM có thể không đến kịp)
    let customerAlreadyCancelled = false
    if (trip) {
      try {
        customerAlreadyCancelled = (await rtdb.get<boolean>(`trips/${trip.tripId}/cancelled_by_customer`)) === true
      } catch {}
    }

    let odcSuccess = true

    if (customerAlreadyCancelled) {
      // Khách hủy trước → tài xế là nạn nhân, ghi penalty khách
      if (trip) {
        const amount = pickedUpRef.current ? 2 : 1
        incrementCustomerPenalty(trip.customerPhone, amount)
          .then(count => {
            if (count >= 3) setCustomerLockedUntil(trip.customerPhone, Date.now() + 48 * 60 * 60 * 1000).catch(() => {})
          })
          .catch(() => {})
      }
    } else {
      // Tài xế thật sự bỏ chuyến
      if (trip) rtdb.set(`trips/${trip.tripId}/cancelled_by_driver`, true).catch(() => {})
      if (trip && customerFcmTokenRef.current && drv) {
        notifyCancel(trip.tripId, 'driver', customerFcmTokenRef.current, drv.name).catch(() => {})
      }
      if (pickedUpRef.current && trip) {
        incrementCustomerPenalty(trip.customerPhone, 2).catch(() => {})
      }

      // [BLOCKING] Trừ ODC — 3 lần, timeout 8s mỗi lần, chờ 3s giữa các lần
      if (trip && drv) {
        const memo = encodeMemo(drv.phone, trip.customerPhone, trip.pickupGeohash, trip.dropGeohash, 1)
        odcSuccess = false
        for (let i = 0; i < 3; i++) {
          try {
            const key = await getEncryptedKey()
            if (!key) break
            await Promise.race([
              recordTrip({ driverUid: drv.uid, rating: 1, tripPrice: trip.tripPrice, memo27bytes: memo, isCancelled: true, encryptedPrivateKey: key }),
              new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 8000)),
            ])
            odcSuccess = true
            break
          } catch {
            if (i < 2) await new Promise<void>(r => setTimeout(r, 3000))
          }
        }
        if (!odcSuccess) {
          await savePenaltyTrip({ driverUid: drv.uid, tripPrice: trip.tripPrice, memo27Base64: memo }).catch(() => {})
        }
      }
    }

    // Firestore update — fire-and-forget, home.tsx sẽ fix nếu fail
    if (drv) {
      updateDriverStatus(drv.uid, 'ready').catch(() => {})
      setDriverPendingTrip(drv.uid, false).catch(() => {})
    }

    await clearPendingTrip()
    if (customerAlreadyCancelled && trip) rtdb.delete(`trips/${trip.tripId}`).catch(() => {})

    if (!customerAlreadyCancelled && !odcSuccess) {
      showAlert('Thông báo', 'Không thể trừ ODC lúc này. Sẽ xử lý trước khi Sẵn sàng lại.', [
        { text: 'OK', onPress: () => router.replace('/(driver)/home') },
      ])
    } else {
      router.replace('/(driver)/online')
    }
  }

  function handlePickedUp() {
    if (!pendingTrip) return
    pickedUpRef.current = true
    setPickedUp(true)
    if (pickupProximityRef.current) { clearInterval(pickupProximityRef.current); pickupProximityRef.current = null }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    mapRef.current?.hideCustomerMarker()
    rtdb.set(`trips/${pendingTrip.tripId}/driver_at_pickup`, true).catch(() => {})
    rtdb.set(`trips/${pendingTrip.tripId}/trip_status`, 'picked_up').catch(() => {})

    // Bắt đầu check khoảng cách đến điểm đến
    const dLat = dropLatRef.current
    const dLng = dropLngRef.current
    if (!dLat || !dLng) {
      // Không có tọa độ điểm đến → cho phép hoàn thành ngay
      setNearDropoff(true)
      return
    }
    proximityRef.current = setInterval(async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        const dist = distanceKm(loc.coords.latitude, loc.coords.longitude, dLat, dLng)
        setDistToDropoff(dist)
        if (dist <= 0.15) {
          setNearDropoff(true)
          if (proximityRef.current) { clearInterval(proximityRef.current); proximityRef.current = null }
          // Gửi FCM cho khách (cả passenger lẫn freight) để mở rating screen
          if (customerFcmTokenRef.current && pendingTripRef.current) {
            notifyCancel(pendingTripRef.current.tripId, 'approaching_dropoff', customerFcmTokenRef.current).catch(() => {})
          }
        }
      } catch {}
    }, 15000)
  }

  function handleOpenMaps() {
    if (!pendingTrip) return
    const lat = pickedUp ? dropLat : pendingTrip.pickupLat
    const lng = pickedUp ? dropLng : pendingTrip.pickupLng
    if (!lat || !lng) return
    const mode = driverInfoRef.current?.vehicleType === 'motorbike' ? 'l' : 'd'
    const navUrl = `google.navigation:q=${lat},${lng}&mode=${mode}`
    const fallbackUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
    Linking.openURL(navUrl).catch(() =>
      Linking.openURL(fallbackUrl).catch(() => showAlert(t('common.error'), t('error.unknown')))
    )
  }

  function handleEndTrip() {
    const isFreight = !!freightInfo
    showAlert(
      t('trip.completed'),
      isFreight ? t('trip.freightCompleteConfirm') : t('trip.completedConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.confirm'), onPress: doEndTrip },
      ],
    )
  }

  async function doEndTrip() {
    const trip = pendingTripRef.current
    const drv  = driverInfoRef.current
    if (!trip || !drv || submitting) return
    setSubmitting(true)
    setWaitingForRating(true)

    const isFreight = !!freightInfo

    // Bước 1: SecureStore status='ready' TRƯỚC — crash sau blockchain sẽ không route về pending-trip
    await saveDriverInfo({ ...drv, status: 'ready' }).catch(() => {})

    // Bước 2: Đọc rating RTDB 1 lần → default 3
    let finalRating: RatingValue = 3
    try {
      const r = await rtdb.get<number>(`trips/${trip.tripId}/rating`)
      if (r != null && r >= 1 && r <= 5) finalRating = r as RatingValue
    } catch {}

    // Bước 3: Lưu rating + memo vào pendingTrip (crash recovery)
    const memo = encodeMemo(drv.phone, trip.customerPhone, trip.pickupGeohash, trip.dropGeohash, finalRating)
    await savePendingTrip({ ...trip, rating: finalRating, memo27Base64: memo }).catch(() => {})

    // Bước 4: Freight → FCM delivery_complete cho khách hàng hóa
    if (isFreight && customerFcmTokenRef.current) {
      notifyCancel(trip.tripId, 'delivery_complete', customerFcmTokenRef.current).catch(() => {})
    }

    // Bước 5: BLOCKING recordTrip — retry 3×8s, chờ 3s giữa các lần
    const key = await getEncryptedKey()
    let success = false
    if (key) {
      for (let i = 0; i < 3; i++) {
        try {
          await Promise.race([
            recordTrip({ driverUid: drv.uid, rating: finalRating, tripPrice: trip.tripPrice, memo27bytes: memo, isCancelled: false, encryptedPrivateKey: key }),
            new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 8000)),
          ])
          success = true
          break
        } catch {
          if (i < 2) await new Promise<void>(r => setTimeout(r, 3000))
        }
      }
    }

    if (!success) {
      // pendingTrip giữ nguyên (có rating + memo + status='ready') → xử lý ở Sẵn sàng
      setSubmitting(false)
      setWaitingForRating(false)
      showAlert('Thông báo', 'Không thể ghi chuyến lúc này. Sẽ xử lý trước khi Sẵn sàng lại.', [
        { text: 'OK', onPress: () => router.replace('/(driver)/home') },
      ])
      return
    }

    // Thành công — đánh dấu completed TRƯỚC khi xóa (chống double-submission)
    const isFirstTrip = !drv.firstTripDone
    if (isFirstTrip) await saveDriverInfo({ ...drv, firstTripDone: true, status: 'ready' }).catch(() => {})
    await savePendingTrip({ ...trip, rating: finalRating, memo27Base64: memo, completed: true }).catch(() => {})
    await clearPendingTrip()
    setDriverPendingTrip(drv.uid, false).catch(() => {})
    updateDriverStatus(drv.uid, 'ready').catch(() => {})
    rtdb.delete(`trips/${trip.tripId}`).catch(() => {})

    if (isFirstTrip) {
      showAlert(t('trip.firstTripTitle'), t('trip.firstTripBonus'), [
        { text: 'OK', onPress: () => router.replace('/(driver)/online') },
      ])
    } else {
      router.replace('/(driver)/online')
    }
  }

  if (!pendingTrip) {
    return (
      <View style={styles.fullCenter}>
        <ActivityIndicator size="large" color={BRAND} />
      </View>
    )
  }

  if (waitingForRating) {
    return (
      <View style={styles.fullCenter}>
        <ActivityIndicator size="large" color={BRAND} />
        <Text style={styles.waitText}>{t('trip.processingTrip')}</Text>
      </View>
    )
  }

  const priceFormatted = pendingTrip.tripPrice.toLocaleString('vi-VN')

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* Map full screen */}
      <View style={StyleSheet.absoluteFill}>
        {mapInit ? (
          <MapView
            ref={mapRef}
            lat={mapInit.lat}
            lng={mapInit.lng}
            onMapReady={() => {
              const trip = pendingTripRef.current
              const dPos = mapInitRef.current
              if (trip?.pickupLat && trip?.pickupLng) {
                mapRef.current?.showCustomerMarker(trip.pickupLat, trip.pickupLng)
                if (dPos) {
                  mapRef.current?.fitBoundsToMarkers(dPos.lat, dPos.lng, trip.pickupLat, trip.pickupLng, bottomPadRef.current)
                }
              }
              mapRef.current?.setBottomPadding(bottomPadRef.current)
            }}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: BRAND_LIGHT }]} />
        )}
      </View>

      {/* Header overlay */}
      <SafeAreaView style={styles.headerOverlay} edges={['top']} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={[styles.abandonBtn, abandoning && styles.abandonBtnBusy]}
            onPress={handleAbandon}
            activeOpacity={0.8}
            disabled={abandoning}
          >
            <Text style={[styles.abandonBtnText, abandoning && { color: '#94A3B8' }]}>
              {abandoning ? 'Đang xử lý...' : t('trip.abandonTrip')}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Spinner giữa map khi đang xử lý hủy */}
      {abandoning && (
        <View style={styles.abandoningOverlay} pointerEvents="none">
          <View style={styles.abandoningCard}>
            <ActivityIndicator size="large" color={BRAND} />
            <Text style={styles.abandoningText}>Đang hủy chuyến...</Text>
          </View>
        </View>
      )}

      {/* Bottom panel — swipe handle up to reveal SOS section */}
      <Animated.View
        style={[styles.panel, { transform: [{ translateY: panelAnim }], paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        <View {...panResponder.panHandlers} style={styles.handleArea}>
          <View style={styles.handle} />
          <Text style={styles.handleHint}>Trượt lên để thấy nút SOS</Text>
        </View>

        {/* Info section */}
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {!!freightInfo ? (
          <>
            {/* Thẻ 1: Giá báo */}
            <View style={[styles.addressRow, { alignItems: 'center' }]}>
              <Ionicons name="cash-outline" size={18} color={BRAND} style={{ flexShrink: 0 }} />
              <Text style={[styles.priceValue, { flex: 1, marginLeft: 6 }]}>{priceFormatted} đ</Text>
              <TouchableOpacity style={styles.customerChip} onPress={() => Linking.openURL(`tel:${pendingTrip.customerPhone}`)} activeOpacity={0.75}>
                <Ionicons name="call-outline" size={13} color="#fff" />
                <Text style={styles.customerChipText}>{`***${pendingTrip.customerPhone.slice(-3)}`}</Text>
              </TouchableOpacity>
            </View>

            {/* Thẻ 2: Người gửi */}
            <View style={[styles.addressRow, { flexDirection: 'column', alignItems: 'stretch', gap: 3 }]}>
              <Text style={styles.contactCardTitle}>Thông tin người gửi</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="person-outline" size={14} color={BRAND} style={{ flexShrink: 0 }} />
                <Text style={[styles.addressText, { flex: 1, fontWeight: '600' }]} numberOfLines={1}>{freightInfo.senderName}</Text>
                <TouchableOpacity style={styles.customerChip} onPress={() => Linking.openURL(`tel:${freightInfo.senderPhone}`)} activeOpacity={0.75}>
                  <Ionicons name="call-outline" size={13} color="#fff" />
                  <Text style={styles.customerChipText}>{`***${freightInfo.senderPhone.slice(-3)}`}</Text>
                </TouchableOpacity>
              </View>
              {!!pickupAddress && (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                  <Ionicons name="location-outline" size={13} color="#64748B" style={{ marginTop: 2, flexShrink: 0 }} />
                  <Text style={[styles.addressText, { color: '#64748B', fontSize: 12 }]} numberOfLines={1}>{pickupAddress}</Text>
                </View>
              )}
            </View>

            {/* Thẻ 3: Người nhận */}
            <View style={[styles.addressRow, { flexDirection: 'column', alignItems: 'stretch', gap: 3 }]}>
              <Text style={styles.contactCardTitle}>Thông tin người nhận</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="person-outline" size={14} color={BRAND} style={{ flexShrink: 0 }} />
                <Text style={[styles.addressText, { flex: 1, fontWeight: '600' }]} numberOfLines={1}>{freightInfo.recipientName}</Text>
                <TouchableOpacity style={styles.customerChip} onPress={() => Linking.openURL(`tel:${freightInfo.recipientPhone}`)} activeOpacity={0.75}>
                  <Ionicons name="call-outline" size={13} color="#fff" />
                  <Text style={styles.customerChipText}>{`***${freightInfo.recipientPhone.slice(-3)}`}</Text>
                </TouchableOpacity>
              </View>
              {!!destAddress && (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                  <Ionicons name="location-outline" size={13} color="#64748B" style={{ marginTop: 2, flexShrink: 0 }} />
                  <Text style={[styles.addressText, { color: '#64748B', fontSize: 12 }]} numberOfLines={1}>{destAddress}</Text>
                </View>
              )}
            </View>

            {/* Thẻ 4: Ghi chú */}
            {!!tripNote && (
              <View style={[styles.addressRow, { backgroundColor: '#FFFBEB' }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={14} color="#F59E0B" style={{ marginTop: 2, flexShrink: 0 }} />
                <Text style={[styles.addressText, { color: '#92400E', fontStyle: 'italic' }]} numberOfLines={2}>
                  <Text style={{ fontWeight: '700', fontStyle: 'normal' }}>Ghi chú: </Text>{tripNote}
                </Text>
              </View>
            )}
          </>
        ) : (
          <>
            {/* Passenger layout — same card format as freight */}
            {/* Thẻ 1: Giá + gọi khách */}
            <View style={[styles.addressRow, { alignItems: 'center' }]}>
              <Ionicons name="cash-outline" size={18} color={BRAND} style={{ flexShrink: 0 }} />
              <Text style={[styles.priceValue, { flex: 1, marginLeft: 6 }]}>{priceFormatted} đ</Text>
              <TouchableOpacity style={styles.customerChip} onPress={() => Linking.openURL(`tel:${pendingTrip.customerPhone}`)} activeOpacity={0.75}>
                <Ionicons name="call-outline" size={13} color="#fff" />
                <Text style={styles.customerChipText}>{`***${pendingTrip.customerPhone.slice(-3)}`}</Text>
              </TouchableOpacity>
            </View>

            {/* Thẻ 2: Điểm đón */}
            {!!pickupAddress && (
              <View style={[styles.addressRow, { flexDirection: 'column', alignItems: 'stretch', gap: 3 }]}>
                <Text style={styles.contactCardTitle}>Điểm đón</Text>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                  <Ionicons name="location-outline" size={14} color={BRAND} style={{ marginTop: 2, flexShrink: 0 }} />
                  <Text style={styles.addressText} numberOfLines={2}>{pickupAddress}</Text>
                </View>
              </View>
            )}

            {/* Thẻ 3: Điểm đến */}
            {!!destAddress && (
              <View style={[styles.addressRow, { flexDirection: 'column', alignItems: 'stretch', gap: 3 }]}>
                <Text style={styles.contactCardTitle}>Điểm đến</Text>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                  <Ionicons name="location-outline" size={14} color="#94A3B8" style={{ marginTop: 2, flexShrink: 0 }} />
                  <Text style={styles.addressText} numberOfLines={2}>{destAddress}</Text>
                </View>
              </View>
            )}

            {/* Thẻ 4: Ghi chú */}
            {!!tripNote && (
              <View style={[styles.addressRow, { backgroundColor: '#FFFBEB' }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={14} color="#F59E0B" style={{ marginTop: 2, flexShrink: 0 }} />
                <Text style={[styles.addressText, { color: '#92400E', fontStyle: 'italic' }]} numberOfLines={2}>
                  <Text style={{ fontWeight: '700', fontStyle: 'normal' }}>Ghi chú: </Text>{tripNote}
                </Text>
              </View>
            )}
          </>
        )}
        </ScrollView>

        <View style={styles.btnGroup}>
          {/* Dẫn đường Google Maps */}
          <TouchableOpacity style={styles.mapsBtn} onPress={handleOpenMaps} activeOpacity={0.8}>
            <Ionicons name="map-outline" size={16} color={BRAND} />
            <Text style={styles.mapsBtnText}>
              {pickedUp ? 'Dẫn đường đến điểm đến' : 'Dẫn đường đến điểm đón'}
            </Text>
          </TouchableOpacity>

          {/* Đến điểm đón → sau khi bấm đổi thành Hoàn thành */}
          {!pickedUp ? (
            nearPickup ? (
              <TouchableOpacity style={styles.pickupBtn} onPress={handlePickedUp} activeOpacity={0.85}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                <Text style={styles.pickupBtnText}>{t('trip.driverArrived')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.endBtnDisabled}
                activeOpacity={0.7}
                onPress={() => showAlert(
                  '📍 Chưa đến điểm đón',
                  distToPickup !== null
                    ? `Bạn còn cách điểm đón ${distToPickup < 1 ? Math.round(distToPickup * 1000) + ' m' : distToPickup.toFixed(1) + ' km'}.\n\nNút sẽ mở khóa khi bạn đến trong vòng 150m.`
                    : 'Đang xác định vị trí, vui lòng chờ...',
                )}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color="#94A3B8" />
                <View>
                  <Text style={styles.endBtnDisabledText}>{t('trip.driverArrived')}</Text>
                  <Text style={styles.endBtnHint}>
                    {distToPickup !== null
                      ? `Còn ${distToPickup < 1 ? Math.round(distToPickup * 1000) + ' m' : distToPickup.toFixed(1) + ' km'} đến điểm đón`
                      : 'Đang xác định vị trí...'}
                  </Text>
                </View>
              </TouchableOpacity>
            )
          ) : nearDropoff ? (
            <TouchableOpacity style={styles.endBtn} onPress={handleEndTrip} activeOpacity={0.85}>
              <Ionicons name="flag-outline" size={16} color="#fff" />
              <Text style={styles.endBtnText}>{t('trip.completed')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.endBtnDisabled}
              activeOpacity={0.7}
              onPress={() => showAlert(
                '📍 Chưa đến điểm đến',
                distToDropoff !== null
                  ? `Bạn còn cách điểm đến ${distToDropoff < 1 ? Math.round(distToDropoff * 1000) + ' m' : distToDropoff.toFixed(1) + ' km'}.\n\nApp sẽ tự mở khóa nút hoàn thành khi bạn đến trong vòng 150m — hãy di chuyển đến điểm đến trước nhé!`
                  : 'Đang xác định vị trí của bạn, vui lòng chờ trong giây lát...',
              )}
            >
              <Ionicons name="flag-outline" size={16} color="#94A3B8" />
              <View>
                <Text style={styles.endBtnDisabledText}>Hoàn thành chuyến</Text>
                <Text style={styles.endBtnHint}>
                  {distToDropoff !== null
                    ? `Còn ${distToDropoff < 1 ? Math.round(distToDropoff * 1000) + ' m' : distToDropoff.toFixed(1) + ' km'} đến điểm đến`
                    : 'Đang xác định vị trí...'}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

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
  root:       { flex: 1, backgroundColor: '#E8EDF6' },
  fullCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', gap: 16 },
  waitText:   { fontSize: 15, color: '#64748B', fontWeight: '600', textAlign: 'center' },

  // Header overlay
  headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    marginHorizontal: 14, marginTop: 10, gap: 10,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  statusPillText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  abandonBtn: {
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10, shadowRadius: 6, elevation: 3,
  },
  abandonBtnBusy: {
    backgroundColor: '#F1F5F9', shadowOpacity: 0,  elevation: 0,
  },
  abandonBtnText: { fontSize: 13, fontWeight: '600', color: '#DC2626' },
  abandoningOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  abandoningCard: {
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 16, paddingVertical: 20,
    paddingHorizontal: 32, alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 8,
  },
  abandoningText: { fontSize: 14, fontWeight: '600', color: BRAND },

  // Bottom panel
  panel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    minHeight: SCREEN_H * 0.82,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.10, shadowRadius: 16, elevation: 20,
  },
  handleArea:  { alignItems: 'center', paddingTop: 10, paddingBottom: 10, marginBottom: 4 },
  handle:      { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0' },
  handleHint:  { fontSize: 11, color: 'rgba(26,46,94,0.45)', fontWeight: '600', marginTop: 5 },
  sosDivider:  { height: 1, backgroundColor: '#E2E8F0', marginHorizontal: -20, marginTop: 8 },
  sosSection:  { alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },

  // Freight contacts page styles
  freightSwipeHint:    { fontSize: 11, color: '#94A3B8', fontStyle: 'italic', textAlign: 'center', marginTop: 4 },
  freightPageTitle:    { fontSize: 13, fontWeight: '700', color: BRAND, marginBottom: 8 },
  freightContactCard:  { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  freightContactHeader:{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  freightContactRole:  { fontSize: 11, fontWeight: '700', color: BRAND, textTransform: 'uppercase', letterSpacing: 0.5 },
  freightContactName:  { fontSize: 14, fontWeight: '600', color: '#0F172A', marginBottom: 6 },
  freightCallBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderWidth: 1, borderColor: BRAND, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  freightCallText:     { fontSize: 13, fontWeight: '600', color: BRAND },

  priceRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 6,
  },
  priceLabel: { fontSize: 11, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  priceValue: { fontSize: 20, fontWeight: '800', color: BRAND },

  customerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: BRAND, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20,
  },
  customerChipText: { fontSize: 12, fontWeight: '600', color: '#fff' },

  addressRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: '#F8FAFC', borderRadius: 10, padding: 8, marginBottom: 5,
  },
  addressText: { flex: 1, fontSize: 13, color: '#334155', lineHeight: 17 },
  contactCardTitle: { fontSize: 11, fontWeight: '700', color: BRAND, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },

  // Buttons
  btnGroup: { gap: 10 },
  mapsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12, paddingVertical: 12,
    backgroundColor: '#F8FAFC',
  },
  mapsBtnText: { fontSize: 14, fontWeight: '700', color: BRAND },

  pickupBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: BRAND, borderRadius: 12, paddingVertical: 14,
  },
  pickupBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  endBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#DC2626', borderRadius: 12, paddingVertical: 14,
  },
  endBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  endBtnDisabled: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#F1F5F9', borderRadius: 12, paddingVertical: 12,
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  endBtnDisabledText: { fontSize: 15, fontWeight: '700', color: '#94A3B8' },
  endBtnHint: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 2 },
})
