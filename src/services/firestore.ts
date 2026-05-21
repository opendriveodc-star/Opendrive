// src/services/firestore.ts
// Firestore queries – client đọc trực tiếp (Security Rules kiểm tra isOwner)
// Writes dùng REST API trực tiếp để tránh WebChannel/gRPC issue trên Android

import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { app } from './firebase'
import { firestoreRest } from './firebase'
import type { DriverDoc, MinerDoc, DriverInfo } from '../types'

const db = getFirestore(app)

const withTimeout = <T>(p: Promise<T>, ms = 20000): Promise<T> =>
  Promise.race([p, new Promise<never>((_, r) => setTimeout(() => r(new Error('Kết nối máy chủ chậm, vui lòng thử lại.')), ms))])

const now = () => new Date().toISOString()

// ─── Drivers ─────────────────────────────────────────────────────────────────

export async function getDriver(uid: string): Promise<DriverDoc | null> {
  const snap = await withTimeout(getDoc(doc(db, 'drivers', uid)))
  return snap.exists() ? (snap.data() as DriverDoc) : null
}

export async function createDriver(uid: string, data: Omit<DriverDoc, 'updatedAt' | 'termsAcceptedAt'>): Promise<void> {
  await withTimeout(setDoc(doc(db, 'drivers', uid), {
    ...data,
    termsAcceptedAt: serverTimestamp(),
    updatedAt:       serverTimestamp(),
  }))
}

export async function updateDriverStatus(uid: string, status: DriverDoc['status']): Promise<void> {
  await withTimeout(firestoreRest.patch('drivers', uid, { status, updatedAt: now() }))
}

export async function updateDriverLocation(uid: string, geohash: string): Promise<void> {
  await withTimeout(firestoreRest.patch('drivers', uid, { geohash, updatedAt: now() }))
}

export async function acceptNewTerms(uid: string, termsVersion: string): Promise<void> {
  await withTimeout(firestoreRest.patch('drivers', uid, { termsVersion, updatedAt: now() }))
}

export async function updateDriverFcmToken(uid: string, fcmToken: string): Promise<void> {
  await withTimeout(firestoreRest.patch('drivers', uid, { fcmToken, updatedAt: now() }))
}

export async function updateDriverVehicleInfo(
  uid: string,
  fields: { name: string; vehicleType: string; transportModel: string; vehicleBrand: string; vehicleColor: string; licensePlate: string; avatarUrl?: string },
): Promise<void> {
  await withTimeout(firestoreRest.patch('drivers', uid, { ...fields, updatedAt: now() }))
}

// ─── Miners ──────────────────────────────────────────────────────────────────

export async function getMiner(uid: string): Promise<MinerDoc | null> {
  const snap = await withTimeout(getDoc(doc(db, 'miners', uid)))
  return snap.exists() ? (snap.data() as MinerDoc) : null
}

export async function createMiner(uid: string, phone: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0]
  await withTimeout(setDoc(doc(db, 'miners', uid), {
    uid,
    phone,
    points:          0,
    sessionCount:    0,
    lastMiningDate:  today,
    createdAt:       serverTimestamp(),
  }))
}

// ─── Blacklist ────────────────────────────────────────────────────────────────

export async function isCustomerBlacklisted(uid: string): Promise<{ blacklisted: boolean; cancelCount?: number }> {
  const snap = await withTimeout(getDoc(doc(db, 'blacklist_customers', uid)))
  if (!snap.exists()) return { blacklisted: false }
  const data = snap.data()
  return { blacklisted: true, cancelCount: data.cancelCount }
}
