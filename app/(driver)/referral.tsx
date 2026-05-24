// app/(driver)/referral.tsx

import React, { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  Share, ScrollView, StatusBar,
} from 'react-native'
import { showAlert } from '../../src/components/GlobalAlert'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { WebView } from 'react-native-webview'
import QRCode from 'qrcode'
import { getDriverInfo } from '../../src/utils/storage'
import { ODC } from '../../src/constants'
import type { DriverInfo } from '../../src/types'

const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'

export default function ReferralScreen() {
  const { t } = useTranslation()
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null)
  const [qrHtml, setQrHtml] = useState('')

  useEffect(() => { getDriverInfo().then(setDriverInfo) }, [])

  const referralCode = driverInfo?.uid ?? ''

  useEffect(() => {
    if (!referralCode) return
    QRCode.toString(referralCode, { type: 'svg', margin: 1 })
      .then(svg => {
        setQrHtml(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;width:100%;height:100%;background:#fff;display:flex;justify-content:center;align-items:center;}svg{width:100%;height:100%;}</style></head><body>${svg}</body></html>`)
      })
      .catch(() => {})
  }, [referralCode])

  async function copyCode() {
    if (!referralCode) return
    await Clipboard.setStringAsync(referralCode)
    showAlert(t('common.success'), t('settings.copied'))
  }

  async function shareCode() {
    if (!referralCode) return
    try {
      await Share.share({
        message: t('referral.shareMessage', {
          code:  referralCode,
          bonus: ODC.SIGNUP_BONUS,
        }) ?? `Dùng mã ${referralCode} để đăng ký OpenDrive và nhận ${ODC.SIGNUP_BONUS} ODC!`,
      })
    } catch { /* user cancelled */ }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F9FD" />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={BRAND} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>{t('nav.referral')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Mã giới thiệu */}
        <View style={styles.codeCard}>
          <View style={styles.codeIconWrap}>
            <Ionicons name="gift-outline" size={28} color="#fff" />
          </View>
          <Text style={styles.codeHint}>{t('settings.referralCode', { code: '' }).replace(':', '').trim()}</Text>
          <Text style={styles.codeText}>{referralCode || '——'}</Text>
          {qrHtml ? (
            <View style={styles.qrContainer}>
              <WebView
                source={{ html: qrHtml }}
                style={styles.qrWebView}
                scrollEnabled={false}
                scalesPageToFit={false}
              />
            </View>
          ) : null}
          <View style={styles.codeBtns}>
            <TouchableOpacity style={styles.copyBtn} onPress={copyCode}>
              <Ionicons name="copy-outline" size={16} color={BRAND} />
              <Text style={styles.copyBtnText}>{t('settings.copyCode')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareBtn} onPress={shareCode}>
              <Ionicons name="share-social-outline" size={16} color="#fff" />
              <Text style={styles.shareBtnText}>{t('referral.share') ?? 'Chia sẻ'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Thống kê */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{driverInfo?.referralCount ?? 0}</Text>
            <Text style={styles.statLabel}>{t('referral.totalReferred') ?? 'Tài xế đã giới thiệu'}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{(driverInfo?.referralCount ?? 0) * ODC.REFERRAL_BONUS}</Text>
            <Text style={styles.statLabel}>{t('referral.odcEarned') ?? 'ODC đã nhận'}</Text>
          </View>
        </View>

        {/* Thông tin thưởng */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="information-circle-outline" size={18} color={BRAND} />
            <Text style={styles.infoTitle}>{t('referral.howItWorks') ?? 'Cách hoạt động'}</Text>
          </View>
          <InfoRow icon="checkmark-circle-outline"
            text={t('referral.rule1') ?? `Giới thiệu 1 tài xế mới = +${ODC.REFERRAL_BONUS} ODC khi họ hoàn thành chuyến đầu`} />
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

function InfoRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={16} color={BRAND} style={{ marginTop: 1 }} />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#F7F9FD' },
  topBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: BRAND, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  topTitle:  { fontSize: 17, fontWeight: '700', color: BRAND },
  content:   { padding: 16, paddingBottom: 48 },
  codeCard:  { backgroundColor: BRAND, borderRadius: 18, padding: 24, alignItems: 'center', marginBottom: 16, shadowColor: BRAND, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 8 },
  codeIconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  codeHint:  { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  codeText:  { fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 1, marginBottom: 20, textAlign: 'center' },
  qrContainer: {
    width: 160, height: 160,
    backgroundColor: '#fff', borderRadius: 12,
    padding: 8, marginBottom: 16, overflow: 'hidden',
  },
  qrWebView: { width: '100%', height: '100%', backgroundColor: '#fff' },
  codeBtns:  { flexDirection: 'row', gap: 10, width: '100%' },
  copyBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fff', paddingVertical: 10, borderRadius: 10 },
  copyBtnText: { fontSize: 14, fontWeight: '600', color: BRAND },
  shareBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 10, borderRadius: 10 },
  shareBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  statsCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 16, elevation: 3, shadowColor: BRAND, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6 },
  statItem:  { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 28, fontWeight: '800', color: BRAND },
  statLabel: { fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 2 },
  statDivider: { width: 1, height: 40, backgroundColor: '#E2E8F0' },
  infoCard:  { backgroundColor: '#fff', borderRadius: 14, padding: 16, elevation: 3, shadowColor: BRAND, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6 },
  infoHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  infoTitle: { fontSize: 14, fontWeight: '700', color: BRAND },
  infoRow:   { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'flex-start' },
  infoText:  { flex: 1, fontSize: 13, color: '#475569', lineHeight: 20 },
})
