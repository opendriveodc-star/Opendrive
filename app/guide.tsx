// app/guide.tsx
// Hướng dẫn sử dụng app

import { useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, StatusBar } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'

const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'
const BRAND_MUTED = '#F0F4FB'

type Tab = 'driver' | 'customer' | 'miner'

interface GuideStep { icon: string; title: string; body: string }

const GUIDE: Record<Tab, Record<'vi' | 'en', GuideStep[]>> = {
  driver: {
    vi: [
      { icon: 'person-add-outline',      title: 'Đăng ký tài khoản',        body: 'Xác thực số điện thoại qua OTP, điền thông tin xe, đọc và đồng ý điều khoản. Hệ thống tự tạo ví Stellar và tặng 100 ODC khởi nghiệp.' },
      { icon: 'flash-outline',           title: 'Bật Sẵn sàng',             body: 'Từ trang chủ, bấm nút tròn "SẴN SÀNG". Ứng dụng sẽ chia sẻ vị trí và hiển thị bản đồ. Bạn sẽ nhận thông báo khi có khách đặt xe gần.' },
      { icon: 'pricetag-outline',        title: 'Báo giá chuyến',           body: 'Khi nhận thông báo, mở app xem thông tin chuyến và nhập giá báo. Cần đủ ODC (giá × 0.00001 × 3) mới được báo giá. Bật báo giá tự động để app tự tính và gửi báo giá.' },
      { icon: 'navigate-outline',        title: 'Thực hiện chuyến',         body: 'Sau khi khách chọn bạn, nhận thông báo xác nhận. Dẫn đường qua Google Maps tích hợp. Kết nối P2P tự động để chia sẻ vị trí thời gian thực.' },
      { icon: 'star-outline',            title: 'Hoàn thành & ODC',         body: 'Bấm "Kết thúc chuyến" sau khi đến nơi. Khách đánh giá 1–5 sao. Rating cao → nhận thưởng ODC. Rating thấp → mất thêm ODC. Mỗi chuyến ghi lên Blockchain Stellar.' },
      { icon: 'wallet-outline',          title: 'Ví ODC',                   body: 'Xem số dư trong mục Ví ODC. Nhận thưởng 200 ODC khi giới thiệu tài xế mới đăng ký thành công. ODC dùng để đảm bảo chất lượng dịch vụ.' },
    ],
    en: [
      { icon: 'person-add-outline',      title: 'Create account',           body: 'Verify your phone via OTP, fill in vehicle info, read and accept the terms. The system automatically creates a Stellar wallet and gifts 100 ODC to get you started.' },
      { icon: 'flash-outline',           title: 'Go online',                body: 'From the home screen, tap the round "READY" button. The app will share your location and show the map. You\'ll receive notifications when passengers book nearby.' },
      { icon: 'pricetag-outline',        title: 'Place a quote',            body: 'When notified, open the app to see the trip details and enter your price. You need enough ODC (price × 0.00001 × 3) to quote. Enable auto-quote to let the app calculate and send quotes automatically.' },
      { icon: 'navigate-outline',        title: 'Complete the ride',        body: 'After the passenger selects you, receive a confirmation. Navigate via the integrated Google Maps link. P2P connection automatically activates for real-time location sharing.' },
      { icon: 'star-outline',            title: 'Finish & earn ODC',        body: 'Tap "End Trip" when you arrive. The passenger rates 1–5 stars. High rating → earn ODC bonus. Low rating → lose more ODC. Every trip is recorded on the Stellar Blockchain.' },
      { icon: 'wallet-outline',          title: 'ODC Wallet',               body: 'Check your balance in the ODC Wallet section. Earn 200 ODC for each new driver you successfully refer. ODC ensures service quality.' },
    ],
  },
  customer: {
    vi: [
      { icon: 'phone-portrait-outline',  title: 'Đăng nhập',                body: 'Nhập số điện thoại và xác thực OTP. Không cần đăng ký – mọi số điện thoại đều dùng được ngay.' },
      { icon: 'location-outline',        title: 'Chọn điểm đón & đến',      body: 'Chọn loại xe trước, rồi kéo bản đồ hoặc gõ địa chỉ để chọn điểm đón và điểm đến. Hệ thống tính khoảng cách thực tế.' },
      { icon: 'car-outline',             title: 'Đặt xe & chờ báo giá',     body: 'Bấm "Đặt xe" để gửi yêu cầu đến tài xế gần nhất. Chờ tối đa 25 giây. Nhiều tài xế sẽ gửi báo giá khác nhau – bạn chọn người phù hợp.' },
      { icon: 'checkmark-circle-outline',title: 'Chọn tài xế',              body: 'Xem danh sách báo giá gồm ảnh, tên, đánh giá và giá. Chọn tài xế bạn muốn. Tài xế nhận thông báo ngay lập tức và bắt đầu di chuyển.' },
      { icon: 'map-outline',             title: 'Theo dõi tài xế',          body: 'Xem vị trí tài xế trên bản đồ thời gian thực qua kết nối P2P. Nhận thông báo khi tài xế đến nơi đón.' },
      { icon: 'star-outline',            title: 'Đánh giá sau chuyến',      body: 'Sau khi đến nơi, đánh giá tài xế 1–5 sao. Đánh giá giúp duy trì chất lượng dịch vụ thông qua cơ chế ODC. Tối đa 3 lần hủy chuyến trước khi bị tạm khóa.' },
    ],
    en: [
      { icon: 'phone-portrait-outline',  title: 'Log in',                   body: 'Enter your phone number and verify with OTP. No registration needed — any phone number works immediately.' },
      { icon: 'location-outline',        title: 'Set pickup & destination',  body: 'Choose your vehicle type first, then drag the map or type an address to set your pickup and drop-off points. The system calculates the actual distance.' },
      { icon: 'car-outline',             title: 'Book & wait for quotes',   body: 'Tap "Book Ride" to send a request to nearby drivers. Wait up to 25 seconds. Multiple drivers will send different quotes — you pick the one you prefer.' },
      { icon: 'checkmark-circle-outline',title: 'Select a driver',          body: 'Browse the quote list with photo, name, rating, and price. Choose the driver you want. They\'re notified instantly and start moving toward you.' },
      { icon: 'map-outline',             title: 'Track your driver',        body: 'Watch your driver\'s real-time location on the map via a P2P connection. You\'ll be notified when the driver arrives.' },
      { icon: 'star-outline',            title: 'Rate after the ride',      body: 'Once you arrive, rate the driver 1–5 stars. Ratings help maintain service quality through the ODC mechanism. Up to 3 cancellations allowed before a temporary suspension.' },
    ],
  },
  miner: {
    vi: [
      { icon: 'phone-portrait-outline',  title: 'Đăng nhập',                body: 'Đăng nhập bằng số điện thoại và OTP. Người đào ODC không cần ví Stellar – chỉ cần điểm trong hệ thống.' },
      { icon: 'play-circle-outline',     title: 'Xem quảng cáo kiếm điểm', body: 'Vào trang Đào ODC, bấm nút xem quảng cáo. Mỗi 10 lượt xem = 1 điểm. Tối đa 3 phiên mỗi ngày (reset lúc 00:00 Việt Nam).' },
      { icon: 'swap-horizontal-outline', title: 'Đổi điểm lấy ODC',        body: 'Tích đủ tối thiểu 10 điểm, nhập địa chỉ ví Stellar của tài xế để nhận ODC. Phí đổi cố định 0.1 ODC/lần. 10 điểm = 9.9 ODC về ví đích.' },
      { icon: 'bar-chart-outline',       title: 'Theo dõi tiến độ',        body: 'Xem số điểm tích lũy và lịch sử đổi điểm trong trang chủ Đào ODC. Điểm chỉ cập nhật sau khi server xác nhận thành công.' },
    ],
    en: [
      { icon: 'phone-portrait-outline',  title: 'Log in',                   body: 'Log in with phone number and OTP. ODC Miners don\'t need a Stellar wallet — only points in the system.' },
      { icon: 'play-circle-outline',     title: 'Watch ads to earn points', body: 'Go to the ODC Mining page and tap the watch-ad button. Every 10 views = 1 point. Maximum 3 sessions per day (resets at midnight Vietnam time).' },
      { icon: 'swap-horizontal-outline', title: 'Exchange points for ODC',  body: 'Once you have at least 10 points, enter a driver\'s Stellar wallet address to receive ODC. Fixed exchange fee: 0.1 ODC per transaction. 10 points = 9.9 ODC to the destination wallet.' },
      { icon: 'bar-chart-outline',       title: 'Track your progress',      body: 'View your accumulated points and exchange history on the ODC Mining home page. Points only update after the server confirms success.' },
    ],
  },
}

export default function GuideScreen() {
  const { t, i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'vi') as 'vi' | 'en'
  const [tab, setTab] = useState<Tab>('driver')

  const steps = GUIDE[tab][lang]

  const tabs: { key: Tab; icon: string; label: string }[] = [
    { key: 'driver',   icon: 'car-sport-outline',    label: t('guide.driverTitle') },
    { key: 'customer', icon: 'person-outline',        label: t('guide.customerTitle') },
    { key: 'miner',    icon: 'diamond-outline',       label: t('guide.minerTitle') },
  ]

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={BRAND} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('guide.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        {tabs.map(({ key, icon, label }) => {
          const active = tab === key
          const color  = active ? '#fff' : BRAND
          return (
            <TouchableOpacity
              key={key}
              style={[s.tabBtn, active && s.tabBtnActive]}
              onPress={() => setTab(key)}
              activeOpacity={0.8}
            >
              {key === 'miner' ? (
                <View style={[s.odcBadge, { borderColor: color }]}>
                  <Text style={[s.odcBadgeText, { color }]}>ODC</Text>
                </View>
              ) : (
                <Ionicons name={icon as any} size={20} color={color} />
              )}
              <Text style={[s.tabText, active && s.tabTextActive]}>{label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {steps.map((step, i) => (
          <View key={i} style={s.stepCard}>
            <View style={s.stepLeft}>
              <View style={s.stepIconWrap}>
                <Ionicons name={step.icon as any} size={22} color="#fff" />
              </View>
              {i < steps.length - 1 && <View style={s.stepLine} />}
            </View>
            <View style={s.stepBody}>
              <View style={s.stepNumRow}>
                <Text style={s.stepNum}>Bước {i + 1}</Text>
              </View>
              <Text style={s.stepTitle}>{step.title}</Text>
              <Text style={s.stepText}>{step.body}</Text>
            </View>
          </View>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#fff' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BRAND_LIGHT },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#1A2E5E', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: BRAND },

  tabRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: BRAND_LIGHT, backgroundColor: BRAND_MUTED },
  tabBtnActive: { backgroundColor: BRAND, borderColor: BRAND },
  tabText:      { fontSize: 11, fontWeight: '600', color: BRAND },
  tabTextActive: { color: '#fff' },
  odcBadge:     { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  odcBadgeText: { fontSize: 6, fontWeight: '800', letterSpacing: 0.2 },

  scroll: { paddingHorizontal: 20, paddingTop: 8 },

  stepCard: { flexDirection: 'row', marginBottom: 0 },
  stepLeft: { alignItems: 'center', width: 44, paddingTop: 2 },
  stepIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
  stepLine:     { width: 2, flex: 1, backgroundColor: BRAND_LIGHT, marginVertical: 6 },
  stepBody: { flex: 1, paddingLeft: 14, paddingBottom: 24 },
  stepNumRow: { flexDirection: 'row', marginBottom: 4 },
  stepNum:    { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 },
  stepTitle:  { fontSize: 15, fontWeight: '700', color: BRAND, marginBottom: 6 },
  stepText:   { fontSize: 13, color: '#475569', lineHeight: 20 },
})
