// src/components/NetworkAlert.tsx
// Modal bottom sheet cảnh báo khi đang dùng WiFi

import React from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { useTranslation } from 'react-i18next'

interface NetworkAlertProps {
  visible:   boolean
  onDismiss: () => void
}

export default function NetworkAlert({ visible, onDismiss }: NetworkAlertProps) {
  const { t } = useTranslation()

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.icon}>📶</Text>
          <Text style={styles.message}>{t('network.wifiWarning')}</Text>
          <TouchableOpacity style={styles.button} onPress={onDismiss}>
            <Text style={styles.buttonText}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex:            1,
    justifyContent:  'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor:  '#FFFFFF',
    borderTopLeftRadius:  16,
    borderTopRightRadius: 16,
    padding:          24,
    alignItems:       'center',
  },
  icon: {
    fontSize:     40,
    marginBottom: 12,
  },
  message: {
    fontSize:      16,
    textAlign:     'center',
    color:         '#374151',
    marginBottom:  24,
    lineHeight:    24,
  },
  button: {
    backgroundColor: '#1A56DB',
    paddingVertical:   12,
    paddingHorizontal: 32,
    borderRadius:      8,
    width:             '100%',
    alignItems:        'center',
  },
  buttonText: {
    color:      '#FFFFFF',
    fontSize:   16,
    fontWeight: '600',
  },
})
