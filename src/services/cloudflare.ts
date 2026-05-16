// src/services/cloudflare.ts
// Cloudflare Worker API calls

import { auth } from './firebase'
import { WORKER } from '../constants'
import type {
  WorkerResponse,
  CreateWalletRequest,
  CreateWalletResponse,
  NotifyDriversRequest,
  NotifySelectedDriverRequest,
  StellarRecordRequest,
  StellarRecordResponse,
  TurnCredentials,
  VehicleType,
} from '../types'

export interface MiningReportRequest {
  uid:           string
  rounds:        number
}
export interface MiningReportResponse {
  points: number
}

export interface ExchangePointsRequest {
  uid:           string
  points:        number
  walletAddress: string
}
export interface ExchangePointsResponse {
  txHash:   string
  odcSent:  number
}

async function getIdToken(): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')
  return user.getIdToken()
}

async function workerFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<WorkerResponse<T>> {
  const token = await getIdToken()
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  })
  const data: WorkerResponse<T> = await res.json()
  return data
}

// Worker 1: Tạo ví Stellar cho tài xế mới
export async function createWallet(uid: string): Promise<CreateWalletResponse> {
  const body: CreateWalletRequest = { uid }
  const res = await workerFetch<CreateWalletResponse>(WORKER.CREATE_WALLET, {
    method: 'POST',
    body:   JSON.stringify(body),
  })
  if (!res.success || !res.data) throw new Error(res.error ?? 'create-wallet failed')
  return res.data
}

// Worker 2: Notify tài xế gần về chuyến mới
export async function notifyDrivers(tripId: string, geohash: string, vehicleType: VehicleType): Promise<void> {
  const body: NotifyDriversRequest = { tripId, geohash, vehicleType }
  const res = await workerFetch(WORKER.NOTIFY_DRIVERS, {
    method: 'POST',
    body:   JSON.stringify(body),
  })
  if (!res.success) throw new Error(res.error ?? 'notify-drivers failed')
}

// Worker 3: Notify tài xế được chọn
export async function notifySelectedDriver(tripId: string, driverUid: string): Promise<void> {
  const body: NotifySelectedDriverRequest = { tripId, driverUid }
  const res = await workerFetch(WORKER.NOTIFY_SELECTED, {
    method: 'POST',
    body:   JSON.stringify(body),
  })
  if (!res.success) throw new Error(res.error ?? 'notify-selected failed')
}

// Worker 4: Ghi chuyến lên Stellar blockchain
export async function recordTrip(payload: StellarRecordRequest): Promise<StellarRecordResponse> {
  const res = await workerFetch<StellarRecordResponse>(WORKER.STELLAR_RECORD, {
    method: 'POST',
    body:   JSON.stringify(payload),
  })
  if (!res.success || !res.data) throw new Error(res.error ?? 'stellar-record failed')
  return res.data
}

// Worker 5: Lấy TURN credentials cho WebRTC
export async function getTurnCredentials(): Promise<TurnCredentials> {
  const res = await workerFetch<TurnCredentials>(WORKER.TURN_CREDENTIALS)
  if (!res.success || !res.data) throw new Error(res.error ?? 'turn-credentials failed')
  return res.data
}

// Worker 7: Ghi điểm đào coin vào Firestore
export async function miningReport(uid: string, rounds: number): Promise<MiningReportResponse> {
  const body: MiningReportRequest = { uid, rounds }
  const res = await workerFetch<MiningReportResponse>(WORKER.MINING_REPORT, {
    method: 'POST',
    body:   JSON.stringify(body),
  })
  if (!res.success || !res.data) throw new Error(res.error ?? 'mining-report failed')
  return res.data
}

// Worker 8: Đổi điểm lấy ODC
export async function exchangePoints(payload: ExchangePointsRequest): Promise<ExchangePointsResponse> {
  const res = await workerFetch<ExchangePointsResponse>(WORKER.EXCHANGE_POINTS, {
    method: 'POST',
    body:   JSON.stringify(payload),
  })
  if (!res.success || !res.data) throw new Error(res.error ?? 'exchange-points failed')
  return res.data
}
