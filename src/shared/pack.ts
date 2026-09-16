// The offline service's language pack (DESIGN §8.4), shared by the popup and the options page.
// Both are extension pages, where the Translator API is available directly.
import { toBcp47 } from '@/config/languages'
import { BUILTIN_SOURCE_LANGUAGE } from '@/providers/chrome-builtin'

export type PackState = 'unsupported' | 'available' | 'downloadable' | 'downloading' | 'unavailable'

type TranslatorGlobal = {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<string>
  create(o: { sourceLanguage: string; targetLanguage: string }): Promise<unknown>
}
const translatorApi = () => (globalThis as { Translator?: TranslatorGlobal }).Translator

export async function packState(target: string): Promise<PackState> {
  const api = translatorApi()
  if (!api) return 'unsupported'
  try {
    return (await api.availability({ sourceLanguage: BUILTIN_SOURCE_LANGUAGE, targetLanguage: toBcp47(target) })) as PackState
  } catch {
    return 'unavailable'
  }
}

/**
 * Download the pack. **Must run from the click itself**: with availability at `downloadable`,
 * create() without a user gesture throws NotAllowedError (RESEARCH §6.1). During a first download
 * availability() keeps answering `downloadable` and the monitor emits no progress (measured: 67 s),
 * so callers show an indeterminate state until this resolves. Returns false when there is no API
 */
export async function downloadPack(target: string): Promise<boolean> {
  const api = translatorApi()
  if (!api) return false
  await api.create({ sourceLanguage: BUILTIN_SOURCE_LANGUAGE, targetLanguage: toBcp47(target) })
  return true
}

/**
 * What a surface shows for the pack, kept honest across lookups that answer in any order (the local review of S1):
 * the committed configuration owns the wanted target, only the newest lookup for it publishes, and none while a
 * download of it is in flight — `availability()` says `downloadable` until the download ends. The popup and the
 * settings page each hold one; `null` is published while nothing is known for the wanted target.
 *
 * The two surfaces do not share the instance, so a download finished in one is announced to the other
 * (`axt:pack-state`, INVENTORY S7): `announce` sends what a download of ours found, `receive` takes what another
 * surface announced — the same message shape the helper's state travels in
 */
export interface PackLookup {
  /** The committed configuration's target. Another target forgets the previous one's state at once (Codex on #185) */
  want(target: string): void
  /** Look `target` up: answers its state, and publishes it when this is the newest lookup, for the wanted target, with no download of it in flight */
  check(target: string): Promise<PackState>
  /**
   * Download `target`: `run` is called from this call itself (the user gesture above says why), `downloading` shows
   * meanwhile, and the target of the moment — the wanted one, which may have moved on — is looked up after, whatever
   * the outcome
   */
  download(target: string, run: (target: string) => Promise<unknown>): Promise<void>
  /**
   * A state another surface announced for `target`. Published when it is the wanted target and no download of it
   * is in flight here; it supersedes any lookup of ours still in flight, since it is newer than what that lookup
   * started from. Another target is ignored — its state is that surface's business until the reader wants it here
   */
  receive(target: string, state: PackState): void
}

export function createPackLookup(deps: {
  publish: (state: PackState | null) => void
  state?: (target: string) => Promise<PackState>
  /** Tell the other surfaces what a download of ours found; absent, downloads stay local (the tests, a single surface) */
  announce?: (target: string, state: PackState) => void
}): PackLookup {
  const state = deps.state ?? packState
  let wanted: string | null = null
  /**
   * The newest lookup. An older one that answers later publishes nothing: while A downloaded, a configuration change
   * looked A up; the download ended and its own lookup said `available`; the earlier answer, `downloadable`, would
   * have put the Download button back over an installed pack (the local review of S1, third pass)
   */
  let lookups = 0
  /** The targets whose download is in flight, every one of them: a reader can start B while A downloads and come back to A (Codex on #185) */
  const downloading = new Set<string>()
  const check = async (target: string): Promise<PackState> => {
    const lookup = ++lookups
    const found = await state(target)
    if (lookup === lookups && wanted === target && !downloading.has(target)) deps.publish(found)
    return found
  }
  return {
    want(target) {
      if (wanted === target) return
      wanted = target
      deps.publish(null)
    },
    check,
    async download(target, run) {
      downloading.add(target)
      deps.publish('downloading')
      try {
        await run(target)
      } finally {
        downloading.delete(target)
        // The target of the moment is looked up, as before. When it is still the one downloaded, what was found is the
        // download's result and the other surfaces hear it; a target the reader left behind meanwhile is announced to
        // nobody — the configuration is shared, so the other surfaces show the new one as well
        const current = wanted ?? target
        const found = await check(current)
        if (current === target) deps.announce?.(target, found)
      }
    },
    receive(target, state) {
      if (target !== wanted || downloading.has(target)) return
      lookups++
      deps.publish(state)
    },
  }
}
