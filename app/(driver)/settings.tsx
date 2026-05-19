// app/(driver)/settings.tsx

import React, { useEffect, useState } from 'react'
import {
  View, Text, Switch, TouchableOpacity, StyleSheet,
  ScrollView, StatusBar,
} from 'react-native'
import { showAlert } from '../../src/components/GlobalAlert'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { changeLanguage } from '../../src/i18n'
import { signOutAndClearRole } from '../../src/services/firebase'
import { updateDriverStatus } from '../../src/services/firestore'
import {
  AsyncStorageKey, DEFAULT_AUTO_QUOTE_SETTINGS,
  SecureStoreKey, type AutoQuoteSettings, type DriverInfo,
} from '../../src/types'

const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'

export default function DriverSettingsScreen() {
  const { t, i18n } = useTranslation()
  const [settings,   setSettings]   = useState<AutoQuoteSettings>(DEFAULT_AUTO_QUOTE_SETTINGS)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(AsyncStorageKey.AUTO_QUOTE_SETTINGS).then((raw) => {
      if (raw) setSettings(JSON.parse(raw) as AutoQuoteSettings)
    })
  }, [])

  async function toggleAutoQuote(v: boolean) {
    const updated = { ...settings, autoQuoteEnabled: v }
    setSettings(updated)
    await AsyncStorage.setItem(AsyncStorageKey.AUTO_QUOTE_SETTINGS, JSON.stringify(updated))
  }

  async function handleLanguageChange(lang: 'vi' | 'en') {
    await changeLanguage(lang)
  }

  async function handleLogout() {
    const pending = await SecureStore.getItemAsync(SecureStoreKey.PENDING_TRIP)
    if (pending) {
      showAlert(t('common.error'), t('pending.title') + '\n' + t('pending.message'))
      return
    }
    showAlert(t('settings.logout'), t('settings.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.logout'), style: 'destructive', onPress: doLogout },
    ])
  }

  async function doLogout() {
    setLoggingOut(true)
    try {
      const raw = await SecureStore.getItemAsync(SecureStoreKey.DRIVER_INFO)
      if (raw) {
        const info: DriverInfo = JSON.parse(raw)
        if (info.status === 'ready') {
          const timeout = new Promise<void>(resolve => setTimeout(resolve, 3000))
          await Promise.race([updateDriverStatus(info.uid, 'offline'), timeout]).catch(() => {})
        }
      }
      await signOutAndClearRole()
      router.replace('/role-select')
    } catch {
      showAlert(t('common.error'), t('error.unknown'))
    } finally {
      setLoggingOut(false)
    }
  }

  const currentLang = i18n.language as 'vi' | 'en'

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F9FD" />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={BRAND} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>{t('settings.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* ── Ngôn ngữ ── */}
        <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
        <View style={styles.card}>
          <View style={styles.langRow}>
            <LangButton label="🇻🇳  Tiếng Việt" active={currentLang === 'vi'} onPress={() => handleLanguageChange('vi')} />
            <LangButton label="🇬🇧  English"    active={currentLang === 'en'} onPress={() => handleLanguageChange('en')} />
          </View>
        </View>

        {/* ── Màn hình ── */}
        <Text style={styles.sectionTitle}>{currentLang === 'vi' ? 'Màn hình' : 'Screens'}</Text>
        <View style={styles.navCard}>
          <NavRow icon="time-outline"   label={t('nav.history')}   onPress={() => router.push('/(driver)/history')} />
          <NavRow icon="wallet-outline" label={t('nav.wallet')}    onPress={() => router.push('/(driver)/wallet')} />
          <NavRow icon="people-outline" label={t('nav.referral')}  onPress={() => router.push('/(driver)/referral')} />
          <NavRow icon="car-outline"    label={t('nav.driverInfo')} onPress={() => router.push('/(driver)/driver-info')} last />
        </View>

        {/* ── Báo giá tự động ── */}
        <Text style={styles.sectionTitle}>{t('autoQuote.title')}</Text>
        <View style={styles.navCard}>
          <View style={styles.toggleNavRow}>
            <View style={styles.navIconWrap}>
              <Ionicons name="flash-outline" size={18} color={BRAND} />
            </View>
            <Text style={styles.navLabel}>{t('autoQuote.enable')}</Text>
            <Switch
              value={settings.autoQuoteEnabled}
              onValueChange={toggleAutoQuote}
              thumbColor={settings.autoQuoteEnabled ? '#fff' : '#94A3B8'}
              trackColor={{ false: '#CBD5E1', true: BRAND }}
              ios_backgroundColor="#CBD5E1"
            />
          </View>
          <NavRow icon="calculator-outline" label={t('nav.quoteConfig')} onPress={() => router.push('/(driver)/quote-config')} last />
        </View>

        {/* ── Tài khoản ── */}
        <Text style={styles.sectionTitle}>{currentLang === 'vi' ? 'Tài khoản' : 'Account'}</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.logoutRow} onPress={handleLogout} disabled={loggingOut}>
            <Ionicons name="log-out-outline" size={18} color="#DC2626" />
            <Text style={styles.logoutText}>
              {loggingOut ? t('common.loading') : t('settings.logout')}
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

function NavRow({ icon, label, onPress, last = false }: {
  icon: string; label: string; onPress: () => void; last?: boolean
}) {
  return (
    <TouchableOpacity style={[styles.navRow, !last && styles.navRowBorder]} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.navIconWrap}>
        <Ionicons name={icon as any} size={18} color={BRAND} />
      </View>
      <Text style={styles.navLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
    </TouchableOpacity>
  )
}

function LangButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.langBtn, active && styles.langBtnActive]} onPress={onPress}>
      <Text style={[styles.langBtnText, active && styles.langBtnTextActive]}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#F7F9FD' },
  topBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#F7F9FD' },
  backBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: BRAND, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  topTitle:  { fontSize: 17, fontWeight: '700', color: BRAND },
  container: { flex: 1 },
  content:   { padding: 16, paddingBottom: 48 },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 4 },
  navCard:   { backgroundColor: '#fff', borderRadius: 14, marginBottom: 16, overflow: 'hidden', shadowColor: BRAND, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 3 },
  navRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  navRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  navIconWrap:  { width: 34, height: 34, borderRadius: 10, backgroundColor: BRAND_LIGHT, alignItems: 'center', justifyContent: 'center' },
  navLabel:  { flex: 1, fontSize: 15, fontWeight: '600', color: '#1E293B' },
  card:      { backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 2, marginBottom: 16 },
  langRow:   { flexDirection: 'row', gap: 10 },
  langBtn:   { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center' },
  langBtnActive: { backgroundColor: BRAND, borderColor: BRAND },
  langBtnText:   { fontSize: 14, fontWeight: '600', color: '#374151' },
  langBtnTextActive: { color: '#fff' },
  toggleNavRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, gap: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  toggleRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  logoutRow:  { paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  logoutText: { fontSize: 16, fontWeight: '600', color: '#DC2626' },
})
