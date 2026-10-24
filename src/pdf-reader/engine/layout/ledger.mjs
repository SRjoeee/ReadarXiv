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
import { CLASS_CODE, CLASS_IDS, unitClass } from '../rules/content-classes.mjs'
import { classifyFont } from '../layer-proto/fonts.mjs'
import { regionsOf } from './stream.mjs'

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

/** the babel names whose text opens a zone, and the zone it opens: a list, the bibliography, an index; a unit's start ends it */
const ZONE_OF = Object.freeze({ contents: 'contents', listfigure: 'contents', listtable: 'contents', ref: 'references', bib: 'references', index: 'index', glossary: 'index' })
const NAME_END = /^n\d+\.([a-z]{1,16})\.e$/
const UNIT_START = /^[th]?\d+s$/
/** a page's column mark (MARK_DEF's c<n>-<k>, set by shipout/background before anything of the page): no mark of its text */
const COLUMN = /^c[12]-\d+$/
const BRACKET = /^b[se]\d+$/
/** the letters a glyph spells: a ligature's each (ﬁ, ﬄ: NFKC), whether PDF.js gives it as one character or as its letters */
const LETTERS = /\p{L}/gu
const lettersOf = u => (u ? (u.normalize('NFKC').match(LETTERS) ?? []).length : 0)
const WORD = /\p{L}{3,}/gu, PAIR = /\p{L}{2,}/gu

/** the line rules, in order: the first whose test holds gives the line its class */
export const RULES = Object.freeze([
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
 * the glyphs that are no blank, a glyph's letters those it spells (a ligature's each); letters, the letters of the document; orphanLetters; orphans: the orphan lines, at most
 * ORPHAN_LINES_MAX, each { page, text, letters, x0, x1, y } }
 */
export function ledgerOf(pages, own, { units = null } = {}) {
  const counts = Object.fromEntries(CLASS_IDS.map(id => [id, { glyphs: 0, letters: 0 }]))
  const fam = new Map()
  const famOf = name => { let f = fam.get(name); if (f === undefined) { f = classifyFont(name ?? '').fam; fam.set(name, f) } return f }
  const classes = [], orphans = []
  let zone = null, letters = 0, orphanLetters = 0
  pages.forEach((pg, pi) => {
    const G = pg.glyphs ?? [], n = G.length, P = pg.points ?? [], O = own?.glyphs?.[pi] ?? []
    const out = new Uint8Array(n).fill(CLASS_CODE.symbols)
    classes.push(out)
    const R = regionsOf({ glyphs: { n }, boxes: pg.boxes ?? [], points: P })
    // (the page's first and last mark of its own text, the column's mark aside: the head is shipped before the first, the foot
    // after the last)
    let first = n, last = 0
    for (const pt of P) if (!COLUMN.test(pt.name)) { first = Math.min(first, pt.glyph); last = Math.max(last, pt.glyph) }
    const bracketed = P.some(pt => BRACKET.test(pt.name))
    const footFrom = bracketed ? footOf(G, R, O, last) : n
    // each glyph's zone, in stream order (a zone goes on across pages: the contents over three)
    const zones = new Array(n)
    for (let q = 0, g = 0; g <= n; g++) {
      for (; q < P.length && P[q].glyph <= g; q++) {
        const m = NAME_END.exec(P[q].name)
        if (m && Object.hasOwn(ZONE_OF, m[1])) zone = ZONE_OF[m[1]]
        else if (UNIT_START.test(P[q].name)) zone = null
      }
      if (g < n) zones[g] = zone
    }
    let line = null
    const close = () => {
      if (!line) return
      Object.assign(line, wordsOf(line.gs.map(g => G[g]), famOf))
      const rule = RULES.find(r => r.test(line))
      for (const g of line.gs) out[g] = rule.code
      if (rule.cls === 'orphan') {
        orphanLetters += line.letters
        if (orphans.length < ORPHAN_LINES_MAX) orphans.push({ page: pi + 1, text: textOf(line.gs.map(g => G[g])).slice(0, TEXT_MAX), letters: line.letters, x0: line.x0, x1: line.x1, y: line.y })
      }
      line = null
    }
    for (let g = 0; g < n; g++) {
      const x = G[g], group = O[g]
      if (group) { close(); out[g] = CLASS_CODE[ownerClass(group, units)]; continue }
      const region = R.glyph[g], size = Math.max(x.size || 0, 1e-6)
      if (line && !(line.region === region && line.zone === zones[g] && Math.abs(x.y - line.y) <= LINE_DY * Math.max(size, line.size) && x.x0 >= line.x0 - size && x.x0 - line.x1 <= LINE_GAP * size)) close()
      if (!line) {
        const depth = region >> 1, body = (region & 1) === 1
        line = { gs: [], region, zone: zones[g], y: x.y, size, x0: x.x0, x1: x.x1, n: 0, letters: 0, words: 0, pairs: 0, math: 0, mono: 0, form: 0, relation: false, depth, outside: bracketed && !body && depth === 0, head: g < first, foot: g >= footFrom }
      }
      line.gs.push(g); line.x1 = Math.max(line.x1, x.x1); line.size = Math.max(line.size, size)
      if (x.blank || !/\S/u.test(x.u ?? '')) continue
      const f = famOf(x.font)
      line.n++
      line.letters += lettersOf(x.u)
      if (f === 'math') line.math++
      if (f === 'mono') line.mono++
      if (x.form) line.form++
      if (RELATION.test(x.u)) line.relation = true
    }
    close()
    // the counts, every glyph that is no blank
    for (let g = 0; g < n; g++) {
      const x = G[g]
      if (x.blank || !/\S/u.test(x.u ?? '')) continue
      const c = counts[CLASS_IDS[out[g]]], k = lettersOf(x.u)
      c.glyphs++
      c.letters += k; letters += k
    }
  })
  return { classes, counts, letters, orphanLetters, orphans }
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

/** the ledger as a record holds it: integers alone — each class's [glyphs, letters] where it has any, the document's letters
 *  and its orphan letters */
export function ledgerSummary(ledger) {
  const classes = {}
  for (const id of CLASS_IDS) { const c = ledger.counts[id]; if (c.glyphs) classes[id] = [c.glyphs, c.letters] }
  return { classes, letters: ledger.letters, orphanLetters: ledger.orphanLetters }
}

/** the sweep's invariant (o), no orphan letters: a row a listed orphan line, in the sweep's shape (scripts/sweep/invariants.mjs
 *  of the web), every row a violation */
export const orphanRows = (ledger, { paper }) => ledger.orphans.map(o => ({ inv: 'o', sev: 'violation', paper, page: o.page, unit: null, what: 'orphan text', text: o.text, detail: { letters: o.letters, x0: o.x0, x1: o.x1, y: o.y } }))
