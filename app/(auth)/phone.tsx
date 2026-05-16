// app/(auth)/phone.tsx
// Màn hình xác thực SĐT qua OTP

import { useState, useRef } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha'
import { useTranslation } from 'react-i18next'
import { PhoneAuthProvider, signInWithCredential } from 'firebase/auth'
import type { UserRole } from '../../src/types'
import { auth } from '../../src/services/firebase'
import { FIREBASE } from '../../src/constants'

export default function PhoneAuthScreen() {
  const { t }   = useTranslation()
  const params  = useLocalSearchParams<{ role: UserRole }>()
  const role    = params.role ?? 'customer'

  const recaptchaVerifier = useRef<any>(null)
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
    const prefix2 = normalized.slice(3, 5) // 2 chữ số sau +84
    return VN_MOBILE_PREFIXES.includes(prefix2)
  }

  async function sendOTP() {
    const normalized = normalizePhone(phone)
    if (!isValidVietnameseMobile(normalized)) {
      Alert.alert(t('error.invalidPhone'))
      return
    }

    setLoading(true)
    try {
      const phoneProvider = new PhoneAuthProvider(auth)
      const id = await phoneProvider.verifyPhoneNumber(normalized, recaptchaVerifier.current)
      setVerificationId(id)
      setStep('otp')
    } catch (e: unknown) {
      Alert.alert(t('common.error'), (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function verifyOTP() {
    if (otp.length !== 6 || !verificationId) {
      Alert.alert(t('error.invalidOTP'))
      return
    }

    setLoading(true)
    try {
      const credential = PhoneAuthProvider.credential(verificationId, otp)
      await signInWithCredential(auth, credential)
      if (role === 'driver') router.replace('/(auth)/register')
      if (role === 'customer') router.replace('/(customer)/home')
      if (role === 'miner') router.replace('/(mining)/home')
    } catch (e: unknown) {
      Alert.alert(t('error.invalidOTP'), (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <FirebaseRecaptchaVerifierModal
        ref={recaptchaVerifier}
        firebaseConfig={FIREBASE}
        attemptInvisibleVerification
      />
      <Text style={styles.title}>
        {step === 'phone' ? t('auth.enterPhone') : t('auth.enterOTP')}
      </Text>

      {step === 'phone' ? (
        <>
          <TextInput
            style={styles.input}
            placeholder={t('auth.phonePlaceholder')}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            maxLength={11}
          />
          <TouchableOpacity style={styles.btn} onPress={sendOTP} disabled={loading}>
            <Text style={styles.btnText}>{loading ? t('common.loading') : t('auth.sendOTP')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.hint}>{t('auth.otpSent', { phone })}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('auth.otpPlaceholder')}
            keyboardType="number-pad"
            value={otp}
            onChangeText={setOtp}
            maxLength={6}
          />
          <TouchableOpacity style={styles.btn} onPress={verifyOTP} disabled={loading}>
            <Text style={styles.btnText}>{loading ? t('auth.verifying') : t('common.confirm')}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#F8FAFC' },
  title:     { fontSize: 24, fontWeight: '700', color: '#0F172A', marginBottom: 32 },
  hint:      { fontSize: 14, color: '#64748B', marginBottom: 16 },
  input:     {
    height: 52, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12,
    paddingHorizontal: 16, fontSize: 16, backgroundColor: '#fff', marginBottom: 16,
  },
  btn:       {
    height: 56, backgroundColor: '#1A56DB', borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  btnText:   { color: '#fff', fontSize: 18, fontWeight: '600' },
})
