// src/hooks/useDriverInfo.ts
// Custom hook đọc DriverInfo từ SecureStore và cập nhật status

import { useState, useEffect, useCallback } from 'react'
import { getDriverInfo, saveDriverInfo } from '../utils/storage'
import { updateDriverStatus } from '../services/firestore'
import type { DriverInfo, DriverStatus } from '../types'

interface UseDriverInfoResult {
  driverInfo:    DriverInfo | null
  loading:       boolean
  updateStatus:  (status: DriverStatus) => Promise<void>
}

export function useDriverInfo(): UseDriverInfoResult {
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null)
  const [loading,    setLoading]    = useState<boolean>(true)

  useEffect(() => {
    getDriverInfo()
      .then(setDriverInfo)
      .finally(() => setLoading(false))
  }, [])

  const updateStatus = useCallback(
    async (status: DriverStatus) => {
      if (!driverInfo) return
      // Cập nhật Firestore
      await updateDriverStatus(driverInfo.uid, status)
      // Cập nhật SecureStore
      const updated: DriverInfo = { ...driverInfo, status }
      await saveDriverInfo(updated)
      setDriverInfo(updated)
    },
    [driverInfo],
  )

  return { driverInfo, loading, updateStatus }
}
