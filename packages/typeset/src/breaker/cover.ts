// B.cover (design-b §1.5, T3): whether the faces a unit's tokens are set in are there before any width is taken. Ported from
// engine 065c1d973 run.mjs RUN:2199-2207 (FS.check over runsOfTokens fonts.mjs:314-325) over Metrics.ready (design-a §1.2):
// a face not loaded yet is waited for (the page is not committed: Page.wait.faces); a character no served slice holds leaves
// the unit the original's, `served`, with the characters missing (today's 'face', a slice that failed to load, is a host's
// failure Metrics answers as not ready).
import type { FaceId, Metrics } from '../types.ts'
import { fontString } from './measure.ts'
import type { Face, Token } from './tokens.ts'

/** the faces a unit's runs are set in, each with the characters it sets (fonts.mjs:314 runsOfTokens): a role face's (one
 *  with served ids) text and spaces, and a hyphen where a word may be cut */
export function runsOfTokens(tokens: readonly Token[]): { face: Face; font: FaceId; text: string }[] {
  const by = new Map<FaceId, { face: Face; chars: Set<string> }>()
  for (const t of tokens) {
    const face = t.face as (Face & { ids?: unknown }) | undefined
    if (!face?.ids || !(t.s || t.space)) continue
    const font = fontString(face, 100)
    let r = by.get(font)
    if (!r) by.set(font, (r = { face, chars: new Set() }))
    for (const ch of t.s ?? ' ') r.chars.add(ch)
    if (t.hyph) r.chars.add('-')
  }
  return [...by].map(([font, r]) => ({ face: r.face, font, text: [...r.chars].join('') }))
}

export type Cover = { ok: true } | { ok: false; why: 'served'; missing: string } | { wait: [FaceId, string][] }

/** B.cover: every run's face ready; else the faces to wait for, or the characters no served face holds */
export function cover(tokens: readonly Token[], metrics: Metrics): Cover {
  const wait: [FaceId, string][] = []
  for (const r of runsOfTokens(tokens)) {
    const ready = metrics.ready(r.font, r.text)
    if (ready === 'never') {
      const missing = [...r.text].filter((ch) => metrics.ready(r.font, ch) === 'never').join('')
      return { ok: false, why: 'served', missing }
    }
    if (!ready) wait.push([r.font, r.text])
  }
  return wait.length ? { wait } : { ok: true }
}
