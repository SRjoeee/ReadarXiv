// What today's ink makers (ledger.mjs, ink-units.mjs, figure-text.mjs beside this file: copies of src/pdf-reader/engine/layout's at
// abe884b5e, run by locate over arXiv's page) import from today's other modules: each copied as it is from the file and line
// named (abe884b5e), so that the makers read exactly what today's read; held equal to today's by
// tests/pdf-reader/locate-ink-today.test.ts. One change, named where it is: classOf reads the kind the instrument states of a
// piece (today's classOf, which the front half's adapter ran) instead of a source. And regionsOf reads a page's body brackets
// paired by number, nesting where a page's columns are balanced, as today's stream.mjs now reads them (CHANGED with it).
export { classifyFont, familyKeysOf, sameFamily } from '../facts.ts'
export { displayTextMask, PICTURE_END, PICTURE_START, regionMask } from '../../ink.ts'

// ---- layout/stream.mjs:141-149 (spellOf)
const BASE_LETTERS = { ß: 'ss', ı: 'i', ȷ: 'j', ø: 'o', æ: 'ae', œ: 'oe', ł: 'l', đ: 'd', ð: 'd', ħ: 'h', þ: 'th', ŋ: 'n', ς: 'σ' }
export const spellOf = s => s.normalize('NFKD').replace(/[\p{M}ˆˇ˘-˝]/gu, '').toLowerCase().replace(/[ßıȷøæœłđðħþŋς]/g, c => BASE_LETTERS[c]).replace(/[^\p{L}\p{N}]/gu, '')

// ---- layout/stream.mjs:45, 152, 187-214 (columnsAt, regionsOf; CHANGED with today's: the body brackets paired by number)
const BRACKET = /^([bf])([se])(\d+)$/
const code = (body, depth) => depth * 2 + (body ? 1 : 0)
export function columnsAt(page) {
  let two = false
  for (const pt of page.points ?? []) { const m = /^c([12])-\d+$/.exec(pt.name); if (m) two = m[1] === '2' }
  if (!two) return () => 0
  const v = page.view ?? [0, 0, 0, 0], mid = (v[0] + v[2]) / 2
  return (x0, x1) => (x0 < mid - 4 && x1 > mid + 4 ? 2 : (x0 + x1) / 2 >= mid ? 1 : 0)
}
export function regionsOf(page) {
  const { glyphs, points } = page, nBoxes = page.boxes.length / 4
  const glyph = new Int32Array(glyphs.n), box = new Int32Array(nBoxes), at = new Int32Array(points.length)
  let body = false, depth = 0, bodies = false
  const open = new Set()
  const apply = name => {
    const m = BRACKET.exec(name)
    if (!m) return
    if (m[1] === 'b') {
      if (m[2] === 's') open.add(m[3])
      else open.delete(m[3])
      body = open.size > 0
      bodies = true
    } else depth = m[2] === 's' ? depth + 1 : Math.max(0, depth - 1)
  }
  for (let q = 0, g = 0; g <= glyphs.n; g++) {
    while (q < points.length && points[q].glyph <= g) { apply(points[q].name); at[q] = code(body, depth); q++ }
    if (g < glyphs.n) glyph[g] = code(body, depth)
  }
  body = false; depth = 0; open.clear()
  for (let q = 0, b = 0; b < nBoxes; b++) {
    while (q < points.length && points[q].box <= b) apply(points[q++].name)
    box[b] = code(body, depth)
  }
  return { glyph, box, at, bodies }
}

// ---- own/own.ts OWN_WORK, RULE_EM and lineRulesOf, their home's own (the glyphs and boxes a paper's ownership may visit, a
// rule's thickness in its line's size, the rules TeX painted on a text's lines): no copy is kept of a home that is typed
export { lineRulesOf, OWN_WORK, RULE_EM } from '../../own/own.ts'

// ---- source/latex-front.ts EMAIL_ADDRESS and ADDRESS_GROUP, their home's own (an e-mail address as a text writes it,
// keepAddresses'; several at one domain written once, keepGroups'): no copy is kept of a home that is typed
export { ADDRESS_GROUP, EMAIL_ADDRESS } from '../../source/latex-front.ts'

// ---- source/latex-front.ts identifiersIn, its home's own (each identifier of a text; keepIdentifiers'): no copy is kept of a
// home that is changed or typed
export { identifiersIn } from '../../source/latex-front.ts'

// ---- layout/file.mjs:255 (UNIT_FLAG)
export const UNIT_FLAG = Object.freeze({ TITLE: 1, FRONT: 2, CENTRED: 4, FLUSH_LEFT: 8, FLUSH_RIGHT: 16, JUSTIFIED: 32 })

// ---- layer-proto/figure-rows.mjs:37 (BAND_MAX)
export const BAND_MAX = 4

// ---- instrument/mt.ts utf8, its home's own (no copy is kept of a home that is typed)
export { utf8 } from '../../instrument/mt.ts'

// ---- layout/marks.mjs:72-94 (classOf), the one change: a piece's class is the instrument's (the front half's adapter ran today's
// classOf over its source: an element's kind, `other` where classOf said none), and of an ink unit's own placeholder (its kept
// run's characters, ink-units.mjs phSource: `$…$` or `\url{…}`) today's classOf's answer for those two forms: a formula of no
// character `$$`, DISPLAY (translate/mt.mjs:89), which the copy's phSource never writes (a run has a character, and a `$` of it
// is written `\$`); any other `$…$`, MATH; `\url{…}`, URL. Nothing else reads it
/** the kinds the adapter states where today's classOf names none: `other`, and a tie's `space` and a forced break's `break` (both
 *  INVISIBLE to today's classOf; stated since lane fig-cut, 2026-11-10) */
const NONE = new Set(['other', 'space', 'break'])
export function classOf(piece) {
  if (piece?.t === 'nested') return 'footnote'
  if (piece?.t !== 'ph') return null
  if (typeof piece.kind === 'string') return NONE.has(piece.kind) ? null : piece.kind
  const src = piece.src ?? ''
  return src.startsWith('$$') ? 'display' : src.startsWith('$') ? 'math' : /^\\url(?![A-Za-z@])/.test(src) ? 'url' : 'macro'
}
