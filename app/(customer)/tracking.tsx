// app/(customer)/tracking.tsx
// Màn hình khách theo dõi tài xế qua DataChannel

import React, { useEffect, useState, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import MapView from '../../src/components/MapView'
import { COLORS, TRIP } from '../../src/constants'
import { createOfferConnection, closePeerConnection } from '../../src/services/webrtc'
import type {
  DCLocationMessage,
  DCStatusMessage,
  DCTripInfoMessage,
  DataChannelMessage,
} from '../../src/types'

export default function TrackingScreen() {
  const { t } = useTranslation()
  const { tripId } = useLocalSearchParams<{ tripId: string; driverUid: string }>()

  const [driverLat,   setDriverLat]   = useState<number>(10.7769)
  const [driverLng,   setDriverLng]   = useState<number>(106.7009)
  const [tripStatus,  setTripStatus]  = useState<'going_to_pickup' | 'arrived' | 'picked_up' | 'completed'>('going_to_pickup')
  const [driverInfo,  setDriverInfo]  = useState<{ name: string; licensePlate: string; vehicleBrand: string } | null>(null)
  const [canCancel,   setCanCancel]   = useState(true)
  const [connected,  setConnected]  = useState(false)
  const startedAtRef = useRef<number>(Date.now())
  const bridgeRef = useRef<any | null>(null)

  // Kiểm tra grace period 10 phút
  useEffect(() => {
    const checkGrace = setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current
      if (elapsed > TRIP.GRACE_PERIOD_MINUTES * 60 * 1000) {
        setCanCancel(false)
        clearInterval(checkGrace)
      }
    }, 5000)
    return () => clearInterval(checkGrace)
  }, [])

  useEffect(() => {
    if (!tripId) return

    let mounted = true

    async function initConnection() {
      try {
        const bridge = await createOfferConnection(
          tripId,
          handleDataChannelMessage,
          () => {
            if (mounted) setConnected(true)
          },
        )
        bridgeRef.current = bridge
      } catch {
        if (mounted) {
          Alert.alert(t('common.error'), t('error.serverError'))
        }
      }
    }

    initConnection()

    return () => {
      mounted = false
      bridgeRef.current?.stop()
      closePeerConnection(tripId)
    }
  }, [tripId])

  function handleDataChannelMessage(msg: DataChannelMessage) {
    if (msg.type === 'location') {
      const locMsg = msg as DCLocationMessage
      setDriverLat(locMsg.lat)
      setDriverLng(locMsg.lng)
    } else if (msg.type === 'status') {
      const statusMsg = msg as DCStatusMessage
      setTripStatus(statusMsg.status as typeof tripStatus)
      if (statusMsg.status === 'completed') {
        router.replace({
          pathname: '/(customer)/rating',
          params:   { tripId: tripId ?? '' },
        })
      }
    } else if (msg.type === 'trip_info') {
      const infoMsg = msg as DCTripInfoMessage
      setDriverInfo({
        name:         infoMsg.driverName,
        licensePlate: infoMsg.licensePlate,
        vehicleBrand: infoMsg.vehicleBrand,
      })
    }
  }

  function handleCancel() {
    Alert.alert(
      t('cancel.title'),
      t('cancel.confirm'),
      [
        { text: t('cancel.no'), style: 'cancel' },
        {
          text: t('cancel.yes'),
          style: 'destructive',
          onPress: () => router.replace('/(customer)/home'),
        },
      ]
    )
  }

  function statusLabel(): string {
    switch (tripStatus) {
      case 'going_to_pickup': return t('trip.driverComing')
      case 'arrived':         return t('trip.driverArrived')
      case 'picked_up':       return t('trip.inProgress')
      case 'completed':       return t('trip.completed')
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.map}>
        <MapView
          lat={driverLat}
          lng={driverLng}
          markers={[{ lat: driverLat, lng: driverLng, color: '#15803D', label: 'D' }]}
        />
      </View>

      <View style={styles.panel}>
        {driverInfo && (
          <View style={styles.driverCard}>
            <Text style={styles.driverName}>{driverInfo.name}</Text>
            <Text style={styles.driverMeta}>
              {driverInfo.vehicleBrand} · {driverInfo.licensePlate}
            </Text>
          </View>
        )}

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: connected ? '#15803D' : '#F59E0B' }]} />
          <Text style={styles.statusText}> {connected ? t('trip.connected') : t('trip.connecting')}</Text>
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: '#15803D' }]} />
          <Text style={styles.statusText}>{statusLabel()}</Text>
        </View>

        {canCancel && tripStatus === 'going_to_pickup' && (
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
            <Text style={styles.cancelText}>{t('cancel.title')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  panel: {
    backgroundColor: '#FFFFFF',
    padding:         16,
    borderTopLeftRadius:  16,
    borderTopRightRadius: 16,
    shadowColor:     '#000',
    shadowOpacity:   0.1,
    shadowRadius:    8,
    elevation:       8,
  },
  driverCard: {
    marginBottom: 12,
  },
  driverName: {
    fontSize:     18,
    fontWeight:   '700',
    color:        COLORS.customer.textPrimary,
  },
  driverMeta: {
    fontSize:  14,
    color:     COLORS.customer.textSecondary,
    marginTop: 2,
  },
  statusRow: {
    flexDirection:  'row',
    alignItems:     'center',
    marginBottom:   12,
  },
  statusDot: {
    width:        10,
    height:       10,
    borderRadius: 5,
    marginRight:  8,
  },
  statusText: {
    fontSize:   15,
    fontWeight: '600',
    color:      COLORS.customer.textPrimary,
  },
  cancelButton: {
    borderWidth:  1,
    borderColor:  COLORS.customer.danger,
    padding:      12,
    borderRadius: 8,
    alignItems:   'center',
  },
  cancelText: {
    color:      COLORS.customer.danger,
    fontWeight: '600',
  },
})
