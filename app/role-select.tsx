import { useState, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  Image, ScrollView, Dimensions, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { changeLanguage } from '../src/i18n'
import { showAlert } from '../src/components/GlobalAlert'
import { SecureStoreKey, UserRole } from '../src/types'

const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'
const BRAND_MUTED = '#F0F4FB'

// PAGE_W = chiều rộng mỗi trang trong ScrollView (scroll.width phải bằng page.width)
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')
const isSmall   = SCREEN_H < 820                        // A03s, Samsung A30 gesture nav, và màn nhỏ
const CONTENT_W = SCREEN_W - 56                         // content area trừ paddingH
const ARROW_W   = 40
const GAP       = 8
const PAGE_W    = CONTENT_W - (ARROW_W + GAP) * 2      // phần còn lại cho ScrollView

// Icon đồng xu ODC – vòng tròn + chữ ODC
function CoinIcon({ size = 62 }: { size?: number }) {
  const border = Math.round(size * 0.075)
  const inner  = size - border * 2 - 8
  return (
    <View style={{
      width:           size,
      height:          size,
      borderRadius:    size / 2,
      borderWidth:     border,
      borderColor:     BRAND,
      backgroundColor: BRAND_MUTED,
      alignItems:      'center',
      justifyContent:  'center',
    }}>
      <View style={{
        width:           inner,
        height:          inner,
        borderRadius:    inner / 2,
        borderWidth:     1.5,
        borderColor:     `${BRAND}55`,
        alignItems:      'center',
        justifyContent:  'center',
      }}>
        <Text style={{
          fontSize:      Math.round(size * 0.24),
          fontWeight:    '900',
          color:         BRAND,
          letterSpacing: Math.round(size * 0.025),
        }}>ODC</Text>
      </View>
    </View>
  )
}

type RoleItem = {
  role:     UserRole
  icon:     keyof typeof Ionicons.glyphMap
  labelKey: string
  subKey:   string
}

const ROLES: RoleItem[] = [
  { role: 'customer', icon: 'person',    labelKey: 'roleSelect.customer', subKey: 'roleSelect.customerSub' },
  { role: 'driver',   icon: 'car-sport', labelKey: 'roleSelect.driver',   subKey: 'roleSelect.driverSub'   },
  { role: 'miner',    icon: 'diamond',   labelKey: 'roleSelect.miner',    subKey: 'roleSelect.minerSub'    },
]

export default function RoleSelectScreen() {
  const { t, i18n } = useTranslation()
  const insets        = useSafeAreaInsets()
  const [lang, setLang]   = useState<'vi' | 'en'>(i18n.language as 'vi' | 'en')
  const [idx, setIdx]     = useState(0)
  const scrollRef         = useRef<ScrollView>(null)
  const pageWidthRef      = useRef(PAGE_W)   // actual rendered width (captured via onLayout)
  const isProgrammatic    = useRef(false)    // true khi scroll do mũi tên, bỏ qua onMomentumScrollEnd

  async function selectRole(role: UserRole) {
    try {
      await SecureStore.setItemAsync(SecureStoreKey.USER_ROLE, role)
      router.replace(`/(auth)/phone?role=${role}`)
    } catch (e: unknown) {
      showAlert('Lỗi', (e as Error).message)
    }
  }

  async function toggleLang() {
    const next = lang === 'vi' ? 'en' : 'vi'
    await changeLanguage(next)
    setLang(next)
  }

  // Cuộn tới card theo index – wrap được khi dùng mũi tên
  function scrollTo(newIdx: number) {
    const i = ((newIdx % ROLES.length) + ROLES.length) % ROLES.length
    isProgrammatic.current = true
    scrollRef.current?.scrollTo({ x: i * pageWidthRef.current, animated: true })
    setIdx(i)
  }

  // Đồng bộ idx sau khi người dùng vuốt tay xong (cả momentum lẫn kéo chậm)
  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (isProgrammatic.current) {
      isProgrammatic.current = false
      return
    }
    const i = Math.round(e.nativeEvent.contentOffset.x / pageWidthRef.current)
    setIdx(Math.max(0, Math.min(ROLES.length - 1, i)))
  }

  const cur = ROLES[idx]

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Language – absolute top right, căn theo insets.top thực tế của thiết bị */}
      <TouchableOpacity style={[s.langPill, { top: insets.top + 12 }]} onPress={toggleLang} activeOpacity={0.8}>
        <Text style={s.langText}>{lang === 'vi' ? '🇻🇳  Tiếng Việt' : '🇬🇧  English'}</Text>
        <Ionicons name="chevron-down" size={13} color={BRAND} />
      </TouchableOpacity>

      {/* ── Main content – paddingTop động theo insets.top tránh overlap status bar ── */}
      <View style={[s.content, { paddingTop: insets.top + (isSmall ? 44 : 64) }]}>

        {/* Logo */}
        <Image
          source={require('../assets/logo_od.png')}
          style={s.logo}
          resizeMode="contain"
        />

        <Text style={s.slogan}>{t('roleSelect.slogan')}</Text>

        <Text style={s.title}>{t('roleSelect.title')}</Text>
        <Text style={s.titleSub}>{t('roleSelect.subtitle')}</Text>

        <View style={s.divider} />

        {/* ── Carousel – vuốt mượt + mũi tên ── */}
        <View style={s.carouselWrap}>
          {/* Nút trái */}
          <TouchableOpacity style={s.arrow} onPress={() => scrollTo(idx - 1)} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={26} color="#94A3B8" />
          </TouchableOpacity>

          {/* Scrollable cards */}
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            decelerationRate="fast"
            onMomentumScrollEnd={onScrollEnd}
            onScrollEndDrag={onScrollEnd}
            onLayout={(e) => { pageWidthRef.current = e.nativeEvent.layout.width }}
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            bounces={false}
          >
            {ROLES.map((role, i) => (
              <View key={i} style={s.page}>
                <View style={s.iconRing}>
                  <View style={s.iconInner}>
                    {role.role === 'miner'
                      ? <CoinIcon size={62} />
                      : <Ionicons name={role.icon} size={58} color={BRAND} />
                    }
                  </View>
                </View>
                <Text style={s.cardSub}>{t(role.subKey)}</Text>
              </View>
            ))}
          </ScrollView>

          {/* Nút phải */}
          <TouchableOpacity style={s.arrow} onPress={() => scrollTo(idx + 1)} activeOpacity={0.7}>
            <Ionicons name="chevron-forward" size={26} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* Dots */}
        <View style={s.dots}>
          {ROLES.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => scrollTo(i)}>
              <View style={[s.dot, i === idx && s.dotActive]} />
            </TouchableOpacity>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity style={s.cta} onPress={() => selectRole(cur.role)} activeOpacity={0.8}>
          <Text style={s.ctaText}>{t(cur.labelKey)}</Text>
        </TouchableOpacity>

      </View>

      {/* Footer – paddingBottom động để tránh navigation bar trên Samsung */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={s.footerBtn} activeOpacity={0.75} onPress={() => router.push('/blockchain')}>
          <Ionicons name="cube-outline" size={15} color={BRAND} style={{ marginRight: 5 }} />
          <Text style={s.footerBtnText}>{t('roleSelect.blockchain')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.footerBtn} activeOpacity={0.75} onPress={() => router.push('/guide')}>
          <Ionicons name="book-outline" size={15} color={BRAND} style={{ marginRight: 5 }} />
          <Text style={s.footerBtnText}>{t('roleSelect.guide')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: '#FFFFFF',
  },

  langPill: {
    position:          'absolute',
    top:               0,   // overridden inline với insets.top + 12
    right:             24,
    zIndex:            10,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    paddingHorizontal: 14,
    paddingVertical:   7,
    borderRadius:      20,
    borderWidth:       1,
    borderColor:       '#DDE4F0',
    backgroundColor:   BRAND_MUTED,
  },
  langText: {
    fontSize:   13,
    fontWeight: '500',
    color:      BRAND,
  },

  content: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'flex-start',
    paddingHorizontal: 28,
    paddingTop:        0,   // overridden inline với insets.top + offset
    paddingBottom:     8,
  },

  logo: {
    width:        isSmall ? 120 : 160,
    height:       isSmall ? 120 : 160,
    marginBottom: isSmall ? -20 : -28,
  },

  slogan: {
    fontSize:      13,
    fontStyle:     'italic',
    color:         BRAND,
    textAlign:     'center',
    opacity:       0.6,
    letterSpacing: 0.3,
    marginBottom:  12,
  },

  title: {
    fontSize:      19,
    fontWeight:    '700',
    color:         BRAND,
    textAlign:     'center',
    letterSpacing: 0.1,
    marginTop:     10,
    marginBottom:  4,
  },
  titleSub: {
    fontSize:      14,
    fontWeight:    '600',
    color:         BRAND,
    textAlign:     'center',
    letterSpacing: 0.8,
    opacity:       0.7,
  },

  divider: {
    width:           '70%',
    height:          1,
    backgroundColor: '#E2E8F0',
    marginVertical:  isSmall ? 10 : 18,
  },

  // ── Carousel ──
  carouselWrap: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           GAP,
  },
  arrow: {
    width:           ARROW_W,
    height:          ARROW_W,
    borderRadius:    10,
    backgroundColor: '#F8FAFC',
    borderWidth:     1,
    borderColor:     '#E2E8F0',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  scroll: {
    width: PAGE_W,   // phải bằng page.width để pagingEnabled snap đúng
  },
  scrollContent: {
    alignItems: 'center',
  },
  page: {
    width:      PAGE_W,
    alignItems: 'center',
    gap:        14,
  },

  iconRing: {
    width:           isSmall ? 118 : 148,
    height:          isSmall ? 118 : 148,
    borderRadius:    isSmall ? 59 : 74,
    backgroundColor: BRAND_MUTED,
    borderWidth:     2.5,
    borderColor:     BRAND_LIGHT,
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     BRAND,
    shadowOpacity:   0.12,
    shadowRadius:    20,
    shadowOffset:    { width: 0, height: 6 },
    elevation:       6,
  },
  iconInner: {
    width:           isSmall ? 84 : 108,
    height:          isSmall ? 84 : 108,
    borderRadius:    isSmall ? 42 : 54,
    backgroundColor: '#FFFFFF',
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     BRAND,
    shadowOpacity:   0.08,
    shadowRadius:    8,
    shadowOffset:    { width: 0, height: 2 },
    elevation:       2,
  },
  cardSub: {
    fontSize:          14,
    color:             '#64748B',
    textAlign:         'center',
    lineHeight:        20,
    paddingHorizontal: 4,
  },

  dots: {
    flexDirection: 'row',
    gap:           6,
    marginTop:     isSmall ? 10 : 16,
    marginBottom:  isSmall ? 14 : 22,
  },
  dot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: '#E2E8F0',
  },
  dotActive: {
    backgroundColor: BRAND,
    width:           22,
  },

  cta: {
    borderWidth:       1.5,
    borderColor:       BRAND,
    borderRadius:      12,
    paddingVertical:   13,
    paddingHorizontal: 52,
  },
  ctaText: {
    fontSize:      16,
    fontWeight:    '700',
    color:         BRAND,
    letterSpacing: 0.2,
  },

  footer: {
    flexDirection:     'row',
    gap:               12,
    paddingHorizontal: 24,
    paddingBottom:     16,  // overridden inline với insets.bottom + 16
  },
  footerBtn: {
    flex:            1,
    flexDirection:   'row',
    paddingVertical: 14,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     '#CBD5E1',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: '#FAFAFA',
  },
  footerBtnText: {
    fontSize:   15,
    fontWeight: '600',
    color:      BRAND,
  },
})
