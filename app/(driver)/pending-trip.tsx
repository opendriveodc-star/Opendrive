// app/(driver)/pending-trip.tsx
// Màn hình khi app bị tắt đột ngột trong lúc chạy chuyến

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { showAlert } from '../../src/components/GlobalAlert'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { recordTrip } from '../../src/services/cloudflare'
import { updateDriverStatus } from '../../src/services/firestore'
import {
  getPendingTrip,
  clearPendingTrip,
  getDriverInfo,
  getEncryptedKey,
} from '../../src/utils/storage'
import { encodeMemo } from '../../src/services/odc'
import { COLORS } from '../../src/constants'
import type { PendingTrip, DriverInfo } from '../../src/types'

export default function PendingTripScreen() {
  const { t } = useTranslation()
  const [pendingTrip,  setPendingTrip]  = useState<PendingTrip | null>(null)
  const [driverInfo,   setDriverInfo]   = useState<DriverInfo | null>(null)
  const [completing,   setCompleting]   = useState(false)

  useEffect(() => {
    Promise.all([getPendingTrip(), getDriverInfo()]).then(([trip, info]) => {
      setPendingTrip(trip)
      setDriverInfo(info)
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
        driverUid:           driverInfo.uid,
        rating:              pendingTrip.rating ?? 3,
        tripPrice:           pendingTrip.tripPrice,
        memo27bytes,
        isCancelled:         false,
        encryptedPrivateKey,
      })

      await clearPendingTrip()
      await updateDriverStatus(driverInfo.uid, 'offline')
      router.replace('/(driver)/home')
    } catch (err) {
      showAlert(t('common.error'), t('error.serverError'))
    } finally {
      setCompleting(false)
    }
  }

  if (!pendingTrip) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.driver.primary} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('pending.title')}</Text>
      <Text style={styles.message}>{t('pending.message')}</Text>

      <View style={styles.card}>
        <InfoRow label={t('auth.enterPhone')} value={pendingTrip.customerPhone} />
        <InfoRow label={t('trip.price')}      value={`${pendingTrip.tripPrice.toLocaleString('vi-VN')}đ`} />
        <InfoRow label={t('trip.pickup')}     value={pendingTrip.pickupGeohash} />
      </View>

      <TouchableOpacity
        style={[styles.button, completing && styles.buttonDisabled]}
        onPress={handleComplete}
        disabled={completing}
      >
        {completing
          ? <ActivityIndicator color="#FFF" />
          : <Text style={styles.buttonText}>{t('pending.complete')}</Text>}
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
  title: {
    fontSize:     22,
    fontWeight:   '700',
    color:        COLORS.driver.textPrimary,
    marginBottom: 12,
  },
  message: {
    fontSize:     15,
    color:        '#374151',
    lineHeight:   22,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius:    12,
    padding:         16,
    elevation:       2,
    marginBottom:    24,
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
  button: {
    backgroundColor: COLORS.driver.primary,
    padding:         16,
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
