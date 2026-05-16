// app/(customer)/home.tsx
// Màn hình đặt xe: chọn điểm đón, điểm đến, loại xe

import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { useTranslation } from 'react-i18next'
import { rtdb } from '../../src/services/firebase'
import { notifyDrivers } from '../../src/services/cloudflare'
import { getRouteDistanceKm, getCurrentLocation, geocodeAddress, geohashForQuery } from '../../src/services/location'
import { isOnWifi } from '../../src/services/network'
import NetworkAlert from '../../src/components/NetworkAlert'
import { SecureStoreKey, CustomerInfo, VehicleType } from '../../src/types'
import { nanoid } from '../../src/utils/nanoid'

const VEHICLE_TYPES: VehicleType[] = ['motorbike', 'car4', 'car7', 'pickup']

export default function CustomerHomeScreen() {
  const { t } = useTranslation()

  const [pickupText,  setPickupText]  = useState('')
  const [destText,    setDestText]    = useState('')
  const [vehicleType, setVehicleType] = useState<VehicleType>('motorbike')
  const [loading,     setLoading]     = useState(false)
  const [showWifi,    setShowWifi]    = useState(false)

  async function handleFindDriver() {
    if (!pickupText.trim() || !destText.trim()) {
      Alert.alert(t('common.error'), 'Vui lòng nhập điểm đón và điểm đến')
      return
    }

    const onWifi = await isOnWifi()
    if (onWifi) { setShowWifi(true); return }

    setLoading(true)
    try {
      const raw = await SecureStore.getItemAsync(SecureStoreKey.CUSTOMER_INFO)
      if (!raw) { router.replace('/role-select'); return }
      const info: CustomerInfo = JSON.parse(raw)

      const pickup = await geocodeAddress(pickupText)
      const destination = await geocodeAddress(destText)
      const pickupGeohash = geohashForQuery(pickup.lat, pickup.lng)
      const dropGeohash = geohashForQuery(destination.lat, destination.lng)
      const distKm = await getRouteDistanceKm(pickup.lat, pickup.lng, destination.lat, destination.lng)

      const tripId = nanoid()

      // Tạo trip trong Realtime DB
      await rtdb.set(`trips/${tripId}/info`, {
        customerPhone:  info.phone,
        pickupGeohash:  pickupGeohash,
        dropGeohash:    dropGeohash,
        vehicleType,
        estimatedKm:    Math.max(1, Math.round(distKm * 10) / 10),
        createdAt:      Date.now(),
        status:         'waiting',
      })

      // Gọi Worker notify tài xế gần
      await notifyDrivers(tripId, pickupGeohash, vehicleType)

      // Chuyển sang màn hình chờ báo giá
      router.push({ pathname: '/(customer)/waiting', params: { tripId, geohash: pickupGeohash } })
    } catch (e: unknown) {
      Alert.alert(t('common.error'), (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <NetworkAlert visible={showWifi} onDismiss={() => setShowWifi(false)} />

      <Text style={styles.title}>{t('trip.title')}</Text>

      <TextInput
        style={styles.input}
        placeholder={t('trip.pickupPlaceholder')}
        value={pickupText}
        onChangeText={setPickupText}
      />

      <TextInput
        style={styles.input}
        placeholder={t('trip.destPlaceholder')}
        value={destText}
        onChangeText={setDestText}
      />

      <Text style={styles.label}>{t('trip.vehicleType')}</Text>
      <View style={styles.vehicleRow}>
        {VEHICLE_TYPES.map((vt) => (
          <TouchableOpacity
            key={vt}
            style={[styles.vehicleBtn, vehicleType === vt && styles.vehicleBtnActive]}
            onPress={() => setVehicleType(vt)}
          >
            <Text style={[styles.vehicleBtnText, vehicleType === vt && { color: '#fff' }]}>
              {t(`register.${vt}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.btn} onPress={handleFindDriver} disabled={loading}>
        <Text style={styles.btnText}>{loading ? t('common.loading') : t('trip.findDriver')}</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container:        { flex: 1, padding: 24, backgroundColor: '#F8FAFC' },
  title:            { fontSize: 24, fontWeight: '700', color: '#0F172A', marginBottom: 24 },
  label:            { fontSize: 14, fontWeight: '600', color: '#0F172A', marginBottom: 8 },
  input:            {
    height: 52, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12,
    paddingHorizontal: 16, fontSize: 16, backgroundColor: '#fff', marginBottom: 16,
  },
  vehicleRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  vehicleBtn:       { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#1A56DB' },
  vehicleBtnActive: { backgroundColor: '#1A56DB' },
  vehicleBtnText:   { color: '#1A56DB', fontWeight: '500' },
  btn:              {
    height: 56, backgroundColor: '#1A56DB', borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  btnText:          { color: '#fff', fontSize: 18, fontWeight: '600' },
})
