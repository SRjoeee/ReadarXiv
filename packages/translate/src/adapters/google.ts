// Google Translate's web app endpoint (translateHtml), written from its measured behaviour (translation dossier §16,
// ext-providers-config §16) as the owner's own code. The body is `[[items, from, to], 'wt_lib']` with the web app's
// public client key (a third party's public constant, not a secret: CLAUDE.md rule 5); 150 items in 556 ms, 63 ms
// median; tags kept 100 %. Its concurrency is 2, and a rate must never be the binding constraint (a token bucket of 2/s
// once made a 216-block paper take 29.6 s).
import { projectionOf } from '../accept.ts'
import {
  Fault,
  type Fetch,
  type Lang,
  type Limits,
  type OutPiece,
  type Sentences,
  SOURCE,
  type Translator,
  type UnitIn,
} from '../contract.ts'
import { sha256Hex } from '../sha256.ts'
import { planTags, readTags } from '../wire/tags.ts'
import { faultOfReply, faultOfThrow, readJson } from './http.ts'

export const GOOGLE_ENDPOINT = 'https://translate-pa.googleapis.com/v1/translateHtml'
const PUBLIC_KEY = 'AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520'
const CLIENT = 'wt_lib'
/** a target as the endpoint is asked it: its Chinese by region, its Serbian and Mongolian by language */
const REWRITE: Record<string, string> = { 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW', 'sr-Cyrl': 'sr', 'mn-Cyrl': 'mn' }
export const googleTarget = (target: Lang): string => REWRITE[target] ?? target

export const GOOGLE_LIMITS: Limits = { chars: 8_000, units: 100, inFlight: 2, callMs: 10_000, reask: 0 }
/** the behaviour digest of write and read over tests/adapters/fixtures.ts */
export const GOOGLE_DIGEST = 'b4884880a995de0b2829019e196c9d376a62c788e29d56b177260723ceeb3b7c'

const startOf = (text: string, at: number): number => {
  let i = at
  while (i < text.length && /\s/.test(text[i] as string)) i++
  return i
}

/** read a tags reply (Google's, Chrome's) against a unit: its content, and its marked sentences where they reconstruct */
export function readTagged(unit: UnitIn, raw: string): { content: OutPiece[]; sentences?: Sentences } | null {
  if (typeof raw !== 'string') return null
  const plan = planTags(unit)
  const r = readTags(raw, plan)
  if (!r) return null
  if (!r.at || r.at.length !== plan.cuts.length) return { content: r.content }
  const source = projectionOf(unit.content)
  const target = projectionOf(r.content)
  const out: { src: number[]; tr: number[] } = { src: [], tr: [] }
  plan.cuts.forEach((c, j) => {
    const s = startOf(source, c)
    const t = startOf(target, r.at?.[j] as number)
    if (s <= (out.src.at(-1) ?? 0) || t <= (out.tr.at(-1) ?? 0) || s >= source.length || t >= target.length) return
    out.src.push(s)
    out.tr.push(t)
  })
  return out.src.length ? { content: r.content, sentences: out } : { content: r.content }
}

/** the behaviour digest of the tags wire with its elements as voids (Chrome's codec, chrome.ts CHROME_DIGEST) */
export const TAGS_DIGEST = 'c02921cd5804be7c04a53b0972f4f7cab9d1f5ad13245dd8e0997d6527c0e4bf'

/** The tags wire as a host's own translator that keeps tags writes and reads it (the extension's LLM services): Chrome's
 *  codec, its elements voids (what the prompt tells a model a void tag is), so its behaviour digest is Chrome's; Google
 *  reads the same way and writes its tags as HTML's own inline elements (wire/tags.ts TagSpelling) */
export const tagsWire = {
  write: (unit: UnitIn): string => planTags(unit).wire,
  read: readTagged,
  digest: TAGS_DIGEST,
} as const

export interface GoogleOptions {
  fetch: Fetch
  limits?: Partial<Limits>
}

export function google(o: GoogleOptions): Translator {
  return {
    identity: `google:${sha256Hex(JSON.stringify(['google', GOOGLE_ENDPOINT, CLIENT, 'tags/1', 'raw/1'])).slice(0, 16)}`,
    digest: GOOGLE_DIGEST,
    context: false,
    wire: 'tags',
    limits: { ...GOOGLE_LIMITS, ...o.limits },
    supports: async () => true,
    // (each element a word of its sentence and each styled group the words it holds, in HTML's own inline element: as an
    // empty element or one HTML does not know Google translates the texts on either side of it apart, each closed with a
    // full stop of its own, and a group's words apart from their sentence; wire/tags.ts TagSpelling)
    write: (unit) => planTags(unit, 'html').wire,
    read: readTagged,
    async *send(wires, call, signal) {
      let body: string
      try {
        const reply = await o.fetch(GOOGLE_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json+protobuf', 'X-Goog-API-Key': PUBLIC_KEY },
          body: JSON.stringify([[wires, SOURCE, googleTarget(call.target)], CLIENT]),
          signal,
        })
        if (!reply.ok) throw await faultOfReply('google', reply)
        body = await reply.text()
      } catch (e) {
        throw faultOfThrow('google', e, signal)
      }
      const payload = readJson(body)
      const items = Array.isArray(payload) ? payload[0] : undefined
      if (!Array.isArray(items) || items.length !== wires.length) {
        throw new Fault(
          'again',
          'malformed',
          `google: ${Array.isArray(items) ? `${items.length} items for ${wires.length}` : 'no translations array'}`,
          { tries: 2 },
        )
      }
      for (const [i, item] of items.entries()) if (typeof item === 'string') yield [i, item] as const
    },
  }
}
