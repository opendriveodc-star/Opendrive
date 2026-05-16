// app/(driver)/referral.tsx
// Màn hình giới thiệu tài xế

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
  Alert,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useTranslation } from 'react-i18next'
import { getDriverInfo } from '../../src/utils/storage'
import { COLORS, ODC } from '../../src/constants'
import type { DriverInfo } from '../../src/types'

export default function ReferralScreen() {
  const { t } = useTranslation()
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null)

  useEffect(() => {
    getDriverInfo().then(setDriverInfo)
  }, [])

  const referralCode = driverInfo?.phone ?? driverInfo?.uid ?? ''

  async function copyCode() {
    if (!referralCode) return
    await Clipboard.setStringAsync(referralCode)
    Alert.alert(t('common.success'), t('settings.copied'))
  }

  async function shareCode() {
    if (!referralCode) return
    try {
      await Share.share({
        message: `Dùng mã ${referralCode} để đăng ký OpenDrive và nhận ${ODC.SIGNUP_BONUS} ODC!`,
      })
    } catch {
      // người dùng hủy share
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('settings.referral')}</Text>

      <View style={styles.card}>
        <Text style={styles.codeLabel}>{t('settings.referralCode', { code: '' })}</Text>
        <Text style={styles.code}>{referralCode || '—'}</Text>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.button} onPress={copyCode}>
            <Text style={styles.buttonText}>{t('settings.copyCode')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.shareButton]} onPress={shareCode}>
            <Text style={styles.buttonText}>{t('common.confirm')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.statsCard}>
        <Text style={styles.statsLabel}>{t('settings.referral')}</Text>
        <Text style={styles.statsValue}>{driverInfo?.referralCount ?? 0}</Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>📣 Thưởng giới thiệu</Text>
        <Text style={styles.infoText}>
          Giới thiệu 1 tài xế mới = +{ODC.REFERRAL_BONUS} ODC khi họ hoàn thành chuyến đầu tiên.
        </Text>
        <Text style={styles.infoText}>
          Đăng ký mới = +{ODC.SIGNUP_BONUS} ODC cho người được giới thiệu.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: COLORS.driver.background,
    padding:         16,
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
    padding:         20,
    elevation:       2,
    marginBottom:    16,
    alignItems:      'center',
  },
  codeLabel: {
    fontSize:     13,
    color:        '#64748B',
    marginBottom: 8,
  },
  code: {
    fontSize:      24,
    fontWeight:    '800',
    color:         COLORS.driver.textPrimary,
    letterSpacing: 2,
    marginBottom:  20,
  },
  actions: {
    flexDirection: 'row',
    gap:           12,
    width:         '100%',
  },
  button: {
    flex:            1,
    backgroundColor: COLORS.driver.primary,
    padding:         12,
    borderRadius:    8,
    alignItems:      'center',
  },
  shareButton: {
    backgroundColor: COLORS.driver.secondary,
  },
  buttonText: {
    color:      '#FFFFFF',
    fontWeight: '600',
  },
  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius:    12,
    padding:         16,
    elevation:       2,
    marginBottom:    16,
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
  },
  statsLabel: {
    fontSize: 14,
    color:    '#64748B',
  },
  statsValue: {
    fontSize:   24,
    fontWeight: '800',
    color:      COLORS.driver.primary,
  },
  infoCard: {
    backgroundColor: '#F0FDF4',
    borderRadius:    12,
    padding:         16,
    borderWidth:     1,
    borderColor:     '#BBF7D0',
  },
  infoTitle: {
    fontSize:     15,
    fontWeight:   '700',
    color:        COLORS.driver.textPrimary,
    marginBottom: 8,
  },
  infoText: {
    fontSize:     13,
    color:        '#374151',
    lineHeight:   20,
    marginBottom: 4,
  },
})
