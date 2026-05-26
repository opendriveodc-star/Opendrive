// src/components/SosButton.tsx
// Nút SOS: giữ 3 giây để kích hoạt. Vòng tròn tiến độ + ripple + rung.

import React, { useRef, useEffect, useState } from 'react'
import {
  View, Text, Animated, StyleSheet, Pressable, Vibration,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

const BTN_SIZE    = 64
const RING_D      = BTN_SIZE + 16    // 80
const RING_HALF   = RING_D / 2       // 40
const RING_BORDER = 3
const WAVE_D      = 130
const GREEN       = '#22C55E'
const GREEN_DIM   = 'rgba(34,197,94,0.12)'

interface SosButtonProps {
  onTriggered: () => void
  disabled?:   boolean
}

export default function SosButton({ onTriggered, disabled = false }: SosButtonProps) {
  const [sosState,  setSosState]  = useState<'idle'|'holding'|'sent'>(disabled ? 'sent' : 'idle')
  const [countdown, setCountdown] = useState(3)

  const progressAnim = useRef(new Animated.Value(0)).current
  const runningAnim  = useRef<Animated.CompositeAnimation | null>(null)
  const wave1 = useRef(new Animated.Value(0)).current
  const wave2 = useRef(new Animated.Value(0)).current
  const wave3 = useRef(new Animated.Value(0)).current
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const countRef  = useRef(3)
  const stateRef  = useRef<'idle'|'holding'|'sent'>(disabled ? 'sent' : 'idle')

  // Ripple waves
  useEffect(() => {
    const loop = (v: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 2200, useNativeDriver: true }),
      ]))
    const a1 = loop(wave1, 0); const a2 = loop(wave2, 700); const a3 = loop(wave3, 1400)
    a1.start(); a2.start(); a3.start()
    return () => { a1.stop(); a2.stop(); a3.stop() }
  }, [])

  // Progress ring interpolation (right half fills first, then left)
  const rightRot = progressAnim.interpolate({
    inputRange:  [0,   0.5,  1],
    outputRange: ['-180deg', '0deg',    '0deg'],
  })
  const leftRot = progressAnim.interpolate({
    inputRange:  [0,   0.5,  1],
    outputRange: ['-180deg', '-180deg', '0deg'],
  })

  function startHold() {
    if (stateRef.current !== 'idle') return
    stateRef.current = 'holding'
    setSosState('holding')
    countRef.current = 3
    setCountdown(3)

    runningAnim.current = Animated.timing(progressAnim, {
      toValue: 1, duration: 3000, useNativeDriver: true,
    })
    runningAnim.current.start()

    timerRef.current = setInterval(() => {
      countRef.current -= 1
      setCountdown(countRef.current)
      if (countRef.current <= 0) {
        clearInterval(timerRef.current!); timerRef.current = null
        stateRef.current = 'sent'
        setSosState('sent')
        Vibration.vibrate([0, 40, 60, 40])
        onTriggered()
      }
    }, 1000)
  }

  function cancelHold() {
    if (stateRef.current === 'sent') return
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (stateRef.current === 'holding') {
      runningAnim.current?.stop()
      Animated.timing(progressAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start()
      stateRef.current = 'idle'
      setSosState('idle')
      setCountdown(3)
    }
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const isSent = sosState === 'sent'; const isHolding = sosState === 'holding'

  const waveStyle = (v: Animated.Value) => ({
    position: 'absolute' as const,
    width: WAVE_D, height: WAVE_D, borderRadius: WAVE_D / 2,
    backgroundColor: GREEN_DIM,
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [RING_D / WAVE_D, 1] }) }],
    opacity:   v.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0.9, 0.4, 0] }),
  })

  return (
    <View style={styles.wrapper}>
      {/* Ripple waves */}
      {!isSent && (
        <>
          <Animated.View style={waveStyle(wave1)} />
          <Animated.View style={waveStyle(wave2)} />
          <Animated.View style={waveStyle(wave3)} />
        </>
      )}

      {/* Circular progress ring */}
      {!isSent && (
        <View style={styles.ring}>
          {/* Track (gray background ring) */}
          <View style={styles.track} />
          {/* Right half fill */}
          <View style={[styles.halfClip, { left: RING_HALF }]}>
            <Animated.View style={[styles.fill, { left: -RING_HALF, transform: [{ rotate: rightRot }] }]} />
          </View>
          {/* Left half fill */}
          <View style={[styles.halfClip, { left: 0 }]}>
            <Animated.View style={[styles.fill, { left: 0, transform: [{ rotate: leftRot }] }]} />
          </View>
        </View>
      )}

      {/* Button */}
      <Pressable
        onPressIn={startHold}
        onPressOut={cancelHold}
        style={[styles.btn, isSent && styles.btnSent]}
      >
        {isSent
          ? <Ionicons name="checkmark-circle" size={28} color="#fff" />
          : isHolding
            ? <Text style={styles.countdown}>{countdown}</Text>
            : <Ionicons name="shield-checkmark" size={26} color="#fff" />
        }
      </Pressable>

      {/* Instruction */}
      <Text style={[styles.label, isSent && styles.labelSent]}>
        {isSent
          ? 'Tín hiệu đã gửi'
          : 'Nhấn và giữ 3 giây\nnếu bạn gặp nguy hiểm'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center', justifyContent: 'center',
    width: WAVE_D + 16, height: WAVE_D + 50,
  },
  ring: { position: 'absolute', width: RING_D, height: RING_D },
  track: {
    position: 'absolute', width: RING_D, height: RING_D,
    borderRadius: RING_HALF, borderWidth: RING_BORDER, borderColor: '#D1FAE5',
  },
  halfClip: { position: 'absolute', top: 0, width: RING_HALF, height: RING_D, overflow: 'hidden' },
  fill: {
    position: 'absolute', top: 0, width: RING_D, height: RING_D,
    borderRadius: RING_HALF, borderWidth: RING_BORDER, borderColor: GREEN,
  },
  btn: {
    width: BTN_SIZE, height: BTN_SIZE, borderRadius: BTN_SIZE / 2,
    backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center',
    shadowColor: GREEN, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45, shadowRadius: 8, elevation: 8,
  },
  btnSent:   { backgroundColor: '#94A3B8', shadowColor: '#94A3B8' },
  countdown: { color: '#fff', fontSize: 26, fontWeight: '900' },
  label: {
    marginTop: 10, fontSize: 13, color: '#475569',
    textAlign: 'center', lineHeight: 19, fontWeight: '500',
  },
  labelSent: { color: '#94A3B8' },
})
