// lab/pdf/prepare-back/stated.mjs: stage 1a's --baseline statement (run.mjs, and restate.mjs over a run's dumps): each unit of
// the baseline's the candidate does not make, stated as the candidate's, with the cause the differential reads
// (baseline/tools/diff.mjs: a loss whose cause an entry of baseline/acceptance.json matches is accepted). For one of today's ink
// units and figure texts, a unit made on arXiv's page that stands for it, read otherwise there: of its kind (a names unit's, or of
// the ledger class the author block's rule gives it back outside the block), no baseline unit's
// id, at its place (its first line's page and box) or, with no line, at its ord (today's bundle's order, which the dump keeps),
// with how it reads otherwise (CAUSE); none of its kind, a kept block of its kind at its place; none of either, a unit of the
// author block's now holding its glyphs. Each cause the coordinator's rulings of 2026-11-09 accept is a check of the two units
// (and of the trails the candidate's members carry), never a list of ids
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
  // ((c): today's line whose leading marks are the trail rebuild/front-matter gives the name before, the rest v2's unit)
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
  another: 'another reading',
})

/** the ledger's classes of the blocks rule 8 makes names (ink-units.mjs: notes and orphans), which a names unit outside the author
 *  block is again */
const LEDGER_OF_NAMES = new Set(['inknotes', 'inkorphan'])
/** how near two boxes' edges are one edge (PDF units: lines and boxes are stated to a hundredth) */
const ON = 0.05

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
 * `text`), `labels` the number each candidate unit's label states (Label.num, by the unit's ord in the dump): each baseline unit
 * the candidate does not make, in the baseline's order, with its stated cause; one it has no statement for (absent from the
 * candidate) is left out
 */
export function statedOf(base, units, { trails = [], labels = new Map() } = {}) {
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
    // (a running head's number of its phrase, which today's took for its folio: "5 of 21" for "of 21", ink-units.mjs phrased)
    if (/^ink/.test(u.kind) && typeof c.text === 'string' && c.text !== u.text && c.text.replace(/^\d{1,4} | \d{1,4}$/, '') === u.text)
      return CAUSE.head
    const same = u.pieces.length === c.pieces.length && u.pieces.every((p, k) => p.kind === c.pieces[k].kind && chars(p) === chars(c.pieces[k]))
    if (same) return CAUSE.order
    if (/^ink/.test(u.kind) && scriptsKeptAsElements(flatOf(c.pieces), u)) return CAUSE.scripts
    if (/^ink/.test(u.kind) && scriptsKeptInAnotherOrder(flatOf(c.pieces), u)) return CAUSE.orderAsElement
    if (trailOf(u, c)) return CAUSE.trail
    if (keptWhole(u, c)) return u.lines.every((l) => displays.some((k) => inside(l, k))) ? CAUSE.display : CAUSE.kept
    return CAUSE.another
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
  const boxesOf = (n) => [...(n.lines ?? []), ...(n.elements ?? []).flatMap((e) => e.segs), ...(n.label ?? [])]
  const onLine = (k, l) => k.page === l.page && Math.abs(k.baseline - l.baseline) <= ON && k.x0 < l.x1 && l.x0 < k.x1
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
      const at = units.filter((n) => !n.replaced && boxesOf(n).some((k) => onLine(k, l)))
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
  for (const u of base) {
    if ((have.get(u.id) ?? 0) > 0) {
      have.set(u.id, have.get(u.id) - 1)
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
    // (none of these: one unit of the candidate's, of any class, holding it whole (f))
    const holder = !c && !kept && !names ? heldBy(u) : null
    const held = !holder ? null : !holder.pieces?.length ? CAUSE.heldKept : partOf(u, holder) ? CAUSE.held : null
    const why = c
      ? `made on arXiv's page as ${c.id.slice(0, 12)}: ${howOf(u, c)}`
      : kept
        ? "kept on arXiv's page as the original's, no text of it sent"
        : names
          ? `made on arXiv's page as ${names.id.slice(0, 12)}: ${CAUSE.names}`
          : held
            ? `made on arXiv's page as ${holder.id.slice(0, 12)}: ${held}`
            : null
    if (why !== null) out.push({ u, why })
  }
  return out
}
