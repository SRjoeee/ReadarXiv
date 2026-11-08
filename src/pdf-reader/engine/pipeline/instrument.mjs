// TRANSITION CODE (the rebuild's stage 1a; stage 1c deletes it with today's front end): the one adapter from today's front end,
// marks and compile outputs to the prepare's seam, the Instrument (packages/engine/src/instrument.ts). The only code that knows
// today's shapes on the back half's side. What it reads is what wrapFinal reads before it wraps (layout/wrap-final.mjs): our
// marked final pass B read once by the engine package's readPdf (pageInk with the wrap's options: the same pages wrapFinal
// reads), each glyph's and rule's owner by today's ownership of the source units (own.mjs by the marks' points), and TeX's
// statements in the marked compile's log (the units' alignments, \lineskip). It writes nothing and wraps nothing: the back half
// carries the ownership onto arXiv's page. It states source units alone: the ink units, kept blocks and figure texts (today's
// ledger, ink-units.mjs, figure-text.mjs) are made by the back half's locate on arXiv's page, of the glyphs no source unit owns
// there (packages/engine/src/locate/ink.ts), from B's marks the Doc carries (its points and DocPage.marks).
//
// The units, in today's bundle's order, so that a unit's index is today's id: the paper's source units, its names (cleveref's
// and the counters' words, kind `name`); then one unit for each babel name's key that occurs (kind `name`, `name` its key:
// drawn in the target's word, never translated). Each unit's content is today's pieces typed: a text, an element (`el`, its kind marks.mjs classOf's,
// `other` for an invisible one), a group's open and close as a span (its style read off its command, a link's `must`), a nested
// unit; strings as Unicode (today's engine holds them as UTF-8 bytes read latin1), its id format's unitId.
import { linkTargetOf, ownersOf, readPdf, ROLE, runIns, unitId } from '@readarxiv/engine'
import { classOf, followsOf, headEnd, leadStep, readAlign, readColours, readSkipProbe } from '../layout/marks.mjs'
import { ownOf } from '../layout/own.mjs'
import { columnsAt } from '../layout/stream.mjs'
import { bundleUnitsOf } from '../layer-proto/units.mjs'
import { phClass, texToText } from '../layer-proto/layer1.mjs'
import { textPieceOf } from '../rules/text-piece.mjs'
import { symbolText } from '../rules/text-symbols.mjs'

const UTF8 = new TextDecoder('utf-8')
/** a unit's start point and end point (MARK_DEF's `<i>s`/`<i>e`, a heading's `h<i>…`, a cell's `t<i>…`), by unit index */
const START_POINT = /^[ht]?(\d+)s$/
const END_POINT = /^[ht]?(\d+)e$/
/** a string as today's engine holds it (UTF-8 bytes read latin1) as Unicode; a string that is already wide as it is */
export function unicodeOf(s) {
  if (typeof s !== 'string') return ''
  let ascii = true
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c > 0xff) return s
    if (c > 0x7f) ascii = false
  }
  if (ascii) return s
  const b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i)
  return UTF8.decode(b)
}

/** a group's style, read off its command: what today's front end leaves to the reader's regex tables (transition) */
const SPAN_STYLES = [
  [/^\\(?:textbf|bfseries|bf|mathbf|boldsymbol)\b/, 'bold'],
  [/^\\(?:textit|itshape|it|emph|em|textsl|slshape|sl)\b/, 'italic'],
  [/^\\(?:texttt|ttfamily|tt|verb|lstinline)\b/, 'mono'],
  [/^\\(?:textsc|scshape)\b/, 'sc'],
  [/^\\(?:href|url|hyperlink|hyperref)\b/, 'link'],
  [/^\\(?:textcolor|color|colorbox)\b/, 'colour'],
  [/^\\(?:underline|uline)\b/, 'underline'],
]
const styleOf = src => SPAN_STYLES.find(([re]) => re.test((src ?? '').trimStart()))?.[1] ?? 'other'

/** today's flat pieces ([open … close] pairs) as nested ones: an open starts a span, a close ends the innermost; a close with no
 *  open wraps what came before it at its level (the group began before the unit), an open left at the end has no close; its
 *  run-in labels `must` (runIns) */
export function contentOf(pieces, { kindOf = () => 'other', idOfNested = () => null } = {}) {
  let level = []
  const stack = []
  pieces.forEach((p, k) => {
    const id = String(k)
    switch (p.t) {
      case 'text': level.push({ t: 'text', s: unicodeOf(p.s) }); break
      case 'ph': level.push({ t: 'el', id, kind: kindOf(p) ?? 'other', src: unicodeOf(p.src) }); break
      case 'nested': level.push({ t: 'unit', id, unit: idOfNested(p.unit) ?? '0'.repeat(64), pre: unicodeOf(p.pre), post: unicodeOf(p.post) }); break
      case 'open': {
        const style = styleOf(unicodeOf(p.src))
        const span = { t: 'span', id, style, ...(style === 'link' ? { must: 1 } : {}), open: unicodeOf(p.src), content: [] }
        level.push(span)
        stack.push({ outer: level, span })
        level = span.content
        break
      }
      case 'close': {
        const top = stack.pop()
        if (top) { top.span.close = unicodeOf(p.src); level = top.outer } else level = [{ t: 'span', id, style: 'other', close: unicodeOf(p.src), content: level }]
        break
      }
      default: throw new Error(`a piece the front end does not make (${String(p.t).slice(0, 20)})`)
    }
  })
  // (its run-in labels `must`, as the source reader states them: packages/engine/src/marks/run-ins.ts)
  return runIns(stack.length ? stack[0].outer : level)
}

// ---- today's reader's reading of an element's source: layer2.mjs texToText2, phClass2, textSymbol and phClassProven copied as they are (L2:273-338 at
// 065c1d973; layer2.mjs builds a canvas as it loads, which no Node run of the prepare has), held equal to them by
// tests/pdf-reader/instrument-classes.test.ts
/** a placeholder's source as plain text, its environment, label and alignment marks left out (iteration 1's texToText
 *  gave "equationeq:identity y= F(x, Wi) + x. equation" for a displayed equation, which no rendering resembles) */
const MORE_SYMBOLS = { downarrow: '↓', uparrow: '↑', Downarrow: '⇓', Uparrow: '⇑', leftrightarrow: '↔', longrightarrow: '⟶', dagger: '†', ddagger: '‡', varnothing: '∅', emptyset: '∅', ell: 'ℓ', prime: '′', bullet: '•', checkmark: '✓', triangle: '△', square: '□', blacksquare: '■', diamond: '◇', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', hbar: 'ℏ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', wedge: '∧', vee: '∨', neg: '¬', lnot: '¬', setminus: '∖', subsetneq: '⊊', supset: '⊃', supseteq: '⊇', ni: '∋', perp: '⊥', parallel: '∥', angle: '∠', models: '⊨', vdash: '⊢', gg: '≫', ll: '≪', equiv: '≡', cong: '≅', asymp: '≍', doteq: '≐', bigcup: '⋃', bigcap: '⋂', oint: '∮', iint: '∬', coloneqq: '≔', mapsto: '↦', leadsto: '⇝', circledast: '⊛', textdagger: '†', textbullet: '•', S: '§', P: '¶' }
const ACCENTS = { '~': '\u0303', "'": '\u0301', '"': '\u0308', '`': '\u0300', '^': '\u0302', '=': '\u0304', '.': '\u0307', u: '\u0306', v: '\u030C', H: '\u030B', c: '\u0327', k: '\u0328', r: '\u030A' }
/** (an alignment tab goes, not an escaped ampersand: "Vinyals \& Kaiser" drew as "Vinyals \ Kaiser", 2026-10-07; a LaTeX
 *  text symbol, alone or before an empty group, is its character, the maker's table's: rules/text-symbols.mjs) */
function texToText2(src) {
  const own = symbolText(src)
  if (own !== null) return own
  // an accent over its letter, composed: \~{n} is "ñ", \"u "ü"
  const acc = src.replace(/\\([~'"`^=.]|[uvHckr](?![A-Za-z]))\s*\{?\\?([A-Za-z])\}?/g, (m, a, l) => `${l}${ACCENTS[a]}`.normalize('NFC'))
  if (acc !== src) return texToText2(acc)
  const sym = src.replace(/\\([A-Za-z]+)\b/g, (m, name) => (MORE_SYMBOLS[name] ? MORE_SYMBOLS[name] : m))
  if (sym !== src) return texToText2(sym)
  const bare = src.replace(/\\(?:begin|end)\{[^}]*\}(?:\{[^}]*\})?/g, ' ').replace(/\\(?:label|tag)\*?\{[^}]*\}/g, ' ').replace(/\\(?:nonumber|notag)\b/g, ' ').replace(/\\\\/g, ' ').replace(/(?<!\\)&/g, ' ')
  return bare === src ? texToText(src) : texToText(bare.trim())
}
/**
 * phClass, with the paper's own macros told apart: a command no table knows (\bert, \oursfull{}, $\dmodel$, $\cla$) has
 * no plain text, which iteration 1 called a symbol and drew as nothing, though the page renders it ("BERT",
 * "ImageNet", "d_model"): 'umacro' for one in text (drawn as the page's text), 'other' with `unknown` for one in math
 * (a crop). Its rendering is looked for on the page like any other.
 */
const STRUCTURAL = new Set(['sqrt', 'frac', 'dfrac', 'tfrac', 'left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'mathrm', 'mathbf', 'mathit', 'mathsf', 'mathtt', 'mathcal', 'mathbb', 'mathfrak', 'boldsymbol', 'bm', 'text', 'textrm', 'textbf', 'textit', 'mbox', 'hbox', 'operatorname', 'hat', 'widehat', 'tilde', 'widetilde', 'bar', 'overline', 'underline', 'vec', 've', 'dot', 'ddot', 'limits', 'nolimits', 'displaystyle', 'textstyle', 'scriptstyle', 'begin', 'end', 'label', 'nonumber', 'notag', 'quad', 'qquad'])
/** whether a source holds a command no table renders (a paper's own: \dmodel in $\sqrt{\dmodel}$) */
const unknownCommand = src => (src.match(/\\([A-Za-z]+)/g) ?? []).some(m => !STRUCTURAL.has(m.slice(1)) && !texToText2(m) && !texToText2(`$${m}$`))
function phClass2(src) {
  const c = phClass(src)
  // a symbol's source that holds a paper's own macro is looked for on the page (iteration 2 drew "√(" for
  // $\sqrt{\dmodel}$, the macro being nothing to it)
  if (c === 'symbol' && texToText2(src) && /^\$|^\\\(/.test(src) && unknownCommand(src)) return { cls: 'other', unknown: true }
  if (c !== 'symbol' || texToText2(src)) return { cls: c }
  const inner = src.replace(/^\$+|\$+$/g, '').replace(/^\\\(|\\\)$/g, '').trim()
  if (!inner) return { cls: 'zero' }
  const ci = phClass(inner)
  if (ci === 'zero' || ci === 'space') return { cls: ci }
  if (!/\\[A-Za-z]/.test(inner)) return { cls: c }
  return /^\$|^\\\(/.test(src) ? { cls: 'other', unknown: true } : { cls: 'umacro', unknown: true }
}
/** a 'symbol' placeholder's drawn text (resolvePlaceholders): its source's plain text, less the mark of the superscript
 *  it is drawn as; a LaTeX text symbol's character as it is (\textasciicircum's caret is no such mark) */
const symbolDrawn = src => symbolText(src) ?? texToText2(src).replace(/^\^\(?|\)$/g, '')
const GRAPHEMES = new Intl.Segmenter('en', { granularity: 'grapheme' })
/** a text's graphemes, each a string: what a reader sees as one character */
const graphemesOf = t => Array.from(GRAPHEMES.segment(t), g => g.segment)
/**
 * Whether a placeholder of phClass2's 'symbol' (no Latin letter or digit in its rendering) is a text symbol, the one
 * kind the file's crops exempt (tex.mjs cropsOf): its drawn text one grapheme (\%, \_, $\times$, $^\dagger$), and a formula's
 * holding none of the marks texToText2 writes for a formula's structure, `_`, `^`, `/` or `√(` (a text source's one
 * grapheme is that character: \_ is the maker's TEXT symbol too, marks.mjs TEXT_SYMBOLS). Any other is a formula the page
 * sets as ink of its own ($\sum_{\alpha}^{\beta}$ drawn "Σ_α^β", $\int_{-\infty}^{\infty}$ "∫_(-∞)^∞",
 * $\frac{\alpha}{\beta}$ "α/β"), which the file must find like any formula: phClassProven's 'other' (the controller's
 * ruling of 2026-10-15)
 */
function textSymbol(src) {
  const t = symbolDrawn(src)
  if (/^\$|^\\\(/.test(src) && /[_^/]|√\(/.test(t)) return false
  return [...GRAPHEMES.segment(t)].length === 1
}
/** phClass2 as the layer reads a unit's placeholders: a 'symbol' that is no text symbol (textSymbol) is 'other', a formula
 *  the layout file must hold */
function phClassProven(src) {
  const c = phClass2(src)
  return c.cls === 'symbol' && !textSymbol(src) ? { cls: 'other' } : c
}

// ---- what the typesetter's rules read of a piece's source besides its class (the rest of today's reads of `src`: tokensOf2's
// glue, style commands and links L2:2406-2620, U.breaks' forced breaks TEX:84, U.rename's citation notes L2:1279, U.elements'
// macros learnt by their source L2:1382), stated as facts so that the part carries them and no rule reads a source; glueOf,
// FORCED_BREAK and the note's reading copied from today's as they are, held equal to them by tests/pdf-reader/instrument-classes.test.ts
const DIMEN = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(pt|bp|mm|cm|in|pc|dd|cc|sp|em)$/
const BP = { pt: 72 / 72.27, bp: 1, mm: 72 / 25.4, cm: 72 / 2.54, in: 72, pc: (12 * 72) / 72.27, dd: ((1238 / 1157) * 72) / 72.27, cc: ((12 * 1238) / 1157 * 72) / 72.27, sp: 72 / 72.27 / 65536 }
const KERNS = { '\\enspace': 0.5, '\\thinspace': 1 / 6, '\\,': 1 / 6, '\\:': 2 / 9, '\\;': 5 / 18 }
const SKIPS = { '\\quad': 1, '\\qquad': 2 }
/** explicit glue, as TeX sets it (layer2.mjs glueOf L2:2406): { em } or { bp }, and whether a line may break at it */
export function glueOf(src) {
  if (Object.hasOwn(KERNS, src)) return { em: KERNS[src], brk: false }
  if (Object.hasOwn(SKIPS, src)) return { em: SKIPS[src], brk: true }
  const m = /^\\(hspace\*?|hskip|kern)\s*(?:\{\s*([^{}]*?)\s*\}|([^{}\\]*?))\s*$/.exec(src)
  if (!m) return null
  const len = (m[2] ?? m[3] ?? '').replace(/\s+(?:plus|minus)\s.*$/, '').trim()
  const d = DIMEN.exec(len)
  if (!d || !(Number(d[1]) > 0)) return null
  const brk = m[1] !== 'kern'
  return d[2] === 'em' ? { em: Number(d[1]), brk } : { bp: Number(d[1]) * BP[d[2]], brk }
}
/** a forced break's source (tex.mjs:84 FORCED_BREAK) */
export const FORCED_BREAK = /^\\\\\*?(?:\[[^\]]*\])?$|^\\newline$/
/** a citation's note: its last optional argument, its ties and control spaces a space, where it holds a letter (layer2.mjs
 *  renameRefs' CITE_NOTE L2:1279-1305) */
const CITE_NOTE = /^\\(?:cite[a-z]*|parencite|textcite|autocite)\*?((?:\s*\[[^\]]*\])+)\s*\{/
export function noteOf(src) {
  const m = CITE_NOTE.exec(src)
  if (!m) return null
  const last = [...m[1].matchAll(/\[([^\]]*)\]/g)].at(-1)
  const note = last?.[1]?.replace(/~|\\[ ,]/g, ' ').replace(/\s+/g, ' ').trim()
  return note && /\p{L}/u.test(note) ? note : null
}
/** the command a source begins with (its name and its star), and whether the source is that command alone (a declaration:
 *  tokensOf2's switch, /^\\[A-Za-z]+$/) */
export function commandOf(src) {
  const m = /^\\([A-Za-z]+\*?)/.exec(src)
  return m ? { cmd: m[1], ...(/^\\[A-Za-z]+$/.test(src) ? { bare: true } : {}) } : null
}
/** what a piece's source tells the rules besides its class: its glue, its command, a forced break, a citation's note, an
 *  earlier piece of the unit with the same source (`same`: the source's identity, which U.elements' macros are learnt by),
 *  and the fill TeX set its run in (a colour piece's, readColours: `colours` by piece index) */
function sourceFactsOf(src, k, first, colours) {
  const x = {}
  const g = glueOf(src)
  if (g) x.glue = g.em !== undefined ? [g.em, 'em', ...(g.brk ? [1] : [])] : [g.bp, 'bp', ...(g.brk ? [1] : [])]
  const c = commandOf(src)
  if (c) Object.assign(x, c)
  if (FORCED_BREAK.test(src)) x.brk = true
  const note = noteOf(src)
  if (note !== null) x.note = note
  const f = first.get(src)
  if (f === undefined) first.set(src, String(k))
  else x.same = f
  if (colours?.has(k)) x.colour = colours.get(k)
  return x
}
/** each group's facts by its open piece's id: the command its open begins with, the fill TeX set its run in, and a link
 *  group's target where its source names it (the engine's linkTargetOf: an \href's or a \url's address, a \hyperlink's
 *  destination), which the typesetter pairs the group's translation with its annotations by */
export function spansOf(pieces, colours = null) {
  const out = []
  pieces.forEach((p, k) => {
    if (p.t !== 'open') return
    const c = commandOf(unicodeOf(p.src))
    const to = linkTargetOf(pieces, k)
    const x = { ...(c ? { cmd: c.cmd } : {}), ...(colours?.has(k) ? { colour: colours.get(k) } : {}), ...(to ? { to } : {}) }
    if (Object.keys(x).length) out.push([String(k), x])
  })
  return out
}

/** each element's class as today's reader reads its source (layer2.mjs phClassProven, its symbol phClass2's; texToText2, its copy text; a symbol's drawn
 *  text and raise, resolvePlaceholders L2:1395-1403; a footnote's mark, L2:1404): what the part states of it, by piece id;
 *  and what the rest of the rules read of its source (sourceFactsOf), `colours` the unit's colour pieces' fills by index */
export function classesOf(pieces, colours = null, texts = null) {
  const out = []
  const first = new Map()
  pieces.forEach((p, k) => {
    // (a nested unit: its mark a footnote mark's, placeholdersOf L2:1066)
    if (p.t === 'nested') { out.push([String(k), { cls: 'num', copy: texToText2('\\footnotemark') || '', mark: true, nested: true }]); return }
    if (p.t !== 'ph') return
    const src = unicodeOf(p.src)
    // (the placeholder's class, placeholdersOf L2:1065: phClassProven, a symbol that is no text symbol a formula; its
    // drawing as a symbol, `sym`, where phClass2 reads it as one: the tokens' class, cls2)
    const c = phClassProven(src), copy = texToText2(src) || ''
    const x = { cls: c.cls, ...(c.unknown ? { unknown: true } : {}), ...(copy ? { copy } : {}) }
    if (phClass2(src).cls === 'symbol') {
      const own = symbolText(src)
      x.sym = own !== null ? [own] : [copy.replace(/^\^\(?|\)$/g, ''), ...(/^\$?\^/.test(src.replace(/^\$/, '')) || /^\^/.test(copy) ? [true] : [])]
    }
    if (/^\\footnotemark/.test(src)) x.mark = true
    // (a text piece, TeX setting its characters as written: a code or URL mark, a plain-text source; no formula, drawnAs
    // L2:1778 formulaOf)
    if (textPieceOf(src)) x.literal = true
    // (a text macro's text, the marking's probe's: what TeX sets for it (the marks file's `texts`), which today's reader finds
    // its rendering by among the unit's characters where the macro's glyphs are the unit's text (no points of its own))
    const t = (c.cls === 'macro' || c.cls === 'umacro') && texts ? (texts.get(p.src) ?? texts.get(src)) : undefined
    if (typeof t === 'string' && /\S/.test(t)) x.text = t
    Object.assign(x, sourceFactsOf(src, k, first, colours))
    out.push([String(k), x])
  })
  return out
}

/** the piece of each `.p` glyph (and rule): the innermost placeholder point `p<u>.<k>a` of its unit open before it on its page,
 *  else the last one opened (spike S1's rule), by the glyphs' (or boxes') counts the points carry. A unit's start point closes
 *  every point of its own opened before it: a head piece's (marks.mjs \\axthpk), whose ink ends where the unit's text begins */
function piecesByPoints(points, count, groupAt, by) {
  const out = new Int32Array(count).fill(-1)
  const open = new Map(), last = new Map()
  let q = 0
  for (let j = 0; j <= count; j++) {
    while (q < points.length && points[q][by] <= j) {
      const m = /^[pn](\d+)\.(\d+)([ab])$/.exec(points[q].name), s = START_POINT.exec(points[q].name)
      if (s) open.delete(Number(s[1]))
      if (m) {
        const u = Number(m[1]), k = Number(m[2])
        const st = open.get(u) ?? []
        if (m[3] === 'a') { st.push(k); open.set(u, st); last.set(u, k) } else { const x = st.lastIndexOf(k); if (x >= 0) st.splice(x, 1) }
      }
      q++
    }
    if (j === count) break
    const g = groupAt(j)
    if (!g || !g.endsWith('.p')) continue
    const u = Number(/^u(\d+)/.exec(g)?.[1])
    const st = open.get(u)
    out[j] = st?.length ? st.at(-1) : last.get(u) ?? -1
  }
  return out
}

/** a text as a lead is spelled by its glyphs, as today's maker finds a head piece (make.mjs besideMarks, charsOf): NFKC, in
 *  lower case, white space out. Case aside: faked small capitals set the source's lowercase letters as capitals, which the
 *  page's text reads as such (2608.06701v1's \\textsc{LivePlan} "LIVEPLAN") */
const leadNorm = t => t.normalize('NFKC').toLowerCase().replace(/\s/gu, '')
/** a unit's lead as own.mjs reads it (MR 5b's leadText): its pieces of ink before its first text, up to a footnote's call or a
 *  piece with a point of its own, each with the text the probe showed it sets (a text symbol's, its character); null where one's
 *  text is not known. Its macros alone, in order: own.mjs gives a text symbol's glyphs the unit's text */
function leadParts(u, id, texts, names) {
  const parts = []
  const pieces = u?.pieces ?? []
  for (let k = 0; k < pieces.length; k++) {
    const piece = pieces[k]
    if (piece?.t === 'text') { if (/\S/.test(typeof piece.s === 'string' ? piece.s : '')) break; continue }
    const c = classOf(piece)
    if (!c) continue
    if (c === 'footnote' || names.has(`p${id}.${k}a`) || names.has(`p${id}.${k}b`)) break
    const sym = symbolText(piece.src), t = texts?.get(piece.src) ?? sym
    if (typeof t !== 'string') return null
    if (sym === null && leadNorm(t)) parts.push({ k, text: leadNorm(t) })
  }
  return parts
}
/**
 * The piece of each of a page's glyphs its group names `.p` (the ownership's `row`, by glyph): by the points (piecesByPoints);
 * and where no point of its unit opened before it, a lead's (own.mjs MR 5b: a cell that opens with a paper's macro, where no
 * mark goes, 1810.04805v2's `\\bertbase (Single)`; its ink TeX set right before the start point, claimed by the text the probe
 * showed the macro sets): its lead's pieces (leadParts) by their texts, nearest the start first, each glyph read against the
 * text from its end (marks.mjs leadStep), case aside, as today's maker finds a head piece (make.mjs besideMarks). Only where the texts spell
 * the unit's whole run of such glyphs on the page, exactly as own.mjs claimed it; else none, as before
 */
export function glyphPiecesOf(pg, row, { units = [], texts = null, names = new Set() } = {}) {
  const out = piecesByPoints(pg.points, pg.glyphs.length, j => row[j], 'glyph')
  const runs = new Map()
  for (let j = 0; j < pg.glyphs.length; j++) {
    const m = out[j] < 0 ? /^u(\d+)\.p$/.exec(row[j] ?? '') : null
    if (m) (runs.get(Number(m[1])) ?? runs.set(Number(m[1]), []).get(Number(m[1]))).push(j)
  }
  for (const [u, run] of runs) {
    const parts = leadParts(units[u], u, texts, names)
    if (!parts?.length) continue
    const got = new Map()
    let n = run.length - 1
    for (let q = parts.length - 1; q >= 0; q--) {
      const { k, text } = parts[q]
      let end = text.length
      while (n >= 0 && end > 0) {
        const e = leadStep(text, end, leadNorm(pg.glyphs[run[n]]?.u ?? ''))
        if (e < 0) break
        got.set(run[n--], k)
        end = e
      }
      if (end !== 0) { got.clear(); break }
    }
    // (the texts spell the whole run, as own.mjs claimed it, or the run is not the lead's: none of it a piece's)
    if (got.size && n < 0) for (const [j, k] of got) out[j] = k
  }
  return out
}

/**
 * Each element's places in B's stream, from the marked compile's points (Instrument `places`): a placeholder's two points
 * `p<u>.<k>a` and `p<u>.<k>b` (u today's unit index, k its piece's); a paper's macro at a unit's head, its point \\axthpk's before
 * the unit's start point, its span ending at the start point or at the next such point of the unit, whichever stands first on
 * the page; one after the unit's end, its point \\axttg's `p<u>.<k>g` after the group it stands in, its span beginning at the
 * unit's end point before it and holding whatever TeX set between, so that no glyph there states it set none. A span of these
 * two with no glyph but a painted box between (an icon the macro set) is not stated. `pages` each with its `points` ({ name,
 * glyph, box }), `count` the units'
 */
export function placesOf(pages, count) {
  const places = []
  pages.forEach((pg, i) => {
    const pts = pg.points
    // (each unit's start and end point on the page, and the names set there, by index)
    const startAt = new Map(), endAt = new Map(), names = new Set(pts.map(x => x.name))
    pts.forEach((pt, q) => {
      const s = START_POINT.exec(pt.name), e = END_POINT.exec(pt.name)
      if (s) startAt.set(Number(s[1]), q)
      if (e) endAt.set(Number(e[1]), q)
    })
    pts.forEach((pt, q) => {
      const m = /^p(\d+)\.(\d+)([abg])$/.exec(pt.name)
      const u = m ? Number(m[1]) : -1
      if (!m || u >= count) return
      if (m[3] === 'g') {
        const e = endAt.get(u) ?? -1
        // (no glyph between but a painted box, an image the macro set: not stated, TeX set something)
        if (e >= 0 && e < q && !(pt.glyph === pts[e].glyph && (pt.box ?? 0) !== (pts[e].box ?? 0))) places.push({ unit: u, piece: m[2], page: i + 1, glyph: pts[e].glyph, end: false }, { unit: u, piece: m[2], page: i + 1, glyph: pt.glyph, end: true })
        return
      }
      places.push({ unit: u, piece: m[2], page: i + 1, glyph: pt.glyph, end: m[3] === 'b' })
      // (a point of its own before the start: a head piece's, closed by the start or by the next head piece's opening)
      const r = startAt.get(u) ?? -1
      if (m[3] !== 'a' || r <= q || names.has(`p${u}.${m[2]}b`)) return
      const own = `p${u}.`
      let n = q + 1
      while (n < r && !(pts[n].name.startsWith(own) && pts[n].name.endsWith('a'))) n++
      if (pts[n].glyph === pt.glyph && (pts[n].box ?? 0) !== (pt.box ?? 0)) return
      places.push({ unit: u, piece: m[2], page: i + 1, glyph: pts[n].glyph, end: true })
    })
  })
  return places
}

/** The pieces whose span the instrument states empty, TeX setting no ink for them where they stand, by unit index and piece
 *  id: a paper's macro the marking's probe said sets none (its `inkless`, to which the marking gives no point); and a text
 *  macro (classesOf's macro or umacro) the marking never marks, its rendering never ink by the marking's own reading (marks.mjs
 *  classOf null: INVISIBLE, STRUCTURE, textless; a .bbl's \newblock, \ttfamily, \sloppy), whose places therefore no compile
 *  states. Today's reader drew such a piece as nothing, proven (tex.mjs inklessOf: a text macro the file holds no row for sets
 *  no ink, and the file holds a row for each marked piece alone); stated nothing, the typesetter leaves its unit unproven (a
 *  paper's own macro of no stated ink and no text: lay/read.ts), every BibTeX entry English. `units` today's, `classes` each
 *  unit's classesOf by piece id */
export function inklessPieces(units, { classes, inkless = null }) {
  const noInk = new Set(inkless ?? [])
  const out = []
  units.forEach((u, i) => (u?.pieces ?? []).forEach((p, k) => {
    if (p.t !== 'ph') return
    const marked = classOf(p), cls = classes[i]?.get(String(k))?.cls
    if ((marked === 'macro' && noInk.has(p.src)) || (marked === null && (cls === 'macro' || cls === 'umacro'))) out.push({ unit: i, piece: String(k) })
  }))
  return out
}

/** a glyph beside a unit's mark is of the run there within this many of its own size of the run's edge (today's maker's
 *  LABEL_EM, make.mjs besideMarks) */
const BESIDE_EM = 2
/**
 * The paper's macros at a unit's head and after its last text that set nothing on the unit's lines, by today's maker's rule
 * (make.mjs besideMarks), as Instrument `empty` pieces: TeX set a head piece's ink, if any, before the unit's start mark and a
 * tail piece's after its end mark, so never on the unit's own lines, which begin at the one mark and end at the other; where no
 * glyph of no unit's stands beside the mark on its line, in its column, the nearest within BESIDE_EM of its size, nothing of it
 * is there: the reading draws it as nothing, and its ink, wherever TeX set it, stays the original's. Today's marking gives
 * such a piece no point to bound it (a head piece none, a tail one its opening point alone where its closing one would follow a
 * control word), so the compile's evidence is the line beside the mark: 2610.21880v1 p2 u23's `\\endgroup` after its last word,
 * 2609.20976v1 p12 u65's `\\acknowledgments` (its heading on the line above), 2610.10069v1 p5 u29's `\\begingroup`, units
 * left unproven before. The mark's place is the unit's own glyph TeX set right after its start point (before its end point).
 * A tail is looked at only where the unit took nothing past its end mark on that line (its closing punctuation, own.mjs MR
 * 4c), as today's. The pieces are the reading's text macros (`classes`' macro and umacro, which the probe showed no text of),
 * nearest the mark first; one whose ink or span is stated (`known`, `unit|piece`) is passed over; inline code (at the head)
 * and a footnote's call always set ink, and end the look. `pages` the adapter's (glyphs, points, view), `rows` the ownership's
 * group names by glyph, `units` today's, `classes` each unit's classesOf by piece id
 */
export function besideEmpty(pages, rows, units, { classes, known = new Set() }) {
  // (each unit's start and end point, page and glyph count; a unit whose marks TeX set more than once is not looked at)
  const S = new Map(), E = new Map(), twice = new Set()
  pages.forEach((pg, p) => (pg.points ?? []).forEach(pt => {
    const s = START_POINT.exec(pt.name), e = s ? null : END_POINT.exec(pt.name), m = s ?? e
    if (!m) return
    const i = Number(m[1]), M = s ? S : E
    if (M.has(i)) twice.add(i)
    else M.set(i, [p, pt.glyph])
  }))
  /** whether nothing of no unit's stands beside unit i's mark `at` (its start's, else its end's) on the mark's line */
  const nothingBeside = (i, at, tail) => {
    const [p, n] = at, pg = pages[p], row = rows[p] ?? [], G = pg?.glyphs ?? [], j = tail ? n - 1 : n, M = G[j]
    const mine = `u${i}`, own = g => row[g] === mine || row[g] === `${mine}.p` || row[g] === `${mine}.l`
    if (!M || !own(j)) return false
    const mx = tail ? M.x1 : M.x0, my = M.y
    const v = pg.view ?? [0, 0, 0, 0], mid = (v[0] + v[2]) / 2, col = columnsAt(pg), c = col(mx, mx), two = col(v[2], v[2]) === 1
    const [cx0, cx1] = !two || c === 2 ? [v[0], v[2]] : c === 1 ? [mid, v[2]] : [v[0], mid]
    const onBand = g => G[g].y > my - 0.35 * G[g].size && G[g].y < my + 0.75 * Math.max(G[g].size, 6)
    const beside = g => (tail ? G[g].x0 >= mx - 0.05 && G[g].x1 <= cx1 + 1 : G[g].x1 <= mx + 0.05 && G[g].x0 >= cx0 - 1)
    const real = g => /\S/.test(G[g].u ?? '') && !G[g].blank
    // (what the unit took past its end mark on its line: its closing punctuation, which ends the look)
    if (tail && G.some((_, g) => g >= n && own(g) && real(g) && onBand(g) && (G[g].x0 + G[g].x1) / 2 > mx + 0.05 && G[g].x1 <= cx1 + 1)) return false
    // (the run outwards from the mark, nearest first: the glyphs of no unit's, and the unit's own pieces' a head found (MR 5b))
    const cand = []
    for (let g = 0; g < G.length; g++) if (g !== j && (row[g] == null || row[g] === `${mine}.p`) && real(g) && onBand(g) && beside(g)) cand.push(g)
    cand.sort((a, b) => (tail ? G[a].x0 - G[b].x0 : G[b].x1 - G[a].x1) || a - b)
    let edge = mx
    for (const g of cand) {
      if ((tail ? G[g].x0 - edge : edge - G[g].x1) > BESIDE_EM * G[g].size) break
      if (row[g] == null) return false
      edge = tail ? Math.max(edge, G[g].x1) : Math.min(edge, G[g].x0)
    }
    return true
  }
  const out = []
  units.forEach((u, i) => {
    const pieces = u?.pieces ?? []
    if (twice.has(i) || !pieces.length) return
    const last = pieces.findLastIndex(q => q.t === 'text' && /\S/.test(typeof q.s === 'string' ? q.s : ''))
    if (last < 0) return
    const cs = classes[i]
    for (const tail of [false, true]) {
      const at = (tail ? E : S).get(i)
      if (!at) continue
      const ks = []
      if (tail) for (let k = last + 1; k < pieces.length; k++) ks.push(k)
      else for (let k = headEnd(pieces, 0) - 1; k >= 0; k--) ks.push(k)
      let looked = null
      for (const k of ks) {
        const c = classOf(pieces[k])
        if (c === 'footnote' || (!tail && c === 'code')) break
        const x = cs?.get(String(k))
        if (!x || (x.cls !== 'macro' && x.cls !== 'umacro') || x.text !== undefined || known.has(`${i}|${k}`)) continue
        looked ??= nothingBeside(i, at, tail)
        if (!looked) break
        out.push({ unit: i, piece: String(k) })
      }
    }
  })
  return out
}

/** the texts the marking's probe showed the paper's macros set, by source: as markedOfPaper's options hold them (readInkTexts'
 *  [source, text] pairs: what the box and the lab hand in), as the marks file's `marking.texts` (flat [source, text, …]) or a
 *  Map; null where none is given */
export function textsOf(texts) {
  if (texts instanceof Map) return texts
  if (!Array.isArray(texts)) return null
  const pairs = texts.length > 0 && texts.every(x => Array.isArray(x))
  const list = pairs ? texts : Array.from({ length: Math.floor(texts.length / 2) }, (_, j) => [texts[2 * j], texts[2 * j + 1]])
  return new Map(list.filter(x => x.length === 2 && typeof x[0] === 'string' && typeof x[1] === 'string'))
}

/**
 * The Instrument of today's marked compile. `paper` live.mjs openPaper's (its bibliography made); `finalPdf` our marked final
 * pass's bytes; `options` the marks file's (`texts`, `inkless`); `log` the marked compile's last pass's log; `pdfjs` { getDocument,
 * OPS } and `documentOptions` the host's (the same as wrapFinal is given, so that the pages read are its); `made` { compiler,
 * tree, front }. Returns the Instrument, and `today` (the ownership's own records, for the lab's checks)
 */
export async function instrumentOf({ paper, finalPdf, options = {}, log = '', pdfjs, documentOptions = {}, made = {} }) {
  const units = paper.units
  const bundle = bundleUnitsOf(paper)
  const inkBase = bundle.length
  const read = await readPdf(pdfjs, finalPdf, { options: documentOptions, turned: true })
  const lower = x => (/[A-Z]/.test(x.name) ? { ...x, name: x.name.toLowerCase() } : x)
  // (each page as wrapFinal hands it to the ownership: layout/wrap-final.mjs)
  const pages = read.pages.map(({ raw, page }) => {
    if (!raw) return { glyphs: [], turned: [], shapes: new Map(), pictures: [], figures: new Map(), boxes: [], paths: [], points: [], boxAt: [], regions: [], view: [...page.view] }
    return { regions: raw.regions, glyphs: raw.glyphs.map(g => ({ n: g.n, k: g.k, u: g.u, x0: g.x0, x1: g.x1, ix0: g.ix0, ix1: g.ix1, y: g.y, size: g.size, top: g.top, bottom: g.bottom, font: g.font, fill: g.fill, ...(g.blank ? { blank: true } : {}), ...(g.form ? { form: true } : {}), ...(g.clipped ? { clipped: true } : {}), ...(g.unseen ? { unseen: true } : {}), ...(g.fid ? { fid: g.fid } : {}), ...(g.pid ? { pid: g.pid } : {}) })), turned: raw.turned, shapes: raw.shapes, pictures: raw.pictures, figures: raw.figures, unseen: raw.unseen, cut: raw.cut, boxes: raw.boxes, paths: raw.paths, points: raw.points.map(lower), paras: raw.paras ?? [], paraEnds: raw.paraEnds ?? [], boxAt: raw.boxAt, view: [...page.view] }
  })
  const texts = options.texts, inkless = options.inkless ?? null
  const shown = textsOf(texts)
  const names = new Set(pages.flatMap(pg => pg.points.map(x => x.name)))
  const follows = followsOf(units, names, shown, inkless)
  const own = ownOf(pages, { units, follows, texts: shown, inkless: inkless === null ? null : new Set(inkless), names: paper.theoremNames ?? null })

  // ---- the units
  const align = new Map(readAlign(log))
  // (each colour piece's fill as TeX set its run, by unit and piece index: marks.mjs readColours over the marked compile's log)
  const colours = new Map()
  for (const [i, k, rgb] of readColours(log)) (colours.get(i) ?? colours.set(i, new Map()).get(i)).set(k, rgb)
  const ids = []
  const out = []
  const kindOf = p => classOf(p) ?? 'other'
  const classesBy = []
  units.forEach((u, i) => {
    const content = contentOf(u.pieces, { kindOf, idOfNested: x => ids[units.indexOf(x)] ?? null })
    const id = unitId(u.kind, content)
    ids[i] = id
    const unhidden = own.units.get(i)?.unhidden
    const classes = classesOf(u.pieces, colours.get(i) ?? null, shown), spans = spansOf(u.pieces, colours.get(i) ?? null)
    classesBy[i] = new Map(classes)
    out.push({ id, kind: u.kind, content, ...(classes.length ? { classes } : {}), ...(spans.length ? { spans } : {}), ...(Number.isInteger(u.depth) ? { depth: u.depth } : {}), ...(u.title ? { title: true } : {}), ...(u.front ? { front: true } : {}), ...(paper.kept?.has(u) ? { kept: true } : {}), ...(u.cell ? { cell: { table: u.cell.table, row: u.cell.row, col: u.cell.col, ...(u.cell.span ? { span: u.cell.span } : {}), ...(u.cell.head ? { head: true } : {}) } } : {}), ...(align.has(i) ? { align: align.get(i) } : {}), ...(unhidden === 'marks' ? { why: 'marks' } : {}) })
  })
  for (let i = units.length; i < inkBase; i++) {
    const content = contentOf(bundle[i][5].map(p => ({ t: 'text', s: p[1] })))
    out.push({ id: unitId(bundle[i][0], content), kind: bundle[i][0], content })
  }
  // a babel name's every key that occurs: a unit whose occurrences are its own (drawn in the target's word)
  const keyUnit = new Map()
  const keyOf = new Map()
  for (const pg of pages) for (const pt of pg.points) { const m = /^n(\d+)\.([a-z]{1,16})\.s$/.exec(pt.name); if (m) keyOf.set(`n${m[1]}`, m[2]) }
  const babel = key => { if (!keyUnit.has(key)) { keyUnit.set(key, out.length); const content = [{ t: 'text', s: key }]; out.push({ id: unitId('name', content), kind: 'name', content, name: key, kept: true }) } return keyUnit.get(key) }

  // ---- the owners of B's glyphs and boxes
  const glyphs = [], boxes = [], turnedOwners = []
  pages.forEach((pg, i) => {
    const G = ownersOf(pg.glyphs.length), X = ownersOf(pg.boxes.length / 4)
    const row = own.glyphs[i] ?? [], brow = own.boxes[i] ?? []
    const pieceG = glyphPiecesOf(pg, row, { units, texts: shown, names })
    const pieceX = piecesByPoints(pg.points, pg.boxes.length / 4, j => brow[j], 'box')
    const set = (O, j, g, piece) => {
      let m = /^u(\d+)(\.[pl])?$/.exec(g ?? '')
      if (m) { O.unit[j] = Number(m[1]); O.role[j] = m[2] === '.p' ? ROLE.element : m[2] === '.l' ? ROLE.label : ROLE.text; if (m[2] === '.p') O.piece[j] = piece[j]; return }
      m = /^n(\d+)$/.exec(g ?? '')
      if (m && keyOf.has(g)) { O.unit[j] = babel(keyOf.get(g)); O.role[j] = ROLE.name }
    }
    for (let j = 0; j < pg.glyphs.length; j++) set(G, j, row[j], pieceG)
    for (let j = 0; j < pg.boxes.length / 4; j++) set(X, j, brow[j], pieceX)
    glyphs.push(G)
    boxes.push(X)
    // (no source unit owns a turned glyph: own.mjs reads none; a figure's turned text is locate's, on arXiv's page)
    turnedOwners.push(ownersOf(pg.turned?.length ?? 0))
  })
  // (TeX's \lineskip and \lineskiplimit: the mark probe's, which its log alone holds (layout/paper.mjs, the options' `lineskip`,
  // what today's file states); the marked compile's log where the options have none)
  const lineskip = options.lineskip ?? readSkipProbe(log)
  // (TeX's paragraph ends, its `qe<n><code>` points, where the marked compile set them: a paragraph ends before that glyph)
  const paragraphEnds = read.pages.map(({ raw }) => (raw?.paraEnds ?? []).map(x => x.glyph))
  // (each placeholder's two points `p<u>.<k>a` and `p<u>.<k>b`, u today's unit index, k its piece's: where the element begins
  // and ends in B's stream)
  const places = placesOf(pages, units.length)
  // (the pieces TeX sets no ink for (inklessPieces): their span stated empty, by unit index and piece id)
  const empty = inklessPieces(units, { classes: classesBy, inkless })
  // (and a head or tail macro that sets nothing on its unit's line, by the line beside the unit's mark (besideEmpty): those whose
  // ink, span or no ink the instrument states already passed over)
  const known = new Set(empty.map(x => `${x.unit}|${x.piece}`))
  for (const O of [...glyphs, ...boxes]) for (let j = 0; j < O.unit.length; j++) if (O.role[j] === ROLE.element && O.piece[j] >= 0) known.add(`${O.unit[j]}|${O.piece[j]}`)
  const ends = new Map()
  for (const x of places) { const k = `${x.unit}|${x.piece}`; ends.set(k, (ends.get(k) ?? 0) | (x.end ? 2 : 1)) }
  for (const [k, e] of ends) if (e === 3) known.add(k)
  empty.push(...besideEmpty(pages, own.glyphs, units, { classes: classesBy, known }))
  return {
    instrument: { ink: read.doc, units: out, glyphs, boxes, turned: turnedOwners, places, ...(empty.length ? { empty } : {}), tex: { ...(lineskip ? { lineskip } : {}), paragraphEnds }, made: { compiler: made.compiler ?? 'pdflatex', tree: made.tree ?? '', front: made.front ?? '' } },
    today: { own, inkBase },
  }
}
