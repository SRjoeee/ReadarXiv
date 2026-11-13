// The time a part of the chrome is drawn at, and drawn again once a time it waits for has come (a retry's: its clock gives way
// to the information sign, its words drop the time, its retry is offered): the website's page's useClock, the chrome's own
import { useEffect, useState } from 'react'

/** the longest a timer waits, ms: the platform's limit, a timer's delay being a signed 32-bit count of ms (`setTimeout`
 *  takes a WebIDL `long`); a time further off is waited for in steps */
const LONGEST_MS = 2 ** 31 - 1

/** now, and again once `at` has passed: the time is read as the component renders, and a timer renders it again at `at`, never
 *  before (one that fires early waits again). None while `at` is null or past */
export function useClock(at: number | null): number {
  const now = Date.now()
  const [, wake] = useState(0)
  const waiting = at !== null && now < at
  useEffect(() => {
    if (!waiting || at === null) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      const left = at - Date.now()
      if (left <= 0) return wake((n) => n + 1)
      timer = setTimeout(arm, Math.min(left, LONGEST_MS))
    }
    arm()
    return () => clearTimeout(timer)
  }, [at, waiting])
  return now
}
