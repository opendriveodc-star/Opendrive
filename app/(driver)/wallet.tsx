// app/(driver)/wallet.tsx

import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  Linking, ScrollView, StatusBar, ActivityIndicator, TextInput, Animated,
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

function classifyPartner(address: string, label: string, t: (k: string) => string): string {
  if (address === STELLAR.TRANSACTION_ADDRESS) return t('history.txFee')
  if (address === STELLAR.DISTRIBUTOR_ADDRESS)  return label === 'in' ? t('history.rewardSystem') : t('history.penaltySystem')
  if (address === STELLAR.ISSUER_ADDRESS)       return t('history.odcIssue')
  return address.slice(0, 6) + '...' + address.slice(-4)
}

function parseVNDate(s: string): Date | null {
  const p = s.trim().split('/')
  if (p.length !== 3) return null
  const [dd, mm, yyyy] = p.map(Number)
  if (!dd || !mm || !yyyy || yyyy < 2020) return null
  const d = new Date(yyyy, mm - 1, dd)
  return isNaN(d.getTime()) ? null : d
}
function autoFormatDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return digits.slice(0, 2) + '/' + digits.slice(2)
  return digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4)
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
  const [showFilter, setShowFilter] = useState(false)
  const [fromDate,   setFromDate]   = useState('')
  const [toDate,     setToDate]     = useState('')
  const spinAnim = useRef(new Animated.Value(0)).current
  const spinRef  = useRef<Animated.CompositeAnimation | null>(null)

  useEffect(() => { getDriverInfo().then(setDriverInfo) }, [])

  const { balance, loading, refresh } = useODCBalance(driverInfo?.stellarWallet ?? '')

  const fetchPayments = useCallback(async (address: string, pagingToken?: string, autoLoad = false) => {
    if (!address) return
    setTxLoading(true)
    setTxError(null)
    try {
      const limit = autoLoad ? 200 : PAGE_SIZE
      const url = `${STELLAR.HORIZON_URL}/accounts/${address}/payments?limit=${limit}&order=desc`
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
      setHasMore(rawRecords.length === limit)
    } catch (e) {
      setTxError((e as Error).message)
    } finally {
      setTxLoading(false)
    }
  }, [])

  useEffect(() => {
    if (driverInfo?.stellarWallet) fetchPayments(driverInfo.stellarWallet)
  }, [driverInfo?.stellarWallet, fetchPayments])

  const filterActive = !!(parseVNDate(fromDate) || parseVNDate(toDate))

  // Spin animation khi đang auto-load
  useEffect(() => {
    if (filterActive && txLoading) {
      spinAnim.setValue(0)
      spinRef.current = Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 1000, useNativeDriver: true })
      )
      spinRef.current.start()
    } else {
      spinRef.current?.stop()
      spinRef.current = null
    }
    return () => { spinRef.current?.stop() }
  }, [filterActive, txLoading])

  // Tự động load thêm khi filter đang bật mà dữ liệu chưa đủ
  useEffect(() => {
    if (!filterActive || !hasMore || txLoading || !driverInfo?.stellarWallet || !cursor) return
    const from = parseVNDate(fromDate)
    if (!from) return
    if (payments.length === 0) return
    const oldest = new Date(payments[payments.length - 1].createdAt)
    if (oldest > from) fetchPayments(driverInfo.stellarWallet, cursor, true)
  }, [payments, fromDate, filterActive, hasMore, txLoading, driverInfo?.stellarWallet, cursor])

  const filteredPayments = useMemo(() => {
    const from = parseVNDate(fromDate)
    const to   = parseVNDate(toDate)
    if (!from && !to) return payments
    if (to) to.setHours(23, 59, 59, 999)
    return payments.filter(p => {
      const d = new Date(p.createdAt)
      if (from && d < from) return false
      if (to   && d > to)   return false
      return true
    })
  }, [payments, fromDate, toDate])

  const stats = useMemo(() => {
    const totalIn  = filteredPayments.filter(p => p.incoming).reduce((s, p) => s + p.amount, 0)
    const totalOut = filteredPayments.filter(p => !p.incoming).reduce((s, p) => s + p.amount, 0)
    const net      = totalIn - totalOut
    const formatShort = (iso: string) => new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    let dateRange = ''
    if (filterActive) {
      dateRange = `${fromDate || '?'} – ${toDate || '?'}`
    } else if (filteredPayments.length > 0) {
      const oldest = filteredPayments[filteredPayments.length - 1].createdAt
      const newest = filteredPayments[0].createdAt
      dateRange = filteredPayments.length === 1 ? formatShort(newest) : `${formatShort(oldest)} – ${formatShort(newest)}`
    }
    return { totalIn, totalOut, net, dateRange, count: filteredPayments.length }
  }, [filteredPayments, filterActive, fromDate, toDate])

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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.cardTitle}>{t('history.txTitle')}</Text>
              <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                {filterActive && txLoading && (
                  <Animated.View style={{
                    position: 'absolute', width: 44, height: 44, borderRadius: 22,
                    borderWidth: 2.5, borderTopColor: BRAND, borderRightColor: BRAND,
                    borderBottomColor: 'transparent', borderLeftColor: 'transparent',
                    transform: [{ rotate: spinAnim.interpolate({ inputRange: [0,1], outputRange: ['0deg','360deg'] }) }],
                  }} />
                )}
                <TouchableOpacity
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: showFilter ? BRAND : BRAND_LIGHT, alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => setShowFilter(v => !v)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="calendar-outline" size={19} color={showFilter ? '#fff' : BRAND} />
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity onPress={() => router.push('/(driver)/history')} activeOpacity={0.7}>
              <Text style={styles.seeTripsLink}>{t('history.viewTrips')}</Text>
            </TouchableOpacity>
          </View>

          {showFilter && (
            <View style={[styles.filterRow, { marginBottom: 12 }]}>
              <View style={styles.dateWrap}>
                <Text style={styles.dateLabel}>{t('history.fromDate')}</Text>
                <TextInput style={styles.dateInput} placeholder="DD/MM/YYYY" placeholderTextColor="#94A3B8"
                  value={fromDate} onChangeText={v => setFromDate(autoFormatDate(v))} keyboardType="numeric" maxLength={10} />
              </View>
              <Ionicons name="arrow-forward-outline" size={14} color="#94A3B8" style={{ marginBottom: 4 }} />
              <View style={styles.dateWrap}>
                <Text style={styles.dateLabel}>{t('history.toDate')}</Text>
                <TextInput style={styles.dateInput} placeholder="DD/MM/YYYY" placeholderTextColor="#94A3B8"
                  value={toDate} onChangeText={v => setToDate(autoFormatDate(v))} keyboardType="numeric" maxLength={10} />
              </View>
              <TouchableOpacity onPress={() => { setFromDate(''); setToDate('') }} style={{ marginBottom: 4 }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name="close-circle" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          )}

          {/* Stats */}
          {filteredPayments.length > 0 && (
            <View style={styles.statsBar}>
              {stats.dateRange !== '' && (
                <View style={styles.statRow}>
                  <Text style={styles.statLbl}>{t('history.period')}</Text>
                  <Text style={[styles.statVal, { fontSize: 12 }]}>{stats.dateRange}</Text>
                </View>
              )}
              <View style={styles.statRow}>
                <Text style={styles.statLbl}>{t('history.totalIn')}</Text>
                <Text style={[styles.statVal, { color: '#16A34A' }]}>+{stats.totalIn.toFixed(4)} ODC</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLbl}>{t('history.totalOut')}</Text>
                <Text style={[styles.statVal, { color: '#DC2626' }]}>−{stats.totalOut.toFixed(4)} ODC</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLbl}>{t('history.netBalance')}</Text>
                <Text style={[styles.statVal, { color: stats.net >= 0 ? '#16A34A' : '#DC2626' }]}>
                  {stats.net >= 0 ? '+' : ''}{stats.net.toFixed(4)} ODC
                </Text>
              </View>
            </View>
          )}

          {txError ? (
            <View style={styles.centerMsg}>
              <Text style={styles.errorText}>{txError}</Text>
              <TouchableOpacity onPress={() => driverInfo?.stellarWallet && fetchPayments(driverInfo.stellarWallet)}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
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
              {filteredPayments.map((p, i) => {
                const desc = classifyPartner(p.partner, p.label, t)
                const sign = p.incoming ? '+' : '−'
                const color = p.incoming ? '#16A34A' : '#DC2626'
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.txRow, i < filteredPayments.length - 1 && styles.txRowBorder]}
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
                    : <Text style={styles.loadMoreText}>{t('history.loadMore')}</Text>
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

  filterCard:  { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: BRAND_LIGHT },
  filterRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  dateWrap:    { flex: 1, minWidth: 0 },
  dateLabel:   { fontSize: 11, fontWeight: '600', color: BRAND, marginBottom: 4 },
  dateInput:   { borderWidth: 1.5, borderColor: BRAND_LIGHT, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7, fontSize: 14, color: '#1E293B', backgroundColor: BRAND_MUTED },
  statsBar:    { marginBottom: 12, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: BRAND_MUTED, borderRadius: 12, borderWidth: 1, borderColor: BRAND_LIGHT, gap: 7 },
  statRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statVal:     { fontSize: 13, fontWeight: '800', color: BRAND },
  statLbl:     { fontSize: 12, fontWeight: '500', color: '#64748B' },
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
