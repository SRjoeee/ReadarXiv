// COPIED as it is from src/pdf-reader/engine/layout/ledger.mjs (abe884b5e), its imports pointed at deps.mjs (today's, copied) and, where
// marked COPY, nothing else but one change, marked CHANGED (a formula's interior: an orphan line between two of a formula's lines
// the formula's): run by locate over arXiv's page (../ink.ts), held equal to today's by tests/pdf-reader/locate-ink-today.test.ts,
// the change apart. Today's file stays the production prepare's until stage 1c.
// The ledger of our final pass (docs/route/orphan-text.md, stage 1): every text glyph of every page given exactly one content
// class (rules/content-classes.mjs), so that what no class explains — an orphan — is counted, listed and gated (the sweep's
// invariant (o): orphan letters, none). Read from what the maker child already has: the pages pageInk read (`indices`, with
// each glyph's font and whether it is inside a form XObject) and own.mjs's ownership. No layout file, nothing of arXiv's PDF,
// no position estimated: what decides a class is TeX's — a glyph's owner (a unit's marks), its region (stream.mjs regionsOf: a
// column's body or not, a float's depth), the babel names' points (a list's or the bibliography's own name), stream order on
// the page (the output routine ships the head before the page's first mark and the foot after its last) — or the glyph's own
// font (a math or a typewriter face) and whether it is a letter.
//
// Rules, in order (RULES; each tested):
//   1. an owned glyph is its owner's class: a unit's (u<id>, u<id>.p, u<id>.l) by its kind (content-classes.mjs unitClass), a figure's ink unit's (f<k>, layout/figure-text.mjs) `figures`, a
//      babel name's (n<occ>) `generated`;
//   2. the other glyphs, in stream order, make lines: a glyph joins the line before it where both are no unit's, in one region
//      and one zone, on one baseline (within LINE_DY of their size: scripts and sub-scripts too) and no further right than
//      LINE_GAP of its size; each line is given one class by the first rule of RULES it meets, and so is every glyph of it.
// A page our compile left unbracketed (no column body anywhere on it: a page not read, an included page) has no "outside the
// bodies": its lines are read as a body's. The heads and the foot are read by stream order and one baseline, as folioOf reads a
// folio; stage 2 brackets them by points of their own (the note's §7).
// Pure arithmetic over the pages; an original module (no port statement).
import { CLASS_CODE, CLASS_IDS, unitClass } from './content-classes.mjs'
import { classifyFont, columnsAt, regionMask, regionsOf } from './deps.mjs'

/** two glyphs on one line: their baselines within this share of the larger size (a superscript, a subscript) */
export const LINE_DY = 0.6
/** two glyphs on one line: the second no more than this many of its sizes right of the line's end (a word space, a tab stop) */
export const LINE_GAP = 4
/** the foot stands this many of its sizes below every other glyph of its page, at least (stream.mjs FOLIO_GAP's: \\footskip) */
export const FOOT_GAP = 1.5
/** a formula's line: a math face's glyph, fewer than MATH_WORDS words of three letters in the text faces, and math faces this
 *  share of the line or a relation */
export const MATH_WORDS = 4, MATH_SHARE = 0.15
/** …or a display's line, its operators' names in a text face: a relation, DISPLAY_WORDS words at most and math faces this share */
export const DISPLAY_WORDS = 5, DISPLAY_SHARE = 0.1
const RELATION = /[=<>≤≥≈≠∈∉⊂⊆→←↦∼≃≡∝]/u
/** a code line: typewriter faces this share of its glyphs, at least */
export const MONO_SHARE = 0.6
/** an included graphic's line: glyphs inside a form XObject this share of it, at least */
export const FORM_SHARE = 0.5
/** the orphan lines a ledger lists, at most (all are counted) */
export const ORPHAN_LINES_MAX = 200
/** an orphan line's text as listed, at most */
const TEXT_MAX = 160

/** the babel names whose text opens a zone, and the zone it opens: a list, the bibliography, an index; a unit's start ends it, but a
 *  bibliography entry's (ENTRY_KINDS), which opens the references' */
const ZONE_OF = Object.freeze({ contents: 'contents', listfigure: 'contents', listtable: 'contents', ref: 'references', bib: 'references', index: 'index', glossary: 'index' })
const NAME_END = /^n\d+\.([a-z]{1,16})\.e$/
const UNIT_START = /^[th]?(\d+)s$/
const UNIT_END = /^[th]?(\d+)e$/
/** a bibliography's last entry's line after the line before it: within this many of its size below it (an entry's leading;
 *  the skip before a heading, a list or an author's address after the bibliography is more) */
const ENTRY_DY = 1.6
/** a biblatex entry's start (marks.mjs POINTS_TEX: `bi<n>`, biblatex's per-entry hook): it opens the references' zone, its entry
 *  the glyphs from it to the next one's, to its bibliography's end (`bz<n>`) or to the next unit's start, which end the zone */
const BIB_ITEM = /^bi(\d+)$/
/** a biblatex bibliography's end (marks.mjs POINTS_TEX: `bz<n>`, after its last entry): it ends the zone, so that what follows —
 *  the next bibliography's heading of a title of its own (`\printbibliography[type=book,title={Books}]`) — is no entry's */
const BIB_END = /^bz\d+$/
/** the units a bibliography's entry is (latex-front.mjs bibliography): an entry's start opens the references' zone, whatever
 *  name opened it or none did (REVTeX's, whose \\refname no heading sets), and the start of any other unit ends it */
const ENTRY_KINDS = new Set(['reference', 'refnames'])
/** a page's column mark (MARK_DEF's c<n>-<k>, set by shipout/background before anything of the page): no mark of its text */
const COLUMN = /^c[12]-\d+$/
const BRACKET = /^b[se]\d+$/
/** the letters a glyph spells: a ligature's each (ﬁ, ﬄ: NFKC), whether PDF.js gives it as one character or as its letters */
const LETTERS = /\p{L}/gu
const lettersOf = u => (u ? (u.normalize('NFKC').match(LETTERS) ?? []).length : 0)
const WORD = /\p{L}{3,}/gu, PAIR = /\p{L}{2,}/gu
/** a line of a code region: at least this share of its glyphs that are no blank TeX set between a code region's points */
const CODE_SHARE = 0.5

/**
 * The end marks of each bibliography's last entry (a source unit of ENTRY_KINDS: latex-front.mjs bibliography), by `<page index>:<point
 * index>`: an entry's end mark after which, in stream order, the next unit to start is no entry (another unit's start, a babel
 * name that opens a zone, a biblatex entry or its bibliography's end) or none does. The references' zone an entry opens ends with
 * that entry's last line, where TeX ended the bibliography, not at the next unit's start: what TeX sets between the two — an
 * appendix's own contents list after the bibliography (titletoc's \printcontents), its title in a group of the paper's own —
 * is no entry's, and was kept as the original's (2610.42112v1 p16)
 */
function lastEntriesOf(pages, units) {
  const out = new Set()
  if (!units) return out
  const kindOf = id => { const u = units[id]; return Array.isArray(u) ? u[0] : u?.kind }
  let pending = null
  pages.forEach((pg, pi) => {
    ;(pg.points ?? []).forEach((pt, q) => {
      const end = UNIT_END.exec(pt.name), start = end ? null : UNIT_START.exec(pt.name), name = end || start ? null : NAME_END.exec(pt.name)
      if (end) { if (ENTRY_KINDS.has(kindOf(Number(end[1])))) pending = `${pi}:${q}`; return }
      if (start) { if (!ENTRY_KINDS.has(kindOf(Number(start[1])))) { if (pending) out.add(pending) } pending = null; return }
      if ((name && Object.hasOwn(ZONE_OF, name[1])) || BIB_ITEM.test(pt.name) || BIB_END.test(pt.name)) { if (pending) out.add(pending); pending = null }
    })
  })
  if (pending) out.add(pending)
  return out
}

/** the line rules, in order: the first whose test holds gives the line its class */
export const RULES = Object.freeze([
  // (a line TeX set in the body of an environment the source sets as code, by its points (pageInk's `regions`, marks.mjs
  // regionsTex), wherever it stands — in a picture, a box, a float —: code, kept as the paper has it, never by its face alone)
  ['code', l => l.code > 0 && l.code >= CODE_SHARE * l.n],
  // (a biblatex entry's line in a column's body, whatever it holds: TeX set it in that entry — its URL alone, its numbers alone)
  ['references', l => l.entry !== null && l.entry !== undefined && !l.outside],
  ['symbols', l => l.pairs === 0],
  ['figures', l => l.form >= FORM_SHARE * l.n],
  ['heads', l => l.outside && (l.head || l.foot)],
  ['notes', l => l.outside],
  ['references', l => l.zone === 'references'],
  ['index', l => l.zone === 'index'],
  ['contents', l => l.zone === 'contents'],
  ['math', l => l.math > 0 && ((l.words < MATH_WORDS && (l.math >= MATH_SHARE * l.n || l.relation)) || (l.relation && l.words <= DISPLAY_WORDS && l.math >= DISPLAY_SHARE * l.n))],
  ['code', l => l.mono >= MONO_SHARE * l.n],
  ['figures', l => l.depth > 0],
  // (a list's line wherever it stands, no list's name over it, where it would be an orphan: its page number its last word, after
  // leaders or set apart at the line's end — titletoc's \printcontents after an appendix's own title, 2610.42112v1 p16, which no
  // \contentsname heads; never a formula's line, a code line or a figure's text, which end in a number as well)
  ['contents', l => !l.outside && l.listed],
  ['orphan', () => true],
].map(([cls, test]) => Object.freeze({ cls, code: CLASS_CODE[cls], test })))

/** a glyph's owner as own.mjs names its group: a unit's id, or a babel name's (`name`) */
const UNIT_GROUP = /^u(\d+)(?:\.[pl])?$/
const ownerClass = (group, units) => {
  if (group.startsWith('n')) return 'generated'
  // (a figure's ink unit, layout/figure-text.mjs: f<k>)
  if (group.startsWith('f')) return 'figures'
  const m = UNIT_GROUP.exec(group)
  return (m && units ? unitClass(units[Number(m[1])]) : null) ?? 'body'
}

/**
 * The ledger of a document. `pages` (page p at index p - 1) as own.mjs ownOf reads them — `glyphs` ({ u, x0, x1, y, size, font,
 * form }, stream order), `boxes`, `points` ({ name, glyph, box }) —; `own`, ownOf's result for them (its `glyphs[p - 1][g]`, a
 * group or null); `units`, the paper's units (their ids their indices), or null (every unit's class then `body`).
 * Returns { classes: per page a Uint8Array, each glyph's class code (CLASS_IDS); counts: { [class]: { glyphs, letters } } over
 * the glyphs that are no blank, a glyph's letters those it spells (a ligature's each); lines, every line of glyphs no unit owns in
 * stream order, { page, cls, gs (its glyphs' indices on its page), region, zone, para (its paragraph's number, ink.mjs `paras`, or
 * null), opens (whether its paragraph's point lies on it: the paragraph's first line, never a line it runs on to), entry (its
 * biblatex entry's number, marks.mjs POINTS_TEX `bi<n>`, or null), entryFrom (on an entry's first line, the glyph its point
 * stands before: what precedes it, the entry's label; else null), y, size, x0, x1,
 * letters } (the ink units'
 * input: layout/ink-units.mjs); letters, the letters of the document; orphanLetters; orphans: the orphan lines, at most
 * ORPHAN_LINES_MAX, each { page, text, letters, x0, x1, y } }
 */
export function ledgerOf(pages, own, { units = null } = {}) {
  const counts = Object.fromEntries(CLASS_IDS.map(id => [id, { glyphs: 0, letters: 0 }]))
  const lasts = lastEntriesOf(pages, units)
  /** where a bibliography's last entry ended: its page and the baseline of its last line, the zone's end once a glyph leaves it;
   *  and the bibliography's own line pitch, the last step down from one of its lines to the next (a style set double, 24 pt) */
  let ending = null, pitch = 0, lastY = null
  const fam = new Map()
  const famOf = name => { let f = fam.get(name); if (f === undefined) { f = classifyFont(name ?? '').fam; fam.set(name, f) } return f }
  const classes = [], orphans = [], lines = []
  let zone = null, letters = 0, orphanLetters = 0, para = null, entry = null
  pages.forEach((pg, pi) => {
    lastY = null
    const G = pg.glyphs ?? [], n = G.length, P = pg.points ?? [], O = own?.glyphs?.[pi] ?? []
    const lp = listPage(G, O, columnsAt(pg))
    const out = new Uint8Array(n).fill(CLASS_CODE.symbols)
    classes.push(out)
    const R = regionsOf({ glyphs: { n }, boxes: pg.boxes ?? [], points: P }), code = regionMask(pg.regions, n, 'code')
    // (the page's first and last mark of its own text, the column's mark aside: the head is shipped before the first, the foot
    // after the last)
    let first = n, last = 0
    for (const pt of P) if (!COLUMN.test(pt.name)) { first = Math.min(first, pt.glyph); last = Math.max(last, pt.glyph) }
    const bracketed = P.some(pt => BRACKET.test(pt.name))
    const footFrom = bracketed ? footOf(G, R, O, last) : n
    // each glyph's zone, in stream order (a zone goes on across pages: the contents over three), and its biblatex entry where the
    // compile marked one (`bi<n>`: the entry's number, and where its point stands, `entryAt`)
    const zones = new Array(n), entries = new Array(n), entryAt = new Uint8Array(n)
    for (let q = 0, g = 0; g <= n; g++) {
      for (; q < P.length && P[q].glyph <= g; q++) {
        const m = NAME_END.exec(P[q].name)
        const start = m ? null : UNIT_START.exec(P[q].name)
        const item = m || start ? null : BIB_ITEM.exec(P[q].name)
        if (m && Object.hasOwn(ZONE_OF, m[1])) { zone = ZONE_OF[m[1]]; entry = null }
        else if (start) { const u = units?.[Number(start[1])]; zone = ENTRY_KINDS.has(Array.isArray(u) ? u[0] : u?.kind) ? 'references' : null; entry = null }
        else if (item) { zone = 'references'; entry = Number(item[1]); if (g < n) entryAt[g] = 1 }
        else if (BIB_END.test(P[q].name)) { zone = null; entry = null }
        // (the bibliography's last entry's end: its zone goes on over that entry's last lines, what TeX set there after the mark)
        if (lasts.has(`${pi}:${q}`) && zone === 'references') { const e = G[Math.min(P[q].glyph, n) - 1] ?? G[P[q].glyph]; ending = e ? { page: pi, y: e.y, size: e.size } : null; if (!ending) zone = null }
      }
      // (its lines: the line its end mark stands on, and each line right below the last at an entry's leading (ENTRY_DY of its
      // size, or the bibliography's own pitch), a part of it TeX set past the mark — a style's \newblock, a DOI —, on its page,
      // never a line that ends as a list's entry does (listedOf: a list set right under it); the first glyph past them ends the
      // zone)
      if (g < n && zone === 'references' && !ending) {
        const x = G[g]
        if (lastY !== null && lastY - x.y > 0.5 * Math.max(x.size, 5) && lastY - x.y < 3 * Math.max(x.size, 5)) pitch = lastY - x.y
        lastY = x.y
      }
      if (ending && g < n) {
        const x = G[g], sz = Math.max(ending.size, x.size, 5), dy = ending.y - x.y
        if (ending.page === pi && Math.abs(dy) < 0.5 * sz) { /* (on the line) */ }
        else if (ending.page === pi && dy > 0 && dy <= Math.max(ENTRY_DY * sz, 1.25 * pitch) && !listedOf(lineFrom(G, g, sz), lp)) ending.y = x.y
        else { if (zone === 'references') { zone = null; entry = null } ending = null }
      }
      if (g < n) { zones[g] = zone; entries[g] = entry }
    }
    // (the page ends on that line: whatever the next page sets is past it)
    if (ending && ending.page === pi) { if (zone === 'references') { zone = null; entry = null } ending = null }
    // each glyph's paragraph: the number of the last paragraph point at or before it (ink.mjs `paras`, marks.mjs POINTS_TEX q<n>),
    // a paragraph going on across a page from the page before; null where the compile set none (a base of before)
    const paraAt = new Array(n), opensAt = new Uint8Array(n)
    {
      const Q = (pg.paras ?? []).slice().sort((a, b) => a.glyph - b.glyph)
      for (let q = 0, g = 0; g < n; g++) {
        for (; q < Q.length && Q[q].glyph <= g; q++) { para = Number(Q[q].name.slice(1)); opensAt[g] = 1 }
        paraAt[g] = para
      }
    }
    let line = null
    // (CHANGED: the page's lines classed once the page is read, so that a line's class may read the lines TeX set right before
    // and after it: a formula's interior, below)
    const made = []
    const close = () => {
      if (!line) return
      Object.assign(line, wordsOf(line.gs.map(g => G[g]), famOf), { listed: listedOf(line.gs, lp) })
      made.push([line, RULES.find(r => r.test(line))])
      line = null
    }
    for (let g = 0; g < n; g++) {
      const x = G[g], group = O[g]
      if (group) { close(); out[g] = CLASS_CODE[ownerClass(group, units)]; continue }
      const region = R.glyph[g], size = Math.max(x.size || 0, 1e-6)
      // (a biblatex entry's label, a numeric style's [n], which the list's \item set right before the entry's point: the entry's
      // first line, the label before its point, `entryFrom`)
      if (line && entryAt[g] && line.entry !== entries[g] && line.region === region && Math.abs(x.y - line.y) <= LINE_DY * Math.max(size, line.size) && x.x0 - line.x1 <= LINE_GAP * size) { line.entry = entries[g]; line.zone = zones[g] }
      if (line && !(line.region === region && line.zone === zones[g] && line.entry === entries[g] && Math.abs(x.y - line.y) <= LINE_DY * Math.max(size, line.size) && x.x0 >= line.x0 - size && x.x0 - line.x1 <= LINE_GAP * size)) close()
      if (!line) {
        const depth = region >> 1, body = (region & 1) === 1
        line = { gs: [], region, zone: zones[g], para: paraAt[g], opens: false, entry: entries[g], entryFrom: null, y: x.y, size, x0: x.x0, x1: x.x1, n: 0, letters: 0, words: 0, pairs: 0, math: 0, mono: 0, code: 0, form: 0, relation: false, depth, outside: bracketed && !body && depth === 0, head: g < first, foot: g >= footFrom }
      }
      line.gs.push(g); line.x1 = Math.max(line.x1, x.x1); line.size = Math.max(line.size, size)
      if (opensAt[g]) line.opens = true
      if (entryAt[g] && line.entryFrom === null) line.entryFrom = g
      if (x.blank || !/\S/u.test(x.u ?? '')) continue
      const f = famOf(x.font)
      line.n++
      line.letters += lettersOf(x.u)
      if (f === 'math') line.math++
      if (f === 'mono') line.mono++
      if (code[g]) line.code++
      if (x.form) line.form++
      if (RELATION.test(x.u)) line.relation = true
    }
    close()
    // (CHANGED: an orphan line between two of a formula's lines in TeX's stream — math or symbols, its glyphs and theirs one run
    // of no unit's, in one region —, with fewer words than a formula's line holds (MATH_WORDS), is the formula's: an operator's
    // name in a text face, 2610.21765v1 p10's "tr" between a fraction's denominator and a big bracket, was an orphan ink unit,
    // translated "TR" over the formula)
    const FORMULA = new Set(['math', 'symbols'])
    made.forEach(([l, rule], i) => {
      if (rule.cls !== 'orphan' || l.words >= MATH_WORDS) return
      const before = made[i - 1]?.[0], after = made[i + 1]?.[0]
      if (!before || !after || !FORMULA.has(made[i - 1][1].cls) || !FORMULA.has(made[i + 1][1].cls)) return
      if (before.gs.at(-1) !== l.gs[0] - 1 || after.gs[0] !== l.gs.at(-1) + 1 || before.region !== l.region || after.region !== l.region) return
      made[i][1] = RULES.find(r => r.cls === 'math')
    })
    for (const [l, rule] of made) {
      for (const g of l.gs) out[g] = rule.code
      lines.push({ page: pi + 1, cls: rule.cls, gs: l.gs, region: l.region, zone: l.zone, para: l.para, opens: l.opens, entry: l.entry, entryFrom: l.entryFrom, listed: l.listed, y: l.y, size: l.size, x0: l.x0, x1: l.x1, letters: l.letters })
      if (rule.cls === 'orphan') {
        orphanLetters += l.letters
        if (orphans.length < ORPHAN_LINES_MAX) orphans.push({ page: pi + 1, text: textOf(l.gs.map(g => G[g])).slice(0, TEXT_MAX), letters: l.letters, x0: l.x0, x1: l.x1, y: l.y })
      }
    }
    // the counts, every glyph that is no blank
    for (let g = 0; g < n; g++) {
      const x = G[g]
      if (x.blank || !/\S/u.test(x.u ?? '')) continue
      const c = counts[CLASS_IDS[out[g]]], k = lettersOf(x.u)
      c.glyphs++
      c.letters += k; letters += k
    }
  })
  return { classes, counts, letters, orphanLetters, orphans, lines }
}

/** where a page's foot begins among its glyphs (its glyph count where it has none): the run of glyphs that ends its stream,
 *  after its last mark, on one baseline, no unit's and outside the bodies, below every other glyph of the page by FOOT_GAP of
 *  its size (stream.mjs folioOf's run, whatever it spells) */
function footOf(G, R, O, last) {
  const n = G.length
  let k = n - 1
  while (k >= 0 && (G[k].blank || !/\S/u.test(G[k].u ?? ''))) k--
  if (k < 0 || k < last) return n
  const y = G[k].y, size = G[k].size
  while (k > 0 && k - 1 >= last && Math.abs(G[k - 1].y - y) < 0.5 * Math.max(size, G[k - 1].size)) k--
  for (let g = k; g < n; g++) if (R.glyph[g] !== 0 || O[g]) return n
  for (let g = 0; g < k; g++) if (!G[g].blank && G[g].y - y < FOOT_GAP * size) return n
  return k
}

/** a line's words, runs of three letters or more in the text faces, and its pairs, runs of two or more (a line with none is no
 *  text: a label's letter, an equation's tag): a math face's glyph or a space between two glyphs a fifth of their size apart
 *  ends one */
function wordsOf(gs, famOf) {
  let s = '', prev = null
  for (const g of [...gs].sort((a, b) => a.x0 - b.x0)) {
    s += (prev && g.x0 - prev.x1 > 0.2 * g.size) || famOf(g.font) === 'math' ? ' ' : ''
    if (famOf(g.font) !== 'math') s += (g.u ?? '').normalize('NFKC')
    prev = g
  }
  return { words: (s.match(WORD) ?? []).length, pairs: (s.match(PAIR) ?? []).length }
}

/** a page as listedOf reads it: its glyphs, their owners (`O`, a unit's group or none), its columns (stream.mjs columnsAt) and,
 *  once asked, the numbers it sets past the units' lines (marginNumbers) */
function listPage(G, O, colOf) {
  let margins = null
  return { G, O, colOf, margins: () => (margins ??= marginNumbers(G, O)) }
}

/** the glyphs of the line glyph `g` begins, in stream order: those right after it on its baseline (half of `size`) */
function lineFrom(G, g, size) {
  const out = []
  for (let k = g; k < G.length && Math.abs(G[k].y - G[g].y) < 0.5 * size; k++) out.push(k)
  return out
}

/** a list's page number set apart from the text before it: at least this many of its size, where no leaders stand between */
const LIST_APART = 2
/** a page's numbers set past the units' lines: each the next word after a unit's text on its baseline, a fifth of its size
 *  clear or more, digits no unit's (lineno's line numbers in the right margin, a number at one place on line after line) —
 *  never a list's page number, whose line is no unit's ([x0, x1, y] each) */
function marginNumbers(G, O) {
  const at = new Map()
  for (let g = 0; g < G.length; g++) {
    if (!/\S/.test(G[g].u ?? '')) continue
    const k = Math.round(2 * G[g].y)
    let l = at.get(k)
    if (!l) at.set(k, (l = []))
    l.push(g)
  }
  const out = [], DIGIT = /^\d$/u
  for (const [k, list] of at) {
    const row = [...list, ...(at.get(k - 1) ?? []), ...(at.get(k + 1) ?? [])].sort((a, b) => G[a].x0 - G[b].x0)
    for (let i = 1; i < row.length; i++) {
      const g = row[i], x = G[g], p = row[i - 1]
      if (O[g] || !O[p] || Math.round(2 * x.y) !== k || !DIGIT.test(x.u ?? '') || x.x0 - G[p].x1 < 0.2 * x.size) continue
      let j = i
      while (j + 1 < row.length && !O[row[j + 1]] && DIGIT.test(G[row[j + 1]].u ?? '') && G[row[j + 1]].x0 - G[row[j]].x1 < 0.2 * x.size) j++
      out.push([x.x0, G[row[j]].x1, x.y])
    }
  }
  return out
}
/** whether a line ends as a list's entry does: its page number the line's last word, after leaders (a dot a word,
 *  \@dottedtocline's) or LIST_APART of its size or more clear of the word before it (\hfill's \contentspage); or, the ledger
 *  having cut a number set that far from the text a line of its own, the next word on its baseline in its column (the other
 *  column's text no word of it) a page number LIST_APART clear of the line's end, and nothing after it on the baseline but
 *  what stands LIST_APART clear again. A page number is set at the text's size within the text, never at the place a page
 *  sets numbers past its units' lines (two of marginNumbers there, a half of its size apart: line numbers). Words cut a fifth
 *  of their size apart. `gs` the line's glyphs, `pg` its page (listPage) */
function listedOf(gs, pg) {
  if (!gs.length) return false
  const { G } = pg
  // (its baseline its largest glyph's, never a superscript's: an author line's affiliation marks stand above it)
  const main = gs.reduce((a, g) => ((G[g].size || 0) > (G[a].size || 0) ? g : a), gs[0]), y = G[main].y, size = Math.max(G[main].size || 0, 1)
  const wordsOf = list => {
    const out = []
    let w = null
    for (const g of list.filter(g => /\S/.test(g.u ?? '')).sort((a, b) => a.x0 - b.x0)) {
      if (!w || g.x0 - w.x1 > 0.2 * Math.max(g.size, w.size)) { w = { s: '', x0: g.x0, x1: g.x1, y: g.y, size: g.size }; out.push(w) }
      w.s += g.u ?? ''
      w.x1 = Math.max(w.x1, g.x1)
      w.size = Math.max(w.size, g.size)
    }
    return out
  }
  const PAGE = /^(?:\d{1,4}|[ivxlcdm]{1,8})$/u, LEADERS = /^[.·•…]+$/u
  const apart = (a, b) => b.x0 - a.x1 >= LIST_APART * Math.max(a.size, b.size)
  // (a page number is set at the text's size: a superscript or a figure's tick label is none; nor a line's number in the margin)
  const lined = w => pg.margins().filter(m => Math.abs(m[2] - w.y) >= 0.5 * size && (Math.abs(m[0] - w.x0) < 0.5 * size || Math.abs(m[1] - w.x1) < 0.5 * size)).length >= 2
  const PAGE_AT = w => PAGE.test(w.s.normalize('NFKC')) && w.size >= 0.8 * size && !lined(w)
  const own = wordsOf(gs.map(g => G[g]))
  if (!own.length) return false
  const last = own.at(-1), prev = own.at(-2)
  if (prev && (LEADERS.test(prev.s) || apart(prev, last)) && PAGE_AT(last)) return true
  // (its page number past its end on a line of its own: the next word on the baseline in its column, the column's edge after it)
  let x0 = Infinity, x1 = -Infinity
  for (const g of gs) { x0 = Math.min(x0, G[g].x0); x1 = Math.max(x1, G[g].x1) }
  const col = pg.colOf(x0, x1)
  const line = wordsOf(G.filter(g => Math.abs(g.y - y) < 0.2 * size && (col === 2 || pg.colOf(g.x0, g.x1) === col)))
  const j = line.findIndex(w => w.x0 >= last.x1 - 0.1)
  if (j < 0) return false
  const num = line[j], after = line[j + 1]
  return (LEADERS.test(last.s) || apart(last, num)) && (!after || apart(num, after)) && PAGE_AT(num)
}

/** a line's text from its glyphs: a space where two stand a fifth of their size apart or more */
function textOf(gs) {
  let s = '', prev = null
  for (const g of [...gs].sort((a, b) => a.x0 - b.x0)) {
    if (prev && g.x0 - prev.x1 > 0.2 * g.size) s += ' '
    s += g.u ?? ''
    prev = g
  }
  return s.replace(/\s+/g, ' ').trim()
}

/** the orphans a head lists at most, and an orphan's text there at most (the web contract, docs/route/orphan-text.md §8) */
export const HEAD_ORPHANS = 64, HEAD_TEXT = 120

/** the ledger as a head holds it, flat (a head nests four deep at most): `classes` [class, glyphs, letters, …] for each class
 *  that has a glyph, the document's `letters` and its `orphanLetters`, and its first HEAD_ORPHANS orphans, `orphans` [page,
 *  letters, text cut at HEAD_TEXT, …] */
export function ledgerSummary(ledger) {
  const classes = []
  for (const id of CLASS_IDS) { const c = ledger.counts[id]; if (c.glyphs) classes.push(id, c.glyphs, c.letters) }
  return { classes, letters: ledger.letters, orphanLetters: ledger.orphanLetters, orphans: ledger.orphans.slice(0, HEAD_ORPHANS).flatMap(o => [o.page, o.letters, o.text.replace(/\p{Cc}/gu, ' ').slice(0, HEAD_TEXT)]) }
}

/** the ledger once the ink units own what they own (layout/ink-units.mjs claimInk): its orphans the orphan glyphs no unit owns
 *  still, counted and listed again; its classes as they were (an ink unit's glyph keeps its line's class). `own` ownOf's,
 *  claimed; `pages` the ledger's */
export function inkLeft(ledger, own, pages) {
  let orphanLetters = 0
  const orphans = []
  for (const l of ledger.lines) {
    if (l.cls !== 'orphan') continue
    const G = pages[l.page - 1]?.glyphs ?? [], O = own?.glyphs?.[l.page - 1] ?? []
    const left = l.gs.filter(g => !O[g])
    const n = left.reduce((k, g) => k + (G[g]?.blank ? 0 : lettersOf(G[g]?.u)), 0)
    if (!n) continue
    orphanLetters += n
    if (orphans.length < ORPHAN_LINES_MAX) orphans.push({ page: l.page, text: textOf(left.map(g => G[g])).slice(0, TEXT_MAX), letters: n, x0: l.x0, x1: l.x1, y: l.y })
  }
  return { ...ledger, orphanLetters, orphans }
}

/** the sweep's invariant (o), no orphan letters: a row a listed orphan line, in the sweep's shape (scripts/sweep/invariants.mjs
 *  of the web), every row a violation */
export const orphanRows = (ledger, { paper }) => ledger.orphans.map(o => ({ inv: 'o', sev: 'violation', paper, page: o.page, unit: null, what: 'orphan text', text: o.text, detail: { letters: o.letters, x0: o.x0, x1: o.x1, y: o.y } }))

/** invariant (o) from a head (its base's `ledger`, ledgerSummary's): a row a listed orphan, and one for the orphan letters the head
 *  does not list; none for a head with no ledger (an older engine's) */
export function orphanRowsOfHead(head, { paper }) {
  const l = head?.base?.ledger
  if (!l || !Array.isArray(l.orphans)) return []
  const rows = []
  let listed = 0
  for (let j = 0; j + 2 < l.orphans.length; j += 3) {
    const [page, letters, text] = l.orphans.slice(j, j + 3)
    rows.push({ inv: 'o', sev: 'violation', paper, page, unit: null, what: 'orphan text', text, detail: { letters } })
    listed += letters
  }
  if (Number.isInteger(l.orphanLetters) && l.orphanLetters > listed) rows.push({ inv: 'o', sev: 'violation', paper, page: null, unit: null, what: 'orphans not listed', text: '', detail: { letters: l.orphanLetters - listed } })
  return rows
}
