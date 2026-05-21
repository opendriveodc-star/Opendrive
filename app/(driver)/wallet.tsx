// app/(driver)/wallet.tsx

import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  Linking, ScrollView, StatusBar, ActivityIndicator,
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
const BRAND_MUTED = '#F0F4FB'
const PAGE_SIZE   = 20

interface PaymentRecord {
  id:        string
  hash:      string
  createdAt: string
  amount:    number
  incoming:  boolean
  partner:   string
  label:     string
}

function classifyPartner(address: string, label: string): string {
  if (address === STELLAR.TRANSACTION_ADDRESS) return 'Phí ghi chuyến'
  if (address === STELLAR.DISTRIBUTOR_ADDRESS)  return label === 'in' ? 'Thưởng từ hệ thống' : 'Phạt từ hệ thống'
  if (address === STELLAR.ISSUER_ADDRESS)       return 'Phát hành ODC'
  return address.slice(0, 6) + '...' + address.slice(-4)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

export default function WalletScreen() {
  const { t } = useTranslation()
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null)
  const [payments,   setPayments]   = useState<PaymentRecord[]>([])
  const [cursor,     setCursor]     = useState<string | null>(null)
  const [txLoading,  setTxLoading]  = useState(false)
  const [hasMore,    setHasMore]    = useState(true)
  const [txError,    setTxError]    = useState<string | null>(null)

  useEffect(() => { getDriverInfo().then(setDriverInfo) }, [])

  const { balance, loading, refresh } = useODCBalance(driverInfo?.stellarWallet ?? '')

  const fetchPayments = useCallback(async (address: string, pagingToken?: string) => {
    if (!address) return
    setTxLoading(true)
    setTxError(null)
    try {
      const url = `${STELLAR.HORIZON_URL}/accounts/${address}/payments?limit=${PAGE_SIZE}&order=desc`
        + (pagingToken ? `&cursor=${pagingToken}` : '')
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const rawRecords: any[] = (json._embedded?.records ?? [])
        .filter((r: any) =>
          (r.type === 'payment' && r.asset_code === STELLAR.ODC_ASSET_CODE) ||
          r.type === 'create_account'
        )
      const records: PaymentRecord[] = rawRecords.map((r: any) => {
        const incoming = r.type === 'create_account' || r.to === address
        const partner  = r.type === 'create_account' ? r.funder ?? '' : (incoming ? r.from : r.to)
        const amount   = parseFloat(r.amount ?? r.starting_balance ?? '0')
        return {
          id:        r.id,
          hash:      r.transaction_hash,
          createdAt: r.created_at,
          amount,
          incoming,
          partner,
          label:     incoming ? 'in' : 'out',
        }
      })
      setPayments(prev => pagingToken ? [...prev, ...records] : records)
      const lastRaw = rawRecords[rawRecords.length - 1]
      setCursor(lastRaw ? lastRaw.paging_token : null)
      setHasMore(rawRecords.length === PAGE_SIZE)
    } catch (e) {
      setTxError((e as Error).message)
    } finally {
      setTxLoading(false)
    }
  }, [])

  useEffect(() => {
    if (driverInfo?.stellarWallet) fetchPayments(driverInfo.stellarWallet)
  }, [driverInfo?.stellarWallet, fetchPayments])

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

  function openTx(hash: string) {
    const base = STELLAR.NETWORK === 'testnet'
      ? 'https://stellar.expert/explorer/testnet/tx/'
      : 'https://stellar.expert/explorer/public/tx/'
    Linking.openURL(base + hash)
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
        <TouchableOpacity
          style={styles.refreshIconBtn}
          onPress={() => { refresh(); driverInfo?.stellarWallet && fetchPayments(driverInfo.stellarWallet) }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="refresh-outline" size={20} color={BRAND} />
        </TouchableOpacity>
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
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>Lịch sử giao dịch</Text>
            <TouchableOpacity onPress={() => router.push('/(driver)/history')} activeOpacity={0.7}>
              <Text style={styles.seeTripsLink}>Lịch sử chuyến →</Text>
            </TouchableOpacity>
          </View>

          {txError ? (
            <View style={styles.centerMsg}>
              <Text style={styles.errorText}>{txError}</Text>
              <TouchableOpacity onPress={() => driverInfo?.stellarWallet && fetchPayments(driverInfo.stellarWallet)}>
                <Text style={styles.retryText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          ) : txLoading && payments.length === 0 ? (
            <View style={styles.centerMsg}>
              <ActivityIndicator size="small" color={BRAND} />
            </View>
          ) : payments.length === 0 ? (
            <View style={styles.centerMsg}>
              <Ionicons name="receipt-outline" size={32} color="#CBD5E1" />
              <Text style={styles.emptyText}>{t('history.txEmpty')}</Text>
            </View>
          ) : (
            <>
              {payments.map((p, i) => {
                const desc = classifyPartner(p.partner, p.label)
                const sign = p.incoming ? '+' : '−'
                const color = p.incoming ? '#16A34A' : '#DC2626'
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.txRow, i < payments.length - 1 && styles.txRowBorder]}
                    onPress={() => openTx(p.hash)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.txIcon, { backgroundColor: p.incoming ? '#DCFCE7' : '#FEF2F2' }]}>
                      <Ionicons
                        name={p.incoming ? 'arrow-down-outline' : 'arrow-up-outline'}
                        size={16}
                        color={color}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txDesc} numberOfLines={1}>{desc}</Text>
                      <Text style={styles.txDate}>{formatDate(p.createdAt)}</Text>
                    </View>
                    <Text style={[styles.txAmount, { color }]}>
                      {sign}{p.amount.toFixed(4)} ODC
                    </Text>
                  </TouchableOpacity>
                )
              })}

              {hasMore && (
                <TouchableOpacity
                  style={styles.loadMoreBtn}
                  onPress={() => driverInfo?.stellarWallet && cursor && fetchPayments(driverInfo.stellarWallet, cursor)}
                  activeOpacity={0.8}
                >
                  {txLoading
                    ? <ActivityIndicator size="small" color={BRAND} />
                    : <Text style={styles.loadMoreText}>Tải thêm</Text>
                  }
                </TouchableOpacity>
              )}
            </>
          )}
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
  refreshIconBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: BRAND_LIGHT, alignItems: 'center', justifyContent: 'center' },
  content:   { padding: 16, paddingBottom: 48 },

  balanceCard: {
    backgroundColor: BRAND, borderRadius: 18, padding: 24,
    alignItems: 'center', marginBottom: 16,
    shadowColor: BRAND, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 8,
  },
  balanceIcon:     { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  balanceLabel:    { fontSize: 16, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  balanceAmount:   { fontSize: 48, fontWeight: '800', color: '#fff', lineHeight: 56 },
  balanceCurrency: { fontSize: 22, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },

  card:      { backgroundColor: '#fff', borderRadius: 14, padding: 16, elevation: 3, marginBottom: 16, shadowColor: BRAND, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  seeTripsLink: { fontSize: 12, color: BRAND, fontWeight: '600' },

  addressRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  addressText: { flex: 1, fontSize: 13, color: '#475569', fontFamily: 'monospace', backgroundColor: '#F8FAFC', padding: 8, borderRadius: 8 },
  copyBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND_LIGHT, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  copyBtnText: { fontSize: 13, fontWeight: '600', color: BRAND },
  explorerBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  explorerBtnText: { fontSize: 13, color: '#2563EB', fontWeight: '600' },

  txRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  txRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  txIcon:      { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txDesc:      { fontSize: 13, fontWeight: '600', color: '#1E293B' },
  txDate:      { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  txAmount:    { fontSize: 13, fontWeight: '700' },

  centerMsg:  { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyText:  { fontSize: 13, color: '#94A3B8' },
  errorText:  { fontSize: 13, color: '#DC2626', textAlign: 'center' },
  retryText:  { fontSize: 13, color: BRAND, fontWeight: '600' },

  loadMoreBtn:  { alignSelf: 'center', marginTop: 10, paddingHorizontal: 24, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: BRAND_LIGHT, backgroundColor: BRAND_MUTED },
  loadMoreText: { fontSize: 13, fontWeight: '600', color: BRAND },
})
