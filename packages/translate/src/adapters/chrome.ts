// Chrome's built-in translator, over the `Translator` API object the host injects (the extension's background has it;
// a test passes a fake). Written from its measured behaviour (ext-providers-config §16): `create()` needs a user gesture
// while the model is only `downloadable` (a chain's hand-over has none); the first download took 67 s with no progress,
// `create()` 8.6 s with the model ready; `availability()` may never answer, so every probe is bounded; a shared session
// takes no request's signal (one request's timeout would reject the session every other request waits on); the model
// joins sentences with a space after CJK punctuation, which is taken off. It keeps tags (the tags path).
import { realClock } from '../chain.ts'
import { type Clock, Fault, type Lang, type Limits, type Signal, type Translator } from '../contract.ts'
import { sha256Hex } from '../sha256.ts'
import { planTags } from '../wire/tags.ts'
import { readTagged } from './google.ts'

export interface ChromeSession {
  translate(input: string, options?: { signal?: Signal }): Promise<string>
}
/** the two static methods of the platform's `Translator` the adapter uses */
export interface ChromeApi {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<string>
  create(options: { sourceLanguage: string; targetLanguage: string; signal?: Signal }): Promise<ChromeSession>
}

export const CHROME_LIMITS: Limits = { chars: 4_000, units: 20, inFlight: 1, callMs: 60_000, reask: 0 }
/** availability's bound, and a session's making's (60 s: 8.6 s measured with the model ready) */
export const CHROME_PROBE_MS = 2_000
export const CHROME_CREATE_MS = 60_000
export const CHROME_DIGEST = '7b2ed382ba683b06de67712db375d680ad5beb6cbc6a1fa2e55ad2da10b555cb'

/** a target as the API names it: its Chinese by script, bare for the simplified */
const REWRITE: Record<string, string> = { 'zh-Hans': 'zh', 'zh-CN': 'zh', 'zh-TW': 'zh-Hant' }
export const chromeTarget = (target: Lang): string => REWRITE[target] ?? target
/** the space the model sets after CJK punctuation as it joins sentences (`。 我们`) */
export const normalizeSpacing = (text: string): string => text.replace(/([。，、；：？！）」』】])[ \t]+/g, '$1')

interface Controller {
  readonly signal: Signal
  abort(reason?: unknown): void
}
const controller = (): Controller =>
  new (globalThis as unknown as { AbortController: new () => Controller }).AbortController()

const faultOfCreate = (e: unknown): Fault => {
  if (e instanceof Fault) return e
  const name = (e as { name?: unknown })?.name
  if (name === 'NotAllowedError')
    return new Fault('off', 'needs-gesture', 'chrome: the language pack needs a user gesture to download')
  if (name === 'NotSupportedError')
    return new Fault('pass', 'unsupported', 'chrome: the language pair is not supported')
  if (name === 'AbortError') return new Fault('abort', 'aborted', 'chrome: aborted')
  return new Fault('again', 'network', `chrome: ${String((e as Error)?.message ?? e)}`)
}

export interface ChromeOptions {
  /** the platform's `Translator`, or null where this browser has none */
  api: ChromeApi | null
  clock?: Clock
  limits?: Partial<Limits>
}

export function chrome(o: ChromeOptions): Translator {
  const clock = o.clock ?? realClock()
  const sessions = new Map<string, Promise<ChromeSession>>()
  const pair = (target: Lang) => ({ sourceLanguage: 'en', targetLanguage: chromeTarget(target) })
  /** one session per target, shared, made under its own controller and bound, dropped where it fails */
  const sessionOf = (target: Lang): Promise<ChromeSession> => {
    const key = chromeTarget(target)
    const known = sessions.get(key)
    if (known) return known
    const api = o.api
    if (!api) return Promise.reject(new Fault('pass', 'unsupported', 'chrome: no built-in translator in this browser'))
    const making = controller()
    const bound = controller()
    const made = Promise.race([
      api.create({ ...pair(target), signal: making.signal }),
      clock.sleep(CHROME_CREATE_MS, bound.signal).then(() => {
        if (bound.signal.aborted) return new Promise<never>(() => {})
        making.abort()
        throw new Fault('again', 'timeout', `chrome: no session within ${CHROME_CREATE_MS} ms`)
      }),
    ])
      .catch((e) => {
        sessions.delete(key)
        throw faultOfCreate(e)
      })
      .finally(() => bound.abort())
    sessions.set(key, made)
    return made
  }
  return {
    identity: `chrome:${sha256Hex(JSON.stringify(['chrome', 'Translator', 'tags/1', 'raw/1'])).slice(0, 16)}`,
    digest: CHROME_DIGEST,
    context: false,
    limits: { ...CHROME_LIMITS, ...o.limits },
    async supports(target) {
      const api = o.api
      if (!api) return false
      const bound = controller()
      try {
        const got = await Promise.race([
          api.availability(pair(target)),
          clock.sleep(CHROME_PROBE_MS, bound.signal).then(() => 'unanswered'),
        ])
        return got === 'available'
      } catch {
        return false
      } finally {
        bound.abort()
      }
    },
    write: (unit) => planTags(unit).wire,
    read: readTagged,
    async *send(wires, call, signal) {
      if (signal.aborted) throw new Fault('abort', 'aborted', 'chrome: aborted')
      const session = await sessionOf(call.target)
      // each wire on its own inference, all of the request's at once; yielded as each closes
      const pending = new Map<number, Promise<readonly [number, string | null]>>()
      for (const [i, w] of wires.entries()) {
        pending.set(
          i,
          session.translate(w, { signal }).then(
            (s) => [i, normalizeSpacing(s)] as const,
            () => [i, null] as const,
          ),
        )
      }
      while (pending.size) {
        const [i, s] = await Promise.race(pending.values())
        pending.delete(i)
        if (signal.aborted) throw new Fault('abort', 'aborted', 'chrome: aborted')
        if (s !== null) yield [i, s] as const
      }
    },
  }
}
