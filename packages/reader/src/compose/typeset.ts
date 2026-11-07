// The reader's own typesetter, openReader's engine where its host gives none (a host may still give its own: the e2e's fixture
// lay): lane L3's `layPage` over the rule set's rules for the target the rows are of (`rulesFor`), the reader's "What to
// translate" as the rules' choices (`leave`: the unit kinds the toggles leave the original's), the hyphenation patterns those
// rules read, and the reader's own Metrics over the served faces (served.ts). Bound once the head is read (the composed
// document's open); the rules are made again as the target or the toggles change, so that a toggle lays the pages again (the
// composer's new generation) under the rules that leave what it leaves.
import { LANGUAGES, layPage, type Rules, rulesFor } from '@readarxiv/typeset'
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

export interface TypesetOptions {
  served: Pick<Served, 'metrics' | 'hyph' | 'hyphNow'>
  /** the target the rows laid are of */
  target(): string
  /** the reader's toggles now */
  classes(): Readonly<Partial<Record<ClassName, boolean>>> | null
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
    const r = rulesFor(tag, { leave }, hyph)
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
