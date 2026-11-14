// What today's ink makers (ledger.mjs, ink-units.mjs, figure-text.mjs beside this file: copies of src/pdf-reader/engine/layout's at
// abe884b5e, run by locate over arXiv's page) import from today's other modules: each copied as it is from the file and line
// named (abe884b5e), so that the makers read exactly what today's read; held equal to today's by
// tests/pdf-reader/locate-ink-today.test.ts. One change, named where it is: classOf reads the kind the instrument states of a
// piece (today's classOf, which the front half's adapter ran) instead of a source. And regionsOf reads a page's body brackets
// paired by number, nesting where a page's columns are balanced, as today's stream.mjs now reads them (CHANGED with it). What the
// makers import of typed homes they import from there (facts.ts's classifyFont, familyKeysOf, sameFamily; ink.ts's
// displayTextMask, PICTURE_END, PICTURE_START, regionMask); a copy here goes when its home is typed, a re-export of it first.

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

// ---- layout/own.mjs:64, 73, 773-835 (OWN_WORK, RULE_EM, lineRulesOf)
export const OWN_WORK = 20_000_000
export const RULE_EM = 0.1
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

// ---- source/latex-front.mjs EMAIL_ADDRESS (an e-mail address as a text writes it, keepAddresses'), held equal to it by
// tests/pdf-reader/locate-ink-today.test.ts
export const EMAIL_ADDRESS = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/
// ---- source/latex-front.mjs ADDRESS_GROUP (several addresses at one domain written once, a group of their local parts before
// it, keepGroups'), held equal to it by tests/pdf-reader/locate-ink-today.test.ts
export const ADDRESS_GROUP = /(?<![\w.+-])(?:\{[\w.+-]+(?:(?:\s*,\s*|\s+)[\w.+-]+)*\}|\([\w.+-]+(?:(?:\s*,\s*|\s+)[\w.+-]+)*\)|\[[\w.+-]+(?:(?:\s*,\s*|\s+)[\w.+-]+)*\])@[\w-]+(?:\.[\w-]+)+/

// ---- source/latex-front.mjs identifiersIn (each identifier of a text: a token with no white space holding two letters or digits
// joined by underscores, whole, its leading and trailing sentence punctuation aside; keepIdentifiers'), with SNAKE and PAIRS, held
// equal to it by tests/pdf-reader/locate-ink-today.test.ts
const SNAKE = /[^\W_]_+[^\W_]/
/** an opening and a closing bracket of a pair a token may hold (`host_label(result)`, `[sentence_1]`, `{root_question}`) */
const PAIRS = { '(': ')', '[': ']', '{': '}' }
/** Each identifier of a text (a reading of a unit's pieces, or an ink word's characters), its [start, end) code units: a token, a
 *  run of characters with no white space (nor U+0000, which stands for what no character of a text is: a command, a group's
 *  edge), that holds an identifier's mark (SNAKE), the whole token: `CallbackBase.host_label(result)`, `test_parser.py`,
 *  `--view_range`, `response_equal_human_example`. Its leading and trailing sentence punctuation is none of it: from its end a
 *  stop, a comma, a semicolon, a colon, an exclamation or a question mark and a quote (`'` `"` `` ` `` and every closing one,
 *  Pf), from its start a quote (every opening one, Pi); and a bracket at either edge that no bracket of its pair inside the token
 *  answers (`(see conv5_x)` the `)` of a parenthesis the sentence opened; `[sentence_1]` and `host_label(result)` keep theirs),
 *  another opening or closing bracket at its edge too (Ps, Pe). Its syntax alone: no word list, no camelCase, nothing dotted
 *  without an underscore ("e.g." is prose). The source's (keepIdentifiers), an ink unit's word's (packages/engine's copy of
 *  ink-units.mjs, addressed) and a figure text's (locate's ink.ts): the copy held equal to this by
 *  tests/pdf-reader/locate-ink-today.test.ts */
export function identifiersIn(s) {
  const out = []
  const answered = (t, at, step) => {
    // (whether the bracket at `at` of `t` has its pair inside t, walking `step` from it: depth by its own pair alone)
    const c = t[at], open = step > 0 ? c : Object.keys(PAIRS).find(k => PAIRS[k] === c), close = PAIRS[open]
    if (!close) return false
    let depth = 0
    for (let i = at; i >= 0 && i < t.length; i += step) {
      if (t[i] === (step > 0 ? open : close)) depth++
      else if (t[i] === (step > 0 ? close : open) && --depth === 0) return true
    }
    return false
  }
  // (the tokens: runs of characters that are no white space and no U+0000)
  const tokens = []
  for (let i = 0; i < s.length; ) {
    while (i < s.length && (s[i] === '\u0000' || /\s/u.test(s[i]))) i++
    const at = i
    while (i < s.length && s[i] !== '\u0000' && !/\s/u.test(s[i])) i++
    if (i > at) tokens.push([at, i])
  }
  for (const [a0, b0] of tokens) {
    if (!SNAKE.test(s.slice(a0, b0))) continue
    let a = a0, b = b0
    for (;;) {
      const t = s.slice(a, b), last = t.at(-1), first = t[0]
      if (/[.,;:!?'"`\p{Pf}]/u.test(last) || (/\p{Pe}/u.test(last) && !answered(t, t.length - 1, -1))) b--
      else if (/['"`\p{Pi}]/u.test(first) || (/\p{Ps}/u.test(first) && !answered(t, 0, 1))) a++
      else break
    }
    if (SNAKE.test(s.slice(a, b))) out.push([a, b])
  }
  return out
}

// ---- layout/file.mjs:255 (UNIT_FLAG)
export const UNIT_FLAG = Object.freeze({ TITLE: 1, FRONT: 2, CENTRED: 4, FLUSH_LEFT: 8, FLUSH_RIGHT: 16, JUSTIFIED: 32 })

// ---- layer-proto/figure-rows.mjs:37 (BAND_MAX)
export const BAND_MAX = 4

// ---- translate/mt.mjs:28, 31-34 (utf8)
const latin1Bytes = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff; return b }
const DECODER = new TextDecoder()
const ASCII = /^[\t\n\r -~]*$/
export const utf8 = s => (ASCII.test(s) ? s : DECODER.decode(latin1Bytes(s)))

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
