// src/components/SosButton.tsx
// Nút SOS: giữ 3s → đếm ngược (navy) bên trên → rung → thông báo blockchain

import React, { useRef, useEffect, useState } from 'react'
import { View, Text, Animated, StyleSheet, Pressable, Vibration } from 'react-native'

const BTN_SIZE = 72
const WAVE_D   = 164
const NAVY     = '#1A2E5E'
const RED      = '#F87171'
const RED_DIM  = 'rgba(248, 113, 113, 0.18)'

// Nút + sóng cùng tâm — tâm tại (WAVE_D/2, WAVE_D/2)
const BTN_LEFT       = (WAVE_D - BTN_SIZE) / 2   // 46
const BTN_TOP        = (WAVE_D - BTN_SIZE) / 2   // 46 (cùng tâm với sóng)
const WAVE_TOP_SHIFT = 0                          // sóng top: 0 → tâm = (82,82) = tâm nút

interface SosButtonProps {
  onTriggered: () => void
  disabled?:   boolean
}

export default function SosButton({ onTriggered, disabled = false }: SosButtonProps) {
  const [sosState,  setSosState]  = useState<'idle' | 'holding' | 'sent'>(disabled ? 'sent' : 'idle')
  const [countdown, setCountdown] = useState(3)
  const stateRef  = useRef<'idle' | 'holding' | 'sent'>(disabled ? 'sent' : 'idle')
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const countRef  = useRef(3)

  // Sóng lan tỏa — loop vô tận
  const wave1 = useRef(new Animated.Value(0)).current
  const wave2 = useRef(new Animated.Value(0)).current
  const wave3 = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = (v: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 2400, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0,    useNativeDriver: true }), // reset tức thì
      ]))
    const a1 = loop(wave1, 0)
    const a2 = loop(wave2, 800)
    const a3 = loop(wave3, 1600)
    a1.start(); a2.start(); a3.start()
    return () => { a1.stop(); a2.stop(); a3.stop() }
  }, [])

  function startHold() {
    if (stateRef.current !== 'idle') return
    stateRef.current = 'holding'
    setSosState('holding')
    countRef.current = 3
    setCountdown(3)
    timerRef.current = setInterval(() => {
      countRef.current -= 1
      setCountdown(countRef.current)
      if (countRef.current <= 0) {
        clearInterval(timerRef.current!); timerRef.current = null
        stateRef.current = 'sent'
        setSosState('sent')
        Vibration.vibrate(500)
        onTriggered()
      }
    }, 1000)
  }

  function cancelHold() {
    if (stateRef.current !== 'holding') return
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    stateRef.current = 'idle'
    setSosState('idle')
    setCountdown(3)
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const isSent    = sosState === 'sent'
  const isHolding = sosState === 'holding'

  const waveStyle = (v: Animated.Value) => ({
    position: 'absolute' as const,
    top: 0, left: 0,
    width: WAVE_D, height: WAVE_D, borderRadius: WAVE_D / 2,
    backgroundColor: RED_DIM,
    transform: [{
      scale: v.interpolate({ inputRange: [0, 1], outputRange: [(BTN_SIZE + 8) / WAVE_D, 1] }),
    }],
    opacity: v.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.9, 0.45, 0] }),
  })

  return (
    <View style={s.wrapper}>
      {/* Vòng tròn chứa sóng + đếm ngược + nút */}
      <View style={s.circle}>

        {/* Layer 1 – Sóng lan tỏa */}
        {!isSent && <Animated.View style={waveStyle(wave1)} />}
        {!isSent && <Animated.View style={waveStyle(wave2)} />}
        {!isSent && <Animated.View style={waveStyle(wave3)} />}

        {/* Layer 2 – Đếm ngược phía trên nút (navy đậm) */}
        {isHolding && (
          <Text style={[s.countdown, { top: BTN_TOP - 46, left: 0, width: WAVE_D }]}>
            {countdown}
          </Text>
        )}

        {/* Layer 3 – Nút SOS */}
        <Pressable
          onPressIn={startHold}
          onPressOut={cancelHold}
          disabled={isSent}
          style={[s.btn, isSent && s.btnSent, { top: BTN_TOP, left: BTN_LEFT }]}
        >
          <Text style={s.sosText}>{isSent ? '✓' : 'SOS'}</Text>
        </Pressable>
      </View>

      {/* Nhãn bên dưới */}
      <Text style={[s.label, isSent && s.labelSent]}>
        {isSent
          ? 'Hệ thống đã kích hoạt'
          : isHolding
            ? 'Đang kích hoạt...'
            : 'Nhấn và giữ 3 giây để kích hoạt'}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  circle:  { width: WAVE_D, height: WAVE_D },

  countdown: {
    position: 'absolute',
    textAlign: 'center',
    fontSize: 32, fontWeight: '900', color: '#F87171',
  },

  btn: {
    position: 'absolute',
    width: BTN_SIZE, height: BTN_SIZE, borderRadius: BTN_SIZE / 2,
    backgroundColor: RED,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18, shadowRadius: 6, elevation: 4,
    zIndex: 1,
  },
  btnSent:  { backgroundColor: NAVY, shadowOpacity: 0, elevation: 0 },
  sosText:  { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 2 },

  label: {
    marginTop: 10, fontSize: 13, color: '#475569',
    textAlign: 'center', lineHeight: 20, fontWeight: '500',
  },
  labelSent: { color: NAVY, fontWeight: '700' },
})
