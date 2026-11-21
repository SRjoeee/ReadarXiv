// lab/typeset/parity/unjoin.mjs: lane url-join's counterfactual, which the verdict's urlJoinRuling reads (the coordinator's ruling
// of 2026-11-10 on 1810.04805v2-zh p14 t237). The engine reads a line's end inside one word TeX set as written as a join
// (packages/engine locate/facts.ts `oneWord`: an element literal, a URL or a mark TeX sets as written, whose copy text holds no
// white space); v2.mjs lays the pair once more with each such element's text, and its runs of one fill, as a stage 1a run
// without that rule read them off the same glyphs (a space at each line's end: round 8 B1's bundles, AXT_PARITY_UNJOINED, by
// default lab-data's), where
// the two differ by white space alone, and records the line counts of the members that hold one (`unjoined`). Nothing else of
// a part is touched, and the parts are the candidate's again once that lay is done.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LAB } from '../../../packages/typeset/tests/replay/tap.ts'

/** the bundles of a stage 1a run without lane url-join's rule (a folder a paper, as AXT_L1_BUNDLES's): AXT_PARITY_UNJOINED, else
 *  round 8 B1's in lab-data (as tap.ts reads LAB) */
export const UNJOINED = process.env.AXT_PARITY_UNJOINED || join(LAB, 'refactor-2026-11', 'lanes', 'converge-7', 'r8b', 'bundles')
/** what the run says, in its log and on its sheet, where a paper holds a word the rule joined and no unjoined bundle of it
 *  stands: its line counts are judged as any, which the ruling would not (the coordinator's of 2026-11-10) */
export const UNJOINED_MISSING = 'url-join ruling not applied: no unjoined bundles'

/** a paper's parts in the bundles folder `dir`, page -> part; null where it holds none */
export function partsIn(dir, paper) {
  const d = join(dir, paper)
  if (!existsSync(join(d, 'head.json'))) return null
  const head = JSON.parse(readFileSync(join(d, 'head.json'), 'utf8'))
  const out = new Map()
  head.parts.forEach((h, i) => {
    if (h) out.set(i + 1, JSON.parse(readFileSync(join(d, `${h}.part`), 'utf8')))
  })
  return out
}

const WHITE = /\s/u
/** the engine's rule: an element literal whose copy text holds no white space is one word as written */
const oneWord = (e) => !!e.literal && typeof e.copy === 'string' && e.copy !== '' && !WHITE.test(e.copy)

/**
 * The elements of `parts` (page -> part, the candidate's) one word as written whose text `prior` (page -> part, a run without
 * the rule) reads with white space where the candidate's reads none, all else alike: the same member (its ord) of the same
 * page's part, the same element (its key, its copy), the prior's text with its white space taken out the candidate's. Each
 * `{ page, ord, el (the candidate's element), text, fills (the prior's) }`
 */
export function wordsUnjoined(parts, prior) {
  const out = []
  if (!prior) return out
  for (const [page, part] of parts) {
    const was = prior.get(page)
    if (!was) continue
    const before = new Map(was.flows.flat().map((m) => [m.ord, m]))
    for (const m of part.flows.flat()) {
      const els = before.get(m.ord)?.els
      if (!els || !m.els) continue
      const prev = new Map(els)
      for (const [k, el] of m.els) {
        const p = prev.get(k)
        if (!p || !oneWord(el) || p.copy !== el.copy || typeof el.text !== 'string' || typeof p.text !== 'string') continue
        if (WHITE.test(el.text) || !WHITE.test(p.text) || p.text.replace(/\s+/gu, '') !== el.text) continue
        out.push({ page, ord: m.ord, el, text: p.text, fills: p.fills })
      }
    }
  }
  return out
}

/** whether an element's ink stands on more than one line (its boxes on two baselines or more, on one page or several) */
const overLines = (e) => new Set((e.ink ?? []).map((i) => `${i[0]}|${i[5]}`)).size > 1

/**
 * The paper's words to lay unjoined (`wordsUnjoined` of `parts` against `prior`, the unjoined bundle's parts: partsIn), and
 * `missing`: UNJOINED_MISSING where no unjoined bundle stands (`prior` null) and a part holds a word as written over lines, a
 * line end the rule joined; else null
 */
export function unjoinedOf(parts, prior) {
  if (prior) return { words: wordsUnjoined(parts, prior), missing: null }
  const held = [...parts.values()].some((part) => part.flows.flat().some((m) => (m.els ?? []).some(([, e]) => oneWord(e) && overLines(e))))
  return { words: [], missing: held ? UNJOINED_MISSING : null }
}

/** `lay()` called with each found element's text and runs the prior's (`wordsUnjoined`'s), the candidate's put back after it,
 *  whatever it does; what it returns */
export function withUnjoined(found, lay) {
  const kept = found.map((f) => [f.el, f.el.text, 'fills' in f.el, f.el.fills])
  for (const f of found) {
    f.el.text = f.text
    if (f.fills === undefined) delete f.el.fills
    else f.el.fills = f.fills
  }
  try {
    return lay()
  } finally {
    for (const [el, text, had, fills] of kept) {
      el.text = text
      if (had) el.fills = fills
      else delete el.fills
    }
  }
}
