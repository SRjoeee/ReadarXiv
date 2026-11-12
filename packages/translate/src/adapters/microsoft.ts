// Microsoft Edge's free translation endpoint, written from its measured behaviour (translation dossier §16,
// ext-providers-config §16) as the owner's own code. No key. It keeps markers, not tags; it answers each text with its own
// sentence lengths (`sentLen`, unrequested, usable on white-space-collapsed text: 60/60 counts matched); it refuses over
// 50,000 characters a request with a plain-text 400; throughput comes from concurrency (2,000-character requests, 8 in
// flight: 23 k characters/s, no 429 in 30); from Cloudflare it refuses a request with no browser User-Agent, which the
// Worker's injected fetch sets.
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
import { cutsOf, outOfAtoms, partitions, snap } from '../wire/align.ts'
import {
  contentOf,
  MARKER_ATOM,
  type MarkersPlan,
  planMarkers,
  readMarkers,
  refill,
  type Tok,
} from '../wire/markers.ts'
import { SENTINEL } from '../wire/text.ts'
import { faultOfReply, faultOfThrow, readJson } from './http.ts'

export const MICROSOFT_ENDPOINT = 'https://edge.microsoft.com/translate/translatetext'
/** the raw reply's shape, part of the identity: `{ text, src?, tr? }`, the item's text and its sentence lengths */
const RAW = 'raw/1'

/** the endpoint's own table of targets (fetched 2026-09-08 and 2026-09-17: the same 138 codes) */
const SUPPORTED = new Set(
  `af am ar as az ba be bg bho bn bo brx bs ca cs cy da de doi dsb dv el en es es-MX et eu fa fi fil
  fj fo fr fr-CA ga gl gom gu ha he hi hne hr hsb ht hu hy id ig ikt is it iu iu-Latn ja ka kk km kmr
  kn ko ks ku ky lb ln lo lt lug lv lzh mai mg mi mk ml mn-Cyrl mn-Mong mni mr ms mt mww my nb ne nl
  nso nya or otq pa pl prs ps pt pt-PT ro ru run rw sd si sk sl sm sn so sq sr-Cyrl sr-Latn st sv sw
  ta te th ti tk tlh-Latn tlh-Piqd tn to tr tt ty ug uk ur uz vi xh yo yua yue zh-Hans zh-Hant zu`
    .trim()
    .split(/\s+/),
)
/** a target as the endpoint must be asked it: a bare `sr` comes back Latin and `zh` must be `zh-Hans` (measured
 *  2026-09-09); `ny`, `lg` are three-letter codes there. A script the endpoint cannot write (`bs-Cyrl`, `uz-Cyrl`,
 *  `az-Cyrl`) is in no row of its table, so it is not served */
const REWRITE: Record<string, string> = {
  zh: 'zh-Hans',
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
  mn: 'mn-Cyrl',
  sr: 'sr-Cyrl',
  ny: 'nya',
  lg: 'lug',
}
export const microsoftTarget = (target: Lang): string => REWRITE[target] ?? target
/** whether the endpoint serves a target, synchronously (a host's settings say it before any call) */
export const microsoftServesTarget = (target: Lang): boolean => SUPPORTED.has(microsoftTarget(target))

export const MICROSOFT_LIMITS: Limits = { chars: 2_000, units: 100, inFlight: 8, callMs: 10_000, reask: 0 }
/** the plain-text words of its 400 for a request over its cap of 50,000 characters in all (measured 2026-09-08, DESIGN §8.3):
 *  the one 400 of it a smaller request mends */
const OVER_CAP = /exceeds the maximum allowed translation size/i

/** the behaviour digest of write and read over tests/adapters/fixtures.ts (the suite prints a new one when they move) */
export const MICROSOFT_DIGEST = '6fec7ab7dd7c0407c0972f3b1220033e30a3379a85746afd4a2461a85b931990'

export interface MicrosoftOptions {
  fetch: Fetch
  limits?: Partial<Limits>
}

/** a sentence's first character: past the white space a boundary leaves at its start */
const startOf = (text: string, at: number): number => {
  let i = at
  while (i < text.length && /\s/.test(text[i] as string)) i++
  return i
}

/** the endpoint's sentence lengths as where each sentence after the first begins, in both projections; undefined where
 *  they do not partition both texts, or the reply's sentences cannot be read back as its content */
function sentencesOf(
  unit: UnitIn,
  plan: MarkersPlan,
  text: string,
  src: unknown,
  tr: unknown,
  toks: readonly Tok[],
  tolerant: boolean,
): Sentences | undefined {
  if (!partitions(src, plan.wire.length) || !partitions(tr, text.length) || src.length !== tr.length || src.length < 2)
    return undefined
  const filler = /@@|@[a-z]+#|\s/
  const cs = snap(cutsOf(src), plan.wire, filler).map((c) => outOfAtoms(c, plan.wire, MARKER_ATOM))
  const ct = snap(cutsOf(tr), text, filler).map((c) => outOfAtoms(c, text, MARKER_ATOM))
  // the reply with a sentinel where each sentence begins, read back as it was: the sentinels' places are the boundaries
  let marked = ''
  let last = 0
  for (const c of ct) {
    marked += text.slice(last, c) + SENTINEL
    last = c
  }
  const back = readMarkers(marked + text.slice(last), plan, tolerant)
  const content = back && contentOf(refill(back, plan.refill), plan.around, plan.beside)
  if (!content) return undefined
  const withSentinels = projectionOf(content)
  const bare = (s: string) => s.split(SENTINEL).join('').replace(/\s+/g, '')
  const plain = projectionOf(contentOf(toks as Tok[], plan.around, plan.beside) ?? [])
  if (bare(withSentinels) !== bare(plain)) return undefined
  const at: number[] = []
  for (let i = 0, n = 0; i < withSentinels.length; i++) {
    if (withSentinels[i] === SENTINEL) at.push(n)
    else n++
  }
  if (at.length !== ct.length) return undefined
  const source = projectionOf(unit.content)
  const out: { src: number[]; tr: number[] } = { src: [], tr: [] }
  cs.forEach((c, j) => {
    const s = startOf(source, plan.plainAt[c] ?? source.length)
    const t = startOf(plain, at[j] as number)
    if (s <= (out.src.at(-1) ?? 0) || t <= (out.tr.at(-1) ?? 0) || s >= source.length || t >= plain.length) return
    out.src.push(s)
    out.tr.push(t)
  })
  return out.src.length ? out : undefined
}

/** read a raw reply against a unit's plan: strictly, else tolerantly, but for a unit stated `strict` */
export function readMicrosoft(unit: UnitIn, raw: string): { content: OutPiece[]; sentences?: Sentences } | null {
  const r = readJson(raw) as { text?: unknown; src?: unknown; tr?: unknown } | null
  if (!r || typeof r.text !== 'string') return null
  const plan = planMarkers(unit)
  for (const tolerant of unit.strict ? [false] : [false, true]) {
    const toks = readMarkers(r.text, plan, tolerant)
    if (!toks) continue
    const filled = refill(toks, plan.refill)
    const content = contentOf(filled, plan.around, plan.beside)
    if (!content) continue
    const sentences = unit.sentences ? sentencesOf(unit, plan, r.text, r.src, r.tr, filled, tolerant) : undefined
    return sentences ? { content, sentences } : { content }
  }
  return null
}

export function microsoft(o: MicrosoftOptions): Translator {
  const limits = { ...MICROSOFT_LIMITS, ...o.limits }
  return {
    identity: `microsoft:${sha256Hex(JSON.stringify(['microsoft', MICROSOFT_ENDPOINT, 'markers/1', RAW])).slice(0, 16)}`,
    digest: MICROSOFT_DIGEST,
    context: false,
    wire: 'markers',
    limits,
    supports: async (target) => microsoftServesTarget(target),
    write: (unit) => planMarkers(unit).wire,
    read: readMicrosoft,
    async *send(wires, call, signal) {
      const query = `from=${SOURCE}&to=${encodeURIComponent(microsoftTarget(call.target))}&isEnterpriseClient=false`
      let body: string
      try {
        const reply = await o.fetch(`${MICROSOFT_ENDPOINT}?${query}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(wires),
          signal,
        })
        if (!reply.ok) throw await faultOfReply('microsoft', reply, { cap: OVER_CAP })
        body = await reply.text()
      } catch (e) {
        throw faultOfThrow('microsoft', e, signal)
      }
      const items = readJson(body)
      if (!Array.isArray(items) || items.length !== wires.length) {
        throw new Fault(
          'again',
          'malformed',
          `microsoft: ${Array.isArray(items) ? `${items.length} items for ${wires.length}` : 'not a JSON array'}`,
          { tries: 2 },
        )
      }
      for (const [i, item] of items.entries()) {
        const tr = (
          item as { translations?: { text?: unknown; sentLen?: { srcSentLen?: unknown; transSentLen?: unknown } }[] }
        )?.translations?.[0]
        if (typeof tr?.text !== 'string') continue
        const s = tr.sentLen
        const raw =
          Array.isArray(s?.srcSentLen) && Array.isArray(s?.transSentLen)
            ? { text: tr.text, src: s.srcSentLen, tr: s.transSentLen }
            : { text: tr.text }
        yield [i, JSON.stringify(raw)] as const
      }
    },
  }
}
