// The settings page's data layer: the stored config and the few statuses the page shows. Every change is written
// straight away (there is no save button). Reading, patching and following the configuration — and the reload an
// interface language takes, which here waits for the page's drafts — is the surface configuration's
// (shared/surface-config.ts); this adds the cache.
import { useCallback, useEffect, useState } from 'react'
import { ConfigUnreadableError, type FallbackReason, getConfig } from '@/config/storage'
import type { Config } from '@/config/schema'
import { onMessages, sendMessage } from '@/shared/messages'
import { type PackState, downloadPack } from '@/shared/pack'
import { drafts } from '@/ui/drafts'
import { useSurfaceConfig } from '@/ui/use-surface-config'

export interface CacheStats { entries: number; bytes: number }

export interface OptionsData {
  config: Config | null
  /** Why the stored config fell back to defaults, if it did; worded by the page (ui/strings.ts) */
  fallbackReason: FallbackReason | null
  /** Change the stored configuration. While it cannot be read the store refuses (config/storage.ts): resolves with what is in effect, unchanged */
  patch(fn: (latest: Config) => Config): Promise<Config>
  /** Replace a stored configuration that cannot be read with the defaults — the reader's explicit choice (S-O-02) */
  reset(): Promise<Config>
  /** The last reset was refused by storage; the notice says so */
  resetFailed: boolean
  pack: PackState | null
  /** Re-query the pack for a language the reader just chose (the Chrome card would otherwise show the old one) */
  checkPack(target: string): Promise<PackState>
  fetchPack(): Promise<void>
  cache: CacheStats | null
  cacheError: string
  clearCache(): Promise<void>
  cacheCleared: boolean
}

export function useOptionsData(): OptionsData {
  // A draft — a service being edited, a profile, a prompt — is local until its own save, and a reload would discard it
  const { surface, state } = useSurfaceConfig({ holds: drafts })
  const [cache, setCache] = useState<CacheStats | null>(null)
  const [cacheError, setCacheError] = useState('')
  const [cacheCleared, setCacheCleared] = useState(false)

  const loadCache = useCallback(async () => {
    try {
      const res = await sendMessage({ type: 'axt:cache-stats' })
      // Unreadable is reported as unreadable: showing a failure as “0 entries” would make the reader think the cache is empty (Codex on #52)
      if (res.ok) { setCache({ entries: res.entries, bytes: res.bytes }); setCacheError('') }
      else { setCache(null); setCacheError(res.message) }
    } catch (e) {
      setCache(null)
      setCacheError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    const stopBroadcasts = onMessages({
      // A pack downloaded from the popup: the Chrome card here must not keep offering the download
      'axt:pack-changed': message => {
        if (message.target) surface.receivePack(message.target)
        return undefined
      },
    })
    void loadCache()
    // Translation happens in other tabs: re-read on returning to the settings page, or the numbers shown are forever those of the moment it opened
    const onVisible = () => { if (!document.hidden) void loadCache() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      stopBroadcasts()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [loadCache, surface])

  /**
   * A refused write (the stored value cannot be read) is no error on this page: the notice above the sections says
   * why and offers the reset, and the caller gets what is in effect. The sections are not rendered in this state
   * (App.tsx), so this is the race only — the stored value turned unreadable while a section was open
   */
  const patch = useCallback((fn: (latest: Config) => Config): Promise<Config> => surface.patch(fn).catch(e => {
    const inEffect = surface.state().config
    if (e instanceof ConfigUnreadableError && inEffect) return inEffect
    throw e
  }), [surface])

  /** From the click itself (shared/pack.ts says why); the row shows an indeterminate state meanwhile */
  const fetchPack = useCallback(async () => {
    const target = (await getConfig()).targetLanguage
    await surface.downloadPack(target, async downloaded => {
      await downloadPack(downloaded)
      // The chain lives in background (§8.0): have it rebuild one with the now-usable offline
      // service. No session is moved — this page promised nothing about any tab, and a page
      // translating into another language must keep the chain it started on (Codex on #157)
      await sendMessage({ type: 'axt:engine-ready', id: 'chrome-builtin' }).catch(() => undefined)
    })
  }, [surface])

  const clearCache = useCallback(async () => {
    const res = await sendMessage({ type: 'axt:cache-clear' })
    if (!res.ok) { setCacheError(res.message); return }
    setCacheCleared(true)
    setTimeout(() => setCacheCleared(false), 2000)
    await loadCache()
  }, [loadCache])

  return { config: state.config, fallbackReason: state.fallbackReason, patch, reset: surface.reset, resetFailed: state.resetFailed, pack: state.pack, checkPack: surface.checkPack, fetchPack, cache, cacheError, clearCache, cacheCleared }
}
