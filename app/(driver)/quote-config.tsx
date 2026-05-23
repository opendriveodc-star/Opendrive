// app/(driver)/quote-config.tsx

import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Switch,
  StyleSheet, ScrollView, StatusBar, Modal,
} from 'react-native'
import { showAlert } from '../../src/components/GlobalAlert'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { AsyncStorageKey, DEFAULT_AUTO_QUOTE_SETTINGS, type AutoQuoteSettings } from '../../src/types'

const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'

// ─── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <View style={sh.wrap}>
      <View style={sh.accent} />
      <Text style={sh.text}>{label}</Text>
    </View>
  )
}
const sh = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginTop: 6 },
  accent: { width: 3, height: 15, backgroundColor: BRAND, borderRadius: 2, marginRight: 8 },
  text:  { fontSize: 11, fontWeight: '700', color: BRAND, letterSpacing: 0.9, textTransform: 'uppercase' },
})

// ─── Row: label kề trái, input kề phải ────────────────────────────────────────
function FieldRow({ label, value, onChangeText, last = false, currency = false, percent = false, unit }: {
  label: string; value: string; onChangeText: (v: string) => void
  last?: boolean; currency?: boolean; percent?: boolean; unit?: string
}) {
  const [focused, setFocused] = useState(false)

  // percent mode: lưu 1.15, hiển thị "15"
  const displayValue = percent
    ? (focused ? String(Math.round((parseFloat(value) - 1) * 100)) : String(Math.round((parseFloat(value) - 1) * 100)))
    : currency && !focused
      ? (parseInt(value, 10) || 0).toLocaleString('vi-VN')
      : value

  function handleChange(text: string) {
    if (percent) {
      const num = parseInt(text.replace(/\D/g, ''), 10) || 0
      onChangeText(String(1 + num / 100))
    } else if (currency) {
      onChangeText(text.replace(/\D/g, ''))
    } else {
      onChangeText(text)
    }
  }

  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        <TextInput
          style={styles.rowInput}
          value={displayValue}
          textAlign="right"
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          placeholderTextColor="#9CA3AF"
        />
        {unit && <Text style={styles.unitText}>{unit}</Text>}
      </View>
    </View>
  )
}

// ─── Row: label trái, switch phải ─────────────────────────────────────────────
function SwitchRow({ label, value, onChange, last = false }: {
  label: string; value: boolean; onChange: (v: boolean) => void; last?: boolean
}) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        thumbColor="#fff"
        trackColor={{ false: '#CBD5E1', true: BRAND }}
      />
    </View>
  )
}

// ─── Time Picker Modal ─────────────────────────────────────────────────────────
function TimePickerModal({ value, title, onConfirm, onClose }: {
  value: string; title: string; onConfirm: (v: string) => void; onClose: () => void
}) {
  const parts  = value.split(':')
  const [hour,   setHour]   = useState(parseInt(parts[0], 10) || 0)
  const [minute, setMinute] = useState(parseInt(parts[1], 10) || 0)
  const fmt = (h: number, m: number) =>
    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.pickerCard}>
          <Text style={styles.pickerTitle}>{title}</Text>

          <Text style={styles.pickerSub}>Giờ</Text>
          <View style={styles.hourGrid}>
            {Array.from({ length: 4 }, (_, row) => (
              <View key={row} style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                {Array.from({ length: 6 }, (_, col) => {
                  const h = row * 6 + col
                  return (
                    <TouchableOpacity
                      key={h}
                      style={[styles.cell, hour === h && styles.cellOn]}
                      onPress={() => setHour(h)}
                    >
                      <Text style={[styles.cellTxt, hour === h && styles.cellTxtOn]}>
                        {String(h).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            ))}
          </View>

          <Text style={styles.pickerSub}>Phút</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
            {[0, 15, 30, 45].map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.minCell, minute === m && styles.cellOn]}
                onPress={() => setMinute(m)}
              >
                <Text style={[styles.cellTxt, minute === m && styles.cellTxtOn]}>
                  :{String(m).padStart(2, '0')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.timePreview}>{fmt(hour, minute)}</Text>
            <TouchableOpacity style={styles.confirmBtn} onPress={() => { onConfirm(fmt(hour, minute)); onClose() }}>
              <Text style={styles.confirmTxt}>Xác nhận</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function QuoteConfigScreen() {
  const { t } = useTranslation()
  const [settings,   setSettings]   = useState<AutoQuoteSettings>(DEFAULT_AUTO_QUOTE_SETTINGS)
  const [timePicker, setTimePicker] = useState<'start' | 'end' | null>(null)

  useEffect(() => {
    AsyncStorage.getItem(AsyncStorageKey.AUTO_QUOTE_SETTINGS).then((raw) => {
      if (raw) {
        const saved = JSON.parse(raw) as Partial<AutoQuoteSettings>
        setSettings({ ...DEFAULT_AUTO_QUOTE_SETTINGS, ...saved })
      }
    })
  }, [])

  function update<K extends keyof AutoQuoteSettings>(key: K, value: AutoQuoteSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }
  const n = (v: string) => parseFloat(v) || 0

  async function handleSave() {
    await AsyncStorage.setItem(AsyncStorageKey.AUTO_QUOTE_SETTINGS, JSON.stringify(settings))
    showAlert(t('common.success'), t('autoQuote.saved'))
  }

  const peakOn = settings.peakHourEnabled ?? false

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F9FD" />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={BRAND} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>{t('nav.quoteConfig')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Giá cơ bản ──────────────────────────────────────────────────── */}
        <SectionHeader label={t('autoQuote.sectionBase')} />
        <View style={styles.card}>
          <FieldRow label={t('autoQuote.baseKm')}     value={String(settings.baseKm)}     onChangeText={(v) => update('baseKm', n(v))}     unit="km" />
          <FieldRow label={t('autoQuote.basePrice')}  value={String(settings.basePrice)}   onChangeText={(v) => update('basePrice', n(v))}  currency unit="đ" />
          <FieldRow label={t('autoQuote.pricePerKm')} value={String(settings.pricePerKm)} onChangeText={(v) => update('pricePerKm', n(v))} currency unit="đ/km" />
          <FieldRow label={t('autoQuote.minKm')}      value={String(settings.minKm)}       onChangeText={(v) => update('minKm', n(v))}      unit="km" />
          <FieldRow label={t('autoQuote.maxKm')}      value={String(settings.maxKm)}       onChangeText={(v) => update('maxKm', n(v))}      unit="km" last />
        </View>

        {/* ── Giờ cao điểm ────────────────────────────────────────────────── */}
        <SectionHeader label={t('autoQuote.sectionPeak')} />
        <View style={styles.card}>

          <SwitchRow label={t('autoQuote.peakEnabled')} value={peakOn} onChange={(v) => update('peakHourEnabled', v)} />

          {/* Khung giờ – label trái, 2 chip phải */}
          <View style={[styles.row, styles.rowBorder]}>
            <Text style={[styles.rowLabel, !peakOn && styles.labelOff]}>{t('autoQuote.peakTimeRange')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                style={[styles.timeChip, !peakOn && styles.timeChipOff]}
                disabled={!peakOn}
                onPress={() => setTimePicker('start')}
              >
                <Text style={[styles.timeChipTxt, !peakOn && styles.timeChipTxtOff]}>
                  {settings.peakHourStart ?? '06:00'}
                </Text>
              </TouchableOpacity>

              <Ionicons name="arrow-forward" size={13} color="#94A3B8" />

              <TouchableOpacity
                style={[styles.timeChip, !peakOn && styles.timeChipOff]}
                disabled={!peakOn}
                onPress={() => setTimePicker('end')}
              >
                <Text style={[styles.timeChipTxt, !peakOn && styles.timeChipTxtOff]}>
                  {settings.peakHourEnd ?? '09:00'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <FieldRow
            label={t('autoQuote.peakMultiplier')}
            value={String(settings.peakHourMultiplier)}
            onChangeText={(v) => update('peakHourMultiplier', n(v))}
            percent unit="%" last
          />
        </View>

        {/* ── Trời mưa ────────────────────────────────────────────────────── */}
        <SectionHeader label={t('autoQuote.sectionRain')} />
        <View style={styles.card}>
          <FieldRow
            label={t('autoQuote.rainMultiplier')}
            value={String(settings.rainMultiplier)}
            onChangeText={(v) => update('rainMultiplier', n(v))}
            percent unit="%" last
          />
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
          <Text style={styles.saveBtnTxt}>{t('autoQuote.save')}</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Time pickers */}
      {timePicker === 'start' && (
        <TimePickerModal
          value={settings.peakHourStart ?? '06:00'}
          title={t('autoQuote.peakFrom')}
          onConfirm={(v) => update('peakHourStart', v)}
          onClose={() => setTimePicker(null)}
        />
      )}
      {timePicker === 'end' && (
        <TimePickerModal
          value={settings.peakHourEnd ?? '09:00'}
          title={t('autoQuote.peakTo')}
          onConfirm={(v) => update('peakHourEnd', v)}
          onClose={() => setTimePicker(null)}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: '#F7F9FD' },
  topBar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: BRAND, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  topTitle:    { fontSize: 17, fontWeight: '700', color: BRAND, flex: 1, textAlign: 'center' },
  content:     { padding: 16, paddingBottom: 48 },
  card:        { backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, marginBottom: 20, shadowColor: BRAND, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 3 },

  // Row layout
  row:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 12 },
  rowBorder:   { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  rowLabel:    { flex: 1, fontSize: 14, color: '#1E293B', fontWeight: '500' },
  labelOff:    { color: '#94A3B8' },
  rowRight:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowInput:    { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 15, color: '#0F172A', backgroundColor: '#FAFBFD', minWidth: 80 },
  unitText:    { fontSize: 12, color: '#64748B', minWidth: 28 },

  // Save button
  saveBtn:     { backgroundColor: BRAND, borderRadius: 12, padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveBtnTxt:  { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Time chip
  timeChip:       { backgroundColor: BRAND_LIGHT, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  timeChipOff:    { backgroundColor: '#F1F5F9' },
  timeChipTxt:    { fontSize: 15, fontWeight: '700', color: BRAND, fontVariant: ['tabular-nums'] },
  timeChipTxtOff: { color: '#94A3B8' },

  // Picker modal
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  pickerCard:  { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 380 },
  pickerTitle: { fontSize: 18, fontWeight: '800', color: BRAND, marginBottom: 18, textAlign: 'center' },
  pickerSub:   { fontSize: 11, fontWeight: '600', color: '#64748B', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  hourGrid:    { marginBottom: 16 },
  cell:        { flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: '#F8FAFC', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  cellOn:      { backgroundColor: BRAND, borderColor: BRAND },
  cellTxt:     { fontSize: 13, fontWeight: '600', color: '#475569' },
  cellTxtOn:   { color: '#fff' },
  minCell:     { flex: 1, borderRadius: 10, backgroundColor: '#F8FAFC', alignItems: 'center', paddingVertical: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  timePreview: { fontSize: 32, fontWeight: '800', color: BRAND, fontVariant: ['tabular-nums'] },
  confirmBtn:  { backgroundColor: BRAND, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 11 },
  confirmTxt:  { color: '#fff', fontWeight: '700', fontSize: 15 },
})
