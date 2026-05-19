// src/services/network.ts
// Detect WiFi vs 4G/5G

import NetInfo from '@react-native-community/netinfo'

export async function isOnWifi(): Promise<boolean> {
  if (__DEV__) return false
  const state = await NetInfo.fetch()
  return state.type === 'wifi'
}

export function subscribeNetworkChanges(
  callback: (isConnected: boolean, isWifi: boolean) => void
): () => void {
  return NetInfo.addEventListener((state) => {
    callback(state.isConnected ?? false, state.type === 'wifi')
  })
}
