// src/components/GlobalAlert.tsx
// Custom alert + action sheet thay thế Alert.alert() native

import { useState, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, Modal, StyleSheet,
  Pressable, Dimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'
const BRAND_MUTED = '#F0F4FB'
const { width: SW } = Dimensions.get('window')

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AlertButton {
  text: string
  onPress?: () => void
  style?: 'default' | 'cancel' | 'destructive'
}

export interface ActionSheetOption {
  text:    string
  icon?:   string   // Ionicons name
  onPress?: () => void
  style?:  'default' | 'cancel' | 'destructive'
}

type State =
  | { type: 'alert';       title?: string; message?: string; buttons: AlertButton[] }
  | { type: 'actionsheet'; title?: string; options: ActionSheetOption[] }
  | null

// ─── Singleton API ────────────────────────────────────────────────────────────

let _set: ((s: State) => void) | null = null

export function showAlert(
  title: string,
  message?: string,
  buttons: AlertButton[] = [{ text: 'OK' }],
) {
  _set?.({ type: 'alert', title, message, buttons })
}

export function showActionSheet(title: string, options: ActionSheetOption[]) {
  _set?.({ type: 'actionsheet', title, options })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GlobalAlert() {
  const [state, setState] = useState<State>(null)

  useEffect(() => {
    _set = setState
    return () => { _set = null }
  }, [])

  function dismiss() { setState(null) }

  if (!state) return null

  // ── Alert dialog ──
  if (state.type === 'alert') {
    const { title, message, buttons } = state
    const stack = buttons.length > 2
    return (
      <Modal transparent animationType="fade" visible onRequestClose={dismiss} statusBarTranslucent>
        <Pressable style={s.overlay} onPress={dismiss}>
          <Pressable style={s.alertCard} onPress={() => {}}>
            {title && <Text style={s.alertTitle}>{title}</Text>}
            {message && <Text style={s.alertMsg}>{message}</Text>}
            <View style={[s.alertBtnRow, stack && { flexDirection: 'column', gap: 8 }]}>
              {buttons.map((btn, i) => (
                <TouchableOpacity
                  key={i}
                  style={[
                    s.alertBtn,
                    btn.style === 'cancel'      && s.alertBtnCancel,
                    btn.style === 'destructive' && s.alertBtnDestructive,
                    stack && { width: '100%' },
                    !stack && buttons.length === 1 && { width: '100%' },
                  ]}
                  onPress={() => { dismiss(); btn.onPress?.() }}
                  activeOpacity={0.8}
                >
                  <Text style={[
                    s.alertBtnText,
                    btn.style === 'cancel'      && s.alertBtnTextCancel,
                    btn.style === 'destructive' && s.alertBtnTextDestructive,
                  ]}>
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    )
  }

  // ── Action sheet ──
  const { title, options } = state
  const mainOptions   = options.filter(o => o.style !== 'cancel')
  const cancelOption  = options.find(o => o.style === 'cancel')
  return (
    <Modal transparent animationType="slide" visible onRequestClose={dismiss} statusBarTranslucent>
      <Pressable style={s.overlay} onPress={dismiss}>
        <Pressable style={s.sheetWrap} onPress={() => {}}>
          {/* Main card */}
          <View style={s.sheetCard}>
            {title && <Text style={s.sheetTitle}>{title}</Text>}
            {mainOptions.map((opt, i) => (
              <TouchableOpacity
                key={i}
                style={[s.sheetItem, i < mainOptions.length - 1 && s.sheetItemBorder]}
                onPress={() => { dismiss(); opt.onPress?.() }}
                activeOpacity={0.7}
              >
                {opt.icon && (
                  <View style={s.sheetIconWrap}>
                    <Ionicons name={opt.icon as any} size={20} color={
                      opt.style === 'destructive' ? '#DC2626' : BRAND
                    } />
                  </View>
                )}
                <Text style={[
                  s.sheetItemText,
                  opt.style === 'destructive' && s.sheetItemTextRed,
                ]}>
                  {opt.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Cancel button */}
          {cancelOption && (
            <TouchableOpacity
              style={s.sheetCancel}
              onPress={() => { dismiss(); cancelOption.onPress?.() }}
              activeOpacity={0.7}
            >
              <Text style={s.sheetCancelText}>{cancelOption.text}</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex:            1,
    backgroundColor: 'rgba(10,20,50,0.55)',
    justifyContent:  'center',
    alignItems:      'center',
  },

  // Alert
  alertCard: {
    width:           SW * 0.82,
    backgroundColor: '#fff',
    borderRadius:    20,
    padding:         24,
    alignItems:      'center',
  },
  alertTitle: {
    fontSize:     17,
    fontWeight:   '700',
    color:        BRAND,
    textAlign:    'center',
    marginBottom: 8,
  },
  alertMsg: {
    fontSize:     14,
    color:        '#475569',
    textAlign:    'center',
    lineHeight:   21,
    marginBottom: 20,
  },
  alertBtnRow: {
    flexDirection: 'row',
    gap:           10,
    width:         '100%',
  },
  alertBtn: {
    flex:            1,
    height:          44,
    backgroundColor: BRAND,
    borderRadius:    12,
    justifyContent:  'center',
    alignItems:      'center',
  },
  alertBtnCancel: {
    backgroundColor: BRAND_MUTED,
    borderWidth:     1,
    borderColor:     BRAND_LIGHT,
  },
  alertBtnDestructive: {
    backgroundColor: '#FEE2E2',
    borderWidth:     1,
    borderColor:     '#FECACA',
  },
  alertBtnText: {
    fontSize:   14,
    fontWeight: '700',
    color:      '#fff',
  },
  alertBtnTextCancel: {
    color: BRAND,
  },
  alertBtnTextDestructive: {
    color: '#DC2626',
  },

  // Action sheet
  sheetWrap: {
    position: 'absolute',
    bottom:   0,
    left:     0,
    right:    0,
    padding:  12,
    gap:      8,
  },
  sheetCard: {
    backgroundColor: '#fff',
    borderRadius:    18,
    overflow:        'hidden',
  },
  sheetTitle: {
    fontSize:     13,
    color:        '#94A3B8',
    textAlign:    'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BRAND_LIGHT,
  },
  sheetItem: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap:            14,
  },
  sheetItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BRAND_LIGHT,
  },
  sheetIconWrap: {
    width:           36,
    height:          36,
    borderRadius:    10,
    backgroundColor: BRAND_MUTED,
    alignItems:      'center',
    justifyContent:  'center',
  },
  sheetItemText: {
    fontSize:   16,
    fontWeight: '600',
    color:      BRAND,
  },
  sheetItemTextRed: {
    color: '#DC2626',
  },
  sheetCancel: {
    backgroundColor: '#fff',
    borderRadius:    18,
    paddingVertical: 16,
    alignItems:      'center',
  },
  sheetCancelText: {
    fontSize:   16,
    fontWeight: '700',
    color:      '#475569',
  },
})
