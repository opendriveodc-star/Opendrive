// app/(mining)/home.tsx
// Màn hình đào coin: xem quảng cáo, tích điểm, đổi điểm

import { useState, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { showAlert } from '../../src/components/GlobalAlert'
import * as SecureStore from 'expo-secure-store'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { getMiner } from '../../src/services/firestore'
import { miningReport } from '../../src/services/cloudflare'
import { SecureStoreKey, MinerInfo, MinerSession } from '../../src/types'
import { ODC } from '../../src/constants'

export default function MiningHomeScreen() {
  const { t } = useTranslation()

  const [minerInfo,    setMinerInfo]    = useState<MinerInfo | null>(null)
  const [session,      setSession]      = useState<MinerSession | null>(null)
  const [isMining,     setIsMining]     = useState(false)
  const [roundsThisSession, setRoundsThisSession] = useState(0)  // chỉ trong RAM

  useEffect(() => {
    loadMinerData()
  }, [])

  async function loadMinerData() {
    // Client-first: đọc SecureStore trước
    const rawInfo    = await SecureStore.getItemAsync(SecureStoreKey.MINER_INFO)
    const rawSession = await SecureStore.getItemAsync(SecureStoreKey.MINER_SESSION)
    const today      = new Date().toISOString().split('T')[0]

    if (rawInfo) {
      setMinerInfo(JSON.parse(rawInfo))
    }

    if (rawSession) {
      const s: MinerSession = JSON.parse(rawSession)
      if (s.lastMiningDate !== today) {
        // Reset ngày mới
        const reset: MinerSession = { sessionCount: 0, lastMiningDate: today }
        await SecureStore.setItemAsync(SecureStoreKey.MINER_SESSION, JSON.stringify(reset))
        setSession(reset)
      } else {
        setSession(s)
      }
    } else {
      // Không có local → đọc Firestore
      const uid = (rawInfo ? JSON.parse(rawInfo) as MinerInfo : null)?.uid
      if (uid) {
        const doc = await getMiner(uid)
        if (doc) {
          const s: MinerSession = {
            sessionCount:   doc.lastMiningDate === today ? doc.sessionCount : 0,
            lastMiningDate: today,
          }
          await SecureStore.setItemAsync(SecureStoreKey.MINER_SESSION, JSON.stringify(s))
          setSession(s)
        }
      }
    }
  }

  // Mô phỏng xem quảng cáo rewarded → +1 lượt
  async function watchAd() {
    if (!isMining) return
    if (roundsThisSession >= ODC.MAX_MINING_ROUNDS) {
      showAlert(t('mining.maxRounds'))
      return
    }
    // TODO: AdMob rewarded ad
    setRoundsThisSession((r) => r + 1)
  }

  async function stopMining() {
    setIsMining(false)
    if (roundsThisSession < ODC.MIN_MINING_ROUNDS) {
      showAlert(t('mining.minRounds'))
      setRoundsThisSession(0)
      return
    }

    if (!minerInfo || !session) { setRoundsThisSession(0); return }

    try {
      // Gọi Worker ghi điểm vào Firestore – chỉ cập nhật local SAU KHI Worker xác nhận
      const result = await miningReport(minerInfo.uid, roundsThisSession)

      const updatedInfo: MinerInfo = { ...minerInfo, points: result.points }
      const updatedSession: MinerSession = {
        sessionCount:   session.sessionCount + 1,
        lastMiningDate: new Date().toISOString().split('T')[0],
      }

      setMinerInfo(updatedInfo)
      setSession(updatedSession)
      await SecureStore.setItemAsync(SecureStoreKey.MINER_INFO,    JSON.stringify(updatedInfo))
      await SecureStore.setItemAsync(SecureStoreKey.MINER_SESSION, JSON.stringify(updatedSession))
    } catch {
      showAlert(t('common.error'), t('error.serverError'))
    } finally {
      setRoundsThisSession(0)
    }
  }

  const sessionsLeft   = ODC.MAX_SESSIONS_PER_DAY - (session?.sessionCount ?? 0)
  const canStartMining = sessionsLeft > 0

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('mining.title')}</Text>

      <View style={styles.card}>
        <Text style={styles.points}>{t('mining.points', { points: minerInfo?.points ?? 0 })}</Text>
        <Text style={styles.sessions}>
          {canStartMining
            ? t('mining.sessionsLeft', { count: sessionsLeft })
            : t('mining.noSessions')}
        </Text>
      </View>

      {isMining ? (
        <>
          <Text style={styles.rounds}>{t('mining.rounds', { count: roundsThisSession })}</Text>
          <TouchableOpacity style={styles.adBtn} onPress={watchAd}>
            <Text style={styles.adBtnText}>{t('mining.watchAd')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stopBtn} onPress={stopMining}>
            <Text style={styles.stopBtnText}>{t('mining.stop')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TouchableOpacity
            style={[styles.startBtn, !canStartMining && styles.btnDisabled]}
            onPress={() => canStartMining && setIsMining(true)}
            disabled={!canStartMining}
          >
            <Text style={styles.startBtnText}>{t('mining.start')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.exchangeBtn} onPress={() => router.push('/(mining)/exchange')}>
            <Text style={styles.exchangeBtnText}>{t('mining.exchange')}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container:      { flex: 1, padding: 24, backgroundColor: '#ECFEFF' },
  title:          { fontSize: 24, fontWeight: '700', color: '#164E63', marginBottom: 24 },
  card:           { backgroundColor: '#fff', borderRadius: 16, padding: 24, marginBottom: 32 },
  points:         { fontSize: 28, fontWeight: '700', color: '#0891B2', marginBottom: 8 },
  sessions:       { fontSize: 14, color: '#164E63' },
  rounds:         { fontSize: 20, fontWeight: '600', color: '#164E63', textAlign: 'center', marginBottom: 16 },
  adBtn:          { height: 56, backgroundColor: '#0891B2', borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  adBtnText:      { color: '#fff', fontSize: 18, fontWeight: '600' },
  stopBtn:        { height: 52, borderWidth: 2, borderColor: '#0891B2', borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  stopBtnText:    { color: '#0891B2', fontSize: 16, fontWeight: '600' },
  startBtn:       { height: 56, backgroundColor: '#0891B2', borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  startBtnText:   { color: '#fff', fontSize: 18, fontWeight: '600' },
  btnDisabled:    { opacity: 0.4 },
  exchangeBtn:    { height: 52, borderWidth: 2, borderColor: '#0891B2', borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  exchangeBtnText: { color: '#0891B2', fontSize: 16, fontWeight: '600' },
})
