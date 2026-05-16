import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { initI18n } from '../src/i18n'

export default function RootLayout() {
  useEffect(() => {
    initI18n()
  }, [])

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(driver)" />
      <Stack.Screen name="(customer)" />
      <Stack.Screen name="(mining)" />
    </Stack>
  )
}
