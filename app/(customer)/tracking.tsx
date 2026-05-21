// app/(customer)/tracking.tsx
// Hybrid: WebRTC DataChannel (5s timeout) → RTDB polling fallback

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
import { rtdb } from '../../src/services/firebase'
import type { DCLocationMessage, DCStatusMessage, DCTripInfoMessage, DataChannelMessage } from '../../src/types'

const BRAND = '#1A2E5E'
const WEBRTC_TIMEOUT_MS = 5_000

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
  const connectedRef    = useRef(false)
  const usingRtdbRef    = useRef(false)
  const bridgeRef       = useRef<any | null>(null)
  const webrtcTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const locationPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const statusPollRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const infoPollRef     = useRef<ReturnType<typeof setInterval> | null>(null)

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

  // WebRTC + fallback 5s
  useEffect(() => {
    if (!tripId) return
    let mounted = true

    async function initWebRTC() {
      try {
        const bridge = await createOfferConnection(
          tripId,
          handleDataChannelMessage,
          () => {
            if (!mounted) return
            connectedRef.current = true
            if (webrtcTimerRef.current) { clearTimeout(webrtcTimerRef.current); webrtcTimerRef.current = null }
          },
        )
        bridgeRef.current = bridge
      } catch {
        if (mounted) activateRtdb()
      }
    }

    initWebRTC()

    webrtcTimerRef.current = setTimeout(() => {
      if (!connectedRef.current) activateRtdb()
    }, WEBRTC_TIMEOUT_MS)

    return () => {
      mounted = false
      if (webrtcTimerRef.current) clearTimeout(webrtcTimerRef.current)
      clearRtdbPolls()
      bridgeRef.current?.stop()
      closePeerConnection(tripId)
    }
  }, [tripId])

  function activateRtdb() {
    if (usingRtdbRef.current || !tripId) return
    usingRtdbRef.current = true

    locationPollRef.current = setInterval(async () => {
      try {
        const loc = await rtdb.get<{ lat: number; lng: number }>(`trips/${tripId}/location`)
        if (loc?.lat != null) {
          setDriverLat(loc.lat)
          setDriverLng(loc.lng)
          mapRef.current?.updateDriverMarker(loc.lat, loc.lng)
          mapRef.current?.panTo(loc.lat, loc.lng)
        }
      } catch {}
    }, 3000)

    statusPollRef.current = setInterval(async () => {
      try {
        const status = await rtdb.get<string>(`trips/${tripId}/trip_status`)
        if (status === 'picked_up') setTripStatus('picked_up')
        if (status === 'completed' && !completedRef.current) {
          completedRef.current = true
          clearRtdbPolls()
          router.replace({ pathname: '/(customer)/rating', params: { tripId } })
        }
      } catch {}
    }, 3000)

    const tryGetTripInfo = async () => {
      try {
        const info = await rtdb.get<{ driverName: string; licensePlate: string; vehicleBrand: string }>(`trips/${tripId}/trip_info`)
        if (info?.driverName) {
          setDriverInfo({ name: info.driverName, licensePlate: info.licensePlate, vehicleBrand: info.vehicleBrand })
          if (infoPollRef.current) { clearInterval(infoPollRef.current); infoPollRef.current = null }
        }
      } catch {}
    }
    tryGetTripInfo()
    infoPollRef.current = setInterval(tryGetTripInfo, 5000)
  }

  function clearRtdbPolls() {
    if (locationPollRef.current) { clearInterval(locationPollRef.current); locationPollRef.current = null }
    if (statusPollRef.current)   { clearInterval(statusPollRef.current);   statusPollRef.current   = null }
    if (infoPollRef.current)     { clearInterval(infoPollRef.current);     infoPollRef.current     = null }
  }

  function handleDataChannelMessage(msg: DataChannelMessage) {
    if (msg.type === 'location') {
      const m = msg as DCLocationMessage
      setDriverLat(m.lat)
      setDriverLng(m.lng)
      mapRef.current?.updateDriverMarker(m.lat, m.lng)
      mapRef.current?.panTo(m.lat, m.lng)
    } else if (msg.type === 'status') {
      const m = msg as DCStatusMessage
      if (m.status === 'picked_up') setTripStatus('picked_up')
      if (m.status === 'completed' && !completedRef.current) {
        completedRef.current = true
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
