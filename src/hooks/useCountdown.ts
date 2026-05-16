// src/hooks/useCountdown.ts
// Custom hook đếm ngược từ targetTimestamp

import { useState, useEffect } from 'react'
import { formatCountdown } from '../utils/format'

interface UseCountdownResult {
  timeLeft:  number   // ms còn lại
  formatted: string   // HH:MM:SS
  expired:   boolean
}

export function useCountdown(targetTimestamp: number): UseCountdownResult {
  const calcLeft = () => Math.max(0, targetTimestamp - Date.now())

  const [timeLeft, setTimeLeft] = useState<number>(calcLeft)

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(calcLeft())
    }, 1000)
    return () => clearInterval(interval)
  }, [targetTimestamp])

  return {
    timeLeft,
    formatted: formatCountdown(timeLeft),
    expired:   timeLeft <= 0,
  }
}
