// app/(driver)/trip.tsx
// Màn hình tài xế đang chạy chuyến – gửi vị trí qua DataChannel

import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ActivityIndicator,
} from 'react-native'
import { showAlert } from '../../src/components/GlobalAlert'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import * as Location from 'expo-location'
import { createAnswerConnection, closePeerConnection, sendMessage } from '../../src/services/webrtc'
import { getPendingTrip, getDriverInfo, getEncryptedKey, clearPendingTrip } from '../../src/utils/storage'
import { recordTrip } from '../../src/services/cloudflare'
import { updateDriverStatus } from '../../src/services/firestore'
import { encodeMemo } from '../../src/services/odc'
import { rtdb } from '../../src/services/firebase'
import { LOCATION, COLORS } from '../../src/constants'
import type {
  PendingTrip,
  DCLocationMessage,
  DCStatusMessage,
  DCTripInfoMessage,
  DCRatingMessage,
  DataChannelMessage,
  DriverInfo,
  RatingValue,
} from '../../src/types'

export default function TripScreen() {
  const { t } = useTranslation()
  const [pendingTrip,      setPendingTrip]      = useState<PendingTrip | null>(null)
  const [pickedUp,         setPickedUp]         = useState(false)
  const [driverInfo,       setDriverInfo]       = useState<DriverInfo | null>(null)
  const [connected,        setConnected]        = useState(false)
  const [sentTripInfo,     setSentTripInfo]     = useState(false)
  const [waitingForRating, setWaitingForRating] = useState(false)
  const [submitting,       setSubmitting]       = useState(false)
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const ratingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bridgeRef       = useRef<any | null>(null)

  useEffect(() => {
    getPendingTrip().then(setPendingTrip)
    getDriverInfo().then(setDriverInfo)
  }, [])

  useEffect(() => {
    if (!pendingTrip) return

    const tripId = pendingTrip.tripId
    let mounted = true

    async function initConnection() {
      try {
        const bridge = await createAnswerConnection(
          tripId,
          handleDataChannelMessage,
          () => { if (mounted) setConnected(true) },
        )
        bridgeRef.current = bridge
      } catch {
        if (mounted) showAlert(t('common.error'), t('error.serverError'))
      }
    }

    initConnection()

    return () => {
      mounted = false
      bridgeRef.current?.stop()
      closePeerConnection(tripId)
    }
  }, [pendingTrip])

  function handleDataChannelMessage(msg: DataChannelMessage) {
    if (msg.type === 'rating') {
      const ratingMsg = msg as DCRatingMessage
      submitTrip(ratingMsg.value)
    }
  }

  // Gửi vị trí qua DataChannel mỗi 4s khi chưa đón khách
  useEffect(() => {
    if (!pendingTrip || pickedUp) return

    intervalRef.current = setInterval(async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        const msg: DCLocationMessage = {
          type:      'location',
          lat:       loc.coords.latitude,
          lng:       loc.coords.longitude,
          timestamp: Date.now(),
        }
        sendMessage(pendingTrip.tripId, msg)
      } catch {
        // bỏ qua lỗi vị trí
      }
    }, LOCATION.DATACHANNEL_INTERVAL_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [pendingTrip, pickedUp])

  // Gửi trip_info khi kết nối xong
  useEffect(() => {
    if (!connected || sentTripInfo || !pendingTrip || !driverInfo) return

    const infoMsg: DCTripInfoMessage = {
      type:         'trip_info',
      driverName:   driverInfo.name,
      driverPhone:  driverInfo.phone,
      vehicleBrand: driverInfo.vehicleBrand,
      licensePlate: driverInfo.licensePlate,
    }

    sendMessage(pendingTrip.tripId, infoMsg)
    setSentTripInfo(true)
  }, [connected, sentTripInfo, pendingTrip, driverInfo])

  function handlePickedUp() {
    if (!pendingTrip) return
    if (intervalRef.current) clearInterval(intervalRef.current)
    setPickedUp(true)
    const msg: DCStatusMessage = { type: 'status', status: 'picked_up' }
    sendMessage(pendingTrip.tripId, msg)
  }

  function handleOpenMaps() {
    if (!pendingTrip) return
    const url = `https://www.google.com/maps/search/?api=1&query=${pendingTrip.pickupGeohash}`
    Linking.openURL(url).catch(() => showAlert(t('common.error'), t('error.unknown')))
  }

  function handleEndTrip() {
    showAlert(
      t('trip.completed'),
      t('trip.waitForRating'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: () => {
            if (!pendingTrip) return
            // Báo cho khách biết chuyến kết thúc → khách sẽ gửi rating
            const msg: DCStatusMessage = { type: 'status', status: 'completed' }
            sendMessage(pendingTrip.tripId, msg)
            setWaitingForRating(true)

            // Timeout 30s: nếu không nhận được rating → dùng rating mặc định 3
            ratingTimeoutRef.current = setTimeout(() => {
              submitTrip(3 as RatingValue)
            }, 30_000)
          },
        },
      ]
    )
  }

  async function submitTrip(rating: RatingValue) {
    if (!pendingTrip || !driverInfo || submitting) return

    // Hủy timeout nếu rating đến sớm
    if (ratingTimeoutRef.current) {
      clearTimeout(ratingTimeoutRef.current)
      ratingTimeoutRef.current = null
    }

    setSubmitting(true)
    try {
      const encryptedPrivateKey = await getEncryptedKey()
      if (!encryptedPrivateKey) throw new Error('No encrypted key')

      const memo27bytes = encodeMemo(
        driverInfo.phone,
        pendingTrip.customerPhone,
        pendingTrip.pickupGeohash,
        pendingTrip.dropGeohash,
        rating,
      )

      await recordTrip({
        driverUid: driverInfo.uid,
        rating,
        tripPrice:  pendingTrip.tripPrice,
        memo27bytes,
        isCancelled: false,
        encryptedPrivateKey,
      })

      await clearPendingTrip()
      await updateDriverStatus(driverInfo.uid, 'offline')

      // Xóa trip khỏi Realtime DB
      await rtdb.delete(`trips/${pendingTrip.tripId}`).catch(() => {})

      router.replace('/(driver)/home')
    } catch {
      setSubmitting(false)
      setWaitingForRating(false)
      showAlert(t('common.error'), t('error.serverError'))
    }
  }

  if (!pendingTrip) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    )
  }

  // Màn hình chờ đánh giá từ khách
  if (waitingForRating) {
    return (
      <View style={styles.center}>
        {submitting
          ? <ActivityIndicator size="large" color={COLORS.driver.primary} />
          : (
            <>
              <ActivityIndicator size="large" color={COLORS.driver.primary} />
              <Text style={[styles.loadingText, { marginTop: 16 }]}>{t('trip.waitForRating')}</Text>
            </>
          )}
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('trip.inProgress')}</Text>
      <Text style={styles.connectionStatus}>
        {connected ? t('trip.connected') : t('trip.connecting')}
      </Text>

      <View style={styles.card}>
        <InfoRow label={t('auth.enterPhone')} value={pendingTrip.customerPhone} />
        <InfoRow label={t('trip.pickup')}     value={pendingTrip.pickupGeohash} />
        <InfoRow
          label={t('driver.status.busy')}
          value={pickedUp ? t('trip.inProgress') : t('trip.driverComing')}
        />
      </View>

      <TouchableOpacity style={styles.mapsButton} onPress={handleOpenMaps}>
        <Text style={styles.mapsButtonText}>🗺 {t('trip.pickup')}</Text>
      </TouchableOpacity>

      {!pickedUp && (
        <TouchableOpacity style={styles.pickupButton} onPress={handlePickedUp}>
          <Text style={styles.pickupButtonText}>{t('trip.driverArrived')}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.endButton} onPress={handleEndTrip}>
        <Text style={styles.endButtonText}>{t('trip.completed')}</Text>
      </TouchableOpacity>
    </View>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: COLORS.driver.background,
    padding:         16,
  },
  center: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color:    '#64748B',
  },
  title: {
    fontSize:     22,
    fontWeight:   '700',
    color:        COLORS.driver.textPrimary,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius:    12,
    padding:         16,
    marginBottom:    20,
    elevation:       2,
  },
  row: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  rowLabel: {
    fontSize: 14,
    color:    '#64748B',
  },
  rowValue: {
    fontSize:   14,
    fontWeight: '600',
    color:      '#0F172A',
  },
  mapsButton: {
    backgroundColor: '#2563EB',
    padding:         14,
    borderRadius:    10,
    alignItems:      'center',
    marginBottom:    12,
  },
  mapsButtonText: {
    color:      '#FFFFFF',
    fontSize:   16,
    fontWeight: '600',
  },
  pickupButton: {
    backgroundColor: COLORS.driver.primary,
    padding:         14,
    borderRadius:    10,
    alignItems:      'center',
    marginBottom:    12,
  },
  pickupButtonText: {
    color:      '#FFFFFF',
    fontSize:   16,
    fontWeight: '600',
  },
  endButton: {
    backgroundColor: COLORS.driver.danger,
    padding:         14,
    borderRadius:    10,
    alignItems:      'center',
  },
  endButtonText: {
    color:      '#FFFFFF',
    fontSize:   16,
    fontWeight: '600',
  },
  connectionStatus: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 10,
  },
})
