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
import { OWNED, ownedOf, regionsOf } from './stream.mjs'

export { UNHIDDEN }
/** the glyphs and boxes the ownership of a paper may visit (real ranges never overlap: they cost its ink once) */
export const OWN_WORK = 20_000_000
/** the unit ids a record lists the spell check's refusals of, at most */
export const SPELL_LIST_MAX = 64

const START = /^([th]?)(\d+)s$/
const END = /^([th]?)(\d+)e$/
const OPENING = /^([pn])(\d+)\.(\d+)a$/
const CLOSING = /^([pn])(\d+)\.(\d+)b$/
const NAME_START = /^n(\d+)\.([a-z]{1,16})\.s$/
const NAME_END = /^n(\d+)\.([a-z]{1,16})\.e$/
const BRACKET = /^[bf][se]\d+$/

/** a text's evidence for the spell check: its letters and digits, without their accents, lower case */
export const spellOf = s => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/ß/g, 'ss').replace(/[^\p{L}\p{N}]/gu, '')
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
      if (kind === 'l' ? cur !== null : kind === 'u' && cur !== null) continue
      gOwn[p - 1][i] = group
    }
    for (const [p, b] of list.boxes ?? []) {
      if ((pages[p - 1].paths[b] ?? -1) < 0) continue
      const cur = bOwn[p - 1][b]
      if (kind === 'u' && cur !== null) continue
      bOwn[p - 1][b] = group
    }
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
      const prev = e[1] > 0 ? [e[0], e[1] - 1] : null
      list = prev ? take(prev, e, at(e)) : takeFromStart(e, at(e))
      list = { glyphs: list.glyphs, boxes: [] }
    }
    textOf.set(id, { s, e })
    claim(list, `u${id}`, 'u')
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
    if (lead.glyphs.length) claim(lead, `u${id}.l`, 'l')
  }

  // ---- the placeholders (MR 4)
  const owned = follows ? ownedOf(pages.map((pg, i) => streamPage(pg, i)), { follows }) : null
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
  const spell = []
  let labelKept = 0
  for (const [id, u] of unitOf) {
    if (u.unhidden) continue
    // (a unit the marks name and the units do not: no source to spell it against, so the original's)
    if (units && !units[id]) { u.unhidden = 'marks'; continue }
    const src = units ? sourceOf(units[id]) : null
    if (src !== null && spellOf(text.get(id)?.join('') ?? '') !== spellOf(src)) { u.unhidden = 'spell'; spell.push(id); continue }
    const lead = label.get(id)
    if (!lead) continue
    const chars = lead.map(([p, i]) => pages[p - 1].glyphs[i].u ?? '').join('')
    if (isLabelForm(chars)) continue
    // the label is no label: its ink left the original's where it stands apart from the text's, else the unit the original
    if (apart(lead, id)) {
      for (const [p, i] of lead) gOwn[p - 1][i] = null
      u.groups.delete(`u${id}.l`)
      u.labelKept = true
      labelKept++
    } else { u.unhidden = 'spell'; spell.push(id) }
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
  return { glyphs: gOwn, boxes: bOwn, units: unitOf, stats: { units: unitOf.size, unhidden, spell: spell.slice(0, SPELL_LIST_MAX), labelKept } }
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
