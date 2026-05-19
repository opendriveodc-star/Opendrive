// app/(driver)/quote-config.tsx

import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, StatusBar,
} from 'react-native'
import { showAlert } from '../../src/components/GlobalAlert'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { AsyncStorageKey, DEFAULT_AUTO_QUOTE_SETTINGS, type AutoQuoteSettings } from '../../src/types'

const BRAND = '#1A2E5E'

export default function QuoteConfigScreen() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<AutoQuoteSettings>(DEFAULT_AUTO_QUOTE_SETTINGS)

  useEffect(() => {
    AsyncStorage.getItem(AsyncStorageKey.AUTO_QUOTE_SETTINGS).then((raw) => {
      if (raw) setSettings(JSON.parse(raw) as AutoQuoteSettings)
    })
  }, [])

  function updateField<K extends keyof AutoQuoteSettings>(key: K, value: AutoQuoteSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  function parseNum(val: string): number { return parseFloat(val) || 0 }

  async function handleSave() {
    await AsyncStorage.setItem(AsyncStorageKey.AUTO_QUOTE_SETTINGS, JSON.stringify(settings))
    showAlert(t('common.success'), t('autoQuote.save'))
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F9FD" />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={BRAND} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>{t('nav.quoteConfig')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        <View style={styles.card}>
          <NumberInput label={t('autoQuote.baseKm')}        value={String(settings.baseKm)}           onChangeText={(v) => updateField('baseKm', parseNum(v))} />
          <NumberInput label={t('autoQuote.basePrice')}     value={String(settings.basePrice)}         onChangeText={(v) => updateField('basePrice', parseNum(v))}    currency />
          <NumberInput label={t('autoQuote.pricePerKm')}    value={String(settings.pricePerKm)}        onChangeText={(v) => updateField('pricePerKm', parseNum(v))}   currency />
          <NumberInput label={t('autoQuote.peakMultiplier')} value={String(settings.peakHourMultiplier)} onChangeText={(v) => updateField('peakHourMultiplier', parseNum(v))} />
          <NumberInput label={t('autoQuote.rainMultiplier')} value={String(settings.rainMultiplier)}   onChangeText={(v) => updateField('rainMultiplier', parseNum(v))} />
          <NumberInput label={t('autoQuote.minKm')}         value={String(settings.minKm)}             onChangeText={(v) => updateField('minKm', parseNum(v))} />
          <NumberInput label={t('autoQuote.maxKm')}         value={String(settings.maxKm)}             onChangeText={(v) => updateField('maxKm', parseNum(v))} last />
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
          <Text style={styles.saveBtnText}>{t('autoQuote.save')}</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  )
}

function NumberInput({ label, value, onChangeText, last = false, currency = false }: {
  label: string; value: string; onChangeText: (v: string) => void; last?: boolean; currency?: boolean
}) {
  const [focused, setFocused] = useState(false)

  const displayValue = currency && !focused
    ? (parseInt(value, 10) || 0).toLocaleString('vi-VN')
    : value

  return (
    <View style={[styles.fieldGroup, !last && styles.fieldBorder]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={displayValue}
        onChangeText={(text) => onChangeText(currency ? text.replace(/\D/g, '') : text)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType={currency ? 'number-pad' : 'decimal-pad'}
        placeholderTextColor="#9CA3AF"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#F7F9FD' },
  topBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: BRAND, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  topTitle:  { fontSize: 17, fontWeight: '700', color: BRAND, flex: 1, textAlign: 'center' },
  content:   { padding: 16, paddingBottom: 48 },
  card:      { backgroundColor: '#fff', borderRadius: 14, padding: 16, elevation: 3, marginBottom: 20, shadowColor: BRAND, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6 },
  fieldGroup: { paddingVertical: 12 },
  fieldBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  fieldLabel: { fontSize: 13, color: '#64748B', marginBottom: 6 },
  input:     { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, color: '#0F172A', backgroundColor: '#FAFBFD' },
  saveBtn:   { backgroundColor: BRAND, borderRadius: 12, padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
