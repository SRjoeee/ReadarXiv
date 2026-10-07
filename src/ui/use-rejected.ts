// The service health record (the redesign's design, §4) as a React hook: the ids of the reader's services whose key the
// endpoint refused, for the settings page and the reader; the popup's state holds the same logic outside React
// (entrypoints/popup/state.ts). Subscribed first, read after: an event heard while the read is still out means the read
// answers a moment already superseded, and applying it would overwrite what the event gave (Codex review, round 3). A
// read that fails leaves no mark shown and says so once, with no id and no key (hard rule 5); the subscription still
// brings the next change
import { useEffect, useState } from 'react'
import { rejectedServices, watchRejected } from '@/shared/service-health'

const NONE: readonly string[] = []

export function useRejected(): readonly string[] {
  const [ids, setIds] = useState<readonly string[]>(NONE)
  useEffect(() => {
    let heard = false
    let live = true
    const stop = watchRejected(now => {
      heard = true
      setIds([...now])
    })
    rejectedServices()
      .then(now => { if (live && !heard) setIds([...now]) })
      .catch(() => console.warn('[axt] the refused-key record could not be read'))
    return () => {
      live = false
      stop()
    }
  }, [])
  return ids
}
