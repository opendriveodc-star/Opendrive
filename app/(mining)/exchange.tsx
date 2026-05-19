// app/(mining)/exchange.tsx
// Màn hình đổi điểm lấy ODC

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { showAlert } from '../../src/components/GlobalAlert'
import { useTranslation } from 'react-i18next'
import * as SecureStore from 'expo-secure-store'
import { getMinerInfo } from '../../src/utils/storage'
import { exchangePoints } from '../../src/services/cloudflare'
import { COLORS, ODC } from '../../src/constants'
import { SecureStoreKey } from '../../src/types'
import type { MinerInfo } from '../../src/types'

export default function ExchangeScreen() {
  const { t } = useTranslation()
  const [minerInfo,   setMinerInfo]   = useState<MinerInfo | null>(null)
  const [walletAddr,  setWalletAddr]  = useState('')
  const [pointsInput, setPointsInput] = useState('')

  useEffect(() => {
    getMinerInfo().then(setMinerInfo)
  }, [])

  const points = parseInt(pointsInput, 10) || 0
  const odcReceived = Math.max(0, points - ODC.MINING_FEE)

  function validateWallet(addr: string): boolean {
    return addr.startsWith('G') && addr.length === 56
  }

  function handleConfirm() {
    if (!validateWallet(walletAddr)) {
      showAlert(t('common.error'), t('error.walletNotFound'))
      return
    }
    if (points < ODC.MIN_EXCHANGE_POINTS) {
      showAlert(t('common.error'), t('mining.exchangeMin'))
      return
    }
    if (!minerInfo || points > minerInfo.points) {
      showAlert(t('common.error'), t('error.insufficientODC'))
      return
    }

    showAlert(
      t('common.confirm'),
      t('mining.exchangeConfirm', { points, odc: odcReceived.toFixed(2) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: async () => {
            try {
              const result = await exchangePoints({
                uid:           minerInfo!.uid,
                points,
                walletAddress: walletAddr,
              })

              // Cập nhật local state sau khi Worker xác nhận
              const updatedInfo: MinerInfo = {
                ...minerInfo!,
                points: minerInfo!.points - points,
              }
              await SecureStore.setItemAsync(SecureStoreKey.MINER_INFO, JSON.stringify(updatedInfo))
              setMinerInfo(updatedInfo)
              setPointsInput('')
              setWalletAddr('')

              showAlert(
                t('common.success'),
                t('mining.exchangeSuccess', { odc: result.odcSent.toFixed(2), txHash: result.txHash.slice(0, 8) + '…' }),
              )
            } catch (err: unknown) {
              showAlert(t('common.error'), (err as Error).message)
            }
          },
        },
      ]
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('mining.exchange')}</Text>

        <View style={styles.card}>
          <Text style={styles.pointsLabel}>{t('mining.points', { points: minerInfo?.points ?? 0 })}</Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t('mining.walletAddress')}</Text>
          <TextInput
            style={styles.input}
            value={walletAddr}
            onChangeText={setWalletAddr}
            placeholder={t('mining.walletPlaceholder')}
            placeholderTextColor="#9CA3AF"
            autoCapitalize="characters"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t('mining.exchangeMin')}</Text>
          <TextInput
            style={styles.input}
            value={pointsInput}
            onChangeText={setPointsInput}
            keyboardType="numeric"
            placeholder={`>= ${ODC.MIN_EXCHANGE_POINTS}`}
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {points >= ODC.MIN_EXCHANGE_POINTS && (
          <View style={styles.preview}>
            <Text style={styles.previewText}>
              {t('mining.exchangeConfirm', { points, odc: odcReceived.toFixed(2) })}
            </Text>
            <Text style={styles.feeText}>{t('mining.exchangeFee')}</Text>
          </View>
        )}

        <TouchableOpacity style={styles.button} onPress={handleConfirm}>
          <Text style={styles.buttonText}>{t('common.confirm')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: COLORS.mining.background,
  },
  content: {
    padding:       16,
    paddingBottom: 32,
  },
  title: {
    fontSize:     22,
    fontWeight:   '700',
    color:        COLORS.mining.textPrimary,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius:    12,
    padding:         16,
    elevation:       2,
    marginBottom:    20,
  },
  pointsLabel: {
    fontSize:   18,
    fontWeight: '700',
    color:      COLORS.mining.primary,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize:     13,
    fontWeight:   '600',
    color:        COLORS.mining.textPrimary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth:     1,
    borderColor:     '#D1D5DB',
    borderRadius:    8,
    padding:         12,
    fontSize:        15,
    color:           '#0F172A',
  },
  preview: {
    backgroundColor: '#CFFAFE',
    borderRadius:    8,
    padding:         12,
    marginBottom:    20,
  },
  previewText: {
    fontSize:     15,
    fontWeight:   '700',
    color:        COLORS.mining.textPrimary,
    marginBottom: 4,
  },
  feeText: {
    fontSize: 12,
    color:    '#64748B',
  },
  button: {
    backgroundColor: COLORS.mining.primary,
    padding:         14,
    borderRadius:    10,
    alignItems:      'center',
  },
  buttonText: {
    color:      '#FFFFFF',
    fontSize:   16,
    fontWeight: '700',
  },
})
