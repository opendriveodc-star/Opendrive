// app/(driver)/wallet-qr.tsx

import React, { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { WebView } from 'react-native-webview'
import QRCode from 'qrcode'
import { router, useLocalSearchParams } from 'expo-router'
import * as MediaLibrary from 'expo-media-library'
import * as FileSystem from 'expo-file-system'
import { showAlert } from '../../src/components/GlobalAlert'

const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'

export default function WalletQRScreen() {
  const { address, name } = useLocalSearchParams<{ address: string; name: string }>()
  const [qrHtml, setQrHtml] = useState('')
  const [saving,  setSaving] = useState(false)
  const webViewRef = useRef<WebView>(null)

  useEffect(() => {
    if (!address) return
    QRCode.toString(address, { type: 'svg', margin: 2 })
      .then(svg => {
        setQrHtml(`<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html,body{margin:0;padding:0;width:100%;height:100%;background:#fff;display:flex;justify-content:center;align-items:center;}
  svg{width:100%;height:100%;}
</style>
</head><body>
${svg}
<script>
window.exportPng = function() {
  var svgEl = document.querySelector('svg');
  var size = 600;
  var canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  var xml = new XMLSerializer().serializeToString(svgEl);
  var encoded = btoa(unescape(encodeURIComponent(xml)));
  var img = new Image();
  img.onload = function() {
    ctx.drawImage(img, 0, 0, size, size);
    var dataUrl = canvas.toDataURL('image/png');
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'png', data: dataUrl }));
  };
  img.src = 'data:image/svg+xml;base64,' + encoded;
};
</script>
</body></html>`)
      })
      .catch(() => {})
  }, [address])

  function handleSave() {
    if (!qrHtml) return
    setSaving(true)
    webViewRef.current?.injectJavaScript('window.exportPng(); true;')
  }

  async function onWebViewMessage(event: { nativeEvent: { data: string } }) {
    try {
      const msg = JSON.parse(event.nativeEvent.data)
      if (msg.type !== 'png') return
      const base64  = (msg.data as string).replace('data:image/png;base64,', '')
      const fileUri = FileSystem.cacheDirectory + 'opendrive_wallet_qr.png'
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 })
      const { status } = await MediaLibrary.requestPermissionsAsync()
      if (status !== 'granted') {
        showAlert('Lỗi', 'Cần cấp quyền truy cập thư viện ảnh')
        return
      }
      await MediaLibrary.saveToLibraryAsync(fileUri)
      showAlert('Đã lưu', 'QR code đã được lưu vào thư viện ảnh')
    } catch {
      showAlert('Lỗi', 'Không lưu được ảnh')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F9FD" />

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={BRAND} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>QR Code ví</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          {/* Icon ví */}
          <View style={styles.walletIconWrap}>
            <Ionicons name="wallet-outline" size={24} color="#fff" />
          </View>

          <Text style={styles.walletName}>{name || 'Ví ODC'}</Text>

          {/* QR Code */}
          <View style={styles.qrWrap}>
            {qrHtml ? (
              <WebView
                ref={webViewRef}
                source={{ html: qrHtml }}
                style={styles.qrWebView}
                scrollEnabled={false}
                scalesPageToFit={false}
                onMessage={onWebViewMessage}
              />
            ) : null}
          </View>

          {/* Địa chỉ ví – có thể chọn để copy */}
          <Text style={styles.addressLabel}>Địa chỉ ví Stellar</Text>
          <Text style={styles.addressText} selectable>{address}</Text>

          <Text style={styles.hint}>Cho người khác quét mã này để nạp ODC vào ví của bạn</Text>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Ionicons name={saving ? 'hourglass-outline' : 'download-outline'} size={20} color="#fff" />
          <Text style={styles.saveBtnText}>{saving ? 'Đang lưu...' : 'Lưu ảnh về máy'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: '#F7F9FD' },
  topBar:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: BRAND, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  topTitle: { fontSize: 17, fontWeight: '700', color: BRAND },

  content: { flex: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, alignItems: 'center' },

  card: {
    width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 24,
    alignItems: 'center', marginBottom: 20,
    shadowColor: BRAND, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 12, elevation: 6,
  },

  walletIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  walletName: { fontSize: 16, fontWeight: '700', color: BRAND, marginBottom: 20 },

  qrWrap: {
    width: 220, height: 220,
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: BRAND_LIGHT,
    overflow: 'hidden', marginBottom: 20,
  },
  qrWebView: { width: '100%', height: '100%', backgroundColor: '#fff' },

  addressLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
  addressText:  { fontSize: 12, color: '#475569', fontFamily: 'monospace', textAlign: 'center', lineHeight: 18 },

  hint: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 14, lineHeight: 18 },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    width: '100%', paddingVertical: 15, borderRadius: 14,
    backgroundColor: BRAND, justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
})
