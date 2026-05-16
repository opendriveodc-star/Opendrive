// app/role-select.tsx
// Màn hình chọn vai trò: Tài Xế | Khách | Đào Coin

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { useTranslation } from 'react-i18next'
import { SecureStoreKey, UserRole } from '../src/types'

export default function RoleSelectScreen() {
  const { t } = useTranslation()

  async function selectRole(role: UserRole) {
    await SecureStore.setItemAsync(SecureStoreKey.USER_ROLE, role)
    router.replace(`/(auth)/phone?role=${role}`)
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>OpenDrive</Text>
      <Text style={styles.subtitle}>{t('roleSelect.title')}</Text>

      <View style={styles.buttons}>
        <TouchableOpacity style={[styles.btn, { backgroundColor: '#15803D' }]} onPress={() => selectRole('driver')}>
          <Text style={styles.btnText}>🏍 {t('roleSelect.driver')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, { backgroundColor: '#1A56DB' }]} onPress={() => selectRole('customer')}>
          <Text style={styles.btnText}>🙋 {t('roleSelect.customer')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, { backgroundColor: '#0891B2' }]} onPress={() => selectRole('miner')}>
          <Text style={styles.btnText}>⛏ {t('roleSelect.miner')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    justifyContent:  'center',
    alignItems:      'center',
    padding:         24,
    backgroundColor: '#F8FAFC',
  },
  logo: {
    fontSize:   32,
    fontWeight: '700',
    color:      '#1A56DB',
    marginBottom: 8,
  },
  subtitle: {
    fontSize:     16,
    color:        '#64748B',
    marginBottom: 48,
  },
  buttons: {
    width: '100%',
    gap:   16,
  },
  btn: {
    height:         56,
    borderRadius:   16,
    justifyContent: 'center',
    alignItems:     'center',
  },
  btnText: {
    color:      '#fff',
    fontSize:   18,
    fontWeight: '600',
  },
})
