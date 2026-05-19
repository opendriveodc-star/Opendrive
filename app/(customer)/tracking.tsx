import React, { useEffect, useState, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { showAlert } from '../../src/components/GlobalAlert'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import MapView, { type MapViewHandle } from '../../src/components/MapView'
import { TRIP } from '../../src/constants'
import { createOfferConnection, closePeerConnection } from '../../src/services/webrtc'
import type {
  DCLocationMessage,
  DCStatusMessage,
  DCTripInfoMessage,
  DataChannelMessage,
} from '../../src/types'

const BRAND = '#1A2E5E'

type TripStatus = 'going_to_pickup' | 'arrived' | 'picked_up' | 'completed'

const STATUS_CONFIG: Record<TripStatus, { label: string; color: string; icon: string }> = {
  going_to_pickup: { label: 'trip.driverComing',  color: '#F59E0B', icon: 'navigate-outline'   },
  arrived:         { label: 'trip.driverArrived', color: '#10B981', icon: 'location-outline'    },
  picked_up:       { label: 'trip.inProgress',    color: BRAND,     icon: 'car-outline'         },
  completed:       { label: 'trip.completed',     color: '#10B981', icon: 'checkmark-circle-outline' },
}

export default function TrackingScreen() {
  const { t } = useTranslation()
  const { tripId } = useLocalSearchParams<{ tripId: string; driverUid: string }>()

  const [driverLat,  setDriverLat]  = useState<number>(10.7769)
  const [driverLng,  setDriverLng]  = useState<number>(106.7009)
  const [tripStatus, setTripStatus] = useState<TripStatus>('going_to_pickup')
  const [driverInfo, setDriverInfo] = useState<{ name: string; licensePlate: string; vehicleBrand: string } | null>(null)
  const [canCancel,  setCanCancel]  = useState(true)
  const [connected,  setConnected]  = useState(false)

  const startedAtRef = useRef<number>(Date.now())
  const bridgeRef    = useRef<any | null>(null)
  const mapRef       = useRef<MapViewHandle>(null)

  useEffect(() => {
    const checkGrace = setInterval(() => {
      if (Date.now() - startedAtRef.current > TRIP.GRACE_PERIOD_MINUTES * 60 * 1000) {
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
  }, [tripId])

  function handleDataChannelMessage(msg: DataChannelMessage) {
    if (msg.type === 'location') {
      const m = msg as DCLocationMessage
      setDriverLat(m.lat)
      setDriverLng(m.lng)
      mapRef.current?.updateDriverMarker(m.lat, m.lng)
    } else if (msg.type === 'status') {
      const m = msg as DCStatusMessage
      const status = m.status as TripStatus
      setTripStatus(status)
      if (status === 'completed') {
        router.replace({ pathname: '/(customer)/rating', params: { tripId: tripId ?? '' } })
      }
    } else if (msg.type === 'trip_info') {
      const m = msg as DCTripInfoMessage
      setDriverInfo({ name: m.driverName, licensePlate: m.licensePlate, vehicleBrand: m.vehicleBrand })
    }
  }

  function handleCancel() {
    showAlert(t('cancel.title'), t('cancel.confirm'), [
      { text: t('cancel.no'), style: 'cancel' },
      { text: t('cancel.yes'), style: 'destructive', onPress: () => router.replace('/(customer)/home') },
    ])
  }

  const statusCfg  = STATUS_CONFIG[tripStatus]
  const initials   = driverInfo?.name?.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase() ?? '?'

  return (
    <View style={styles.container}>
      {/* Map fills top */}
      <View style={styles.mapContainer}>
        <MapView ref={mapRef} lat={driverLat} lng={driverLng} />
      </View>

      {/* Bottom panel */}
      <SafeAreaView style={styles.panel} edges={['bottom']}>
        {/* Handle bar */}
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

        {/* Status row */}
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusCfg.color }]} />
          <Ionicons name={statusCfg.icon as any} size={16} color={statusCfg.color} style={{ marginRight: 6 }} />
          <Text style={[styles.statusText, { color: statusCfg.color }]}>{t(statusCfg.label)}</Text>
          <View style={{ flex: 1 }} />
          <View style={[styles.connBadge, { backgroundColor: connected ? '#DCFCE7' : '#FEF3C7' }]}>
            <View style={[styles.connDot, { backgroundColor: connected ? '#10B981' : '#F59E0B' }]} />
            <Text style={[styles.connText, { color: connected ? '#10B981' : '#F59E0B' }]}>
              {connected ? t('trip.connected') : t('trip.connecting')}
            </Text>
          </View>
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
    backgroundColor:     '#fff',
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    paddingHorizontal:    20,
    paddingTop:           12,
    paddingBottom:        8,
    elevation:            12,
    shadowColor:          '#000',
    shadowOpacity:        0.12,
    shadowRadius:         16,
    shadowOffset:         { width: 0, height: -4 },
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center', marginBottom: 16,
  },

  driverRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  avatar:      { width: 48, height: 48, borderRadius: 24, backgroundColor: BRAND, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText:  { color: '#fff', fontSize: 16, fontWeight: '700' },
  driverInfo:  { flex: 1 },
  driverName:  { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  driverMeta:  { fontSize: 13, color: '#64748B', marginTop: 2 },

  divider: { height: 1, backgroundColor: '#F1F5F9', marginBottom: 12 },

  statusRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  statusDot:  { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 14, fontWeight: '600' },
  connBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  connDot:    { width: 6, height: 6, borderRadius: 3 },
  connText:   { fontSize: 12, fontWeight: '600' },

  cancelBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#DC2626', borderRadius: 12, paddingVertical: 12, marginBottom: 4 },
  cancelText: { color: '#DC2626', fontWeight: '600', fontSize: 15 },
})
