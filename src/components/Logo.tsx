// src/components/Logo.tsx
// Vô lăng OpenDrive – thuần RN Views, không cần react-native-svg

import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

interface LogoProps {
  wheelSize?: number   // px, mặc định 48
  fontSize?:  number   // px, mặc định 36
  color?:     'brand' | 'white'
}

export default function Logo({ wheelSize = 48, fontSize = 36, color = 'brand' }: LogoProps) {
  const blue  = color === 'white' ? '#fff' : '#1A56DB'
  const green = color === 'white' ? '#fff' : '#15803D'

  // Tất cả kích thước tỉ lệ theo wheelSize (base = 60)
  const s = wheelSize / 60
  const border  = Math.round(4   * s)
  const hubSize = Math.round(18  * s)
  const hubPos  = Math.round((wheelSize - hubSize) / 2)
  const hubBorder = Math.round(3.5 * s)
  const spokeW  = Math.round(17  * s)
  const spokeH  = Math.round(3   * s)
  const spokeT  = Math.round(wheelSize / 2 - 1.5 * s)  // centre – half spoke height
  const spokeInnerL = border                             // rim inner edge left
  const spokeInnerR = hubPos + hubSize                   // hub outer edge right
  const spokeVH     = Math.round(17 * s)                // vertical spoke height
  const spokeVTop   = hubPos + hubSize                   // hub outer bottom
  const spokeVLeft  = Math.round(wheelSize / 2 - 1.5 * s)

  return (
    <View style={styles.row}>
      {/* ── Vô lăng ── */}
      <View style={[styles.wheel, {
        width: wheelSize, height: wheelSize,
        borderRadius: wheelSize / 2,
        borderWidth: border, borderColor: blue,
      }]}>
        {/* Hub */}
        <View style={[styles.hub, {
          width: hubSize, height: hubSize,
          borderRadius: hubSize / 2,
          borderWidth: hubBorder, borderColor: blue,
          top: hubPos, left: hubPos,
        }]} />
        {/* Căm trái (9h) */}
        <View style={[styles.spoke, {
          width: spokeW, height: spokeH,
          borderRadius: spokeH / 2,
          backgroundColor: blue,
          top: spokeT, left: spokeInnerL,
        }]} />
        {/* Căm phải (3h) */}
        <View style={[styles.spoke, {
          width: spokeW, height: spokeH,
          borderRadius: spokeH / 2,
          backgroundColor: blue,
          top: spokeT, left: spokeInnerR,
        }]} />
        {/* Căm dưới (6h) */}
        <View style={[styles.spoke, {
          width: spokeH, height: spokeVH,
          borderRadius: spokeH / 2,
          backgroundColor: blue,
          top: spokeVTop, left: spokeVLeft,
        }]} />
      </View>

      {/* ── Wordmark ── */}
      <View style={styles.wordmark}>
        <Text style={[styles.textBase, { fontSize, color: blue }]}>
          {'pen'}
          <Text style={{ color: green }}>{'Drive'}</Text>
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  wheel: {
    position: 'relative',
  },
  hub: {
    position: 'absolute',
  },
  spoke: {
    position: 'absolute',
  },
  wordmark: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  textBase: {
    fontWeight:    '700',
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
})
