// app/(driver)/wallet.tsx
// Màn hình ví ODC tài xế

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useTranslation } from 'react-i18next'
import { getDriverInfo } from '../../src/utils/storage'
import { useODCBalance } from '../../src/hooks/useODCBalance'
import { shortenHash, formatODC } from '../../src/utils/format'
import { COLORS, STELLAR } from '../../src/constants'
import type { DriverInfo } from '../../src/types'

export default function WalletScreen() {
  const { t } = useTranslation()
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null)

  useEffect(() => {
    getDriverInfo().then(setDriverInfo)
  }, [])

  const issuerAddress = process.env.EXPO_PUBLIC_STELLAR_ISSUER_ADDRESS ?? ''
  const { balance, loading, refresh } = useODCBalance(
    driverInfo?.stellarWallet ?? '',
    issuerAddress,
  )

  async function copyAddress() {
    if (!driverInfo?.stellarWallet) return
    await Clipboard.setStringAsync(driverInfo.stellarWallet)
    Alert.alert(t('common.success'), t('settings.copied'))
  }

  function openExplorer() {
    if (!driverInfo?.stellarWallet) return
    const base = STELLAR.NETWORK === 'testnet'
      ? 'https://stellar.expert/explorer/testnet/account'
      : 'https://stellar.expert/explorer/public/account'
    Linking.openURL(`${base}/${driverInfo.stellarWallet}`)
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('settings.wallet')}</Text>

      <View style={styles.card}>
        <Text style={styles.walletLabel}>{t('mining.walletAddress')}</Text>
        <Text style={styles.walletAddress}>
          {driverInfo ? shortenHash(driverInfo.stellarWallet, 6) : '—'}
        </Text>

        <Text style={styles.balanceLabel}>{t('common.balance')}</Text>
        <Text style={styles.balance}>
          {loading ? t('common.loading') : formatODC(balance)}
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.copyButton} onPress={copyAddress}>
            <Text style={styles.copyButtonText}>{t('settings.copyCode')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.refreshButton} onPress={refresh}>
            <Text style={styles.refreshButtonText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.explorerButton} onPress={openExplorer}>
          <Text style={styles.explorerButtonText}>{t('history.viewOnChain')}</Text>
        </TouchableOpacity>
      </View>

      {/* TODO: Hiển thị 5 giao dịch gần nhất từ Stellar Horizon */}
      <View style={styles.txSection}>
        <Text style={styles.txTitle}>{t('history.title')}</Text>
        <Text style={styles.txEmpty}>{t('history.empty')}</Text>
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
    marginBottom:    20,
  },
  walletLabel: {
    fontSize:     12,
    color:        '#64748B',
    marginBottom: 4,
  },
  walletAddress: {
    fontSize:     14,
    fontFamily:   'monospace',
    color:        '#0F172A',
    marginBottom: 16,
  },
  balanceLabel: {
    fontSize:     12,
    color:        '#64748B',
    marginBottom: 4,
  },
  balance: {
    fontSize:     32,
    fontWeight:   '800',
    color:        COLORS.driver.primary,
    marginBottom: 20,
  },
  actions: {
    flexDirection:  'row',
    gap:            12,
    marginBottom:   12,
  },
  copyButton: {
    flex:            1,
    backgroundColor: COLORS.driver.primary,
    padding:         12,
    borderRadius:    8,
    alignItems:      'center',
  },
  copyButtonText: {
    color:      '#FFFFFF',
    fontWeight: '600',
  },
  refreshButton: {
    flex:        1,
    borderWidth: 1,
    borderColor: COLORS.driver.primary,
    padding:     12,
    borderRadius: 8,
    alignItems:  'center',
  },
  refreshButtonText: {
    color:      COLORS.driver.primary,
    fontWeight: '600',
  },
  explorerButton: {
    borderWidth:  1,
    borderColor:  '#D1D5DB',
    padding:      12,
    borderRadius: 8,
    alignItems:   'center',
  },
  explorerButtonText: {
    color:      '#2563EB',
    fontWeight: '600',
  },
  txSection: {
    backgroundColor: '#FFFFFF',
    borderRadius:    12,
    padding:         16,
    elevation:       2,
  },
  txTitle: {
    fontSize:     16,
    fontWeight:   '700',
    color:        COLORS.driver.textPrimary,
    marginBottom: 12,
  },
  txEmpty: {
    fontSize:  14,
    color:     '#9CA3AF',
    textAlign: 'center',
  },
})
