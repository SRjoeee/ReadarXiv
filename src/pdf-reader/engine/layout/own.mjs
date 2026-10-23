// Each unit's own ink in our final pass, by its marks in content-stream order (per-unit optional-content erasure, design
// `docs/route/ocg-erasure.md` §1): the classes a unit's ink is hidden by — its text `u<id>`, its placeholders `u<id>.p`, its
// label `u<id>.l` — and a babel name's `n<occ>`, as glyphs and painted rules of each page of the compile the reader shows. The
// layout file and the page's geometry are not read (but one baseline test for a label): what a unit owns is what TeX shipped
// between its points (`/axt-<name> ri`, layout/marks.mjs LAYOUT_TEX), in its start point's region (stream.mjs regionsOf: in a
// column's body or not, at a depth of floats).
//
// The rules (MR):
//   1. a region is a column's body or not × a depth of floats;
//   2. text: from the unit's start mark (`<id>s`, `t<id>s`, `h<id>s`) to its end mark, in the start's region; across pages only
//      inside the bodies, but 2a: a range outside the bodies from page p to page p + 1 at one depth (a footnote continued) is
//      page p from its start to the next unit's start in that region (else the stream's end) and page p + 1 from after the last
//      other unit's end in it (else the stream's start) to its end mark; over more pages, `across`;
//   3. a unit with an end mark alone (a title: TeX sets no start in vertical mode): from the point before it on its page, its
//      glyphs alone (a rule above a title is no title's);
//   4. a placeholder (`p<id>.<j>a`/`b`, a footnote call `n<id>.<j>a`/`b`): stream.mjs ownedOf's entry where the marking is
//      given (`follows`), else the pair, or an opening alone to the next point in its region;
//   5. a label: the glyphs on the start's first glyph's baseline between the previous unit's end mark and the start, the
//      placeholders' and names' ranges passed over; none for a table cell;
//   6. a babel name `n<occ>`: between `n<occ>.<key>.s` and `.e`;
//   7. images and forms are never a unit's here (a form whose ink is all one group's is wrapped whole by wrap.mjs).
// A glyph is one group's: a placeholder's or a name's over the text's, the text's over a label's, the first text's over a later.
// A placeholder whose ink cannot be told apart (its range lost) makes its unit the original's (`marks`), as do marks that the
// units do not name; the work is bounded (OWN_WORK).
//
// The spell check (§1.3) is what makes "a unit that cannot be delimited shows the original" exact: a unit's `u` glyphs must
// spell its source text, letters and digits alone (NFKD, marks and case dropped: TeX's accents, ligatures, hyphenation and
// punctuation are no unit's evidence), or it is `unhidden: 'spell'`; its label must be a label's form (a number, an item's mark,
// a caption's name and number) or empty, else the label is left the original's ink (`labelKept`, the coordinator's amendment of
// 2026-10-28) where its ink is apart from the text's, and the unit `spell` where it is not.
//
// Pure arithmetic over what pageInk read (layout/ink.mjs, `indices`); imports the stream's regions and a unit's source text.
// An original module (no port statement).
import { plainSource } from '../translate/mt.mjs'
import { UNHIDDEN } from './delta-wire.mjs'
import { classOf } from './marks.mjs'
import { OWNED, ownedOf, regionsOf } from './stream.mjs'

export { UNHIDDEN }
/** the glyphs and boxes the ownership of a paper may visit (real ranges never overlap: they cost its ink once) */
export const OWN_WORK = 20_000_000
/** the unit ids a record lists the spell check's refusals of, at most */
export const SPELL_LIST_MAX = 64

const START = /^([th]?)(\d+)s$/
const END = /^([th]?)(\d+)e$/
/** a cell's lead macro's ink abuts its start: each gap under this share of an em (a word's space is a third; two \\tabcolsep
 *  between columns are more than one) */
const CELL_ABUT = 0.6
const OPENING = /^([pn])(\d+)\.(\d+)a$/
const CLOSING = /^([pn])(\d+)\.(\d+)b$/
const NAME_START = /^n(\d+)\.([a-z]{1,16})\.s$/
const NAME_END = /^n(\d+)\.([a-z]{1,16})\.e$/
const BRACKET = /^[bf][se]\d+$/

/** a text's evidence for the spell check: its letters and digits, without their accents, lower case */
// (a spacing accent — OT1's \\^ sets ˆ beside its letter, a modifier letter to Unicode — is no letter, and a dotless ı or ȷ under an
// accent is its letter: 2610.20595v1 "Ciˆencia", 2610.20581v1 "Estad´ısticas")
export const spellOf = s => s.normalize('NFKD').replace(/[\p{M}\p{Lm}\p{Sk}]/gu, '').toLowerCase().replace(/ß/g, 'ss').replace(/ı/g, 'i').replace(/ȷ/g, 'j').replace(/[^\p{L}\p{N}]/gu, '')
/** a label's form (§1.3): a number or an item's mark, maybe a caption's or a section's name before it, in brackets or with a
 *  stop after it — of its characters, NFKC, lower case, no white space */
const LABEL_NAME = '(?:figure|fig\\.?|table|tab\\.?|algorithm|alg\\.?|listing|section|sec\\.?|chapter|appendix|part|step|case|example|definition|lemma|theorem|proposition|corollary|remark|claim|note|assumption|exercise|problem|equation|eq\\.?|proof|keywords?|index ?terms)'
const LABEL_NUMBER = '[([]?(?:\\d{1,4}|[a-z]|[ivxlcdm]{1,6})(?:[.\\-–](?:\\d{1,4}|[a-z]))*'
const LABEL_FORM = new RegExp(`^(?:(?:${LABEL_NAME}(?:${LABEL_NUMBER})?|${LABEL_NUMBER})[)\\].:–—|]{0,2}|[•◦▪▫‣⁃∙·∗*–—\\-+○●■□►▸▹➢✓✔])$`, 'u')
const labelText = s => s.normalize('NFKC').toLowerCase().replace(/\s/gu, '')
export const isLabelForm = s => { const t = labelText(s); return t === '' || LABEL_FORM.test(t) }

/**
 * Each unit's own ink of a document, by its marks. `pages` (page p at index p - 1): what pageInk read of each page with
 * `indices` — `glyphs` ({ n, k, u, x0, x1, y, size, top, bottom }, stream order), `boxes` (stride 4), `paths` (each box's
 * painted path's place, or its kind: < 0), `points` ({ name, glyph, box }), `boxAt` — and its `view`; a page that was not read
 * is { glyphs: [], boxes: [], paths: [], points: [], boxAt: [] }. `units` the paper's units (their ids their indices; each its
 * source text `src`, else layout/../translate/mt.mjs plainSource of its pieces); `follows` (layout/marks.mjs followsOf over the
 * units and the points' names) where the marking is known, else null.
 * Returns { glyphs, boxes, units, stats }: `glyphs[p - 1][g]`, `boxes[p - 1][b]` the group a page's glyph or painted rule is
 * hidden with, or null; `units` Map id -> { groups: Set, pages: Set, unhidden: a code of UNHIDDEN or null, labelKept }; `stats`
 * { units, unhidden: { marks, across, spell, page: 0, bounds: 0 }, spell: [ids, at most SPELL_LIST_MAX], labelKept }
 */
export function ownOf(pages, { units = null, follows = null } = {}) {
  const P = pages.length
  // (the glyphs and boxes visited: real ranges never overlap and cost the paper's ink once; past OWN_WORK a unit is not owned)
  let work = 0
  const regions = pages.map(pg => regionsOf({ glyphs: { n: pg.glyphs.length }, boxes: pg.boxes, points: pg.points }))
  const gOwn = pages.map(pg => new Array(pg.glyphs.length).fill(null)), bOwn = pages.map(pg => new Array(pg.boxes.length / 4).fill(null))
  // every point by its name: [page, index]; and each page's points in stream order
  const where = new Map()
  pages.forEach((pg, i) => pg.points.forEach((pt, q) => { const l = where.get(pt.name); if (l) l.push([i + 1, q]); else where.set(pt.name, [[i + 1, q]]) }))
  const pt = ([p, q]) => pages[p - 1].points[q]
  const at = ([p, q]) => regions[p - 1].at[q]
  const before = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])

  /** the glyphs and boxes of A's region r from point A to point B (pages between whole), each [page, index] */
  const take = (A, B, r, crossOk = true) => {
    const glyphs = [], boxes = []
    work += B[0] - A[0] + 1
    for (let p = A[0]; p <= B[0]; p++) {
      if (p !== A[0] && p !== B[0] && !crossOk) continue
      const pg = pages[p - 1], R = regions[p - 1]
      const g0 = p === A[0] ? pt(A).glyph : 0, g1 = p === B[0] ? pt(B).glyph : pg.glyphs.length
      const b0 = p === A[0] ? pt(A).box : 0, b1 = p === B[0] ? pt(B).box : pg.boxes.length / 4
      work += g1 - g0 + b1 - b0
      for (let g = g0; g < g1; g++) if (R.glyph[g] === r) glyphs.push([p, g])
      for (let b = b0; b < b1; b++) if (R.box[b] === r) boxes.push([p, b])
    }
    return { glyphs, boxes }
  }
  /** a page's points from index q0 to q1 (exclusive), in order */
  const pointsOn = (p, q0, q1) => pages[p - 1].points.slice(q0, q1).map((x, i) => [x, q0 + i])
  const unitOf = new Map()
  const unit = id => {
    let u = unitOf.get(id)
    if (!u) { u = { groups: new Set(), pages: new Set(), unhidden: null, labelKept: false }; unitOf.set(id, u) }
    return u
  }
  // (the claims, in their order of precedence: a text's first, a label's where nothing is, a placeholder's and a name's over both)
  const claim = (list, group, kind) => {
    for (const [p, i] of list.glyphs) {
      const cur = gOwn[p - 1][i]
      if (kind === 'l' ? cur !== null : kind === 'u' ? cur !== null : kind === 'n' && cur !== null && cur.endsWith('.p')) continue
      gOwn[p - 1][i] = group
    }
    for (const [p, b] of list.boxes ?? []) {
      if ((pages[p - 1].paths[b] ?? -1) < 0) continue
      const cur = bOwn[p - 1][b]
      if (kind === 'u' && cur !== null) continue
      bOwn[p - 1][b] = group
    }
  }

  /** whether a unit's pieces open (before any text but white space) with a placeholder of ink that has no mark of its own */
  function opensUnmarked(u, id) {
    if (!Array.isArray(u?.pieces)) return false
    for (let k = 0; k < u.pieces.length; k++) {
      const piece = u.pieces[k]
      if (piece?.t === 'text') { if (/\S/.test(typeof piece.s === 'string' ? piece.s : '')) return false; continue }
      const c = classOf(piece)
      if (c && c !== 'footnote' && !where.has(`p${id}.${k}a`) && !where.has(`p${id}.${k}b`)) return true
    }
    return false
  }

  // ---- the text of each unit (MR 1–3, 2a)
  const ids = new Set()
  for (const name of where.keys()) { const m = START.exec(name) ?? END.exec(name) ?? OPENING.exec(name) ?? CLOSING.exec(name); if (m) ids.add(Number(m[2])) }
  if (units) units.forEach((_, i) => ids.add(i))
  const textOf = new Map()
  for (const id of [...ids].sort((a, b) => a - b)) {
    const u = unit(id)
    if (work > OWN_WORK) { u.unhidden = 'marks'; continue }
    const S = [`${id}s`, `t${id}s`, `h${id}s`].flatMap(n => where.get(n) ?? []), E = [`${id}e`, `t${id}e`, `h${id}e`].flatMap(n => where.get(n) ?? [])
    if (S.length > 1 || E.length > 1) { u.unhidden = 'marks'; continue }
    const s = S[0] ?? null, e = E[0] ?? null
    if (!e) { if (!units || units[id]) u.unhidden = 'marks'; continue }
    if (s && before(e, s)) { u.unhidden = 'marks'; continue }
    let list = null
    if (s) {
      const r = at(s)
      if (s[0] === e[0] || r % 2 === 1) list = take(s, e, r)
      else if (e[0] === s[0] + 1 && at(e) === r) {
        // 2a: page p from the start to the next unit's start in its region, page p + 1 from after the last other unit's end
        const P1 = pages[s[0] - 1].points
        let stop = [s[0], P1.length]
        for (const [x, q] of pointsOn(s[0], s[1] + 1, P1.length)) if (regions[s[0] - 1].at[q] === r && START.test(x.name) && Number(START.exec(x.name)[2]) !== id) { stop = [s[0], q]; break }
        let from = [e[0], -1]
        for (const [x, q] of pointsOn(e[0], 0, e[1])) if (regions[e[0] - 1].at[q] === r && END.test(x.name) && Number(END.exec(x.name)[2]) !== id) from = [e[0], q]
        const a = stop[1] < P1.length ? take(s, stop, r) : takeToEnd(s, r)
        const b = from[1] >= 0 ? take(from, e, r) : takeFromStart(e, r)
        list = { glyphs: [...a.glyphs, ...b.glyphs], boxes: [...a.boxes, ...b.boxes] }
      } else { u.unhidden = 'across'; continue }
    } else {
      // MR 3: from the point before the end mark on its page (or the page's start); its glyphs alone, no rule: what stands
      // above a title (a class's rule over it) is no title's, and the spell check reads no rule
      // (the point before it not its own placeholder's: a title's placeholder — a dash, a colon in math — sets points in it,
      // 2610.20848v1 p1u1)
      const P1 = pages[e[0] - 1].points
      let q0 = e[1] - 1
      for (; q0 >= 0; q0--) { const m = OPENING.exec(P1[q0].name) ?? CLOSING.exec(P1[q0].name); if (!m || Number(m[2]) !== id) break }
      work += e[1] - q0
      const prev = q0 >= 0 ? [e[0], q0] : null
      list = prev ? take(prev, e, at(e)) : takeFromStart(e, at(e))
      list = { glyphs: list.glyphs, boxes: [] }
    }
    textOf.set(id, { s, e })
    // (a unit's text takes its glyphs alone: a rule in its range — a footnote's separator, an underline — is the page's, left
    // standing; a placeholder's rules are its own, `.p`)
    claim({ glyphs: list.glyphs, boxes: [] }, `u${id}`, 'u')
  }
  function takeToEnd(A, r) {
    const pg = pages[A[0] - 1], R = regions[A[0] - 1], glyphs = [], boxes = []
    for (let g = pt(A).glyph; g < pg.glyphs.length; g++) if (R.glyph[g] === r) glyphs.push([A[0], g])
    for (let b = pt(A).box; b < pg.boxes.length / 4; b++) if (R.box[b] === r) boxes.push([A[0], b])
    return { glyphs, boxes }
  }
  function takeFromStart(B, r) {
    const R = regions[B[0] - 1], glyphs = [], boxes = []
    for (let g = 0; g < pt(B).glyph; g++) if (R.glyph[g] === r) glyphs.push([B[0], g])
    for (let b = 0; b < pt(B).box; b++) if (R.box[b] === r) boxes.push([B[0], b])
    return { glyphs, boxes }
  }

  // ---- the labels (MR 5): before the placeholders, so that a placeholder's ink is never a label's
  for (const [id, { s }] of textOf) {
    // (a table cell, its start mark `t<id>s`, carries no label: what stands before it on its line is another cell's, a number an
    // unmarked cell's)
    if (!s || units?.[id]?.kind === 'cell' || pt(s).name.startsWith('t')) continue
    if (work > OWN_WORK) { unit(id).unhidden ??= 'marks'; continue }
    const [p, q] = s, pg = pages[p - 1], S = pt(s), r = at(s), R = regions[p - 1]
    if (S.glyph >= pg.glyphs.length) continue
    const F = pg.glyphs[S.glyph]
    const lead = { glyphs: [] }
    let g = S.glyph - 1
    work += S.glyph + q
    const glyphAt = i => { if (R.glyph[i] !== r || gOwn[p - 1][i] !== null) return; const G = pg.glyphs[i]; if (Math.abs(G.y - F.y) < 0.5 * Math.max(G.size, F.size)) lead.glyphs.push([p, i]) }
    let qq = q - 1
    for (; qq >= 0; qq--) {
      const X = pg.points[qq]
      for (; g >= X.glyph; g--) glyphAt(g)
      if (END.test(X.name)) break
      const c = CLOSING.exec(X.name), nm = NAME_END.exec(X.name)
      const open = c ? `${c[1]}${c[2]}.${c[3]}a` : nm ? `n${nm[1]}.${nm[2]}.s` : null
      const o = open ? (where.get(open) ?? []).find(([op, oq]) => op === p && oq < qq) : null
      if (o) { qq = o[1]; g = Math.min(g, pg.points[qq].glyph - 1) }
    }
    if (qq < 0) for (; g >= 0; g--) glyphAt(g)
    if (!lead.glyphs.length) continue
    // a unit that opens with a placeholder of no mark of its own (a paper's macro first in it: \\bert, \\aidehuman): TeX set
    // that placeholder's ink before the start mark, after the label if the unit has one. On a unit's first line nothing but its
    // label and that ink stands between the unit before it and its start (a cell aside: an unmarked number cell may), so the
    // run is split: its longest opening that is a label's form the label, the rest the placeholder's ink (`.p`)
    lead.glyphs.reverse()
    const cell = units?.[id]?.kind === 'cell' || pt(s).name.startsWith('t')
    if (units && !cell && opensUnmarked(units[id], id)) {
      let k = 0
      // (the label ends at a word's end: the next glyph a gap of a fifth of an em or more after it, or none)
      const G = j => pg.glyphs[lead.glyphs[j][1]]
      const wordEnd = j => j === lead.glyphs.length || G(j).x0 - G(j - 1).x1 >= 0.2 * Math.max(G(j).size, G(j - 1).size) || !/\S/.test(G(j).u ?? '')
      for (let j = lead.glyphs.length; j > 0; j--) if (wordEnd(j) && isLabelForm(lead.glyphs.slice(0, j).map(([, i]) => pg.glyphs[i].u ?? '').join(''))) { k = j; break }
      if (k) claim({ glyphs: lead.glyphs.slice(0, k) }, `u${id}.l`, 'l')
      if (k < lead.glyphs.length) claim({ glyphs: lead.glyphs.slice(k) }, `u${id}.p`, 'p')
      continue
    }
    claim(lead, `u${id}.l`, 'l')
  }

  // ---- a cell's lead macro (MR 5b): a cell that opens with a placeholder of no mark of its own (\\CompletionTokenCap{}, \\#,
  // \\bertbase) has that ink set before its start mark, on its line, after the point before it. A cell takes no label, and what
  // stands before it on its line may be an unmarked cell's (a number): so the placeholder's ink is only the run that abuts the
  // start — each glyph less than CELL_ABUT of an em from the next — never across a column's gap (\\tabcolsep on each side):
  // ink in no group past that gap is another cell's, left standing. A cell with no such run (its macro's ink apart from its
  // start) is the original's, as before (leadUnmarked); 2610.21098v1 p13
  const cellLead = new Set()
  for (const [id, { s }] of textOf) {
    if (!s || !units || !(units[id]?.kind === 'cell' || pt(s).name.startsWith('t')) || !opensUnmarked(units[id], id)) continue
    if (work > OWN_WORK) { unit(id).unhidden ??= 'marks'; continue }
    const [p, q] = s, pg = pages[p - 1], S = pt(s), r = at(s), R = regions[p - 1]
    if (S.glyph >= pg.glyphs.length) continue
    const F = pg.glyphs[S.glyph], from = q > 0 ? pg.points[q - 1].glyph : 0
    const run = []
    let right = F
    work += S.glyph - from
    for (let g = S.glyph - 1; g >= from; g--) {
      const G = pg.glyphs[g]
      if (R.glyph[g] !== r || gOwn[p - 1][g] !== null || Math.abs(G.y - F.y) >= 0.5 * Math.max(G.size, F.size)) break
      if (right.x0 - G.x1 >= CELL_ABUT * Math.max(G.size, right.size)) break
      run.push([p, g])
      right = G
    }
    if (!run.some(([, g]) => /\S/.test(pg.glyphs[g].u ?? ''))) continue
    claim({ glyphs: run.reverse() }, `u${id}.p`, 'p')
    cellLead.add(id)
  }

  // ---- the placeholders (MR 4)
  // (the erasure's reading: stream.mjs ownedOf `erasure`, a piece's ink found exactly where the maker's reading leaves it LOST)
  const owned = follows ? ownedOf(pages.map((pg, i) => streamPage(pg, i)), { follows, erasure: true }) : null
  for (const [name, list] of where) {
    const m = OPENING.exec(name)
    if (!m) continue
    const id = Number(m[2])
    if (work > OWN_WORK) { if (unitOf.has(id)) unit(id).unhidden ??= 'marks'; continue }
    let e = null
    let lost = false
    if (owned) { const x = owned.get(name); if (x && x.how < OWNED) e = { glyphs: x.glyphs, boxes: x.boxes }; else if (x && x.how > OWNED) lost = true }
    else if (list.length === 1) {
      const close = where.get(`${m[1]}${m[2]}.${m[3]}b`) ?? []
      const A = list[0], r = at(A)
      if (close.length === 1 && !before(close[0], A) && at(close[0]) === r && (close[0][0] === A[0] || r % 2 === 1)) e = take(A, close[0], r)
      else if (close.length === 0) {
        // an opening alone: to the next point in its region (a bracket's and a name's passed over)
        let B = null
        for (let p = A[0]; p <= P && !B; p++) {
          const pts = pages[p - 1].points
          for (let q = p === A[0] ? A[1] + 1 : 0; q < pts.length; q++) if (!BRACKET.test(pts[q].name) && regions[p - 1].at[q] === r) { B = [p, q]; break }
          if (r % 2 === 0) break
        }
        if (B) e = take(A, B, r)
      }
      if (!e) lost = true
    }
    if (e) claim(e, `u${id}.p`, 'p')
    // a placeholder whose ink cannot be told apart is in the text's range: hidden with it, it could not be kept in place, and the
    // spell check reads no symbol (=, ×, †): its unit is the original's
    else if (lost && unitOf.has(id) && !unitOf.get(id).unhidden && textOf.has(id)) unit(id).unhidden = 'marks'
  }

  // ---- the names (MR 6)
  for (const [name, list] of where) {
    const m = NAME_START.exec(name)
    if (!m || list.length !== 1 || work > OWN_WORK) continue
    const close = where.get(`n${m[1]}.${m[2]}.e`) ?? []
    if (close.length !== 1 || before(close[0], list[0]) || at(close[0]) !== at(list[0])) continue
    claim(take(list[0], close[0], at(list[0])), `n${m[1]}`, 'n')
  }

  // ---- each unit's groups and pages, and the spell check (§1.3)
  const text = new Map(), label = new Map()
  for (let p = 1; p <= P; p++) {
    const G = gOwn[p - 1], glyphs = pages[p - 1].glyphs
    for (let i = 0; i < G.length; i++) {
      const g = G[i]
      if (g === null || g[0] !== 'u') continue
      const dot = g.indexOf('.'), id = Number(dot < 0 ? g.slice(1) : g.slice(1, dot))
      const u = unit(id)
      u.groups.add(g)
      u.pages.add(p)
      if (dot < 0) (text.get(id) ?? text.set(id, []).get(id)).push(glyphs[i].u ?? '')
      else if (g.endsWith('.l')) (label.get(id) ?? label.set(id, []).get(id)).push([p, i])
    }
    for (const g of bOwn[p - 1]) { if (g === null || g[0] !== 'u') continue; const dot = g.indexOf('.'), id = Number(dot < 0 ? g.slice(1) : g.slice(1, dot)); unit(id).groups.add(g); unit(id).pages.add(p) }
  }
  const spell = [], leaks = []
  let labelKept = 0
  /** whether a unit's pieces open (before any text but white space) with a placeholder that has no mark of its own, and ink in
   *  no group stands on its start's line before its start mark, back to the point before it: that placeholder's, set before the
   *  mark (an inkless one — \\hline, \\fontsize, \\boldmath — leaves none there, and a label's is its unit's `.l`) */
  function leadUnmarked(u, id) {
    if (!opensUnmarked(u, id)) return false
    const t = textOf.get(id)
    if (!t?.s) return false
    const [p, q] = t.s, pg = pages[p - 1], S = pt(t.s), R = regions[p - 1], r = at(t.s)
    if (S.glyph >= pg.glyphs.length) return false
    const F = pg.glyphs[S.glyph], from = q > 0 ? pg.points[q - 1].glyph : 0
    for (let g = S.glyph - 1; g >= from; g--) {
      const G = pg.glyphs[g]
      if (R.glyph[g] === r && gOwn[p - 1][g] === null && /\S/.test(G.u ?? '') && Math.abs(G.y - F.y) < 0.5 * Math.max(G.size, F.size)) return true
    }
    return false
  }
  for (const [id, u] of unitOf) {
    if (u.unhidden) continue
    // (a unit the marks name and the units do not: no source to spell it against, so the original's)
    if (units && !units[id]) { u.unhidden = 'marks'; continue }
    const src = units ? sourceOf(units[id]) : null
    if (src !== null && spellOf(text.get(id)?.join('') ?? '') !== spellOf(src) && !(textOf.get(id) && !textOf.get(id).s && trimLead(id, spellOf(src)))) { u.unhidden = 'spell'; spell.push(id); continue }
    const lead = label.get(id)
    if (lead) {
      const chars = lead.map(([p, i]) => pages[p - 1].glyphs[i].u ?? '').join('')
      // the label is no label: its ink left the original's where it stands apart from the text's, else the unit the original
      if (!isLabelForm(chars)) {
        if (!apart(lead, id)) { u.unhidden = 'spell'; spell.push(id); continue }
        for (const [p, i] of lead) gOwn[p - 1][i] = null
        u.groups.delete(`u${id}.l`)
        u.labelKept = true
      }
    }
    // (a unit that opens with a placeholder of ink the marker set no mark for, and ink still in no group on its start's line
    // before its start mark — a cell's, where the label rule does not split it, or one its label was left: the placeholder
    // would be drawn over that ink: the original's)
    if (units && !cellLead.has(id) && leadUnmarked(units[id], id)) { u.unhidden = 'marks'; u.labelKept = false; leaks.push(id); continue }
    if (u.labelKept) labelKept++
  }
  /** a unit with an end mark alone (a title) whose range, read from the point before it, opens with ink TeX set before it on
   *  lines of its own (amsart's date before its title, a journal's header): where the range's last glyphs spell its source
   *  exactly and every glyph before them stands on no line of theirs, those glyphs are left the page's (no group) and the
   *  title is the rest. Ink on a line of the title's own cannot be told from it: none is trimmed there (2610.20581v1 p1u0) */
  function trimLead(id, want) {
    const mine = `u${id}`, list = []
    for (let p = 1; p <= P; p++) gOwn[p - 1].forEach((g, i) => { if (g === mine) list.push([p, i]) })
    const G = ([p, i]) => pages[p - 1].glyphs[i]
    let acc = '', k = list.length
    while (k > 0 && acc.length < want.length) { k--; acc = spellOf(G(list[k]).u ?? '') + acc }
    if (acc !== want || k === 0) return false
    const lead = list.slice(0, k), rest = list.slice(k)
    for (const a of lead) {
      if (!/\S/.test(G(a).u ?? '')) continue
      if (rest.some(b => b[0] === a[0] && Math.abs(G(b).y - G(a).y) < 0.5 * Math.max(G(b).size, G(a).size))) return false
    }
    for (const [p, i] of lead) gOwn[p - 1][i] = null
    text.set(id, rest.map(a => G(a).u ?? ''))
    return true
  }
  /** whether a label's glyphs stand apart from the unit's text glyphs on their pages (no two boxes meet) */
  function apart(lead, id) {
    const mine = `u${id}`
    for (const [p, i] of lead) {
      const a = pages[p - 1].glyphs[i]
      const G = gOwn[p - 1], glyphs = pages[p - 1].glyphs
      for (let j = 0; j < G.length; j++) {
        if (G[j] !== mine) continue
        const b = glyphs[j]
        if (Math.min(a.x0, a.ix0 ?? a.x0) < Math.max(b.x1, b.ix1 ?? b.x1) && Math.min(b.x0, b.ix0 ?? b.x0) < Math.max(a.x1, a.ix1 ?? a.x1) && a.bottom < b.top && b.bottom < a.top) return false
      }
    }
    return true
  }
  const unhidden = Object.fromEntries(UNHIDDEN.map(k => [k, 0]))
  for (const u of unitOf.values()) if (u.unhidden) unhidden[u.unhidden]++
  spell.sort((a, b) => a - b)
  leaks.sort((a, b) => a - b)
  return { glyphs: gOwn, boxes: bOwn, units: unitOf, stats: { units: unitOf.size, unhidden, spell: spell.slice(0, SPELL_LIST_MAX), labelKept, leaks: { count: leaks.length, units: leaks.slice(0, SPELL_LIST_MAX) } } }
}

/** a unit's source text for the spell check: its `src` where it has one, else its pieces' (placeholders dropped) */
function sourceOf(u) {
  if (!u) return null
  if (typeof u.src === 'string') return u.src
  return Array.isArray(u.pieces) ? plainSource(u) : null
}

/** a page as stream.mjs ownedOf reads one: its glyphs' columns (x0, y, size, u) and their count */
function streamPage(pg) {
  const n = pg.glyphs.length
  const x0 = new Float64Array(n), y = new Float64Array(n), size = new Float64Array(n), u = new Array(n)
  pg.glyphs.forEach((g, i) => { x0[i] = g.x0; y[i] = g.y; size[i] = g.size; u[i] = g.u ?? '' })
  return { glyphs: { n, x0, y, size, u }, boxes: pg.boxes, points: pg.points, boxAt: Int32Array.from(pg.boxAt ?? []), view: pg.view ?? [0, 0, 0, 0] }
}
