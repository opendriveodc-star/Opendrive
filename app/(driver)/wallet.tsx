// app/(driver)/wallet.tsx

import React, { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  Linking, ScrollView, StatusBar,
} from 'react-native'
import { showAlert } from '../../src/components/GlobalAlert'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { getDriverInfo } from '../../src/utils/storage'
import { useODCBalance } from '../../src/hooks/useODCBalance'
import { shortenHash } from '../../src/utils/format'
import { STELLAR } from '../../src/constants'
import type { DriverInfo } from '../../src/types'

const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'

export default function WalletScreen() {
  const { t } = useTranslation()
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null)

  useEffect(() => { getDriverInfo().then(setDriverInfo) }, [])

  const { balance, loading, refresh } = useODCBalance(driverInfo?.stellarWallet ?? '')

  async function copyAddress() {
    if (!driverInfo?.stellarWallet) return
    await Clipboard.setStringAsync(driverInfo.stellarWallet)
    showAlert(t('common.success'), t('settings.copied'))
  }

  function openExplorer() {
    if (!driverInfo?.stellarWallet) return
    const base = STELLAR.NETWORK === 'testnet'
      ? 'https://stellar.expert/explorer/testnet/account'
      : 'https://stellar.expert/explorer/public/account'
    Linking.openURL(`${base}/${driverInfo.stellarWallet}`)
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F9FD" />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={BRAND} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>{t('nav.wallet')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Balance card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceIcon}>
            <Ionicons name="wallet-outline" size={28} color="#fff" />
          </View>
          <Text style={styles.balanceLabel}>{t('common.balance')}</Text>
          <Text style={styles.balanceAmount}>
            {loading ? '—' : balance.toFixed(2)}
          </Text>
          <Text style={styles.balanceCurrency}>ODC</Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={refresh}>
            <Ionicons name="refresh-outline" size={16} color={BRAND} />
            <Text style={styles.refreshBtnText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>

        {/* Địa chỉ ví */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('mining.walletAddress')}</Text>
          <View style={styles.addressRow}>
            <Text style={styles.addressText} numberOfLines={1}>
              {driverInfo ? shortenHash(driverInfo.stellarWallet, 8) : '—'}
            </Text>
            <TouchableOpacity style={styles.copyBtn} onPress={copyAddress}>
              <Ionicons name="copy-outline" size={16} color={BRAND} />
              <Text style={styles.copyBtnText}>{t('settings.copyCode')}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.explorerBtn} onPress={openExplorer}>
            <Ionicons name="open-outline" size={15} color="#2563EB" />
            <Text style={styles.explorerBtnText}>{t('history.viewOnChain')}</Text>
          </TouchableOpacity>
        </View>

        {/* Lịch sử giao dịch */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('history.txTitle')}</Text>
          <View style={styles.emptyWrap}>
            <Ionicons name="receipt-outline" size={36} color="#CBD5E1" />
            <Text style={styles.emptyText}>{t('history.txEmpty')}</Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#F7F9FD' },
  topBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: BRAND, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  topTitle:  { fontSize: 17, fontWeight: '700', color: BRAND },
  content:   { padding: 16, paddingBottom: 48 },
  balanceCard: {
    backgroundColor: BRAND, borderRadius: 18, padding: 24,
    alignItems: 'center', marginBottom: 16,
    shadowColor: BRAND, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 8,
  },
  balanceIcon:   { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  balanceLabel:  { fontSize: 16, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  balanceAmount: { fontSize: 48, fontWeight: '800', color: '#fff', lineHeight: 56 },
  balanceCurrency: { fontSize: 22, fontWeight: '700', color: 'rgba(255,255,255,0.85)', marginBottom: 16 },
  refreshBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  refreshBtnText: { fontSize: 13, fontWeight: '600', color: BRAND },
  card:      { backgroundColor: '#fff', borderRadius: 14, padding: 16, elevation: 3, marginBottom: 16, shadowColor: BRAND, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#1E293B', marginBottom: 12 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  addressText: { flex: 1, fontSize: 13, color: '#475569', fontFamily: 'monospace', backgroundColor: '#F8FAFC', padding: 8, borderRadius: 8 },
  copyBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND_LIGHT, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  copyBtnText: { fontSize: 13, fontWeight: '600', color: BRAND },
  explorerBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  explorerBtnText: { fontSize: 13, color: '#2563EB', fontWeight: '600' },
  emptyWrap:  { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText:  { fontSize: 14, color: '#94A3B8' },
})
