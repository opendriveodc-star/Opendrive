// src/hooks/useODCBalance.ts
// Custom hook lấy số dư ODC từ Stellar Horizon

import { useState, useEffect, useCallback } from 'react'
import { getODCBalance } from '../services/odc'

interface UseODCBalanceResult {
  balance: number
  loading: boolean
  refresh: () => void
}

export function useODCBalance(
  stellarWallet:  string,
  issuerAddress:  string,
): UseODCBalanceResult {
  const [balance, setBalance] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(false)

  const fetchBalance = useCallback(async () => {
    if (!stellarWallet || !issuerAddress) return
    setLoading(true)
    try {
      const bal = await getODCBalance(stellarWallet, issuerAddress)
      setBalance(bal)
    } catch {
      // giữ nguyên balance cũ nếu lỗi
    } finally {
      setLoading(false)
    }
  }, [stellarWallet, issuerAddress])

  useEffect(() => {
    fetchBalance()
    const interval = setInterval(fetchBalance, 30_000)
    return () => clearInterval(interval)
  }, [fetchBalance])

  return { balance, loading, refresh: fetchBalance }
}
