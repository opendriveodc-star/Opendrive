// src/services/webrtc.ts
// WebRTC + DataChannel manager
// Tài xế có thể mở nhiều RTCPeerConnection cùng lúc (multiple cuốc)

import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } from 'react-native-webrtc'
import { ICE_CONFIG } from '../constants'
import { rtdb } from './firebase'
import type { PeerConnectionEntry, DataChannelMessage } from '../types'

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
): RTCPeerConnection {
  const pc = new RTCPeerConnection(ICE_CONFIG)
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

export function getAllTripIds(): string[] {
  return Array.from(peerConnections.keys())
}

export async function pushIceCandidate(
  tripId:   string,
  role:     PeerRole,
  candidate: RTCIceCandidate,
): Promise<void> {
  const existing = await rtdb.get<{ candidates?: unknown[] }>(`trips/${tripId}/ice/${role}`) ?? {}
  const candidates = (existing.candidates ?? []) as unknown[]
  candidates.push(candidate.toJSON())
  await rtdb.set(`trips/${tripId}/ice/${role}`, { candidates })
}

export async function setOffer(tripId: string, offer: RTCSessionDescriptionInit): Promise<void> {
  await rtdb.update(`trips/${tripId}/ice`, { offer })
}

export async function setAnswer(tripId: string, answer: RTCSessionDescriptionInit): Promise<void> {
  await rtdb.update(`trips/${tripId}/ice`, { answer })
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
  const pc = createPeerConnection(tripId, tripId, onMessage, async (candidate) => {
    await pushIceCandidate(tripId, 'customer', candidate)
  })

  const dc = createDataChannel(tripId)
  if (dc) {
    setupDataChannel(dc, tripId, onMessage)
    dc.onopen = () => onChannelOpen?.()
  }

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  await setOffer(tripId, { type: offer.type, sdp: offer.sdp })

  const stopWatching = await watchRemoteIceCandidates(tripId, 'customer', async (candidate) => {
    try {
      await pc.addIceCandidate(candidate)
    } catch {
      // ignore invalid candidate
    }
  })

  const answer = await waitForRemoteDescription(tripId, 'answer')
  await pc.setRemoteDescription(new RTCSessionDescription({ type: answer.type, sdp: answer.sdp! }))

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
  const pc = createPeerConnection(tripId, tripId, onMessage, async (candidate) => {
    await pushIceCandidate(tripId, 'driver', candidate)
  })

  const stopWatching = await watchRemoteIceCandidates(tripId, 'driver', async (candidate) => {
    try {
      await pc.addIceCandidate(candidate)
    } catch {
      // ignore invalid candidate
    }
  })

  const offer = await waitForRemoteDescription(tripId, 'offer')
  await pc.setRemoteDescription(new RTCSessionDescription({ type: offer.type, sdp: offer.sdp! }))

  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  await setAnswer(tripId, { type: answer.type, sdp: answer.sdp })

  const dc = getPeerConnection(tripId)?.dc
  if (dc) {
    setupDataChannel(dc, tripId, onMessage)
    dc.onopen = () => onChannelOpen?.()
  }

  return {
    pc,
    stop: () => {
      stopWatching()
      closePeerConnection(tripId)
    },
  }
}
