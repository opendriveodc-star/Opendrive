// src/services/webrtc.ts
// WebRTC + DataChannel manager
// Tài xế có thể mở nhiều RTCPeerConnection cùng lúc (multiple cuốc)

import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } from 'react-native-webrtc'
import { ICE_CONFIG } from '../constants'
import { rtdb } from './firebase'
import { getTurnCredentials } from './cloudflare'
import type { PeerConnectionEntry, DataChannelMessage, TurnCredentials } from '../types'

// Cache TURN credentials (TTL 48h từ Cloudflare)
let cachedTurn: TurnCredentials | null = null
let turnFetchedAt = 0

// TURN fallback dùng khi Worker lỗi (public server, chỉ dùng khi test)
const FALLBACK_TURN: RTCIceServer[] = [
  { urls: 'turn:openrelay.metered.ca:80',  username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
]

async function getIceConfig(): Promise<RTCConfiguration> {
  const now = Date.now()
  if (!cachedTurn || now - turnFetchedAt > 46 * 3600 * 1000) {
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TURN timeout')), 10000),
      )
      cachedTurn = await Promise.race([getTurnCredentials(), timeout])
      turnFetchedAt = now
      console.log('[ice] TURN fetched:', cachedTurn.urls)
    } catch (e) {
      console.log('[ice] TURN Worker failed, using fallback TURN:', String(e))
    }
  }
  const turnServers: RTCIceServer[] = cachedTurn
    ? [{ urls: cachedTurn.urls, username: cachedTurn.username, credential: cachedTurn.credential }]
    : FALLBACK_TURN
  return {
    ...ICE_CONFIG,
    iceServers: [...ICE_CONFIG.iceServers!, ...turnServers],
  }
}

const peerConnections = new Map<string, PeerConnectionEntry>()

const remoteRole = {
  customer: 'driver',
  driver:   'customer',
} as const

type PeerRole = keyof typeof remoteRole

export interface PeerConnectionBridge {
  pc:   RTCPeerConnection
  stop: () => void
}

export function createPeerConnection(
  tripId:        string,
  customerId:    string,
  onMessage:     (msg: DataChannelMessage, tripId: string) => void,
  onIceCandidate: (candidate: RTCIceCandidate, tripId: string) => void,
  iceConfig:     RTCConfiguration = ICE_CONFIG,
): RTCPeerConnection {
  const pc = new RTCPeerConnection(iceConfig)
  const nativePc = pc as any

  nativePc.onicecandidate = ({ candidate }: any) => {
    if (candidate) onIceCandidate(candidate, tripId)
  }

  const entry: PeerConnectionEntry = {
    tripId,
    pc,
    dc:        null,
    customerId,
    createdAt: Date.now(),
  }
  peerConnections.set(tripId, entry)

  nativePc.ondatachannel = ({ channel }: any) => {
    entry.dc = channel
    setupDataChannel(channel, tripId, onMessage)
  }

  return pc
}

export function createDataChannel(tripId: string): any | null {
  const entry = peerConnections.get(tripId)
  if (!entry) return null
  const dc = entry.pc.createDataChannel('opendrive', { ordered: true })
  entry.dc = dc
  return dc
}

function setupDataChannel(
  dc:        any,
  tripId:    string,
  onMessage: (msg: DataChannelMessage, tripId: string) => void,
) {
  dc.onmessage = (event: any) => {
    try {
      const msg: DataChannelMessage = JSON.parse(event.data)
      onMessage(msg, tripId)
    } catch {
      // ignore malformed payload
    }
  }
}

export function sendMessage(tripId: string, msg: DataChannelMessage): boolean {
  const entry = peerConnections.get(tripId)
  if (!entry?.dc || entry.dc.readyState !== 'open') return false
  entry.dc.send(JSON.stringify(msg))
  return true
}

export function closePeerConnection(tripId: string): void {
  const entry = peerConnections.get(tripId)
  if (!entry) return
  entry.dc?.close()
  entry.pc.close()
  peerConnections.delete(tripId)
}

export function closeAllPeerConnections(): void {
  for (const tripId of peerConnections.keys()) {
    closePeerConnection(tripId)
  }
}

export function getPeerConnection(tripId: string): PeerConnectionEntry | undefined {
  return peerConnections.get(tripId)
}

export function prefetchTurnCredentials(): void {
  getIceConfig().catch(() => {})
}

export function getAllTripIds(): string[] {
  return Array.from(peerConnections.keys())
}

export async function pushIceCandidate(
  tripId:   string,
  role:     PeerRole,
  candidate: RTCIceCandidate,
): Promise<void> {
  try {
    console.log(`[ice] pushIceCandidate role=${role}`, JSON.stringify(candidate.toJSON()))
    const existing = await rtdb.get<{ candidates?: unknown[] }>(`trips/${tripId}/ice/${role}`) ?? {}
    const candidates = (existing.candidates ?? []) as unknown[]
    candidates.push(candidate.toJSON())
    await rtdb.set(`trips/${tripId}/ice/${role}`, { candidates })
    console.log(`[ice] pushed candidate #${candidates.length} for ${role}`)
  } catch (e) {
    console.log(`[ice] pushIceCandidate FAILED role=${role}:`, String(e))
  }
}

export async function setOffer(tripId: string, offer: RTCSessionDescriptionInit): Promise<void> {
  await rtdb.set(`trips/${tripId}/ice/offer`, offer)
}

export async function setAnswer(tripId: string, answer: RTCSessionDescriptionInit): Promise<void> {
  await rtdb.set(`trips/${tripId}/ice/answer`, answer)
}

export async function watchRemoteIceCandidates(
  tripId: string,
  role:   PeerRole,
  onCandidate: (candidate: RTCIceCandidateInit) => void,
): Promise<() => void> {
  const remote = remoteRole[role]
  let lastCount = 0
  const interval = setInterval(async () => {
    try {
      const payload = await rtdb.get<{ candidates?: unknown[] }>(`trips/${tripId}/ice/${remote}`)
      const candidates = Array.isArray(payload?.candidates) ? payload.candidates : []
      if (candidates.length > lastCount) {
        for (let i = lastCount; i < candidates.length; i += 1) {
          const candidate = candidates[i] as RTCIceCandidateInit
          await onCandidate(candidate)
        }
        lastCount = candidates.length
      }
    } catch {
      // ignore polling errors
    }
  }, 1000)

  return () => clearInterval(interval)
}

export async function waitForRemoteDescription(
  tripId: string,
  type:   'offer' | 'answer',
): Promise<RTCSessionDescriptionInit> {
  while (true) {
    const data = await rtdb.get<{ offer?: RTCSessionDescriptionInit; answer?: RTCSessionDescriptionInit }>(`trips/${tripId}/ice`)
    const desc = data?.[type]
    if (desc && desc.sdp) return desc
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

export async function createOfferConnection(
  tripId: string,
  onMessage: (msg: DataChannelMessage, tripId: string) => void,
  onChannelOpen?: () => void,
): Promise<PeerConnectionBridge> {
  console.log('[offer] start', tripId)
  const iceConfig = await getIceConfig()
  const pc = createPeerConnection(tripId, tripId, onMessage, async (candidate) => {
    await pushIceCandidate(tripId, 'customer', candidate)
  }, iceConfig)

  const dc = createDataChannel(tripId)
  if (dc) {
    setupDataChannel(dc, tripId, onMessage)
    dc.onopen = () => {
      console.log('[offer] datachannel open')
      onChannelOpen?.()
    }
  }

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  console.log('[offer] setLocalDescription OK, writing offer to RTDB...')
  await setOffer(tripId, { type: offer.type, sdp: offer.sdp })
  console.log('[offer] setOffer OK, watching candidates + waiting for answer...')

  const stopWatching = await watchRemoteIceCandidates(tripId, 'customer', async (candidate) => {
    try {
      await pc.addIceCandidate(candidate)
    } catch {
      // ignore invalid candidate
    }
  })

  const answer = await waitForRemoteDescription(tripId, 'answer')
  console.log('[offer] got answer, type=', answer.type)
  await pc.setRemoteDescription(new RTCSessionDescription({ type: answer.type, sdp: answer.sdp! }))
  console.log('[offer] setRemoteDescription OK → waiting for datachannel open')

  return {
    pc,
    stop: () => {
      stopWatching()
      closePeerConnection(tripId)
    },
  }
}

export async function createAnswerConnection(
  tripId: string,
  onMessage: (msg: DataChannelMessage, tripId: string) => void,
  onChannelOpen?: () => void,
): Promise<PeerConnectionBridge> {
  console.log('[answer] start', tripId)
  const iceConfig = await getIceConfig()
  const pc = createPeerConnection(tripId, tripId, onMessage, async (candidate) => {
    await pushIceCandidate(tripId, 'driver', candidate)
  }, iceConfig)

  // ondatachannel fires AFTER the connection is established — register onopen here
  ;(pc as any).ondatachannel = ({ channel }: any) => {
    console.log('[answer] ondatachannel fired')
    const entry = getPeerConnection(tripId)
    if (entry) entry.dc = channel
    setupDataChannel(channel, tripId, onMessage)
    channel.onopen = () => {
      console.log('[answer] datachannel open')
      onChannelOpen?.()
    }
  }

  console.log('[answer] watchRemoteIceCandidates')
  const stopWatching = await watchRemoteIceCandidates(tripId, 'driver', async (candidate) => {
    try {
      await pc.addIceCandidate(candidate)
    } catch {
      // ignore invalid candidate
    }
  })

  console.log('[answer] waiting for offer...')
  const offer = await waitForRemoteDescription(tripId, 'offer')
  console.log('[answer] got offer, type=', offer.type)

  await pc.setRemoteDescription(new RTCSessionDescription({ type: offer.type, sdp: offer.sdp! }))
  console.log('[answer] setRemoteDescription OK')

  const answer = await pc.createAnswer()
  console.log('[answer] createAnswer OK, type=', answer.type)

  await pc.setLocalDescription(answer)
  console.log('[answer] setLocalDescription OK')

  console.log('[answer] writing answer to RTDB...')
  await setAnswer(tripId, { type: answer.type, sdp: answer.sdp })
  console.log('[answer] setAnswer OK → waiting for datachannel')

  return {
    pc,
    stop: () => {
      stopWatching()
      closePeerConnection(tripId)
    },
  }
}
