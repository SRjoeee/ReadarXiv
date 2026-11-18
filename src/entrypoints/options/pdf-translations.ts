// The papers the PDF reader keeps on this machine, for the settings page's Data section (the reader's design, §9.3): the
// reader's papers (cache/paper-store.ts). The page is on the extension's origin, where the reader's store lives, so it reads
// and clears the store itself; no message goes to the background.
import { useCallback, useEffect, useState } from 'react'
import { createPaperStore, type PaperStore } from '@/cache/paper-store'

export interface PdfTranslations {
  /** How many paper versions and how many bytes; null until read, and when the store cannot be read */
  usage: { count: number; bytes: number } | null
  /** The store could not be read or cleared: said as such, never shown as an empty store (Codex on #52) */
  failed: boolean
  clear(): Promise<void>
  /** A clear just went through: the row says so for a moment */
  cleared: boolean
}

let shared: Pick<PaperStore, 'usage' | 'clear'> | null = null
const store = () => (shared ??= createPaperStore())

export function usePdfTranslations(): PdfTranslations {
  const [usage, setUsage] = useState<PdfTranslations['usage']>(null)
  const [failed, setFailed] = useState(false)
  const [cleared, setCleared] = useState(false)

  const load = useCallback(async () => {
    try {
      setUsage(await store().usage())
      setFailed(false)
    } catch {
      setUsage(null)
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
    // The reader keeps papers in other tabs: counted again on coming back, as the HTML line is (data.ts)
    const onVisible = () => { if (!document.hidden) void load() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [load])

  const clear = useCallback(async () => {
    try {
      await store().clear()
    } catch {
      setFailed(true)
      return
    }
    setCleared(true)
    setTimeout(() => setCleared(false), 2000)
    await load()
  }, [load])

  return { usage, failed, clear, cleared }
}
