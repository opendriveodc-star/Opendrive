import { useEffect, useState } from 'react'
import { View, Text, TextInput } from 'react-native'
import { Stack } from 'expo-router'
import { initI18n } from '../src/i18n'
import GlobalAlert from '../src/components/GlobalAlert'

// Tắt font scaling toàn app – tránh layout vỡ khi user tăng cỡ chữ hệ thống
// @ts-ignore
Text.defaultProps = { ...(Text.defaultProps ?? {}), allowFontScaling: false }
// @ts-ignore
TextInput.defaultProps = { ...(TextInput.defaultProps ?? {}), allowFontScaling: false }

// Firebase Firestore WebChannel transport logs console.warn directly,
// bypassing setLogLevel. Filter it out – it's cosmetic noise on logout.
const _warn = console.warn
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('@firebase/firestore')) return
  _warn.apply(console, args)
}

export default function RootLayout() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    initI18n().then(() => setReady(true))
  }, [])

  if (!ready) return <View style={{ flex: 1, backgroundColor: '#fff' }} />

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <GlobalAlert />
    </>
  )
}
