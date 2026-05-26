// app/(auth)/register.tsx
// Đăng ký tài xế mới: nhập thông tin → tạo ví Stellar → ghi Firestore

import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Image, StatusBar, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { showAlert, showActionSheet } from '../../src/components/GlobalAlert'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { auth, uploadDriverAvatar } from '../../src/services/firebase'
import { createDriver } from '../../src/services/firestore'
import { createWallet } from '../../src/services/cloudflare'
import { SecureStoreKey, VehicleType, DriverInfo } from '../../src/types'
import { APP } from '../../src/constants'
import { TRANSPORT_MODELS, TransportModel, VehicleKey } from '../../src/data/vehicles'

// Lazy – requires dev client rebuild with expo-image-picker + expo-image-manipulator + expo-camera
let ImagePicker: typeof import('expo-image-picker') | null = null
let ImageManipulator: typeof import('expo-image-manipulator') | null = null
let ExpoCamera: typeof import('expo-camera') | null = null
try { ImagePicker = require('expo-image-picker') } catch { ImagePicker = null }
try { ImageManipulator = require('expo-image-manipulator') } catch { ImageManipulator = null }
try { ExpoCamera = require('expo-camera') } catch { ExpoCamera = null }

const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'
const BRAND_MUTED = '#F0F4FB'
const SCREEN_W        = Dimensions.get('window').width
const VEHICLE_BTN_W   = Math.floor((SCREEN_W - 56 - 20) / 3)  // 56 = 2×28 padding, 20 = 2 gaps

// ── Header dùng chung (logo + slogan + divider) ──────────────────────────────
function PageHeader({ t }: { t: (k: string) => string }) {
  return (
    <>
      <Image
        source={require('../../assets/logo_od.png')}
        style={s.logo}
        resizeMode="contain"
      />
      <Text style={s.slogan}>{t('roleSelect.slogan')}</Text>
      <View style={s.divider} />
    </>
  )
}

export default function RegisterScreen() {
  const { t } = useTranslation()

  const [step,            setStep]           = useState<'form' | 'success'>('form')
  const [driverName,      setDriverName]      = useState('')
  const [name,            setName]            = useState('')
  const [transportModel,  setTransportModel]  = useState<TransportModel>('passenger')
  const [vehicleType,     setVehicleType]     = useState<VehicleKey>('motorbike')
  const [vehicleBrand,    setVehicleBrand]    = useState('')
  const [vehicleColor,    setVehicleColor]    = useState('')

  const currentModel   = TRANSPORT_MODELS.find(m => m.key === transportModel)!
  const vehicleOptions = currentModel.vehicles

  function handleModelChange(model: TransportModel) {
    setTransportModel(model)
    const cfg = TRANSPORT_MODELS.find(m => m.key === model)!
    if (!cfg.vehicles.find(v => v.key === vehicleType)) {
      setVehicleType(cfg.vehicles[0].key)
    }
  }
  const [licensePlate,    setLicensePlate]    = useState('')
  const [referralCode,    setReferralCode]    = useState('')
  const [scanning,        setScanning]        = useState(false)
  const [termsChecked,    setTermsChecked]    = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [avatarUri,       setAvatarUri]       = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  async function pickAvatar() {
    if (!ImagePicker) {
      showAlert(t('common.error'), 'Cần build lại app để dùng tính năng này')
      return
    }
    showActionSheet('Ảnh đại diện', [
      { text: 'Chụp ảnh',         icon: 'camera-outline',  onPress: () => launchPicker('camera') },
      { text: 'Chọn từ thư viện', icon: 'image-outline',   onPress: () => launchPicker('library') },
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

  async function openQrScanner() {
    if (!ExpoCamera) {
      showAlert(t('common.error'), 'Cần build lại app để dùng tính năng này')
      return
    }
    const { status } = await ExpoCamera.Camera.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      showAlert(t('common.error'), 'Cần cấp quyền truy cập camera')
      return
    }
    setScanning(true)
  }

  function handleScan({ data }: { data: string }) {
    setReferralCode(data.trim())
    setScanning(false)
  }

  async function handleRegister() {
    if (!avatarUri) {
      showAlert(t('common.error'), 'Vui lòng thêm ảnh đại diện')
      return
    }
    if (!name.trim() || !vehicleBrand.trim() || !licensePlate.trim()) {
      showAlert(t('common.error'), 'Vui lòng điền đầy đủ thông tin')
      return
    }
    if (!termsChecked) {
      showAlert(t('common.error'), t('terms.mustAgree'))
      return
    }

    setLoading(true)
    try {
      const user = auth.currentUser
      if (!user) throw new Error('Not authenticated')

      const { stellarWallet, encryptedPrivateKey } = await createWallet(user.uid)

      let avatarUrl: string | undefined
      if (avatarUri) {
        setUploadingAvatar(true)
        try { avatarUrl = await uploadDriverAvatar(user.uid, avatarUri) } catch { /* optional */ }
        setUploadingAvatar(false)
      }

      const driverInfo: DriverInfo = {
        uid:            user.uid,
        phone:          user.phoneNumber ?? '',
        name:           name.trim().toUpperCase(),
        vehicleType,
        transportModel,
        vehicleBrand:   vehicleBrand.trim(),
        vehicleColor:   vehicleColor.trim().replace(/\b\w/g, c => c.toUpperCase()),
        licensePlate:   licensePlate.trim().toUpperCase(),
        avatarUrl,
        stellarWallet,
        status:         'offline',
        rating:         0,
        ratingCount:    0,
        firstTripDone:  false,
        referralCount:  0,
        termsVersion:   APP.TERMS_VERSION,
      }

      await SecureStore.setItemAsync(SecureStoreKey.DRIVER_INFO,          JSON.stringify(driverInfo))
      await SecureStore.setItemAsync(SecureStoreKey.DRIVER_ENCRYPTED_KEY, encryptedPrivateKey)
      await SecureStore.setItemAsync(SecureStoreKey.USER_ROLE,            'driver')

      await createDriver(user.uid, {
        uid:                 user.uid,
        phone:               user.phoneNumber ?? '',
        name:                name.trim().toUpperCase(),
        vehicleType,
        transportModel,
        vehicleBrand:        vehicleBrand.trim(),
        vehicleColor:        vehicleColor.trim().toUpperCase(),
        licensePlate:        licensePlate.trim().toUpperCase(),
        avatarUrl:           avatarUrl ?? null,
        stellarWallet,
        encryptedPrivateKey,
        geohash:             '',
        status:              'offline',
        rating:              0,
        ratingCount:         0,
        firstTripDone:       false,
        referralCount:       0,
        referredBy:          referralCode.trim() || null,
        random_id:           Math.floor(Math.random() * 6),
        termsVersion:        APP.TERMS_VERSION,
      })

      setDriverName(name.trim().toUpperCase())
      setStep('success')
    } catch (e: unknown) {
      showAlert(t('common.error'), (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // ── Màn hình chúc mừng ────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <View style={s.root}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <ScrollView contentContainerStyle={s.scroll}>
          <PageHeader t={t} />

          <View style={s.successBadge}>
            <Ionicons name="checkmark-circle" size={64} color={BRAND} />
          </View>

          <Text style={s.successTitle}>{t('register.successTitle', { name: driverName })}</Text>

          <Text style={s.successBody}>{t('register.successBody')}</Text>

          <TouchableOpacity
            style={s.btn}
            onPress={() => router.replace('/(driver)/home')}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={s.btnText}>{t('register.startJourney')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    )
  }

  // ── Form khai báo ─────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/role-select')} activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={BRAND} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.formScroll} keyboardShouldPersistTaps="handled">

        {/* Avatar upload – thay logo */}
        <TouchableOpacity style={s.avatarWrap} onPress={pickAvatar} activeOpacity={0.8}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={s.avatarImg} />
          ) : (
            <View style={s.avatarPlaceholder}>
              <Ionicons name="camera-outline" size={34} color="#fff" />
              <Text style={s.avatarPlaceholderText}>Thêm ảnh</Text>
            </View>
          )}
          {uploadingAvatar && (
            <View style={s.avatarLoading}>
              <ActivityIndicator size="small" color="#fff" />
            </View>
          )}
          <View style={s.avatarEdit}>
            <Ionicons name={avatarUri ? 'pencil-outline' : 'add-outline'} size={12} color="#fff" />
          </View>
        </TouchableOpacity>
        <Text style={s.avatarHint}>{t('register.avatarHint')}</Text>
        <View style={s.divider} />

        <Text style={s.heading}>{t('register.title')}</Text>

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
            autoCorrect={false}
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
                <Text style={[s.modelBtnText, active && s.modelBtnTextActive]}>
                  {t(m.labelKey)}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* ── Thông tin xe ── */}
        <View style={s.sectionHeader}>
          <View style={s.sectionAccent} />
          <Text style={s.sectionTitle}>{t('register.sectionVehicleInfo')}</Text>
        </View>

        {/* Loại xe – scrollable 1 hàng, card dọc có thông số */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
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
                <Text style={[s.vehicleBtnText, active && s.vehicleBtnTextActive]}>
                  {t(labelKey)}
                </Text>
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

        <View style={s.inputWrap}>
          <Ionicons name="car-outline" size={18} color={BRAND} style={s.inputIcon} />
          <TextInput
            style={[s.input, { textTransform: 'uppercase' }]}
            placeholder={t('register.brandPlaceholder')}
            placeholderTextColor="#94A3B8"
            value={vehicleBrand}
            onChangeText={setVehicleBrand}
            autoCapitalize="characters"
          />
        </View>

        <View style={s.inputWrap}>
          <Ionicons name="color-palette-outline" size={18} color={BRAND} style={s.inputIcon} />
          <TextInput
            style={s.input}
            placeholder={t('register.colorPlaceholder')}
            placeholderTextColor="#94A3B8"
            value={vehicleColor}
            onChangeText={v => setVehicleColor(v.replace(/(?:^|\s)\S/g, c => c.toUpperCase()))}
            autoCapitalize="words"
          />
        </View>

        <View style={s.inputWrap}>
          <Ionicons name="card-outline" size={18} color={BRAND} style={s.inputIcon} />
          <TextInput
            style={[s.input, { textTransform: 'uppercase' }]}
            placeholder={t('register.platePlaceholder')}
            placeholderTextColor="#94A3B8"
            value={licensePlate}
            onChangeText={setLicensePlate}
            autoCapitalize="characters"
          />
        </View>

        {/* ── Mã giới thiệu bạn bè ── */}
        <View style={s.sectionHeader}>
          <View style={s.sectionAccent} />
          <Text style={s.sectionTitle}>{t('register.sectionReferral')}</Text>
        </View>

        <View style={s.inputWrap}>
          <Ionicons name="gift-outline" size={18} color={BRAND} style={s.inputIcon} />
          <TextInput
            style={s.input}
            placeholder={t('register.referralPlaceholder')}
            placeholderTextColor="#94A3B8"
            value={referralCode}
            onChangeText={setReferralCode}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={openQrScanner} style={s.scanBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="qr-code-outline" size={20} color={BRAND} />
          </TouchableOpacity>
        </View>

        {/* QR Scanner Modal */}
        {scanning && ExpoCamera && (
          <Modal visible animationType="slide" onRequestClose={() => setScanning(false)}>
            <View style={s.scanModal}>
              <ExpoCamera.CameraView
                style={s.scanCamera}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={handleScan}
              />
              <SafeAreaView style={s.scanOverlay} edges={['top']}>
                <TouchableOpacity style={s.scanClose} onPress={() => setScanning(false)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
                <View style={s.scanFrame} />
                <Text style={s.scanHint}>Đưa mã QR vào khung</Text>
              </SafeAreaView>
            </View>
          </Modal>
        )}

        {/* Điều khoản */}
        <TouchableOpacity style={s.checkRow} onPress={() => setTermsChecked(!termsChecked)} activeOpacity={0.8}>
          <View style={[s.checkbox, termsChecked && s.checkboxChecked]}>
            {termsChecked && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
          <Text style={s.checkLabel}>
            {t('terms.readAndAgree')}{' '}
            <Text style={s.termsLink} onPress={() => router.push('/(auth)/terms')}>
              {t('terms.termsLink')}
            </Text>
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.btn} onPress={handleRegister} disabled={loading} activeOpacity={0.85}>
          <Text style={s.btnText}>{loading ? t('register.creating') : t('common.continue')}</Text>
        </TouchableOpacity>

      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: '#FFFFFF',
  },
  scroll: {
    alignItems:        'center',
    paddingHorizontal: 28,
    paddingTop:        92,
    paddingBottom:     48,
  },

  topBar: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
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
  formScroll: {
    alignItems:        'center',
    paddingHorizontal: 28,
    paddingTop:        16,
    paddingBottom:     48,
  },

  // ── Header / Avatar ──
  logo: {
    width:        160,
    height:       160,
    marginBottom: -28,
  },

  avatarWrap:        { alignSelf: 'center', marginBottom: 10, marginTop: 4 },
  avatarImg:         { width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: BRAND_LIGHT },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', gap: 4 },
  avatarPlaceholderText: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  avatarLoading:     { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  avatarEdit:        { position: 'absolute', bottom: 2, right: 2, width: 26, height: 26, borderRadius: 13, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },

  slogan: {
    fontSize:      13,
    fontStyle:     'italic',
    color:         BRAND,
    textAlign:     'center',
    opacity:       0.6,
    letterSpacing: 0.3,
    marginBottom:  12,
  },
  avatarHint: {
    fontSize:      12,
    fontStyle:     'italic',
    color:         BRAND,
    textAlign:     'center',
    opacity:       0.75,
    letterSpacing: 0.2,
    marginBottom:  12,
    paddingHorizontal: 12,
  },
  divider: {
    width:           '70%',
    height:          1,
    backgroundColor: '#E2E8F0',
    marginVertical:  20,
  },

  heading: {
    fontSize:      18,
    fontWeight:    '700',
    color:         BRAND,
    textAlign:     'center',
    marginBottom:  22,
    letterSpacing: 0.1,
    alignSelf:     'center',
  },

  // ── Section headers ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    alignSelf:     'flex-start',
    gap:           8,
    marginBottom:  12,
    marginTop:     6,
  },
  sectionAccent: {
    width:           3,
    height:          16,
    borderRadius:    2,
    backgroundColor: BRAND,
  },
  sectionTitle: {
    fontSize:      13,
    fontWeight:    '700',
    color:         BRAND,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
    opacity:       0.85,
  },

  scrollHint: { fontSize: 11, color: '#94A3B8', alignSelf: 'center', marginTop: -10, marginBottom: 10 },

  // ── Inputs ──
  label: {
    fontSize:     13,
    fontWeight:   '600',
    color:        BRAND,
    opacity:      0.8,
    alignSelf:    'flex-start',
    marginBottom: 10,
  },
  inputWrap: {
    flexDirection:   'row',
    alignItems:      'center',
    width:           '100%',
    height:          52,
    borderWidth:     1.5,
    borderColor:     BRAND_LIGHT,
    borderRadius:    14,
    backgroundColor: BRAND_MUTED,
    marginBottom:    14,
    paddingRight:    16,
  },
  inputIcon: {
    marginHorizontal: 14,
  },
  input: {
    flex:     1,
    fontSize: 15,
    color:    BRAND,
  },
  scanBtn: {
    paddingHorizontal: 14,
  },
  scanModal: { flex: 1, backgroundColor: '#000' },
  scanCamera: { flex: 1 },
  scanOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
  },
  scanClose: {
    alignSelf: 'flex-start', margin: 16,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  scanFrame: {
    width: 220, height: 220,
    borderWidth: 2, borderColor: '#fff', borderRadius: 16,
    marginTop: 80,
  },
  scanHint: { color: '#fff', fontSize: 14, marginTop: 16, opacity: 0.85 },

  // ── Transport model toggle ──
  modelRow: {
    flexDirection: 'row',
    width:         '100%',
    gap:           10,
    marginBottom:  14,
  },
  modelBtn: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               7,
    paddingVertical:   13,
    borderRadius:      14,
    borderWidth:       1.5,
    borderColor:       BRAND_LIGHT,
    backgroundColor:   BRAND_MUTED,
  },
  modelBtnActive: {
    backgroundColor: BRAND,
    borderColor:     BRAND,
  },
  modelBtnText: {
    fontSize:   14,
    fontWeight: '600',
    color:      BRAND,
  },
  modelBtnTextActive: {
    color: '#FFFFFF',
  },

  // ── Vehicle selector – scrollable row ──
  vehicleScroll: {
    width:        '100%',
    marginBottom: 18,
  },
  vehicleScrollContent: {
    gap:            10,
    paddingVertical: 4,
  },
  vehicleBtn: {
    flexDirection:   'column',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             5,
    width:           VEHICLE_BTN_W,
    paddingHorizontal: 8,
    paddingVertical:   14,
    borderRadius:    16,
    borderWidth:     1.5,
    borderColor:     BRAND_LIGHT,
    backgroundColor: BRAND_MUTED,
  },
  vehicleBtnActive: {
    backgroundColor: BRAND,
    borderColor:     BRAND,
  },
  vehicleBtnText: {
    fontSize:   14,
    fontWeight: '700',
    color:      BRAND,
    textAlign:  'center',
  },
  vehicleBtnTextActive: {
    color: '#FFFFFF',
  },
  vehicleBtnSpec: {
    fontSize:   11,
    fontWeight: '700',
    color:      BRAND,
    opacity:    0.55,
    textAlign:  'center',
  },
  vehicleBtnSpecActive: {
    color:   '#FFFFFF',
    opacity: 0.8,
  },
  iconWrap: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  passengerRow: {
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerCount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  passengerCountActive: {
    color: 'rgba(255,255,255,0.85)',
  },

  // ── Terms ──
  checkRow: {
    flexDirection: 'row',
    alignItems:    'center',
    width:         '100%',
    marginBottom:  24,
    gap:           12,
  },
  checkbox: {
    width:           22,
    height:          22,
    borderRadius:    6,
    borderWidth:     1.5,
    borderColor:     BRAND_LIGHT,
    backgroundColor: BRAND_MUTED,
    justifyContent:  'center',
    alignItems:      'center',
  },
  checkboxChecked: {
    backgroundColor: BRAND,
    borderColor:     BRAND,
  },
  checkLabel: {
    flex:       1,
    fontSize:   13,
    color:      '#475569',
    lineHeight: 20,
  },
  termsLink: {
    color:      BRAND,
    fontWeight: '600',
  },

  // ── Button ──
  btn: {
    flexDirection:   'row',
    width:           '100%',
    height:          52,
    backgroundColor: BRAND,
    borderRadius:    14,
    justifyContent:  'center',
    alignItems:      'center',
  },
  btnText: {
    color:         '#FFFFFF',
    fontSize:      16,
    fontWeight:    '700',
    letterSpacing: 0.3,
  },

  // ── Success screen ──
  successBadge: {
    marginBottom: 20,
  },
  successTitle: {
    fontSize:      22,
    fontWeight:    '800',
    color:         BRAND,
    textAlign:     'center',
    marginBottom:  16,
    letterSpacing: 0.2,
  },
  successBody: {
    fontSize:     14,
    color:        '#475569',
    textAlign:    'center',
    lineHeight:   22,
    marginBottom: 36,
  },
  successBold: {
    fontWeight: '700',
    color:      BRAND,
  },
})
