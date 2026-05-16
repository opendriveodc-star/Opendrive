// app/(auth)/terms.tsx
// WebView hiển thị điều khoản – nút "Đã đọc" ở cuối trang gửi postMessage về app

import { View, StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'
import { router } from 'expo-router'
import { APP } from '../../src/constants'

export default function TermsScreen() {
  function onMessage(event: { nativeEvent: { data: string } }) {
    if (event.nativeEvent.data === 'terms_accepted') {
      router.back()
    }
  }

  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: APP.TERMS_URL }}
        onMessage={onMessage}
        javaScriptEnabled
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
})
