// The front half's adapter (the rebuild's stage 1a; the one front half since the rebuilt one was deleted on 2026-11-09, DESIGN
// §16): the one adapter from today's front end, marks and compile outputs to the prepare's seam, the Instrument
// (packages/engine/src/instrument.ts). The only code that knows
// today's shapes on the back half's side. What it reads is what wrapFinal reads before it wraps (layout/wrap-final.mjs): our
// marked final pass B read once by the engine package's readPdf (pageInk with the wrap's options: the same pages wrapFinal
// reads), each glyph's and rule's owner by today's ownership of the source units (own.mjs by the marks' points), and TeX's
// statements in the marked compile's log (the units' alignments, \lineskip, each page's text frame). It writes nothing and wraps nothing: the back half
// carries the ownership onto arXiv's page. It states source units alone: the ink units, kept blocks and figure texts (today's
// ledger, ink-units.mjs, figure-text.mjs) are made by the back half's locate on arXiv's page, of the glyphs no source unit owns
// there (packages/engine/src/locate/ink.ts), from B's marks the Doc carries (its points and DocPage.marks).
//
// The units, in today's bundle's order, so that a unit's index is today's id: the paper's source units, its names (cleveref's
// and the counters' words, kind `name`); then one unit for each babel name's key that occurs (kind `name`, `name` its key:
// drawn in the target's word, never translated). Each unit's content is today's pieces typed: a text, an element (`el`, its kind marks.mjs classOf's,
// `other` for an invisible one), a group's open and close as a span (its style read off its command, a link's `must`), a nested
// unit; strings as Unicode (today's engine holds them as UTF-8 bytes read latin1), its id format's unitId.
import { boxedAlignOf, framesOf, readAlign, readBoxAlign, readCellBoxes, readRefNames, readSkips } from '../marks/channels.ts'
import { groupFacts } from '../marks/faces.ts'
import { holdsLetter } from '../locate/figure-lines.ts'
import { linkTargetOf } from '../locate/ink.ts'
import { ownersOf, ROLE } from '../instrument.ts'
import { readPdf } from '../read.ts'
import { runIns } from '../marks/run-ins.ts'
import { unitId } from '@readarxiv/format'
import { classOf, followsOf, headEnd, INK_ANY, leadStep, readColours, readSkipProbe, refKeyOf, refKeysOf } from '../marks/marks.mjs'
import { ownOf } from '../own/own.mjs'
import { READ_ALONE, regionsOf, WANT } from '../own/stream.mjs'
import { BACKREF_LIST, lastTexLog, startOf } from '../source/latex-front.mjs'
import { bundleUnitsOf } from './units.ts'
import { phClass, texToText } from './layer1.mjs'
import { textPieceOf } from '../source/text-piece.ts'
import { symbolText } from '../source/text-symbols.mjs'
import { displayStop, isInkless } from './mt.mjs'
import { keptAsWritten, namesOfBlocks, paperNamesOf, RUNNING } from './language.ts'

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

/** what today's wire reads of an element's source, stated so that no translator reads a source: backref's list set after the
 *  unit's text (`after`, BACKREF_GAP); a display's own stop
 *  (mt.mjs displayStop: the punctuation it sets at its end that is its sentence's, `x = y.`, which a wire writes after the
 *  element so that the sentence ends there: in Microsoft's recorded answers no display ending its sentence had the sentence cut
 *  after it, 0 of 444, a marker before `. ` and a capital every time, 1,357 of 1,357, TRANSLATE_VERSION 5), and an element that
 *  sets nothing where it stands (mt.mjs isInkless, from TeX's tables: a declaration, a key written to a file, a penalty,
 *  `\noindent`, `\-`, a table's row rule; never a space, a break, a fill or a skip), which no translator needs: a marker for
 *  it is a hard boundary to Microsoft (2610.19159's `\bfseries` before every coloured word, 13,000 markers and word salad,
 *  TRANSLATE_VERSION 3 and 10) */
const wireFacts = p => {
  if (p.src === BACKREF_LIST) return { after: BACKREF_GAP }
  const stop = displayStop(p.src)
  return { ...(stop ? { stop } : {}), ...(isInkless(p) ? { silent: 1 } : {}) }
}
/** backref's list after a bibliography entry (latex-front.mjs BACKREF_LIST: the piece the front end ends the entry's first
 *  paragraph in, no byte of the source, its ink between the marks LAYOUT_TEX's hook sets around the list): TeX sets it after the
 *  entry's text and is no word of it — backref.sty's parscan reads the entry to its paragraph's end (`\BR@@bibitem#1#2\par`),
 *  sets it, then the list (\BR@backref, \newblock's glue before it) —, stated `after` with the white space today's wire puts
 *  before it after the translation (mt.mjs listOf, TRANSLATE_VERSION 7: an en space; on the wire Microsoft's Chinese read the
 *  list's marker as a page number and wrote the character for "page" before it, 2610.37668v1, 5 of 41 entries) */
const BACKREF_GAP = '\u2002'
/** today's flat pieces ([open … close] pairs) as nested ones, and its run-in labels `must` (runIns); a source unit's are stated
 *  once TeX's glyphs are read (piecesOf, marksOf) */
export const contentOf = (pieces, o = {}) => runIns(piecesOf(pieces, o))
/**
 * The pieces of a unit's groups that carry nothing, by index, each open with its close: a pair the front end read as setting its
 * argument alone (latex-front.mjs identityPair, the open piece's `sets` 0: RevTeX's `\\bibinfo{title}{…}` and name fonts, a
 * `.bbl`'s `\\showarticletitle`, a paper's `\\newcommand{\\x}[1]{#1}`), or a bare group `{…}` that holds no declaration of its own
 * (no placeholder that sets nothing at its own level, mt.mjs isInkless: a switch it would scope), both of its ends in the unit.
 * Such a group sets no face, no fill, no link and no paragraph of its own (TeX sets its content as it would with no group), and
 * a span of it has nothing to carry but costs a tag pair on the tags wire: it is its content (lane style-wire C, the coordinator's
 * ruling of 2026-11-11). Over the 88 papers' bundles, 20,172 pairs and 2,943 bare groups, every fill on one also its link's around
 * it; a group the front end says nothing of, as `\\enquote` (its quotes TeX's), stays one
 */
export function passThroughOf(pieces) {
  const out = new Set()
  pieces.forEach((p, k) => {
    if (p.t !== 'open' || (p.sets !== 0 && p.src !== '{')) return
    let depth = 0
    for (let j = k + 1; j < pieces.length; j++) {
      const q = pieces[j]
      if (q.t === 'open') depth++
      else if (q.t === 'close') {
        if (depth--) continue
        out.add(k).add(j)
        return
      } else if (!depth && p.sets !== 0 && q.t === 'ph' && isInkless(q)) return
    }
  })
  return out
}
/** a bibliography's source units (the front end's: an entry, its names) */
const BIB_UNITS = new Set(['reference', 'refnames'])
/** the face declarations that draw nothing (TeX's shape and series switches): a bare group one opens sets that face */
const FACE_SWITCH = /^\\(?:em|it|itshape|sl|slshape|bf|bfseries|sc|scshape)(?![A-Za-z@])/
/** the face each of those switches sets, as a group's style names it */
const SWITCH_FACE = { em: 'italic', it: 'italic', itshape: 'italic', sl: 'italic', slshape: 'italic', bf: 'bold', bfseries: 'bold', sc: 'sc', scshape: 'sc' }
/**
 * Each bare group whose first piece (white space aside) is a face switch that draws nothing (`{\\em …}`, `{\\bfseries …}`,
 * `{\\scshape …}`): by its open's index, the switch's index, its name and the face it sets. TeX sets `{\\em x}` as it sets
 * `\\emph{x}`: the switch gives the group its face and sets nothing where it stands, so it is the group's face and command (its
 * style, SpanAt.cmd), no element of its text, and the group is stated as `\\emph{…}`'s is. Read as an element, the group was
 * `other`: the typesetter drew its face off the element alone, so a translation that lost the element lost the face; a group
 * holding an element is placed nowhere (packages/translate groups.ts); the tags wire sent an empty element first in its pair.
 * Over r19's bundles (2026-11-12) 610 bibliography units in 22 papers held an italic stretch on arXiv's page their unit stated as
 * no italic group, 589 of them in such a group (16,680 letters; PDF-READER §18.56). A size, a family, a colour, a switch that is
 * not first: as before
 */
export function switchesOf(pieces) {
  const out = new Map()
  pieces.forEach((p, k) => {
    if (p.t !== 'open' || unicodeOf(p.src ?? '').trim() !== '{') return
    let j = k + 1
    while (pieces[j]?.t === 'text' && !/\S/.test(pieces[j].s)) j++
    const q = pieces[j]
    const m = q?.t === 'ph' && isInkless(q) ? /^\\([A-Za-z]+)\s*$/.exec(unicodeOf(q.src ?? '')) : null
    if (m && Object.hasOwn(SWITCH_FACE, m[1])) out.set(k, { at: j, cmd: m[1], face: SWITCH_FACE[m[1]] })
  })
  return out
}
/** the indices of the switches switchesOf makes their groups' faces (no element of the unit's text) */
const switchedOf = pieces => new Set([...switchesOf(pieces).values()].map(x => x.at))
/**
 * In a bibliography entry, the face groups that fill a field whose pair passThroughOf writes as its content (`\\bibinfo{journal}{
 * \\emph{…}}`, REVTeX's `\\bibfield{journal}{\\emph{\\bibinfo{journal}{…}}\\ }`): each of the group's ends stands at such a pair's
 * edge, outside it or inside it, white space aside. Today's wire (mt.mjs planOf) sends a .bbl field's pair as markers, a pair
 * that sets more than a style, and a face group whose two ends stand at those markers is kept by its boundary rule, so its face
 * comes back: on the parity's pairs, 86 of 86 such fields came back whole, 61 of them inside a clause (lane style-wire, the
 * coordinator's ruling of 2026-11-11). With the field's pair no group (C) and a markers wire that sends `must` groups alone, v2
 * drew those faces upright (round 8 B8's toggles-on sheet: 32 references). So such a face group is `must`: what production shows,
 * nothing more; a face that fills no field stays upright on a markers wire, in production and in v2 alike. A face group: a
 * command that sets italic, bold or small capitals (styleOf), or a bare group a face switch opens (`{\\em …}`), holding text of
 * its own on the wire (not placeholders alone: a volume's number is its original's ink, its face with it). By open's index
 */
export function fieldFacesOf(pieces) {
  const through = passThroughOf(pieces), out = new Set()
  // (each close's open: a field's close is a field's by its open)
  const openOf = new Map(), opens = []
  pieces.forEach((p, k) => { if (p.t === 'open') opens.push(k); else if (p.t === 'close' && opens.length) openOf.set(k, opens.pop()) })
  const field = k => { const o = pieces[k].t === 'close' ? openOf.get(k) : k; return o !== undefined && through.has(o) && pieces[o].sets === 0 && pieces[o].src !== '{' }
  const solid = q => !(q.t === 'text' && !/\S/.test(q.s))
  const before = k => { for (let j = k - 1; j >= 0; j--) if (solid(pieces[j])) return j; return -1 }
  const after = k => { for (let j = k + 1; j < pieces.length; j++) if (solid(pieces[j])) return j; return -1 }
  const stack = []
  pieces.forEach((p, k) => {
    if (p.t === 'open') stack.push(k)
    else if (p.t === 'close' && stack.length) {
      const o = stack.pop()
      if (through.has(o)) return
      const src = unicodeOf(pieces[o].src ?? '').trimStart(), first = pieces[after(o)]
      const face = ['italic', 'bold', 'sc'].includes(styleOf(src)) || (src === '{' && first?.t === 'ph' && FACE_SWITCH.test(unicodeOf(first.src ?? '')))
      // (and text of its own on the wire: a group holding placeholders alone, REVTeX's `\\textbf{\\bibinfo{volume}{27}}`, goes as one
      // marker on today's wire and its number's ink carries its face)
      if (!face || !pieces.slice(o + 1, k).some(q => q.t === 'text' && /\S/.test(q.s))) return
      const b = before(o), i = after(o), e = after(k), l = before(k)
      const opens = (b >= 0 && pieces[b].t === 'open' && field(b)) || (i >= 0 && i < k && pieces[i].t === 'open' && field(i))
      const closes = (e >= 0 && pieces[e].t === 'close' && field(e)) || (l > o && pieces[l].t === 'close' && field(l))
      if (opens && closes) out.add(o)
    }
  })
  return out
}
/** where each group passThroughOf writes as its content opened, as offsets in the unit's projection (each text piece's characters,
 *  each element or nested unit one): the engine's facts pass counts a paragraph TeX opened at one, which must be none
 *  (InstrumentUnit.passed, Located.stats.opensLost) */
export function passedOf(pieces) {
  const through = passThroughOf(pieces), switched = switchedOf(pieces), out = []
  let at = 0
  pieces.forEach((p, k) => {
    if (p.t === 'text') at += unicodeOf(p.s).length
    else if ((p.t === 'ph' && !switched.has(k)) || p.t === 'nested') at += 1
    else if (p.t === 'open' && through.has(k)) out.push(at)
  })
  return out
}
/** today's flat pieces ([open … close] pairs) as nested ones: an open starts a span, a close ends the innermost; a close with no
 *  open wraps what came before it at its level (the group began before the unit), an open left at the end has no close; an
 *  element's wire facts (wireFacts), and a reference's item's full name where the marked compile stated one, with the language
 *  TeX declared for it (`nameOf` { name, lang }: the engine's readRefNames over marks.mjs refsTex's statements) */
export function piecesOf(pieces, { kindOf = () => 'other', idOfNested = () => null, nameOf = () => undefined, bib = false } = {}) {
  let level = []
  const stack = []
  // (a group that carries nothing is its content, its text joined with the text on either side: passThroughOf; in a
  // bibliography entry a face group that fills such a field is `must`: fieldFacesOf)
  // (a face switch first in a bare group is the group's face, no element of its text: switchesOf)
  const through = passThroughOf(pieces), faces = bib ? fieldFacesOf(pieces) : new Set(), switches = switchesOf(pieces)
  const switched = new Set([...switches.values()].map(x => x.at))
  let seam = false
  pieces.forEach((p, k) => {
    const id = String(k)
    if (through.has(k) || switched.has(k)) { seam = true; return }
    const joined = seam
    seam = false
    switch (p.t) {
      case 'text': { const s = unicodeOf(p.s), last = level.at(-1); if (joined && last?.t === 'text') last.s += s; else level.push({ t: 'text', s }); break }
      case 'ph': { const n = nameOf(p); level.push({ t: 'el', id, kind: kindOf(p) ?? 'other', src: unicodeOf(p.src), ...wireFacts(p), ...(n?.name ? { name: n.name, ...(n.lang ? { nameLang: n.lang } : {}) } : {}) }); break }
      case 'nested': level.push({ t: 'unit', id, unit: idOfNested(p.unit) ?? '0'.repeat(64), pre: unicodeOf(p.pre), post: unicodeOf(p.post) }); break
      case 'open': {
        const style = switches.get(k)?.face ?? styleOf(unicodeOf(p.src))
        const span = { t: 'span', id, style, ...(style === 'link' || faces.has(k) ? { must: 1 } : {}), open: unicodeOf(p.src), content: [] }
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
  return stack.length ? stack[0].outer : level
}
/** each source unit's text glyphs on B (the owners' ROLE.text of it), in B's stream order (page by page, each page's in its
 *  order), by unit index: `doc` B's pages as read, `owners` the instrument's glyph owners by page */
export function textGlyphsOf(doc, owners) {
  const out = new Map()
  doc.pages.forEach((pg, p) => {
    const O = owners[p]
    if (!O) return
    pg.glyphs.forEach((g, j) => {
      if (O.role[j] !== ROLE.text || O.unit[j] < 0) return
      const u = O.unit[j]
      ;(out.get(u) ?? out.set(u, []).get(u)).push(g)
    })
  })
  return out
}
/** a group's open that is a command (a paper's macro, a class's), not a bare group, whose switches inside say its style */
const COMMAND = /^\\[A-Za-z@]/
/**
 * What TeX set for a source unit's groups that their source does not say, stated (packages/engine/src/marks/faces.ts over its
 * text glyphs on B, `glyphs`): a group whose command names no style the table knows (its style `other`: a paper's macro, as
 * 2608.25210v2's `\topic{…}` that sets its argument `{\bf #1.}`), set in a face that is not the face around it, states that
 * face (its `style` named for what it changes, its group's facts in `spans` the face's Style); any group the stop TeX set at its
 * end that its source does not write (`stop`). Then the unit's run-in labels `must` (runIns), each group of a face so read a
 * style group. `textOf` the text TeX sets for an element whose glyphs are the unit's text (a text macro's, PieceClass `text`).
 * In place; returns `spans` (spansOf's, by open piece id) with the faces stated
 */
export function marksOf(content, glyphs, spans = [], textOf = () => undefined) {
  const facts = groupFacts(content, glyphs, textOf)
  const faced = new Set()
  const styles = new Map()
  for (const [s, f] of facts) {
    if (f.stop) s.stop = f.stop
    if (!f.style || s.style !== 'other' || !COMMAND.test(s.open ?? '')) continue
    s.style = f.change
    faced.add(s)
    styles.set(s.id, f.style)
  }
  runIns(content, faced)
  return spans.map(([id, x]) => (styles.has(id) ? [id, { ...x, style: styles.get(id) }] : [id, x]))
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
/** what a character TeX sets as written stands for while texToText2 reads the source: none of the characters it reads */
const AS_WRITTEN = { _: '\uE010', '^': '\uE011' }
/** the commands whose argument TeX sets a character at a time, as written (textPieceOf's verbatim ones) */
const VERBATIM_CMD = /^\\(?:url|path|verb|lstinline)(?![A-Za-z@])/
/**
 * An element's copy text: its source as texToText2 reads it, a character TeX sets as written read as itself, never as a
 * script's mark. texToText2 reads `_x` as the subscript "ₓ", after reading `\_` as "_": an identifier's copy, what a reader
 * selects on its crop, was "conv3ₓ" for `conv3\_x`, "verify_boundaryₗaw" for `verify\_boundary\_law`, and 2610.20808v1's
 * `\path{data/current_soda_protocol.json}` "data/currentₛodaₚrotocol.json" (213 elements of 29 of the 88 papers, stage 1a).
 * LaTeX's `\_` and `\textunderscore` set the underscore and `\textasciicircum` the caret, in text and in math (`\nfss@text`), the
 * spaces after a control word TeX's to skip; a verbatim argument (\url, \path, \verb, \lstinline: a text piece's, textPieceOf)
 * sets its `_` and `^` as written. A bare `_` or `^` anywhere else is TeX's script
 */
function copyOf(src) {
  let s = textPieceOf(src) && VERBATIM_CMD.test(src) ? src.replace(/[_^]/g, (c) => AS_WRITTEN[c]) : src
  s = s.replace(/\\(?:([A-Za-z@]+)[ \t]*(?:\r?\n[ \t]*)?(?:\{\})?|([^A-Za-z@]))/g, (m, word, sym) =>
    sym === '_' || word === 'textunderscore' ? AS_WRITTEN._ : word === 'textasciicircum' ? AS_WRITTEN['^'] : m,
  )
  if (s === src) return texToText2(src)
  return texToText2(s).replace(/\uE010/g, '_').replace(/\uE011/g, '^')
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
/**
 * The kind a bundle's element states (the translator contract's ElKind, what a sentence cutter reads it as): a tie `~` a
 * `space` (TeX's interword space, which it sets whatever the space factor: the author's word that a stop before it ends no
 * sentence), a forced line break a `break` (FORCED_BREAK: a line's end, which in a paragraph separates its words as a space
 * does), each read so by today's cutter (mt.mjs splitContextOf); any other today's classOf's, `other` where it names none.
 * Before, both were `other`, which the package's cutter reads as a word: `R.~S.~Sutton` was cut after its initials, and a line
 * after `\\` ran on into the next only by the source's own line end (lane fig-cut, 2026-11-10). Neither enters a unit's id
 * (format's unitId reads an element's source)
 */
export const elementKindOf = p => (isTie(p) ? 'space' : FORCED_BREAK.test(p?.src ?? '') ? 'break' : (classOf(p) ?? 'other'))
/** a tie: the front end's placeholder for the source's `~` (latex-front.mjs, its one spelling of TeX's \nobreakspace; the
 *  command `\nobreakspace` itself is read as one that sets no ink, marks.mjs INVISIBLE_WORDS): \penalty10000 and interword
 *  glue, a space no line breaks at (PieceClass.tie, El.tie) */
export const isTie = p => p?.src === '~'
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
/** each group's facts by its open piece's id: the command its open begins with (a bare group's, the face switch it opens:
 *  switchesOf), the fill TeX set its run in, and a link group's target where its source names it (the engine's linkTargetOf:
 *  an \href's or a \url's address, a \hyperlink's destination), which the typesetter pairs the group's translation with its
 *  annotations by */
export function spansOf(pieces, colours = null) {
  const out = []
  const through = passThroughOf(pieces), switches = switchesOf(pieces)
  pieces.forEach((p, k) => {
    if (p.t !== 'open' || through.has(k)) return
    // (a bare group a face switch opens: that switch its command, as `\\emph{`'s is its group's, switchesOf)
    const sw = switches.get(k)
    const c = sw ? { cmd: sw.cmd } : commandOf(unicodeOf(p.src))
    const to = linkTargetOf(pieces, k)
    const x = { ...(c ? { cmd: c.cmd } : {}), ...(colours?.has(k) ? { colour: colours.get(k) } : {}), ...(to ? { to } : {}) }
    if (Object.keys(x).length) out.push([String(k), x])
  })
  return out
}

/** each element's class as today's reader reads its source (layer2.mjs phClassProven, its symbol phClass2's; texToText2, its copy text; a symbol's drawn
 *  text and raise, resolvePlaceholders L2:1395-1403; a footnote's mark, L2:1404): what the part states of it, by piece id;
 *  and what the rest of the rules read of its source (sourceFactsOf), `colours` the unit's colour pieces' fills by index */
/** a control sequence url.sty's \\urldef defines (`\\urldef\\cs\\url{…}`, a url command's), stored as that command sets it */
const URL_DEF = /^\\urldef\s*$/, CS = /^\\[A-Za-z@]+\s*$/, URL_CMD = /^\\(?:url|nolinkurl|path|burl)\s*[{|!+]/
/** a piece that sets a control sequence, alone or as a command's one argument (a comment's line end inside it): its name */
const setsCs = src => /^(?:\\[A-Za-z@]+\*?\s*\{(?:\s|%[^\n]*\n)*)?(\\[A-Za-z@]+)(?:\s|%[^\n]*\n)*\}?\s*$/.exec(src)?.[1] ?? null
/**
 * The pieces of a unit that set a URL \\urldef stored earlier in it (url.sty: `\\urldef\\tempurl\\url{…}` defines \\tempurl as that
 * \\url sets its argument, robust; ACM-Reference-Format's entries then `\\showDOI{\\tempurl}` or `\\showURL{%\n\\tempurl}`), each with the
 * \\url piece it sets, by index: the piece sets the URL as the \\url piece would where it stands (a crop of its glyphs, its copy
 * and break points theirs), the \\url piece nothing where it stands (the definition stores it). Read by its own command, a paper's
 * macro, the piece was a text macro drawn as text, its line breaks lost and its link annotations unpaired: 2610.22065v1 p7 t126
 */
function urlsShown(pieces) {
  const out = new Map(), defined = new Map()
  pieces.forEach((p, k) => {
    if (p.t !== 'ph') return
    const src = unicodeOf(p.src)
    if (URL_DEF.test(src)) {
      // (\urldef, then its control sequence, then the url command: three placeholders in a row, white space between)
      const next = []
      for (let j = k + 1; j < pieces.length && next.length < 2; j++) if (pieces[j].t === 'ph') next.push(j); else if (pieces[j].t !== 'text' || /\S/.test(pieces[j].s ?? '')) break
      if (next.length === 2 && CS.test(unicodeOf(pieces[next[0]].src)) && URL_CMD.test(unicodeOf(pieces[next[1]].src))) defined.set(unicodeOf(pieces[next[0]].src).trim(), next[1])
      return
    }
    const cs = defined.size ? setsCs(src) : null
    if (cs !== null && defined.has(cs) && !URL_DEF.test(unicodeOf(pieces[k - 1]?.src ?? ''))) out.set(k, defined.get(cs))
  })
  return out
}

export function classesOf(pieces, colours = null, texts = null) {
  const out = []
  const first = new Map()
  const shown = urlsShown(pieces)
  // (a face switch first in a bare group is the group's face, no element: no class of its own, switchesOf)
  const switched = switchedOf(pieces)
  pieces.forEach((p, k) => {
    if (switched.has(k)) return
    // (a nested unit: its mark a footnote mark's, placeholdersOf L2:1066)
    if (p.t === 'nested') { out.push([String(k), { cls: 'num', copy: texToText2('\\footnotemark') || '', mark: true, nested: true }]); return }
    if (p.t !== 'ph') return
    const src = unicodeOf(p.src)
    // (the placeholder's class, placeholdersOf L2:1065: phClassProven, a symbol that is no text symbol a formula; its
    // drawing as a symbol, `sym`, where phClass2 reads it as one: the tokens' class, cls2)
    const c = phClassProven(src), copy = copyOf(src) || ''
    const x = { cls: c.cls, ...(c.unknown ? { unknown: true } : {}), ...(copy ? { copy } : {}) }
    if (phClass2(src).cls === 'symbol') {
      const own = symbolText(src)
      x.sym = own !== null ? [own] : [copy.replace(/^\^\(?|\)$/g, ''), ...(/^\$?\^/.test(src.replace(/^\$/, '')) || /^\^/.test(copy) ? [true] : [])]
    }
    if (/^\\footnotemark/.test(src)) x.mark = true
    if (isTie(p)) x.tie = true
    // (a text piece, TeX setting its characters as written: a code or URL mark, a plain-text source; no formula, drawnAs
    // L2:1778 formulaOf)
    if (textPieceOf(src)) x.literal = true
    // (a text macro's text, the marking's probe's: what TeX sets for it (the marks file's `texts`), which today's reader finds
    // its rendering by among the unit's characters where the macro's glyphs are the unit's text (no points of its own))
    const t = (c.cls === 'macro' || c.cls === 'umacro') && texts ? (texts.get(p.src) ?? texts.get(src)) : undefined
    if (typeof t === 'string' && /\S/.test(t)) x.text = t
    Object.assign(x, sourceFactsOf(src, k, first, colours))
    // (a piece that sets a URL \urldef stored: the \url piece's class and copy, a text piece, a URL)
    if (shown.has(k)) {
      const u = unicodeOf(pieces[shown.get(k)].src), uc = phClassProven(u), copy = copyOf(u) || ''
      for (const f of ['unknown', 'text', 'sym']) delete x[f]
      Object.assign(x, { cls: uc.cls, ...(copy ? { copy } : {}), literal: true, url: true })
    }
    out.push([String(k), x])
  })
  return out
}

/** the piece of each `.p` glyph (and rule): the innermost placeholder point `p<u>.<k>a` of its unit open before it, else the last
 *  one opened on its page (spike S1's rule), by the glyphs' (or boxes') counts the points carry. A unit's start point closes
 *  every point of its own opened before it: a head piece's (marks.mjs \\axthpk), whose ink ends where the unit's text begins.
 *  `open` the points open at the page's start, by unit (the pages before's, read in order: the caller's, carried): TeX's
 *  stream runs on across a page break, and a point opened and not closed on one page is open on the next. marks.mjs sets a
 *  placeholder's opening point before the glue in front of it, so a line TeX breaks there that ends a page leaves the point at
 *  that page's end and the piece's glyphs on the next; and a piece TeX breaks over the page break has glyphs on both */
function piecesByPoints(points, count, groupAt, by, open = new Map()) {
  const out = new Int32Array(count).fill(-1)
  const last = new Map()
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
 * the unit's whole run of such glyphs on the page, exactly as own.mjs claimed it; else none, as before. `open` the points open
 * at the page's start (piecesByPoints'), the pages read in order with one map
 */
export function glyphPiecesOf(pg, row, { units = [], texts = null, names = new Set(), open = new Map() } = {}) {
  const out = piecesByPoints(pg.points, pg.glyphs.length, j => row[j], 'glyph', open)
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
  // (and the glyphs own.mjs claims `.p` after the unit's end point, a footnote's call TeX gave no mark after its last word (MR 4b):
  // the call's, where the unit's tail holds that one piece of a class, of no point of its own. Past the end point no piece before
  // the last text set anything, so not the last one opened on the page either, which the points gave them (2610.35877v1 p1's
  // abstract: its "1" its piece 15's, closed long before))
  const ends = new Map()
  for (const pt of pg.points) { const e = END_POINT.exec(pt.name); if (e) ends.set(Number(e[1]), pt.glyph) }
  for (let j = 0; j < pg.glyphs.length; j++) {
    const m = /^u(\d+)\.p$/.exec(row[j] ?? '')
    const u = m ? Number(m[1]) : -1
    if (u < 0 || !(ends.get(u) <= j)) continue
    const pieces = units[u]?.pieces ?? []
    const last = pieces.findLastIndex(q => q.t === 'text' && /\S/.test(typeof q.s === 'string' ? q.s : ''))
    const tails = pieces.map((q, k) => [q, k]).filter(([q, k]) => k > last && classOf(q) !== null)
    const [q, k] = tails.length === 1 ? tails[0] : []
    if (q?.t === 'ph' && classOf(q) === 'footnote' && !names.has(`n${u}.${k}a`) && !names.has(`n${u}.${k}b`) && !names.has(`p${u}.${k}a`)) out[j] = k
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

/** a piece's own point: a placeholder's opening and closing (`p<u>.<k>a`, `b`; a footnote's call's `n…`; a head macro's \\axthpk
 *  opening), a trailing macro's point after its group (`g`) */
const OWN_POINT = /^[pn](\d+)\.(\d+)([abg])$/
/** pageInk's kind of an image's box (layout/ink.mjs, own.mjs IMAGE_BOX): a piece's ink where TeX painted it with the piece */
const IMAGE_BOX = -3
/** a glyph that is ink: a character TeX set, no blank and no space */
const inked = g => /\S/.test(g?.u ?? '') && !g?.blank
/**
 * The pieces TeX's points prove set nothing of their own, as Instrument `empty` pieces (rootcause/lave.md §1). TeX's points
 * bound what TeX set: every piece of a unit lies between the two nearest points TeX shipped around it in the unit's source
 * order, the points of the pieces before and after it (OWN_POINT), the unit's start point before the piece patch sets it before
 * (latex-front.mjs startOf) and its end point after its last text; where the unit has none on a side (a head piece before its
 * first, a tail piece after its last), the page's stream's nearest, of whatever it is the point. A piece with no closing point
 * of its own (none, or its opening one alone, which is then its lower) whose two hold between them in B's stream no glyph and
 * no painted box, and no text of the unit's between them in its source, set nothing (nor did any piece between them): 2402.10294v1's ACM references, whose `\\urldef\\tempurl` after `\\showISBNx`, a macro that may read
 * ahead, the marking gives no point, between the end point and `\\showDOI`'s opening one, where nothing stands wherever TeX
 * broke the line before the DOI; a `\\endgroup` after the last word, the next unit's start point next. Where the lower of the
 * two is the opening point of a piece TeX gave no closing one, and everything between them is that piece's by the ownership,
 * what the pieces after it set is in that piece's ink. This replaces a reading of the line beside the unit's mark (today's
 * maker's besideMarks), which line breaking decided: 19 of 2402.10294v1's 86 references were English where its DOI began
 * mid-line. A unit whose points TeX set more than once is not read. `pages` the adapter's (glyphs, boxes, points), `owners` the
 * instrument's glyphs' and boxes' owners by page
 */
export function boundedEmpty(pages, units, { glyphs = [], boxes = [] } = {}) {
  // (every unit's point by name, [page, index among the page's points]; the units whose points TeX set more than once)
  const at = new Map(), twice = new Set()
  pages.forEach((pg, p) => (pg.points ?? []).forEach((pt, q) => {
    const m = START_POINT.exec(pt.name) ?? END_POINT.exec(pt.name) ?? OWN_POINT.exec(pt.name)
    if (!m) return
    if (at.has(pt.name)) twice.add(Number(m[1]))
    at.set(pt.name, [p, q])
  }))
  /** a point's place in B's stream: its page, the glyphs and the boxes shown before it there */
  const placeOf = ([p, q]) => [p, pages[p].points[q].glyph, pages[p].points[q].box ?? 0]
  const before = (x, y) => x[0] < y[0] || (x[0] === y[0] && x[1] < y[1])
  /** the stream's point after one, and before one, over pages */
  const next = ([p, q]) => {
    if (q + 1 < pages[p].points.length) return [p, q + 1]
    for (let i = p + 1; i < pages.length; i++) if (pages[i].points?.length) return [i, 0]
    return null
  }
  const prev = ([p, q]) => {
    if (q > 0) return [p, q - 1]
    for (let i = p - 1; i >= 0; i--) if (pages[i].points?.length) return [i, pages[i].points.length - 1]
    return null
  }
  const opened = (O, j, u, opener) => opener !== null && O?.unit[j] === u && O.role[j] === ROLE.element && O.piece[j] === opener
  /** whether B's stream from `lo` to `hi` holds a glyph or a painted box TeX set but `opener`'s, the piece whose opening point
   *  `lo` is (its element's, by the ownership). Another unit's is not passed over: the ownership may have given it the piece's
   *  ink (2608.06701v1 p6's run-in heading `Comparison Against \\sage`, its "SAGE" the next paragraph's label) */
  const holds = (u, lo, hi, opener) => {
    for (let p = lo[0]; p <= hi[0]; p++) {
      const pg = pages[p]
      const g0 = p === lo[0] ? lo[1] : 0, g1 = p === hi[0] ? hi[1] : pg.glyphs.length
      for (let j = g0; j < g1; j++) if (inked(pg.glyphs[j]) && !opened(glyphs[p], j, u, opener)) return true
      const b0 = p === lo[0] ? lo[2] : 0, b1 = p === hi[0] ? hi[2] : (pg.boxes?.length ?? 0) / 4
      for (let j = b0; j < b1; j++) if (!opened(boxes[p], j, u, opener)) return true
    }
    return false
  }
  /** after an opening point TeX gave no closing one, where the ink the ownership gives its piece ends: the place of the first glyph
   *  past it that is no glyph of that piece's, where that glyph is the unit's text and begins the text piece next in the source
   *  (TeX sets a text's characters as written: what the pieces between set lies before it); null else */
  const textAfter = (u, lo, opener, piece) => {
    const want = (typeof piece.s === 'string' ? piece.s : '').normalize('NFKC').replace(/\s/gu, '')
    for (let p = lo[0]; p < pages.length; p++) {
      const pg = pages[p]
      for (let j = p === lo[0] ? lo[1] : 0; j < pg.glyphs.length; j++) {
        if (!inked(pg.glyphs[j]) || opened(glyphs[p], j, u, opener)) continue
        const t = (pg.glyphs[j].u ?? '').normalize('NFKC').replace(/\s/gu, '')
        const O = glyphs[p]
        return O?.unit[j] === u && O.role[j] === ROLE.text && t && want.startsWith(t) ? [p, j, pg.boxAt?.[j] ?? (p === lo[0] ? lo[2] : 0)] : null
      }
    }
    return null
  }
  const real = q => q?.t === 'text' && /\S/.test(typeof q.s === 'string' ? q.s : '')
  const out = []
  units.forEach((unit, u) => {
    const P = unit?.pieces ?? []
    if (!P.length || twice.has(u)) return
    const S = at.get(`${u}s`) ?? at.get(`h${u}s`) ?? at.get(`t${u}s`) ?? null
    const E = at.get(`${u}e`) ?? at.get(`h${u}e`) ?? at.get(`t${u}e`) ?? null
    const own = k => {
      const a = at.get(`p${u}.${k}a`) ?? at.get(`n${u}.${k}a`) ?? null, b = at.get(`p${u}.${k}b`) ?? at.get(`n${u}.${k}b`) ?? null, g = at.get(`p${u}.${k}g`) ?? null
      return a || b || g ? { a, b, g } : null
    }
    // (the start point's piece as patch finds it, over the source's text as patch writes it)
    const start = S ? startOf(P.map(q => (q.t === 'text' && !q.tr && q.src !== undefined ? { ...q, s: q.src } : q)))[0] : -1
    const last = P.findLastIndex(real)
    const seen = new Map()
    P.forEach((piece, k) => {
      // (a piece's own two points bound it already (placesOf), as a trailing macro's point after its group does with the end point;
      // one with its opening point alone is bounded by it and the next)
      const mine = own(k)
      if (piece.t !== 'ph' || (mine && ((mine.a && mine.b) || mine.g))) return
      // (the nearest point before it: a piece's (its closing, else its opening one, whose piece's ink then runs on), the start
      // point where the walk passes it, the end point after the last text; none of the unit's, the stream's; text first, or a
      // trailing macro's point after its group alone (which may stand after this piece), no bound)
      let lo = mine?.a ?? null, hi = mine?.b ?? null, opener = null
      if (!lo) for (let j = k - 1; ; j--) {
        if (S && k >= start && j === start - 1) { lo = S; break }
        if (E && k > last && j === last) { lo = E; break }
        if (j < 0) { lo = 'stream'; break }
        const o = own(j)
        if (o) {
          lo = o.b ?? o.a
          if (!o.b && o.a) opener = j
          break
        }
        if (real(P[j])) break
      }
      if (!lo) return
      // (the nearest after it; after an opener, text first is bounded by its first glyph (textAfter): `\\DOIprefix\\doi{…}.`, the
      // prefix's opening point alone and its ink to the stop, the DOI's in it)
      let text = null
      if (!hi) for (let j = k + 1; ; j++) {
        if (S && k < start && j === start) { hi = S; break }
        if (j >= P.length) { hi = 'stream'; break }
        const o = own(j)
        if (o) { hi = o.a ?? o.b; break }
        if (real(P[j])) { if (opener !== null) text = P[j]; break }
      }
      if ((!hi && !text) || (lo === 'stream' && hi === 'stream')) return
      if (lo === 'stream') lo = prev(hi)
      if (hi === 'stream') hi = next(lo)
      if (!lo || (!hi && !text)) return
      const from = placeOf(lo), to = text ? textAfter(u, from, opener, text) : placeOf(hi)
      if (!to || before(to, from)) return
      // (the pieces of one interval read it once)
      const key = `${from}|${to}|${opener}`
      if (!seen.has(key)) seen.set(key, holds(u, from, to, opener))
      if (!seen.get(key)) out.push({ unit: u, piece: String(k) })
    })
  })
  return out
}

/** a body's or a float's bracket (stream.mjs BRACKET): it bounds no piece's ink, which may run on across a column's end; nor
 *  does a point one reader reads alone (stream.mjs READ_ALONE) */
const BRACKET_POINT = /^[bf][se]\d+$/
/** a text as its glyphs spell it: NFKC, case aside (TeX may set it in capitals, \MakeUppercase or faked small capitals, which the
 *  probe's box does not: own.mjs's and the maker's lead reading, leadNorm), white space out */
const spelled = t => (t ?? '').normalize('NFKC').toLowerCase().replace(/\s/gu, '')
/** what the readings of a piece's ink below share: each unit's and piece's point by name ([page, index]) and the units whose points
 *  TeX set more than once; each page's regions (stream.mjs regionsOf); the last glyph the ownership gave each unit's element (by
 *  `${unit}|${piece}`); what TeX states a piece sets (`setting`: a text symbol's character, the unit's text; the probe's text of a
 *  paper's macro, a literal piece's characters, the element's), a place to read from (`placeAt`: its page, its glyph, the first
 *  point index past it, its region) and the glyph a reading from it stops at (`stopOf`: the stream's next point but a body's or a
 *  float's bracket and the unit's own end point) */
function pieceReading(pages, { glyphs = [], classes = [] } = {}) {
  const at = new Map(), twice = new Set()
  pages.forEach((pg, p) => (pg.points ?? []).forEach((pt, q) => {
    const m = START_POINT.exec(pt.name) ?? END_POINT.exec(pt.name) ?? OWN_POINT.exec(pt.name)
    if (!m) return
    if (at.has(pt.name)) twice.add(Number(m[1]))
    at.set(pt.name, [p, q])
  }))
  const regions = new Map()
  const regionOf = p => regions.get(p) ?? regions.set(p, regionsOf({ glyphs: { n: pages[p].glyphs.length }, boxes: pages[p].boxes ?? [], points: pages[p].points ?? [] })).get(p)
  const lastOwned = new Map()
  glyphs.forEach((O, p) => { for (let j = 0; j < (O?.unit.length ?? 0); j++) if (O.unit[j] >= 0 && O.role[j] === ROLE.element && O.piece[j] >= 0) lastOwned.set(`${O.unit[j]}|${O.piece[j]}`, [p, j]) })
  const setting = (u, k, piece) => {
    const sym = piece.t === 'ph' ? symbolText(piece.src) : null
    if (sym !== null) return { want: spelled(sym), role: ROLE.text }
    const c = classes[u]?.get(String(k))
    const t = (c?.cls === 'macro' || c?.cls === 'umacro') && typeof c.text === 'string' ? c.text : (c?.literal || c?.url) && c.copy ? c.copy : ''
    return spelled(t) ? { want: spelled(t), role: ROLE.element } : null
  }
  const placeAt = ([p, q]) => ({ p, g: pages[p].points[q].glyph, q: q + 1, r: regionOf(p).at[q] })
  const stopOf = (u, from) => {
    const pts = pages[from.p].points ?? []
    for (let x = from.q; x < pts.length; x++) {
      const name = pts[x].name, e = END_POINT.exec(name)
      if (!BRACKET_POINT.test(name) && !READ_ALONE.test(name) && !(e && Number(e[1]) === u)) return pts[x].glyph
    }
    return pages[from.p].glyphs.length
  }
  return { at, twice, regionOf, lastOwned, setting, placeAt, stopOf }
}
/** the glyphs of `pages` from `from` (pieceReading's place) up to `stop` in its region that spell `want` from the first, character
 *  for character (spelled, a blank glyph passed over), each one `mine` allows; null where they do not */
function spelledRun(pages, regionOf, from, stop, want, mine) {
  const pg = pages[from.p], R = regionOf(from.p), got = []
  let n = 0
  for (let j = from.g; j < stop && n < want.length; j++) {
    if (R.glyph[j] !== from.r || !inked(pg.glyphs[j])) continue
    const t = spelled(pg.glyphs[j].u)
    if (!mine(from.p, j) || !t || !want.startsWith(t, n)) return null
    got.push(j)
    n += t.length
  }
  return n === want.length ? got : null
}
/**
 * The ink TeX set for a unit's tail pieces past its end point (lanes/past-end.md). The marking sets a unit's end point after its last
 * text, so a piece of ink after that text with no closing point of its own — a paper's macro that may read ahead, its opening point
 * alone (2608.25210v2 u8's `doi:\\vldbdoi`), or a piece no mark may stand before (an e-mail after `\\\\`, which reads ahead:
 * 2610.21313v1's affiliations) — sets ink that no reading of the ownership's gives anyone (own.mjs reads an opening alone to its
 * unit's next mark, which past the end point is another's), and the typesetter drew the translation over it, never erased. The
 * unit's text ends at the end point; TeX states what such a piece sets: the text its probe showed a paper's macro sets
 * (PieceClass.text), a literal piece's characters as written (its copy), a text symbol's character. The tail is read in the source's
 * order, each piece from its own opening point, else from where the piece of ink before it ended (the end point for the first): its
 * ink is the glyphs there, in that point's region, no unit's, that spell its text from the first, character for character (spelled,
 * a blank glyph passed over), before the stream's next point (any but a body's or a float's bracket); a text symbol's glyph is its
 * unit's text, as own.mjs gives it. A piece the end point and its point after its group bound (\\axttg's `g`) has the glyphs between
 * them no unit's, as a closed piece has those between its two points; one its own two points bound, or the ownership gave ink, is as
 * it is; the next is read from its end. One of no text TeX states, or not so spelled, leaves the pieces after it of no point unread.
 * Returns `ink`, the claims, each { unit, piece, page (0-based), glyphs, role }; and `unfound`, the text macros of a probe's text so
 * read and not found, their own points bounding none ({ unit, piece }): their glyphs, past the end point, are no text of their
 * unit's, which the probe's text says (PieceClass.text: drawn as the unit's text, the typesetter's `textOnly`). `pages` the
 * adapter's, `units` today's, `glyphs` the owners by page, `classes` each unit's classesOf by piece id, `inkless` the macros TeX
 * said set no ink
 */
export function tailInkOf(pages, units, { glyphs = [], classes = [], inkless = null } = {}) {
  const { at, twice, regionOf, lastOwned, setting, placeAt, stopOf } = pieceReading(pages, { glyphs, classes })
  const noInk = new Set(inkless ?? [])
  const claimed = new Set()
  const free = (p, j) => (glyphs[p]?.unit[j] ?? -1) < 0 && !claimed.has(`${p}|${j}`)
  const real = q => q?.t === 'text' && /\S/.test(typeof q.s === 'string' ? q.s : '')
  const read = (u, from, want) => spelledRun(pages, regionOf, from, stopOf(u, from), want, free)
  const ink = [], unfound = []
  const take = (u, k, p, run, role) => {
    for (const j of run) claimed.add(`${p}|${j}`)
    ink.push({ unit: u, piece: String(k), page: p, glyphs: run, role })
  }
  units.forEach((unit, u) => {
    const P = unit?.pieces ?? []
    const last = P.findLastIndex(real)
    const E = at.get(`${u}e`) ?? at.get(`h${u}e`) ?? at.get(`t${u}e`) ?? null
    if (last < 0 || !E || twice.has(u)) return
    let from = placeAt(E)
    for (let k = last + 1; k < P.length; k++) {
      const piece = P[k], c = classOf(piece)
      if (c === null || (c === 'macro' && noInk.has(piece.src))) continue
      const a = at.get(`p${u}.${k}a`) ?? at.get(`n${u}.${k}a`) ?? null, b = at.get(`p${u}.${k}b`) ?? at.get(`n${u}.${k}b`) ?? null
      const g = at.get(`p${u}.${k}g`) ?? null, owned = lastOwned.get(`${u}|${k}`)
      if (owned) {
        // (given ink: read on from its last glyph)
        const [p, j] = owned, pts = pages[p].points ?? []
        let q = 0
        while (q < pts.length && pts[q].glyph <= j) q++
        from = { p, g: j + 1, q, r: regionOf(p).glyph[j] }
        continue
      }
      if (g) {
        // (the end point and its point after its group: what the region holds between them, no unit's, its ink)
        if (g[0] === E[0] && g[1] > E[1]) {
          const pg = pages[E[0]], R = regionOf(E[0]), r = R.at[E[1]], run = []
          for (let j = pg.points[E[1]].glyph; j < pg.points[g[1]].glyph; j++) if (R.glyph[j] === r && inked(pg.glyphs[j]) && free(E[0], j)) run.push(j)
          if (run.length) take(u, k, E[0], run, ROLE.element)
        }
        from = placeAt(g)
        continue
      }
      if (b) { from = placeAt(b); continue }
      const start = a ? placeAt(a) : from, set = setting(u, k, piece)
      const run = start && set ? read(u, start, set.want) : null
      if (run) {
        take(u, k, start.p, run, set.role)
        from = { ...start, g: run.at(-1) + 1 }
        continue
      }
      from = null
      const cls = classes[u]?.get(String(k))?.cls
      if ((cls === 'macro' || cls === 'umacro') && typeof classes[u]?.get(String(k))?.text === 'string') unfound.push({ unit: u, piece: String(k) })
    }
  })
  return { ink, unfound }
}

/**
 * The ink of a piece TeX gave its opening point alone and of the one unmarked piece after it (lanes/past-end.md): a paper's macro
 * that may read ahead has no closing point, and where the piece right after it is one no mark may stand before (`\\sys\\footnote{…}`:
 * nothing of ours may stand between a macro that reads ahead and what it may read), neither has a point between them. own.mjs parts
 * the two by the macro's text only where its next mark is the unit's own next one (stream.mjs ownedOf's `split`); where the unit
 * runs on past its column's end, its reading stops, the two glyph runs stay the unit's text, and the second piece, of no ink, leaves
 * its unit unproven: 2608.25210v2 u41, `We introduce \\sys\\footnote{…}, a provenance …`, English on p2 and p3 in both readers (owner
 * comment #50). TeX states both bounds: the macro's text (pieceReading's `setting`, its probe's), which the glyphs from its opening
 * point spell, and the text after the second piece as written, which no piece between sets; so the macro's ink is that run and the
 * second piece's what stands from its end to where the glyphs spell the text after it (its first WANT characters, stream.mjs's, white
 * space out; to the reading's stop where it runs on past it), at least one glyph. Only where the second is the one piece of ink
 * between (white space aside), neither has a point of its own or ink the ownership gave it, and every glyph read is no unit's or the
 * unit's own text; a text symbol's glyph stays its unit's text. Returns the claims as tailInkOf's `ink`
 */
export function splitInkOf(pages, units, { glyphs = [], classes = [] } = {}) {
  const { at, twice, regionOf, lastOwned, setting, placeAt, stopOf } = pieceReading(pages, { glyphs, classes })
  const ink = []
  units.forEach((unit, u) => {
    const P = unit?.pieces ?? []
    if (twice.has(u)) return
    const point = k => ['a', 'b', 'g'].some(x => at.has(`p${u}.${k}${x}`) || at.has(`n${u}.${k}${x}`))
    // (glyphs the reading may take: no unit's, or the unit's own text, which own.mjs gives what stands between its points)
    const mine = (p, g) => { const O = glyphs[p]; return (O?.unit[g] ?? -1) < 0 || (O.unit[g] === u && O.role[g] === ROLE.text) }
    P.forEach((piece, k) => {
      const a = at.get(`p${u}.${k}a`) ?? at.get(`n${u}.${k}a`)
      if (!a || piece.t !== 'ph' || at.has(`p${u}.${k}b`) || at.has(`n${u}.${k}b`) || at.has(`p${u}.${k}g`) || lastOwned.has(`${u}|${k}`)) return
      let j = k + 1
      while (j < P.length && P[j].t === 'text' && !/\S/.test(P[j].s ?? '')) j++
      if (j >= P.length || (P[j].t !== 'ph' && P[j].t !== 'nested') || classOf(P[j]) === null || point(j) || lastOwned.has(`${u}|${j}`)) return
      // (the text after it, to the next piece of ink: its groups' opens and closes and the pieces that set nothing passed over)
      let after = ''
      for (let q = j + 1; q < P.length && after.length < WANT; q++) {
        const x = P[q]
        if (x.t === 'text') after += spelled(x.s)
        else if (x.t !== 'open' && x.t !== 'close' && classOf(x) !== null) break
      }
      const want = after.slice(0, WANT), set = setting(u, k, piece)
      if (!want || !set) return
      const from = placeAt(a), stop = stopOf(u, from)
      const run = spelledRun(pages, regionOf, from, stop, set.want, mine)
      if (!run) return
      const R = regionOf(from.p), pg = pages[from.p], rest = []
      for (let g = run.at(-1) + 1; g < stop; g++) if (R.glyph[g] === from.r && inked(pg.glyphs[g])) rest.push(g)
      // (where the text after it begins: the first glyph past one of the second piece's from which they spell it, or spell the
      // start of it up to the reading's stop)
      const begins = x => {
        let n = 0
        for (let y = x; y < rest.length && n < want.length; y++) {
          const t = spelled(pg.glyphs[rest[y]].u)
          if (!mine(from.p, rest[y]) || !t || !want.startsWith(t, n)) return false
          n += t.length
        }
        return n > 0
      }
      let e = 1
      while (e < rest.length && !begins(e)) e++
      if (e >= rest.length || rest.slice(0, e).some(g => !mine(from.p, g))) return
      if (set.role === ROLE.element) ink.push({ unit: u, piece: String(k), page: from.p, glyphs: run, role: ROLE.element })
      if (P[j].t === 'nested' || symbolText(P[j].src) === null) ink.push({ unit: u, piece: String(j), page: from.p, glyphs: rest.slice(0, e), role: ROLE.element })
    })
  })
  return ink
}

/**
 * The ink of a piece TeX set with no point of its own, or with its opening point alone, that no reading before found
 * (lanes/soul-locate.md). The marking leaves a paper's macro glued to the word before it unmarked (a mark would part the word's
 * hyphenation and kerns), and the piece right after a paper's macro that may read ahead (marks.mjs LOOKS_AHEAD: the probe asks
 * TeX of no paper's macro there, AHEAD_FOLLOWS, which "is found by the text TeX sets for it"); own.mjs reads such a piece by the
 * probe's text where it has one (MR 4, the split). Where the probe gave none (readInkTexts refuses a listing of a rule: soul's
 * ground), or the piece is drawn from its ink (a paper's macro with an argument: classesOf's `other`, which holds no text), the
 * ownership left its glyphs its unit's text, and locate held the unit whole, its text past its source: 2111.09276v1's Figure 1
 * caption, `\\hlyellow{high}\\hlblue{lighted}` in one word, its three sentences the original's. TeX states what such a piece sets:
 * the probe's text of its source (`texts`, readInkTexts'; `decorated`, readInkDecorated's: the characters it set beside a box of
 * no width of its own, a ground, an underline, a stroke). And where it stands: from its opening point; else right after the ink
 * of the piece of ink before it, that piece's closing point or the last glyph a reading gave it (this one's claims too, in the
 * source's order); else, where the source writes text right before it, at the one place in its unit's text glyphs that spells
 * that text's end (WANT characters), its own text and the text after it. Its ink is the glyphs there that spell its text from the
 * first, character for character (spelled, a blank glyph passed over), each no unit's or its unit's text, the text after it as
 * written (WANT characters, where the source writes text there) spelled by its unit's text glyphs right after them; and, for a
 * decorated one, the boxes TeX painted in the stream from the glyph before its first glyph to its last, in their region, no
 * unit's, over its glyphs: its ground, underline or stroke, which own.mjs gives no unit's text (MR 2b) and which a translation
 * would leave behind. Not read: a text symbol and a text macro (their glyphs their unit's text, as own.mjs gives them), a piece
 * before its unit's head ends or past its last text (glyphPiecesOf's, outsidePieces', tailInkOf's), a piece whose text TeX does
 * not state. Returns the claims, each { unit, piece, page (0-based), glyphs, boxes }
 */
export function unmarkedInkOf(pages, units, { glyphs = [], boxes = [], classes = [], texts = null, decorated = null } = {}) {
  const out = []
  if (!texts?.size && !decorated?.size) return out
  const { at, twice, regionOf, lastOwned, placeAt, stopOf } = pieceReading(pages, { glyphs, classes })
  const taken = new Set()
  const isText = (u, p, g) => glyphs[p]?.unit[g] === u && glyphs[p].role[g] === ROLE.text && !taken.has(`${p}|${g}`)
  const real = q => q?.t === 'text' && /\S/.test(typeof q.s === 'string' ? q.s : '')
  const inkPiece = q => (q?.t === 'ph' || q?.t === 'nested') && classOf(q) !== null
  /** a reading's place right after glyph `g` of page `p` (pieceReading's placeAt, from a glyph) */
  const pastGlyph = (p, g) => {
    const pts = pages[p].points ?? []
    let q = 0
    while (q < pts.length && pts[q].glyph <= g) q++
    return { p, g: g + 1, q, r: regionOf(p).glyph[g] }
  }
  /** whether the inked glyphs of the unit's text right after glyph `g` of page `p`, in region `r`, spell `want` from its first
   *  character (all of it, or up to the region's end on the page, one character at least) */
  const followedBy = (u, p, g, r, want) => {
    if (!want) return true
    const R = regionOf(p), pg = pages[p]
    let n = 0
    for (let j = g + 1; j < pg.glyphs.length && n < want.length; j++) {
      if (R.glyph[j] !== r || !inked(pg.glyphs[j])) continue
      const t = spelled(pg.glyphs[j].u)
      if (!isText(u, p, j) || !t || !want.startsWith(t, n)) return n > 0 && !isText(u, p, j)
      n += t.length
    }
    return n > 0
  }
  /** the one place in the unit's text glyphs (stream order, one page) that spells `before`, `want` and `after` in a row: the glyphs
   *  spelling `want` [page, glyphs], null where there is none or more than one, or a glyph spells across two of them */
  /** each unit's text glyphs of ink, in stream order: [page, glyph] (read once, at the first search) */
  let textsBy = null
  const placed = (u, before, want, after) => {
    if (!textsBy) {
      textsBy = new Map()
      pages.forEach((pg, p) => {
        const O = glyphs[p]
        for (let g = 0; g < (O?.unit.length ?? 0); g++) {
          if (O.unit[g] < 0 || O.role[g] !== ROLE.text || !inked(pg.glyphs[g])) continue
          const l = textsBy.get(O.unit[g])
          if (l) l.push([p, g])
          else textsBy.set(O.unit[g], [[p, g]])
        }
      })
    }
    const list = (textsBy.get(u) ?? []).filter(([p, g]) => !taken.has(`${p}|${g}`))
    const all = before + want + after, from = before.length, to = from + want.length
    let found = null
    for (let i = 0; i < list.length; i++) {
      const p = list[i][0], got = []
      let n = 0, x = i, ok = true
      while (n < all.length && x < list.length && list[x][0] === p) {
        const t = spelled(pages[p].glyphs[list[x][1]].u)
        if (!t || !all.startsWith(t, n) || (n < from && n + t.length > from) || (n < to && n + t.length > to)) { ok = false; break }
        if (n >= from && n < to) got.push(list[x][1])
        n += t.length
        x++
      }
      if (!ok || n !== all.length || !got.length) continue
      if (found) return null
      found = [p, got]
    }
    return found
  }
  /** the boxes TeX painted with a run of glyphs: in the stream from the glyph before its first to its last, in its region, no
   *  unit's, a painted path or an image, over one of its glyphs */
  const paintedWith = (p, run) => {
    const pg = pages[p], X = boxes[p], R = regionOf(p), r = R.glyph[run[0]]
    const x0 = run[0] > 0 ? (pg.boxAt?.[run[0] - 1] ?? 0) : 0, x1 = pg.boxAt?.[run.at(-1)] ?? x0
    const got = []
    for (let x = x0; x < x1; x++) {
      const path = pg.paths?.[x] ?? -1
      if (R.box[x] !== r || (X?.unit[x] ?? -1) >= 0 || (path < 0 && path !== IMAGE_BOX)) continue
      const bx0 = pg.boxes[4 * x], by0 = pg.boxes[4 * x + 1], bx1 = pg.boxes[4 * x + 2], by1 = pg.boxes[4 * x + 3]
      const over = run.some(g => { const G = pg.glyphs[g], lo = Math.min(G.top, G.bottom), hi = Math.max(G.top, G.bottom); return bx0 < G.x1 && bx1 > G.x0 && Math.min(by0, by1) < hi && Math.max(by0, by1) > lo })
      if (over) got.push(x)
    }
    return got
  }
  units.forEach((unit, u) => {
    const P = unit?.pieces ?? []
    if (twice.has(u)) return
    const head = headEnd(P, 0), last = P.findLastIndex(real)
    /** the last glyph of each piece this reading claimed: [page, glyph] */
    const ends = new Map()
    for (let k = head; k < last; k++) {
      const piece = P[k]
      if (piece.t !== 'ph' || classOf(piece) === null || symbolText(piece.src) !== null) continue
      const cls = classes[u]?.get(String(k))?.cls
      if (cls === 'macro' || cls === 'umacro') continue
      if (['b', 'g'].some(x => at.has(`p${u}.${k}${x}`) || at.has(`n${u}.${k}${x}`)) || lastOwned.has(`${u}|${k}`)) continue
      const deco = decorated?.get(piece.src), want = spelled(deco ?? texts?.get(piece.src))
      if (!want || want.includes(INK_ANY)) continue
      // (the text after it, to the next piece of ink, its groups' opens and closes passed over)
      let after = ''
      for (let q = k + 1; q < P.length && after.length < WANT; q++) {
        if (P[q].t === 'text') after += spelled(P[q].s)
        else if (inkPiece(P[q])) break
      }
      after = after.slice(0, WANT)
      // (the piece before it, white space, groups' opens and closes and pieces of no ink passed over; and the text written
      // before it back to the piece of ink before that)
      let j = k - 1, before = ''
      while (j >= 0 && !inkPiece(P[j])) { if (P[j].t === 'text') before = spelled(P[j].s) + before; j-- }
      const mine = (p, g) => !taken.has(`${p}|${g}`) && ((glyphs[p]?.unit[g] ?? -1) < 0 || isText(u, p, g))
      let p = -1, run = null
      const a = at.get(`p${u}.${k}a`) ?? at.get(`n${u}.${k}a`)
      const prevEnd = j >= 0 && !before ? (at.get(`p${u}.${j}b`) ?? at.get(`n${u}.${j}b`) ?? null) : null
      const prevLast = j >= 0 && !before ? (ends.get(j) ?? lastOwned.get(`${u}|${j}`) ?? null) : null
      const from = a ? placeAt(a) : prevEnd ? placeAt(prevEnd) : prevLast ? pastGlyph(prevLast[0], prevLast[1]) : null
      if (from) {
        run = spelledRun(pages, regionOf, from, stopOf(u, from), want, mine)
        p = from.p
        if (run && !followedBy(u, p, run.at(-1), from.r, after)) run = null
      } else if (before) {
        const hit = placed(u, before.slice(-WANT), want, after)
        if (hit) [p, run] = hit
      }
      if (!run?.length) continue
      for (const g of run) taken.add(`${p}|${g}`)
      ends.set(k, [p, run.at(-1)])
      out.push({ unit: u, piece: String(k), page: p, glyphs: run, boxes: deco !== undefined ? paintedWith(p, run) : [] })
    }
  })
  return out
}

/**
 * The pieces TeX set before their unit's start point, as Instrument `outside` pieces (rootcause/lave.md §2): the marking passes
 * over a unit's head (marks.mjs passedOver) and patch sets the start point before the piece latex-front.mjs startOf names, so
 * whatever TeX set for a piece before that one stands before the unit's text, which begins at the point, and is never erased
 * with it: drawn as nothing, its ink, wherever TeX set it, the original's (today's OUTSIDE, make.mjs outsideOf: a head piece
 * not found, before its start mark). Only where the ownership gives the unit's text nothing before the start point in B's
 * stream; a unit whose points TeX set more than once is not read. `pages` the adapter's, `owners` the instrument's glyphs'
 */
export function outsidePieces(pages, units, { glyphs = [] } = {}) {
  const at = new Map(), twice = new Set()
  pages.forEach((pg, p) => (pg.points ?? []).forEach(pt => {
    const m = START_POINT.exec(pt.name) ?? END_POINT.exec(pt.name) ?? OWN_POINT.exec(pt.name)
    if (!m) return
    if (at.has(pt.name)) twice.add(Number(m[1]))
    at.set(pt.name, [p, pt.glyph])
  }))
  // (each unit's first glyph of its text in B's stream)
  const first = new Map()
  glyphs.forEach((O, p) => { for (let j = 0; j < (O?.unit.length ?? 0); j++) if (O.unit[j] >= 0 && O.role[j] === ROLE.text && !first.has(O.unit[j])) first.set(O.unit[j], [p, j]) })
  const out = []
  units.forEach((unit, u) => {
    const P = unit?.pieces ?? []
    const S = at.get(`${u}s`) ?? at.get(`h${u}s`) ?? at.get(`t${u}s`) ?? null
    if (!S || !P.length || twice.has(u)) return
    const f = first.get(u)
    if (f && (f[0] < S[0] || (f[0] === S[0] && f[1] < S[1]))) return
    const start = startOf(P.map(q => (q.t === 'text' && !q.tr && q.src !== undefined ? { ...q, s: q.src } : q)))[0]
    for (let k = 0; k < start; k++) if (P[k].t === 'ph') out.push({ unit: u, piece: String(k) })
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
/** a babel name's group as the wrap names it (own.mjs MR 6): its occurrence `n<occ>`, whose word's glyphs the name owns
 *  (ROLE.name), and its label `n<occ>.l`, the number TeX set right before it at its line's start (MR 6c: a heading its class
 *  numbers itself), the name's label (ROLE.label); null for any other group */
export function nameGroupOf(g) {
  const m = /^(n\d+)(\.l)?$/.exec(g ?? '')
  return m ? { occurrence: m[1], role: m[2] ? ROLE.label : ROLE.name } : null
}

/**
 * What the instrument states of each of the paper's units from the front end's facts beside them (live.mjs openPaper), by
 * index: `float`, a caption's float type (LaTeX's \\@captype there, `floatTypes`: the part's Label.float, by which its label
 * is drawn in the target's word); `kept`, a unit the paper keeps as it is, never translated: the body of an algorithm float
 * (`pseudocode`: kept as the original as code is, the owner's ruling of 2026-11-08; its caption is the float's, translated), and a
 * table's cell or a figure's text that holds no ordinary word (`words`, R1 of PDF-READER §18.72: language.ts keptAsWritten over
 * its content, its elements by kind; the owner's direction of 2026-11-13: decide what is content from the source's facts), or whose
 * words are the paper's own names (`paperNames`, R2: a title-case word its running text writes capitalised mid-sentence and never in
 * lower case, language.ts paperNamesOf); `why`, each kept unit's reason, the rule that keeps it ('pseudocode' first, then 'words',
 * 'paperNames'), which the lab's dump states (`keptBy`) and the bundle does not carry
 */
export function unitFactsOf(paper) {
  const float = new Map(paper.floatTypes ?? [])
  const why = new Map((paper.pseudocode ?? []).map(i => [i, 'pseudocode']))
  const contents = paper.units.map(u => (JUDGED.has(u.kind) || RUNNING.has(u.kind) ? piecesOf(u.pieces, { kindOf: elementKindOf }) : null))
  // (the paper's own names, R2: read off its running text)
  const names = paperNamesOf(paper.units.flatMap((u, i) => (RUNNING.has(u.kind) ? [{ kind: u.kind, content: contents[i] }] : [])))
  paper.units.forEach((u, i) => {
    if (why.has(i) || !JUDGED.has(u.kind)) return
    const k = keptAsWritten(contents[i], names)
    if (k) why.set(i, k)
  })
  // (R4: the texts the paper's names blocks keep, over R1's and R2's, each kept in every cell of the paper's tables that prints it)
  const keyOf = i => JSON.stringify(contents[i])
  const blockNames = namesOfBlocks(paper.tableBlocks ?? [], i => why.has(i), keyOf)
  if (blockNames.size) paper.units.forEach((u, i) => { if (u.kind === 'cell' && !why.has(i) && blockNames.has(keyOf(i))) why.set(i, 'namesBlock') })
  return { float, kept: new Set(why.keys()), why }
}
/** the kinds whose texts are judged as language or not (R1, PDF-READER §18.72): a table's cell, a TikZ picture's text (a figure's
 *  texts read off its ink are judged where they are made, locate/ink.ts) */
const JUDGED = new Set(['cell', 'figure'])

/**
 * The cells held whole as the original for a decorated word they hold (PDF-READER §18.61, the owner's ruling of 2026-11-12: until
 * a decoration can follow its words, a cell is never translated around one, no half-original line), by unit index: each a table's
 * cell (the front end's `cell`) the paper does not keep already (`kept`, unitFactsOf's), holding a placeholder whose source the
 * probe states TeX set beside a decoration of its own (`decorated`, marks.mjs readInkDecorated: soul's ground, underline or
 * strike, alone or in a paper's macro), a letter in the text it sets (the engine's holdsLetter, which tells a figure's decorated
 * word from a number: a decorated number or mark makes no half-original line, an element in the translation as before). The
 * instrument states each `fixed` and `decorated`, never `kept`: its text could be translated and is held for its drawing alone,
 * so its table's group decision reads it as no evidence of what its column holds (bundle.ts stateOf: unwrapped)
 */
export function decoratedCellsOf(units, decorated, kept = new Set()) {
  const out = new Set()
  if (!decorated?.size) return out
  units.forEach((u, i) => {
    if (!u?.cell || kept.has(i)) return
    if ((u.pieces ?? []).some(p => p.t === 'ph' && holdsLetter(decorated.get(p.src) ?? ''))) out.add(i)
  })
  return out
}

export async function instrumentOf({ paper, finalPdf, options = {}, log = '', pdfjs, documentOptions = {}, made = {} }) {
  const units = paper.units
  const bundle = bundleUnitsOf(paper)
  const inkBase = bundle.length
  // (B read once, its raw glyphs let go page by page as the Doc's are made: the ownership reads the Doc's glyphs, which carry every
  // field it reads (their character, place, ink box, size, font, fill, show and place in it, blank, form, clip, figure) and which it
  // never writes. It read a copy of each glyph of its own made from pageInk's, so that B's glyphs were held three times at once:
  // lane mem-front, after L9 §3 6)
  // (and with no figure path's lines, which no step reads of B: its figures' extents and glyphs are read as they were)
  const read = await readPdf(pdfjs, finalPdf, { options: documentOptions, turned: true, rawGlyphs: false, shapes: false })
  const lower = x => (/[A-Z]/.test(x.name) ? { ...x, name: x.name.toLowerCase() } : x)
  // (each page as wrapFinal hands it to the ownership: layout/wrap-final.mjs)
  const pages = read.pages.map(({ raw, page }) => {
    if (!raw) return { glyphs: [], turned: [], shapes: new Map(), pictures: [], figures: new Map(), boxes: [], paths: [], points: [], boxAt: [], regions: [], view: [...page.view] }
    return { regions: raw.regions, glyphs: page.glyphs, turned: raw.turned, shapes: raw.shapes, pictures: raw.pictures, figures: raw.figures, unseen: raw.unseen, cut: raw.cut, boxes: raw.boxes, paths: raw.paths, points: raw.points.map(lower), paras: raw.paras ?? [], paraEnds: raw.paraEnds ?? [], boxAt: raw.boxAt, view: [...page.view] }
  })
  const texts = options.texts, inkless = options.inkless ?? null
  const shown = textsOf(texts)
  const names = new Set(pages.flatMap(pg => pg.points.map(x => x.name)))
  const follows = followsOf(units, names, shown, inkless)
  const own = ownOf(pages, { units, follows, texts: shown, inkless: inkless === null ? null : new Set(inkless), names: paper.theoremNames ?? null })

  // ---- the units
  // (the engine's reading of TeX's statement: a unit set again by a template has its first setting's; a cell's, its own
  // paragraph's, else the class LaTeX built its column's template from: marks/channels.ts)
  const align = readAlign(lastTexLog(log))
  // (a unit TeX set only in a box inside a paragraph, ICML's \icmlauthor names in their \mbox: its line's alignment where the
  // skips in force at its end mark and the paragraph TeX ends after it state the same, its two statements of the line)
  const boxed = boxedAlignOf(readBoxAlign(lastTexLog(log)), pages)
  // (a cell's class where TeX set its text in its column template's own box, no paragraph of its own: what its column's box is
  // read by, locate/columns.ts)
  const cellBoxes = readCellBoxes(lastTexLog(log))
  // (each colour piece's fill as TeX set its run, by unit and piece index: marks.mjs readColours over the marked compile's log)
  const colours = new Map()
  for (const [i, k, rgb] of readColours(log)) (colours.get(i) ?? colours.set(i, new Map()).get(i)).set(k, rgb)
  // (each reference's item's full name, as TeX stated it at the document's end for the labels the marked compile asked about:
  // marks.mjs refsTex, the engine's readRefNames; what a translator is sent for a word tied to it that abbreviates it)
  const refKeys = new Map(refKeysOf(units).map((k, i) => [k, i]))
  const refNames = readRefNames(lastTexLog(log))
  const nameOf = p => { const k = refKeyOf(p); return k === null ? undefined : refNames.get(refKeys.get(k) ?? -1) }
  const ids = []
  const out = []
  const kindOf = elementKindOf
  const classesBy = []
  const facts = unitFactsOf(paper)
  // (the probe's decorated texts: the cells a decorated word holds whole, and the pieces of no point found by their text below)
  const decorated = textsOf(options.decorated)
  const held = decoratedCellsOf(units, decorated, facts.kept)
  units.forEach((u, i) => {
    // (its run-in labels and what TeX set for its groups, once B's glyphs are owned: marksOf, below)
    const content = piecesOf(u.pieces, { kindOf, idOfNested: x => ids[units.indexOf(x)] ?? null, nameOf, bib: BIB_UNITS.has(u.kind) })
    const id = unitId(u.kind, content)
    ids[i] = id
    const unhidden = own.units.get(i)?.unhidden
    const classes = classesOf(u.pieces, colours.get(i) ?? null, shown), spans = spansOf(u.pieces, colours.get(i) ?? null), passed = passedOf(u.pieces)
    classesBy[i] = new Map(classes)
    out.push({ id, kind: u.kind, content, ...(classes.length ? { classes } : {}), ...(spans.length ? { spans } : {}), ...(passed.length ? { passed } : {}), ...(Number.isInteger(u.depth) ? { depth: u.depth } : {}), ...(u.title ? { title: true } : {}), ...(u.front ? { front: true } : {}), ...(u.of ? { of: u.of } : {}), ...(u.held && (u.kind === 'author' || u.kind === 'affiliation') ? { stored: true } : {}), ...(facts.kept.has(i) ? { kept: true, [facts.why.get(i)]: true } : {}), ...(held.has(i) ? { fixed: true, decorated: 'token' } : {}), ...(facts.float.has(i) ? { float: facts.float.get(i) } : {}), ...(u.cell ? { cell: { table: u.cell.table, row: u.cell.row, col: u.cell.col, ...(u.cell.span ? { span: u.cell.span } : {}), ...(u.cell.head ? { head: true } : {}), ...(cellBoxes.has(i) ? { boxed: cellBoxes.get(i) } : {}) } } : {}), ...(align.has(i) ? { align: align.get(i) } : boxed.has(i) ? { align: boxed.get(i) } : {}), ...(unhidden === 'marks' ? { why: 'marks' } : {}) })
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
  // (the points open at each page's start, carried from page to page in order: one map for the glyphs' reading, one for the boxes')
  const openG = new Map(), openX = new Map()
  pages.forEach((pg, i) => {
    const G = ownersOf(pg.glyphs.length), X = ownersOf(pg.boxes.length / 4)
    const row = own.glyphs[i] ?? [], brow = own.boxes[i] ?? []
    const pieceG = glyphPiecesOf(pg, row, { units, texts: shown, names, open: openG })
    const pieceX = piecesByPoints(pg.points, pg.boxes.length / 4, j => brow[j], 'box', openX)
    const set = (O, j, g, piece) => {
      const m = /^u(\d+)(\.[pl])?$/.exec(g ?? '')
      if (m) { O.unit[j] = Number(m[1]); O.role[j] = m[2] === '.p' ? ROLE.element : m[2] === '.l' ? ROLE.label : ROLE.text; if (m[2] === '.p') O.piece[j] = piece[j]; return }
      const nm = nameGroupOf(g)
      if (nm && keyOf.has(nm.occurrence)) { O.unit[j] = babel(keyOf.get(nm.occurrence)); O.role[j] = nm.role }
    }
    for (let j = 0; j < pg.glyphs.length; j++) set(G, j, row[j], pieceG)
    for (let j = 0; j < pg.boxes.length / 4; j++) set(X, j, brow[j], pieceX)
    glyphs.push(G)
    boxes.push(X)
    // (no source unit owns a turned glyph: own.mjs reads none; a figure's turned text is locate's, on arXiv's page)
    turnedOwners.push(ownersOf(pg.turned?.length ?? 0))
  })
  // (the ink TeX set for a unit's tail pieces past its end point that no point of theirs bounds, its glyphs no unit's that spell
  // what TeX sets for each; and the text macros there whose ink it does not find, whose probe's text then says no more than
  // TeX's: their glyphs are no text of their unit's, past its end point (tailInkOf). classesBy's are the units' PieceClass objects)
  // (the ink of a macro of its opening point alone and of the one unmarked piece after it, where own.mjs's reading of the two
  // stops: splitInkOf)
  for (const c of splitInkOf(pages, units, { glyphs, classes: classesBy })) {
    const O = glyphs[c.page]
    for (const j of c.glyphs) {
      O.unit[j] = c.unit
      O.role[j] = c.role
      O.piece[j] = Number(c.piece)
    }
  }
  // (the ink of a piece of no point of its own, or of its opening point alone, that no reading found, by the text TeX states it
  // sets where its source places it, and with it the boxes of its decoration: unmarkedInkOf)
  for (const c of unmarkedInkOf(pages, units, { glyphs, boxes, classes: classesBy, texts: shown, decorated })) {
    const O = glyphs[c.page], X = boxes[c.page]
    for (const j of c.glyphs) {
      O.unit[j] = c.unit
      O.role[j] = ROLE.element
      O.piece[j] = Number(c.piece)
    }
    for (const x of c.boxes) {
      X.unit[x] = c.unit
      X.role[x] = ROLE.element
      X.piece[x] = Number(c.piece)
    }
  }
  const tail = tailInkOf(pages, units, { glyphs, classes: classesBy, inkless })
  for (const c of tail.ink) {
    const O = glyphs[c.page]
    for (const j of c.glyphs) {
      O.unit[j] = c.unit
      O.role[j] = c.role
      O.piece[j] = c.role === ROLE.element ? Number(c.piece) : -1
    }
  }
  for (const { unit, piece } of tail.unfound) delete classesBy[unit].get(piece).text
  // (each source unit's groups as TeX set them, read off its text glyphs on B, and its run-in labels: marksOf. The unit's id is
  // its source's, none of these)
  const textGlyphs = textGlyphsOf(read.doc, glyphs)
  units.forEach((u, i) => {
    // (an element whose glyphs are the unit's text: a text macro, its text the probe's; a text symbol, its character, own.mjs)
    const textOf = el => classesBy[i]?.get(el.id)?.text ?? symbolText(el.src) ?? undefined
    const spans = marksOf(out[i].content, textGlyphs.get(i) ?? [], out[i].spans ?? [], textOf)
    if (spans.length) out[i].spans = spans
  })
  // (TeX's \lineskip and \lineskiplimit: the mark probe's, which its log alone holds (layout/paper.mjs, the options' `lineskip`,
  // what today's file states); the marked compile's log where the options have none)
  const lineskip = options.lineskip ?? readSkipProbe(log)
  // (TeX's paragraph ends, its `qe<n><code>` points, where the marked compile set them: a paragraph ends before that glyph)
  const paragraphEnds = read.pages.map(({ raw }) => (raw?.paraEnds ?? []).map(x => x.glyph))
  // (each page's text frame as TeX shipped it: the bodies' statements in the log, LAYOUT_TEX's AXT-BODY, at their points)
  const frames = framesOf(pages, lastTexLog(log))
  // (each unit's \baselineskip and \parskip where its paragraph ends, LINES_TEX's AXT-LINES: TeX's paragraph separation there)
  const skips = [...readSkips(lastTexLog(log))].map(([unit, [baselineskip, parskip]]) => ({ unit, baselineskip, parskip }))
  // (each placeholder's two points `p<u>.<k>a` and `p<u>.<k>b`, u today's unit index, k its piece's: where the element begins
  // and ends in B's stream)
  const places = placesOf(pages, units.length)
  // (the pieces TeX sets no ink for (inklessPieces), and those TeX's points prove set nothing of their own (boundedEmpty): their
  // span stated empty, by unit index and piece id)
  const empty = inklessPieces(units, { classes: classesBy, inkless })
  const stated = new Set(empty.map(x => `${x.unit}|${x.piece}`))
  for (const x of boundedEmpty(pages, units, { glyphs, boxes })) if (!stated.has(`${x.unit}|${x.piece}`)) empty.push(x)
  // (the pieces TeX set before their unit's start point (outsidePieces): whatever they set is no text of the unit's)
  const outside = outsidePieces(pages, units, { glyphs })
  return {
    instrument: { ink: read.doc, units: out, glyphs, boxes, turned: turnedOwners, places, ...(empty.length ? { empty } : {}), ...(outside.length ? { outside } : {}), ...(read.recovered.length ? { recovered: read.recovered } : {}), tex: { ...(lineskip ? { lineskip } : {}), paragraphEnds, ...(frames.some(Boolean) ? { frames } : {}), ...(skips.length ? { skips } : {}) }, made: { compiler: made.compiler ?? 'pdflatex', tree: made.tree ?? '', front: made.front ?? '' } },
    today: { own, inkBase },
  }
}
