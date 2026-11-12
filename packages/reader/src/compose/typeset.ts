// The reader's own typesetter, openReader's engine where its host gives none (a host may still give its own: the e2e's fixture
// lay): lane L3's `layPage` over the rule set's rules for the target the rows are of (`rulesFor`), the reader's "What to
// translate" as the rules' choices (`leave`: the unit kinds the toggles leave the original's), the hyphenation patterns those
// rules read, and the reader's own Metrics over the served faces (served.ts). Bound once the head is read (the composed
// document's open); the rules are made again as the target or the toggles change, so that a toggle lays the pages again (the
// composer's new generation) under the rules that leave what it leaves.
import { FACES, LANGUAGES, layPage, type Rules, rulesFor } from '@readarxiv/typeset'
import type { ClassName } from '../prefs.ts'
import { leftKinds } from './classes.ts'
import type { Lay, Page } from './page.ts'
import { HYPH_WAIT, type Served } from './served.ts'

/** the rule set's tag for a target the reader names (BCP 47): its own where the set has it, Chinese by its script (zh-Hans the
 *  set's zh, zh-Hant its zh-TW), else its language's; null where the set has none */
export function ruleTag(target: string): string | null {
  if (Object.hasOwn(LANGUAGES, target)) return target
  let loc: Intl.Locale
  try {
    loc = new Intl.Locale(target)
  } catch {
    return null
  }
  if (loc.language === 'zh') return loc.maximize().script === 'Hant' ? 'zh-TW' : 'zh'
  return Object.hasOwn(LANGUAGES, loc.language) ? loc.language : null
}

/** what the first page laid in `target` reads before its slices, asked as the code loads (before the head is read, the composed
 *  document opened or a page laid, so that neither waits for them): the target's hyphenation patterns, the faces' index and the
 *  tables of the target's CJK faces (its body's and its bold's: Source Han Serif SC's is 39 KB). Staging, 2026-11-08: the
 *  patterns were the composed document's open's last round trip, and the index and the CJK table two more before page 1's
 *  first slice */
export function warmTypeset(s: Pick<Served, 'hyph' | 'warm'>, target: string): void {
  const tag = ruleTag(target)
  const group = tag ? rulesFor(tag).cjkFaces?.group : undefined
  const fonts: string[] = []
  for (const id of group ? [`${group}-regular`, `${group}-bold`] : []) {
    const f = FACES[id]
    if (f) fonts.push(`${f.style === 'italic' ? 'italic ' : ''}${f.weight} 100px "${f.family}"`)
  }
  if (tag) void s.hyph(rulesFor(tag).patterns)
  void s.warm(fonts)
}

export interface TypesetOptions {
  served: Pick<Served, 'metrics' | 'hyph' | 'hyphNow'>
  /** the target the rows laid are of */
  target(): string
  /** the reader's toggles now */
  classes(): Readonly<Partial<Record<ClassName, boolean>>> | null
  /** how far a last line may stand under TeX's text block bottom, in points, for the visit (Choices.pastFoot, pastFootOf:
   *  docs/PDF-READER.md §18.37); none, the typesetter's rule */
  pastFoot?: number
}

/** the most a page's address may set the borrow past TeX's bottom to, in points: the deepest `\maxdepth` of the classes
 *  measured (article at 12 pt and IEEEtran, 6 pt; docs/PDF-READER.md §18.11); a larger value sets nothing */
export const PAST_FOOT_MAX = 6
/** the borrow past TeX's text block bottom a page's address sets (§18.37, the owner's switch of 2026-11-12): its `axt-borrow`
 *  parameter, in points, read on a website's page (http or https) alone, never on an extension's: 0 turns the borrow off, a
 *  number to PAST_FOOT_MAX is its bound; undefined where the address sets nothing so (the typesetter's rule then) */
export function pastFootOf(at: { protocol: string; search: string } | null): number | undefined {
  if (!at || (at.protocol !== 'https:' && at.protocol !== 'http:')) return undefined
  const v = new URLSearchParams(at.search).get('axt-borrow')
  const n = v === null || v.trim() === '' ? Number.NaN : Number(v)
  return Number.isFinite(n) && n >= 0 && n <= PAST_FOOT_MAX ? n : undefined
}

/** the lay of the default engine: once the visit's target's patterns are read (or found not to be had), each page laid by
 *  `layPage` under the rules of the target and the toggles at the call; a page of a target whose patterns are still to come
 *  waits on them, as on a face (served.ts HYPH_WAIT); one of a target the rule set has none for stays arXiv's */
export async function typesetLay(o: TypesetOptions): Promise<Lay> {
  const made = new Map<string, Rules>()
  /** the rules of a target and its toggles, or the language whose patterns they wait for, or null */
  const rulesNow = (): Rules | { wait: string } | null => {
    const tag = ruleTag(o.target())
    if (!tag) return null
    const leave = leftKinds(o.classes())
    // (o.pastFoot is the visit's, the same for every rule set this lay makes: no part of the key)
    const key = `${tag}|${leave.join(',')}`
    const hit = made.get(key)
    if (hit) return hit
    const langs = rulesFor(tag).patterns
    const hyph: Record<string, unknown> = {}
    for (const l of langs) {
      const p = o.served.hyphNow(l)
      if (p === undefined) return { wait: l }
      hyph[l] = p
    }
    const r = rulesFor(tag, o.pastFoot === undefined ? { leave } : { leave, pastFoot: o.pastFoot }, hyph)
    made.set(key, r)
    return r
  }
  // (the visit's target's patterns read before the first page: none waits on them)
  const first = ruleTag(o.target())
  if (first) await o.served.hyph(rulesFor(first).patterns)
  return (part, rows) => {
    const r = rulesNow()
    if (!r) return { page: part.page, wait: { rows: [], faces: [] }, members: [], links: [] }
    if ('wait' in r)
      return { page: part.page, wait: { rows: [], faces: [[HYPH_WAIT, r.wait]] }, members: [], links: [] }
    // (typeset's Page and the reader's are the one shape design-a decides: compose/page.ts states it word for word)
    return layPage(part, rows, r, o.served.metrics) as unknown as Page
  }
}
