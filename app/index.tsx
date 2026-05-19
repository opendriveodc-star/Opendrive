// app/index.tsx
// Màn hình Splash – kiểm tra SecureStore → điều hướng đến đúng role

import { useEffect } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { SecureStoreKey, UserRole, DriverInfo } from '../src/types'
import { APP } from '../src/constants'
import Logo from '../src/components/Logo'

export default function SplashScreen() {
  useEffect(() => {
    checkSession()
  }, [])

  async function checkSession() {
    try {
      const role = await SecureStore.getItemAsync(SecureStoreKey.USER_ROLE) as UserRole | null

      if (!role) {
        router.replace('/role-select')
        return
      }

      if (role === 'driver') {
        const raw = await SecureStore.getItemAsync(SecureStoreKey.DRIVER_INFO)
        if (!raw) { router.replace('/role-select'); return }

        const info: DriverInfo = JSON.parse(raw)

        if (info.termsVersion !== APP.TERMS_VERSION) {
          router.replace('/(auth)/terms-update')
          return
        }

        const lockUntil = await SecureStore.getItemAsync(SecureStoreKey.DRIVER_LOCK_UNTIL)
        if (lockUntil && parseInt(lockUntil) > Date.now()) {
          router.replace({ pathname: '/lock-screen', params: { lockedUntil: lockUntil, reason: 'fraud' } })
          return
        }

        const pending = await SecureStore.getItemAsync(SecureStoreKey.PENDING_TRIP)
        if (pending && info.status === 'busy') {
          router.replace('/(driver)/pending-trip')
          return
        }

        router.replace('/(driver)/home')
        return
      }

      if (role === 'customer') {
        const raw = await SecureStore.getItemAsync(SecureStoreKey.CUSTOMER_INFO)
        if (!raw) { router.replace('/role-select'); return }
        router.replace('/(customer)/home')
        return
      }

      if (role === 'miner') {
        const raw = await SecureStore.getItemAsync(SecureStoreKey.MINER_INFO)
        if (!raw) { router.replace('/role-select'); return }
        router.replace('/(mining)/home')
        return
      }

      router.replace('/role-select')
    } catch {
      router.replace('/role-select')
    }
  }

  return (
    <View style={styles.container}>
      <Logo wheelSize={56} fontSize={42} />
      <ActivityIndicator size="small" color="#94A3B8" style={styles.spinner} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: '#fff',
    gap:             0,
  },
  spinner: {
    marginTop: 32,
  },
})
