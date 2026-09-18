// The settings page's switch for the floating button (UI.md S-O-49c). The button's state is not in the
// configuration and the settings page is not its writer: it asks the background, the state's only writer, as the
// pages do (shared/entry-settings.ts), and follows the key so that a "don't show again" on a page shows here at once.
import { useCallback, useEffect, useState } from 'react'
import { sendMessage } from '@/shared/messages'

export function useFloatingEntry(): { enabled: boolean | null; setEnabled: (enabled: boolean) => void } {
  const [enabled, setShown] = useState<boolean | null>(null)
  useEffect(() => {
    let gone = false
    const ask = () => void sendMessage({ type: 'axt:entry-settings' }).then(s => { if (!gone) setShown(s.floating.enabled) }).catch(() => undefined)
    const onChanged = (changes: Record<string, unknown>) => { if ('floatingEntry' in changes) ask() }
    ask()
    browser.storage.local.onChanged.addListener(onChanged)
    return () => {
      gone = true
      browser.storage.local.onChanged.removeListener(onChanged)
    }
  }, [])
  // What the background says is stored is what the switch shows: a save that failed flips it back
  const setEnabled = useCallback((next: boolean) => {
    setShown(next)
    void sendMessage({ type: 'axt:set-floating-entry', patch: { enabled: next } }).then(r => setShown(r.floating.enabled)).catch(() => setShown(!next))
  }, [])
  return { enabled, setEnabled }
}
