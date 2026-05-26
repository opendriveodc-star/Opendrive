// app/(driver)/trip.tsx

import React, { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Linking, Animated, PanResponder,
  ActivityIndicator, StatusBar,
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
import { getPendingTrip, getDriverInfo, getEncryptedKey, clearPendingTrip, saveDriverInfo, savePendingTrip, addPendingPenalty } from '../../src/utils/storage'
import { recordTrip, notifyCancel, sosAlert } from '../../src/services/cloudflare'
import { updateDriverStatus, setDriverPendingTrip, incrementCustomerPenalty } from '../../src/services/firestore'
import { encodeMemo, encodeSosMemo } from '../../src/services/odc'
import SosButton from '../../src/components/SosButton'
import { rtdb } from '../../src/services/firebase'
import { distanceKm } from '../../src/services/location'
import { LOCATION } from '../../src/constants'
import type {
  PendingTrip, DriverInfo, RatingValue, TripRealtimeInfo,
} from '../../src/types'

const BRAND          = '#1A2E5E'
const BRAND_LIGHT    = '#E8EDF6'
const SOS_SECTION_H  = 220

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

  const intervalRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const ratingPollRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const ratingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pickedUpRef      = useRef(false)
  const pendingTripRef      = useRef<PendingTrip | null>(null)
  const driverInfoRef       = useRef<DriverInfo | null>(null)
  const mapInitRef          = useRef<{ lat: number; lng: number } | null>(null)
  const proximityRef        = useRef<ReturnType<typeof setInterval> | null>(null)
  const pickupProximityRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const dropLatRef          = useRef<number | null>(null)
  const dropLngRef          = useRef<number | null>(null)
  const navNotifIdRef       = useRef<string | null>(null)
  const customerFcmTokenRef = useRef<string>('')
  const cancelledHandledRef = useRef(false)
  const abandoningRef       = useRef(false)

  const panelAnim        = useRef(new Animated.Value(SOS_SECTION_H)).current
  const panelLevelRef    = useRef(0)
  const panStartValRef   = useRef(SOS_SECTION_H)
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
      Animated.spring(panelAnim, { toValue: expand ? 0 : SOS_SECTION_H, useNativeDriver: true, bounciness: 4 }).start()
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
                dismissNavNotif()
                if (pickupProximityRef.current) { clearInterval(pickupProximityRef.current); pickupProximityRef.current = null }
              }
            } catch {}
          }, 5000)
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
    dismissNavNotif()
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
    rtdb.set(`trips/${pendingTrip.tripId}/trip_info`, {
      driverName:     driverInfo.name,
      driverPhone:    driverInfo.phone,
      vehicleBrand:   driverInfo.vehicleBrand,
      vehicleColor:   driverInfo.vehicleColor ?? '',
      licensePlate:   driverInfo.licensePlate,
      driverFcmToken: driverInfo.fcmToken ?? '',
    }).catch(() => {})
  }, [pendingTrip, driverInfo])

  // Bắt đầu gửi vị trí qua RTDB ngay khi vào màn hình
  useEffect(() => {
    if (!pendingTrip) return
    const tripId = pendingTrip.tripId

    intervalRef.current = setInterval(async () => {
      if (pickedUpRef.current) return
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        const lat = loc.coords.latitude
        const lng = loc.coords.longitude
        mapRef.current?.updateDriverMarker(lat, lng)
        mapRef.current?.panTo(lat, lng)
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
      {
        text: t('trip.abandonTrip'), style: 'destructive',
        onPress: async () => {
          if (abandoningRef.current) return
          abandoningRef.current = true

          const trip = pendingTripRef.current
          const drv  = driverInfoRef.current

          // Lưu cờ cancelling trước tiên — bảo vệ TH app bị kill trong lúc hủy
          if (trip) await savePendingTrip({ ...trip, cancelling: true }).catch(() => {})

          setAbandoning(true)  // khóa button + hiện spinner

          if (intervalRef.current)        { clearInterval(intervalRef.current);        intervalRef.current = null }
          if (pickupProximityRef.current) { clearInterval(pickupProximityRef.current); pickupProximityRef.current = null }
          if (proximityRef.current)       { clearInterval(proximityRef.current);       proximityRef.current = null }

          // [BACKGROUND] Trừ ODC — không block, thất bại thì ghi pendingPenalty → xử lý lần sau
          if (trip && drv) {
            getEncryptedKey().then(key => {
              if (!key) throw new Error('no key')
              return recordTrip({
                driverUid: drv.uid, rating: 1, tripPrice: trip.tripPrice,
                memo27bytes: encodeMemo(drv.phone, trip.customerPhone, trip.pickupGeohash, trip.dropGeohash, 1),
                isCancelled: true, encryptedPrivateKey: key,
              })
            }).catch(async () => {
              await addPendingPenalty({
                driverUid:    drv.uid,
                tripPrice:    trip.tripPrice,
                memo27Base64: encodeMemo(drv.phone, trip.customerPhone, trip.pickupGeohash, trip.dropGeohash, 1),
              }).catch(() => {})
            })
          }

          // [BACKGROUND] Phạt khách nếu tài xế đã đến điểm đón
          if (pickedUpRef.current && trip) {
            incrementCustomerPenalty(trip.customerPhone, 2).catch(() => {})
          }

          // [BEST-EFFORT] Thông báo khách qua FCM — gửi 1 lần, fail kệ
          if (trip && customerFcmTokenRef.current && drv) {
            notifyCancel(trip.tripId, 'driver', customerFcmTokenRef.current, drv.name).catch(() => {})
          }

          // [BLOCKING] Firestore: status='ready' + pendingTrip=false — retry 3 lần
          // Phải xong trước khi xóa dữ liệu local và chuyển trang
          if (drv) {
            for (let i = 0; i < 3; i++) {
              try {
                await Promise.all([
                  updateDriverStatus(drv.uid, 'ready'),
                  setDriverPendingTrip(drv.uid, false),
                ])
                break
              } catch {
                if (i < 2) await new Promise<void>(r => setTimeout(r, 2000))
              }
            }
          }

          // Xóa dữ liệu local + chuyển trang
          await clearPendingTrip()
          if (drv) saveDriverInfo({ ...drv, status: 'ready' }).catch(() => {})
          dismissNavNotif()
          router.replace('/(driver)/online')
        },
      },
    ])
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
          dismissNavNotif()
          if (proximityRef.current) { clearInterval(proximityRef.current); proximityRef.current = null }
        }
      } catch {}
    }, 5000)
  }

  function dismissNavNotif() {
    if (navNotifIdRef.current) {
      Notifications.dismissNotificationAsync(navNotifIdRef.current).catch(() => {})
      navNotifIdRef.current = null
    }
  }

  function handleOpenMaps() {
    if (!pendingTrip) return
    const lat = pickedUp ? dropLat : pendingTrip.pickupLat
    const lng = pickedUp ? dropLng : pendingTrip.pickupLng
    if (!lat || !lng) return
    const mode = driverInfoRef.current?.vehicleType === 'motorbike' ? 'l' : 'd'
    openNavigation(lat, lng, mode)
  }

  function openNavigation(lat: number, lng: number, mode: 'l' | 'd') {
    const navUrl = `google.navigation:q=${lat},${lng}&mode=${mode}`
    const fallbackUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`

    dismissNavNotif()
    Linking.openURL(navUrl).catch(() =>
      Linking.openURL(fallbackUrl).catch(() => showAlert(t('common.error'), t('error.unknown')))
    )

    const label = pickedUp ? 'Đang đến điểm đến' : 'Đang đến điểm đón'
    Notifications.scheduleNotificationAsync({
      content: {
        title: `📍 ${label}`,
        body: 'Nhấn để quay lại OpenDrive',
        sticky: true,
        data: { screen: 'trip' },
      },
      trigger: null,
    }).then(id => { navNotifIdRef.current = id }).catch(() => {})
  }

  function handleEndTrip() {
    showAlert(t('trip.completed'), t('trip.waitForRating'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: () => {
          if (!pendingTrip) return
          rtdb.set(`trips/${pendingTrip.tripId}/trip_status`, 'completed').catch(() => {})
          setWaitingForRating(true)
          startRatingPoll()
        },
      },
    ])
  }

  function startRatingPoll() {
    if (!pendingTrip) return
    const tripId = pendingTrip.tripId
    ratingPollRef.current = setInterval(async () => {
      try {
        const rating = await rtdb.get<number>(`trips/${tripId}/rating`)
        if (rating != null) { stopRatingPoll(); submitTrip(rating as RatingValue) }
      } catch {}
    }, 2000)
    ratingTimeoutRef.current = setTimeout(() => {
      stopRatingPoll()
      submitTrip(3 as RatingValue)
    }, 30_000)
  }

  function stopRatingPoll() {
    if (ratingPollRef.current)    clearInterval(ratingPollRef.current)
    if (ratingTimeoutRef.current) clearTimeout(ratingTimeoutRef.current)
    ratingPollRef.current    = null
    ratingTimeoutRef.current = null
  }

  async function submitTrip(rating: RatingValue) {
    if (!pendingTrip || !driverInfo || submitting) return
    setSubmitting(true)
    try {
      const encryptedPrivateKey = await getEncryptedKey()
      if (!encryptedPrivateKey) throw new Error('No encrypted key')
      const memo27bytes = encodeMemo(
        driverInfo.phone, pendingTrip.customerPhone,
        pendingTrip.pickupGeohash, pendingTrip.dropGeohash, rating,
      )
      await recordTrip({
        driverUid: driverInfo.uid, rating, tripPrice: pendingTrip.tripPrice,
        memo27bytes, isCancelled: false, encryptedPrivateKey,
      })
      const isFirstTrip = !driverInfo.firstTripDone
      if (isFirstTrip) await saveDriverInfo({ ...driverInfo, firstTripDone: true }).catch(() => {})
      await clearPendingTrip()
      setDriverPendingTrip(driverInfo.uid, false).catch(() => {})
      await updateDriverStatus(driverInfo.uid, 'ready')
      await rtdb.delete(`trips/${pendingTrip.tripId}`).catch(() => {})
      dismissNavNotif()
      if (isFirstTrip) {
        showAlert(t('trip.firstTripTitle'), t('trip.firstTripBonus'), [
          { text: 'OK', onPress: () => router.replace('/(driver)/online') },
        ])
      } else {
        router.replace('/(driver)/online')
      }
    } catch (e) {
      setSubmitting(false)
      setWaitingForRating(false)
      showAlert(t('common.error'), String(e))
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
        <Text style={styles.waitText}>{t('trip.waitForRating')}</Text>
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
                  // paddingBottom 320 để tránh panel phía dưới che mất pin
                  mapRef.current?.fitBoundsToMarkers(dPos.lat, dPos.lng, trip.pickupLat, trip.pickupLng, 320)
                }
              }
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

        {/* Price + SĐT khách (bấm để gọi) */}
        <View style={styles.priceRow}>
          <View>
            <Text style={styles.priceLabel}>{t('online.priceLabel')}</Text>
            <Text style={styles.priceValue}>{priceFormatted} đ</Text>
          </View>
          <TouchableOpacity
            style={styles.customerChip}
            onPress={() => Linking.openURL(`tel:${pendingTrip.customerPhone}`)}
            activeOpacity={0.75}
          >
            <Ionicons name="call-outline" size={13} color={BRAND} />
            <Text style={styles.customerChipText}>{`***${pendingTrip.customerPhone.slice(-3)}`}</Text>
          </TouchableOpacity>
        </View>

        {/* Điểm đón */}
        {!!pickupAddress && (
          <View style={styles.addressRow}>
            <Ionicons name="location-sharp" size={14} color={BRAND} style={{ marginTop: 2, flexShrink: 0 }} />
            <Text style={styles.addressText} numberOfLines={2}>{pickupAddress}</Text>
          </View>
        )}

        {/* Điểm đến */}
        {!!destAddress && (
          <View style={styles.addressRow}>
            <Ionicons name="location-sharp" size={14} color="#94A3B8" style={{ marginTop: 2, flexShrink: 0 }} />
            <Text style={styles.addressText} numberOfLines={2}>{destAddress}</Text>
          </View>
        )}

        {/* Ghi chú */}
        {!!tripNote && (
          <View style={[styles.addressRow, { backgroundColor: '#FFFBEB' }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={14} color="#F59E0B" style={{ marginTop: 2, flexShrink: 0 }} />
            <Text style={[styles.addressText, { color: '#92400E', fontStyle: 'italic' }]} numberOfLines={3}>
              <Text style={{ fontWeight: '700', fontStyle: 'normal' }}>Ghi chú: </Text>{tripNote}
            </Text>
          </View>
        )}

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

  priceRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  priceLabel: { fontSize: 11, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  priceValue: { fontSize: 26, fontWeight: '800', color: BRAND },

  customerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#E8EDF6', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
  },
  customerChipText: { fontSize: 13, fontWeight: '600', color: BRAND },

  addressRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginBottom: 14,
  },
  addressText: { flex: 1, fontSize: 13, color: '#334155', lineHeight: 18 },

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
