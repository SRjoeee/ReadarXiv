// lab/pdf/prepare-back/stated.mjs: stage 1a's --baseline statement (run.mjs, and restate.mjs over a run's dumps): each unit of
// the baseline's the candidate does not make, stated as the candidate's, with the cause the differential reads
// (baseline/tools/diff.mjs: a loss whose cause an entry of baseline/acceptance.json matches is accepted). For one of today's ink
// units and figure texts, a unit made on arXiv's page that stands for it, read otherwise there: of its kind (a names unit's, or of
// the ledger class the author block's rule gives it back outside the block), no baseline unit's
// id, at its place (its first line's page and box) or, with no line, at its ord (today's bundle's order, which the dump keeps),
// with how it reads otherwise (CAUSE); none of its kind, a kept block of its kind at its place; none of either, a unit of the
// author block's now holding its glyphs, a unit of the block standing for it after the name before's trail, one unit holding it
// whole, or the block's units holding its line between them. And one the candidate makes and the guard left unmarked, held whole
// by one drawn unit with its text ((i)): that statement (`own`, the candidate's unit) is written on the candidate's unit itself,
// its own reason kept (`stated.was`), since the differential pairs today's unit with it. Each cause the coordinator's rulings of 2026-11-09 and 2026-11-10
// accept is a check of the units (and of the trails the candidate's members carry, and of arXiv's glyphs on the line), never a
// list of ids. Each statement names the unit of the candidate's that holds today's whole, where one does (`holder`): the parity
// joins the two by it (lab/typeset/parity/join.mjs heldJoin)
import { readingOf, scriptsKeptAsElements, scriptsKeptInAnotherOrder } from '../../../packages/typeset/tests/replay/l1.ts'
import { unitClass } from '../../../packages/engine/src/locate/today/content-classes.mjs'

/** how a unit made on arXiv's page reads where it stands for one of the baseline's */
export const CAUSE = Object.freeze({
  order: 'its characters in another order',
  head: "its head's number in its phrase",
  // ((a): an ink unit whose raised or lowered marks today held as text, or as text and a placeholder, are now its elements
  // (rebuild/script-face), its text and theirs read as today's unit's, keptJoin's reading)
  scripts: 'its scripts kept as elements',
  // ((d): (a) with an element's characters, as many and each as often, in another order than today's there)
  orderAsElement: 'its characters in another order, read as an element',
  // ((b'): a unit whose glyphs a unit of the author block now holds (an author or affiliation unit the front end reads from the
  // class's definitions, or an ink unit ink-units.mjs reads as theirs, inknames), the names toggle's, whatever today's kind)
  names: 'a line of the author block, kept by the names toggle',
  // ((c): today's line whose leading marks are the trail rebuild/front-matter gives the name before, the rest v2's unit; (c'),
  // 2026-11-10: v2's unit a unit of the author block of any kind, today's of another)
  trail: "its marks are the name before's trail",
  // ((e): a unit whose every line v2 now keeps whole as a block of its kind, no text of it sent, every one inside a display the
  // engine states (a display element's box on A of a candidate unit's: TeX's marked compile states the display): accepted)
  display: "its display lines kept as the original's",
  // ((e)'s first condition alone, no display the engine states over them (2608.25210v2's address lines; 2608.08481v1's displays
  // (7), (8), set at the page's foot, no source unit's): stated, not accepted)
  kept: "its lines kept whole as the original's",
  // ((f): a unit of today's whose every line one unit of the candidate's holds and no other meets (its lines, its elements' boxes,
  // its label's), of any class, today's glyph text an in-order part of that unit's: accepted)
  held: 'held whole by another unit',
  // ((f)'s holding by a kept block, no text of it sent (2608.06007v1's biblatex bibliography kept whole): no text to read, stated
  // apart, not accepted)
  heldKept: 'held whole by a kept block, no text of it sent',
  // ((F), 2026-11-10: (f)'s holding by a kept block of a line whose text is e-mail addresses and their separators alone: no word
  // of it a translator is sent, wherever it stands (2610.40576v1's e-mail line, a kept block of the candidate's): accepted)
  addresses: 'a line of e-mail addresses, kept whole',
  // ((f'), 2026-11-10: a line of today's whose every glyph of ink a unit of the author block holds, two or more of them, one
  // after the other, no glyph of ink between them: TeX's inter-word or inter-member space alone, read off arXiv's glyphs on the
  // line (2609.26457v1 t279: the name before's raised "1", then "and"): accepted)
  heldBlock: "held whole by the author block's units on its line",
  // ((j), 2026-11-10: a unit whose glyph text is one contiguous part of consecutive units' of the candidate's, in their order,
  // each on today's box (2610.19159v1 t1906: today's orphan line, v2's two figure texts on it): accepted)
  split: 'split across consecutive units, its text theirs in order',
  // ((g), the coordinator's ruling of 2026-11-10, round 8 B2: v2's unit made on arXiv's page, laid, on today's lines, its text
  // arXiv's glyph text there and today's a subsequence of it: characters our old compile did not set, 2610.21084v1's initials,
  // which cas-common lost where our marks stood in the names it took apart: accepted)
  arxivText: "another reading, now arXiv's text",
  // ((h), the same ruling: v2's unit today's text on today's lines and whole lines more that carry no text word, each held by its
  // elements, which the join rule adds (ink-units.mjs: an address or a URL TeX broke onto a line of its own, 2610.22214v1's ACM
  // DOI): accepted)
  wrapped: 'held whole, with its wrapped no-word lines',
  another: 'another reading',
  // ((f): a unit the candidate does not make, every line of it inside a line the engine reads as a display's formula (a display
  // TeX's marked compile states, its text-mode glyphs read as text: locate's `displays`): the display's ink, kept with it — the
  // coordinator's ruling of 2026-11-09; 2608.08481v1 t118-t121, (7)'s and (8)'s parts)
  displayPart: "kept on arXiv's page as part of a display",
})

/** the ledger's classes of the blocks rule 8 makes names (ink-units.mjs: notes and orphans), which a names unit outside the author
 *  block is again */
const LEDGER_OF_NAMES = new Set(['inknotes', 'inkorphan'])
/** the reason a dump gives a unit the layout guard left unmarked (its marks taken out: locate finds none, run.mjs `unlocated:
 *  <cause>`), which (i) reads */
const UNMARKED = 'unlocated: marks'
/** how near two boxes' edges are one edge (PDF units: lines and boxes are stated to a hundredth) */
const ON = 0.05
/** an e-mail address as a line of addresses writes it: one local part, or several in braces before one domain, at a domain of
 *  two labels or more (RFC 5322's dot-atom, its letters any script's) */
const ADDRESS = /(?:\{[^{}@]+\}|[\p{L}\p{N}!#$%&'*+/=?^_`|~.-]+)@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu
/** a text of e-mail addresses and their separators alone: one address at least, no letter or digit outside them */
export const addressesOnly = (s) => {
  const rest = s.replace(ADDRESS, '\u0000')
  return rest.includes('\u0000') && !/[\p{L}\p{N}]/u.test(rest)
}

/** the trails among a candidate's elements (`[k, el]`, as locate's members and a part's members carry them: El.trail, its ink
 *  one box `[page, x0, bottom, x1, top, baseline]`, its characters `copy`), each as statedOf reads one */
export const trailsOf = (els) =>
  els
    .filter(([, e]) => e?.trail && e.ink?.length === 1)
    .map(([, e]) => {
      const [page, x0, bottom, x1, top, baseline] = e.ink[0]
      return { page, x0, x1, bottom, top, baseline, text: e.copy ?? '' }
    })

/**
 * `base` the baseline dump's units, `units` the candidate's own (none stated yet), `trails` the trails the candidate's members
 * carry (rebuild/front-matter's El.trail: its ink's box `page`, `x0`, `x1`, `top`, `bottom`, `baseline` and its characters
 * `text`), `labels` the number each candidate unit's label states (Label.num, by the unit's ord in the dump), `glyphs` arXiv's
 * glyphs on a page as the engine reads A (DocGlyph: `u`, `x0`, `x1` its advance, `y` its baseline, `blank`), null where not read,
 * `displays` the lines on arXiv's page the candidate reads as a display's formula (locate's `displays`: `[page, x0, bottom, x1,
 * top, baseline]`):
 * each baseline unit the candidate does not make, in the baseline's order, `{ u, why, cause, holder }` (`cause` CAUSE's key, or
 * `content` for a content difference, `keptAt` for a kept block at its place; `holder` the id of the candidate's unit holding
 * it whole, held (f), by the block (b') or by the block's units (f'), the one whose glyph text is today's, or a names unit's
 * stand-in of its ledger class with today's characters in another order); one it has no
 * statement for (absent from the candidate) is left out
 */
export function statedOf(base, units, { trails = [], labels = new Map(), glyphs = () => null, displays: shown = [] } = {}) {
  const out = []
  const have = new Map()
  for (const u of units) have.set(u.id, (have.get(u.id) ?? 0) + 1)
  const baseIds = new Set(base.map((u) => u.id))
  const free = units.filter((u) => !baseIds.has(u.id) && !u.replaced)
  const meets = (a, b) =>
    a.page === b.page &&
    a.x0 < b.x1 &&
    b.x0 < a.x1 &&
    Math.min(a.top, a.bottom) < Math.max(b.top, b.bottom) &&
    Math.min(b.top, b.bottom) < Math.max(a.top, a.bottom)
  const sameLine = (a, b) =>
    a.page === b.page && Math.abs(a.x0 - b.x0) <= ON && Math.abs(a.x1 - b.x1) <= ON && Math.abs(a.baseline - b.baseline) <= ON
  const standsFor = (u) => {
    const L = u.lines?.[0]
    const at = (c) => (L && c.lines?.[0] ? meets(L, c.lines[0]) : c.ord === u.ord)
    let k = free.findIndex((c) => c.kind === u.kind && at(c))
    // (none of its kind: a names unit of today's rule 8 the author block's rule moved out of the block, its ledger class's now
    // (rebuild/author-toggle: the names toggle the block under the title's alone), 2610.21084v1's page-foot note of the e-mails,
    // 2610.21106v1's end addresses; never a kept block, which the rule makes none of)
    if (k < 0 && u.kind === 'inknames') k = free.findIndex((c) => LEDGER_OF_NAMES.has(c.kind) && !c.kept && c.pieces?.length && at(c))
    return k < 0 ? null : free.splice(k, 1)[0]
  }
  const chars = (p) => [...(p.kind === 'text' ? p.s : p.kind === 'ph' ? p.src : '')].sort().join('')
  // (the dump's flat pieces as sourcePieces' form, which keptJoin's reading takes)
  const flatOf = (ps) => ps.map((p) => ({ ...p, t: p.kind }))
  // (a unit's glyphs' characters, white space no glyph: its texts' and its elements' readings, null where an element has none)
  const glyphsOf = (ps) => {
    let s = ''
    for (const p of ps) {
      const r = p.kind === 'text' ? p.s : p.kind === 'ph' ? readingOf(p.src ?? '') : ''
      if (r === null) return null
      s += r
    }
    return s.replace(/\s+/g, '')
  }
  // ((c): one line each; today's line from the trail's first glyph to v2's line's end, the trail before v2's line on it;
  // today's characters with the trail's taken out, in their order (today's reading may have dropped a raised one), v2's)
  const trailOf = (u, c) => {
    if (u.lines?.length !== 1 || c.lines?.length !== 1) return false
    const L = u.lines[0],
      K = c.lines[0]
    if (L.page !== K.page || Math.abs(L.x1 - K.x1) > ON) return false
    const t = trails.find((t) => t.page === L.page && Math.abs(t.x0 - L.x0) <= ON && t.x1 <= K.x0 + ON && meets(L, t))
    if (!t) return false
    const today = glyphsOf(u.pieces),
      mine = glyphsOf(c.pieces)
    if (today === null || mine === null) return false
    let i = 0
    for (const m of t.text.replace(/\s+/g, '')) if (today[i] === m) i++
    return i > 0 && today.slice(i) === mine
  }
  // ((e): v2's unit a kept block of its kind (no text of it sent), its lines today's, every one)
  const keptWhole = (u, c) =>
    !c.pieces?.length &&
    !!u.lines?.length &&
    c.lines?.length === u.lines.length &&
    u.lines.every((l) => c.lines.some((k) => sameLine(l, k)))
  // ((e): the displays the candidate's units state, each element of kind display's boxes on A; a line inside one: on its page,
  // its extent within the box's, its baseline between the box's bottom and top)
  const displays = units.flatMap((n) => (n.replaced ? [] : (n.elements ?? []).filter((e) => e.kind === 'display').flatMap((e) => e.segs)))
  const inside = (l, k) =>
    k.page === l.page &&
    k.x0 <= l.x0 + ON &&
    k.x1 >= l.x1 - ON &&
    Math.min(k.top, k.bottom) <= l.baseline &&
    l.baseline <= Math.max(k.top, k.bottom)
  const howOf = (u, c) => {
    if (c.why?.startsWith('content difference')) return c.why
    // (a running head's number of its phrase, which today's took for its folio: "5 of 21" for "of 21", ink-units.mjs phrased; a
    // running head's alone, the coordinator's ruling of 2026-11-10: no figure text joined with its number)
    if (u.kind === 'inkheads' && typeof c.text === 'string' && c.text !== u.text && c.text.replace(/^\d{1,4} | \d{1,4}$/, '') === u.text)
      return CAUSE.head
    const same = u.pieces.length === c.pieces.length && u.pieces.every((p, k) => p.kind === c.pieces[k].kind && chars(p) === chars(c.pieces[k]))
    if (same) return CAUSE.order
    if (/^ink/.test(u.kind) && scriptsKeptAsElements(flatOf(c.pieces), u)) return CAUSE.scripts
    if (/^ink/.test(u.kind) && scriptsKeptInAnotherOrder(flatOf(c.pieces), u)) return CAUSE.orderAsElement
    if (trailOf(u, c)) return CAUSE.trail
    if (keptWhole(u, c)) return u.lines.every((l) => displays.some((k) => inside(l, k))) ? CAUSE.display : CAUSE.kept
    if (arxivTextOf(u, c)) return CAUSE.arxivText
    if (wrappedOf(u, c)) return CAUSE.wrapped
    return CAUSE.another
  }
  // ((g): made on A and laid (its text arXiv's glyph text by its making), on today's lines one for one, today's glyph text a
  // subsequence of its)
  const onLines = (u, c, n) => n <= (c.lines?.length ?? 0) && u.lines.length === n && u.lines.every((l, i) => meets(l, c.lines[i]))
  const subsequence = (t, h) => {
    let i = 0
    for (const ch of h) if (ch === t[i]) i++
    return i === t.length
  }
  const arxivTextOf = (u, c) => {
    if (!/^ink/.test(c.kind) || !['drawn', 'laid'].includes(c.state) || c.why || !u.lines?.length) return false
    if (!onLines(u, c, c.lines?.length ?? 0)) return false
    const t = glyphTextOf(u),
      h = glyphTextOf(c)
    return !!t && t !== h && subsequence(t, h)
  }
  // ((h): today's lines its first ones, each line past them held by its elements alone, and its glyph text without those
  // elements today's)
  const wrappedOf = (u, c) => {
    const n = u.lines?.length ?? 0
    if (!n || (c.lines?.length ?? 0) <= n || !u.lines.every((l, i) => meets(l, c.lines[i]))) return false
    const extra = c.lines.slice(n)
    const on = (k, l) => k.page === l.page && Math.abs(k.baseline - l.baseline) <= ON && k.x0 < l.x1 && l.x0 < k.x1
    const els = (c.elements ?? []).filter((e) => e.segs.length && e.segs.every((k) => extra.some((l) => on(k, l))))
    if (!extra.every((l) => els.some((e) => e.segs.some((k) => on(k, l))))) return false
    const drop = new Set(els.map((e) => e.k))
    const t = glyphTextOf(u)
    return !!t && glyphTextOf({ ...c, pieces: c.pieces.filter((p) => !drop.has(p.k)) }) === t
  }
  // ((b'): a unit of the author block's (the names class: author, affiliation, inknames) holding every line of today's unit: a
  // line of its, or an element's box, on that line's baseline across its whole width; today's made it too or not (2610.21313v1's
  // e-mails, an ink note's today, now the elements of the affiliations today made too))
  const covers = (k, l) =>
    k.page === l.page && Math.abs(k.baseline - l.baseline) <= ON && k.x0 <= l.x0 + ON && k.x1 >= l.x1 - ON
  const heldByBlock = (u) =>
    u.lines?.length
      ? units.find(
          (n) =>
            !n.replaced &&
            unitClass(n.kind) === 'names' &&
            u.lines.every((l) => (n.lines ?? []).some((k) => covers(k, l)) || (n.elements ?? []).some((e) => e.segs.some((k) => covers(k, l)))),
        )
      : undefined
  // ((f): the one unit of the candidate's meeting every line of today's (a line of its, an element's box or its label's on that
  // baseline, across it), the same for every line; its text read as glyphs: texts, an inked element's reading (none: a glyph no
  // reading names), an element with no ink nothing (a tie, \newblock: no glyph), white space none)
  // ((f''), 2026-11-10: a box of the candidate's meets today's line where the two overlap across and up and down by their ink, the
  // glyphs' own height, whatever their baselines: today's reading gives a line its first glyph's baseline, a raised mark's where
  // the line begins with the name before's marks (2610.20030v1 t91: 709.17, its "and" at 705.55, which v2 states); two edges
  // within ON one edge, the two readings' hundredths (2610.21765v1: the name before's line to 321.24, today's from 321.2))
  const boxesOf = (n) => [...(n.lines ?? []), ...(n.elements ?? []).flatMap((e) => e.segs), ...(n.label ?? [])]
  const across = (a, b) =>
    a.page === b.page &&
    a.x0 < b.x1 - ON &&
    b.x0 < a.x1 - ON &&
    Math.min(a.top, a.bottom) < Math.max(b.top, b.bottom) - ON &&
    Math.min(b.top, b.bottom) < Math.max(a.top, a.bottom) - ON
  const glyphTextOf = (x) => {
    const inked = new Set((x.elements ?? []).map((e) => e.k))
    let s = ''
    for (const p of x.pieces ?? [])
      s += p.kind === 'text' ? p.s : p.kind === 'ph' ? (inked.has(p.k) ? (readingOf(p.src ?? '') ?? '\ufffc') : '') : ''
    return s.replace(/\s+/g, '')
  }
  const heldBy = (u) => {
    if (!u.lines?.length) return null
    let one = null
    for (const l of u.lines) {
      const at = units.filter((n) => !n.replaced && boxesOf(n).some((k) => across(k, l)))
      if (at.length !== 1 || (one && at[0] !== one)) return null
      one = at[0]
    }
    return one
  }
  // (today's glyph text an in-order part of the holder's; or the holder's label (its number as the part states it, the rest its
  // punctuation) at today's line start, then the holder's text from its start)
  const partOf = (u, n) => {
    const t = glyphTextOf(u),
      h = glyphTextOf(n)
    if (!t || !h) return false
    if (h.includes(t)) return true
    const L = u.lines[0],
      num = labels.get(n.ord)
    const lab = (n.label ?? []).some((b) => b.page === L.page && Math.abs(b.baseline - L.baseline) <= ON && Math.abs(b.x0 - L.x0) <= ON)
    if (!lab || !num) return false
    for (let i = 1; i < t.length; i++)
      if (h.startsWith(t.slice(i))) {
        const p = t.slice(0, i)
        return p.includes(num) && !/[\p{L}\p{N}]/u.test(p.replace(num, ''))
      }
    return false
  }
  const isBlock = (n) => !n.replaced && unitClass(n.kind) === 'names'
  // ((c'): a unit of the author block's, of any kind, standing for today's line after the name before's trail)
  const trailBlock = (u) => {
    const L = u.lines?.[0]
    return L ? (units.find((n) => isBlock(n) && n.lines?.[0] && meets(L, n.lines[0]) && trailOf(u, n)) ?? null) : null
  }
  // ((f'): each line's glyphs of ink on arXiv's page (its advance across the line's, its baseline within its ink), each in one
  // box of one unit of those meeting the line, every one of them the author block's, two or more, each holding a run of the
  // line's glyphs one after the other; a glyph of no ink (a space) anywhere. The holder: the one whose glyph text is today's)
  const heldByBlockUnits = (u) => {
    if (!u.lines?.length) return null
    const all = new Set()
    for (const l of u.lines) {
      const page = glyphs(l.page)
      if (!page) return null
      const ink = page
        .filter((g) => !g.blank && g.x0 >= l.x0 - ON && g.x1 <= l.x1 + ON && g.y >= Math.min(l.top, l.bottom) - ON && g.y <= Math.max(l.top, l.bottom) + ON)
        .sort((a, b) => a.x0 - b.x0)
      const at = units.filter((n) => !n.replaced && boxesOf(n).some((k) => across(k, l)))
      if (!ink.length || !at.length || !at.every(isBlock)) return null
      const inBox = (g, k) =>
        k.page === l.page && g.x0 >= k.x0 - ON && g.x1 <= k.x1 + ON && g.y >= Math.min(k.top, k.bottom) - ON && g.y <= Math.max(k.top, k.bottom) + ON
      const run = []
      for (const g of ink) {
        const owners = at.filter((n) => boxesOf(n).some((k) => inBox(g, k)))
        if (owners.length !== 1) return null
        if (run.at(-1) !== owners[0]) {
          if (run.includes(owners[0])) return null
          run.push(owners[0])
        }
      }
      for (const n of run) all.add(n)
    }
    if (all.size < 2) return null
    const mine = glyphTextOf(u)
    const whole = [...all].filter((n) => glyphTextOf(n) === mine)
    return { holder: whole.length === 1 ? whole[0] : null }
  }
  // ((f), its stand-in of today's kind at its place, 2026-11-10: every line of today's meets a box of it and its glyph text holds
  // today's whole, in order (rebuild/run-on-kept's figure text not cut at a face or colour change, standing for one of today's
  // pieces))
  const standInHolds = (u, c) => {
    if (!u.lines?.length || !u.lines.every((l) => boxesOf(c).some((k) => across(k, l)))) return false
    const t = glyphTextOf(u)
    return !!t && glyphTextOf(c).includes(t)
  }
  // ((j): the candidate's units meeting today's lines (by their boxes), two or more, consecutive in the dump's order, today's
  // glyph text one contiguous part of their glyph texts joined in that order, every character of it)
  const splitOf = (u) => {
    if (!u.lines?.length) return null
    const at = units.filter((n) => !n.replaced && u.lines.some((l) => boxesOf(n).some((k) => across(k, l)))).sort((a, b) => a.ord - b.ord)
    if (at.length < 2) return null
    const lo = at[0].ord,
      hi = at.at(-1).ord
    if (units.some((n) => !n.replaced && n.ord > lo && n.ord < hi && !at.includes(n))) return null
    const t = glyphTextOf(u)
    return t && at.map(glyphTextOf).join('').includes(t) ? at : null
  }
  // (a unit's text as written, an address its element reads as itself: what (F) reads)
  const writtenOf = (x) => (x.pieces ?? []).map((p) => (p.kind === 'text' ? p.s : p.kind === 'ph' ? (readingOf(p.src ?? '') ?? '\ufffc') : '')).join('')
  const keyOf = (why) => Object.keys(CAUSE).find((k) => CAUSE[k] === why) ?? 'content'
  // ((f): a line inside the display lines on its page whose box holds its baseline, from the first one's start to the last one's
  // end — a formula row the ledger cut at its gaps is one row)
  const inDisplay = (l) => {
    const on = shown.filter(([p, , bottom, , top]) => p === l.page && Math.min(bottom, top) <= l.baseline && l.baseline <= Math.max(bottom, top))
    return on.length > 0 && Math.min(...on.map((d) => d[1])) <= l.x0 + ON && Math.max(...on.map((d) => d[3])) >= l.x1 - ON
  }
  // ((i), the coordinator's ruling of 2026-11-10, round 8 B2: a unit today drew (a loss, else nothing to state) that the candidate
  // makes and leaves unlaid with the reason the guard's unmarking gives it (UNMARKED: its marks taken out, the paper compiled again), every line of it held by one drawn unit
  // of the candidate's whose glyph text is its: held whole by another unit (2610.21084v1 t4, cas-common's abstract, whose lines an
  // ink unit draws). The candidate's own unit of today's is the one the differential pairs it with: of its id, in ord order)
  const seen = new Map()
  const ownOf = (u) => {
    const k = seen.get(u.id) ?? 0
    seen.set(u.id, k + 1)
    return units.filter((n) => !n.replaced && n.id === u.id).sort((a, b) => a.ord - b.ord)[k] ?? null
  }
  for (const u of base) {
    if ((have.get(u.id) ?? 0) > 0) {
      have.set(u.id, have.get(u.id) - 1)
      const own = ownOf(u)
      const n = u.state === 'drawn' && own?.state === 'unlaid' && own.why === UNMARKED ? heldBy(u) : null
      const t = n ? glyphTextOf(u) : ''
      if (n && n !== own && n.state === 'drawn' && t && glyphTextOf(n) === t)
        out.push({ u, own, why: `made on arXiv's page as ${n.id.slice(0, 12)}: ${CAUSE.held}`, cause: keyOf(CAUSE.held), holder: n.id })
      continue
    }
    // (a unit made on A stands only for one of today's ink units, kept blocks and figure texts)
    const c = /^ink/.test(u.kind) ? standsFor(u) : null
    // (none: a kept block of its kind at its place, no text of it sent: its lines the ledger reads as no unit's text, a formula's
    // interior (ledger.mjs CHANGED))
    const L0 = u.lines?.[0]
    const kept =
      !c && /^ink/.test(u.kind) && L0
        ? units.find((k) => k.kind === u.kind && !k.pieces?.length && !k.replaced && k.lines?.some((l) => meets(L0, l)))
        : null
    // (none of either: a unit of the author block's now holding its glyphs, whatever today's kind)
    const names = !c && !kept ? heldByBlock(u) : undefined
    // (none of these: every line of it inside the display lines the candidate reads on its baseline, between their ends
    // (rebuild/display-marks: a display's ink, kept with it))
    const part = !c && !kept && !names && !!u.lines?.length && u.lines.every((l) => inDisplay(l))
    // (none of these: a unit of the author block's standing for it after the name before's trail (c'))
    const trailed = !c && !kept && !names && !part && /^ink/.test(u.kind) ? trailBlock(u) : null
    // (none of these: one unit of the candidate's, of any class, holding it whole (f); a kept block holding a line of addresses (F))
    const holder = !c && !kept && !names && !part && !trailed ? heldBy(u) : null
    const held = !holder
      ? null
      : !holder.pieces?.length
        ? addressesOnly(writtenOf(u))
          ? CAUSE.addresses
          : CAUSE.heldKept
        : partOf(u, holder)
          ? CAUSE.held
          : null
    // (none of these: the author block's units holding its line between them (f'); consecutive units holding its text (j))
    const block = !c && !kept && !names && !part && !trailed && !held ? heldByBlockUnits(u) : null
    const split = !c && !kept && !names && !part && !trailed && !held && !block ? splitOf(u) : null
    // (a stand-in of its kind that reads otherwise, holding today's whole text: held whole (f))
    const how = c ? howOf(u, c) : null
    const standIn = how === CAUSE.another && standInHolds(u, c)
    // (a names unit's stand-in of its ledger class, its characters today's in another order: its kind moved, the candidate's
    // unit holding today's whole, named as the holder so that the parity joins the two (heldJoin), as while (f) stated them: the
    // coordinator's ruling of 2026-11-10, round 8 B2b, 2610.30034v1 t309-t311)
    const moved = c && c.kind !== u.kind && how === CAUSE.order
    const said = c
      ? standIn
        ? { by: c, cause: CAUSE.held, holder: c }
        : { by: c, cause: how, ...(moved ? { holder: c } : {}) }
      : kept
        ? null
        : names
          ? { by: names, cause: CAUSE.names, holder: names }
          : trailed
            ? { by: trailed, cause: CAUSE.trail }
            : held
              ? { by: holder, cause: held, ...(held === CAUSE.held ? { holder } : {}) }
              : block
                ? { by: block.holder ?? [...units].find((n) => !n.replaced && boxesOf(n).some((k) => across(k, u.lines[0]))), cause: CAUSE.heldBlock, ...(block.holder ? { holder: block.holder } : {}) }
                : split
                  ? { by: split[0], cause: CAUSE.split }
                  : null
    if (kept) out.push({ u, why: "kept on arXiv's page as the original's, no text of it sent", cause: 'keptAt' })
    else if (!said && part) out.push({ u, why: CAUSE.displayPart, cause: 'displayPart' })
    else if (said)
      out.push({
        u,
        why: `made on arXiv's page as ${said.by.id.slice(0, 12)}: ${said.cause}`,
        cause: keyOf(said.cause),
        ...(said.holder ? { holder: said.holder.id } : {}),
      })
  }
  return out
}
