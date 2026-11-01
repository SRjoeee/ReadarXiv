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
//   2b. and the rules TeX painted on the text's own lines (OT1's \_, an underline): thin, on a baseline of its glyphs and across
//      within their extent (lineRules); any other box in the range is the page's;
//   3. a unit with an end mark alone (a title: TeX sets no start in vertical mode): from the point before it on its page, its
//      glyphs alone (a rule above a title is no title's); marks set twice are its first occurrence where that is an end mark
//      alone and every later one a pair (a title its class sets again: acmart);
//   4. a placeholder (`p<id>.<j>a`/`b`, a footnote call `n<id>.<j>a`/`b`): stream.mjs ownedOf's entry where the marking is
//      given (`follows`), else the pair, or an opening alone to the next point in its region; nothing of another unit's range
//      its opening point stands in (a run-in heading);
//   4b. a footnote's call after the unit's last word that TeX gave no mark: the raised glyphs right after its end mark, on that
//      line, in no group;
//   4c. the closing punctuation TeX sets after the unit's end mark (amsthm's ")" after a theorem's note where the body begins on
//      a line of its own, a bibliography style's stop after an entry): the glyphs right after the mark, on that line, in no
//      group, each TAIL_PUNCT abutting the one before it — the unit's text, as the maker's line takes them (make.mjs lineOf);
//   5. a label: the glyphs on the start's first glyph's baseline between the previous unit's end mark and the start, the
//      placeholders' and names' ranges passed over — but the closing punctuation a head sets abutting the unit before it, that
//      unit's text (amsthm's "(Note).") —; none for a table cell;
//   6. a babel name `n<occ>`: between `n<occ>.<key>.s` and `.e`;
//   7. images and forms are never a unit's here (a form whose ink is all one group's is wrapped whole by wrap.mjs).
// A glyph is one group's: a placeholder's or a name's over the text's, the text's over a label's, the first text's over a later.
// A placeholder whose ink cannot be told apart (its range lost) makes its unit the original's (`marks`), as do marks that the
// units do not name; the work is bounded (OWN_WORK).
//
// The spell check (§1.3) is what makes "a unit that cannot be delimited shows the original" exact: a unit's `u` glyphs must
// spell its source text, letters and digits alone (stream.mjs spellOf: NFKD, marks and case dropped, a letter Unicode does not
// decompose as its base letters: TeX's accents, ligatures, letter symbols, hyphenation and punctuation are no unit's evidence),
// a wrapper's own words at its slot and lines of their own no unit's aside (spells), or it is `unhidden: 'spell'`; its label
// must be a label's form (a number, an item's mark,
// a caption's name and number) or empty, else the label is left the original's ink (`labelKept`, the coordinator's amendment of
// 2026-10-28) where its ink is apart from the text's, and the unit `spell` where it is not.
//
// Pure arithmetic over what pageInk read (layout/ink.mjs, `indices`); imports the stream's regions and a unit's source text.
// An original module (no port statement).
import { utf8 } from '../translate/mt.mjs'
import { symbolText } from '../rules/text-symbols.mjs'
import { UNHIDDEN } from './delta-wire.mjs'
import { classOf, headsOf, INK_ANY, leadStep } from './marks.mjs'
import { OWNED, ownedOf, regionsOf, spellOf } from './stream.mjs'

export { UNHIDDEN }
/** the glyphs and boxes the ownership of a paper may visit (real ranges never overlap: they cost its ink once) */
export const OWN_WORK = 20_000_000
/** the unit ids a record lists the spell check's refusals of, at most */
export const SPELL_LIST_MAX = 64

const START = /^([th]?)(\d+)s$/
const END = /^([th]?)(\d+)e$/
/** a rule TeX paints on a line of a unit's text (MR 2b) is no thicker than this share of the line's size: its rules are a
 *  default rule's 0.4 pt (a twentieth of an 8 pt line, a sixtieth of a 24 pt one); a letter's ink, an icon's, a logo's parts
 *  are a quarter of a size or more */
export const RULE_EM = 0.1
/** a cell's lead macro's ink abuts its start: each gap under this share of an em (a word's space is a third; two \\tabcolsep
 *  between columns are more than one) */
const CELL_ABUT = 0.6
/** a footnote's mark after a unit's last word stands at least this share of the line's size above its baseline (make.mjs SHIFT) */
const RAISED = 0.2
/** a head macro's closing punctuation after the unit before a start (MR 5): a closing bracket or quote, a stop, a colon */
export const HEAD_PUNCT = /^[)\]}.,:;!?\u2019\u201d]$/u
/** that punctuation abuts the glyph before it: each gap under this share of an em (a word's space is a third) */
export const HEAD_ABUT = 0.2
/** the closing punctuation glued past a unit's end mark on its line that is the unit's text (MR 4c), as the maker's line takes it
 *  (make.mjs lineOf): a stop, a comma, a colon, a closing bracket */
export const TAIL_PUNCT = /^[.,;:!?)\]]$/
const OPENING = /^([pn])(\d+)\.(\d+)a$/
const CLOSING = /^([pn])(\d+)\.(\d+)b$/
const NAME_START = /^n(\d+)\.([a-z]{1,16})\.s$/
const NAME_END = /^n(\d+)\.([a-z]{1,16})\.e$/
const BRACKET = /^[bf][se]\d+$/

/** a text's evidence for the spell check: its letters and digits, without their accents, lower case (stream.mjs's) */
export { spellOf }
/** a label's form (§1.3): a number or an item's mark, maybe a caption's or a section's name before it, in brackets or with a
 *  stop after it — of its characters, NFKC, lower case, no white space */
const LABEL_NAME = '(?:figure|fig\\.?|table|tab\\.?|algorithm|alg\\.?|listing|section|sec\\.?|chapter|appendix|part|step|case|example|definition|lemma|theorem|proposition|corollary|remark|claim|note|assumption|exercise|problem|equation|eq\\.?|proof|keywords?|index ?terms)'
const LABEL_NUMBER = '[([]?(?:\\d{1,4}|[a-z]|[ivxlcdm]{1,6})(?:[.\\-–](?:\\d{1,4}|[a-z]))*'
// (after a name, a number may take a letter before it: a supplement's or an appendix's, "Table S3:", "Figure A1", the letter
// before a digit alone, so that two letters are no number, "Figure AB"; alone, a letter and a number are a model's or a
// product's name, "A100", no label)
const formOf = name => new RegExp(`^(?:(?:${name}(?:(?:[a-z](?=\\d))?${LABEL_NUMBER})?|${LABEL_NUMBER})[)\\].:–—|]{0,2}|[•◦▪▫‣⁃∙·∗*–—\\-+○●■□►▸▹➢✓✔])$`, 'u')
const LABEL_FORM = formOf(LABEL_NAME)
const labelText = s => s.normalize('NFKC').toLowerCase().replace(/\s/gu, '')
/**
 * The label's form with the paper's own theorem names beside LABEL_NAME (`names`: source/paper-names.mjs theoremNames, the
 * printed names of the theorem-like environments its files define — thmtools' "Recall", "Notation", a \newtheorem's
 * "Conjecture"), each as a label holds it (NFKC, lower case, no white space); LABEL_FORM where it gives none. A head TeX sets of
 * such a name ("Recall 7 (") is then its unit's label, in its label group, which the layer draws in the paper's name unit's
 * word for it (rules/tex-names.mjs: one word a name, every head of it), where it was left the original's ink (`labelKept`)
 */
export function labelFormOf(names) {
  const own = [...new Set((names ?? []).map(n => labelText(String(n))).filter(n => /\p{L}/u.test(n)))].map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return own.length ? formOf(`(?:${LABEL_NAME}|${own.join('|')})`) : LABEL_FORM
}
/** a head's joint between a babel name and its unit's text, as a label holds it: its punctuation alone */
const JOINT = /^[.:;,\u2013\u2014-]{1,2}$/u
/** (`note`: the label of a theorem's note, a unit the front end read in a head's brackets (latex-front.mjs `bracketed`): the head
 *  macro sets the bracket that opens the note after its name and number, amsthm's "Definition 5.1 (", which is the head's own,
 *  and so the label's) */
export const isLabelForm = (s, note = false, form = LABEL_FORM) => { const t = labelText(s); const u = note ? t.replace(/[([]$/u, '') : t; return u === '' || form.test(u) }

/**
 * Each unit's own ink of a document, by its marks. `pages` (page p at index p - 1): what pageInk read of each page with
 * `indices` — `glyphs` ({ n, k, u, x0, x1, y, size, top, bottom }, stream order), `boxes` (stride 4), `paths` (each box's
 * painted path's place, or its kind: < 0), `points` ({ name, glyph, box }), `boxAt` — and its `view`; a page that was not read
 * is { glyphs: [], boxes: [], paths: [], points: [], boxAt: [] }. `units` the paper's units (their ids their indices; each its
 * source text `src`, else layout/../translate/mt.mjs plainSource of its pieces); `follows` (layout/marks.mjs followsOf over the
 * units and the points' names) where the marking is known, else null; `texts` (a Map, a macro's source -> the text the
 * marking's probe showed it sets: the marks file's `marking.texts`) where known, else null; `inkless` (a Set, the macros TeX
 * said set no ink: the marks file's `marking.inkless`) where known, else null: such a macro is no placeholder of ink, as the
 * maker reads it (make.mjs), so a unit that opens with one (a title's `\\boldmath`) opens with its text; `names` the paper's
 * theorem-like environments' printed names (openPaper's `theoremNames`), each a label's name (labelFormOf), else null.
 * Returns { glyphs, boxes, units, stats }: `glyphs[p - 1][g]`, `boxes[p - 1][b]` the group a page's glyph or painted rule is
 * hidden with, or null; `units` Map id -> { groups: Set, pages: Set, unhidden: a code of UNHIDDEN or null, labelKept }; `stats`
 * { units, unhidden: { marks, across, spell, page: 0, bounds: 0 }, spell: [ids, at most SPELL_LIST_MAX], labelKept }
 */
export function ownOf(pages, { units = null, follows = null, texts = null, inkless = null, names = null } = {}) {
  const form = labelFormOf(names)
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

  /** a placeholder's class, none for a macro TeX said sets no ink (`inkless`, as the maker reads the marking: make.mjs) */
  const inkClassOf = piece => { const c = classOf(piece); return c === 'macro' && inkless?.has(piece.src) ? null : c }
  /** whether a unit's pieces open (before any text but white space) with a placeholder of ink that has no mark of its own */
  function opensUnmarked(u, id) {
    if (!Array.isArray(u?.pieces)) return false
    for (let k = 0; k < u.pieces.length; k++) {
      const piece = u.pieces[k]
      if (piece?.t === 'text') { if (/\S/.test(typeof piece.s === 'string' ? piece.s : '')) return false; continue }
      const c = inkClassOf(piece)
      if (c && c !== 'footnote' && !where.has(`p${id}.${k}a`) && !where.has(`p${id}.${k}b`)) return true
    }
    return false
  }

  // ---- the text of each unit (MR 1–3, 2a)
  const ids = new Set()
  for (const name of where.keys()) { const m = START.exec(name) ?? END.exec(name) ?? OPENING.exec(name) ?? CLOSING.exec(name); if (m) ids.add(Number(m[2])) }
  if (units) units.forEach((_, i) => ids.add(i))
  const textOf = new Map()
  /** the units whose label the walk back from their start reached past a babel name's range (MR 5): their label is that head's joint */
  const afterName = new Set()
  for (const id of [...ids].sort((a, b) => a - b)) {
    const u = unit(id)
    if (work > OWN_WORK) { u.unhidden = 'marks'; continue }
    const S = [`${id}s`, `t${id}s`, `h${id}s`].flatMap(n => where.get(n) ?? []), E = [`${id}e`, `t${id}e`, `h${id}e`].flatMap(n => where.get(n) ?? [])
    let s = S[0] ?? null, e = E[0] ?? null
    if (S.length > 1 || E.length > 1) {
      // (marks TeX set more than once: the unit is its first occurrence where that is an end mark alone and every later one a
      // pair, one start before each end — a title TeX set in vertical mode, where no start mark goes (MR 3), its class setting
      // its text again later in a line, start and end marks both: acmart's ACM Reference Format, 2610.22065v1 p1u0. TeX keeps
      // the first destination of a name, so the layout's is that one too. The later occurrences' ink is the page's. Anything
      // else — a heading again in a running head, every occurrence a pair — is the original's)
      const startsIn = k => S.filter(y => before(y, E[k]) && (k === 0 || before(E[k - 1], y))).length
      if (startsIn(0) !== 0 || S.length !== E.length - 1 || E.some((_, k) => k > 0 && startsIn(k) !== 1)) { u.unhidden = 'marks'; continue }
      s = null
    }
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
    // (a unit's text takes its glyphs and the rules TeX painted on its own lines (MR 2b): OT1's \_, which is a rule and no
    // glyph, an underline, a stroke through; any other box in its range — a footnote's separator above its lines, a box as tall
    // as a letter (an icon), a rule past its lines — is the page's, left standing; a placeholder's are its own, `.p`, claimed
    // over the text's below. MR 3's title takes no box: `list.boxes` is empty there. Their search past OWN_WORK: the unit
    // not owned, as any past it)
    const rules = lineRules(list)
    if (!rules) { u.unhidden = 'marks'; continue }
    textOf.set(id, { s, e })
    claim({ glyphs: list.glyphs, boxes: rules }, `u${id}`, 'u')
  }
  /** the rules TeX painted on the text's own lines (MR 2b): lineRulesOf over the range's glyphs and boxes, its work counted;
   *  null where it would pass OWN_WORK */
  function lineRules(list) {
    const r = lineRulesOf(pages, list.glyphs, list.boxes, OWN_WORK - work)
    work += r.work
    return r.over ? null : r.rules
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
    // (the placeholders the walk passed over, each its unit and the glyphs between its points: not yet claimed, this pass
    // running before the placeholders')
    const passed = []
    for (; qq >= 0; qq--) {
      const X = pg.points[qq]
      for (; g >= X.glyph; g--) glyphAt(g)
      if (END.test(X.name)) break
      const c = CLOSING.exec(X.name), nm = NAME_END.exec(X.name)
      const open = c ? `${c[1]}${c[2]}.${c[3]}a` : nm ? `n${nm[1]}.${nm[2]}.s` : null
      const o = open ? (where.get(open) ?? []).find(([op, oq]) => op === p && oq < qq) : null
      if (o && c) passed.push({ unit: Number(c[2]), from: pg.points[o[1]].glyph, to: X.glyph })
      if (o) { qq = o[1]; g = Math.min(g, pg.points[qq].glyph - 1) }
      // (a babel name passed over: what stands between it and the start is the head's joint, amsthm's "." after "Proof")
      if (o && nm) afterName.add(id)
    }
    if (qq < 0) for (; g >= 0; g--) glyphAt(g)
    if (!lead.glyphs.length) continue
    // a unit that opens with a placeholder of no mark of its own (a paper's macro first in it: \\bert, \\aidehuman): TeX set
    // that placeholder's ink before the start mark, after the label if the unit has one. On a unit's first line nothing but its
    // label and that ink stands between the unit before it and its start (a cell aside: an unmarked number cell may), so the
    // run is split: its longest opening that is a label's form the label, the rest the placeholder's ink (`.p`)
    lead.glyphs.reverse()
    // the closing punctuation a head macro sets after the unit before it, right after that unit's end mark and abutting its
    // last glyph on this line (amsthm's "(Note)." after a theorem's note, a run-in heading's \\@addpunct), is that unit's text:
    // its group hides it where that unit is drawn, as the line's erase did before the wrap (2610.21491v1 p7u71), and no label
    // of this unit's, which would leave it standing under this unit's drawing. Its last glyph is the one right before the
    // punctuation, the unit's text or a placeholder of its set after its end mark (a note that ends in a citation: a heading's
    // marks stand around its text, `\\axthmark{h…e} \\citep{…}`), which the walk back passed over: measured against the end
    // mark's glyph, the ")." after 2610.18513v1 p35's "[Bobkov and Ledoux, 2009b]" stood a citation away and was no one's
    const prev = qq >= 0 ? END.exec(pg.points[qq].name) : null
    if (prev && Number(prev[2]) !== id) {
      const mine = `u${prev[2]}`, L = lead.glyphs[0][1], before = L > 0 ? gOwn[p - 1][L - 1] : null
      const its = before === mine || (before === null && passed.some(x => x.unit === Number(prev[2]) && L - 1 >= x.from && L - 1 < x.to))
      let k = 0, left = its ? pg.glyphs[L - 1] : null
      while (left && k < lead.glyphs.length) {
        const G = pg.glyphs[lead.glyphs[k][1]]
        if (!HEAD_PUNCT.test((G.u ?? '').normalize('NFKC')) || G.x0 - left.x1 >= HEAD_ABUT * Math.max(G.size, left.size) || Math.abs(G.y - left.y) >= 0.5 * Math.max(G.size, left.size)) break
        left = G
        k++
      }
      if (k) { claim({ glyphs: lead.glyphs.slice(0, k) }, mine, 'u'); lead.glyphs = lead.glyphs.slice(k) }
      if (!lead.glyphs.length) continue
    }
    const cell = units?.[id]?.kind === 'cell' || pt(s).name.startsWith('t')
    if (units && !cell && opensUnmarked(units[id], id)) {
      let k = 0
      // (the label ends at a word's end: the next glyph a gap of a fifth of an em or more after it, or none)
      const G = j => pg.glyphs[lead.glyphs[j][1]]
      const wordEnd = j => j === lead.glyphs.length || G(j).x0 - G(j - 1).x1 >= 0.2 * Math.max(G(j).size, G(j - 1).size) || !/\S/.test(G(j).u ?? '')
      for (let j = lead.glyphs.length; j > 0; j--) if (wordEnd(j) && isLabelForm(lead.glyphs.slice(0, j).map(([, i]) => pg.glyphs[i].u ?? '').join(''), units[id]?.bracketed === true, form)) { k = j; break }
      if (k) claim({ glyphs: lead.glyphs.slice(0, k) }, `u${id}.l`, 'l')
      if (k < lead.glyphs.length) claim({ glyphs: lead.glyphs.slice(k) }, `u${id}.p`, 'p')
      continue
    }
    claim(lead, `u${id}.l`, 'l')
  }

  // ---- a cell's lead macro (MR 5b): a cell that opens with a placeholder of no mark of its own (\\CompletionTokenCap{}, \\#,
  // \\bertbase, \\texttt{max\\_tokens}, \\dprime{}) has that ink set before its start mark, on its line, after the point before
  // it. A cell takes no label, and what stands before it on its line may be an unmarked cell's (a number), however close the
  // columns (\\tabcolsep 2pt, @{}): so the placeholder's ink is told by its TEXT alone — the text the marking's probe showed the
  // placeholder sets (`texts`, marks.mjs readInkTexts: "1,024", "max_tokens", a formula's glyph it spells no character of as
  // INK_ANY, one glyph) or a text symbol's (\\# "#") — the glyphs right before the start, in stream order, that spell exactly it
  // (marks.mjs leadStep), none of them CELL_ABUT of an em or more from the next, on the start's line, in its region, in no
  // group. Where the text is not known or the glyphs there are not it, the cell is the original's, as before (leadUnmarked);
  // 2610.21098v1 p13, 2610.21176v1 p13
  const cellLead = new Set()
  /** the text a unit's unmarked lead placeholders set, NFKC with no white space, and its parts in order (each `symbol` where
   *  it is a text symbol's), or null where one is not known — or where a footnote's call stands among them, whose ink would
   *  stand between them and the start, and the text holds INK_ANY, which could be read from that ink */
  const norm = t => t.normalize('NFKC').replace(/\s/gu, '')
  const leadText = (u, id) => {
    let out = '', footnote = false
    const parts = []
    for (let k = 0; k < (u?.pieces?.length ?? 0); k++) {
      const piece = u.pieces[k]
      if (piece?.t === 'text') { if (/\S/.test(typeof piece.s === 'string' ? piece.s : '')) break; continue }
      const c = classOf(piece)
      if (!c) continue
      if (c === 'footnote') { footnote = true; break }
      if (where.has(`p${id}.${k}a`) || where.has(`p${id}.${k}b`)) break
      const sym = symbolText(piece.src), t = texts?.get(piece.src) ?? sym
      if (typeof t !== 'string') return null
      if (norm(t)) parts.push({ text: norm(t), symbol: sym !== null })
      out += t
    }
    out = norm(out)
    if (footnote && out.includes(INK_ANY)) return null
    return out ? { text: out, parts } : null
  }
  for (const [id, { s }] of textOf) {
    if (!s || !units || !(units[id]?.kind === 'cell' || pt(s).name.startsWith('t')) || !opensUnmarked(units[id], id)) continue
    if (work > OWN_WORK) { unit(id).unhidden ??= 'marks'; continue }
    const lead = leadText(units[id], id)
    if (lead === null) continue
    const want = lead.text
    const [p, q] = s, pg = pages[p - 1], S = pt(s), r = at(s), R = regions[p - 1]
    if (S.glyph >= pg.glyphs.length) continue
    const F = pg.glyphs[S.glyph], from = q > 0 ? pg.points[q - 1].glyph : 0
    // (each glyph of the run and the characters of the text it took, a formula's glyph one)
    const run = [], took = []
    let right = F, end = want.length
    work += S.glyph - from
    for (let g = S.glyph - 1; g >= from && end > 0; g--) {
      const G = pg.glyphs[g]
      if (R.glyph[g] !== r || gOwn[p - 1][g] !== null || Math.abs(G.y - F.y) >= 0.5 * Math.max(G.size, F.size)) break
      if (right.x0 - G.x1 >= CELL_ABUT * Math.max(G.size, right.size)) break
      const e = leadStep(want, end, norm(G.u ?? ''))
      if (e < 0) break
      run.push([p, g])
      took.push(end - e)
      end = e
      right = G
    }
    if (end !== 0) continue
    // (each part its own: a text symbol's (\\#) with the text — the layer draws it as its character in the translation, never
    // from a crop, so its ink is hidden whenever the cell is drawn —, a macro's, which the maker finds by the same text and
    // crops, the placeholder's `.p`: a mixed lead all `.p` would leave the "#" under the drawn one)
    run.reverse()
    took.reverse()
    let w = 0
    for (const part of lead.parts) {
      const mine = []
      let n = 0
      while (w < run.length && n < part.text.length) { n += took[w]; mine.push(run[w++]) }
      // (the blank glyphs after a part: its own)
      while (w < run.length && took[w] === 0) mine.push(run[w++])
      if (part.symbol) claim({ glyphs: mine }, `u${id}`, 'u')
      else claim({ glyphs: mine }, `u${id}.p`, 'p')
    }
    cellLead.add(id)
  }

  // ---- the placeholders (MR 4)
  // (the erasure's reading: stream.mjs ownedOf `erasure`, a piece's ink found exactly where the maker's reading leaves it LOST;
  // and the displays units open with, by their start marks, `leads` below)
  const heads = units ? headsOf(units, new Set(where.keys())) : null
  const streamed = follows || heads ? pages.map((pg, i) => streamPage(pg, i)) : null
  const owned = follows ? ownedOf(streamed, { follows, erasure: true, heads }) : null
  // (each page's units whose start and end marks both stand on it: [id, start, end])
  const spansOn = new Map()
  for (const [id, { s, e }] of textOf) if (s && s[0] === e[0]) (spansOn.get(s[0]) ?? spansOn.set(s[0], []).get(s[0])).push([id, s, e])
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
    // (an opening point inside another unit's range, between its start and end marks on one page: TeX set it there out of its
    // unit's order — a run-in \\paragraph's heading is set at the start of the next paragraph, after that paragraph's lead
    // placeholder's opening mark, 2610.21085v1 p5u43 — and what that unit's range holds is that unit's, never this piece's)
    if (e && list.length === 1) {
      const A = list[0], hosts = new Set()
      for (const [other, s, t] of spansOn.get(A[0]) ?? []) if (other !== id && before(s, A) && before(A, t)) hosts.add(other)
      if (hosts.size) {
        const host = g => { if (g === null || g[0] !== 'u') return false; const dot = g.indexOf('.'); return hosts.has(Number(dot < 0 ? g.slice(1) : g.slice(1, dot))) }
        e = { glyphs: e.glyphs.filter(([p, i]) => !host(gOwn[p - 1][i])), boxes: e.boxes.filter(([p, b]) => !host(bOwn[p - 1][b])) }
      }
    }
    if (e) claim(e, `u${id}.p`, 'p')
    // a placeholder whose ink cannot be told apart is in the text's range: hidden with it, it could not be kept in place, and the
    // spell check reads no symbol (=, ×, †): its unit is the original's
    else if (lost && unitOf.has(id) && !unitOf.get(id).unhidden && textOf.has(id)) unit(id).unhidden = 'marks'
  }

  // ---- a footnote's call after the unit's last word that TeX gave no mark (MR 4b): its mark, the raised glyphs right after the
  // unit's end mark, on the end mark's line, in its region, in no group — `u<id>.p`, as the maker finds it (make.mjs besideMarks):
  // 2610.35877v1's abstract ends `step.\footnotemark`, TeX's answer for the call `00000020` (a mark around it moves the word after
  // it), and the "1" its translation draws again stood under it
  for (const [id, { e }] of textOf) {
    const pieces = units?.[id]?.pieces
    if (!e || !Array.isArray(pieces)) continue
    const last = pieces.findLastIndex(q => q.t === 'text' && /\S/.test(typeof q.s === 'string' ? q.s : ''))
    const tails = pieces.map((q, k) => [q, k]).filter(([q, k]) => k > last && classOf(q) !== null)
    if (last < 0 || !tails.length || !tails.every(([q, k]) => q.t === 'ph' && classOf(q) === 'footnote' && !where.has(`n${id}.${k}a`) && !where.has(`n${id}.${k}b`))) continue
    if (work > OWN_WORK) break
    const [p] = e, pg = pages[p - 1], E = pt(e), r = at(e), R = regions[p - 1], L = pg.glyphs[E.glyph - 1]
    if (!L) continue
    const run = []
    let edge = L.x1
    for (let g = E.glyph; g < pg.glyphs.length; g++) {
      const G = pg.glyphs[g]
      work++
      if (R.glyph[g] !== r || gOwn[p - 1][g] !== null || !(G.y - L.y >= RAISED * L.size) || G.y - L.y > L.size || G.x0 - edge > CELL_ABUT * L.size) break
      run.push([p, g])
      edge = G.x1
    }
    if (run.length) claim({ glyphs: run }, `u${id}.p`, 'p')
  }

  // ---- the closing punctuation TeX sets after a unit's end mark (MR 4c): the glyphs right after the mark, on its line, in its
  // region, in no group, each of TAIL_PUNCT right of the glyph before it and within HEAD_ABUT of its own em of it, the first
  // after the unit's own (its text's or a placeholder's): the unit's text, as the maker's line takes them past its end mark
  // (make.mjs lineOf), so that its group hides what the layer draws again after the translation (layer2.mjs tailOf). MR 5 gives
  // them to it where the next unit begins on that line; where the head breaks its line after the note (thmtools' headpunct
  // `\\`), none reached them, and 2501.14787v1 p10's ")" after "Vector Space" stood beside the note's translation drawn with
  // its own. After the labels and the placeholders, so that a mark MR 5 gave a unit or a label stays theirs, and the glyph
  // before it may be a placeholder's
  for (const [id, { e }] of textOf) {
    if (!e || work > OWN_WORK) continue
    const [p] = e, pg = pages[p - 1], E = pt(e), r = at(e), R = regions[p - 1], G = gOwn[p - 1], mine = `u${id}`
    let left = E.glyph - 1
    if (left < 0 || (G[left] !== mine && G[left] !== `${mine}.p`)) continue
    const run = []
    for (let g = E.glyph; g < pg.glyphs.length; g++) {
      const A = pg.glyphs[g], L = pg.glyphs[left]
      work++
      // (right of the glyph before it, as the maker's line takes none left of the end mark, and within the gap at its own size,
      // as the maker's glue is the line's: a placeholder set large before it widens nothing)
      if (R.glyph[g] !== r || G[g] !== null || !TAIL_PUNCT.test(A.u ?? '') || (A.x0 + A.x1) / 2 <= L.x1 || A.x0 - L.x1 >= HEAD_ABUT * A.size || Math.abs(A.y - L.y) >= 0.5 * Math.max(A.size, L.size)) break
      run.push([p, g])
      left = g
    }
    if (run.length) claim({ glyphs: run }, mine, 'u')
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
    const G = gOwn[p - 1]
    for (let i = 0; i < G.length; i++) {
      const g = G[i]
      if (g === null || g[0] !== 'u') continue
      const dot = g.indexOf('.'), id = Number(dot < 0 ? g.slice(1) : g.slice(1, dot))
      const u = unit(id)
      u.groups.add(g)
      u.pages.add(p)
      if (dot < 0) (text.get(id) ?? text.set(id, []).get(id)).push([p, i])
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
    const src = units ? sourceOf(units[id], k => where.has(`p${id}.${k}a`) || where.has(`p${id}.${k}b`), cellLead.has(id)) : null
    if (src !== null && !spells(id, src)) { u.unhidden = 'spell'; spell.push(id); continue }
    const lead = label.get(id)
    if (lead) {
      const chars = lead.map(([p, i]) => pages[p - 1].glyphs[i].u ?? '').join('')
      // the label is no label: its ink left the original's where it stands apart from the text's, else the unit the original
      // (a head's joint after the babel name that leads the unit, its punctuation alone, is a label: the name's lead draws it,
      // run.mjs jointOf; IEEEtran's "—" after "Abstract", amsthm's "." after "Proof")
      if (!isLabelForm(chars, units?.[id]?.bracketed === true, form) && !(afterName.has(id) && JOINT.test(labelText(chars)))) {
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
    // (a title that opens with a placeholder of no mark of its own — \\sysname: before its text — has that ink in this lead,
    // which its source spells as nothing: never released, the title the original's, review of b479095e)
    if (units && opensUnmarked(units[id], id)) return false
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
    text.set(id, rest)
    return true
  }
  /** whether unit id's text glyphs spell its source `src` (sourceOf's): exactly; with a wrapper's own words at its slots
   *  (OPEN_WORDS letters at most, each: siamart's \\funding sets "Funding:" before its argument, 2610.20266v1 p1u0); a title
   *  whose lead TeX set on lines of its own (trimLead); or with lines of their own the source does not spell left the page's
   *  (releaseLines) */
  function spells(id, src) {
    const G = ([p, i]) => pages[p - 1].glyphs[i]
    const ink = (text.get(id) ?? []).map(a => spellOf(G(a).u ?? '')).join('')
    if (ink === src.text || ink === src.bare) return true
    if (src.parts.length > 1 && slotted(src.parts, ink)) return true
    const t = textOf.get(id)
    if (t && !t.s && trimLead(id, src.text)) return true
    return releaseLines(id, src.text)
  }
  /** a unit's lines of glyphs its source does not spell, each on a line of its own, left the page's: what TeX shipped in the
   *  unit's range that is no unit's — REVTeX's e-mail notes at a column's foot in mid-paragraph (2610.21765v1 p1u13), a page's
   *  folio after a footnote that runs on to the next page (2610.10069v1 p7u53). Its lines are its glyphs' runs in stream order
   *  on one page and one baseline; one is released where the source does not go on with its letters, no other line of the
   *  unit stands on its baseline where their extents meet, and every line kept that its extent meets on its page stands above
   *  it; every other line must spell the source in order, whole. A unit
   *  with a visible placeholder of no mark of its own is never released from: that ink, in the text's range, may be such a
   *  line, and would be drawn again over the original's */
  function releaseLines(id, want) {
    if (units && unmarkedPiece(units[id], id)) return false
    const G = ([p, i]) => pages[p - 1].glyphs[i]
    const lines = []
    for (const a of text.get(id) ?? []) {
      const last = lines.at(-1), b = last?.at(-1)
      if (b && b[0] === a[0] && Math.abs(G(b).y - G(a).y) < 0.5 * Math.max(G(b).size, G(a).size)) last.push(a)
      else lines.push([a])
    }
    const box = l => { let x0 = Infinity, x1 = -Infinity; for (const a of l) { x0 = Math.min(x0, G(a).x0); x1 = Math.max(x1, G(a).x1) } return { p: l[0][0], y: G(l[0]).y, size: G(l[0]).size, x0, x1 } }
    const boxes = lines.map(box)
    const alone = k => boxes.every((o, m) => m === k || o.p !== boxes[k].p || Math.abs(o.y - boxes[k].y) >= 0.5 * Math.max(o.size, boxes[k].size) || o.x1 <= boxes[k].x0 || boxes[k].x1 <= o.x0)
    let j = 0
    const released = []
    for (let k = 0; k < lines.length; k++) {
      const t = lines[k].map(a => spellOf(G(a).u ?? '')).join('')
      if (want.startsWith(t, j)) { j += t.length; continue }
      if (!alone(k)) return false
      released.push(k)
    }
    if (j !== want.length || !released.length) return false
    const out = new Set(released)
    // (and each stands below every line kept that its extent meets on its page: a column's foot, a page's — a line of words
    // TeX set above or among the unit's own, a wrapper's heading line, may be in the layout's frame of the unit, and the
    // translation drawn over it)
    const meets = (o, b) => o.p === b.p && o.x0 < b.x1 && b.x0 < o.x1
    for (const k of out) if (boxes.some((o, m) => !out.has(m) && meets(o, boxes[k]) && o.y < boxes[k].y)) return false
    for (const k of out) for (const [p, i] of lines[k]) gOwn[p - 1][i] = null
    text.set(id, lines.filter((_, k) => !out.has(k)).flat())
    return true
  }
  /** whether a unit holds a visible placeholder (a text symbol aside, which sets a letter among the text's) with no mark of its
   *  own */
  function unmarkedPiece(u, id) {
    if (!Array.isArray(u?.pieces)) return false
    return u.pieces.some((piece, k) => {
      const c = inkClassOf(piece)
      if (!c || symbolText(piece.src) !== null) return false
      const n = c === 'footnote' ? 'n' : 'p'
      return !where.has(`${n}${id}.${k}a`) && !where.has(`${n}${id}.${k}b`)
    })
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
  // ---- a display its unit opens with, which the marking passes over (marks.mjs headsOf): TeX ships it between the point before its
  // unit's start mark and that mark (stream.mjs headInk). Its glyphs no group's, the wrap's as before — the layer draws such a
  // display as the original's ink, never erasing it, which a group hidden with its unit's placeholders would — but its unit's
  // placeholders' for the ledger (`leads`: per page, glyph -> `u<id>.p`), so that no ink unit nor kept block is made of it: it is
  // its unit's display, a block of its own in the light map (2501.14787v1 p24u193 had three kept blocks of it)
  const leads = pages.map(() => new Map())
  const found = heads ? owned ?? ownedOf(streamed, { follows: () => null, heads }) : null
  for (const [name, e] of found ?? []) {
    const m = OPENING.exec(name)
    if (!m || where.has(name) || e.how >= OWNED) continue
    for (const [p, g] of e.glyphs) if (gOwn[p - 1][g] === null) leads[p - 1].set(g, `u${m[2]}.p`)
  }
  return { glyphs: gOwn, boxes: bOwn, units: unitOf, leads, stats: { units: unitOf.size, unhidden, spell: spell.slice(0, SPELL_LIST_MAX), labelKept, leaks: { count: leaks.length, units: leaks.slice(0, SPELL_LIST_MAX) } } }
}

/**
 * The painted rules of `boxes` ([page, index] of `pages`' boxes) that stand on a line of `glyphs` ([page, index]): MR 2b's, and
 * an ink unit's (layout/ink-units.mjs claimInk), #117 (1512.03385v1's Table 1 caption, whose three OT1 \_ rules stayed under
 * its translation). A rule: a painted box no thicker than RULE_EM of its line's size and at least twice as long as thick, its
 * middle within half a size of the line's baseline, across within the line's glyphs' extent and half a size past either end,
 * and no part of a frame: no other thin box of `boxes` that is no such rule meets it within its own thickness (amsthm's
 * \openbox, a \fbox: their upright sides; kept whole the page's; a box behind the text, thick both ways, is none). A line:
 * the glyphs on one baseline of a page (a placeholder between them, its runs one line). The work is counted as it is done
 * (each glyph and box read, each line and box compared): past `max` the reading stops, `over`, with no rule (a PDF's
 * content is anyone's: a line of 20,000 rules beside 20,000 thin boxes would be 400 million comparisons). Returns
 * { rules, work, over }
 */
export function lineRulesOf(pages, glyphs, boxes, max = Infinity) {
  let work = boxes.length
  const over = () => ({ rules: [], work, over: true })
  const painted = boxes.filter(([p, b]) => (pages[p - 1].paths[b] ?? -1) >= 0)
  if (!painted.length) return { rules: [], work, over: work > max }
  const lines = []
  let last = null
  for (const [p, g] of glyphs) {
    work++
    const G = pages[p - 1].glyphs[g]
    if (!/\S/.test(G.u ?? '') || !(G.size > 0)) continue
    const on = l => l.p === p && Math.abs(l.y - G.y) < 0.5 * Math.max(l.size, G.size)
    let l = last && on(last) ? last : null
    if (!l) {
      work += lines.length
      if (work > max) return over()
      l = lines.find(on) ?? null
    }
    if (l) { l.x0 = Math.min(l.x0, G.x0); l.x1 = Math.max(l.x1, G.x1); l.size = Math.max(l.size, G.size); last = l; continue }
    last = { p, y: G.y, size: G.size, x0: G.x0, x1: G.x1 }
    lines.push(last)
  }
  const box = ([p, b]) => { const B = pages[p - 1].boxes; return [B[4 * b], B[4 * b + 1], B[4 * b + 2], B[4 * b + 3]] }
  const ruled = new Map()
  let most = 0
  for (const x of painted) {
    work += lines.length
    if (work > max) return over()
    const [x0, y0, x1, y1] = box(x), mid = (y0 + y1) / 2, w = x1 - x0, h = y1 - y0
    const l = lines.find(l => l.p === x[0] && Math.abs(mid - l.y) < 0.5 * l.size && x0 >= l.x0 - 0.5 * l.size && x1 <= l.x1 + 0.5 * l.size && h <= RULE_EM * l.size && w >= 2 * h)
    if (l) { ruled.set(x, l.size); most = Math.max(most, l.size) }
  }
  if (!ruled.size) return { rules: [], work, over: false }
  // (a frame's part: a thin box of the range that is no such rule, thin at the largest size a rule stands at — each rule then
  // asks it at its own)
  const others = painted.filter(o => {
    if (ruled.has(o)) return false
    const [a0, b0, a1, b1] = box(o)
    return Math.min(a1 - a0, b1 - b0) <= RULE_EM * most
  })
  const rules = []
  for (const [x, size] of ruled) {
    work += others.length
    if (work > max) return over()
    const [x0, y0, x1, y1] = box(x), e = y1 - y0
    const framed = others.some(o => {
      if (o[0] !== x[0]) return false
      const [a0, b0, a1, b1] = box(o)
      return Math.min(a1 - a0, b1 - b0) <= RULE_EM * size && a0 <= x1 + e && x0 - e <= a1 && b0 <= y1 + e && y0 - e <= b1
    })
    if (!framed) rules.push(x)
  }
  return { rules, work, over: false }
}

/** the letters a wrapper's own words may take at its slot in the spell check (sourceOf) */
const OPEN_WORDS = 16
/** the steps the slotted reading of one unit may take; past them the unit is not read so (it stays `spell`) */
const SLOT_WORK = 1_000_000
/** whether a unit's letters `ink` are its source's parts in order, a wrapper's slot of at most OPEN_WORDS letters between each
 *  two (a run of empty parts one slot): read by the places each part may end at, a part at a time — bounded by the ink's length
 *  and SLOT_WORK, never a backtracking search (seven \\emph{a} and 51 letters of ink took a regular expression over a
 *  second) */
function slotted(parts, ink) {
  const SLOT = null, tokens = [parts[0]]
  for (let k = 1; k < parts.length; k++) { if (tokens.at(-1) !== SLOT) tokens.push(SLOT); if (parts[k]) tokens.push(parts[k]) }
  let at = new Set([0]), work = 0
  for (const t of tokens) {
    const next = new Set()
    for (const x of at) {
      if (t === SLOT) { for (let w = 0; w <= OPEN_WORDS && x + w <= ink.length; w++) next.add(x + w); work += OPEN_WORDS + 1 }
      else { if (ink.startsWith(t, x)) next.add(x + t.length); work += t.length + 1 }
      if (work > SLOT_WORK) return false
    }
    if (!next.size) return false
    at = next
  }
  return at.has(ink.length)
}

/** a unit's source text for the spell check, as spellOf reads it, in parts: its `src` where it has one, else its pieces' — a
 *  placeholder dropped, but a text symbol of no mark of its own (\\o, \\ss: `marked(k)` false), whose ink TeX set among the
 *  text's, its character (in the unit's lead, before any text, only where `lead`: a cell's lead ink taken with its text; any
 *  other unit's lead ink is its label's or its placeholder's, MR 5); and a slot before each wrapper's argument (an `open`
 *  piece: siamart's \\funding{…}), where the macro may set words of its own. Returns { text, bare, parts: [text before the
 *  first slot, …] } (`bare` the text without the symbols: one whose ink an opening alone before it took, `$x$\\o`, is no
 *  text's), or null where there is none */
function sourceOf(u, marked, lead) {
  if (!u) return null
  if (typeof u.src === 'string') { const t = spellOf(u.src); return { text: t, bare: t, parts: [t] } }
  if (!Array.isArray(u.pieces)) return null
  const parts = ['']
  let opened = false, bare = ''
  u.pieces.forEach((p, k) => {
    if (p?.t === 'text') { const s = typeof p.s === 'string' ? p.s : '', t = spellOf(utf8(s)); parts[parts.length - 1] += t; bare += t; if (/\S/.test(s)) opened = true }
    else if (p?.t === 'open') parts.push('')
    else if (p?.t === 'ph' && !marked(k) && (opened || lead)) { const sym = symbolText(p.src); if (sym !== null) parts[parts.length - 1] += spellOf(sym) }
  })
  return { text: parts.join(''), bare, parts }
}

/** a page as stream.mjs ownedOf reads one: its glyphs' columns (x0, y, size, u) and their count */
function streamPage(pg) {
  const n = pg.glyphs.length
  const x0 = new Float64Array(n), y = new Float64Array(n), size = new Float64Array(n), u = new Array(n)
  pg.glyphs.forEach((g, i) => { x0[i] = g.x0; y[i] = g.y; size[i] = g.size; u[i] = g.u ?? '' })
  return { glyphs: { n, x0, y, size, u }, boxes: pg.boxes, points: pg.points, boxAt: Int32Array.from(pg.boxAt ?? []), view: pg.view ?? [0, 0, 0, 0], paras: pg.paras ?? [] }
}
