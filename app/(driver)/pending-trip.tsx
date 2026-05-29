// app/(driver)/pending-trip.tsx
// Màn hình khi app bị tắt đột ngột trong lúc chạy chuyến

import React, { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { showAlert } from '../../src/components/GlobalAlert'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { recordTrip } from '../../src/services/cloudflare'
import { updateDriverStatus, setDriverPendingTrip } from '../../src/services/firestore'
import { getPendingTrip, clearPendingTrip, getDriverInfo, getEncryptedKey } from '../../src/utils/storage'
import { encodeMemo } from '../../src/services/odc'
import { rtdb } from '../../src/services/firebase'
import type { PendingTrip, DriverInfo, TripRealtimeInfo } from '../../src/types'

const BRAND        = '#1A2E5E'
const AMBER        = '#D97706'
const AMBER_LIGHT  = '#FFFBEB'
const AMBER_BORDER = '#FDE68A'

export default function PendingTripScreen() {
  const { t } = useTranslation()
  const [pendingTrip,   setPendingTrip]   = useState<PendingTrip | null>(null)
  const [driverInfo,    setDriverInfo]    = useState<DriverInfo | null>(null)
  const [pickupAddress, setPickupAddress] = useState('')
  const [destAddress,   setDestAddress]   = useState('')
  const [completing,    setCompleting]    = useState(false)

  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 1000, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])

  useEffect(() => {
    Promise.all([getPendingTrip(), getDriverInfo()]).then(async ([trip, info]) => {
      setPendingTrip(trip)
      setDriverInfo(info)
      if (trip?.tripId) {
        try {
          const rtdbInfo = await rtdb.get<TripRealtimeInfo>(`trips/${trip.tripId}/info`)
          if (rtdbInfo?.pickupAddress) setPickupAddress(rtdbInfo.pickupAddress)
          if (rtdbInfo?.destAddress)   setDestAddress(rtdbInfo.destAddress)
        } catch {}
      }
    })
  }, [])

  async function handleComplete() {
    if (!pendingTrip || !driverInfo) return
    setCompleting(true)
    try {
      const encryptedPrivateKey = await getEncryptedKey()
      if (!encryptedPrivateKey) throw new Error('No encrypted key')

      const memo27bytes = encodeMemo(
        driverInfo.phone,
        pendingTrip.customerPhone,
        pendingTrip.pickupGeohash,
        pendingTrip.dropGeohash,
        pendingTrip.rating ?? 3,
      )

      await recordTrip({
        driverUid: driverInfo.uid,
        rating:    pendingTrip.rating ?? 3,
        tripPrice: pendingTrip.tripPrice,
        memo27bytes,
        isCancelled: false,
        encryptedPrivateKey,
      })

      await clearPendingTrip()
      setDriverPendingTrip(driverInfo.uid, false).catch(() => {})
      await updateDriverStatus(driverInfo.uid, 'offline')
      router.replace('/(driver)/home')
    } catch {
      setCompleting(false)
      showAlert(t('common.error'), t('error.serverError'))
    }
  }

  if (!pendingTrip) {
    return (
      <View style={s.fullCenter}>
        <ActivityIndicator size="large" color={BRAND} />
      </View>
    )
  }

  const tripIdShort    = pendingTrip.tripId.slice(0, 8).toUpperCase()
  const priceFormatted = pendingTrip.tripPrice.toLocaleString('vi-VN') + ' đ'

  let startedText = ''
  if (pendingTrip.startedAt) {
    const d = new Date(pendingTrip.startedAt)
    startedText = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.root} showsVerticalScrollIndicator={false}>

        {/* Icon section */}
        <View style={s.iconSection}>
          <Animated.View style={[s.glow, { transform: [{ scale: pulse }] }]} />
          <View style={s.iconCircle}>
            <Ionicons name="alert-circle" size={40} color="#fff" />
          </View>
        </View>

        <Text style={s.title}>{t('pending.title')}</Text>
        <Text style={s.subtitle}>{t('pending.message')}</Text>

        {/* Warning chip */}
        <View style={s.reasonRow}>
          <Ionicons name="warning-outline" size={14} color={AMBER} />
          <Text style={s.reasonText}>Dữ liệu chuyến đang chờ ghi lên blockchain</Text>
        </View>

        {/* Trip info card */}
        <View style={s.card}>
          <Text style={s.cardHeader}>CHI TIẾT CHUYẾN ĐI</Text>

          <CardRow icon="pricetag-outline" label="Mã chuyến"   value={`#${tripIdShort}`} />
          <View style={s.divRow} />
          <CardRow icon="person-outline"   label="Khách hàng"  value={`***${pendingTrip.customerPhone.slice(-3)}`} />
          {!!startedText && (
            <>
              <View style={s.divRow} />
              <CardRow icon="time-outline" label="Bắt đầu lúc" value={startedText} />
            </>
          )}
          {!!pickupAddress && (
            <>
              <View style={s.divRow} />
              <CardRow icon="location-outline" label="Điểm đón" value={pickupAddress} />
            </>
          )}
          {!!destAddress && (
            <>
              <View style={s.divRow} />
              <CardRow icon="flag-outline" label="Điểm đến" value={destAddress} />
            </>
          )}
          <View style={s.divRow} />
          <CardRow icon="cash-outline" label="Giá tiền" value={priceFormatted} highlight />
        </View>

        <Text style={s.note}>Sau khi ghi blockchain, bạn sẽ được chuyển về trang chủ.</Text>

        <TouchableOpacity
          style={[s.btn, completing && s.btnDisabled]}
          onPress={handleComplete}
          disabled={completing}
          activeOpacity={0.85}
        >
          {completing
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={s.btnText}>{t('pending.completing')}</Text>
              </>
          }
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  )
}

function CardRow({
  icon, label, value, highlight,
}: { icon: string; label: string; value: string; highlight?: boolean }) {
  return (
    <View style={s.cardRow}>
      <View style={s.cardRowLeft}>
        <Ionicons name={icon as any} size={13} color="rgba(255,255,255,0.5)" />
        <Text style={s.cardRowLabel}>{label}</Text>
      </View>
      <Text style={[s.cardRowValue, highlight && s.cardRowHighlight]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: '#fff' },
  root:       { paddingHorizontal: 28, paddingTop: 36, paddingBottom: 32 },
  fullCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Icon
  iconSection: { alignSelf: 'center', marginBottom: 24 },
  glow: {
    position: 'absolute', alignSelf: 'center',
    width: 116, height: 116, borderRadius: 58,
    backgroundColor: AMBER_LIGHT,
    top: -14, left: -14,
  },
  iconCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: AMBER,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: AMBER,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 10,
  },

  title:    { fontSize: 22, fontWeight: '800', color: BRAND, textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginBottom: 20, lineHeight: 20 },

  // Warning chip
  reasonRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: AMBER_LIGHT, borderWidth: 1, borderColor: AMBER_BORDER,
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 24,
  },
  reasonText: { fontSize: 13, color: '#92400E', fontWeight: '600', flex: 1 },

  // Card
  card: {
    backgroundColor: BRAND, borderRadius: 22,
    paddingVertical: 20, paddingHorizontal: 18,
    marginBottom: 20,
    shadowColor: BRAND, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22, shadowRadius: 20, elevation: 8,
  },
  cardHeader: {
    fontSize: 10, color: 'rgba(255,255,255,0.5)',
    fontWeight: '700', letterSpacing: 1.5, marginBottom: 16,
  },
  divRow:       { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 10 },
  cardRow:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  cardRowLeft:  { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 0.42 },
  cardRowLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  cardRowValue: { fontSize: 13, color: '#fff', fontWeight: '600', flex: 0.58, textAlign: 'right' },
  cardRowHighlight: { fontSize: 16, fontWeight: '800', color: '#FCD34D' },

  note: { fontSize: 12, color: '#94A3B8', textAlign: 'center', lineHeight: 20, marginBottom: 24 },

  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: BRAND, height: 56, borderRadius: 16,
    shadowColor: BRAND, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 10, elevation: 6,
  },
  btnDisabled: { opacity: 0.5 },
  btnText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
})
