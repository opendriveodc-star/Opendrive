// app/(driver)/_layout.tsx

import { Stack } from 'expo-router'

export default function DriverLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="home" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="history" />
      <Stack.Screen name="wallet" />
      <Stack.Screen name="referral" />
      <Stack.Screen name="online" />
      <Stack.Screen name="quote-config" />
      <Stack.Screen name="driver-info" />
      <Stack.Screen name="bidding" />
      <Stack.Screen name="trip" />
      <Stack.Screen name="pending-trip" />
    </Stack>
  )
}
