// app/(mining)/home.tsx

import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import * as SecureStore from 'expo-secure-store'
import { showAlert } from '../../src/components/GlobalAlert'
import { getMiner } from '../../src/services/firestore'
import { miningReport } from '../../src/services/cloudflare'
import { SecureStoreKey } from '../../src/types'
import type { MinerInfo, MinerSession } from '../../src/types'
import { ODC } from '../../src/constants'

const BRAND       = '#1A2E5E'
const BRAND_LIGHT = '#E8EDF6'
const BRAND_MUTED = '#F0F4FB'

export default function MiningHomeScreen() {
  const { t } = useTranslation()
  const pulseAnim = useRef(new Animated.Value(1)).current

  const [minerInfo,     setMinerInfo]     = useState<MinerInfo | null>(null)
  const [session,       setSession]       = useState<MinerSession | null>(null)
  const [isMining,      setIsMining]      = useState(false)
  const [rounds,        setRounds]        = useState(0)
  const [isWatchingAd,  setIsWatchingAd]  = useState(false)
  const [elapsedSec,    setElapsedSec]    = useState(0)
  const [isSaving,      setIsSaving]      = useState(false)

  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const roundsRef = useRef(0)

  useEffect(() => {
    loadMinerData()
  }, [])

  useEffect(() => {
    if (isMining) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.12, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.92, duration: 700, useNativeDriver: true }),
        ])
      )
      loop.start()
      timerRef.current = setInterval(() => setElapsedSec(s => s + 1), 1000)
      return () => {
        loop.stop()
        pulseAnim.setValue(1)
        clearInterval(timerRef.current!)
        timerRef.current = null
      }
    }
  }, [isMining])

  async function loadMinerData() {
    const rawInfo    = await SecureStore.getItemAsync(SecureStoreKey.MINER_INFO)
    const rawSession = await SecureStore.getItemAsync(SecureStoreKey.MINER_SESSION)
    const today      = new Date().toISOString().split('T')[0]

    if (rawInfo) setMinerInfo(JSON.parse(rawInfo))

    if (rawSession) {
      const s: MinerSession = JSON.parse(rawSession)
      if (s.lastMiningDate !== today) {
        const reset: MinerSession = { sessionCount: 0, lastMiningDate: today }
        await SecureStore.setItemAsync(SecureStoreKey.MINER_SESSION, JSON.stringify(reset))
        setSession(reset)
      } else {
        setSession(s)
      }
    } else {
      const uid = rawInfo ? (JSON.parse(rawInfo) as MinerInfo).uid : null
      if (uid) {
        const doc = await getMiner(uid)
        if (doc) {
          const today2 = new Date().toISOString().split('T')[0]
          const s: MinerSession = {
            sessionCount:   doc.lastMiningDate === today2 ? doc.sessionCount : 0,
            lastMiningDate: today2,
          }
          await SecureStore.setItemAsync(SecureStoreKey.MINER_SESSION, JSON.stringify(s))
          setSession(s)
        }
      }
    }
  }

  function startMining() {
    roundsRef.current = 0
    setRounds(0)
    setElapsedSec(0)
    setIsMining(true)
  }

  async function watchAd() {
    if (isWatchingAd || roundsRef.current >= ODC.MAX_MINING_ROUNDS) return
    setIsWatchingAd(true)
    await new Promise(resolve => setTimeout(resolve, 2500))   // simulate ad duration
    roundsRef.current += 1
    setRounds(roundsRef.current)
    setIsWatchingAd(false)
  }

  async function stopMining() {
    setIsMining(false)
    const done = roundsRef.current

    if (done < ODC.MIN_MINING_ROUNDS) {
      showAlert(
        t('mining.minRoundsTitle'),
        t('mining.minRoundsMsg', { min: ODC.MIN_MINING_ROUNDS, count: done })
      )
      return
    }

    if (!minerInfo || !session) return

    setIsSaving(true)
    try {
      const result = await miningReport(minerInfo.uid, done)

      const updatedInfo: MinerInfo = { ...minerInfo, points: result.points }
      const updatedSession: MinerSession = {
        sessionCount:   session.sessionCount + 1,
        lastMiningDate: new Date().toISOString().split('T')[0],
      }
      await SecureStore.setItemAsync(SecureStoreKey.MINER_INFO,    JSON.stringify(updatedInfo))
      await SecureStore.setItemAsync(SecureStoreKey.MINER_SESSION, JSON.stringify(updatedSession))
      setMinerInfo(updatedInfo)
      setSession(updatedSession)

      showAlert(t('common.success'), t('mining.sessionDone', { rounds: done, points: result.points }))
    } catch {
      showAlert(t('common.error'), t('error.serverError'))
    } finally {
      setIsSaving(false)
    }
  }

  const sessionsLeft = ODC.MAX_SESSIONS_PER_DAY - (session?.sessionCount ?? 0)
  const canStart     = sessionsLeft > 0
  const progress     = Math.min(rounds / ODC.MAX_MINING_ROUNDS, 1)
  const mm           = String(Math.floor(elapsedSec / 60)).padStart(2, '0')
  const ss           = String(elapsedSec % 60).padStart(2, '0')
  const elapsed      = `${mm}:${ss}`

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.topBar}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={22} color={BRAND} />
        </TouchableOpacity>
        <Text style={s.topTitle}>{t('mining.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Stats card */}
        <View style={s.card}>
          <View style={s.cardRow}>
            <View>
              <Text style={s.pointsLabel}>{t('mining.totalPoints')}</Text>
              <Text style={s.pointsValue}>{minerInfo?.points ?? 0}</Text>
            </View>
            <TouchableOpacity style={s.exchangeBtn} onPress={() => router.push('/(mining)/exchange')}>
              <Ionicons name="swap-horizontal" size={20} color={BRAND} />
              <Text style={s.exchangeBtnText}>{t('mining.exchangeShort')}</Text>
            </TouchableOpacity>
          </View>

          <View style={s.sessionRow}>
            <Text style={s.sessionLabel}>{t('mining.todaySessions')}</Text>
            {[0, 1, 2].map(i => (
              <View key={i} style={[s.dot, i < (session?.sessionCount ?? 0) ? s.dotFilled : s.dotEmpty]} />
            ))}
            <Text style={s.sessionCount}>({session?.sessionCount ?? 0} / {ODC.MAX_SESSIONS_PER_DAY})</Text>
          </View>
        </View>

        {!isMining ? (
          <>
            <View style={[s.card, s.infoCard]}>
              <View style={s.infoTitleRow}>
                <Ionicons name="information-circle-outline" size={16} color={BRAND} />
                <Text style={s.infoTitle}>{t('mining.howItWorks')}</Text>
              </View>
              {[t('mining.rule1'), t('mining.rule2'), t('mining.rule3'), t('mining.rule4')]
                .map((rule, i) => <Text key={i} style={s.ruleText}>{rule}</Text>)}
            </View>

            <TouchableOpacity
              style={[s.startBtn, !canStart && s.btnDisabled]}
              onPress={canStart ? startMining : undefined}
              disabled={!canStart}
            >
              <Ionicons name="flash" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={s.startBtnText}>
                {canStart
                  ? t('mining.startSession', { n: (session?.sessionCount ?? 0) + 1 })
                  : t('mining.noSessions')}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={s.miningCenter}>
              <Animated.View style={[s.miningCircle, { transform: [{ scale: pulseAnim }] }]}>
                <Ionicons name="diamond" size={40} color="#fff" />
              </Animated.View>
              <Text style={s.roundsValue}>{rounds}</Text>
              <Text style={s.roundsUnit}>{t('mining.outOf', { max: ODC.MAX_MINING_ROUNDS })}</Text>
              <Text style={s.elapsedTime}>{elapsed}</Text>
            </View>

            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${progress * 100}%` as any }]} />
            </View>
            <Text style={s.progressPct}>{Math.round(progress * 100)}%</Text>

            <TouchableOpacity
              style={[s.watchBtn, (isWatchingAd || rounds >= ODC.MAX_MINING_ROUNDS) && s.btnDisabled]}
              onPress={watchAd}
              disabled={isWatchingAd || rounds >= ODC.MAX_MINING_ROUNDS}
            >
              {isWatchingAd
                ? <Text style={s.watchBtnText}>{t('mining.adLoading')}</Text>
                : <>
                    <Ionicons name="play-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={s.watchBtnText}>{t('mining.watchAd')}</Text>
                  </>
              }
            </TouchableOpacity>

            <TouchableOpacity style={s.stopBtn} onPress={stopMining} disabled={isSaving}>
              <Text style={s.stopBtnText}>
                {isSaving ? t('common.loading') : t('mining.stop')}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: BRAND_MUTED },
  topBar:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', shadowColor: BRAND, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  topTitle:     { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: BRAND },
  scroll:       { padding: 16, paddingBottom: 40 },

  card:         { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  cardRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  pointsLabel:  { fontSize: 12, color: '#64748B', marginBottom: 4 },
  pointsValue:  { fontSize: 44, fontWeight: '800', color: BRAND, lineHeight: 48 },
  exchangeBtn:  { backgroundColor: BRAND_LIGHT, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  exchangeBtnText: { fontSize: 12, fontWeight: '600', color: BRAND, marginTop: 4 },

  sessionRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  sessionLabel: { fontSize: 12, color: '#64748B', marginRight: 8 },
  dot:          { width: 10, height: 10, borderRadius: 5, marginRight: 4 },
  dotFilled:    { backgroundColor: BRAND },
  dotEmpty:     { backgroundColor: '#E2E8F0' },
  sessionCount: { fontSize: 12, color: '#64748B', marginLeft: 4 },

  infoCard:     { backgroundColor: BRAND_LIGHT },
  infoTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  infoTitle:    { fontSize: 14, fontWeight: '600', color: BRAND, marginLeft: 6 },
  ruleText:     { fontSize: 13, color: BRAND, marginBottom: 5, lineHeight: 20 },

  startBtn:     { flexDirection: 'row', height: 56, backgroundColor: BRAND, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled:  { opacity: 0.4 },

  miningCenter: { alignItems: 'center', paddingVertical: 20 },
  miningCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: BRAND, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  roundsValue:  { fontSize: 56, fontWeight: '800', color: BRAND, lineHeight: 60 },
  roundsUnit:   { fontSize: 14, color: '#64748B', marginTop: 4 },
  elapsedTime:  { fontSize: 18, color: BRAND, marginTop: 8, fontWeight: '600' },

  progressTrack: { height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, marginBottom: 6, overflow: 'hidden' },
  progressFill:  { height: 8, backgroundColor: BRAND, borderRadius: 4 },
  progressPct:   { fontSize: 12, color: '#64748B', textAlign: 'right', marginBottom: 20 },

  watchBtn:     { flexDirection: 'row', height: 56, backgroundColor: BRAND, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  watchBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  stopBtn:      { height: 52, borderWidth: 2, borderColor: BRAND, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  stopBtnText:  { color: BRAND, fontSize: 16, fontWeight: '600' },
})
