// app/index.tsx – Splash screen: kiểm tra session + điều hướng

import { useEffect, useRef } from 'react'
import { View, StyleSheet, Animated, Image } from 'react-native'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { setDriverPendingTrip } from '../src/services/firestore'
import { SecureStoreKey, DriverInfo } from '../src/types'
import { APP } from '../src/constants'

export default function SplashScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start()

    setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 1000,
        useNativeDriver: true,
      }).start(() => checkSession())
    }, 2000)
  }, [])

  async function checkSession() {
    try {
      const [role, driverRaw, customerRaw, minerRaw, lockUntil, pending] = await Promise.all([
        SecureStore.getItemAsync(SecureStoreKey.USER_ROLE),
        SecureStore.getItemAsync(SecureStoreKey.DRIVER_INFO),
        SecureStore.getItemAsync(SecureStoreKey.CUSTOMER_INFO),
        SecureStore.getItemAsync(SecureStoreKey.MINER_INFO),
        SecureStore.getItemAsync(SecureStoreKey.DRIVER_LOCK_UNTIL),
        SecureStore.getItemAsync(SecureStoreKey.PENDING_TRIP),
      ])

      if (!role) { router.replace('/role-select'); return }

      if (role === 'driver') {
        if (!driverRaw) { router.replace('/role-select'); return }
        const info: DriverInfo = JSON.parse(driverRaw)

        if (info.termsVersion !== APP.TERMS_VERSION) {
          router.replace('/(auth)/terms-update')
          return
        }

        if (lockUntil) {
          if (parseInt(lockUntil) > Date.now()) {
            router.replace({ pathname: '/lock-screen', params: { lockedUntil: lockUntil, reason: 'fraud' } })
            return
          } else {
            SecureStore.deleteItemAsync(SecureStoreKey.DRIVER_LOCK_UNTIL)
            setDriverPendingTrip(info.uid, false).catch(() => {})
          }
        }

        if (pending && info.status === 'busy') {
          router.replace('/(driver)/pending-trip')
          return
        }

        if (info.status === 'ready') {
          router.replace('/(driver)/online')
          return
        }

        router.replace('/(driver)/home')
        return
      }

      if (role === 'customer') {
        if (!customerRaw) { router.replace('/role-select'); return }
        router.replace('/(customer)/home')
        return
      }

      if (role === 'miner') {
        if (!minerRaw) { router.replace('/role-select'); return }
        router.replace('/(mining)/home')
        return
      }

      router.replace('/role-select')
    } catch {
      router.replace('/role-select')
    }
  }

  return (
    <View style={styles.safe}>
      <Animated.Image
        source={require('../assets/logo_od.png')}
        style={[styles.logo, { opacity: fadeAnim }]}
        resizeMode="contain"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: '#F7F9FD',
    alignItems:      'center',
    justifyContent:  'center',
  },
  logo: {
    width:  200,
    height: 200,
  },
})
