// The translation cache (DESIGN §9). Background only: IndexedDB is isolated per extension origin, and the content side
// never touches it — its translate call goes to the background, where the service reads and writes the cache (§8.0).
// cacheKeyFor lives in ./key, importable from both contexts without pulling Dexie into the content bundle.
import type { SentenceAlignment } from '@/providers/alignment'
import { TranslationCache } from './store'

export const translationCache = new TranslationCache()

export * from './key'
export * from './store'

/** The local Dexie cache wrapped as the CachePort the background's services read and write through */
export function cachePortOf(cache: TranslationCache) {
  return {
    getMany: (keys: string[]) => Promise.all(keys.map(key => cache.get(key))),
    async putMany(entries: { key: string; translation: string; paper: string; alignment?: SentenceAlignment }[]) {
      for (const entry of entries) await cache.set(entry.key, { translation: entry.translation, alignment: entry.alignment }, entry.paper)
    },
  }
}
