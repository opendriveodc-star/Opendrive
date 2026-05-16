// app/(driver)/settings.tsx
// Cài đặt báo giá tự động của tài xế

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Switch,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import { COLORS } from '../../src/constants'
import {
  AsyncStorageKey,
  DEFAULT_AUTO_QUOTE_SETTINGS,
  type AutoQuoteSettings,
} from '../../src/types'

export default function DriverSettingsScreen() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<AutoQuoteSettings>(DEFAULT_AUTO_QUOTE_SETTINGS)

  useEffect(() => {
    AsyncStorage.getItem(AsyncStorageKey.AUTO_QUOTE_SETTINGS)
      .then((raw) => {
        if (raw) setSettings(JSON.parse(raw) as AutoQuoteSettings)
      })
  }, [])

  function updateField<K extends keyof AutoQuoteSettings>(
    key: K,
    value: AutoQuoteSettings[K],
  ) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  function parseNum(val: string): number {
    return parseFloat(val) || 0
  }

  async function handleSave() {
    await AsyncStorage.setItem(AsyncStorageKey.AUTO_QUOTE_SETTINGS, JSON.stringify(settings))
    Alert.alert(t('common.success'), t('autoQuote.save'))
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('autoQuote.title')}</Text>

      <View style={styles.card}>
        <ToggleRow
          label={t('autoQuote.enable')}
          value={settings.autoQuoteEnabled}
          onValueChange={(v) => updateField('autoQuoteEnabled', v)}
        />
        <ToggleRow
          label={t('autoQuote.rainMode')}
          value={settings.rainModeEnabled}
          onValueChange={(v) => updateField('rainModeEnabled', v)}
        />
      </View>

      <View style={styles.card}>
        <NumberInput
          label={t('autoQuote.baseKm')}
          value={String(settings.baseKm)}
          onChangeText={(v) => updateField('baseKm', parseNum(v))}
        />
        <NumberInput
          label={t('autoQuote.basePrice')}
          value={String(settings.basePrice)}
          onChangeText={(v) => updateField('basePrice', parseNum(v))}
        />
        <NumberInput
          label={t('autoQuote.pricePerKm')}
          value={String(settings.pricePerKm)}
          onChangeText={(v) => updateField('pricePerKm', parseNum(v))}
        />
        <NumberInput
          label={t('autoQuote.peakMultiplier')}
          value={String(settings.peakHourMultiplier)}
          onChangeText={(v) => updateField('peakHourMultiplier', parseNum(v))}
        />
        <NumberInput
          label={t('autoQuote.rainMultiplier')}
          value={String(settings.rainMultiplier)}
          onChangeText={(v) => updateField('rainMultiplier', parseNum(v))}
        />
        <NumberInput
          label={t('autoQuote.minKm')}
          value={String(settings.minKm)}
          onChangeText={(v) => updateField('minKm', parseNum(v))}
        />
        <NumberInput
          label={t('autoQuote.maxKm')}
          value={String(settings.maxKm)}
          onChangeText={(v) => updateField('maxKm', parseNum(v))}
        />
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>{t('autoQuote.save')}</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label:         string
  value:         boolean
  onValueChange: (v: boolean) => void
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: COLORS.driver.primary }}
      />
    </View>
  )
}

function NumberInput({
  label,
  value,
  onChangeText,
}: {
  label:        string
  value:        string
  onChangeText: (v: string) => void
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholderTextColor="#9CA3AF"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: COLORS.driver.background,
  },
  content: {
    padding:       16,
    paddingBottom: 32,
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
    padding:         16,
    elevation:       2,
    marginBottom:    16,
  },
  toggleRow: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  fieldGroup: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  fieldLabel: {
    fontSize:     13,
    color:        '#64748B',
    marginBottom: 4,
  },
  input: {
    borderWidth:  1,
    borderColor:  '#D1D5DB',
    borderRadius: 6,
    padding:      8,
    fontSize:     15,
    color:        '#0F172A',
  },
  saveButton: {
    backgroundColor: COLORS.driver.primary,
    padding:         14,
    borderRadius:    10,
    alignItems:      'center',
  },
  saveButtonText: {
    color:      '#FFFFFF',
    fontSize:   16,
    fontWeight: '700',
  },
})
