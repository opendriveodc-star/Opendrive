// src/components/SosButton.tsx
// Nút SOS: giữ 3 giây để kích hoạt. Ripple waves + countdown animation.

import React, { useRef, useEffect, useState } from 'react'
import { View, Text, Animated, StyleSheet, Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

interface SosButtonProps {
  onTriggered: () => void
  disabled?:   boolean       // true = đã gửi, không cho nhấn nữa
}

const BTN_SIZE   = 72    // đường kính nút chính
const RING_SIZE  = BTN_SIZE * 2.8   // đường kính vòng ripple lớn nhất

export default function SosButton({ onTriggered, disabled = false }: SosButtonProps) {
  type SosState = 'idle' | 'holding' | 'sent'
  const [sosState,  setSosState]  = useState<SosState>(disabled ? 'sent' : 'idle')
  const [countdown, setCountdown] = useState(3)

  const pressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countRef      = useRef(3)

  // 3 ripple rings staggered 600ms apart, chạy loop liên tục khi idle/holding
  const ring1 = useRef(new Animated.Value(0)).current
  const ring2 = useRef(new Animated.Value(0)).current
  const ring3 = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const makeLoop = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(val, { toValue: 1, duration: 2000, useNativeDriver: true }),
          ]),
        ]),
      )

    const a1 = makeLoop(ring1, 0)
    const a2 = makeLoop(ring2, 600)
    const a3 = makeLoop(ring3, 1200)
    a1.start(); a2.start(); a3.start()
    return () => { a1.stop(); a2.stop(); a3.stop() }
  }, [])

  function handlePressIn() {
    if (sosState !== 'idle') return
    setSosState('holding')
    countRef.current = 3
    setCountdown(3)
    pressTimerRef.current = setInterval(() => {
      countRef.current -= 1
      setCountdown(countRef.current)
      if (countRef.current <= 0) {
        clearInterval(pressTimerRef.current!)
        pressTimerRef.current = null
        setSosState('sent')
        onTriggered()
      }
    }, 1000)
  }

  function handlePressOut() {
    if (sosState === 'sent') return
    if (pressTimerRef.current) {
      clearInterval(pressTimerRef.current)
      pressTimerRef.current = null
    }
    if (sosState === 'holding') {
      setSosState('idle')
      setCountdown(3)
    }
  }

  useEffect(() => {
    return () => { if (pressTimerRef.current) clearInterval(pressTimerRef.current) }
  }, [])

  const ringStyle = (val: Animated.Value) => ({
    position: 'absolute' as const,
    width:    RING_SIZE,
    height:   RING_SIZE,
    borderRadius: RING_SIZE / 2,
    backgroundColor: 'rgba(220, 38, 38, 0.18)',
    transform: [{
      scale: val.interpolate({ inputRange: [0, 1], outputRange: [BTN_SIZE / RING_SIZE, 1] }),
    }],
    opacity: val.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.7, 0.4, 0] }),
  })

  const isSent    = sosState === 'sent'
  const isHolding = sosState === 'holding'

  const btnBg = isSent ? '#94A3B8' : '#DC2626'

  return (
    <View style={styles.wrapper} pointerEvents={isSent ? 'none' : 'auto'}>
      {/* Ripple rings */}
      {!isSent && (
        <>
          <Animated.View style={ringStyle(ring1)} />
          <Animated.View style={ringStyle(ring2)} />
          <Animated.View style={ringStyle(ring3)} />
        </>
      )}

      {/* Main button */}
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.btn, { backgroundColor: btnBg }]}
      >
        {isSent ? (
          <>
            <Ionicons name="checkmark" size={24} color="#fff" />
            <Text style={styles.sentText}>Tín hiệu{'\n'}đã gửi</Text>
          </>
        ) : isHolding ? (
          <Text style={styles.countdownText}>{countdown}</Text>
        ) : (
          <>
            <Text style={styles.sosText}>SOS</Text>
            <Text style={styles.hintText}>Giữ 3 giây</Text>
          </>
        )}
      </Pressable>

      {/* Instruction below */}
      {!isSent && (
        <Text style={styles.instruction}>
          Nhấn và giữ 3 giây{'\n'}nếu bạn gặp nguy hiểm
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width:  RING_SIZE + 24,
    height: RING_SIZE + 56,  // thêm chỗ cho text instruction
  },
  btn: {
    width:  BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    gap: 1,
  },
  sosText:       { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  hintText:      { color: 'rgba(255,255,255,0.8)', fontSize: 9, fontWeight: '600' },
  countdownText: { color: '#fff', fontSize: 30, fontWeight: '900' },
  sentText:      { color: '#fff', fontSize: 9, fontWeight: '700', textAlign: 'center', lineHeight: 12 },
  instruction: {
    marginTop: 10,
    fontSize:  11,
    color:     'rgba(100,116,139,0.9)',
    textAlign: 'center',
    lineHeight: 16,
    fontWeight: '500',
  },
})
