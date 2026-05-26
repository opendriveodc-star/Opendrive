// src/utils/storage.ts
// Helper functions cho SecureStore – đọc/ghi các entity chính

import * as SecureStore from 'expo-secure-store'
import {
  SecureStoreKey,
  type DriverInfo,
  type PendingTrip,
  type PendingPenalty,
  type CustomerInfo,
  type MinerInfo,
  type MinerSession,
} from '../types'

// ─── DriverInfo ───────────────────────────────────────────────────────────────

export async function getDriverInfo(): Promise<DriverInfo | null> {
  const raw = await SecureStore.getItemAsync(SecureStoreKey.DRIVER_INFO)
  if (!raw) return null
  return JSON.parse(raw) as DriverInfo
}

export async function saveDriverInfo(info: DriverInfo): Promise<void> {
  await SecureStore.setItemAsync(SecureStoreKey.DRIVER_INFO, JSON.stringify(info))
}

// ─── Encrypted private key ────────────────────────────────────────────────────

export async function getEncryptedKey(): Promise<string | null> {
  return SecureStore.getItemAsync(SecureStoreKey.DRIVER_ENCRYPTED_KEY)
}

// ─── PendingTrip ──────────────────────────────────────────────────────────────

export async function getPendingTrip(): Promise<PendingTrip | null> {
  const raw = await SecureStore.getItemAsync(SecureStoreKey.PENDING_TRIP)
  if (!raw) return null
  return JSON.parse(raw) as PendingTrip
}

export async function savePendingTrip(trip: PendingTrip): Promise<void> {
  await SecureStore.setItemAsync(SecureStoreKey.PENDING_TRIP, JSON.stringify(trip))
}

export async function clearPendingTrip(): Promise<void> {
  await SecureStore.deleteItemAsync(SecureStoreKey.PENDING_TRIP)
}

// ─── PendingPenalty (mảng — tích lũy nhiều lần hủy chuyến) ──────────────────

export async function getPendingPenalties(): Promise<PendingPenalty[]> {
  const raw = await SecureStore.getItemAsync(SecureStoreKey.PENDING_PENALTY)
  if (!raw) return []
  const parsed = JSON.parse(raw)
  // backward compat: nếu là object cũ (single) thì wrap lại thành mảng
  return Array.isArray(parsed) ? parsed : [parsed]
}

export async function addPendingPenalty(p: PendingPenalty): Promise<void> {
  const existing = await getPendingPenalties()
  await SecureStore.setItemAsync(SecureStoreKey.PENDING_PENALTY, JSON.stringify([...existing, p]))
}

export async function clearPendingPenalty(): Promise<void> {
  await SecureStore.deleteItemAsync(SecureStoreKey.PENDING_PENALTY)
}

export async function savePendingPenalties(list: PendingPenalty[]): Promise<void> {
  if (list.length === 0) {
    await SecureStore.deleteItemAsync(SecureStoreKey.PENDING_PENALTY)
  } else {
    await SecureStore.setItemAsync(SecureStoreKey.PENDING_PENALTY, JSON.stringify(list))
  }
}

// ─── CustomerInfo ─────────────────────────────────────────────────────────────

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  const raw = await SecureStore.getItemAsync(SecureStoreKey.CUSTOMER_INFO)
  if (!raw) return null
  return JSON.parse(raw) as CustomerInfo
}

export async function saveCustomerInfo(info: CustomerInfo): Promise<void> {
  await SecureStore.setItemAsync(SecureStoreKey.CUSTOMER_INFO, JSON.stringify(info))
}

// ─── MinerInfo ────────────────────────────────────────────────────────────────

export async function getMinerInfo(): Promise<MinerInfo | null> {
  const raw = await SecureStore.getItemAsync(SecureStoreKey.MINER_INFO)
  if (!raw) return null
  return JSON.parse(raw) as MinerInfo
}

// ─── MinerSession ─────────────────────────────────────────────────────────────

export async function getMinerSession(): Promise<MinerSession | null> {
  const raw = await SecureStore.getItemAsync(SecureStoreKey.MINER_SESSION)
  if (!raw) return null
  return JSON.parse(raw) as MinerSession
}
