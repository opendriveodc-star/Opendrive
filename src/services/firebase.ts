// src/services/firebase.ts
// Firebase Auth + Realtime Database (REST API only – không dùng SDK listener)

import { initializeApp } from 'firebase/app'
import { initializeAuth, getAuth, signOut, type Persistence } from 'firebase/auth'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'

// Metro resolves firebase/auth to the RN bundle at runtime which exports this.
// The browser TypeScript types omit it, so we declare it manually.
declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: object): Persistence
}
import { getReactNativePersistence } from 'firebase/auth'
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { FIREBASE } from '../constants'
import { SecureStoreKey } from '../types'

const firebaseConfig = {
  apiKey:            FIREBASE.apiKey,
  authDomain:        FIREBASE.authDomain,
  projectId:         FIREBASE.projectId,
  databaseURL:       FIREBASE.databaseURL,
  storageBucket:     FIREBASE.storageBucket,
  messagingSenderId: FIREBASE.messagingSenderId,
  appId:             FIREBASE.appId,
}

const app = initializeApp(firebaseConfig)

let auth: ReturnType<typeof getAuth>
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  })
} catch {
  auth = getAuth(app)
}
export { auth }

const storage = getStorage(app)

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/**
 * Đăng xuất: set offline Firestore nếu cần (gọi từ bên ngoài trước), rồi
 * signOut Firebase và xóa USER_ROLE khỏi SecureStore.
 * Giữ nguyên DRIVER_INFO + DRIVER_ENCRYPTED_KEY để đăng nhập lại nhanh.
 */
export async function signOutAndClearRole(): Promise<void> {
  await signOut(auth)
  await SecureStore.deleteItemAsync(SecureStoreKey.USER_ROLE)
}

// ─── Firebase Storage ─────────────────────────────────────────────────────────

export async function uploadDriverAvatar(uid: string, imageUri: string): Promise<string> {
  const blob = await (await fetch(imageUri)).blob()
  const storageRef = ref(storage, `avatars/${uid}.jpg`)
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' })
  return getDownloadURL(storageRef)
}

// ─── Realtime Database via REST (không dùng SDK listener) ────────────────────

async function getIdToken(): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')
  return user.getIdToken()
}

function rtdbUrl(path: string): string {
  return `${FIREBASE.databaseURL}/${path}.json`
}

export const rtdb = {
  async get<T>(path: string): Promise<T | null> {
    const token = await getIdToken()
    const res = await fetch(`${rtdbUrl(path)}?auth=${token}`)
    if (!res.ok) throw new Error(`RTDB GET failed: ${res.status}`)
    return res.json()
  },

  async set(path: string, data: unknown): Promise<void> {
    const token = await getIdToken()
    const res = await fetch(`${rtdbUrl(path)}?auth=${token}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    })
    if (!res.ok) throw new Error(`RTDB SET failed: ${res.status}`)
  },

  async update(path: string, data: unknown): Promise<void> {
    const token = await getIdToken()
    const res = await fetch(`${rtdbUrl(path)}?auth=${token}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    })
    if (!res.ok) throw new Error(`RTDB UPDATE failed: ${res.status}`)
  },

  async delete(path: string): Promise<void> {
    const token = await getIdToken()
    const res = await fetch(`${rtdbUrl(path)}?auth=${token}`, {
      method: 'DELETE',
    })
    if (!res.ok) throw new Error(`RTDB DELETE failed: ${res.status}`)
  },
}
