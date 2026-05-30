// app/(mining)/exchange.tsx

import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { WebView } from 'react-native-webview'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system'
import { QR_SCANNER_HTML } from '../../src/utils/qrScannerHtml'
import { showAlert } from '../../src/components/GlobalAlert'
import { useTranslation } from 'react-i18next'
import * as SecureStore from 'expo-secure-store'
import { getMinerInfo } from '../../src/utils/storage'
import { exchangePoints } from '../../src/services/cloudflare'
import { COLORS, ODC } from '../../src/constants'
import { SecureStoreKey } from '../../src/types'
import type { MinerInfo } from '../../src/types'


const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'

export default function ExchangeScreen() {
  const { t } = useTranslation()
  const [minerInfo,   setMinerInfo]   = useState<MinerInfo | null>(null)
  const [walletAddr,  setWalletAddr]  = useState('')
  const [pointsInput, setPointsInput] = useState('')
  const [memo,        setMemo]        = useState('')
  const [showScanPicker, setShowScanPicker] = useState(false)
  const [scanning,       setScanning]      = useState(false)
  const [imageScanning, setImageScanning] = useState(false)
  const [pendingB64,    setPendingB64]    = useState<{ b64: string; mime: string } | null>(null)
  const webViewRef = useRef<WebView>(null)

  const MEMO_MAX_BYTES = 28
  const memoBytes = new TextEncoder().encode(memo).length

  useEffect(() => {
    getMinerInfo().then(setMinerInfo)
  }, [])

  const points      = parseInt(pointsInput, 10) || 0
  const odcReceived = Math.max(0, points - ODC.MINING_FEE)

  function validateWallet(addr: string): boolean {
    return addr.startsWith('G') && addr.length === 56
  }

  function openScanner() {
    setShowScanPicker(true)
  }

  function handleBarcode({ data }: { data: string }) {
    setWalletAddr(data.trim())
    setScanning(false)
  }

  async function pickImageAndScan() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      showAlert('Lỗi', 'Cần quyền truy cập thư viện ảnh')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 1,
    })
    if (result.canceled) return

    setImageScanning(true)
    try {
      const imgUri = result.assets[0].uri
      const mime   = result.assets[0].mimeType ?? 'image/jpeg'
      const b64    = await FileSystem.readAsStringAsync(imgUri, { encoding: FileSystem.EncodingType.Base64 })
      setPendingB64({ b64, mime })
    } catch {
      setImageScanning(false)
      showAlert('Lỗi', 'Không đọc được ảnh')
    }
  }

  function onWebViewLoad() {
    if (!pendingB64 || !webViewRef.current) return
    webViewRef.current.injectJavaScript(
      `window.scanBase64(${JSON.stringify(pendingB64.b64)}, ${JSON.stringify(pendingB64.mime)}); true;`
    )
  }

  function onWebViewMessage(e: { nativeEvent: { data: string } }) {
    setImageScanning(false)
    setPendingB64(null)
    try {
      const { result } = JSON.parse(e.nativeEvent.data)
      if (result) {
        setWalletAddr(result.trim())
      } else {
        showAlert('Không tìm thấy QR', 'Ảnh không chứa mã QR hợp lệ, thử ảnh khác.')
      }
    } catch {
      showAlert('Lỗi', 'Không đọc được mã QR')
    }
  }

  function handleMemoChange(text: string) {
    if (new TextEncoder().encode(text).length <= MEMO_MAX_BYTES) setMemo(text)
  }

  function handleConfirm() {
    if (!validateWallet(walletAddr)) {
      showAlert(t('common.error'), t('error.walletNotFound'))
      return
    }
    if (points < ODC.MIN_EXCHANGE_POINTS) {
      showAlert(t('common.error'), t('mining.exchangeMin'))
      return
    }
    if (!minerInfo || points > minerInfo.points) {
      showAlert(t('common.error'), t('error.insufficientODC'))
      return
    }

    showAlert(
      t('common.confirm'),
      t('mining.exchangeConfirm', { points, odc: odcReceived.toFixed(2) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: async () => {
            try {
              const result = await exchangePoints({
                uid:           minerInfo!.uid,
                points,
                walletAddress: walletAddr,
                memo:          memo.trim() || undefined,
              })

              const updatedInfo: MinerInfo = { ...minerInfo!, points: minerInfo!.points - points }
              await SecureStore.setItemAsync(SecureStoreKey.MINER_INFO, JSON.stringify(updatedInfo))
              setMinerInfo(updatedInfo)
              setPointsInput('')
              setWalletAddr('')
              setMemo('')

              showAlert(
                t('common.success'),
                t('mining.exchangeSuccess', { odc: result.odcSent.toFixed(2), txHash: result.txHash.slice(0, 8) + '…' }),
              )
            } catch (err: unknown) {
              showAlert(t('common.error'), (err as Error).message)
            }
          },
        },
      ]
    )
  }

  const CameraView = scanning ? require('expo-camera').CameraView : null

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* WebView ẩn decode QR từ ảnh – jsQR bundled offline, không cần internet */}
      {pendingB64 && (
        <WebView
          ref={webViewRef}
          style={{ width: 1, height: 1, position: 'absolute', opacity: 0 }}
          source={{ html: QR_SCANNER_HTML }}
          onLoad={onWebViewLoad}
          onMessage={onWebViewMessage}
          javaScriptEnabled
          originWhitelist={['*']}
        />
      )}

      {/* Chọn nguồn scan QR */}
      <Modal visible={showScanPicker} transparent animationType="slide" onRequestClose={() => setShowScanPicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowScanPicker(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Quét mã QR ví Stellar</Text>
            <View style={styles.pickerRow}>
              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() => { setShowScanPicker(false); setScanning(true) }}
              >
                <View style={styles.pickerIconWrap}>
                  <Ionicons name="camera-outline" size={36} color="#fff" />
                </View>
                <Text style={styles.pickerLabel}>Camera</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() => { setShowScanPicker(false); pickImageAndScan() }}
              >
                <View style={styles.pickerIconWrap}>
                  <Ionicons name="images-outline" size={36} color="#fff" />
                </View>
                <Text style={styles.pickerLabel}>Thư viện</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Loading khi đang scan ảnh */}
      <Modal visible={imageScanning} transparent animationType="fade">
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={BRAND} />
            <Text style={styles.loadingText}>Đang đọc mã QR...</Text>
          </View>
        </View>
      </Modal>

      {/* Camera QR Scanner Modal */}
      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={styles.scanHeader}>
            <TouchableOpacity onPress={() => setScanning(false)} style={styles.scanClose}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.scanTitle}>Quét mã QR ví Stellar</Text>
          </View>
          {CameraView && (
            <CameraView
              style={{ flex: 1 }}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarcode}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* TopBar – cùng vị trí với home.tsx */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={22} color={BRAND} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>{t('mining.exchange')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* Số dư */}
        <View style={styles.card}>
          <Text style={styles.pointsLabel}>{t('mining.points', { points: minerInfo?.points ?? 0 })}</Text>
        </View>

        {/* Số coin muốn chuyển */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Số coin muốn chuyển</Text>
          <TextInput
            style={styles.input}
            value={pointsInput}
            onChangeText={setPointsInput}
            keyboardType="numeric"
            placeholder={`Tối thiểu ${ODC.MIN_EXCHANGE_POINTS} điểm`}
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Địa chỉ ví + nút scan */}
        <View style={styles.fieldGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Địa chỉ ví Stellar nhận ODC</Text>
            <TouchableOpacity style={styles.scanBtn} onPress={openScanner}>
              <Ionicons name="qr-code-outline" size={16} color="#fff" />
              <Text style={styles.scanBtnText}>Scan</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.input}
            value={walletAddr}
            onChangeText={setWalletAddr}
            placeholder="G..."
            placeholderTextColor="#9CA3AF"
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>

        {/* Memo ghi chú */}
        <View style={styles.fieldGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Ghi chú cho người nhận</Text>
            <Text style={[styles.byteCount, memoBytes >= MEMO_MAX_BYTES && styles.byteCountFull]}>
              {memoBytes}/{MEMO_MAX_BYTES} bytes
            </Text>
          </View>
          <TextInput
            style={[styles.input, styles.memoInput]}
            value={memo}
            onChangeText={handleMemoChange}
            placeholder="Nhập ghi chú (tuỳ chọn)..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Preview */}
        {points >= ODC.MIN_EXCHANGE_POINTS && (
          <View style={styles.preview}>
            <Text style={styles.previewText}>
              {t('mining.exchangeConfirm', { points, odc: odcReceived.toFixed(2) })}
            </Text>
            <Text style={styles.feeText}>{t('mining.exchangeFee')}</Text>
          </View>
        )}

        <TouchableOpacity style={styles.button} onPress={handleConfirm}>
          <Text style={styles.buttonText}>{t('common.confirm')}</Text>
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: COLORS.mining.background,
  },
  content: {
    padding:       16,
    paddingBottom: 32,
  },
  topBar: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: 16,
    paddingVertical:   12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: BRAND, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  topTitle: {
    flex: 1, textAlign: 'center',
    fontSize: 18, fontWeight: '700', color: BRAND,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius:    12,
    padding:         16,
    elevation:       2,
    marginBottom:    20,
  },
  pointsLabel: {
    fontSize:   18,
    fontWeight: '700',
    color:      COLORS.mining.primary,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   6,
  },
  label: {
    fontSize:   13,
    fontWeight: '600',
    color:      COLORS.mining.textPrimary,
  },
  scanBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingHorizontal: 12,
    paddingVertical:   6,
    borderRadius:      8,
    backgroundColor:   BRAND,
  },
  scanBtnText: {
    fontSize:   12,
    fontWeight: '600',
    color:      '#fff',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth:     1,
    borderColor:     '#D1D5DB',
    borderRadius:    8,
    padding:         12,
    fontSize:        15,
    color:           '#0F172A',
  },
  memoInput: {
    height:      88,
    paddingTop:  12,
  },
  byteCount: {
    fontSize: 12,
    color:    '#94A3B8',
  },
  byteCountFull: {
    color:      '#EF4444',
    fontWeight: '600',
  },
  preview: {
    backgroundColor: '#CFFAFE',
    borderRadius:    8,
    padding:         12,
    marginBottom:    20,
  },
  previewText: {
    fontSize:     15,
    fontWeight:   '700',
    color:        COLORS.mining.textPrimary,
    marginBottom: 4,
  },
  feeText: {
    fontSize: 12,
    color:    '#64748B',
  },
  button: {
    backgroundColor: COLORS.mining.primary,
    padding:         14,
    borderRadius:    10,
    alignItems:      'center',
  },
  buttonText: {
    color:      '#FFFFFF',
    fontSize:   16,
    fontWeight: '700',
  },

  // Scan picker
  pickerOverlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent:  'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    padding:         28,
    paddingBottom:   40,
  },
  pickerTitle: {
    fontSize:     16,
    fontWeight:   '700',
    color:        BRAND,
    textAlign:    'center',
    marginBottom: 24,
  },
  pickerRow: {
    flexDirection: 'row',
    gap:           16,
  },
  pickerBtn: {
    flex:           1,
    alignItems:     'center',
    gap:            12,
  },
  pickerIconWrap: {
    width:           90,
    height:          90,
    borderRadius:    20,
    backgroundColor: BRAND,
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     BRAND,
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.3,
    shadowRadius:    8,
    elevation:       6,
  },
  pickerLabel: {
    fontSize:   15,
    fontWeight: '600',
    color:      BRAND,
  },

  // Scanner
  scanHeader: {
    flexDirection:   'row',
    alignItems:      'center',
    padding:         16,
    backgroundColor: '#000',
  },
  scanClose: {
    marginRight: 12,
  },
  scanTitle: {
    flex:       1,
    color:      '#fff',
    fontSize:   16,
    fontWeight: '600',
  },
  // Loading overlay
  loadingOverlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent:  'center',
    alignItems:      'center',
  },
  loadingCard: {
    backgroundColor: '#fff',
    borderRadius:    16,
    padding:         32,
    alignItems:      'center',
    gap:             16,
  },
  loadingText: {
    fontSize:   15,
    fontWeight: '600',
    color:      BRAND,
  },
})
