// src/services/firebase.ts
// Firebase Auth + Realtime Database (REST API only – không dùng SDK listener)

import { initializeApp } from 'firebase/app'
import { initializeAuth, getAuth, indexedDBLocalPersistence, browserLocalPersistence } from 'firebase/auth'
import { FIREBASE } from '../constants'

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
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  })
} catch {
  auth = getAuth(app)
}
export { auth }

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
