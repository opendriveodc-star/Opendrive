// app/(driver)/driver-info.tsx

import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, StatusBar, KeyboardAvoidingView, Platform, Image, ActivityIndicator, Dimensions,
} from 'react-native'
import { showAlert, showActionSheet } from '../../src/components/GlobalAlert'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as SecureStore from 'expo-secure-store'
// Lazy – requires dev client rebuild with expo-image-picker + expo-image-manipulator
let ImagePicker: typeof import('expo-image-picker') | null = null
let ImageManipulator: typeof import('expo-image-manipulator') | null = null
let MlKitTextRecognition: any = null
try { ImagePicker = require('expo-image-picker') } catch { ImagePicker = null }
try { ImageManipulator = require('expo-image-manipulator') } catch { ImageManipulator = null }
try { const m = require('@react-native-ml-kit/text-recognition'); MlKitTextRecognition = m.default ?? m } catch {}
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { getDriverInfo } from '../../src/utils/storage'
import { updateDriverVehicleInfo } from '../../src/services/firestore'
import { uploadDriverAvatar } from '../../src/services/firebase'
import { TRANSPORT_MODELS } from '../../src/data/vehicles'
import { SecureStoreKey, type DriverInfo, type VehicleType, type TransportModel } from '../../src/types'
import { parseVehicleCard } from '../../src/utils/parseVehicleCard'

const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'
const BRAND_MUTED = '#F0F4FB'
const SCREEN_W        = Dimensions.get('window').width
const VEHICLE_BTN_W   = Math.floor((SCREEN_W - 56 - 20) / 3)  // 56 = 2×28 padding, 20 = 2 gaps

export default function DriverInfoScreen() {
  const { t } = useTranslation()
  const [driverInfo,     setDriverInfo]     = useState<DriverInfo | null>(null)
  const [name,           setName]           = useState('')
  const [vehicleBrand,   setVehicleBrand]   = useState('')
  const [vehicleColor,   setVehicleColor]   = useState('')
  const [licensePlate,   setLicensePlate]   = useState('')
  const [transportModel, setTransportModel] = useState<TransportModel>('passenger')
  const [vehicleType,    setVehicleType]    = useState<VehicleType>('motorbike')
  const [avatarUri,      setAvatarUri]      = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [saving,          setSaving]          = useState(false)
  const [scanLoading,     setScanLoading]     = useState(false)
  const [plateInvalid,    setPlateInvalid]    = useState(false)
  const [plateInvalidMsg, setPlateInvalidMsg] = useState('')

  useEffect(() => {
    getDriverInfo().then((info) => {
      if (!info) return
      setDriverInfo(info)
      setName(info.name)
      setVehicleBrand(info.vehicleBrand)
      setVehicleColor(info.vehicleColor ?? '')
      setLicensePlate(info.licensePlate)
      setTransportModel(info.transportModel ?? 'passenger')
      setVehicleType(info.vehicleType)
      if (['car4', 'car6'].includes(info.vehicleType)) setTransportLocked(true)
      else if (['pickup', 'truck'].includes(info.vehicleType)) setTransportLocked(true)
      if (info.avatarUrl) setAvatarUri(info.avatarUrl)
    })
  }, [])

  function handleModelChange(model: TransportModel) {
    setTransportModel(model)
    const cfg = TRANSPORT_MODELS.find((m) => m.key === model)!
    if (!cfg.vehicles.find((v) => v.key === vehicleType)) {
      setVehicleType(cfg.vehicles[0].key)
    }
  }

  async function scanVehicleCard() {
    if (!ImagePicker) {
      showAlert(t('common.error'), 'Cần build lại app để dùng tính năng này')
      return
    }
    if (!MlKitTextRecognition) {
      showAlert(t('common.error'), 'Module OCR chưa được cài, cần build lại app')
      return
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      showAlert(t('common.error'), 'Cần cấp quyền truy cập camera')
      return
    }
    const picked = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.9 })
    if (picked.canceled || !picked.assets[0]) return
    setScanLoading(true)
    try {
      const recognized = await MlKitTextRecognition.recognize(picked.assets[0].uri)
      const parsed = parseVehicleCard(recognized.text)
      const isMotorbike = parsed.vehicleType === 'motorbike'

      if (parsed.plateColor === 'yellow') {
        setPlateInvalid(false); setPlateInvalidMsg('')
      } else if (parsed.plateColor === 'blue') {
        setPlateInvalid(true); setPlateInvalidMsg(t('register.plateInvalidYellow'))
      } else {
        if (isMotorbike) {
          setPlateInvalid(false); setPlateInvalidMsg('')
        } else {
          setPlateInvalid(true); setPlateInvalidMsg(t('register.plateInvalidYellow'))
        }
      }

      if (parsed.licensePlate) setLicensePlate(parsed.licensePlate)
      if (parsed.vehicleBrand)  setVehicleBrand(parsed.vehicleBrand)
      if (parsed.vehicleColor)  setVehicleColor(parsed.vehicleColor)
      const missing = ([
        !parsed.licensePlate && t('register.scanMissingPlate'),
        !parsed.vehicleBrand  && t('register.scanMissingBrand'),
        !parsed.vehicleColor  && t('register.scanMissingColor'),
      ] as (string | false)[]).filter(Boolean) as string[]
      if (missing.length) {
        showAlert(t('register.scanIncompleteTitle'), t('register.scanIncompleteBody', { fields: missing.join(', ') }))
      }
    } catch {
      showAlert(t('common.error'), t('register.scanError'))
    } finally {
      setScanLoading(false)
    }
  }

  const vehicleOptions = TRANSPORT_MODELS.find((m) => m.key === transportModel)?.vehicles ?? []

  async function pickAvatar() {
    if (!ImagePicker) {
      showAlert(t('common.error'), 'Cần build lại app để dùng tính năng này')
      return
    }
    showActionSheet(t('driverInfo.avatar'), [
      { text: 'Chụp ảnh',         icon: 'camera-outline',        onPress: () => launchPicker('camera') },
      { text: 'Chọn từ thư viện', icon: 'image-outline',         onPress: () => launchPicker('library') },
      { text: t('common.cancel'), style: 'cancel' },
    ])
  }

  async function launchPicker(source: 'camera' | 'library') {
    if (!ImagePicker) return
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      if (status !== 'granted') {
        showAlert(t('common.error'), 'Cần cấp quyền truy cập camera')
        return
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        showAlert(t('common.error'), 'Cần cấp quyền truy cập thư viện ảnh')
        return
      }
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 1 })

    if (!result.canceled && result.assets[0]) {
      let uri = result.assets[0].uri
      if (ImageManipulator) {
        const m = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 150 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
        )
        uri = m.uri
      }
      setAvatarUri(uri)
    }
  }

  async function handleSave() {
    if (!driverInfo) return
    if (!name.trim() || !vehicleBrand.trim() || !licensePlate.trim()) {
      showAlert(t('common.error'), 'Vui lòng điền đầy đủ thông tin')
      return
    }
    setSaving(true)
    try {
      let newAvatarUrl = driverInfo.avatarUrl
      if (avatarUri && avatarUri !== driverInfo.avatarUrl) {
        setUploadingAvatar(true)
        newAvatarUrl = await uploadDriverAvatar(driverInfo.uid, avatarUri)
        setUploadingAvatar(false)
      }
      const fields: Parameters<typeof updateDriverVehicleInfo>[1] = {
        name:          name.trim().toUpperCase(),
        vehicleType,
        transportModel,
        vehicleBrand:  vehicleBrand.trim().toUpperCase(),
        vehicleColor:  vehicleColor.trim(),
        licensePlate:  licensePlate.trim().toUpperCase(),
      }
      if (newAvatarUrl != null) fields.avatarUrl = newAvatarUrl
      await updateDriverVehicleInfo(driverInfo.uid, fields)
      const updated: DriverInfo = { ...driverInfo, ...fields }
      await SecureStore.setItemAsync(SecureStoreKey.DRIVER_INFO, JSON.stringify(updated))
      setDriverInfo(updated)
      showAlert(t('common.success'), t('driverInfo.saved'))
    } catch (e) {
      showAlert(t('common.error'), (e as Error).message)
    } finally {
      setSaving(false)
      setUploadingAvatar(false)
    }
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={BRAND} />
        </TouchableOpacity>
        <Text style={s.topTitle}>{t('driverInfo.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        {/* ── Avatar ── */}
        <TouchableOpacity style={s.avatarWrap} onPress={pickAvatar} activeOpacity={0.8}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={s.avatarImg} />
          ) : (
            <View style={s.avatarPlaceholder}>
              <Text style={s.avatarInitial}>{name ? name[0].toUpperCase() : '?'}</Text>
            </View>
          )}
          {uploadingAvatar && (
            <View style={s.avatarLoading}>
              <ActivityIndicator size="small" color="#fff" />
            </View>
          )}
          <View style={s.avatarEdit}>
            <Ionicons name="camera-outline" size={12} color="#fff" />
          </View>
        </TouchableOpacity>
        <Text style={s.avatarHint}>{t('driverInfo.changeAvatar')}</Text>

        {/* ── Số điện thoại (read-only) ── */}
        <View style={s.sectionHeader}>
          <View style={s.sectionAccent} />
          <Text style={s.sectionTitle}>{t('auth.enterPhone') ?? 'Số điện thoại'}</Text>
        </View>
        <View style={[s.inputWrap, s.readonlyWrap]}>
          <Ionicons name="call-outline" size={18} color={BRAND} style={s.inputIcon} />
          <Text style={s.readonlyText}>{driverInfo?.phone ?? '—'}</Text>
          <View style={s.readonlyBadge}>
            <Ionicons name="lock-closed-outline" size={12} color="#94A3B8" />
          </View>
        </View>

        {/* ── Thông tin tài xế ── */}
        <View style={s.sectionHeader}>
          <View style={s.sectionAccent} />
          <Text style={s.sectionTitle}>{t('register.sectionDriverInfo')}</Text>
        </View>

        <View style={s.inputWrap}>
          <Ionicons name="person-outline" size={18} color={BRAND} style={s.inputIcon} />
          <TextInput
            style={[s.input, { textTransform: 'uppercase' }]}
            placeholder={t('register.namePlaceholder')}
            placeholderTextColor="#94A3B8"
            value={name}
            onChangeText={setName}
            autoCapitalize="characters"
          />
        </View>

        {/* ── Mô hình vận chuyển ── */}
        <View style={s.sectionHeader}>
          <View style={s.sectionAccent} />
          <Text style={s.sectionTitle}>{t('register.transportModel')}</Text>
        </View>

        <View style={s.modelRow}>
          {TRANSPORT_MODELS.map((m) => {
            const active = transportModel === m.key
            return (
              <TouchableOpacity
                key={m.key}
                style={[s.modelBtn, active && s.modelBtnActive]}
                onPress={() => handleModelChange(m.key)}
                activeOpacity={0.8}
              >
                <Ionicons name={m.icon as any} size={20} color={active ? '#fff' : BRAND} />
                <Text style={[s.modelBtnText, active && s.modelBtnTextActive]}>{t(m.labelKey)}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* ── Thông tin xe ── */}
        <View style={s.sectionHeader}>
          <View style={s.sectionAccent} />
          <Text style={s.sectionTitle}>{t('register.sectionVehicleInfo')}</Text>
        </View>

        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          scrollEnabled={vehicleOptions.length > 3}
          style={s.vehicleScroll}
          contentContainerStyle={vehicleOptions.length <= 3 ? { flex: 1, gap: 10, paddingVertical: 4 } : s.vehicleScrollContent}
        >
          {vehicleOptions.map(({ key, icon, labelKey, specKey, passengers }) => {
            const active = vehicleType === key
            return (
              <TouchableOpacity
                key={key}
                style={[s.vehicleBtn, vehicleOptions.length <= 3 ? { flex: 1 } : { width: VEHICLE_BTN_W }, active && s.vehicleBtnActive]}
                onPress={() => setVehicleType(key)}
                activeOpacity={0.8}
              >
                <Ionicons name={icon as any} size={26} color={active ? '#fff' : BRAND} />
                <Text style={[s.vehicleBtnText, active && s.vehicleBtnTextActive]}>{t(labelKey)}</Text>
                {passengers != null ? (
                  <View style={s.passengerRow}>
                    <Text style={[s.passengerCount, active && s.passengerCountActive]}>{passengers}</Text>
                    <Ionicons name="person" size={11} color={active ? 'rgba(255,255,255,0.85)' : '#64748B'} />
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Ionicons name="cube-outline" size={11} color={active ? '#fff' : BRAND} style={{ opacity: active ? 0.8 : 0.55 }} />
                    <Text style={[s.vehicleBtnSpec, active && s.vehicleBtnSpecActive]}>{t(specKey)}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
        {vehicleOptions.length > 3 && (
          <Text style={s.scrollHint}>← Trượt qua lại để xem tiếp →</Text>
        )}

        <TouchableOpacity style={s.scanCardBtnCenter} onPress={scanVehicleCard} disabled={scanLoading} activeOpacity={0.75}>
          {scanLoading
            ? <ActivityIndicator size="small" color="#fff" />
            : <>
                <Ionicons name={vehicleBrand ? 'checkmark-circle-outline' : 'scan-outline'} size={18} color="#fff" />
                <Text style={s.scanCardText}>{t('register.scanBtn')}</Text>
              </>
          }
        </TouchableOpacity>

        <View style={[s.inputWrap, s.readonlyWrap]}>
          <Ionicons name="car-outline" size={18} color={BRAND} style={s.inputIcon} />
          <Text style={vehicleBrand ? [s.input, { textTransform: 'uppercase' }] : s.lockedPlaceholder} numberOfLines={1}>
            {vehicleBrand || t('register.scanPlaceholder')}
          </Text>
          <Ionicons name="lock-closed-outline" size={13} color={vehicleBrand ? BRAND : '#CBD5E1'} />
        </View>

        <View style={[s.inputWrap, s.readonlyWrap]}>
          <Ionicons name="color-palette-outline" size={18} color={BRAND} style={s.inputIcon} />
          <Text style={vehicleColor ? s.input : s.lockedPlaceholder} numberOfLines={1}>
            {vehicleColor || t('register.scanPlaceholder')}
          </Text>
          <Ionicons name="lock-closed-outline" size={13} color={vehicleColor ? BRAND : '#CBD5E1'} />
        </View>

        <View style={[s.inputWrap, s.readonlyWrap]}>
          <Ionicons name="card-outline" size={18} color={BRAND} style={s.inputIcon} />
          <Text style={licensePlate ? [s.input, { textTransform: 'uppercase' }] : s.lockedPlaceholder} numberOfLines={1}>
            {licensePlate || t('register.scanPlaceholder')}
          </Text>
          <Ionicons name="lock-closed-outline" size={13} color={licensePlate ? BRAND : '#CBD5E1'} />
        </View>

        {plateInvalid && (
          <View style={s.plateWarnBanner}>
            <Ionicons name="warning-outline" size={16} color="#B45309" />
            <Text style={s.plateWarnText}>{plateInvalidMsg}</Text>
          </View>
        )}

        <TouchableOpacity style={[s.btn, (saving || plateInvalid) && { opacity: 0.45 }]} onPress={handleSave}
          disabled={saving || plateInvalid} activeOpacity={0.85}>
          <Ionicons name="checkmark-circle-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={s.btnText}>{saving ? t('common.loading') : t('driverInfo.save')}</Text>
        </TouchableOpacity>

      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#fff' },
  scroll: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 16, paddingBottom: 48 },
  topBar: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  backBtn: {
    width:           36,
    height:          36,
    borderRadius:    18,
    backgroundColor: '#fff',
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     '#1A2E5E',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.08,
    shadowRadius:    4,
    elevation:       2,
  },
  topTitle: { fontSize: 16, fontWeight: '700', color: BRAND },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, marginBottom: 12, marginTop: 6 },
  sectionAccent: { width: 3, height: 16, borderRadius: 2, backgroundColor: BRAND },
  sectionTitle:  { fontSize: 13, fontWeight: '700', color: BRAND, letterSpacing: 0.4, textTransform: 'uppercase' as const, opacity: 0.85 },

  inputWrap:   { flexDirection: 'row', alignItems: 'center', width: '100%', height: 52, borderWidth: 1.5, borderColor: BRAND_LIGHT, borderRadius: 14, backgroundColor: BRAND_MUTED, marginBottom: 14, paddingRight: 16 },
  readonlyWrap: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' },
  inputIcon:   { marginHorizontal: 14 },
  input:       { flex: 1, fontSize: 15, color: BRAND },
  readonlyText: { flex: 1, fontSize: 15, color: '#94A3B8' },
  readonlyBadge: { padding: 4 },

  modelRow:      { flexDirection: 'row', width: '100%', gap: 10, marginBottom: 14 },
  modelBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, borderColor: BRAND_LIGHT, backgroundColor: BRAND_MUTED },
  modelBtnActive: { backgroundColor: BRAND, borderColor: BRAND },
  modelBtnText:   { fontSize: 14, fontWeight: '600', color: BRAND },
  modelBtnTextActive: { color: '#fff' },

  vehicleScroll:        { width: '100%', marginBottom: 18 },
  vehicleScrollContent: { gap: 10, paddingVertical: 4 },
  vehicleBtn:      { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, width: VEHICLE_BTN_W, paddingHorizontal: 8, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: BRAND_LIGHT, backgroundColor: BRAND_MUTED },
  vehicleBtnActive: { backgroundColor: BRAND, borderColor: BRAND },
  vehicleBtnText:   { fontSize: 14, fontWeight: '700', color: BRAND, textAlign: 'center' },
  vehicleBtnTextActive: { color: '#fff' },
  vehicleBtnSpec:   { fontSize: 11, fontWeight: '700', color: BRAND, opacity: 0.55, textAlign: 'center' },
  vehicleBtnSpecActive: { color: '#fff', opacity: 0.8 },
  iconWrap: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  passengerRow: { flexDirection: 'row', gap: 3, alignItems: 'center', justifyContent: 'center' },
  passengerCount: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  passengerCountActive: { color: 'rgba(255,255,255,0.85)' },

  scrollHint: { fontSize: 11, color: '#94A3B8', alignSelf: 'center', marginTop: -10, marginBottom: 10 },

  btn:     { flexDirection: 'row', width: '100%', height: 52, backgroundColor: BRAND, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  lockedPlaceholder: { flex: 1, fontSize: 15, color: '#CBD5E1', fontStyle: 'italic' },
  scanCardBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: BRAND },
  scanCardBtnCenter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, backgroundColor: BRAND, marginTop: -4, marginBottom: 16 },
  scanCardText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  plateWarnBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', backgroundColor: '#FEF3C7', borderRadius: 10, borderWidth: 1, borderColor: '#FCD34D', paddingVertical: 10, paddingHorizontal: 14, marginBottom: 10 },
  plateWarnText: { flex: 1, fontSize: 13, color: '#92400E', fontWeight: '600' },

  avatarWrap:        { alignSelf: 'center', marginBottom: 6, marginTop: 4 },
  avatarImg:         { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: BRAND_LIGHT },
  avatarPlaceholder: { width: 80, height: 80, borderRadius: 40, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
  avatarInitial:     { fontSize: 30, fontWeight: '700', color: '#fff' },
  avatarLoading:     { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  avatarEdit:        { position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  avatarHint:        { fontSize: 12, color: '#94A3B8', marginBottom: 18 },
})
