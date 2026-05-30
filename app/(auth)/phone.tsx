// app/(auth)/phone.tsx
// Màn hình xác thực SĐT qua OTP

import { useState, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Image, StatusBar, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { showAlert } from '../../src/components/GlobalAlert'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { PhoneAuthProvider, signInWithCredential } from 'firebase/auth'
import * as SecureStore from 'expo-secure-store'
import type { UserRole, DriverInfo, CustomerInfo, MinerInfo } from '../../src/types'
import { SecureStoreKey } from '../../src/types'
import { auth } from '../../src/services/firebase'
import { getDriver, getMiner, createMiner, getCustomerPenalty, setCustomerLockedUntil, checkAndRecordAuthLog } from '../../src/services/firestore'
import { signOut } from 'firebase/auth'

const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'
const BRAND_MUTED = '#F0F4FB'

const mockRecaptchaVerifier = {
  type: 'recaptcha' as const,
  verify: () => Promise.resolve('test-token'),
  _reset: () => {},
}

export default function PhoneAuthScreen() {
  const { t }   = useTranslation()
  const params  = useLocalSearchParams<{ role: UserRole }>()
  const role    = params.role ?? 'customer'

  const recaptchaVerifier = useRef(mockRecaptchaVerifier)
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [loading, setLoading] = useState(false)
  const [verificationId, setVerificationId] = useState<string | null>(null)

  // Đầu số di động Việt Nam hợp lệ (tính từ số sau 0 / +84)
  const VN_MOBILE_PREFIXES = [
    '32','33','34','35','36','37','38','39',   // Viettel
    '86','96','97','98',                        // Viettel
    '70','79','77','76','78',                   // Mobifone
    '89','90','93',                             // Mobifone
    '81','82','83','84','85',                   // Vinaphone
    '91','94',                                  // Vinaphone
    '56','58',                                  // Vietnamobile
    '59',                                       // Gmobile
    '99',                                       // Gmobile / Reddi
  ]

  function normalizePhone(input: string): string {
    let digits = input.replace(/\D/g, '')
    if (digits.startsWith('84')) digits = digits.slice(2)
    if (digits.startsWith('0'))  digits = digits.slice(1)
    return digits.length === 9 ? `+84${digits}` : input
  }

  function isValidVietnameseMobile(normalized: string): boolean {
    if (!normalized.startsWith('+84') || normalized.length !== 12) return false
    if (__DEV__) return true // dev: bỏ qua kiểm tra prefix để dùng số test Firebase
    const prefix2 = normalized.slice(3, 5) // 2 chữ số sau +84
    return VN_MOBILE_PREFIXES.includes(prefix2)
  }

  async function sendOTP() {
    const normalized = normalizePhone(phone)
    if (!isValidVietnameseMobile(normalized)) {
      showAlert(t('error.invalidPhone'))
      return
    }

    if (process.env.EXPO_PUBLIC_TEST_AUTH === 'true') {
      auth.settings.appVerificationDisabledForTesting = true
    }

    setLoading(true)
    try {
      const phoneProvider = new PhoneAuthProvider(auth)
      const id = await phoneProvider.verifyPhoneNumber(normalized, recaptchaVerifier.current)
      setVerificationId(id)
      setStep('otp')
    } catch (e: unknown) {
      showAlert(t('common.error'), (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function verifyOTPWithValue(value: string) {
    if (value.length !== 6 || !verificationId) return
    setLoading(true)
    try {
      const credential = PhoneAuthProvider.credential(verificationId, value)
      const result = await signInWithCredential(auth, credential)
      await handleAuthResult(result.user.uid)
    } catch (e: unknown) {
      showAlert(t('error.invalidOTP'), (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAuthResult(uid: string) {
    const normalizedPhone = normalizePhone(phone)

    // Rate limit: chặn xóa data + xác thực lại trong vòng 24h
    const authCheck = await checkAndRecordAuthLog(normalizedPhone, role as 'customer' | 'driver' | 'miner')
      .catch(() => ({ blocked: false } as { blocked: boolean; lockedUntil?: number }))
    if (authCheck.blocked) {
      signOut(auth).catch(() => {})
      const hours = Math.ceil((authCheck.lockedUntil! - Date.now()) / (1000 * 60 * 60))
      showAlert(
        t('auth.rateLimitTitle'),
        t('auth.rateLimitBody', { hours }),
        [{ text: 'OK', onPress: () => router.replace('/role-select') }],
      )
      return
    }

    if (role === 'driver') {
      const doc = await getDriver(uid)
      if (doc) {
        const info: DriverInfo = {
          uid:            doc.uid,
          phone:          doc.phone,
          name:           doc.name,
          vehicleType:    doc.vehicleType,
          transportModel: doc.transportModel ?? 'passenger',
          vehicleBrand:   doc.vehicleBrand,
          vehicleColor:   doc.vehicleColor ?? '',
          licensePlate:   doc.licensePlate,
          avatarUrl:      doc.avatarUrl,
          stellarWallet:  doc.stellarWallet,
          status:         'offline',
          rating:         doc.rating,
          ratingCount:    doc.ratingCount,
          firstTripDone:  doc.firstTripDone,
          referralCount:  doc.referralCount,
          termsVersion:   doc.termsVersion,
        }
        await SecureStore.setItemAsync(SecureStoreKey.DRIVER_INFO, JSON.stringify(info))
        await SecureStore.setItemAsync(SecureStoreKey.DRIVER_ENCRYPTED_KEY, doc.encryptedPrivateKey)
        router.replace('/(driver)/home')
      } else {
        router.replace('/(auth)/register')
      }
      return
    }
    if (role === 'customer') {
      // Kiểm tra blacklist trước khi vào app
      const penalty = await getCustomerPenalty(phone).catch(() => null)
      if (penalty && penalty.cancelCount >= 3) {
        const existingLock = await SecureStore.getItemAsync(SecureStoreKey.CUSTOMER_LOCK_UNTIL)
        let lockUntil: number
        if (existingLock && parseInt(existingLock) > Date.now()) {
          lockUntil = parseInt(existingLock)
        } else if (penalty.lockedUntil && penalty.lockedUntil > Date.now()) {
          lockUntil = penalty.lockedUntil
        } else {
          lockUntil = Date.now() + 48 * 60 * 60 * 1000
          setCustomerLockedUntil(phone, lockUntil).catch(() => {})
        }
        await SecureStore.setItemAsync(SecureStoreKey.CUSTOMER_LOCK_UNTIL, String(lockUntil))
        const info: CustomerInfo = { uid, phone, cancelCount: penalty.cancelCount }
        await SecureStore.setItemAsync(SecureStoreKey.CUSTOMER_INFO, JSON.stringify(info))
        await SecureStore.setItemAsync(SecureStoreKey.USER_ROLE, 'customer')
        router.replace({ pathname: '/lock-screen', params: { lockedUntil: String(lockUntil), reason: 'frequentCancel' } })
        return
      }
      const info: CustomerInfo = { uid, phone, cancelCount: penalty?.cancelCount ?? 0 }
      await SecureStore.setItemAsync(SecureStoreKey.CUSTOMER_INFO, JSON.stringify(info))
      await SecureStore.setItemAsync(SecureStoreKey.USER_ROLE, 'customer')
      router.replace('/(customer)/home')
      return
    }
    if (role === 'miner') {
      let doc = await getMiner(uid)
      if (!doc) {
        await createMiner(uid, normalizedPhone)
        doc = await getMiner(uid)
      }
      const minerInfo: MinerInfo = {
        uid,
        phone:  normalizedPhone,
        points: doc?.points ?? 0,
      }
      await SecureStore.setItemAsync(SecureStoreKey.MINER_INFO, JSON.stringify(minerInfo))
      await SecureStore.setItemAsync(SecureStoreKey.USER_ROLE, 'miner')
      router.replace('/(mining)/home')
    }
  }

  async function verifyOTP() {
    if (otp.length !== 6 || !verificationId) return
    setLoading(true)
    try {
      const credential = PhoneAuthProvider.credential(verificationId, otp)
      const result = await signInWithCredential(auth, credential)
      await handleAuthResult(result.user.uid)
    } catch (e: unknown) {
      showAlert(t('error.invalidOTP'), (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

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
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <Image
          source={require('../../assets/logo_od.png')}
          style={s.logo}
          resizeMode="contain"
        />

        <Text style={s.slogan}>{t('roleSelect.slogan')}</Text>

        <View style={s.divider} />

        {/* Step heading */}
        <Text style={s.heading}>
          {step === 'phone' ? t('auth.enterPhone') : t('auth.enterOTP')}
        </Text>

        {step === 'phone' ? (
          <>
            <View style={s.inputWrap}>
              <Text style={s.prefix}>+84</Text>
              <View style={s.inputSep} />
              <TextInput
                style={s.input}
                placeholder={t('auth.phonePlaceholder')}
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                maxLength={12}
              />
            </View>
            <TouchableOpacity style={s.btn} onPress={sendOTP} disabled={loading} activeOpacity={0.85}>
              <Text style={s.btnText}>{loading ? t('common.loading') : t('auth.sendOTP')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={s.hint}>{t('auth.otpSent', { phone })}</Text>
            <TextInput
              style={s.otpInput}
              placeholder="• • • • • •"
              placeholderTextColor="#94A3B8"
              keyboardType="number-pad"
              value={otp}
              onChangeText={(text) => {
                setOtp(text)
                if (text.length === 6) verifyOTPWithValue(text)
              }}
              maxLength={6}
              textAlign="center"
              autoFocus
            />
            <TouchableOpacity
              style={[s.btn, otp.length < 6 && s.btnDisabled]}
              onPress={verifyOTP}
              disabled={loading || otp.length < 6}
              activeOpacity={0.85}
            >
              <Text style={s.btnText}>{loading ? t('auth.verifying') : t('common.confirm')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.resend} onPress={() => setStep('phone')} activeOpacity={0.7}>
              <Text style={s.resendText}>{t('auth.changePhone')}</Text>
            </TouchableOpacity>
          </>
        )}

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
    paddingTop:        24,
    paddingBottom:     40,
  },

  topBar: {
    flexDirection:   'row',
    alignItems:      'center',
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

  logo: {
    width:        160,
    height:       160,
    marginBottom: -28,
  },
  slogan: {
    fontSize:      13,
    fontStyle:     'italic',
    color:         BRAND,
    textAlign:     'center',
    opacity:       0.6,
    letterSpacing: 0.3,
    marginBottom:  12,
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
    marginBottom:  24,
    letterSpacing: 0.1,
  },

  // Phone input row
  inputWrap: {
    flexDirection:   'row',
    alignItems:      'center',
    width:           '100%',
    height:          54,
    borderWidth:     1.5,
    borderColor:     BRAND_LIGHT,
    borderRadius:    14,
    backgroundColor: BRAND_MUTED,
    marginBottom:    16,
    paddingLeft:     16,
  },
  prefix: {
    fontSize:   16,
    fontWeight: '600',
    color:      BRAND,
  },
  inputSep: {
    width:           1,
    height:          24,
    backgroundColor: BRAND_LIGHT,
    marginHorizontal: 12,
  },
  input: {
    flex:     1,
    fontSize: 16,
    color:    BRAND,
  },

  // OTP input
  otpInput: {
    width:           '100%',
    height:          54,
    borderWidth:     1.5,
    borderColor:     BRAND_LIGHT,
    borderRadius:    14,
    backgroundColor: BRAND_MUTED,
    fontSize:        22,
    fontWeight:      '700',
    color:           BRAND,
    letterSpacing:   8,
    marginBottom:    16,
    paddingHorizontal: 16,
  },

  hint: {
    fontSize:     13,
    color:        '#64748B',
    textAlign:    'center',
    marginBottom: 16,
    lineHeight:   20,
  },

  btn: {
    width:           '100%',
    height:          52,
    backgroundColor: BRAND,
    borderRadius:    14,
    justifyContent:  'center',
    alignItems:      'center',
  },
  btnText: {
    color:      '#FFFFFF',
    fontSize:   16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  btnDisabled: {
    opacity: 0.4,
  },

  resend: {
    marginTop: 16,
  },
  resendText: {
    fontSize:  14,
    color:     BRAND,
    opacity:   0.7,
    textAlign: 'center',
  },
})
