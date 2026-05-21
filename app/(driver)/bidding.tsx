// app/(driver)/bidding.tsx
// Tài xế xem thông tin chuyến và nhập báo giá

import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { showAlert } from '../../src/components/GlobalAlert'
import { useLocalSearchParams, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { auth, rtdb } from '../../src/services/firebase'
import { hasEnoughODC } from '../../src/services/odc'
import { useODCBalance } from '../../src/hooks/useODCBalance'
import { useDriverInfo } from '../../src/hooks/useDriverInfo'
import { maskPhone } from '../../src/utils/format'
import { COLORS } from '../../src/constants'
import type { TripQuote } from '../../src/types'

export default function BiddingScreen() {
  const { t } = useTranslation()
  const {
    tripId,
    estimatedKm,
    vehicleType,
    pickupGeohash,
    dropGeohash,
    customerPhone,
  } = useLocalSearchParams<{
    tripId:        string
    estimatedKm:   string
    vehicleType:   string
    pickupGeohash: string
    dropGeohash:   string
    customerPhone: string
  }>()

  const { driverInfo } = useDriverInfo()
  const { balance }    = useODCBalance(driverInfo?.stellarWallet ?? '')

  const [price,     setPrice]     = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    const quotedPrice = parseInt(price, 10)
    if (!quotedPrice || quotedPrice <= 0) {
      showAlert(t('common.error'), t('error.unknown'))
      return
    }
    if (!hasEnoughODC(quotedPrice, balance)) {
      showAlert(t('common.error'), t('error.insufficientODC'))
      return
    }
    if (!driverInfo || !auth.currentUser) return

    setSubmitting(true)
    try {
      const quote: TripQuote = {
        driverUid:    driverInfo.uid,
        driverName:   driverInfo.name,
        vehicleBrand: driverInfo.vehicleBrand,
        vehicleColor: driverInfo.vehicleColor ?? '',
        licensePlate: driverInfo.licensePlate,
        avatarUrl:    driverInfo.avatarUrl,
        rating:       driverInfo.rating,
        ratingCount:  driverInfo.ratingCount,
        quotedPrice,
        createdAt:    Date.now(),
      }
      await rtdb.set(`trips/${tripId}/quotes/${driverInfo.uid}`, quote)
      router.back()
    } catch {
      showAlert(t('common.error'), t('error.serverError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={22} color={COLORS.driver.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('online.newTrip')}</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Row label={t('online.distance')} value={`${estimatedKm} km`} />
          <Row label={t('trip.vehicleType')} value={vehicleType ?? ''} />
          <Row label={t('online.customer')} value={maskPhone(customerPhone ?? '')} />
          <Row label={t('online.odcBalance')} value={`${balance.toFixed(2)} ODC`} />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('online.priceLabel')}</Text>
          <TextInput
            style={styles.input}
            value={price}
            onChangeText={setPrice}
            keyboardType="numeric"
            placeholder="VD: 50000"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color="#FFF" />
            : <Text style={styles.buttonText}>{t('online.sendQuote')}</Text>}
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Row({ label, value }: { label: string; value: string }) {
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
  },
  topBar: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: 12,
    paddingVertical:   10,
  },
  backBtn: {
    width:           36,
    height:          36,
    borderRadius:    18,
    backgroundColor: '#fff',
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     COLORS.driver.primary,
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.08,
    shadowRadius:    4,
    elevation:       2,
    marginRight:     10,
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize:   20,
    fontWeight: '700',
    color:      COLORS.driver.textPrimary,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius:    12,
    padding:         16,
    marginBottom:    20,
    elevation:       2,
  },
  row: {
    flexDirection:  'row',
    justifyContent: 'space-between',
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
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize:     14,
    fontWeight:   '600',
    color:        COLORS.driver.textPrimary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth:     1,
    borderColor:     '#D1D5DB',
    borderRadius:    8,
    padding:         12,
    fontSize:        16,
    color:           '#0F172A',
  },
  button: {
    backgroundColor: COLORS.driver.primary,
    paddingVertical: 14,
    borderRadius:    10,
    alignItems:      'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color:      '#FFFFFF',
    fontSize:   16,
    fontWeight: '700',
  },
})
