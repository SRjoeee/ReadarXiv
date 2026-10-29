// Machine translation of LaTeX units, shared by the spikes (Node) and the reader (browser). A unit goes out as one
// wire text with its opaque pieces as markers (DESIGN §6: `@a#`, `@@` for a literal @), comes back as pieces again;
// the engine's slips are forgiven where they are unambiguous, and what still fails goes as runs — each stretch of text
// between opaque pieces on its own — so that nothing is left untranslated.
import { tokens } from '../pipeline/anchors.mjs'
import { bySentence } from '../view/highlight.mjs'
import { MIXED } from './mixed.mjs'
import { fromAlpha, MARKER_CLOSER, markerReader, TAG_RE, toAlpha } from '../../../core/protector/tokens.ts'
import { balancedRuns, delimiterResidue, RUN_SEPARATOR } from '../../../core/protector/math-runs.ts'
import { ABBR, sentenceCuts } from '../../../core/sentences/index.ts'

// This file is the translation's: the wire a unit goes out as, and the reading back of a reply. A change here that alters
// what is sent for a unit or what its reply is read as raises TRANSLATE_VERSION, the identity of the translation rules
// (translate/version.mjs holds what it covers); one that alters a unit's cutting or text raises PIPELINE_VERSION
// (versions.mjs) too.
export { TRANSLATE_VERSION } from './version.mjs'

// ---------------------------------------------------------------- markers wire format
export { fromAlpha, toAlpha }
export const escape = s => s.replace(/@/g, '@@').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** a reply's entities read: a numeric one of a code point (U+10FFFF at most) and the named ones; a numeric entity past the last
 *  code point kept as it stands, as the background's decoder keeps it (src/core/protector/escape.ts decodeText), where
 *  String.fromCodePoint threw and took the run down, its cached reply giving the same throw again on every retry */
const entityOf = (b, m) => { const c = b[1].toLowerCase() === 'x' ? Number.parseInt(b.slice(2), 16) : Number.parseInt(b.slice(1), 10); return c <= 0x10ffff ? String.fromCodePoint(c) : m }
export const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, b) => b[0] === '#' ? entityOf(b, m) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[b.toLowerCase()])
// (the same function as the front end's latin1Bytes: loading a paper's front end, and the argument tables it reads, for this
// one line would put them in every reader that translates; a test holds the two equal)
const latin1Bytes = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff; return b }
/** source text is read byte for byte (latin1); its characters are UTF-8. Printable ASCII is its own decoding, and one decoder
 *  serves every call: a decoder made for each text piece was most of serialize's time (2610.19159's 2,645 units) */
const DECODER = new TextDecoder()
const ASCII = /^[\t\n\r -~]*$/
export const utf8 = s => (ASCII.test(s) ? s : DECODER.decode(latin1Bytes(s)))
// the engine's text is plain text: TeX's special characters in it (a % for "percent", a # for "number") are escaped,
// and the characters Unicode marks default ignorable, invisible by definition (a zero width space, a soft hyphen, a
// direction mark, a variation selector), are dropped: no font of ours holds a glyph for one, and TeX's "Missing
// character" for it reads as a letter lost (live.mjs unsettable) — two zero width spaces Google put inside a word failed
// every way of setting 2608.02785 (2026-10-02). The scripts whose shaping needs a joiner (ZWJ, ZWNJ) are not typeset
const INVISIBLE = /\p{Default_Ignorable_Code_Point}/gu
export const texEscape = s => s.replace(INVISIBLE, '').replace(/[\\#$%&_{}~^]/g, c => ({ '\\': '\\textbackslash{}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' })[c] ?? `\\${c}`)

// ---------------------------------------------------------------- a formula split across inline formulas
/** an inline formula's TeX, its math shifts off: `$…$` or `\(…\)`, never a display; else null */
const inlineTex = src => (typeof src !== 'string' ? null : /^\$(?!\$)[\s\S]*\$$/.test(src) && src.length > 1 ? src.slice(1, -1) : /^\\\([\s\S]*\\\)$/.test(src) ? src.slice(2, -2) : null)
/** a placeholder that is space or an ellipsis, as what stands between a run's formulas may be: a tie, TeX's spaces, \ldots */
const RUN_SPACE = /^(?:~|\\[ ,;:!\n]|\\(?:q?quad|enspace|thinspace|nobreakspace|l?dots|textellipsis)(?![A-Za-z@])(?:\{\})?)\s*$/
/**
 * A formula the author split across inline formulas — `$\{\Phi_0$, $\Phi_1$, $\Phi_2\}$`, a set whose brace the first
 * opens and the last closes — goes out as one placeholder: the formulas of a run whose delimiters balance across them
 * alone (core/protector/math-runs.ts balancedRuns), with the white space, commas, semicolons, ties and ellipses between
 * them. Sent apart, Microsoft's Chinese put the set's first formula, its brace with it, before the words the other two
 * follow, and the set was drawn broken apart (2307.16209's page 31). The unit keeps its pieces: the marker stands for the
 * run's own pieces, which a reply read back gives again in their order (rehydrate), so that the layout file's rows, the
 * unit's hash and the layer's crops are each part's, one line each, as TeX may break the line between them (11 of the
 * corpus's 16 runs take two). A word between two formulas is the translator's: no run crosses one (2608.18502's
 * `$($intrinsic$)$`). The runs of `pieces`, a Map of each run's first piece's index to its last's
 */
export function formulaRuns(pieces) {
  const items = pieces.map(p => {
    if (p.t === 'ph') { const tex = inlineTex(p.src); return tex !== null ? { tex } : RUN_SPACE.test(p.src ?? '') ? 'between' : null }
    return p.t === 'text' && p.src === undefined && RUN_SEPARATOR.test(utf8(p.s)) ? 'between' : null
  })
  return new Map(balancedRuns(items))
}
/** whether translated pieces hold an inline formula whose delimiters do not balance on its own: a part of a run, which a
 *  wire that sent each part apart may have set apart from the others (live.mjs PIPELINE_CARRIES) */
export const holdsUnbalanced = pieces => pieces.some(p => {
  const tex = p?.t === 'ph' ? inlineTex(p.src) : null
  if (tex === null) return false
  const r = delimiterResidue(tex)
  return !r || r.opens.length > 0 || r.closes.length > 0
})
/** the slot a run goes out as: its pieces, the unit's own */
const runSlot = pieces => ({ t: 'run', pieces })
/** the characters that are not white space a run's text holds, which its marker does not write (plainSource counts them) */
const runShown = slot => slot.pieces.filter(p => p.t === 'text').map(p => utf8(p.s)).join('').replace(/\s+/g, '').length
/** a slot as the pieces it stands for: a run's, an edge's (a kept pair's open or close with what rides beside it), or
 *  the one piece */
const piecesOf = slot => (slot.t === 'run' || slot.t === 'edge' ? slot.pieces : [slot])
/** the source a slot is read by where a space is taken off before it (SPACING): an edge's first piece that sets
 *  something, its open or a close (a group's end) */
const srcOf = slot => (slot.t === 'edge' ? (slot.pieces.find(p => !isInkless(p)) ?? slot.pieces[0]).src : slot.src)

// ---------------------------------------------------------------- a unit's styling on the wire
/**
 * A placeholder that sets no ink and that no translator needs: a style or size switch (`\bfseries`, `\small`,
 * `\color{red}`), a strut, a paragraph's shape (`\noindent`, `\centering`), a break's permission (`\allowbreak`),
 * `\relax` and its kind. Sent as a marker, each one cut the sentence it stood in: Microsoft reads a
 * marker as a hard boundary, and 2610.19159's 6,681 `\allowbreak{}` and 3,516 `\bfseries` (one before every word of
 * its coloured runs) went out as 13,000 markers. It goes on no wire: it is put back after the open of its innermost
 * group that went out (the unit's front, a kept pair's open) where it stood before that group's first word, else before
 * its close, in the source's order; next to a placeholder that goes as a marker, it rides in that marker, in its place
 * (planOf). A space (a tie, `\quad`, mt.mjs SPACING's), a forced break, a fill or a skip is not one of them: each sets
 * where the words around it fall (a fill taken to the end set 2608.10322's flush-right end of proof after its words),
 * and goes as a marker where it stands
 */
const INKLESS = /^(?:\\(?:centering|raggedright|raggedleft|noindent|indent|normalfont|rmfamily|sffamily|ttfamily|bfseries|mdseries|itshape|upshape|slshape|scshape|em|bf|it|rm|sf|tt|sc|sl|normalsize|small|footnotesize|scriptsize|tiny|large|Large|LARGE|huge|Huge|selectfont|protect|relax|leavevmode|strut|null|nobreak|allowbreak|sloppy|fussy|ignorespaces|unskip)(?![A-Za-z@])(?:\s*\{\})?|\\color\s*(?:\[[^\]]*\]\s*)?\{[^{}]*\})\s*$/
/** whether a piece is a placeholder that sets no ink (INKLESS) */
export const isInkless = p => p?.t === 'ph' && typeof p.src === 'string' && p.src[0] === '\\' && INKLESS.test(p.src)
/** a link's open: its text is what a reader clicks, kept a pair on every wire (the layer draws the link by it) */
const LINK = /^\\(?:href|hyperref|hyperlink)(?![A-Za-z])/
/**
 * An open that sets a style and nothing else (the front end's INLINE_TEXT, \textcolor, \mbox, a bare group): only such a
 * pair may go flat, coming back empty after the translation, where it sets nothing. Any other pair keeps its two markers
 * as before: a box that draws (an empty \colorbox is a swatch, 2608.12333), a table's cell (`\multicolumn{7}{@{}l}{}` after
 * a \midrule is a Misplaced \omit, 2607.24653), a macro of the paper's whose argument is prose (`\kimi{3}`, `Kimi K#1`,
 * printed "Kimi K" for each empty call)
 */
const STYLE_OPEN = /^(?:\{|\\(?:textbf|textit|emph|textsl|textsc|underline|textup|textrm|textsf|textmd|textnormal|uline|mbox)\s*\{|\\textcolor\s*(?:\[[^\]]*\]\s*)?\{[^{}]*\}\s*\{)$/
/** a text that ends where a sentence or a run-in label ends: a full stop, a colon, a semicolon, a question or an
 *  exclamation mark, closing quotes or brackets after it; never after an abbreviation (`e.g.`, `Fig.`, sentences ABBR) */
const SENTENCE_END = /[.!?\u3002\uff01\uff1f]["'\u201d\u2019)\]]*$/
const endsSentence = s => { const t = s.trimEnd(); return SENTENCE_END.test(t) && !ABBR.test(t.replace(/["'\u201d\u2019)\]]+$/, '')) }
const SENTENCE_LEAD = /^[.!?\u3002\uff01\uff1f]/
/** a colon or a semicolon: a run-in label's end at the unit's head (\textbf{Setup:}), a clause's anywhere else
 *  (`Options: \emph{fast}; and safe` is one sentence) */
const CLAUSE_END = /[:;\uff1a\uff1b]["'\u201d\u2019)\]]*$/
const CLAUSE_LEAD = /^[:;\uff1a\uff1b]/
const blank = s => !/\S/.test(s)
const OBJ = '\ufffc'
/** whether a unit's pieces hold what TRANSLATE_VERSION 3 changed on the wire: a pair, or a placeholder that sets no ink
 *  between two stretches of text (one at an edge took a marker at the wire's edge, which cut no sentence) */
export function holdsStyle(pieces) {
  if (!Array.isArray(pieces)) return false
  if (pieces.some(p => p?.t === 'open' || p?.t === 'close')) return true
  const solid = p => p?.t === 'text' && typeof p.s === 'string' && /\S/.test(p.s)
  const first = pieces.findIndex(solid), last = pieces.findLastIndex(solid)
  return pieces.some((p, k) => k > first && k < last && isInkless(p))
}

/** a unit's pieces as a tree: each pair a node of what it holds (`seq`), each other piece a leaf; null where the pairs
 *  do not nest (a piece list of no unit the front end makes) */
function treeOf(pieces) {
  const root = { seq: [] }, stack = [root]
  for (let k = 0; k < pieces.length; k++) {
    const p = pieces[k]
    if (p?.t === 'open') { const n = { open: k, close: -1, seq: [] }; stack.at(-1).seq.push(n); stack.push(n) } else if (p?.t === 'close') {
      const top = stack.at(-1)
      if (top === root || pieces[top.open].id !== p.id) return null
      top.close = k
      stack.pop()
    } else stack.at(-1).seq.push({ k })
  }
  return stack.length === 1 ? root : null
}

/**
 * What a unit sends, in order, and where what it does not send goes (`format`: markers or tags). The unit's pieces as a
 * tree; a formula run (formulaRuns) one leaf. Each pair, by what it holds:
 * - nothing that is no white space and no placeholder with ink: off the wire as it stands (`{}`, `\mbox{}`);
 * - placeholders and white space only: one marker for all its pieces, read back in their order (a run's slot);
 * - text: same-style neighbours first one span — sibling pairs of the same open and close, the same switches at their
 *   head, white space alone between them (2610.19159's `\textcolor{c}{\bfseries w}` round every word) —, then on
 *   markers: around the whole translation where it holds all the unit's content (`enclose`, the unit's style); kept,
 *   two markers, where it is a link or holds whole sentences, beginning where one begins and ending where one ends
 *   (`kept`: a run-in label `\textbf{Setup:}`, a styled sentence — Microsoft's sentence lengths are the one alignment the
 *   endpoint gives, and a marker between two sentences cuts none); else no marker (`flat`): its words are the
 *   sentence's, its open and close come back together, empty, before the close of its innermost kept group (the unit's
 *   back), and its attribute is lost. Microsoft read each marker as a hard boundary and gave back each piece of a
 *   sentence apart, word salad (2610.19159's units 23 and 375, the owner's test of 2026-10-19). On tags every pair with
 *   text is kept: the formats that keep tags keep its words inside it (DESIGN §6).
 * Returns `items` (the wire: text, a void, a kept pair's open or close), the unit's `front` and `back` (what goes before
 * and after the translation) and each kept pair's own (`lead`, `end`), as lists of piece indices and blocks.
 * A unit whose pairs do not nest goes as it did before: every piece but its text a marker
 */
function planOf(u, format, boundary = true) {
  const pieces = u.pieces
  const ink = new Array(pieces.length)
  let hasInk = false, styled = false
  for (let k = 0; k < pieces.length; k++) {
    const p = pieces[k]
    if (p.t === 'ph') { ink[k] = isInkless(p); if (ink[k]) hasInk = styled = true } else if (p.t === 'open' || p.t === 'close') styled = true
  }
  const root = styled ? treeOf(pieces) : null
  const runs = formulaRuns(pieces)
  if (!root) {
    const items = []
    for (let k = 0; k < pieces.length; k++) {
      if (pieces[k].t === 'text') { const last = items.at(-1); if (last?.t === 'text') { last.ks.push(k); last.joints.push(false) } else items.push({ t: 'text', ks: [k], joints: [false] }); continue }
      const last = runs.get(k) ?? k
      items.push({ t: 'void', slot: last > k ? runSlot(pieces.slice(k, last + 1)) : pieces[k], hide: last > k })
      k = last
    }
    return { items, front: [], back: [], styled: false }
  }
  // (one state for the unit, read by the functions below: none of them is made anew for each unit; `keptEdges` the boundary
  // rule's, null while it is read)
  const P = { pieces, ink, runs, hasInk, texts: new Array(pieces.length), format, keptEdges: null }
  runsIn(P, root)
  root.info = infoOf(P, root.seq)
  spans(P, root)
  if (format !== 'tags') { flatOf(P, root); P.keptEdges = boundary ? keptEdgesOf(P, root) : null }
  const unit = { lead: [], end: [], seen: false }
  const W = { P, items: [], stack: [unit], group: unit, sink: null, joint: false }
  walk(W, root.seq)
  return { items: W.items, front: unit.lead, back: unit.end, styled: true, texts: P.texts }
}
/** whether the boundary rule (classOf; TRANSLATE_VERSION 4) changes what a unit sends: its markers plan, which the wire and the
 *  runs are written from, with the rule and without it. A unit with no pair has none to keep: the units a copy made before the
 *  rule is asked again for, and no other (live.mjs PIPELINE_CARRIES) */
export function boundaryChanges(u) {
  if (!Array.isArray(u?.pieces) || !u.pieces.some(p => p?.t === 'open')) return false
  const a = planOf(u, 'markers'), b = planOf(u, 'markers', false)
  return JSON.stringify([a.items, a.front, a.back]) !== JSON.stringify([b.items, b.front, b.back])
}
const textAt = (P, k) => (P.texts[k] ??= utf8(P.pieces[k].s))
const blankAt = (P, k) => P.pieces[k].t === 'text' && blank(textAt(P, k))
/** a formula run one leaf (its pieces are a stretch of one level: a pair breaks a run); and a stretch of placeholders,
 *  some of them setting no ink, white space alone between them, one leaf too: the marker of the ones with ink carries
 *  the others in their place (2610.19159's `\smallskip \noindent\textbullet\ `, whose \noindent would else have gone
 *  after the translation, the \smallskip a marker before it) */
function runsIn(P, node) {
  const { pieces, ink, runs } = P
  let out = node.seq
  if (runs.size) {
    out = []
    for (let i = 0; i < node.seq.length; i++) {
      const e = node.seq[i]
      if (e.seq) { runsIn(P, e); out.push(e); continue }
      const last = runs.get(e.k)
      if (last > e.k && node.seq[i + last - e.k]?.k === last) { out.push({ run: [e.k, last] }); i += last - e.k; continue }
      out.push(e)
    }
  } else for (const e of out) if (e.seq) runsIn(P, e)
  // (one pass: each stretch read once, from a placeholder to the last placeholder before text or a pair)
  if (!P.hasInk) { node.seq = out; return }
  const joined = []
  for (let i = 0; i < out.length; i++) {
    const e = out[i]
    if (e.seq || (e.k !== undefined && pieces[e.k].t === 'text')) { joined.push(e); continue }
    let j = i, end = i, inked = false, inkless = false
    for (; j < out.length; j++) {
      const x = out[j]
      if (!x.run && (x.k === undefined || (pieces[x.k].t === 'text' && !blankAt(P, x.k)))) break
      if (x.k !== undefined && pieces[x.k].t === 'text') continue
      end = j
      if (x.run || !ink[x.k]) inked = true; else inkless = true
    }
    if (end > i && inked && inkless) joined.push({ run: [e.run?.[0] ?? e.k, out[end].run?.[1] ?? out[end].k] })
    else if (end === i) joined.push(e)
    else for (let x = i; x <= end; x++) joined.push(out[x])
    i = end
  }
  node.seq = joined
}
/** what a pair holds: text that is no white space, placeholders with ink, letters */
function infoOf(P, seq) {
  const info = { text: false, voids: false, letters: false }
  for (const e of seq) {
    if (e.off !== undefined) continue
    if (e.run) { info.voids = true; continue }
    if (e.k !== undefined) {
      if (P.pieces[e.k].t === 'text') { const s = textAt(P, e.k); if (!blank(s)) info.text = true; if (/\p{L}/u.test(s)) info.letters = true } else if (!P.ink[e.k]) info.voids = true
      continue
    }
    e.info ??= infoOf(P, e.seq)
    info.text ||= e.info.text; info.voids ||= e.info.voids; info.letters ||= e.info.letters
  }
  return info
}
/** the switches at a pair's head, before its first text or placeholder with ink */
function headOf(P, n) {
  let out = ''
  for (const e of n.seq) {
    if (e.k !== undefined && P.ink[e.k]) { out += `${P.pieces[e.k].src}\u0001`; continue }
    if (e.k !== undefined && blankAt(P, e.k)) continue
    break
  }
  return out
}
// (only pairs that set a style merge: two links side by side to one address stay two)
const setsStyle = (P, n) => (n.style ??= STYLE_OPEN.test(P.pieces[n.open].src ?? ''))
const styleOf = (P, n) => (n.key ??= `${P.pieces[n.open].src}\u0000${headOf(P, n)}\u0000${P.pieces[n.close].src}`)
/** same-style neighbours, one span */
function spans(P, node) {
  const out = []
  for (let i = 0; i < node.seq.length; i++) {
    const e = node.seq[i]
    if (e.seq) spans(P, e)
    if (!e.seq || !e.info.text || !setsStyle(P, e)) { out.push(e); continue }
    let members = null, gaps = null
    for (let j = i + 1, ws = []; j < node.seq.length; j++) {
      const f = node.seq[j]
      if (f.k !== undefined && blankAt(P, f.k)) { ws.push(f); continue }
      if (!f.seq || !f.info?.text || !setsStyle(P, f) || styleOf(P, f) !== styleOf(P, e)) break
      spans(P, f)
      members ??= [e]; gaps ??= [[]]
      members.push(f); gaps.push(ws); ws = []; i = j
    }
    if (!members) { out.push(e); continue }
    const seq = []
    members.forEach((m, j) => { if (j) seq.push({ off: members[j - 1].close }, ...gaps[j], { off: m.open }); seq.push(...m.seq) })
    out.push({ open: e.open, close: members.at(-1).close, seq, info: { text: true, voids: members.some(m => m.info.voids), letters: members.some(m => m.info.letters) } })
  }
  node.seq = out
}
/** where each pair's content lies in the unit's text (formulas and the like one character, OBJ): `P.ranges`, and the
 *  text and its edges (`P.flat`) its class is read in */
function flatOf(P, root) {
  const parts = [], ranges = new Map(), breaks = new Set()
  let at = 0
  const visit = seq => {
    for (const e of seq) {
      if (e.off !== undefined) continue
      // (a run is one marker: it breaks the text where any of its pieces does, a forced break joined with a switch beside it)
      if (e.run) { if (breaksIn(P.pieces, e.run[0], e.run[1])) breaks.add(at); parts.push(OBJ); at++; continue }
      if (e.k !== undefined) {
        const s = P.pieces[e.k].t === 'text' ? textAt(P, e.k) : P.ink[e.k] ? '' : OBJ
        if (s === OBJ && breaksIn(P.pieces, e.k, e.k)) breaks.add(at)
        parts.push(s); at += s.length; continue
      }
      if (!e.info.text) { if (e.info.voids) { parts.push(OBJ); at++ } continue }
      const a = at
      visit(e.seq)
      ranges.set(e, [a, at])
    }
  }
  visit(root.seq)
  const flat = parts.join('')
  let last = flat.length, lastWord = flat.length
  while (last > 0 && /\s/.test(flat[last - 1])) last--
  while (lastWord > 0 && /[\s￼]/.test(flat[lastWord - 1])) lastWord--
  P.ranges = ranges
  P.breaks = breaks
  P.flat = { text: flat, first: flat.search(/\S/), word: flat.search(/[^\s￼]/), last, lastWord }
}
const SOLID = /\S/g
const nextSolid = (flat, b) => { SOLID.lastIndex = b; return SOLID.exec(flat)?.[0] ?? '' }
/** where the next character from `b` that is no white space stands, and the last before `a` (-1 for none) */
const nextSolidAt = (flat, b) => { SOLID.lastIndex = b; return SOLID.exec(flat)?.index ?? -1 }
const solidBeforeAt = (flat, a) => { let i = a - 1; while (i >= 0 && /\s/.test(flat[i])) i--; return i }
/** the placeholders that break the text where they stand: a forced line break, a display, an item. An inline formula does
 *  not: the translator moves it with the words as one of them (`We fix the $\theta$ \textcolor{red}{matrix …}` kept would
 *  cut its noun phrase in two; the review of #415, 100 of the 109 units its clause changed over the sweep's papers) */
/** whether pieces `a` to `b` hold a placeholder that breaks the text (BREAKS) */
const breaksIn = (pieces, a, b) => { for (let k = a; k <= b; k++) if (pieces[k]?.t === 'ph' && BREAKS.test(pieces[k].src ?? '')) return true; return false }
const BREAKS = /^(?:\\\\\*?(?:\[[^\]]*\])?|\\(?:newline|linebreak|item)(?![A-Za-z@])(?:\[[^\]]*\])?|\$\$[\s\S]*|\\\[[\s\S]*|\\begin\s*\{(?:equation|align|gather|multline|eqnarray|displaymath|flalign|alignat)\*?\}[\s\S]*)\s*$/
/** whether the text breaks at flat offset `i` (BREAKS) */
const breaksAt = (P, i) => i >= 0 && P.breaks.has(i)
/** the places the wire has a marker at anyway, by the sentence rule alone: each kept or enclosing pair's two edges, read before
 *  the boundary rule (classOf) and never after it, so that one pair's keeping makes no other's; inside a pair that goes flat
 *  too, whose children the wire walks still (a link kept in it keeps its markers) */
function keptEdgesOf(P, root) {
  const edges = []
  const visit = seq => {
    for (const e of seq) {
      if (!e.seq) continue
      const c = classOf(P, e)
      if (c === 'kept' || c === 'enclose') edges.push(...P.ranges.get(e))
      if (c === 'kept' || c === 'enclose' || c === 'flat') visit(e.seq)
    }
  }
  visit(root.seq)
  return edges
}
/** whether `x` stands at a kept pair's edge, white space alone between them */
const atEdge = (P, x) => P.keptEdges.some(y => /^\s*$/.test(P.flat.text.slice(Math.min(x, y), Math.max(x, y))))
// (a sentence's end is read in the last words before a place, its start in the first after it)
const WINDOW = 200
/** a pair's class on the wire (planOf) */
function classOf(P, e) {
  // (an empty pair that sets more than a style, `\inv{}`, may print: one marker, where it stands)
  if (!e.info.text) return e.info.voids || !setsStyle(P, e) ? 'group' : 'skeleton'
  if (P.format === 'tags') return 'kept'
  const [a, b] = P.ranges.get(e), { text: flat, first, word, last, lastWord } = P.flat
  if (a <= first && b >= last) return 'enclose'
  if (!setsStyle(P, e) || LINK.test(P.pieces[e.open].src ?? '')) return 'kept'
  // (placeholders before its first word or after its last are the unit's edge: a cell's rule, a citation at the end)
  const head = a <= word, tail = b >= lastWord, inside = flat.slice(Math.max(a, b - WINDOW), b), next = nextSolid(flat, b)
  const starts = head || endsSentence(flat.slice(Math.max(0, a - WINDOW), a))
  // a run-in label at the unit's head ends with a colon, before one, or before a sentence that begins with no stop
  // between (\textbf{Service Auto-Scaling} To accommodate)
  const ends = tail || endsSentence(inside) || SENTENCE_LEAD.test(next) || (head && (CLAUSE_END.test(inside.trimEnd()) || CLAUSE_LEAD.test(next) || /^\p{Lu}/u.test(next)))
  if (starts && ends) return 'kept'
  // the boundary rule (E1 of the residuals' batch R2): a pair whose two ends both stand where the wire is cut anyway — a placeholder
  // that breaks the text beside it (BREAKS: a forced break, a display, an item; never an inline formula, which the translator
  // moves as a word), a kept or enclosing pair's edge with white space alone between, or the unit's own end — is kept too: its
  // two markers cut nothing Microsoft does not cut already (2610.19159's "\textit{Floor (must clear):} \textcolor{red}{… to the
  // end}", whose colour went flat at a colon that starts no sentence)
  if (P.keptEdges && (starts || breaksAt(P, solidBeforeAt(flat, a)) || atEdge(P, a)) && (ends || breaksAt(P, nextSolidAt(flat, b)) || atEdge(P, b))) return 'kept'
  return 'flat'
}
// the wire, and where each piece that does not go on it is put back: in its innermost kept group (the unit, a kept
// pair) after the open where it stands before the group's first content, else before the close; a flat pair's open,
// close and what it holds off the wire together, one block. `W.joint`: something stood off the wire since the last text
const seenAll = W => { for (const g of W.stack) g.seen = true }
const offWire = (W, k) => { (W.sink ?? (W.group.seen ? W.group.end : W.group.lead)).push(k); W.joint = true }
function textItem(W, k) {
  const last = W.items.at(-1)
  if (last?.t === 'text') { last.ks.push(k); last.joints.push(W.joint) } else W.items.push({ t: 'text', ks: [k], joints: [false] })
  W.joint = false
  if (!blank(textAt(W.P, k))) seenAll(W)
}
const voidItem = (W, slot, hide) => { W.items.push({ t: 'void', slot, hide }); seenAll(W); W.joint = false }
function walk(W, seq) {
  const { pieces, ink } = W.P
  for (const e of seq) {
    if (e.off !== undefined) { offWire(W, e.off); continue }
    if (e.run) { voidItem(W, runSlot(pieces.slice(e.run[0], e.run[1] + 1)), true); continue }
    if (e.k !== undefined) {
      const p = pieces[e.k]
      if (p.t === 'text') textItem(W, e.k)
      else if (ink[e.k]) offWire(W, e.k)
      else voidItem(W, p, false)
      continue
    }
    const c = classOf(W.P, e)
    if (c === 'skeleton') { for (let k = e.open; k <= e.close; k++) offWire(W, k); continue }
    if (c === 'group') { voidItem(W, runSlot(pieces.slice(e.open, e.close + 1)), true); continue }
    if (c === 'enclose') { offWire(W, e.open); walk(W, e.seq); offWire(W, e.close); continue }
    if (c === 'flat') {
      const block = [e.open], saved = W.sink
      ;(W.sink ?? W.group.end).push(block)
      W.sink = block; W.joint = true
      walk(W, e.seq)
      block.push(e.close); W.sink = saved; W.joint = true
      continue
    }
    const g = { open: e.open, close: e.close, lead: [], end: [], seen: false, letters: e.info.letters, depth: W.stack.length }
    W.items.push({ t: 'open', g }); seenAll(W)
    const group = W.group, sink = W.sink
    W.stack.push(g); W.group = g; W.sink = null; W.joint = false
    walk(W, e.seq)
    W.items.push({ t: 'close', g }); W.stack.pop(); W.group = group; W.sink = sink; W.joint = false
  }
}
// ---------------------------------------------------------------- a display's own stop
/** a displayed formula's source: the layer draws it as one crop (layout/marks.mjs classOf, which reads it here) */
export const DISPLAY = /^(?:\\\[|\$\$|\\begin\s*\{(?:equation|align|alignat|gather|multline|flalign|eqnarray|displaymath|dmath|IEEEeqnarray|subequations)\*?\})/
/** the math environments a display holds, which end inside it before its own end: a display's, an alignment's, a case
 *  split's, an array's or a matrix's. No other (a picture, `\end{tikzpicture}`, whose `;` is its own syntax) */
const MATH_INNER = String.raw`(?:equation|align|alignat|gather|multline|flalign|eqnarray|displaymath|dmath|IEEEeqnarray|subequations|split|aligned|alignedat|gathered|multlined|cases|dcases|rcases|array|subarray|[pbBvV]?matrix|smallmatrix)\*?`
/** one thing at a display's end that sets none of its sentence's punctuation, read from the end: white space, a comment,
 *  the display's close and an inner math environment's, a label, a tag, a number's switch, `\qedhere`, a line break, a
 *  space or a fill of TeX's, an empty group, plain TeX's \eqno and what it numbers */
const DISPLAY_TAIL = new RegExp(String.raw`(?:[ \t\n\f\r]+|(?<!\\)%[^\n]*|\\\]|\$\$|\\end\s*\{${MATH_INNER}\}|\\(?:label|tag\*?)\s*\{[^{}]*\}|\\(?:nonumber|notag|qedhere|displaybreak|allowbreak|hfill|q?quad|enspace|thinspace)(?![A-Za-z@])(?:\[[^\]]*\])?|\\\\\*?(?:\[[^\]]*\])?|\\[,;:!> ]|~|\{\}|\\l?eqno(?![A-Za-z@])[\s\S]*)$`)
/** the punctuation at that end: a stop, a comma, a semicolon or a colon, bare or alone in a group that sets it (`\text{.}`,
 *  never a phantom's); never an empty delimiter (`\right.`) or an escaped character (`\;` is a space) */
const DISPLAY_STOP = /\\(?:text|mbox|textrm|textnormal|mathrm|hbox)\s*\{\s*([.,;:])\s*\}$|(?<!\\(?:right|middle|left|[bB]igg?[lrm]?)\s*)(?<!\\)([.,;:])$/
/** the punctuation a display's source sets at its end, which is its sentence's (`x = y.\label{e}\end{equation}`), or null;
 *  read in its last 2,000 characters, where a display's end lies whatever its length */
export function displayStop(src) {
  if (typeof src !== 'string' || !DISPLAY.test(src)) return null
  let s = src.length > 2000 ? src.slice(-2000) : src
  for (let n = 0; n < 64; n++) {
    const m = DISPLAY_TAIL.exec(s)
    if (!m) break
    s = s.slice(0, m.index)
  }
  const m = DISPLAY_STOP.exec(s)
  return m ? (m[1] ?? m[2]) : null
}
/** what a reply may write for a display's own stop: any script's stop, comma, semicolon or colon */
const OWN_MARKS = '.,;:\u3002\uff0e\uff0c\u3001\uff1b\uff1a\u0964\u06d4\u060c\u061b'
/** the marks the reply set right after the display's marker (white space and the sentences' sentinel, sentencesOf's, kept) */
const OWN_LEAD = new RegExp(`^([ \\t\\n\\f\\r\\ue000]*)[${OWN_MARKS}]+`)
/** a piece's own stop, read once for each piece (both wires and the carry test ask it again) */
const STOP_OF = new WeakMap()
const stopOfPiece = p => { let s = STOP_OF.get(p); if (s === undefined) STOP_OF.set(p, (s = displayStop(p.src))); return s }
/** text that begins with punctuation */
const LEAD_PUNCT = /^\s*[.,;:!?\u3002\uff0e\uff0c\u3001\uff1b\uff1a\uff01\uff1f]/
/** the display's own stop a void's marker carries (the display its last piece with ink: the one piece, or a run's or a
 *  group's last), or null; none where the text after it (`after`) begins with punctuation of its own
 *  (`x = y.\end{equation}, where`), which the wire sends as it is */
function ownStopOf(slot, pieces, items, i) {
  let p = slot
  if (slot.t === 'run' || slot.t === 'edge') {
    p = null
    const ps = slot.pieces
    for (let j = ps.length - 1; j >= 0 && !p; j--) if (!((ps[j].t === 'text' && blank(utf8(ps[j].s))) || ps[j].t === 'open' || ps[j].t === 'close' || isInkless(ps[j]))) p = ps[j]
  }
  if (p?.t !== 'ph' || !DISPLAY.test(p.src ?? '')) return null
  const stop = stopOfPiece(p)
  return stop && !LEAD_PUNCT.test(textAfter(pieces, items, i)) ? stop : null
}
/** the text the wire writes after item `i`, as far as its next marker */
const textAfter = (pieces, items, i) => (items[i + 1]?.t === 'text' ? items[i + 1].ks.map(k => utf8(pieces[k].s)).join('') : '')
/** a reply's text after a display's marker that carried its own stop: every mark right after it taken off, the display
 *  setting its own. A mark right before the marker is the reply's: in Microsoft's 4,825 recorded Chinese answers with a
 *  marker the wire set before a mark, none moved that mark before it, and each of the 16 marks before such a marker (with
 *  none after it) was the reply's own — a clause's comma where it set the marker inside its sentence, the previous
 *  sentence's stop where it set the marker at the next one's start */
const ownAfter = s => s.replace(OWN_LEAD, '$1')
/**
 * Whether a unit's wire carries a display's own stop (serialize's and serializeTags' `own`): the units whose wire and
 * reading back TRANSLATE_VERSION 5 changed, which a copy made before it is asked again for, and no other (live.mjs
 * PIPELINE_CARRIES)
 */
export function displayStopChanges(u) {
  if (!Array.isArray(u?.pieces) || !u.pieces.some(p => p?.t === 'ph' && DISPLAY.test(p.src ?? '') && stopOfPiece(p))) return false
  return !!serialize(u).own || !!serializeTags(u).own
}

/** a plan's list of piece indices and blocks as the pieces, in order */
const placed = (pieces, list, out = []) => { for (const x of list) if (Array.isArray(x)) placed(pieces, x, out); else out.push(pieces[x]); return out }
/** a kept pair's open or close as its slot: the piece, or an edge where pieces ride beside it (its open's: what stands
 *  before its first word; its close's: what came after, merged pairs' ends among them) */
function edgeOf(pieces, it) {
  const { g } = it
  if (it.t === 'open') return g.lead.length ? { t: 'edge', pieces: placed(pieces, g.lead, [pieces[g.open]]) } : pieces[g.open]
  return g.end.length ? { t: 'edge', pieces: [...placed(pieces, g.end), pieces[g.close]] } : pieces[g.close]
}
/** the kept pairs whose source holds letters, innermost first, as rehydrate refills one that comes back empty: its
 *  open, the last piece of its open's slot (`a`), the first of its close's (`b`), its close */
const refillOf = (pieces, kept) => kept.filter(([g]) => g.letters).sort(([a], [b]) => b.depth - a.depth).map(([g, a, b]) => ({ open: pieces[g.open], a, b, close: pieces[g.close] }))
/** a text item's pieces as the wire writes them: white space collapsed, the unit's first and last pieces trimmed, one
 *  space where a piece off the wire stood between two that each had one */
function wireText(pieces, it, wire, esc, texts = null) {
  let out = ''
  for (let j = 0; j < it.ks.length; j++) {
    const k = it.ks[j]
    let s = (texts?.[k] ?? utf8(pieces[k].s)).replace(/\s+/g, ' ')
    if (k === 0) s = s.trimStart()
    if (k === pieces.length - 1) s = s.trimEnd()
    // (the wire's last character read only at a joint: reading it flattens the string the wire is being built as)
    if (it.joints[j] && s.startsWith(' ') && /\s/.test((out || wire).at(-1) ?? '')) s = s.slice(1)
    out += esc(s)
  }
  return out
}

/** backref's list after a bibliography entry, a placeholder of no source the front end ends the entry's unit in (latex-front.mjs
 *  BACKREF_LIST, written again here: this module may not import the front end; a test holds the two equal) */
export const BACKREF_LIST = '\\axtbackref'
/** a unit whose last piece is backref's list, as the wire takes it: the unit before the list, and what goes on no wire after the
 *  translation — an en space, the \enspace backref sets before the list (a kern, no ink of the list's), then the list. The list
 *  is no word of the entry's sentence: on the wire a translator read it as one, a page number, and wrote 页 before it (Microsoft's
 *  Chinese, "…2024.页26"); after the translation it is drawn where TeX set it, after the entry's text, its gap before it.
 *  Null for any other unit */
function listOf(u) {
  const last = u.pieces?.at(-1)
  if (last?.t !== 'ph' || last.src !== BACKREF_LIST) return null
  return { u: { ...u, pieces: u.pieces.slice(0, -1) }, after: [{ t: 'text', tr: true, s: ' ' }, last] }
}
/** a wire's plan with what goes after the translation on no wire put after the rest (`back`) */
const afterList = (made, list) => ({ ...made, back: [...(made.back ?? []), ...list.after] })

/** a unit as runs (translateUnits' last way): the markers wire's parts in order, each stretch of text between two of
 *  its markers one part (`text`, as the wire writes it, and its pieces `ks`), each marker one (`slot`), and what goes on
 *  no wire (`front`, `back`). A unit with no pair and no placeholder that sets no ink has a part for each of its pieces */
function runsOf(u) {
  const list = listOf(u)
  if (list) return afterList(runsOf(list.u), list)
  const { items, front, back } = planOf(u, 'markers')
  const parts = items.map(it => (it.t === 'text' ? { text: wireText(u.pieces, it, '', s => s).trim(), ks: it.ks } : { slot: it.t === 'void' ? it.slot : edgeOf(u.pieces, it) }))
  return { parts, front: placed(u.pieces, front), back: placed(u.pieces, back) }
}
/** a unit's pieces from its runs: each part's translation (`trOf`, its TeX, or null where none came back) in place of its
 *  text, with the white space its first and last pieces had; a part with none keeps its pieces */
function runPieces(u, { parts, front, back }, trOf) {
  const out = [...front]
  parts.forEach((part, k) => {
    if (part.text === undefined) { out.push(...piecesOf(part.slot)); return }
    const tr = trOf(k)
    if (tr === null) { out.push(...part.ks.map(i => u.pieces[i])); return }
    out.push({ t: 'text', tr: true, s: u.pieces[part.ks[0]].s.match(/^\s*/)[0] + tr + u.pieces[part.ks.at(-1)].s.match(/\s*$/)[0] })
  })
  out.push(...back)
  return out
}

/** a unit → the wire text, the table from marker id back to the original piece (a run's or an edge's pieces where a
 *  marker stands for several), and the markers the wire set apart from a full stop before them (`stops`), from a digit
 *  before them (`numbers`) and from one after them (`numbersAfter`), whose spaces rehydrate takes off again. What does
 *  not go on the wire (planOf): `front` and `back`, the pieces before and after the translation; `refill`, the kept
 *  pairs rehydrate refills. Each only where the unit has one: a unit with no pair and no placeholder that sets no ink
 *  is serialised as it was. `own`, the markers of displays whose own stop the wire wrote after them (marker id → the
 *  stop and its offset in the wire, `at`), after which rehydrate takes the reply's marks off again, and which
 *  sentencesOf counts nowhere */
export function serialize(u) {
  const list = listOf(u)
  if (list) return afterList(serialize(list.u), list)
  const slots = [], stops = new Set(), numbers = new Set(), numbersAfter = new Set(), hidden = new Map(), kept = new Map(), own = new Map()
  let wire = ''
  const lead = u.pieces[0]?.t === 'text' ? u.pieces[0].s.match(/^\s*/)[0] : ''
  const trail = u.pieces.at(-1)?.t === 'text' ? u.pieces.at(-1).s.match(/\s*$/)[0] : ''
  const { items, front, back, styled, texts } = planOf(u, 'markers')
  items.forEach((it, i) => {
    if (it.t === 'text') { wire += wireText(u.pieces, it, wire, escape, texts); return }
    const slot = it.t === 'void' ? it.slot : edgeOf(u.pieces, it)
    slots.push(slot)
    if (it.t === 'open') kept.set(it.g, [it.g, piecesOf(slot).at(-1)])
    else if (it.t === 'close') kept.get(it.g).push(piecesOf(slot)[0])
    const m = `@${toAlpha(slots.length)}#`
    if (it.hide) hidden.set(m, runShown(slot))
    // a marker touching a word is read as part of it by the engine (#254): a space of ours around it. So is one right
    // after a full stop, `models.@a#` — a citation or a footnote's mark after a sentence — which left the sentence's
    // last word in English (the HTML page's protector, 09c25622: 13 of 17 blocks as sent, none with the space); of nine
    // marks of punctuation before a closing marker only the period kept the word before it in English, 6 of 6 labels
    // as sent and 0 of 6 spaced (Microsoft, 2026-09-28): RT-1's run-in labels came back with "tokenization." and
    // "speed." in English
    const before = /[\p{L}\p{N}\p{M}.]$/u.test(wire) ? ' ' : ''
    if (wire.endsWith('.')) stops.add(slots.length)
    if (/\p{N}$/u.test(wire)) numbers.add(slots.length)
    const next = items[i + 1], nextText = next?.t === 'text' ? utf8(u.pieces[next.ks[0]].s) : ''
    const after = /^[\p{L}\p{N}\p{M}]/u.test(nextText) ? ' ' : ''
    if (/^\p{N}/u.test(nextText)) numbersAfter.add(slots.length)
    // a display's own stop, its sentence's end inside it, right after its marker: `yields @a#. Prices` — sent as
    // `yields @a# Prices`, 2610.10069's sentence ran on into the next one, and "yields" came back as a noun
    const stop = it.t === 'void' ? ownStopOf(slot, u.pieces, items, i) : null
    if (stop) own.set(slots.length, { stop, at: wire.length + before.length + m.length })
    wire += before + m + (stop ?? '') + after
  })
  // (a styled unit's wire trimmed whole, its ends' pieces off it; any other as it was)
  if (styled) { const cut = wire.length - wire.trimStart().length; wire = wire.trim(); if (cut) for (const o of own.values()) o.at -= cut }
  const f = placed(u.pieces, front), b = placed(u.pieces, back), refill = refillOf(u.pieces, [...kept.values()])
  // (`hidden` where a run went out: a unit without one is serialised as it was before runs; `front`, `back`, `refill` and
  // `own` likewise)
  return { wire, slots, lead, trail, stops, numbers, numbersAfter, ...(hidden.size ? { hidden } : {}), ...(f.length ? { front: f } : {}), ...(b.length ? { back: b } : {}), ...(refill.length ? { refill } : {}), ...(own.size ? { own } : {}) }
}

/** the pieces of a kept pair whose content came back empty (none of its text: the translator set it outside, 2610.19159's
 *  "After" behind the closes of its bold and its colour) take the text right after its close, past other closes, up to
 *  the end of its sentence, or else right before its open, past other opens, from the start of its sentence; a text
 *  without a letter stays where it is */
function refillPairs(pieces, refill) {
  const solid = p => p.t === 'text' && /[^\s]/.test(p.s)
  for (const r of refill ?? []) {
    const i = pieces.indexOf(r.a), j = pieces.indexOf(r.b)
    if (i < 0 || j <= i || pieces.slice(i + 1, j).some(solid)) continue
    let x = pieces.indexOf(r.close) + 1
    while (x > 0 && pieces[x]?.t === 'close') x++
    // (the words up to the end of their sentence alone: a link that came back empty takes no sentence after it)
    if (x > 0 && pieces[x]?.t === 'text') {
      const t = pieces[x], cut = t.s.search(STOP), inside = cut < 0 ? t.s : t.s.slice(0, cut)
      if (/\p{L}/u.test(inside)) {
        if (cut < 0) pieces.splice(x, 1); else pieces[x] = { ...t, s: t.s.slice(cut) }
        pieces.splice(j, 0, { ...t, s: inside })
        continue
      }
    }
    x = pieces.indexOf(r.open) - 1
    while (x >= 0 && pieces[x].t === 'open') x--
    if (x >= 0 && pieces[x].t === 'text') {
      const t = pieces[x], cut = Math.max(-1, ...[...t.s.matchAll(STOPS)].map(m => m.index)), inside = t.s.slice(cut + 1)
      if (/\p{L}/u.test(inside)) {
        if (cut < 0) pieces.splice(x, 1); else pieces[x] = { ...t, s: t.s.slice(0, cut + 1) }
        pieces.splice(pieces.indexOf(r.a) + 1, 0, { ...t, s: inside })
      }
    }
  }
}
const STOP = /[.!?\u3002\uff01\uff1f]/, STOPS = new RegExp(STOP.source, 'g')
/** whether a reply lost every letter of a wire that had one outside its markers or tags (`atoms`): the unit's text gone,
 *  its placeholders all back — 2610.19159's "Before", `@a#@b#@c#@d#@e# Before @f#@g#@h#` back as the markers alone —,
 *  which reads as whole and draws an empty box. An error: the unit goes as runs */
const lostText = (wire, atoms, pieces) => !pieces.some(p => p.t === 'text' && SAYS.test(p.s)) && /\p{L}/u.test(wire.replace(atoms, ''))
/** what a translation of words holds: a letter, or a digit (two is 2) */
const SAYS = /[\p{L}\p{N}]/u
/** the pairs of read pieces in order and nested */
const pairsInOrder = pieces => {
  const stack = []
  for (const p of pieces) {
    if (p.t === 'open') stack.push(p.id)
    else if (p.t === 'close' && stack.pop() !== p.id) return false
  }
  return !stack.length
}

/** the translation → pieces, or why it cannot be used. The space the wire set after a full stop before a marker is the
 *  wire's, not the source's: it is taken off the text before that marker, as the HTML page's protector takes its own
 *  (09c25622) — kept, `Fig.~\ref` came back as an ordinary space and then the tie (the review of A1, M3). Only while
 *  that text still ends in a full stop (any script's, as the HTML page's label.ts knows them), or before a piece a space
 *  never goes before: an engine that set a citation before the stop, `Modelle @a#.`, chose the space (the re-review of
 *  A1, m5), but one that wrote `Eq.~` out as `Gleichung @a#` did not — a space and then the tie. Over the ten papers'
 *  pieces set apart after a full stop, Microsoft's German, French, Spanish and Chinese left a space and no stop before
 *  34, 38, 49 and 12 of them: a tie, a control space or a group's end every one, a citation never */
const STOP_SPACE = /(?<=[.\u3002\uff0e\u0964\u0965\u06d4\u0589\u1362\u104b\u0f0d])[ \t\n\f\r]+$/, SPACE = /[ \t\n\f\r]+$/
/** The space the wire set beside a digit (a percent after a number, `95\%`; a times between two, `3$\times$10`) is the
 *  wire's too, taken off as the full stop's is: before the marker while the text there still ends in a digit, after it
 *  while the text there still begins with one. Kept, 95\% came back as "95 %" in 20 of 53 Chinese units with a percent
 *  after a number (the evaluation of the typesetting rule, 2026-10-01). A word's space (#254) stays the engine's — a
 *  letter, or a combining mark ending a word, before a marker: the common case, whose space was always kept */
const NUMBER_SPACE = /(?<=\p{N})[ \t\n\f\r]+$/u, NUMBER_LEAD = /^[ \t\n\f\r]+(?=\p{N})/u
/** a piece a space never goes before: one that is a space itself (a tie, a control space, a kern), a group's end.
 *  layer/pieces.mjs writes it again (the reader's layer may not import this module); a test holds the two equal */
export const SPACING = /^(?:~|\\[ ,;:]|\\(?:q?quad|enspace|thinspace|nobreakspace)(?![A-Za-z])|\\hspace\*?\{|\}$)/
/** a run of `#` the reply holds outside its markers, not an entity's (`&#39;`): the source's text holds none — TeX's
 *  `\#` and a bare `#` are placeholders (latex-front.mjs walk) —, so on the wire a `#` is a marker's, and is dropped
 *  wherever the reply set it; with it a pair of brackets that held nothing else (Microsoft's Japanese wrote 1706.03762's
 *  `auto-regressive @f#, consuming` back as `... @f#(#)...`, its marker read and `(#)` set as text) */
const STRAY = /(?<!&)#+/g
const STRAY_PAIR = /[ \t]*[([\uff08\u3010]\s*(?<!&)#+\s*[)\]\uff09\u3011]/g
export function rehydrate(text, { wire, slots, lead, trail, stops, numbers, numbersAfter, front, back, refill, own }, tolerant = false) {
  const pieces = [], seen = new Map()
  let last = 0, afterNumber = false, afterOwn = false
  // a text between two markers, the wire's spaces off it: after the one before it, before the one after it (`before`);
  // after a display's that carried its own stop, what the reply set for it (ownAfter) — once the wire's space after a
  // stop is off, which a marker right after the display's own (`@r#. @s#`) has from it
  const pushText = (s, before = null) => {
    s = s.replace(STRAY_PAIR, '').replace(STRAY, '')
    if (before) s = s.replace(before, '')
    // (the flag is the last marker's: each marker sets it)
    if (afterOwn) s = ownAfter(s)
    s = decode(s)
    if (afterNumber) s = s.replace(NUMBER_LEAD, '')
    if (s) pieces.push({ t: 'text', tr: true, s: texEscape(s) })
  }
  // read with the markers wire's one reader, the HTML page's (src/core/protector/tokens.ts markerReader): a marker's `#`
  // doubled is its own, a space between them or none — Microsoft wrote 2610.02069's `@e#` back as `@e##` and set the
  // second `#` as text ("El Ni ñ#", and "Figure 10#" in its Chinese), and `@d#` as `@d# #` in its Japanese — the
  // source's text holding no `#` of its own. Tolerant: the engine sometimes drops the closing # before a CJK character
  // or punctuation (@b形, @g。); a lone @ can only be a marker's remains, because a literal @ went out as @@, accepted
  // only when no letter follows, never inside a word. One read without its `#` leaves it where the reply set it (that
  // paper's unit 47 in Chinese: `@a` in the middle of the reply, a lone `#` at its end), dropped there as any stray `#`
  // is (STRAY)
  const re = markerReader(tolerant ? { hashFree: true, bare: { width: toAlpha(Math.max(1, slots.length)).length } } : { hashFree: true })
  let m, buf = ''
  while ((m = re.exec(text))) {
    buf += text.slice(last, m.index); last = re.lastIndex
    if (m[0] === '@@') { buf += '@'; continue }
    const id = fromAlpha(m[1] ?? m[2])
    if (!slots[id - 1]) return { error: 'unknown marker' }
    if (seen.has(id)) return { error: 'duplicated marker' }
    const wires = stops?.has(id) ? STOP_SPACE : numbers?.has(id) ? NUMBER_SPACE : null
    pushText(buf, wires && (SPACING.test(srcOf(slots[id - 1]) ?? '') ? SPACE : wires)); buf = ''
    // (a run's marker: the run's pieces, in their order, or none of them: a marker moved, lost or doubled is read as any is)
    seen.set(id, pieces.length); pieces.push(...piecesOf(slots[id - 1]))
    afterNumber = !!numbersAfter?.has(id)
    afterOwn = !!own?.has(id)
  }
  buf += text.slice(last); pushText(buf)
  if (seen.size !== slots.length) return { error: 'lost marker' }
  if (typeof wire === 'string' && lostText(wire, ATOM, pieces)) return { error: 'lost text' }
  return finish(pieces, { lead, trail, front, back, refill })
}
/** read pieces → the unit's: a kept pair come back empty refilled, what went on no wire put back around them, the
 *  pairs checked, the unit's white space at its two ends */
function finish(pieces, { lead, trail, front, back, refill }) {
  refillPairs(pieces, refill)
  const all = [...(front ?? []), ...pieces, ...(back ?? [])]
  // the two ends of a formatting group must stay in order and properly nested, or the braces stop balancing
  if (!pairsInOrder(all)) return { error: 'pair out of order' }
  if (lead) all.unshift({ t: 'text', s: lead }); if (trail) all.push({ t: 'text', s: trail })
  return { pieces: all }
}

// ---------------------------------------------------------------- sentences (plans/2026-10-01-pdf-highlight.md, B3)
/** what the wire writes as one thing, a boundary inside which goes to its end: a marker (read tolerantly too, `@b`
 *  without its `#`, and with its `#` doubled, `@e##` or `@e# #`, as rehydrate reads it), an escaped @, an entity */
const ENTITY = '&(?:#[xX][0-9a-fA-F]+|#\\d+|amp|lt|gt|quot|apos|nbsp);'
const ATOM = new RegExp(`@@|@[a-z]+(?:${MARKER_CLOSER})?|${ENTITY}`, 'g')
/** on the tags wire (an LLM's, Google's): a tag, an entity */
const TAG_ATOM = new RegExp(`(?:${TAG_RE.source})|${ENTITY}`, 'g')
/** each wire format's atoms, and how a reply is read back on it (strictly, or tolerantly where the format has a reading) */
const SENTENCE_WIRE = {
  markers: { atoms: ATOM, read: (text, ser, tolerant) => rehydrate(text, ser, tolerant) },
  tags: { atoms: TAG_ATOM, read: (text, ser) => rehydrateTags(text, ser) },
}
/** where a sentence begins in the reply, while it is read back: a private-use character, which no reply holds (one that
 *  did would give a sentinel too many, and no sentences) */
const SENTINEL = '\ue000'
const WORD = /^[\p{L}\p{N}]/u
const atomsOf = (s, re) => [...s.matchAll(re)].map(m => [m.index, m.index + m[0].length])
/** a boundary out of the atom it falls inside */
const outOf = (atoms, c) => { for (const [a, b] of atoms) if (c > a && c < b) return b; return c }
const cumulative = ls => { const out = []; let at = 0; for (const n of ls.slice(0, -1)) { at += n; out.push(at) } return out }
/** how many characters that are not white space the source wire writes before `c`: an escaped @ or an entity one, a
 *  marker or a tag none — the placeholder is a space in the plain text —, but a run's (serialize `hidden`), which stands
 *  for the text between its formulas too */
function shownBefore(wire, c, re = ATOM, hidden = null, owned = null) {
  let n = 0, i = 0
  // (a display's own stop the wire wrote after its marker, `owned` its offsets: the display's, which the plain source has not)
  const solid = k => !/\s/.test(wire[k]) && !owned?.has(k)
  for (const m of wire.slice(0, c).matchAll(re)) {
    for (; i < m.index; i++) if (solid(i)) n++
    if (m[0] === '@@' || m[0][0] === '&') n++
    n += hidden?.get(m[0]) ?? 0
    i = m.index + m[0].length
  }
  for (; i < c; i++) if (solid(i)) n++
  return n
}
/** the offset in a plain text where its `n`-th character that is no white space has been passed, and its first letter
 *  or digit from there: where a sentence's first word begins */
function wordAfter(text, n) {
  let i = 0
  for (let seen = 0; i < text.length && seen < n; i++) if (!/\s/.test(text[i])) seen++
  while (i < text.length && !WORD.test(text.slice(i, i + 2))) i++
  return i
}
const nonSpace = s => s.replace(/\s+/g, '').length
/** the pieces equal but for the sentinels and white space (the space rehydrate takes off before a stop-marker is not
 *  taken where a sentinel stands between) */
const sameBut = (withSentinels, b) => {
  const bare = s => s.split(SENTINEL).join('').replace(/\s+/g, '')
  // a sentinel between two markers is a text piece of its own, where the reply has none
  const a = withSentinels.filter(p => !(p.t === 'text' && !p.s.split(SENTINEL).join('')))
  return a.length === b.length && a.every((p, k) => (p.t === 'text' && b[k].t === 'text' ? bare(p.s) === bare(b[k].s) : p === b[k]))
}

/**
 * A unit's sentences as its engine cut them — Microsoft's own sentence lengths for the wire it was sent (`sentLen`, kept
 * by the extension's service as the segment's `alignment`, DESIGN §8.6: lengths in the wire's characters, one pair per
 * sentence, verified to partition both texts) — as where each sentence after the first begins: `src` the offsets of
 * their first words in the unit's plain source (plainSource, what the left side is anchored by), `tr` in its
 * translation's (plainTranslated of `pieces`, what the right side is). `text` the engine's reply, `pieces` what it was
 * read back as (rehydrate, `tolerant` or not). A boundary inside a marker goes to the marker's end — the engine cuts
 * inside the closing marker at a unit's end (`…@g|#`), and rarely inside one in the middle (report-B §2(a)) — and one
 * that then begins no sentence on either side (at the end, after its neighbour, or before a sentence with no word: a
 * formula alone) is dropped on both sides together, the two sentences around it read as one. Null where the lengths do
 * not partition both texts, or the reply's sentences cannot be read back as `pieces`: the unit is lit whole. `format`
 * the wire's: markers (Microsoft's own lengths), or tags (the service's markers at the cuts sent, cutsOf: Google, an
 * LLM; the lengths read where they landed, sentence-markers.ts), a boundary inside a tag or an entity to its end.
 * What a copy keeps (CachedUnit.sentences) is these offsets, and their meaning is three functions': plainSource and
 * plainTranslated, the texts they count in, and anchors.mjs tokens, which turns an offset into the word a side finds
 * (sentenceStarts). Those three are the record's contract: a change to any of them changes what a kept copy's offsets
 * name, and is a change of the record (TRANSLATE_VERSION for the first two, PIPELINE_VERSION for the third)
 */
export function sentencesOf(u, ser, text, alignment, pieces, tolerant = false, format = 'markers') {
  const { source, target } = alignment ?? {}, W = SENTENCE_WIRE[format]
  if (!W || !source?.length || source.length !== target?.length) return null
  if (source.reduce((a, b) => a + b, 0) !== ser.wire.length || target.reduce((a, b) => a + b, 0) !== text.length) return null
  const plain = plainSource(u), translated = plainTranslated(pieces)
  // (a display's own stop after its marker counts nowhere: a boundary before it or after it names the same place)
  const owned = ser.own ? new Set([...ser.own.values()].map(o => o.at)) : null
  if (shownBefore(ser.wire, ser.wire.length, W.atoms, ser.hidden, owned) !== nonSpace(plain)) return null
  const wireAtoms = atomsOf(ser.wire, W.atoms), textAtoms = atomsOf(text, W.atoms)
  const cs = cumulative(source).map(c => outOf(wireAtoms, c)), ct = cumulative(target).map(c => outOf(textAtoms, c))
  // the reply with a sentinel where each sentence begins, read back as the pieces were: the sentinels' places in its
  // plain text are the boundaries'
  let marked = '', last = 0
  for (const c of ct) { marked += text.slice(last, c) + SENTINEL; last = c }
  const back = W.read(marked + text.slice(last), ser, tolerant)
  if (back.error || !sameBut(back.pieces, pieces)) return null
  const withSentinels = plainTranslated(back.pieces)
  const tn = []
  for (let i = 0, n = 0; i < withSentinels.length; i++) { const ch = withSentinels[i]; if (ch === SENTINEL) tn.push(n); else if (!/\s/.test(ch)) n++ }
  if (tn.length !== ct.length) return null
  // each pair kept only where both sentences around it hold a word on both sides
  const words = s => tokens(s).length
  const total = [words(plain), words(translated)]
  const out = { src: [], tr: [] }
  let before = [0, 0]
  cs.forEach((c, j) => {
    const at = [wordAfter(plain, shownBefore(ser.wire, c, W.atoms, ser.hidden, owned)), wordAfter(translated, tn[j])]
    const k = [words(plain.slice(0, at[0])), words(translated.slice(0, at[1]))]
    if (k[0] <= before[0] || k[1] <= before[1] || k[0] >= total[0] || k[1] >= total[1]) return
    out.src.push(at[0]); out.tr.push(at[1]); before = k
  })
  return out
}

/**
 * A record's sentences (CachedUnit.sentences), where they are of their shape: as many starts on each side, each side's
 * whole numbers rising inside its text — `src` and `tr`, the texts each side is anchored by —; else null, and the unit
 * is lit whole (the review of B3, minor 5: a malformed field threw where the reader worked out the starts, and the
 * side had no highlight)
 */
export function sentencesKept(s, src, tr) {
  const ok = (xs, text) => Array.isArray(xs) && xs.every((o, j) => Number.isInteger(o) && o > (j ? xs[j - 1] : 0) && o < text.length)
  return s && typeof s === 'object' && ok(s.src, src) && ok(s.tr, tr) && s.src.length === s.tr.length ? s : null
}

// ---------------------------------------------------------------- tags wire format (DESIGN §6: LLMs)
const escapeTags = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** a unit → the wire text: <x id="n"/> for an opaque piece, <t id="n">…</t> around a formatting pair, which LLMs keep;
 *  same-style neighbours one pair, what sets no ink off the wire (planOf: `head` and `tail` what rides inside a pair's
 *  open and close, `front`, `back` and `refill` as serialize's) */
export function serializeTags(u) {
  const list = listOf(u)
  if (list) return afterList(serializeTags(list.u), list)
  const slots = [], hidden = new Map(), kept = [], own = new Map()
  let wire = ''
  const lead = u.pieces[0]?.t === 'text' ? u.pieces[0].s.match(/^\s*/)[0] : ''
  const trail = u.pieces.at(-1)?.t === 'text' ? u.pieces.at(-1).s.match(/\s*$/)[0] : ''
  const { items, front, back, styled, texts } = planOf(u, 'tags')
  const pairSlot = new Map()
  for (const [i, it] of items.entries()) {
    if (it.t === 'text') { wire += wireText(u.pieces, it, wire, escapeTags, texts); continue }
    if (it.t === 'open') { slots.push({ open: u.pieces[it.g.open] }); pairSlot.set(it.g, slots.length); wire += `<t id="${slots.length}">`; continue }
    if (it.t === 'close') {
      const n = pairSlot.get(it.g), slot = slots[n - 1]
      slot.close = u.pieces[it.g.close]
      if (it.g.lead.length) slot.head = placed(u.pieces, it.g.lead)
      if (it.g.end.length) slot.tail = placed(u.pieces, it.g.end)
      if (it.g.letters) kept.push([it.g, slot.head?.at(-1) ?? slot.open, slot.tail?.[0] ?? slot.close])
      wire += '</t>'
      continue
    }
    // (a run: one void for its pieces, as serialize sends it; a pair of placeholders alone too)
    slots.push({ void: it.slot })
    const x = `<x id="${slots.length}"/>`
    if (it.hide) hidden.set(x, runShown(it.slot))
    // (a display's own stop after its tag, as serialize writes it after its marker)
    const stop = ownStopOf(it.slot, u.pieces, items, i)
    if (stop) own.set(slots.length, { stop, at: wire.length + x.length })
    wire += x + (stop ?? '')
  }
  if (styled) { const cut = wire.length - wire.trimStart().length; wire = wire.trim(); if (cut) for (const o of own.values()) o.at -= cut }
  const f = placed(u.pieces, front), b = placed(u.pieces, back), refill = refillOf(u.pieces, kept)
  return { wire, slots, lead, trail, ...(hidden.size ? { hidden } : {}), ...(f.length ? { front: f } : {}), ...(b.length ? { back: b } : {}), ...(refill.length ? { refill } : {}), ...(own.size ? { own } : {}) }
}
/** the translation → pieces, or why it cannot be used; the model's common spellings of a tag are read as the extension reads them */
export function rehydrateTags(text, { wire, slots, lead, trail, front, back, refill, own }) {
  const pieces = [], seenVoid = new Set(), seenPair = new Set(), stack = []
  // the tags as the background's tokenizer reads them (src/core/protector/tokens.ts): `<x id="1"></x >` is one void
  const re = new RegExp(TAG_RE.source, 'g')
  let last = 0, m, afterOwn = false
  // (after a display's tag that carried its own stop, what the reply set for it is taken off, as rehydrate takes it)
  const pushText = s => { if (afterOwn) { s = ownAfter(s); afterOwn = false } const d = decode(s); if (d) pieces.push({ t: 'text', tr: true, s: texEscape(d) }) }
  while ((m = re.exec(text))) {
    const x = m[1] ?? m[2] ?? m[3], t = m[4] ?? m[5] ?? m[6]
    pushText(text.slice(last, m.index)); last = re.lastIndex
    if (x) { const n = Number(x), slot = slots[n - 1]; if (!slot?.void || seenVoid.has(n)) return { error: slot?.void ? 'duplicated placeholder' : 'unknown placeholder' }; seenVoid.add(n); pieces.push(...piecesOf(slot.void)); afterOwn = !!own?.has(n) }
    else if (t) { const n = Number(t), slot = slots[n - 1]; if (!slot?.open || !slot.close || seenPair.has(n)) return { error: 'bad pair' }; seenPair.add(n); stack.push(n); pieces.push(slot.open, ...(slot.head ?? [])) }
    else { const n = stack.pop(); if (!n) return { error: 'bad pair' }; pieces.push(...(slots[n - 1].tail ?? []), slots[n - 1].close) }
  }
  pushText(text.slice(last))
  if (stack.length) return { error: 'bad pair' }
  if (seenVoid.size !== slots.filter(x => x.void).length) return { error: 'lost placeholder' }
  if (seenPair.size !== slots.filter(x => x.open && x.close).length) return { error: 'lost pair' }
  if (typeof wire === 'string' && lostText(wire, TAG_ATOM, pieces)) return { error: 'lost text' }
  return finish(pieces, { lead, trail, front, back, refill })
}

/**
 * The wire formats as the extension's chain negotiates them (src/core/protector/tokens.ts), by `renderPath`: tags for an
 * LLM, markers for the free engines, runs for an engine that keeps no placeholder. Per format: a unit → its wire; a
 * translation → its pieces, and for markers once more tolerantly; a run's text on the wire and back. Under runs every
 * unit goes as its runs, escaped as tags are (src/cache/key.ts)
 */
export const WIRE = {
  markers: { serialize, rehydrate: (text, ser) => rehydrate(text, ser), tolerant: (text, ser) => rehydrate(text, ser, true), run: escape, unrun: s => decode(s.replace(/@@/g, '@')) },
  tags: { serialize: serializeTags, rehydrate: rehydrateTags, run: escapeTags, unrun: decode },
  runs: { run: escapeTags, unrun: decode },
}

// ---------------------------------------------------------------- Microsoft's free endpoint, as the extension calls it
export const MICROSOFT_LANG = { zh: 'zh-Hans', ja: 'ja', de: 'de' }
/** one request: texts → translations (null where the engine returned nothing) */
export async function translateMicrosoft(texts, to) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`https://edge.microsoft.com/translate/translatetext?${new URLSearchParams({ from: '', to: MICROSOFT_LANG[to] ?? to, isEnterpriseClient: 'false' })}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(texts) })
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      return json.map(item => item?.translations?.[0]?.text ?? null)
    } catch (e) { if (attempt === 3) throw e; await new Promise(r => setTimeout(r, 1500 * (attempt + 1))) }
  }
}
/** texts in requests of at most 2000 characters or 100 texts, `parallel` requests at a time */
export async function translateTexts(texts, to, { parallel = 4, send = translateMicrosoft } = {}) {
  const batches = []
  let cur = [], chars = 0
  for (const [i, w] of texts.entries()) { if (cur.length && (chars + w.length > 2000 || cur.length >= 100)) { batches.push(cur); cur = []; chars = 0 } cur.push(i); chars += w.length }
  if (cur.length) batches.push(cur)
  const out = new Array(texts.length).fill(null)
  let next = 0
  await Promise.all(Array.from({ length: parallel }, async () => {
    while (next < batches.length) {
      const b = batches[next++]
      const got = await send(b.map(i => texts[i]), to).catch(() => b.map(() => null))
      b.forEach((i, k) => { out[i] = got[k] ?? null })
    }
  }))
  return out
}

// ---------------------------------------------------------------- names
// The pipeline's cell rule (nameCells), kept apart from src/core/names.ts until a pipeline version moves
/**
 * Whether a short text (a table cell, a figure label) is only a name — a dataset, a model, a method — which, sent
 * alone and with no context, comes back as words (HellaSwag → 地狱之战, Magicoder → 魔法师), while the prose keeps
 * names as they are. At most three words, each of them a name: one with a digit or an inner capital (GSM8K,
 * DirectHarm4), all capitals (MATH, ASR), or a capitalised word the prose treats as a proper noun and never as a
 * common one — capitalised in the middle of a sentence (… and Aegis [16]) or as the start of a longer name (Beaver for
 * BeaverTails), and never in lower case. A capitalised word the prose writes in lower case too is a word, set in title
 * case in a heading or a term (Average, Score, Safety Dataset); one the prose never treats as a name is a word as well
 * (Compute). Of the two mistakes, translating a name (Aegis → 宙斯盾) misleads, leaving a word untranslated does not:
 * a doubtful case stays a name only on both kinds of evidence. `prose` is the running text.
 */
export function isName(text, prose) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  if (words.length > 3) return false
  const quote = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const proper = w => new RegExp(`[a-z,;:)\\]] ${quote(w)}(?![a-z])`).test(prose) || new RegExp(`(^|[^A-Za-z])${quote(w)}[A-Z]`).test(prose)
  const common = w => new RegExp(`(^|[^A-Za-z])${quote(w.toLowerCase())}($|[^A-Za-z])`).test(prose)
  const nameWord = w => { const bare = w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''); return !bare || /[0-9]/.test(bare) || /^[A-Z][^a-z]*$/.test(bare) || /^[A-Za-z][a-z]*[A-Z]/.test(bare) || (/^[A-Z][a-z]+$/.test(bare) && proper(bare) && !common(bare)) }
  return words.every(nameWord)
}
const shortUnit = u => u.kind === 'cell' || u.kind === 'figure'
const textOfUnit = u => u.pieces.filter(p => p.t === 'text').map(p => p.s).join(' ')
/** the running text isName reads a short text against: every unit's text but a table cell's and a figure's, and a
 *  bibliography's entries none of it (their titles are in title case, their names all proper nouns) */
export const proseOf = units => units.filter(u => u && !shortUnit(u) && u.kind !== 'reference' && u.kind !== 'refnames').map(textOfUnit).join('\n')
/** the table cells and figure texts that are only names (isName): they keep their source */
export function nameCells(units) {
  const prose = proseOf(units)
  return new Set(units.filter(u => shortUnit(u) && isName(textOfUnit(u), prose)))
}

/** what the sentence splitter reads a placeholder as (core/sentences SplitContext; the HTML page reads the node, here
 *  its LaTeX): a citation annotates the sentence before it, a footnote (a nested unit) too; \citet is its sentence's
 *  subject, a reference a number, an inline formula a word, a tie or a line break a space; anything else (a display, a
 *  macro) the splitter's stand-in word. Restated from investigator B's probe (report-B §2(a): against Microsoft's own
 *  boundaries on 532 units, 47 of ours alone — 3.6 %, mostly a run-in label by a placeholder — and 90 of its alone, 75
 *  of them semicolons) */
const CITE = /^\\(?:cite|citep|citealp|citeauthor|citeyear|parencite|footcite|nocite)\b/
const CITET = /^\\(?:citet|textcite|Citet)\b/
const REF = /^\\(?:ref|eqref|autoref|cref|Cref|pageref|nameref|Sref|secref|figref)\b/
function splitContextOf(slots) {
  const piece = id => slots[id - 1]?.void
  return {
    isAnnotation: id => { const p = piece(id); return !!p && (p.t === 'nested' || (p.t === 'ph' && CITE.test(p.src))) },
    textOf: id => {
      const p = piece(id)
      // (a run of formulas is a formula)
      if (p?.t === 'run') return 'x'
      if (p?.t !== 'ph') return undefined
      if (p.src === '~' || /^\\\\/.test(p.src)) return ' '
      if (CITET.test(p.src)) return 'Smith et al'
      if (REF.test(p.src)) return '1'
      if (/^(\$|\\\(|\\ensuremath)/.test(p.src)) return 'x'
      return undefined
    },
  }
}
/** a unit's sentence cuts on its tags wire (core/sentences sentenceCuts): offsets in `ser.wire` where a sentence after
 *  the first begins; [] for one sentence, which the service aligns whole */
export function cutsOf(u, ser = serializeTags(u)) {
  return sentenceCuts(ser.wire, 'tags', splitContextOf(ser.slots))
}

/** the characters of plain source a batch of units holds at most: the first small, so that it comes back soon, then larger.
 *  One rule for every run that sends a paper's units (live.mjs runLive's, layer-proto/rows.mjs batchesOf and runRows): a
 *  change to it changes the bytes a run sends */
export const FIRST_BATCH = 2500
export const NEXT_BATCH = 12000
/**
 * A batch: units from the front of `order`, as many as hold `max` characters (`sizeOf(i)` each), a unit never split and a
 * batch never empty (a unit over the limit goes alone)
 */
export function batchOf(order, sizeOf, max) {
  const batch = []
  let chars = 0
  for (const i of order) {
    const n = sizeOf(i)
    if (batch.length && chars + n > max) break
    batch.push(i)
    chars += n
  }
  return batch
}

/**
 * Units → Map unit → translated pieces. `send(texts, cuts)` returns the translations of a list of wire texts in `format`
 * (WIRE), `{ text, by, alignment? }` (engine.mjs); on the tags path the sentence cuts of each whole unit that may light
 * by sentence go with it (cutsOf: the service marks them and reads the translation's sentences back, DESIGN §8.6), on
 * the others none. What the placeholders cannot bring back, even tolerantly where the format has a tolerant reading, goes again
 * as runs; a unit none of whose runs came back is left out (it stays in the source language). `how` counts each way.
 */
export async function translateUnits(units, send, format = 'markers') {
  const wire = WIRE[format]
  // unit → { pieces, state, by, sentences? }: whole (read back strictly or tolerantly, or every run back), partial (some runs back),
  // none (the engine could not take it, runs included), lost (a failure of the service; engine.mjs, EngineError's
  // `lost`). `by` is the identity that answered, MIXED when runs of one unit had two (exp-freeze-2026-10-07:experiments/pdf-bilingual/REPORT.md, eighteenth addendum)
  const results = new Map(), how = { whole: 0, tolerant: 0, runs: 0, untranslated: 0, lost: 0 }, failed = []
  // what came back, when some texts did not for a reason not theirs (engine.mjs, EngineError's `lost`): those stay in
  // the source language, counted, and the failure is kept — sent again piece by piece they would only fail again, as
  // many times over as they have pieces (PDF-READER §10.3)
  const ask = async (texts, cuts) => {
    try { return { texts: await (cuts ? send(texts, cuts) : send(texts)), lost: null } } catch (e) {
      if (!e?.partial) throw e
      how.error ??= e.kind
      return { texts: e.partial, lost: e.lost }
    }
  }
  if (wire.serialize) {
    const sers = units.map(wire.serialize)
    // the cuts of the units that may light by sentence: on Google each marked sentence is translated apart (B3b: the
    // wording changed in 79 of 85 units), so a unit lit whole (a heading, a caption, a cell) goes as it would unmarked
    const cuts = format === 'tags' ? units.map((u, i) => (bySentence(u.kind) ? cutsOf(u, sers[i]) : undefined)) : undefined
    const { texts, lost } = await ask(sers.map(s => s.wire), cuts)
    units.forEach((u, i) => {
      if (lost?.has(i)) { how.lost++; results.set(u, { state: 'lost' }); return }
      const got = texts[i]
      if (got == null) { failed.push(u); return }
      // a whole unit keeps its sentences where the engine's alignment came back (sentencesOf: Microsoft's own on markers,
      // the service's markers at the cuts on tags; the runs below have no wire offsets to hang them on)
      const whole = (pieces, tolerant) => {
        const sentences = got.alignment ? sentencesOf(u, sers[i], got.text, got.alignment, pieces, tolerant, format) : null
        results.set(u, { pieces, state: 'whole', by: got.by, ...(sentences ? { sentences } : {}) })
      }
      const strict = wire.rehydrate(got.text, sers[i])
      if (!strict.error) { whole(strict.pieces, false); how.whole++; return }
      const loose = wire.tolerant?.(got.text, sers[i])
      if (loose && !loose.error) { whole(loose.pieces, true); how.tolerant++; return }
      failed.push(u)
    })
  } else failed.push(...units)
  // the runs: each stretch of text between the markers wire's markers (planOf), whole — never cut where a pair that
  // went flat or a placeholder that sets no ink stood, which gave each word of 2610.19159's coloured runs alone
  const runs = [], plans = new Map()
  for (const u of failed) {
    const plan = runsOf(u)
    plans.set(u, plan)
    plan.parts.forEach((part, k) => { if (part.text !== undefined && (part.text.match(/\p{L}/gu) ?? []).length >= 2) runs.push({ u, k, wire: wire.run(part.text) }) })
  }
  const { texts: runTexts, lost: runsLost } = runs.length ? await ask(runs.map(r => r.wire)) : { texts: [], lost: null }
  const byUnit = new Map(), total = new Map()
  runs.forEach((r, j) => {
    total.set(r.u, (total.get(r.u) ?? 0) + 1)
    // (a reply that lost every letter and digit of its run is none: the run stays the source's)
    if (runTexts[j] != null && SAYS.test(wire.unrun(runTexts[j].text ?? ''))) (byUnit.get(r.u) ?? byUnit.set(r.u, new Map()).get(r.u)).set(r.k, runTexts[j])
  })
  const lostUnits = new Set(runs.filter((r, j) => runsLost?.has(j)).map(r => r.u))
  for (const u of failed) {
    const got = byUnit.get(u)
    if (!got?.size) {
      if (lostUnits.has(u)) { how.lost++; results.set(u, { state: 'lost' }) } else { how.untranslated++; results.set(u, { state: 'none' }) }
      continue
    }
    const ids = new Set([...got.values()].map(g => g.by))
    // some runs back and some lost to the service: lost, so that it is tried again — partial is for a unit the engine
    // could not take whole, which another try would not change (final review); what came back is shown meanwhile
    const whole = got.size === total.get(u)
    results.set(u, {
      pieces: runPieces(u, plans.get(u), k => (got.has(k) ? texEscape(wire.unrun(got.get(k).text)) : null)),
      state: whole ? 'whole' : lostUnits.has(u) ? 'lost' : 'partial',
      by: ids.size === 1 ? [...ids][0] : MIXED,
    })
    if (!whole && lostUnits.has(u)) how.lost++
    else how.runs++
  }
  return { results, how }
}

/** a text piece as the compiled PDF shows it: a translation's TeX escapes undone, the source's bytes as UTF-8.
 *  layer/pieces.mjs writes it again (the reader's layer may not import this module); a test holds the two equal */
export const shown = p => (p.tr ? p.s.replace(/\\(textbackslash|textasciitilde|textasciicircum)\{\}/g, ' ').replace(/\\([#$%&_{}])/g, '$1') : utf8(p.s))
const plain = (pieces, textOf) => pieces.map(p => (p.t === 'text' ? textOf(p) : ' ')).join('').replace(/\s+/g, ' ').trim()
/** a unit's plain text in the source (placeholders dropped: anchors are found from text alone) */
export const plainSource = u => plain(u.pieces, p => utf8(p.s))
/** a unit's plain text in its translation, as the compiled PDF shows it */
export const plainTranslated = pieces => plain(pieces, shown)
const SLOT = '￼'
/**
 * A unit's plain text as the PDF shows it (plainTranslated's, which is plainSource's for pieces not translated) and
 * `gaps`, the offsets in it where a placeholder stood: there the page has words the text does not — a formula's, a
 * citation's number — which anchors.mjs lets stand in a run of words (a heading, Round $n$: …). Without placeholders,
 * no `gaps`
 */
export function unitText(pieces) {
  const text = plainTranslated(pieces)
  if (!pieces.some(p => p.t === 'ph' || p.t === 'nested')) return { text }
  const slotted = pieces.map(p => (p.t === 'text' ? shown(p) : p.t === 'ph' || p.t === 'nested' ? ` ${SLOT} ` : ' ')).join('').replace(/\s+/g, ' ').trim()
  let bare = ''
  const gaps = []
  for (const c of slotted) {
    if (c === SLOT) { if (gaps.at(-1) !== bare.length) gaps.push(bare.length) } else if (c !== ' ' || (bare && !bare.endsWith(' '))) bare += c
  }
  // the text is plainTranslated's, character for character, or the offsets would name other places: a text holding
  // the slot character itself gives none
  if (bare.trimEnd() !== text) return { text }
  return { text, gaps: gaps.map(g => Math.min(g, text.length)).filter((g, i, a) => a.indexOf(g) === i) }
}
/**
 * Each unit's text as a compile has it, for the anchors: translated where `done` has its pieces, the source's otherwise;
 * with where its placeholders stood (unitText), its displays beyond its marks (displayEdges) and the sentences of the
 * translation typeset (`sentencesOf(pieces)`: kept by the pieces they belong to, so that a translation come in since does
 * not lend its sentences to the one shown)
 */
export const textsShown = (units, done, sentencesOf) => units.map((u, i) => {
  const pieces = done.get(u), sentences = pieces && sentencesOf(pieces)
  return { id: i, ...unitText(pieces ?? u.pieces), ...displayEdges(u), ...(sentences ? { sentences } : {}) }
})
/** the unit's displays beyond its marks and between its words, their letters as latex-front found them (displayOutside)
 *  or a copy keeps them: for the anchors. A copy made when they were a bare `true` gives none */
export const displayEdges = u => Object.fromEntries(['lead', 'trail', 'inner'].filter(k => typeof u[k] === 'string').map(k => [k, u[k]]))
