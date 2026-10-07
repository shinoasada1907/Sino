import { useEffect, useState } from 'react'

/** The current time, refreshed every minute so texts like "2 phút trước" keep up. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  return now
}
