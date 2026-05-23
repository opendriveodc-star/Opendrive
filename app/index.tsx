// app/index.tsx – Splash screen: kiểm tra session + điều hướng

import { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated, Image } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import * as SecureStore from 'expo-secure-store'
import { setDriverPendingTrip } from '../src/services/firestore'
import { SecureStoreKey, UserRole, DriverInfo } from '../src/types'
import { APP } from '../src/constants'

const BRAND       = '#1A2E5E'
const BTN_SIZE    = 148
const RING_OFFSET = 18
const RING_SIZE   = BTN_SIZE + RING_OFFSET * 2

export default function SplashScreen() {
  const { t } = useTranslation()
  const spinAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 1100, useNativeDriver: true })
    ).start()

    checkSession()
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

  const spinRotate = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })

  return (
    <View style={styles.container}>

      {/* Logo image */}
      <Image
        source={require('../assets/logo_od.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      {/* Tên app */}
      <Text style={styles.appName}>OpenDrive</Text>

      {/* Slogan */}
      <Text style={styles.slogan}>{t('roleSelect.slogan')}</Text>

      {/* Spinning arc – loading indicator */}
      <View style={styles.ringWrap}>
        <View style={styles.trackRing} />
        <Animated.View style={[styles.spinArc, { transform: [{ rotate: spinRotate }] }]} />
      </View>

    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: '#F7F9FD',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             0,
  },
  logo: {
    width:           120,
    height:          120,
    marginBottom:    -20,
  },
  appName: {
    marginTop:       20,
    fontSize:        28,
    fontWeight:      '800',
    color:           BRAND,
    letterSpacing:   0.5,
  },
  slogan: {
    marginTop:       6,
    fontSize:        13,
    color:           '#64748B',
    letterSpacing:   0.2,
    marginBottom:    40,
  },
  ringWrap: {
    width:           RING_SIZE,
    height:          RING_SIZE,
    alignItems:      'center',
    justifyContent:  'center',
  },
  trackRing: {
    position:        'absolute',
    width:           RING_SIZE,
    height:          RING_SIZE,
    borderRadius:    RING_SIZE / 2,
    borderWidth:     2,
    borderColor:     '#E2E8F0',
  },
  spinArc: {
    position:        'absolute',
    width:           RING_SIZE,
    height:          RING_SIZE,
    borderRadius:    RING_SIZE / 2,
    borderWidth:     3,
    borderTopColor:  BRAND,
    borderRightColor: BRAND,
    borderLeftColor:  'transparent',
    borderBottomColor: 'transparent',
  },
})
