// app/(driver)/trip.tsx

import React, { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Linking,
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
import { getPendingTrip, getDriverInfo, getEncryptedKey, clearPendingTrip, saveDriverInfo, savePendingPenalty } from '../../src/utils/storage'
import { recordTrip } from '../../src/services/cloudflare'
import { updateDriverStatus, setDriverPendingTrip, incrementCustomerPenalty } from '../../src/services/firestore'
import { encodeMemo } from '../../src/services/odc'
import { rtdb } from '../../src/services/firebase'
import { maskPhone } from '../../src/utils/format'
import { distanceKm } from '../../src/services/location'
import { LOCATION } from '../../src/constants'
import type {
  PendingTrip, DriverInfo, RatingValue, TripRealtimeInfo,
} from '../../src/types'

const BRAND        = '#1A2E5E'
const BRAND_LIGHT  = '#E8EDF6'

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

  const intervalRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const ratingPollRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const ratingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pickedUpRef      = useRef(false)
  const pendingTripRef      = useRef<PendingTrip | null>(null)
  const driverInfoRef       = useRef<DriverInfo | null>(null)
  const mapInitRef          = useRef<{ lat: number; lng: number } | null>(null)
  const proximityRef        = useRef<ReturnType<typeof setInterval> | null>(null)
  const pickupProximityRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelPollRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const dropLatRef          = useRef<number | null>(null)
  const dropLngRef          = useRef<number | null>(null)
  const navNotifIdRef       = useRef<string | null>(null)

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
          if (info?.pickupAddress) setPickupAddress(info.pickupAddress)
          if (info?.destAddress)   setDestAddress(info.destAddress)
          if (info?.note)          setTripNote(info.note)
          if (info?.dropLat)       { setDropLat(info.dropLat);  dropLatRef.current = info.dropLat }
          if (info?.dropLng)       { setDropLng(info.dropLng);  dropLngRef.current = info.dropLng }
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
              if (dist <= 0.1) {
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

  // Poll phát hiện khách hủy
  useEffect(() => {
    if (!pendingTrip) return
    const tripId = pendingTrip.tripId
    cancelPollRef.current = setInterval(async () => {
      try {
        const cancelled = await rtdb.get<string>(`trips/${tripId}/cancelled`)
        if (cancelled === 'customer') {
          if (cancelPollRef.current) { clearInterval(cancelPollRef.current); cancelPollRef.current = null }
          if (intervalRef.current)   { clearInterval(intervalRef.current);   intervalRef.current   = null }
          if (proximityRef.current)  { clearInterval(proximityRef.current);  proximityRef.current  = null }
          if (pickupProximityRef.current) { clearInterval(pickupProximityRef.current); pickupProximityRef.current = null }
          bridgeRef.current?.stop()
          dismissNavNotif()
          showAlert(t('cancel.customerCancelled'), undefined, [{
            text: 'OK',
            onPress: async () => {
              await clearPendingTrip()
              if (driverInfoRef.current) {
                setDriverPendingTrip(driverInfoRef.current.uid, false).catch(() => {})
                updateDriverStatus(driverInfoRef.current.uid, 'ready').catch(() => {})
              }
              await rtdb.delete(`trips/${tripId}`).catch(() => {})
              router.replace('/(driver)/online')
            },
          }])
        }
      } catch {}
    }, 3000)
    return () => {
      if (cancelPollRef.current) { clearInterval(cancelPollRef.current); cancelPollRef.current = null }
    }
  }, [pendingTrip])

  // Ghi trip_info lên RTDB 1 lần
  useEffect(() => {
    if (!pendingTrip || !driverInfo) return
    rtdb.set(`trips/${pendingTrip.tripId}/trip_info`, {
      driverName:   driverInfo.name,
      driverPhone:  driverInfo.phone,
      vehicleBrand: driverInfo.vehicleBrand,
      licensePlate: driverInfo.licensePlate,
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

  function handleAbandon() {
    showAlert(t('trip.abandonTrip'), t('trip.abandonConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('trip.abandonTrip'), style: 'destructive',
        onPress: async () => {
          if (intervalRef.current) clearInterval(intervalRef.current)
          bridgeRef.current?.stop()

          // Ghi nhận hủy chuyến → trừ phạt ODC 3× baseFee
          if (pendingTrip && driverInfo) {
            try {
              const encryptedPrivateKey = await getEncryptedKey()
              if (!encryptedPrivateKey) throw new Error('no key')
              const memo27bytes = encodeMemo(
                driverInfo.phone, pendingTrip.customerPhone,
                pendingTrip.pickupGeohash, pendingTrip.dropGeohash, 1,
              )
              await recordTrip({
                driverUid: driverInfo.uid,
                rating: 1,
                tripPrice: pendingTrip.tripPrice,
                memo27bytes,
                isCancelled: true,
                encryptedPrivateKey,
              })
            } catch {
              // Mạng yếu / Worker fail → lưu lại để xử lý lần đăng nhập sau
              if (pendingTrip && driverInfo) {
                const memo27Base64 = encodeMemo(
                  driverInfo.phone, pendingTrip.customerPhone,
                  pendingTrip.pickupGeohash, pendingTrip.dropGeohash, 1,
                )
                await savePendingPenalty({
                  driverUid:    driverInfo.uid,
                  tripPrice:    pendingTrip.tripPrice,
                  memo27Base64,
                }).catch(() => {})
              }
              showAlert(
                'Hệ thống gặp sự cố',
                'Không thể trừ ODC ngay lúc này. Hệ thống sẽ tự động xử lý vào lần mở app tiếp theo.',
              )
            }
          }

          // Tài xế hủy tại điểm đón → phạt khách +2
          if (nearPickup && pendingTrip) {
            incrementCustomerPenalty(pendingTrip.customerPhone, 2).catch(() => {})
          }
          // Báo hiệu cho khách biết tài xế đã hủy (khách sẽ xóa trip)
          if (pendingTrip) await rtdb.set(`trips/${pendingTrip.tripId}/cancelled`, 'driver').catch(() => {})
          await clearPendingTrip()
          if (driverInfo) setDriverPendingTrip(driverInfo.uid, false).catch(() => {})
          if (driverInfo) updateDriverStatus(driverInfo.uid, 'ready').catch(() => {})
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
        if (dist <= 0.1) {
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

  async function handleOpenMaps() {
    if (!pendingTrip) return
    const lat = pickedUp ? dropLat : pendingTrip.pickupLat
    const lng = pickedUp ? dropLng : pendingTrip.pickupLng
    if (!lat || !lng) return
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`

    dismissNavNotif()
    Linking.openURL(url).catch(() => showAlert(t('common.error'), t('error.unknown')))
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
          <View style={[styles.statusPill, { backgroundColor: pickedUp ? BRAND : '#F59E0B' }]}>
            <Ionicons name={pickedUp ? 'car-outline' : 'navigate-outline'} size={14} color="#fff" />
            <Text style={styles.statusPillText}>
              {pickedUp ? t('trip.inProgress') : t('trip.driverComing')}
            </Text>
          </View>
          <TouchableOpacity style={styles.abandonBtn} onPress={handleAbandon} activeOpacity={0.8}>
            <Text style={styles.abandonBtnText}>{t('trip.abandonTrip')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Bottom panel */}
      <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.handle} />

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
            <Text style={styles.customerChipText}>{maskPhone(pendingTrip.customerPhone)}</Text>
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
                    ? `Bạn còn cách điểm đón ${distToPickup < 1 ? Math.round(distToPickup * 1000) + ' m' : distToPickup.toFixed(1) + ' km'}.\n\nNút sẽ mở khóa khi bạn đến trong vòng 100m.`
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
                  ? `Bạn còn cách điểm đến ${distToDropoff < 1 ? Math.round(distToDropoff * 1000) + ' m' : distToDropoff.toFixed(1) + ' km'}.\n\nApp sẽ tự mở khóa nút hoàn thành khi bạn đến trong vòng 100m — hãy di chuyển đến điểm đến trước nhé!`
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
      </View>
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
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
  abandonBtnText: { fontSize: 13, fontWeight: '600', color: '#DC2626' },

  // Bottom panel
  panel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.10, shadowRadius: 16, elevation: 20,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginBottom: 16 },

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
