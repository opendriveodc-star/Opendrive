// app/(auth)/register.tsx
// Đăng ký tài xế mới: nhập thông tin → tạo ví Stellar → ghi Firestore

import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { useTranslation } from 'react-i18next'
import { auth } from '../../src/services/firebase'
import { createDriver } from '../../src/services/firestore'
import { createWallet } from '../../src/services/cloudflare'
import { SecureStoreKey, VehicleType, DriverInfo } from '../../src/types'
import { APP } from '../../src/constants'

const VEHICLE_TYPES: VehicleType[] = ['motorbike', 'car4', 'car7', 'pickup']

export default function RegisterScreen() {
  const { t } = useTranslation()

  const [name,         setName]         = useState('')
  const [vehicleType,  setVehicleType]  = useState<VehicleType>('motorbike')
  const [vehicleBrand, setVehicleBrand] = useState('')
  const [licensePlate, setLicensePlate] = useState('')
  const [referralCode, setReferralCode] = useState('')
  const [termsChecked, setTermsChecked] = useState(false)
  const [loading,      setLoading]      = useState(false)

  async function handleRegister() {
    if (!name.trim() || !vehicleBrand.trim() || !licensePlate.trim()) {
      Alert.alert(t('common.error'), 'Vui lòng điền đầy đủ thông tin')
      return
    }
    if (!termsChecked) {
      Alert.alert(t('common.error'), t('terms.mustAgree'))
      return
    }

    setLoading(true)
    try {
      const user = auth.currentUser
      if (!user) throw new Error('Not authenticated')

      // Bước 3: Gọi Worker tạo ví Stellar
      const { stellarWallet, encryptedPrivateKey } = await createWallet(user.uid)

      // Bước 4: Lưu SecureStore
      const driverInfo: DriverInfo = {
        uid:           user.uid,
        phone:         user.phoneNumber ?? '',
        name:          name.trim(),
        vehicleType,
        vehicleBrand:  vehicleBrand.trim(),
        licensePlate:  licensePlate.trim().toUpperCase(),
        stellarWallet,
        status:        'offline',
        rating:        0,
        ratingCount:   0,
        firstTripDone: false,
        referralCount: 0,
        termsVersion:  APP.TERMS_VERSION,
      }

      await SecureStore.setItemAsync(SecureStoreKey.DRIVER_INFO,          JSON.stringify(driverInfo))
      await SecureStore.setItemAsync(SecureStoreKey.DRIVER_ENCRYPTED_KEY, encryptedPrivateKey)
      await SecureStore.setItemAsync(SecureStoreKey.USER_ROLE,            'driver')

      // Bước 5: Ghi Firestore 1 lần duy nhất (Security Rules chỉ cho phép 1 lần)
      await createDriver(user.uid, {
        uid:                 user.uid,
        phone:               user.phoneNumber ?? '',
        name:                name.trim(),
        vehicleType,
        vehicleBrand:        vehicleBrand.trim(),
        licensePlate:        licensePlate.trim().toUpperCase(),
        stellarWallet,
        encryptedPrivateKey,
        geohash:             '',
        status:              'offline',
        rating:              0,
        ratingCount:         0,
        firstTripDone:       false,
        referralCount:       0,
        referredBy:          referralCode.trim() || null,
        random_id:           Math.floor(Math.random() * 6),
        termsVersion:        APP.TERMS_VERSION,
      })

      router.replace('/(driver)/home')
    } catch (e: unknown) {
      Alert.alert(t('common.error'), (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('register.title')}</Text>

      <TextInput
        style={styles.input}
        placeholder={t('register.namePlaceholder')}
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.label}>{t('register.vehicleType')}</Text>
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

      <TextInput
        style={styles.input}
        placeholder={t('register.brandPlaceholder')}
        value={vehicleBrand}
        onChangeText={setVehicleBrand}
      />

      <TextInput
        style={styles.input}
        placeholder={t('register.platePlaceholder')}
        value={licensePlate}
        onChangeText={setLicensePlate}
        autoCapitalize="characters"
      />

      <TextInput
        style={styles.input}
        placeholder={t('register.referralPlaceholder')}
        value={referralCode}
        onChangeText={setReferralCode}
      />

      <TouchableOpacity style={styles.checkRow} onPress={() => setTermsChecked(!termsChecked)}>
        <View style={[styles.checkbox, termsChecked && styles.checkboxChecked]}>
          {termsChecked && <Text style={{ color: '#fff' }}>✓</Text>}
        </View>
        <Text style={styles.checkLabel}>
          {t('terms.readAndAgree')}{' '}
          <Text style={{ color: '#1A56DB' }} onPress={() => router.push('/(auth)/terms')}>
            {t('terms.termsLink')}
          </Text>
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btn} onPress={handleRegister} disabled={loading}>
        <Text style={styles.btnText}>{loading ? t('register.creating') : t('common.continue')}</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container:          { padding: 24, backgroundColor: '#F8FAFC', flexGrow: 1 },
  title:              { fontSize: 24, fontWeight: '700', color: '#14532D', marginBottom: 24 },
  label:              { fontSize: 14, fontWeight: '600', color: '#14532D', marginBottom: 8 },
  input:              {
    height: 52, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12,
    paddingHorizontal: 16, fontSize: 16, backgroundColor: '#fff', marginBottom: 16,
  },
  vehicleRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  vehicleBtn:         {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: '#15803D',
  },
  vehicleBtnActive:   { backgroundColor: '#15803D' },
  vehicleBtnText:     { color: '#15803D', fontWeight: '500' },
  checkRow:           { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 12 },
  checkbox:           {
    width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: '#15803D',
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxChecked:    { backgroundColor: '#15803D' },
  checkLabel:         { flex: 1, fontSize: 14, color: '#14532D' },
  btn:                {
    height: 56, backgroundColor: '#15803D', borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  btnText:            { color: '#fff', fontSize: 18, fontWeight: '600' },
})
