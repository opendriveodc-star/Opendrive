// app/(auth)/terms.tsx

import { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Image, StatusBar, SafeAreaView,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import {
  TERMS_VERSION, TERMS_EFFECTIVE_DATE,
  TERMS_OVERVIEW,      TERMS_PARTS,
  TERMS_OVERVIEW_EN,   TERMS_PARTS_EN,
  type TermsPart,
} from '../../src/data/terms'

const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'
const BRAND_MUTED = '#F0F4FB'

type Lang = 'vi' | 'en'

export default function TermsScreen() {
  const [lang, setLang] = useState<Lang>('vi')

  const isVI      = lang === 'vi'
  const overview  = isVI ? TERMS_OVERVIEW    : TERMS_OVERVIEW_EN
  const parts     = isVI ? TERMS_PARTS       : TERMS_PARTS_EN
  const title     = isVI ? 'Điều Khoản Sử Dụng' : 'Terms of Service'
  const versionLbl = isVI
    ? `Phiên bản ${TERMS_VERSION} · Có hiệu lực từ ${TERMS_EFFECTIVE_DATE}`
    : `Version ${TERMS_VERSION} · Effective ${TERMS_EFFECTIVE_DATE}`
  const overviewLabel = isVI ? 'TỔNG QUAN VỀ OPENDRIVE' : 'ABOUT OPENDRIVE'
  const footerText = isVI
    ? '© OpenDrive – Nền tảng kết nối vận tải cộng đồng\nTài liệu có hiệu lực kể từ ngày người dùng xác nhận đồng ý.'
    : '© OpenDrive – Community Transport Connection Platform\nThis document takes effect from the date the user confirms acceptance.'
  const backLabel = isVI ? 'Đã hiểu' : 'Got it'

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* ── Top bar ── */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={BRAND} />
        </TouchableOpacity>

        {/* Language toggle */}
        <View style={s.langPill}>
          <TouchableOpacity
            style={[s.langBtn, lang === 'vi' && s.langBtnActive]}
            onPress={() => setLang('vi')}
            activeOpacity={0.8}
          >
            <Text style={[s.langText, lang === 'vi' && s.langTextActive]}>🇻🇳 VI</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.langBtn, lang === 'en' && s.langBtnActive]}
            onPress={() => setLang('en')}
            activeOpacity={0.8}
          >
            <Text style={[s.langText, lang === 'en' && s.langTextActive]}>🇬🇧 EN</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Scrollable content ── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo + slogan */}
        <Image
          source={require('../../assets/logo_od.png')}
          style={s.logo}
          resizeMode="contain"
        />
        <View style={s.divider} />

        {/* Title block */}
        <View style={s.titleBlock}>
          <View style={s.titleAccent} />
          <View>
            <Text style={s.titleText}>{title}</Text>
            <Text style={s.versionText}>{versionLbl}</Text>
          </View>
        </View>

        {/* Overview card */}
        <View style={s.overviewCard}>
          <Text style={s.overviewLabel}>{overviewLabel}</Text>
          <Text style={s.overviewBody}>{overview}</Text>
        </View>

        {/* Parts */}
        {parts.map((part: TermsPart) => (
          <View key={part.part}>
            <Text style={s.partLabel}>{part.part}</Text>

            {part.sections.map((sec) => (
              <View key={sec.title} style={s.sectionCard}>
                <View style={s.secHeaderRow}>
                  <View style={s.secAccent} />
                  <Text style={s.secTitle}>{sec.title}</Text>
                </View>
                {sec.body ? <Text style={s.secBody}>{sec.body}</Text> : null}
                {sec.items?.map((item, i) => (
                  <View key={i} style={s.bulletRow}>
                    <View style={s.bulletDot} />
                    <Text style={s.bulletText}>{item}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}

        <Text style={s.footer}>{footerText}</Text>
      </ScrollView>

      {/* ── Bottom action ── */}
      <View style={s.bottomBar}>
        <TouchableOpacity style={s.gotItBtn} onPress={() => router.back()} activeOpacity={0.85}>
          <Ionicons name="checkmark-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={s.gotItText}>{backLabel}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: '#fff',
  },

  // ── Top bar ──
  topBar: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingVertical:   10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backBtn: {
    padding: 6,
  },

  // ── Language toggle ──
  langPill: {
    flexDirection:    'row',
    backgroundColor:  BRAND_MUTED,
    borderRadius:     20,
    borderWidth:      1,
    borderColor:      BRAND_LIGHT,
    overflow:         'hidden',
  },
  langBtn: {
    paddingHorizontal: 14,
    paddingVertical:   6,
    borderRadius:      20,
  },
  langBtnActive: {
    backgroundColor: BRAND,
  },
  langText: {
    fontSize:   13,
    fontWeight: '600',
    color:      BRAND,
  },
  langTextActive: {
    color: '#fff',
  },

  // ── Scroll ──
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop:        20,
    paddingBottom:     24,
  },

  // ── Logo + divider ──
  logo: {
    width:        130,
    height:       130,
    alignSelf:    'center',
    marginBottom: -22,
  },
  divider: {
    width:           '60%',
    height:          1,
    backgroundColor: '#E2E8F0',
    marginVertical:  18,
    alignSelf:       'center',
  },

  // ── Title block ──
  titleBlock: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           10,
    marginBottom:  18,
  },
  titleAccent: {
    width:           4,
    height:          40,
    borderRadius:    2,
    backgroundColor: BRAND,
    marginTop:       2,
    flexShrink:      0,
  },
  titleText: {
    fontSize:   20,
    fontWeight: '800',
    color:      BRAND,
  },
  versionText: {
    fontSize:  12,
    color:     '#94A3B8',
    marginTop: 3,
  },

  // ── Overview card ──
  overviewCard: {
    backgroundColor: BRAND_MUTED,
    borderRadius:    14,
    padding:         16,
    marginBottom:    22,
    borderLeftWidth: 4,
    borderLeftColor: BRAND,
  },
  overviewLabel: {
    fontSize:      11,
    fontWeight:    '800',
    color:         BRAND,
    letterSpacing: 0.8,
    marginBottom:  10,
    opacity:       0.7,
  },
  overviewBody: {
    fontSize:   14,
    color:      BRAND,
    lineHeight: 22,
    opacity:    0.85,
  },

  // ── Part label ──
  partLabel: {
    fontSize:      11,
    fontWeight:    '800',
    color:         '#94A3B8',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop:     10,
    marginBottom:  10,
    paddingLeft:   2,
  },

  // ── Section card ──
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius:    14,
    padding:         14,
    marginBottom:    10,
    borderWidth:     1,
    borderColor:     BRAND_LIGHT,
  },
  secHeaderRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    marginBottom:  10,
  },
  secAccent: {
    width:           3,
    borderRadius:    2,
    backgroundColor: BRAND,
    alignSelf:       'stretch',
    marginRight:     8,
    flexShrink:      0,
  },
  secTitle: {
    flex:       1,
    fontSize:   14,
    fontWeight: '700',
    color:      BRAND,
    lineHeight: 20,
  },
  secBody: {
    fontSize:     14,
    color:        '#475569',
    lineHeight:   22,
    marginBottom: 8,
    marginLeft:   11,
  },

  // ── Bullet items ──
  bulletRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    marginTop:     6,
    marginLeft:    11,
  },
  bulletDot: {
    width:           6,
    height:          6,
    borderRadius:    3,
    backgroundColor: BRAND,
    marginTop:       8,
    marginRight:     10,
    flexShrink:      0,
    opacity:         0.6,
  },
  bulletText: {
    flex:       1,
    fontSize:   14,
    color:      '#475569',
    lineHeight: 22,
  },

  // ── Footer ──
  footer: {
    fontSize:   12,
    color:      '#94A3B8',
    textAlign:  'center',
    lineHeight: 18,
    marginTop:  20,
  },

  // ── Bottom bar ──
  bottomBar: {
    padding:         16,
    backgroundColor: '#fff',
    borderTopWidth:  1,
    borderTopColor:  '#F1F5F9',
  },
  gotItBtn: {
    flexDirection:   'row',
    width:           '100%',
    height:          52,
    backgroundColor: BRAND,
    borderRadius:    14,
    justifyContent:  'center',
    alignItems:      'center',
  },
  gotItText: {
    color:         '#fff',
    fontSize:      16,
    fontWeight:    '700',
    letterSpacing: 0.3,
  },
})
