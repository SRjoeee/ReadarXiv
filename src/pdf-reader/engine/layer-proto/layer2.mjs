// src/pdf-reader/engine/layer-proto/layer2.mjs
// Ported from the private prototype (readarxiv-web, exp/instant-layer at 9e56fca,
// web/prototypes/instant-layer/layer2.js), 2026-10-06, as the instant layer's v0: the layer itself (iterations 2 and
// 3). Our own code, so no licence applies; the provenance is kept so that every number the prototype was approved on
// traces back to it. Unchanged in behaviour: the changes are the module paths, CJK characters written as \u escapes
// (the English gate), imports nothing uses left out, and what is named below. The prototype's own description follows.
//
// v0's changes here: the linter's, none of which changes what runs: `!st?.known` for `!st || !st.known`, and two
// unused locals and two unused names of a destructuring left out.
// And the size correction of a role table face (fonts.mjs setRoleFaces) on each run's SVG size, 1 for the prototype's.
// And step 3 (2026-10-07): a unit's leading relative to the original's own pitch (leadOf); the display environments the
// engine knows (layer1.mjs DISPLAY); and no unit drawn in part: past the fit's last state the host's further steps
// (run.mjs fitFurther: a single line widened over the paper beside it, the text run past a display, the size on below
// its floor, P.further and P.floorMin), the flow past a display being this module's (breakLines 'flow', P.flowPast).
// And prepareUnit in parts (step 2 of the layer's new direction, 2026-10-06), so that the four which read the page's
// geometry (lines, erase extents, labels, placeholder renderings) can come from another source: its statements moved
// into the parts as they were, in the same order; a set of claimed characters, which nothing read, left out. Every
// record, erase, crop, restore and SVG is the same on all 29 outputs.
//
// The instant translation layer, second iteration (and third, below). What changed from layer.js (iteration 1), each measured in the report:
//
// - Styles per run. Each unit's base style (class, weight, slant) and size are the original's own: the majority of the
//   characters of its words on the page (the source's words, as the alignment with `src` finds them), each character's
//   font classified by its PostScript name (fonts.js). The units' open/close pieces and switches (\textbf, \emph,
//   {\bf …}, \texttt…) change the style from there; \emph toggles. Each run is drawn in the target's face for its
//   class (fonts.js faceOf): CJK serif or sans, its bold, Kai or an oblique for italic (in the role table's faces, the
//   body's face sheared, fonts.mjs CJK_SLANT_DEG).
// - Baselines. Every line sits on the original's measured baseline (the median baseline of its characters in the text
//   layer), at the original's measured size (the transform's scale), never on a guess from the line's box. Text is
//   drawn as SVG <text>, whose `y` is the alphabetic baseline by definition for every face, so no font's ascent or
//   descent enters the position.
// - Fit before shrink, in an order given by the parameters (the sweep): tracking (CJK: punctuation compressed, then
//   tighter tracking; alphabets: letter spacing), the white space below the unit (an ink map of the original page),
//   leading (down to the script's floor), and only then the size, in steps, down to its floor; past it, clipped.
// - Line breaking: CJK kinsoku (as before), Korean at spaces with a cap on word spacing (ragged past it), alphabets at
//   spaces with TeX's patterns for hyphenation (hyph.js), CJK–Latin autospace in Chinese and Japanese. In Chinese and
//   Japanese a line may break before an inline formula that follows a CJK character (xeCJK's \CJKecglue), and a line that
//   would be letter-spaced without the group it misses takes it by squeezing (its marks' blank halves, then at most SQUEEZE
//   em a gap, never past the tracking floor) where that costs less a gap than the stretch (breakLines' squeezeTakes).
// - DOM text: an SVG per page over the page's copy, one <text> per line and a <tspan> per run, positioned from canvas
//   measurements (no layout read-back): selectable, copyable, searchable, vector at any zoom. The canvas copy keeps the
//   erasing and the crops of math.
//
// Iteration 3 (completeness, measured by check.js): nothing of the original may be lost or drawn twice.
// - Displayed formulas stay where they are: their source read as math (texToText2), their lines never moved before the
//   keep split (blocksOf2), all the lines they hold kept (displayTouched), the text after one starting below it (block
//   breaks, in reading order), a second alignment without their lines' words (a source word a formula also writes).
// - Placeholders: a gap holding two renderings cut into atoms and aligned as runs; the paper's own macros looked for
//   (phClass2) by name, weakly by place, and learnt per paper; citations by their keys' surnames and years, cut out of
//   merged gaps; references and footnote marks by atoms too; brackets the translation sets itself not doubled; a
//   placeholder drawn from its source given a second chance at a rendering no other took.
// - Characters: owned by the line their baseline most likely is (charsOfUnit2), measured in their own design's widths,
//   small capitals and spacing accents kept in their words, radicals hanging from their baseline; lines grown over a
//   formula's tail and an item's rest, a far-in first line from its block's edge before the alignment; labels with
//   their punctuation and caption labels kept.
// - Erasing: what a unit's erasing covers that no painted unit accounts for is put back from the original (kept lines
//   whole, the ink no accounted character stands on); crops grown over the ink they touch and darkened in.
//
// Route step 2 (2026-10-22): the layer draws a unit only from the layout file. What read the page's text where the file has
// no position is gone: the lines read from the anchors' rectangles, the placeholders' renderings found by aligning gaps
// with the source (atoms, citations matched by their keys' surnames and years, the second chance of a placeholder drawn
// from its source), and the first line's repairs (a far-in first line moved to its block's edge, its start snapped back to
// its first word). A unit the file does not hold stays the original's. The descriptions above of what those did are the
// history of how the readings the file now gives were first made.
import { keptPair, noStart } from './no-start.mjs'
import { work } from './work.mjs'
import { sourceRepeats, stutterCuts } from './stutter.mjs'
import { blocksOf, CITE, kinsokuOf, lcsPairs, median, norm, phClass, texToText, wordsOf } from './layer1.mjs'
import { faceOf, fontString, roleFaces, styleKey } from './fonts.mjs'
import { breakPoints } from './hyph.mjs'
import { drawnText, shown } from '../layer/pieces.mjs'
import { plainTracker, transformMap } from './words.mjs'
import { ownSmallCaps } from '../rules/font-roles.mjs'
import { symbolText } from '../rules/text-symbols.mjs'
import { textPieceOf } from '../rules/text-piece.mjs'
import { GENERATED_COMMANDS, headInTarget, refInTarget } from '../rules/tex-names.mjs'
import { NAME_KIND } from './units.mjs'
import { NAME_ENGLISH } from '../layout/names.mjs'
import { fillsByChar, UNKNOWN } from '../layout/fills.mjs'

/** a source text piece's characters (mt.mjs utf8: its bytes, read latin1, as UTF-8), here so that the drawing loads no wire module:
 *  sourceScopes holds what it reads to plainSource's text, and reads none where the two differ */
const SOURCE_DECODER = new TextDecoder(), ASCII_TEXT = /^[\t\n\r -~]*$/
const utf8 = s => {
  if (ASCII_TEXT.test(s)) return s
  const b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff
  return SOURCE_DECODER.decode(b)
}

// (the fit's parameters, per script and language, are the layout rules': rules/layout.mjs resolveRules gives a run its P)

// ---- the page's characters, each with its font's class

const mctx = new OffscreenCanvas(8, 8).getContext('2d')
const refW = new Map()
const wRef = ch => {
  let w = refW.get(ch)
  if (w === undefined) {
    mctx.font = '100px "Times New Roman", Times'
    w = mctx.measureText(ch).width
    refW.set(ch, w)
  }
  return w
}
/** a character's width at 100 px in its item's own design (iteration 3: Times' for all, before, which put a Palatino
 *  or Computer Modern line's characters points off by its end: a caption's label read "2" for "Figure 2:") */
const designW = new Map()
/** each style's font at 100 px in its design, by the role set it was resolved under (fonts.mjs roleFaces: setRoleFaces makes a
 *  new one for another target or family, and a face's fallbacks are the set's) and the style object (one a run of an item, asked
 *  for each of its characters: a face resolved through the role table each time was most of wDesign's time, the trace of
 *  2026-10-25). No role set (the prototype's faces) is a key of its own */
const designFonts = new WeakMap(), NO_ROLES = {}
const wDesign = (ch, st) => {
  if (!st?.known) return wRef(ch)
  const roles = roleFaces() ?? NO_ROLES
  let byStyle = designFonts.get(roles)
  if (!byStyle) designFonts.set(roles, (byStyle = new WeakMap()))
  let font = byStyle.get(st)
  if (font === undefined) {
    font = fontString(faceOf({ ...st, fam: st.fam === 'math' ? 'serif' : st.fam }, 'latin', 'en'), 100)
    byStyle.set(st, font)
  }
  const key = `${font}|${ch}`
  let w = designW.get(key)
  if (w === undefined) {
    mctx.font = font
    w = mctx.measureText(ch).width
    designW.set(key, w)
  }
  return w
}
/** a spacing accent TeX sets over a letter as a glyph of its own ("Zu¨rich"): no width of its own */
export const ACCENT = /^(?:[\u00A8\u00B4\u00B8\u00AF\u02C6-\u02DD\u0060\u005E\u007E]|\p{M})$/u
/**
 * The characters a font's own map gives its glyphs (PDF.js's `toUnicode` of a font loaded with fontExtraProperties: the
 * file's ToUnicode, or what its encoding names), each value as written and as PDF.js's text layer normalises it (a
 * ligature "ﬁ" read as "fi"); null where the font has no such map to read (an identity map, or no extra properties).
 */
export function mappedOf(toUnicode) {
  const map = toUnicode?._map
  if (!Array.isArray(map)) return null
  const out = new Set()
  for (const v of map) if (typeof v === 'string') for (const s of [v, v.normalize('NFKC')]) for (const ch of s) out.add(ch)
  return out
}
/**
 * mappedOf of a font as PDF.js's `commonObjs` holds it, failing closed: a font object (not Type3) with no `toUnicode`
 * key was exported without its extra properties (a document not opened with PDF_OPTIONS), and with no map to read
 * pageChars2 could mark only what no Unicode stands for, so a glyph read by its code (u442's sum sign) would pass as
 * proof. That throws. Anything else (a Type3 font, an error PDF.js resolved in a font's place, null) has none to read.
 */
export function fontMappedOf(font) {
  if (font === null || typeof font !== 'object' || typeof font.isType3Font !== 'boolean') return null
  if (!font.isType3Font && !('toUnicode' in font)) throw new Error("a font with no ToUnicode map to read: open the document with the engine's PDF_OPTIONS (fontExtraProperties)")
  return mappedOf(font.toUnicode)
}
/** a character no Unicode stands for: private use, a replacement character, a control */
const NO_UNICODE = /[\p{Co}\p{Cc}\uFFFD]/u
/** whether a page character's text is no reading of its glyph (pageChars2's `nu`): one no Unicode stands for, or one
 *  its font's own map (`mapped`, mappedOf's; null: none to read) gives none of its glyphs */
export const unmapped = (ch, mapped) => /\S/.test(ch) && (NO_UNICODE.test(ch) || (mapped != null && !mapped.has(ch)))
/** a font class with a character's fill (layout/fills.mjs): one object a class and fill, so that characters of one font and
 *  colour share their style as those of one font did; its font class itself, `font` (not enumerable), for what asks whether two
 *  characters are of one font whatever their colours (fontOfStyle) */
const filled = new WeakMap()
const withFill = (st, fill) => {
  if (!st || typeof st !== 'object' || fill === UNKNOWN) return st
  let m = filled.get(st)
  if (!m) filled.set(st, (m = new Map()))
  let out = m.get(fill)
  if (!out) m.set(fill, (out = Object.defineProperty({ ...st, fill }, 'font', { value: st })))
  return out
}
/** a character style's font class, its fill aside: what a tally of fonts counts, so that colour splits no font's characters */
export const fontOfStyle = st => st?.font ?? st
/**
 * A page's text content as characters: each item's width shared by its design's widths (what is left over, a justified
 * line's stretch, by its spaces where it has any), and the item's font class (`st`, from fontOf(fontName)) on every
 * character, with its fill where `fills` (each item's, layout/fills.mjs: the draw's, or the page's ink read live) tells it
 * (`st.fill`, 0xRRGGBB; none where it is not told). `mapOf(fontName)` (mappedOf's set, or null): a character the item's font
 * maps none of its glyphs to is marked `nu`, no Unicode of the file's. PDF.js reads such a glyph by its code (2307.16209's
 * newtx summation sign in txexs, read "Í"), so its text is not what the page shows; so is a private-use, replacement or
 * control character.
 */
export function pageChars2(textContent, fontOf, mapOf = null, fills = null) {
  const out = []
  for (const [item, it] of textContent.items.entries()) {
    if (!it.str || !it.transform) continue
    const [a, b, , d, x, y] = it.transform
    if (Math.abs(b) > 0.01 || d < 0) continue
    const size = Math.hypot(a, b) || it.height
    const st = fontOf(it.fontName)
    const mapped = mapOf?.(it.fontName) ?? null
    const chars = [...it.str]
    const fill = fills ? fillsByChar(fills[item], chars.length) : null
    const nat = chars.map(ch => (ACCENT.test(ch) && chars.length > 1 ? 0 : wDesign(ch, st) || 50))
    const sum = nat.reduce((s, v) => s + v, 0) || 1
    const scale = size / 100
    const extra = it.width - sum * scale
    const spaces = chars.filter(ch => ch === ' ').length
    const ws = extra > 0 && spaces && extra < 0.6 * size * spaces ? nat.map((v, k) => v * scale + (chars[k] === ' ' ? extra / spaces : 0)) : nat.map(v => (it.width * v) / sum)
    let cx = x
    chars.forEach((ch, k) => {
      const w = ws[k]
      // a radical hangs from its baseline (CMSY10's √: 0.04 em high, 0.96 em deep): its line is the one below
      const hang = ch === '√' && st?.fam === 'math' ? { ybEff: y - 0.75 * size } : null
      const nu = unmapped(ch, mapped) ? { nu: true } : null
      out.push({ ch, x0: cx, x1: cx + w, yb: y, size, item, ix: x, k, st: fill ? withFill(st, fill[k]) : st, ...hang, ...nu })
      cx += w
    })
  }
  return joinAccents(out, textContent.items)
}

/** each spacing accent's combining mark: grave, acute, circumflex, tilde, diaeresis, macron, breve, dot, ring, caron,
 *  cedilla, ogonek, double acute (Hungarian), as the fonts' ToUnicode maps write them (ASCII's three among them) */
const COMBINING = new Map([['`', '̀'], ['ˋ', '̀'], ['´', '́'], ['ˊ', '́'], ['^', '̂'], ['ˆ', '̂'], ['~', '̃'], ['˜', '̃'], ['¯', '̄'], ['ˉ', '̄'], ['˘', '̆'], ['˙', '̇'], ['¨', '̈'], ['˚', '̊'], ['˝', '̋'], ['ˇ', '̌'], ['¸', '̧'], ['˛', '̨']])
/** the marks set under a letter, which keep a dotless i dotless */
const BELOW = new Set(['̧', '̨'])
/**
 * A spacing accent TeX set as a glyph of its own joined to its letter (the M1 survey of 2608.16117: "Munster et al.,¨ 2013"
 * for Münster, seven citations; before, every such accent went to its line's end, charsOfUnit2). TeX's \accent sets the
 * accent, then moves back over it to set the letter (OT1's: the accent before its letter), or sets the letter first and the
 * accent over it (an accent-after-letter font); PDF.js starts a new item at such a move back, so the accent ends its item and
 * its letter begins the next (or the accent begins its item and its letter ended the one before), the two items overlapping
 * across. Joined where that is what the page shows: the two items in one font on one baseline, and the letter's span holding
 * the accent glyph's centre (its own width in its design back from its item's end, or on from its item's start), which only
 * the move back over the accent gives; the letter becomes its accented letter (NFC, one code point: ü, ć, č;
 * a dotless ı or ȷ under an accent above it the dotted letter's: Loïc) and the accent is no character of its own. An accent
 * alone in its item (a formula's \hat or \bar over a letter in another font, a capital's raised accent) keeps its own glyph
 * and box, and a mark written after its letter in one item joins that letter where they compose. Every other character
 * stays as it is.
 */
function joinAccents(chars, items) {
  // (each item's characters: their first and last index in `chars`, which holds them in item order)
  const runs = []
  chars.forEach((c, i) => { const r = runs.at(-1); if (r?.item === c.item) r.last = i; else runs.push({ item: c.item, first: i, last: i }) })
  const gone = new Set()
  const join = (letter, mark) => {
    const base = BELOW.has(mark) ? letter.ch : letter.ch === 'ı' ? 'i' : letter.ch === 'ȷ' ? 'j' : letter.ch
    const ch = (base + mark).normalize('NFC')
    if ([...ch].length !== 1 || ch === base + mark) return false
    letter.ch = ch
    return true
  }
  const isLetter = c => !!c && /^\p{L}$/u.test(c.ch) && !COMBINING.has(c.ch)
  runs.forEach((r, n) => {
    const it = items[r.item], end = it.transform[4] + it.width
    for (let i = r.first; i <= r.last; i++) {
      const c = chars[i]
      // (a combining mark written after its letter in the item)
      if (/^\p{M}$/u.test(c.ch)) { if (i > r.first && isLetter(chars[i - 1]) && !gone.has(i - 1) && join(chars[i - 1], c.ch)) gone.add(i); continue }
      const mark = COMBINING.get(c.ch)
      if (!mark || c.nu || r.first === r.last || (i !== r.first && i !== r.last)) continue
      const w = (wDesign(c.ch, c.st) * c.size) / 100, tol = 0.05 * c.size
      // the accent ends its item, its letter beginning the next; or begins it, its letter ending the one before
      const o = i === r.last ? runs[n + 1] : runs[n - 1]
      if (!o) continue
      const L = chars[i === r.last ? o.first : o.last]
      if (!isLetter(L) || L.nu || fontOfStyle(L.st) !== fontOfStyle(c.st) || Math.abs(L.yb - c.yb) > tol) continue
      // (the accent glyph's centre on the letter: only the move back over it puts it there)
      const mid = i === r.last ? end - w / 2 : it.transform[4] + w / 2
      if (mid >= L.x0 - tol && mid <= L.x1 + tol && join(L, mark)) gone.add(i)
    }
  })
  return gone.size ? chars.filter((_, i) => !gone.has(i)) : chars
}

// ---- the unit's line rectangles

const rectKey = r => `${r[0]}|${r.slice(1).join()}`

// ---- iteration 3: what each placeholder is, and which of the page's characters a unit holds

/** a placeholder's source as plain text, its environment, label and alignment marks left out (iteration 1's texToText
 *  gave "equationeq:identity y= F(x, Wi) + x. equation" for a displayed equation, which no rendering resembles) */
const MORE_SYMBOLS = { downarrow: '↓', uparrow: '↑', Downarrow: '⇓', Uparrow: '⇑', leftrightarrow: '↔', longrightarrow: '⟶', dagger: '†', ddagger: '‡', varnothing: '∅', emptyset: '∅', ell: 'ℓ', prime: '′', bullet: '•', checkmark: '✓', triangle: '△', square: '□', blacksquare: '■', diamond: '◇', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', hbar: 'ℏ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', wedge: '∧', vee: '∨', neg: '¬', lnot: '¬', setminus: '∖', subsetneq: '⊊', supset: '⊃', supseteq: '⊇', ni: '∋', perp: '⊥', parallel: '∥', angle: '∠', models: '⊨', vdash: '⊢', gg: '≫', ll: '≪', equiv: '≡', cong: '≅', asymp: '≍', doteq: '≐', bigcup: '⋃', bigcap: '⋂', oint: '∮', iint: '∬', coloneqq: '≔', mapsto: '↦', leadsto: '⇝', circledast: '⊛', textdagger: '†', textbullet: '•', S: '§', P: '¶' }
const ACCENTS = { '~': '\u0303', "'": '\u0301', '"': '\u0308', '`': '\u0300', '^': '\u0302', '=': '\u0304', '.': '\u0307', u: '\u0306', v: '\u030C', H: '\u030B', c: '\u0327', k: '\u0328', r: '\u030A' }
/** (an alignment tab goes, not an escaped ampersand: "Vinyals \& Kaiser" drew as "Vinyals \ Kaiser", 2026-10-07; a LaTeX
 *  text symbol, alone or before an empty group, is its character, the maker's table's: rules/text-symbols.mjs) */
export function texToText2(src) {
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
export function phClass2(src) {
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
export function textSymbol(src) {
  const t = symbolDrawn(src)
  if (/^\$|^\\\(/.test(src) && /[_^/]|√\(/.test(t)) return false
  return [...GRAPHEMES.segment(t)].length === 1
}
/** phClass2 as the layer reads a unit's placeholders: a 'symbol' that is no text symbol (textSymbol) is 'other', a formula
 *  the layout file must hold */
export function phClassProven(src) {
  const c = phClass2(src)
  return c.cls === 'symbol' && !textSymbol(src) ? { cls: 'other' } : c
}

/**
 * A table cell's room between the rules over and under its lines (Round 2 of the integration: a CJK cell's glyphs, taller
 * than the Latin they replace, reached the rule over 1706.03762's Table 4's header). A CJK script's em box stands 0.88 of
 * the size over the baseline and 0.12 under, Latin capitals some 0.7 over and descenders 0.22 under: a translation into
 * one is taller than the original over its baseline and shorter under it. `rulesOf(page)`: the page's rules (x0, y0, x1,
 * y1 stride 4: the add-on manifest's, removal.mjs pageRules, the PDF's own paths), each counted for a line it crosses
 * the extent of as it is laid (its rectangle, or its block's x0 to x1 where that is wider: a line widened). Each line's band: from the nearest rule over it less `clear` (or the original's own top, where that is
 * higher: never held below the original) down to the nearest under it plus `clear`, never past the original's own foot
 * (its line's band, not the next line's); with no rule over it, its em box's top at the original's baseline. Returns the
 * largest size every band holds the em box at (`cap`, a share of `s`; never below the rules' cellCapMin, the fit's last
 * floor) and the bands by block (`bands`: each line's baseline B, lo, hi), or null where no rule is near. `P` holds the
 * layout rules' `cellClear` (the room kept to a rule, PDF units) and `cellCapMin`
 */
export function cellBands(blocks, rulesOf, s, P) {
  const { cellClear: clear, cellCapMin } = P
  let cap = 1
  const bands = new Map()
  blocks.forEach((b, bi) => {
    const R = rulesOf(b.page)
    if (!R?.length) return
    b.B.forEach((B, j) => {
      const r = b.rects[j]
      if (!r || !Number.isFinite(B)) return
      let over = Infinity, under = -Infinity
      // (across the line as it is laid, its block's: a line widened over the paper beside it reaches past its rectangle,
      // and a rule over that part is its too, the re-review of round 3)
      const lx0 = Math.min(r[1], b.x0 ?? r[1]), lx1 = Math.max(r[3], b.x1 ?? r[3])
      for (let q = 0; q + 3 < R.length; q += 4) {
        if (Math.min(R[q + 2], lx1) - Math.max(R[q], lx0) <= 0.5) continue
        if (R[q + 1] >= B) over = Math.min(over, R[q + 1])
        else if (R[q + 3] <= B) under = Math.max(under, R[q + 3])
      }
      if (over === Infinity && under === -Infinity) return
      const foot = Math.min(r[2], B - 0.12 * s)
      const hi = over === Infinity ? B + 0.88 * s : Math.max(r[4], over - clear)
      const lo = under === -Infinity ? foot : Math.max(foot, under + clear)
      cap = Math.min(cap, (hi - lo) / s)
      ;(bands.get(bi) ?? bands.set(bi, []).get(bi)).push({ B, lo, hi })
    })
  })
  return bands.size ? { cap: Math.max(cellCapMin, Math.min(1, Math.floor(cap * 1000) / 1000)), bands } : null
}
/**
 * Each laid line that stands on one of the original's lines (its baseline the original's) moved into that line's band
 * (cellBands) at the size `f` it is drawn at, by the least that keeps its em box inside. A line the fit set on a pitch of
 * its own stands on none and is not moved: a band is the original line's (2608.04322's example cells, their translation
 * run on the script's leading, had their lines pulled onto the original's)
 */
export function clearLines(lines, bands, f) {
  for (const l of lines) {
    const on = bands.get(l.block)?.find(r => Math.abs(r.B - l.baseline) < 0.01)
    if (on) l.baseline = Math.min(Math.max(l.baseline, on.lo + 0.12 * f), on.hi - 0.88 * f)
  }
}

/**
 * charsOfUnit (layer.js), with each character owned by the rectangle whose line it stands on. Also: the lines one
 * rectangle holds are kept apart by a space; a size change alone is no word break (small capitals: "A" "N" for "AN", 0.8 pt
 * apart); a tall rectangle is erased only to its own characters' depth.
 * `exact` (a layout file's lines, tex.mjs): each rectangle's baseline and size; a line holds the characters within its
 * ink's extent (a point either side, a character's place in its item being an estimate) that stand on its baseline,
 * scripts and all (within a script's window of it, as the layout maker takes a line's glyphs), each the line's whose
 * baseline is nearest.
 */
export function charsOfUnit2(rects, charsByPage, extents, exact) {
  const out = []
  const yOf = c => c.ybEff ?? c.yb
  const holds = (r, c) => { const cx = (c.x0 + c.x1) / 2; return cx >= r[1] - 1 && cx <= r[3] + 1 && Math.abs(yOf(c) - exact.get(r).baseline) < 0.6 * Math.max(c.size, 5) + 1.5 }
  const sizeOf = new Map(rects.map(r => [r, exact.get(r).size]))
  const dist = (r, c) => Math.abs(yOf(c) - exact.get(r).baseline)
  const owner = new Map()
  for (const r of rects) for (const c of charsByPage[r[0] - 1] ?? []) {
    if (!holds(r, c)) continue
    const best = owner.get(c)
    if (!best || dist(r, c) < dist(best, c) - 1e-6) owner.set(c, r)
  }
  for (const r of rects) {
    const [page, x0, y0, x1, y1] = r
    const inside = (charsByPage[page - 1] ?? []).filter(c => owner.get(c) === r)
    const lines = []
    for (const c of [...inside].sort((a, b) => b.size - a.size)) {
      const l = lines.find(l => Math.abs(l.yb - yOf(c)) < 0.6 * l.size)
      if (l) l.chars.push(c)
      else lines.push({ yb: yOf(c), size: c.size || 1, chars: [c] })
    }
    lines.sort((a, b) => b.yb - a.yb)
    lines.forEach((l, li) => {
      if (li > 0) out.push({ ch: ' ', page, x0, x1, yb: l.yb, size: 0, rect: [x0, y0, x1, y1], space: true })
      // a spacing accent last on its line: between its letter and the next it broke the word ("Zu¨rich")
      const sorted = l.chars.sort((a, b) => a.ix - b.ix || a.item - b.item || a.k - b.k)
      const cs = [...sorted.filter(c => !ACCENT.test(c.ch)), ...sorted.filter(c => ACCENT.test(c.ch))]
      cs.forEach((c, n) => {
        const prev = cs[n - 1]
        const gap = prev ? c.x0 - prev.x1 : 0
        if (prev && prev.item !== c.item && !/\s/.test(prev.ch) && !/\s/.test(c.ch) && (gap > 0.12 * c.size || Math.abs(c.yb - prev.yb) > 0.2 * c.size)) out.push({ ch: ' ', page, x0: prev.x1, x1: c.x0, yb: c.yb, size: 0, rect: [x0, y0, x1, y1], space: true })
        out.push({ ...c, page, rect: [x0, y0, x1, y1] })
      })
    })
    if (extents && inside.length) {
      const z = sizeOf.get(r)
      // a rectangle much deeper than its line: its foot is a symbol's box, not ink (the next line stands there)
      const deep = y1 - y0 > 1.35 * 0.894 * z
      const foot = deep ? Math.max(y0, Math.min(...inside.map(c => c.yb - c.size * 0.3))) : y0
      extents.set(r, [Math.min(x0, ...inside.map(c => c.x0)), Math.min(foot, ...inside.map(c => c.yb - c.size * 0.22)), Math.max(x1, ...inside.map(c => c.x1)), Math.max(y1, ...inside.map(c => c.yb + c.size * 0.72))])
    }
    out.push({ ch: ' ', page, x0: x1, x1, yb: y0, size: 0, rect: [x0, y0, x1, y1], sep: true })
  }
  return out
}

/**
 * A unit's line rectangles grown over what stands beside them on their baselines and is no other unit's (iteration 2's
 * extendRects, which grew only over the source's own words): also over a formula's tail (math glyphs, brackets,
 * digits, operators: "(z) =" at a line's end), and a line that is not its block's last, being justified, out to its
 * block's right edge. Before, those characters were erased with the line (its erasing reaches the block's edge) though
 * no placeholder held them. `first`: the unit's first line (`rects` may be its lines on one page alone: run.mjs grows a
 * unit page by page). The rectangles are the layout file's lines, TeX's, each set to a measure: a justified line grows over
 * what is not math only up to its own measure, its run's (measuresOf), not its block's widest edge, and past it only over a
 * formula's tail that goes on from it, never across a float's gap (E3d: beside a float wrapped on the right, narrow lines
 * grew over the caption's label "Table 6: A" and its digits, which no unit's rectangle held, and the grown lines set the
 * measure of every narrow line of their run, 2602.23285 page 18). Mutates the rectangles.
 */
export function extendRects2(rects, charsByPage, others, src, wordsOfFn, normFn, pageViews, wordChars = charsByPage, first = rects[0]) {
  // (a file line's measure, read from the lines as the file gives them, before any growth: the growth over the source's own
  // words below, extendRects, would take a caption's label beside it that holds one, "Fig. 6: A", and the measure with it)
  const measureOf = new Map()
  for (const b of blocksOf(rects, pageViews)) {
    const m = measuresOf(b.rects)
    if (m) for (const q of b.rects) { const r = rects.find(x => x.join() === q.join()); if (r) measureOf.set(r, { x1: m.get(rectKey(q))[1], was: r[3] }) }
  }
  let grown = extendRects(rects, charsByPage, others, src, wordsOfFn, normFn, wordChars, first)
  // (and that growth never past it: the line as it was, or its measure, whichever is further)
  for (const [r, m] of measureOf) if (r[3] > m.x1 + 1) r[3] = Math.max(m.was, m.x1)
  const blocks = blocksOf(rects, pageViews)
  const lastOf = new Set(blocks.map(b => b.rects.at(-1).join()))
  const edgeOf = new Map(), justOf = new Map()
  const blockX0 = new Map()
  for (const b of blocks) for (const q of b.rects) {
    const r = rects.find(x => x.join() === q.join())
    edgeOf.set(q.join(), b.x1); justOf.set(q.join(), measureOf.get(r)?.x1 ?? b.x1); blockX0.set(q.join(), b.x0)
  }
  for (const r of rects) {
    const page = charsByPage[r[0] - 1] ?? []
    // by their centres: a character's place in its item is an estimate, off by a point or two at an item's end
    const inside = page.filter(c => (c.x0 + c.x1) / 2 >= r[1] - 0.5 && (c.x0 + c.x1) / 2 <= r[3] + 0.5 && c.yb >= r[2] - 0.2 && c.yb <= r[4] && /\S/.test(c.ch))
    if (!inside.length) continue
    const yb = median(inside.map(c => c.yb)), size = median(inside.map(c => c.size))
    const line = page.filter(c => Math.abs(c.yb - yb) < 0.45 * size && /\S/.test(c.ch) && !inside.includes(c)).sort((a, b) => a.x0 - b.x0)
    const foreign = c => (others[r[0]] ?? []).some(o => c.x0 >= o[1] - 0.5 && c.x1 <= o[3] + 0.5 && c.yb >= o[2] - 0.2 && c.yb <= o[4])
    const mathy = c => c.st?.fam === 'math' || /^[()[\]{}=+−\-×·<>≤≥|,.;:0-9∗*′]$/.test(c.ch)
    const key = r.join()
    const edge = !lastOf.has(key) ? justOf.get(key) : null
    // never out of the unit's own block (a column's paragraph took the next column's equation number "(4)")
    const bx0 = blockX0.get(key) ?? -Infinity, bx1 = edgeOf.get(key) ?? Infinity
    // an item the line holds the start of and that ends less than 8 pt past it is the line's to its end (an item's
    // extent is exact, its characters' places estimates: "FLOPs)." had its ")." left out)
    let x = Math.max(...inside.map(c => c.x1))
    for (const it of new Set(inside.map(c => c.item))) {
      const cs = page.filter(c => c.item === it).sort((a, b) => a.k - b.k)
      const end = Math.max(...cs.map(c => c.x1))
      if (end <= r[3] + 8) { x = Math.max(x, end); continue }
      // or over its rest: the word the line ends inside, then what is no word ("PosUnk [39]": a table cell's citation)
      let q = Math.max(...cs.map((c, n) => (inside.includes(c) ? n : -1)))
      let spaced = false, last = q
      for (q++; q < cs.length; q++) {
        const c = cs[q]
        if (/\s/.test(c.ch)) { spaced = true; continue }
        if (/[\p{L}]/u.test(c.ch) ? spaced : !mathy(c) && !/\d/.test(c.ch)) break
        last = q
      }
      x = Math.max(x, cs[last].x1)
    }
    // to the right: math always; anything while the line is a justified one, up to its block's edge. A file line:
    // anything up to its own measure, and past it only a formula's tail that goes on from it (within 0.6 em, as to the left),
    // never across the gap a float wrapped beside it leaves (\columnsep)
    const just = justOf.get(key)
    let to = x
    for (const c of line.filter(c => c.x0 >= x - 0.1)) {
      if (c.x0 - to > (c.x1 > just + 1 ? 0.6 : 1.2) * size || foreign(c) || c.x1 > bx1 + 3) break
      if (!(mathy(c) || (edge !== null && c.x1 <= edge + 1))) break
      to = c.x1
    }
    // to the left: math only (a formula the line starts with), never before the unit's first line
    let from = Math.min(...inside.map(c => c.x0))
    if (r !== first) for (const c of line.filter(c => c.x1 <= from + 0.1).reverse()) {
      if (from - c.x1 > 0.6 * size || foreign(c) || !mathy(c) || c.x0 < bx0 - 1) break
      from = c.x0
    }
    if (to > r[3] + 0.05) { r[3] = Math.round(to * 100) / 100 + 0.01; grown++ }
    if (from < r[1] - 0.05) { r[1] = Math.round(from * 100) / 100; grown++ }
  }
  return grown
}

/** a change of a paragraph's measure: a line's edge this many em off the line's before it */
const STEP_EM = 2
/** lines set to one measure: their edges within this many em of it (a justified line's ink ends a point or two short of
 *  its measure, or past it by a protruded hyphen) */
const MEASURE_TOL = 0.5
/**
 * A block's lines by the measure TeX set each to, where it changed within the paragraph (a wrapfigure beside its first
 * lines, \parshape, \hangindent, a cutout): 2609.26457 page 8, unit 43, whose lines 1 to 7 end at x 283 beside the figure
 * and its caption, lines 8 to 20 at 533; v0's block took its widest line's edge for every slot and laid the translation
 * over the caption. A step is an edge (either side) more than STEP_EM em off the line's before it that stays: the two lines
 * before it hold the old edge and the line after it the new, each within MEASURE_TOL em. The first line's start may lie
 * further in (its indent), and where the measure widens on the right the paragraph's last line may end short of it; an
 * isolated short line (a ragged or broken line, a paragraph's last) is no step. The block's kept lines (a display's rows)
 * are no line of a measure. Returns a Map of each line's key (rectKey) to its measure's [x0, x1], the extent of its run of
 * lines between two steps, or null where the block is one measure (every slot its block's edges, as before).
 */
export function measuresOf(rects, keep = null) {
  const lines = rects.filter(r => !keep?.has(rectKey(r)))
  const n = lines.length
  if (n < 4) return null
  const em = median(lines.map(r => (r[4] - r[2]) / 0.894))
  const step = STEP_EM * em, tol = MEASURE_TOL * em
  const cuts = new Set()
  for (const side of [1, 3]) {
    const e = lines.map(r => r[side])
    for (let i = 2; i + 1 < n; i++) {
      if (!(Math.abs(e[i] - e[i - 1]) > step)) continue
      const widens = side === 3 ? e[i] > e[i - 1] : e[i] < e[i - 1]
      const before = Math.abs(e[i - 2] - e[i - 1]) <= tol || (side === 1 && i - 2 === 0 && e[0] > e[1])
      const after = Math.abs(e[i + 1] - e[i]) <= tol || (side === 3 && widens && i + 1 === n - 1 && e[i + 1] < e[i])
      if (before && after) cuts.add(i)
    }
  }
  if (!cuts.size) return null
  const out = new Map()
  let from = 0
  for (const to of [...[...cuts].sort((a, b) => a - b), n]) {
    const run = lines.slice(from, to)
    const m = [Math.min(...run.map(r => r[1])), Math.max(...run.map(r => r[3]))]
    for (const r of run) out.set(rectKey(r), m)
    from = to
  }
  return out
}
/** a block's measure at slot `k` of its lines (on its grid) or at baseline `y`: its line's (measuresOf); between two lines
 *  of two measures the narrower of both, so that no slot runs over what stands beside either; [x0, x1] */
function measureAt(b, y, k) {
  const at = i => b.measures.get(rectKey(b.rects[i])) ?? [b.x0, b.x1]
  if (k >= 0 && k < b.rects.length) return at(k)
  const Y = b.G ?? b.B
  if (y >= Y[0] - 0.05) return at(0)
  for (let i = 0; i + 1 < Y.length; i++) {
    if (Math.abs(y - Y[i + 1]) <= 0.05) return at(i + 1)
    if (y < Y[i] && y > Y[i + 1]) { const a = at(i), c = at(i + 1); return [Math.max(a[0], c[0]), Math.min(a[1], c[1])] }
  }
  return at(Y.length - 1)
}

/**
 * blocksOf (layer.js) with its kept lines (a displayed formula) never moved: blocksOf started a far-in first line at its
 * block's edge before it split the block around the kept lines, so a formula that began a block (the unit's text went
 * on below it) lost its key, was laid over and erased (1512.03385 page 3's equations (1) and (2)). Each block also says
 * how many of the unit's kept regions come before it (`after`, counting those in `referenced`): the text that follows a
 * formula in the translation starts below it.
 * A far-in first line is not moved to its block's edge here (v0's change, step 2): a layout file's first line starts at
 * the unit's own mark (IEEE's "Index Terms—" before it), and one where another unit's line stands before it (a run-in
 * heading: 1810.04805's "Model Architecture", 1706.03762's "Encoder:") stays there, kept as the original's.
 * `breakAt`: a forced break's region by the key of the line TeX set after it (finishUnit), referenced: a block starts
 * at that line and counts the region before it, as one after a kept region does. `joinAt`: a forced break inside a frame,
 * by the key of the line TeX set after it (finishUnit): that line goes on the block of the line before it, whatever the
 * gap TeX's room opened between them (blocks2 closes it), and the gap is no pitch the next line is read by.
 */
export function blocksOf2(rects, pageViews, keep = null, regionOf = null, referenced = null, breakAt = null, joinAt = null, centred = undefined) {
  const kept = r => !!keep?.has(rectKey(r))
  const blocks = []
  let cur = null
  for (const [page, x0, y0, x1, y1] of rects) {
    const prev = cur?.rects.at(-1)
    const pitchSoFar = cur && cur.rects.length > 1 && !joinAt?.has(rectKey(prev)) ? cur.rects.at(-2)[4] - prev[4] : prev ? (prev[4] - prev[2]) * 1.4 : 0
    const joined = !!cur && cur.page === page && !!joinAt?.has(rectKey([page, x0, y0, x1, y1]))
    const follows = joined || (cur && cur.page === page && x0 < prev[3] && x1 > prev[1] && y1 < prev[4] && prev[2] - y1 < Math.max(pitchSoFar, (prev[4] - prev[2]) * 1.4) * 0.9)
    if (!follows) {
      cur = { page, rects: [] }
      blocks.push(cur)
    }
    cur.rects.push([page, x0, y0, x1, y1])
  }
  for (const b of blocks) {
    const rs = b.rects
    b.x0 = Math.min(...rs.map(r => r[1]))
    b.x1 = Math.max(...rs.map(r => r[3]))
    b.top = Math.max(...rs.map(r => r[4]))
    b.bottom = Math.min(...rs.map(r => r[2]))
    b.h = median(rs.map(r => r[4] - r[2]))
    b.pitch = rs.length > 1 ? median(rs.slice(1).map((r, i) => rs[i][4] - r[4])) : b.h * 1.38
    b.indent = Math.max(0, rs[0][1] - b.x0)
    const centres = rs.map(r => (r[1] + r[3]) / 2)
    const view = pageViews[b.page - 1]
    const pageCentre = view ? (view[0] + view[2]) / 2 : 306
    const widthsVary = Math.max(...rs.map(r => r[3] - r[1])) - Math.min(...rs.map(r => r[3] - r[1])) > 6
    // (centred as the layout file has the unit, `centred`: TeX's own alignment, else the maker's reading of arXiv's lines,
    // make.mjs; a unit no file holds, a part laid with no layout, by its lines here: several whose centres agree and whose
    // widths differ, or one in the page's middle)
    b.centred = typeof centred === 'boolean' ? centred : rs.length > 1 ? Math.max(...centres) - Math.min(...centres) < 3 && widthsVary : Math.abs(centres[0] - pageCentre) < 3 && b.x1 - b.x0 < 0.8 * (view ? view[2] - view[0] : 612)
    // (the measures its lines are set to, where TeX changed it within the paragraph: measuresOf; a centred block's lines
    // are no measure's)
    b.measures = b.centred ? null : measuresOf(rs, keep)
  }
  if (!keep?.size && !breakAt?.size) { for (const b of blocks) b.after = 0; return blocks }
  let after = 0
  return blocks.flatMap(b => {
    const runs = []
    let run = null
    b.rects.forEach((r, i) => {
      const brk = breakAt?.get(rectKey(r))
      if (brk !== undefined && referenced?.has(brk)) { run = null; after = Math.max(after, brk + 1) }
      if (kept(r)) {
        run = null
        const g = regionOf?.get(rectKey(r))
        if (g !== undefined && referenced?.has(g)) after = Math.max(after, g + 1)
      } else {
        if (!run) {
          run = { ...b, rects: [], indent: i === 0 ? b.indent : 0, after }
          runs.push(run)
        }
        run.rects.push(r)
      }
    })
    for (const r of runs) {
      r.top = Math.max(...r.rects.map(x => x[4]))
      r.bottom = Math.min(...r.rects.map(x => x[2]))
    }
    return runs
  })
}

/**
 * gapsOf (layer.js), with the words of some lines (`deny`: a displayed formula's, prepareUnit's second pass) kept from
 * the alignment, so that a source word the formula also writes is found in the text (2610.02069's "…using the RMSE:",
 * whose "RMSE" was taken from "RMSE_i(t) = …" below it: the text line joined the formula's gap, was kept, and the
 * translation was laid over the formula). Sets gapsOf2.last, the alignment itself.
 */
export function gapsOf2(unitChars, src, deny = null) {
  const gaps = gapsOfOnce(unitChars, src, true, deny?.size ? deny : null)
  gapsOf2.last = gapsOfOnce.last
  return gaps
}
function gapsOfOnce(unitChars, src, merge = false, deny = null) {
  let S = wordsOf([...src].map(ch => ({ ch })))
  // iteration 2 (merge): a page word the source spells as two or three ("B idirectional" for a bold-initial
  // "Bidirectional") is one word of the source
  if (merge) {
    const page = new Set(wordsOf(unitChars).map(w => w.w))
    const out = []
    for (let i = 0; i < S.length; i++) {
      const two = S[i + 1] && S[i].w + S[i + 1].w, three = S[i + 2] && two + S[i + 2].w
      if (!page.has(S[i].w) && three && page.has(three)) { out.push({ ...S[i], w: three, end: S[i + 2].end }); i += 2 }
      else if (!page.has(S[i].w) && two && page.has(two)) { out.push({ ...S[i], w: two, end: S[i + 1].end }); i++ }
      else out.push(S[i])
    }
    S = out
  }
  const O = wordsOf(unitChars, new Set(S.map(x => x.w)))
  const lineOf = o => `${unitChars[o.start].page}|${unitChars[o.start].rect.join()}`
  const pair = lcsPairs(S.map(x => x.w), O.map((x, q) => (deny?.has(lineOf(x)) ? `\u0000${q}` : x.w)))
  const matched = Uint8Array.from(pair, x => (x >= 0 ? 1 : 0))
  // iteration 2 reads the alignment itself: the page's words and which of them are the source's text (`pair`: each one's source
  // word, of S, whose `start` is its place in the source's plain text)
  gapsOfOnce.last = { O, matched, S, pair }
  const gaps = []
  let run = null
  for (let q = 0; q < O.length; q++) {
    if (!matched[q]) {
      // one rendering: the page's words left over with none of the source's between them (a citation may draw
      // several brackets: IEEE's "[4], [5]", "[11]–[13]")
      if (run) run.end = O[q].end
      else {
        run = { start: O[q].start, end: O[q].end }
        gaps.push(run)
      }
    } else run = null
  }
  return gaps.map(g => {
    let { start, end } = g
    // its brackets, a pair at a time (across a line's end or start): "[21, 22]", "(1)", never the ")" of "(Fig. 7)"
    const open = k => { let q = k - 1; while (q >= 0 && /\s/.test(unitChars[q].ch)) q--; return q >= 0 && /[([{]/.test(unitChars[q].ch) ? q : -1 }
    const close = k => { let q = k + 1; while (q < unitChars.length && /\s/.test(unitChars[q].ch)) q++; return q < unitChars.length && /[)\]}]/.test(unitChars[q].ch) ? q : -1 }
    for (let a = open(start), b = close(end); a >= 0 && b >= 0; a = open(start), b = close(end)) { start = a; end = b }
    // and a bracket the rendering opened or closed itself: "H(x" takes its ")"
    const depth = () => { let d = 0; for (let q = start; q <= end; q++) d += /[([{]/.test(unitChars[q].ch) ? 1 : /[)\]}]/.test(unitChars[q].ch) ? -1 : 0; return d }
    for (let d = depth(), b = close(end); d > 0 && b >= 0; d = depth(), b = close(end)) end = b
    for (let d = depth(), a = open(start); d < 0 && a >= 0; d = depth(), a = open(start)) start = a
    const chars = unitChars.slice(start, end + 1)
    return { text: chars.map(c => c.ch).join('').replace(/\s+/g, ' ').trim(), chars }
  })
}


/**
 * The unit's words on the page that are the source's (the alignment's matched words), by style: { key, st, size, runs }. Its size
 * the one its glyphs are set at, its faked small capitals aside (`small`, smallCapsOf's): each is a capital drawn at the small
 * capitals' size, not the size TeX was asked for, and a heading set so is most of them (2602.23285's "A.2 DYNAMIC SPECTRAL GRAPH
 * STRUCTURE": 21 of its 25 letters at 7.97 pt, its capitals at 9.96)
 */
function originalStyle(uc, O, matched, small = null) {
  const runs = [], tally = new Map(), sizes = []
  // by character, over the source's words: a word's bold initial is a run of its own (1810.04805's
  // **B**idirectional **E**ncoder…), a math glyph is no run
  O.forEach((o, q) => {
    if (!matched[q]) return
    for (const c of uc.slice(o.start, o.end + 1)) {
      if (c.sep || c.space || !c.st || !/\S/.test(c.ch) || c.st.fam === 'math') continue
      const key = styleKey(c.st)
      if (!small?.has(c)) sizes.push(c.size)
      tally.set(key, (tally.get(key) ?? 0) + 1)
      const last = runs.at(-1)
      if (last?.key === key) last.n++
      else runs.push({ key, n: 1, st: c.st })
    }
  })
  if (!runs.length) return null
  const key = [...tally].sort((a, b) => b[1] - a[1])[0][0]
  return { key, st: runs.find(r => r.key === key).st, size: median(sizes), runs: runs.map(r => ({ key: r.key, n: r.n })) }
}

/**
 * The size a unit set in small capitals is drawn at in a CJK target (zh, zh-TW, ja, ko), × its nominal size (its capitals',
 * originalStyle): the owner's (2602.23285's appendix headings, 2026-10-24: 1, as it is). A CJK script has no case, so its characters
 * stand where the original's capitals and small capitals both do; at 1 they are set at the size TeX was asked for, as an alphabet's
 * capitals are. The one number to change
 */
export const CJK_CAPS_SIZE = 1
/** the size a unit is laid at (run.mjs): the original's (originalStyle's, its faked small capitals aside), × CJK_CAPS_SIZE in a
 *  CJK target (`P.cjk`) where its base is set in small capitals as tokensOf2 reads it (its measured base, else its majority's
 *  without what its own groups set, baseOf); undefined where no glyph of it was read */
export function unitSizeOf(prep, P, unit = null) {
  const size = prep?.orig?.size
  if (!(size > 0)) return undefined
  if (!P?.cjk) return size
  // (baseOf only takes small capitals off, so a majority of none needs no reading of its groups)
  const caps = prep.measured?.st ? prep.measured.st.caps : !!prep.orig.st?.caps && (!unit?.pieces || baseOf(unit, prep.orig.st).caps)
  return caps ? size * CJK_CAPS_SIZE : size
}

/** a faked small capital is set at most this share of the size of its unit's letters whose case TeX did not change: NFSS's virtual
 *  small capitals faces (PSNFSS's ptmrc8t and its kind, fontinst's smallcapsscale) set theirs at 0.8, a case change of another kind
 *  (\MakeUppercase) at 1 */
export const SMALL_CAPS_SHARE = 0.9
/** the share of the size the layer draws small capitals at where the unit's page tells none (no faked one of its own: a face of
 *  real small capitals, which a face of none draws for it): NFSS's virtual faces' (ptmrc8t's), the share the survey's pages show
 *  (smallCapsOf's `ratio`) */
export const SMALL_CAPS_RATIO = 0.8
/** a lowercase letter, of any script */
const LOWER = /\p{Ll}/u
/** whether a character has case */
const cased = ch => ch.toLowerCase() !== ch.toUpperCase()
/** smallCapsOf's answer for a unit with no faked small capital and no capitals of the text's: one, read and never written */
const NO_SMALL_CAPS = Object.freeze({ small: new Set(), upper: new Set(), lower: new Set(), letters: Object.freeze([]) })
/**
 * The unit's faked small capitals (2602.23285's appendix headings, 2026-10-24). A face of the Times family has no small capitals of
 * its own, so NFSS sets `\scshape` in a virtual face that draws each lowercase letter as its upright face's capital at 0.8 of the
 * size, in the same PDF font as the capitals: no font name says small capitals, and the `\scshape` is the class's (a heading's
 * \@startsection), in no piece of the unit's source. The alignment pairs each page letter with the source letter it spells (norm
 * reads no case): a capital paired with a lowercase letter of the source, set at most SMALL_CAPS_SHARE of the median size of the
 * unit's letters and digits whose case TeX did not change, is a faked small capital. A capital at their size is a case change of
 * another kind, and a face of real small capitals (cmcsc10, LM Roman Caps, a face with an SC name) draws a lowercase letter as
 * itself. A capital paired with a lowercase letter of the source at the size of the letters TeX did not change is a capital of
 * the text's (`upper`): a class's \MakeTextUppercase heading (REVTeX's section titles, 2610.21288), a capital at its full size.
 * Returns { small, upper, lower, letters, ratio }: the page characters that are faked small capitals, those that are capitals of
 * the text's, those whose source letter is a lowercase one (the letters that can tell either), and every page letter and digit
 * read, each by the alignment's pairs (`pair` into S, gapsOfOnce's); `small` and `upper` are empty where no letter of the unit's
 * is of the source's own case. `ratio`, where `small` holds any: their size over the capitals' (the medians), to the hundredth,
 * the share the layer draws its own small capitals at (tokensOf2's capsRatio). The survey's 1747 faked capitals of 32 papers are
 * at 0.80 but one table's 36, at 0.71 (2608.27181, at 7 pt): a unit's own, never a paper's. `src`, where it walked the unit: the
 * source's code points it read, which measuredOf takes
 */
function smallCapsOf(unit, uc, O, S, pair) {
  if (!pair || typeof unit?.src !== 'string') return NO_SMALL_CAPS
  if (INK_KIND.test(unit.kind ?? '')) return inkSmallCaps(unit, uc, O, pair)
  // (a faked small capital is set at most SMALL_CAPS_SHARE of a median no larger than the unit's largest glyph, and a unit of the
  // text's capitals sets as lowercase letters fewer than half of its source's: where no capital of the unit's is that small and
  // its page sets half its source's lowercase letters or more, neither is, and the walk below is not made, the reading of nearly
  // every unit, a table's cell of acronyms too)
  // (plain loops, a letter's case by its code where it is ASCII: no closure and no string a character, the reading of every unit)
  let big = 0, any = false, lows = 0
  for (let i = 0; i < uc.length; i++) {
    const c = uc[i]
    if (c.sep || c.space || c.st?.fam === 'math') continue
    if (c.size > big) big = c.size
    const code = c.ch.charCodeAt(0)
    if ((code >= 97 && code <= 122) || (code > 127 && LOWER.test(c.ch))) lows++
  }
  for (let i = 0; i < uc.length && !any; i++) { const c = uc[i]; any = !c.sep && !c.space && c.size > 0 && c.size <= SMALL_CAPS_SHARE * big && c.st?.fam !== 'math' && c.ch !== c.ch.toLowerCase() }
  if (!any) {
    const src = unit.src
    let srcLows = 0
    for (let i = 0; i < src.length; i++) { const code = src.charCodeAt(i); if ((code >= 97 && code <= 122) || (code > 127 && LOWER.test(src[i]))) srcLows++ }
    if (2 * lows >= srcLows) return NO_SMALL_CAPS
  }
  const small = new Set(), upper = new Set(), lower = new Set(), letters = []
  const src = [...unit.src], same = []
  // (plain loops over the words and their characters: no closure and no slice a word)
  for (let q = 0; q < O.length; q++) {
    if (pair[q] < 0) continue
    const o = O[q], w = S[pair[q]]
    let at = w?.start ?? 0
    const end = w?.end ?? -1
    for (let i = o.start; i <= o.end; i++) {
      const c = uc[i]
      if (!c || c.sep || c.space) continue
      const key = norm(c.ch)
      if (!key) continue
      // (the source's next letters that spell this character's: one, or a ligature's two or three; measuredOf's walk)
      let k = at, first = -1, got = ''
      while (k <= end && got.length < key.length) { const n = norm(src[k]); if (n) { if (first < 0) first = k; got += n } k++ }
      if (got !== key) continue
      at = k
      if (!c.st || c.st.fam === 'math' || !(c.size > 0)) continue
      letters.push(c)
      const s = src[first]
      if (key.length === 1 && cased(s) && s === s.toLowerCase()) {
        lower.add(c)
        // (a capital the source writes lowercase: a small capital or another case change, told apart by its size below)
        if (cased(c.ch) && c.ch === c.ch.toUpperCase()) continue
      }
      same.push(c.size)
    }
  }
  // (its source's code points beside: measuredOf reads them again, and takes these)
  if (!same.length) return { small, upper, lower, letters, src }
  const ref = median(same), sizes = []
  for (const c of lower) {
    if (!cased(c.ch) || c.ch !== c.ch.toUpperCase()) continue
    if (c.size <= SMALL_CAPS_SHARE * ref) { small.add(c); sizes.push(c.size) }
    else upper.add(c)
  }
  // (their share of the capitals' size, to the hundredth: each glyph's size is the PDF's own, so one tells it exactly)
  return sizes.length ? { small, upper, lower, letters, src, ratio: Math.round((100 * median(sizes)) / ref) / 100 } : { small, upper, lower, letters, src }
}
/** an ink unit's kind (rules/content-classes.mjs: inkheads, inkorphan, …): its source our page's own text, its case as drawn */
const INK_KIND = /^ink/
/**
 * An ink unit's faked small capitals, by their size alone: its source is our page's own text, its case as drawn (rows.mjs unitOf's
 * `src`, the glyphs' characters), so no letter of it tells a case change, and smallCapsOf's walk finds none. Where every cased
 * glyph of it is a capital (a faked small capital is one), a capital set at SMALL_CAPS_SHARE or less of the size its full letters
 * are (those past SMALL_CAPS_SHARE of its largest) is a faked one, read as a source unit's is: its size its full letters', set in
 * small capitals (a running head in a Times \scshape, its "R" at 12 and "EFERENCES" at 9.6, drawn at 9.6 as source headings
 * beside it were drawn at 12). A unit with a lowercase glyph is read as before (a paragraph with a drop cap is none)
 */
function inkSmallCaps(unit, uc, O, pair) {
  const letters = []
  for (let q = 0; q < O.length; q++) {
    if (pair[q] < 0) continue
    for (let i = O[q].start; i <= O[q].end; i++) {
      const c = uc[i]
      if (c && !c.sep && !c.space && c.st && c.st.fam !== 'math' && c.size > 0 && /\S/.test(c.ch)) letters.push(c)
    }
  }
  if (!letters.length || letters.some(c => cased(c.ch) && c.ch !== c.ch.toUpperCase())) return NO_SMALL_CAPS
  let big = 0
  for (const c of letters) if (c.size > big) big = c.size
  const ref = median(letters.filter(c => c.size > SMALL_CAPS_SHARE * big).map(c => c.size))
  const small = new Set(letters.filter(c => cased(c.ch) && c.size <= SMALL_CAPS_SHARE * ref))
  if (!small.size) return NO_SMALL_CAPS
  return { small, upper: new Set(), lower: new Set(small), letters, src: [...unit.src], ratio: Math.round((100 * median([...small].map(c => c.size))) / ref) / 100 }
}
/**
 * Whether `chars` ({ st, small, lower }) are set in small capitals: what most of the glyphs that can tell hold, a tie to none.
 * A glyph tells it by its face's name (a real small capitals face, fonts.mjs classifyFont) or as a faked small capital
 * (smallCapsOf's `small`); where any of them is a faked one, a glyph that is no lowercase letter of the source (`lower`) and whose
 * face names none tells nothing, since NFSS draws a capital and a digit alike in either shape
 */
function capsVote(chars) {
  let fake = false
  for (let i = 0; i < chars.length && !fake; i++) fake = !!chars[i].small
  return majorityOf(chars, fake ? CAPS_OF_FAKED : CAPS_OF_NAMED, false) ?? false
}
/** what a glyph tells of small capitals beside faked ones, and where there are none (capsVote): no closure a vote */
const CAPS_OF_FAKED = c => (c.st.caps || c.small ? true : !c.lower ? undefined : false)
const CAPS_OF_NAMED = c => !!c.st.caps

/**
 * The unit's measured style (measuredStyle) over its matched words' characters, each by the source character it is: a page word
 * and the source word the alignment pairs it with (`pair` into S, a word the source spells in two or three pieces among them)
 * spell one string of letters and digits (layer1.mjs norm), so that each page letter is read in its own source letter's scope (a
 * style boundary inside a word, `\textbf{B}idirectional`, gives `B` the pair's and the rest the text's); a character that is
 * no letter or digit, or that does not align, is not read. Each tells the small capitals as smallCapsOf read it (`sc`: whether it
 * is a faked one, and whether its source letter is lowercase). A unit with no source pieces to read (sourceScopes null) has no base
 * measured here (`st` null: tokensOf2 reads today's, baseOf) and a colour only where every glyph whose fill is told holds the
 * same one
 */
function measuredOf(unit, uc, O, S, pair, sc = null) {
  const scopes = sourceScopes(unit), none = { sets: 0, chain: [], flip: 0 }, chars = [], fake = sc?.small.size > 0
  const src = scopes ? (sc?.src ?? [...unit.src]) : null
  const measured = c => !c.sep && !c.space && c.st && /\S/.test(c.ch) && c.st.fam !== 'math'
  O.forEach((o, q) => {
    if (!pair || pair[q] < 0) return
    const word = uc.slice(o.start, o.end + 1)
    if (!src) { for (const c of word) if (measured(c)) chars.push({ st: c.st, ...none }); return }
    const w = S[pair[q]]
    let at = w?.start ?? 0
    const end = w?.end ?? -1
    for (const c of word) {
      if (c.sep || c.space) continue
      const key = norm(c.ch)
      if (!key) continue
      // (the source's next letters that spell this character's: one, or a ligature's two or three)
      let k = at, first = -1, got = ''
      while (k <= end && got.length < key.length) { const n = norm(src[k]); if (n) { if (first < 0) first = k; got += n } k++ }
      if (got !== key) continue
      at = k
      if (!measured(c)) continue
      const scope = scopes[first] ?? none
      const ch = { st: c.st, sets: scope.sets, chain: scope.chain, flip: scope.flip }
      if (fake) { ch.small = sc.small.has(c); ch.lower = sc.lower.has(c) }
      chars.push(ch)
    }
  })
  if (!chars.length) return null
  if (scopes) return measuredStyle(chars)
  const told = chars.filter(c => Number.isInteger(c.st.fill) && c.st.fill >= 0)
  return { st: null, fill: told.length && told.every(c => c.st.fill === told[0].st.fill) ? told[0].st.fill : null, pieces: new Map() }
}

/** the original's style for a unit with no aligned words: the majority of the characters in its rectangles */
function rectStyle(uc) {
  const cnt = new Map(), sizes = []
  for (const c of uc) {
    if (c.sep || c.space || !c.st || c.st.fam === 'math' || !/\S/.test(c.ch)) continue
    const k = styleKey(c.st)
    cnt.set(k, (cnt.get(k) ?? 0) + 1)
    sizes.push(c.size)
  }
  if (!cnt.size) return null
  const key = [...cnt].sort((a, b) => b[1] - a[1])[0][0]
  const st = uc.find(c => c.st && styleKey(c.st) === key).st
  return { key, st, size: median(sizes), runs: [{ key, n: sizes.length }] }
}

/**
 * A unit against its original page: the per-unit reading of it (`Prepared`, whose contract layer2.d.mts writes), which the
 * rest of the layer reads (its blocks, tokens, drawing, restore and checker). It is made in parts, each filling its own
 * fields, from the layout file's `parts` (tex.mjs texParts): the layer draws a unit only from the file:
 *   1. frames and lines: the unit's characters on the file's lines, each line's baseline and size;
 *   2. erase extents (each line's own): each line's box to erase, before the drawing's padding;
 *   then the alignment (alignUnit, the file's lines): which characters are the source's words, the original's style, where
 *   the first word starts, and the file's held lines;
 *   3. labels (labelOf): a label the class sets before the unit's first line, kept as the original's;
 *   4. placeholder renderings: which of the page's ink each placeholder is, by the file's segments, and where it sits;
 *   then the resolution's rules (resolvePlaceholders): how each placeholder is drawn, the unit's citations and macros learnt;
 *   5. the file's crops (tex.mjs cropsOf): a rendering page text cannot be is its segments' crops, or the placeholder
 *   whose ink the file cannot draw (`unproven`, its k: the unit is then left the original's);
 *   and the finish (finishUnit): the kept lines in regions, a forced break the source locates (`breaks`, tex.mjs
 *   forcedBreaks) inside a frame its room on the line after it (`joinAt`), one whose next line opens another frame a
 *   region of no lines before that line, each character's category (what the restore and the checker read).
 * `charsByPage`: pageChars2's (the unit's own part of each page).
 */
export function prepareUnit(unit, rects, charsByPage, citeMap, deny, parts) {
  const phs = placeholdersOf(unit)
  const out = new Map()
  const lines = parts.lines(rects, charsByPage)
  out.extents = parts.extents ? parts.extents(lines, rects) : lines.extents
  // the checker's view (check.js): the unit's characters on the page, which of them are its source's words, and which
  // gap each placeholder took
  out.uc = lines.uc
  out.lineInfo = lines.lineInfo
  // (a unit on the file's own lines keeps the lines TeX says are no text of its own alone: the file's held lines, below,
  // and its found displays' rows, the finish's; no alignment's guess at another unit's line, which TeX's lines never are)
  const aligned = alignUnit(out, unit, rects, deny)
  // (the lines the file says the unit's source does not write: kept as the original's, as a display's are)
  if (lines.held?.length) out.keep = [...new Set([...(out.keep ?? []), ...lines.held])]
  const gaps = parts.label(out, unit, rects, charsByPage, aligned)
  // (the file knows each placeholder's ink by its own segments, over the unit's lines the file's own: what the renderings
  // leave of the gaps is the unit's text, categoriesOf)
  out.inkKnown = true
  // (each placeholder's fill and each colour piece's run's by the file, where it gives them: what its rendering's text and
  // the run are drawn in, tokensOf2)
  out.fillOf = parts.fillOf
  out.colourOf = parts.colourOf
  resolvePlaceholders(out, { unit, phs, rects, charsByPage, citeMap, gaps }, parts.renderings)
  const unproven = parts.crops(out)
  if (unproven >= 0) out.unproven = unproven
  // (where TeX ended a line at a forced break `\\`: each of its pieces with the line set after it)
  out.breaks = parts.breaks(unit)
  finishUnit(out, unit, rects, charsByPage)
  // a displayed formula found, whose lines hold words the alignment took for the source's ("RMSE" in "RMSE_i(t) =",
  // while the text says "…using the RMSE:"): aligned again without its lines' words, once
  if (!deny) {
    const touched = displayTouched(out, out.uc)
    const matchedThere = touched.size > 0 && out.uc.some(c => !c.sep && !c.space && touched.has(`${c.page}|${c.rect.join()}`) && out.matchedKeys.has(charKey(c)))
    if (touched.size && matchedThere) return prepareUnit(unit, rects, charsByPage, citeMap, touched, parts)
  }
  out.displayLines = displayTouched(out, out.uc)
  return out
}

/** a unit's placeholders by piece index, each with its source and class (phClassProven: a symbol that is no text symbol is
 *  a formula the file must find); a nested footnote is its mark */
export function placeholdersOf(unit) {
  const phs = []
  unit.pieces.forEach((p, k) => {
    if (p.t === 'ph') phs.push({ k, src: p.src, ...phClassProven(p.src) })
    else if (p.t === 'nested') phs.push({ k, src: '\\footnotemark', cls: 'num', nested: true })
  })
  return phs
}

/**
 * The unit's words against its source (gapsOf2), on the file's lines: which page characters are its text (matchedKeys), its
 * original style (orig), where its first word starts (firstX0). Returns the gaps: the page's runs of the unit that the
 * source does not write, each a placeholder's rendering or a label.
 * Every line of the file is one TeX set as this unit's own: no line is kept by the alignment, neither one with no source
 * word nor one with too few of them. The kept lines are the file's (`held`, prepareUnit) and its found displays' rows
 * (resolvePlaceholders, finishUnit) alone: the fix of the 2608.16117 survey, 2026-10-15, whose author-year citation lines
 * ("networks (Kim et al., 2016). Islam and Picu…") a rule that kept a line none of whose words are the source's took for
 * another unit's, their words a placeholder's and not the source's, the English left under the translation and a blank
 * band above it.
 */
function alignUnit(out, unit, rects, deny) {
  const uc = out.uc
  out.matchedKeys = new Set()
  let gaps = []
  if (uc.some(c => !c.sep)) {
    gaps = gapsOf2(uc, unit.src, deny).filter(g => g.text && !g.chars.every(c => c.sep))
    const { O, matched } = gapsOf2.last
    O.forEach((o, q) => { if (matched[q]) for (const c of uc.slice(o.start, o.end + 1)) if (!c.sep) out.matchedKeys.add(charKey(c)) })
    // (its faked small capitals: its size is its capitals', and it is set in small capitals where its letters that can tell say so,
    // which the majority's face, a face of no small capitals, does not: a unit read without its source pieces is drawn by it)
    const sc = smallCapsOf(unit, uc, O, gapsOf2.last.S, gapsOf2.last.pair)
    out.orig = originalStyle(uc, O, matched, sc.small) ?? rectStyle(uc)
    if (sc.small.size && out.orig && !out.orig.st.caps && capsVote(sc.letters.map(c => ({ st: c.st, small: sc.small.has(c), lower: sc.lower.has(c) })))) out.orig = { ...out.orig, st: { ...out.orig.st, caps: true } }
    // (the share of the size its small capitals are set at, where it has faked ones: what the layer draws its own at, tokensOf2)
    if (sc.ratio) out.capsRatio = sc.ratio
    // (in the text's capitals, where most of its letters that can tell are: a class's \MakeTextUppercase heading, whose translation
    // is drawn in the target's capitals at its size, tokensOf2's `upper`; a CJK character has no case)
    if (out.orig && sc.upper.size > 0 && 2 * sc.upper.size > sc.lower.size) out.orig = { ...out.orig, st: { ...out.orig.st, upper: true } }
    // (its base style and its pieces' colours as its glyphs hold them, where its source pieces tell what each word is inside: E1)
    out.measured = measuredOf(unit, uc, O, gapsOf2.last.S, gapsOf2.last.pair, sc)
    // where the unit's first word starts on the page: its line is erased from there (the anchors share an item's
    // width evenly between its characters, so a line's rectangle may start inside its first glyph: "1. Introduction")
    const q0 = matched.findIndex(m => m)
    if (q0 >= 0) {
      const c0 = uc[O[q0].start]
      if (c0 && `${c0.page}|${c0.rect.join()}` === rectKey(rects[0])) out.firstX0 = c0.x0
    }
  } else out.orig = null
  return gaps
}

/** a unit's source pieces (rows.mjs unitOf's `source`, whatever order its translation sets them in), else its own pieces */
export const sourcePiecesOf = unit => (Array.isArray(unit?.source) ? unit.source : unit.pieces)
/**
 * Part 3, labels, v0's: a label the unit's first line starts with that no placeholder draws (the unit begins with text):
 * a footnote's mark, a bullet, an item's number, set by the class before the unit's own start. Kept as the original's:
 * the first line starts after it (out.label). Returns the gaps without it.
 * Whether the unit begins with text is its source's (`unit.source`, rows.mjs unitOf's; its pieces where it carries none),
 * never its translation's: a label is what the class set before the unit's own start, and a placeholder the source opens
 * with is the unit's own ink, whatever its translation puts first (2610.18513v1 p19 u156, "\Cref{prop:lbCs} below shows
 * how…", whose Chinese begins with "below" and sets the placeholder second: its cleveref ink "Theorem 5.1" was taken for a
 * theorem's label, kept as the original's at the line's start, and drawn again inside the translation)
 */
export function labelOf(out, unit, rects, charsByPage, gapsIn) {
  let gaps = gapsIn
  const uc = out.uc
  const pieces = sourcePiecesOf(unit)
  // Iteration 3: the label is the first gap's first atom, so that one written beside a placeholder's rendering is found
  // ("¹ http://image-net.org/…": the footnote's mark and its URL were one gap, the mark erased), and a unit may start
  // with a placeholder that cannot render as it (a URL, not a reference)
  const firstText = pieces.find(p => p.t !== 'ph' || !['zero', 'space'].includes(phClass(p.src)))
  const g0 = gaps[0]
  if (g0) {
    const isReal = c => !c.sep && !c.space && /\S/.test(c.ch)
    // the gap's first atoms (to three: "Figure 3:"), the label the longest of them that reads as one
    const ends = []
    for (let a = g0.chars.findIndex(isReal), n = 0; a >= 0 && n < 3; n++) {
      let e = a
      while (e + 1 < g0.chars.length && isReal(g0.chars[e + 1])) e++
      ends.push([g0.chars.findIndex(isReal), e])
      a = g0.chars.findIndex((c, i) => i > e && isReal(c))
      if (a >= 0 && g0.chars.slice(e + 1, a).some(c => c.sep)) break
    }
    const pick = ends.map(([a, e]) => [a, e, g0.chars.slice(a, e + 1).filter(isReal).map(c => c.ch).join('').replace(/^(Figure|Fig\.|FIGURE|FIG\.|Table|TABLE|Algorithm|ALGORITHM|Listing|Theorem|Lemma|Definition|Proposition|Corollary|Remark|Example|Assumption)/, '$1 ')]).filter(([, , t]) => LABEL.test(t)).at(-1)
    const atom = pick ? g0.chars.slice(pick[0], pick[1] + 1).filter(c => !c.sep && !c.space) : []
    const e = pick?.[1] ?? -1
    const text = pick?.[2] ?? ''
    const okFirst = (firstText?.t === 'text' && /\S/.test(firstText.s)) || (firstText?.t === 'ph' && !['num', 'cite', 'symbol'].includes(phClass(firstText.src)) && !norm(texToText2(firstText.src)).startsWith(norm(text)))
    const firstKey = rectKey(rects[0])
    if (atom.length && okFirst && atom.every(c => `${c.page}|${c.rect.join()}` === firstKey) && uc.findIndex(isReal) === uc.indexOf(atom[0])) {
      // with the punctuation it ends with ("Figure 2:"), which is no word and so not in the gap
      let u = uc.indexOf(atom.at(-1))
      while (uc[u + 1] && !uc[u + 1].sep && !uc[u + 1].space && /^[.:;,)\]]$/.test(uc[u + 1].ch)) atom.push(uc[++u])
      out.label = { x1: Math.max(...atom.map(c => c.x1)), text, chars: atom }
      const rest = g0.chars.slice(e + 1)
      if (rest.some(isReal)) gaps = [{ text: rest.map(c => c.ch).join('').replace(/\s+/g, ' ').trim(), chars: rest.slice(rest.findIndex(isReal)) }, ...gaps.slice(1)]
      else gaps = gaps.slice(1)
    }
    // (v0's change, step 2) or, where the unit begins with text and its first line opens with what its source does not
    // write, before its first word: another unit's ink on that line (a run-in heading: 1810.04805's "Input/Output
    // Representations"), kept as the original's like a label, the first line starting after it; it was kept and laid over
    const real = g0.chars.filter(isReal)
    const drawsFirst = pieces.find(p => (p.t === 'text' ? /\S/.test(p.s) : p.t === 'ph' ? !['zero', 'space'].includes(phClass(p.src)) : p.t === 'nested'))
    if (!out.label && real.length && drawsFirst?.t === 'text' && out.firstX0 !== undefined && real.every(c => `${c.page}|${c.rect.join()}` === firstKey && c.x1 <= out.firstX0 + 0.1) && uc.findIndex(isReal) === uc.indexOf(real[0]) && !nearIn(norm(real.map(c => c.ch).join('')), norm(unit.src), unit.src)) {
      out.label = { x1: Math.max(...real.map(c => c.x1)), text: g0.text, chars: real }
      gaps = gaps.slice(1)
    }
  }
  return gaps
}
/**
 * A float's label as the final sets it in the target (the table-groups brief, Problem 2): `label` the label v0 or the
 * layout file found on the unit's first line (labelOf: "Table 2:", the file's "Table2:"), `names` the target's names of a
 * figure and a table (the layout rules' labels: babel's, which the final prints), `captions` which of the two the final names so
 * (live.mjs captionsOf: `target` or `source`), `to` the target. The name the final's babel gives the float, in capitals
 * where the original's is (a class's \MakeUppercase: TABLE I), a space, then the original's own number and punctuation;
 * null where the label is no figure's or table's, where the final keeps the paper's own name for it, or where the name is
 * the original's already (French's Figure and Table): the label is then kept as the original's ink
 */
export function labelInTarget(label, names, captions, to) {
  const m = label?.text && /^\s*(Figure|Fig\.|FIGURE|FIG\.|Table|TABLE)\s*([0-9]+(?:\.[0-9]+)?[a-z]?|[IVXL]+)\s*([.:]?)\s*$/.exec(label.text)
  if (!m || !names) return null
  const kind = /^t/i.test(m[1]) ? 'table' : 'figure'
  if (captions?.[kind] !== 'target' || !names[kind]) return null
  const caps = m[1] === m[1].toUpperCase()
  const name = caps ? names[kind].toLocaleUpperCase(to) : names[kind]
  if (name === m[1]) return null
  // the punctuation as the original's line has it after the number: a label's own characters, which labelOf took with it
  const punct = m[3] || ((label.chars ?? []).map(c => c.ch).join('').match(/[.:]$/)?.[0] ?? '')
  return `${name} ${m[2]}${punct}`
}
/**
 * A babel name (D1a: a generated heading the layout file locates, layout/file.mjs `names`) as the layer sets it in the
 * target: the target's word for its key (the layout rules' labels: babel's [captions]), in capitals where the original's
 * glyphs are and its macro's own text is not (`capitals`: a class's case change, which the target's word takes too).
 * Wherever TeX identified the heading (its macro, a style's literal by the definition it sits in, a name after the
 * paper's own \selectlanguage): what a compile of the translation sets there (live.mjs captionsOf) does not decide, as
 * it does a float's label (the coordinator's ruling on D1a's I4; PDF-READER §18.1). Null where the target has no word for
 * it (an empty one keeps the original's) or the word is the original's already (`own`, its characters)
 */
export function nameInTarget(name, own, labels, to) {
  const word = labels?.[name.key]
  if (!word) return null
  const text = name.capitals ? word.toLocaleUpperCase(to) : word
  return text.replace(/\s+/g, '') === String(own ?? '').replace(/\s+/g, '') ? null : text
}
/**
 * A babel name's size and whether it is set in faked small capitals, read off its characters on the page as a unit's are
 * (originalStyle over smallCapsOf, unitSizeOf): where the class changed its case (the file's `capitals`: its glyphs capitals, its
 * own text not), a capital set at SMALL_CAPS_SHARE of the name's largest letter or less is a faked small capital, and the name's
 * size is the median of its other letters', the size TeX was asked for. `name.size` (the file's: its glyphs' most) where none of
 * its characters tells one. 2010.11929v2 p9: ICLR's \sc "REFERENCES", its "R" at 12 and "EFERENCES" at 9.6, had its Chinese
 * drawn at 9.6, the source headings beside it ("5 CONCLUSION", "ACKNOWLEDGEMENTS") at 12
 */
export function nameStyleOf(chars, name) {
  const letters = (chars ?? []).filter(c => c.size > 0 && /\S/.test(c.ch ?? '') && c.st?.fam !== 'math')
  if (!letters.length) return { size: name.size, small: false }
  let big = 0
  for (const c of letters) if (c.size > big) big = c.size
  const small = new Set(name.capitals ? letters.filter(c => cased(c.ch) && c.ch === c.ch.toUpperCase() && c.size <= SMALL_CAPS_SHARE * big) : [])
  const rest = letters.filter(c => !small.has(c))
  return { size: rest.length ? median(rest.map(c => c.size)) : name.size, small: small.size > 0 }
}
/** a label's characters as its text: in reading order, a space where two stand a fifth of their size apart (a layout file's
 *  label box gives its glyphs, and no spaces: "Definition5.1(") */
export function spacedText(chars) {
  const cs = [...(chars ?? [])].filter(c => /\S/.test(c.ch ?? '')).sort((a, b) => a.x0 - b.x0)
  let out = ''
  cs.forEach((c, i) => { if (i && c.x0 - cs[i - 1].x1 >= 0.2 * Math.max(c.size ?? 0, cs[i - 1].size ?? 0)) out += ' '; out += c.ch })
  return out
}
/**
 * A theorem-like head's label as the target names it (PDF-READER §19.11): the head macro's label TeX set before the unit (the
 * layout file's label box, `chars` the page's characters in it: "Definition 5.1 (", "Theorem 2."), its name in translator's
 * dictionary's word for the target (rules/tex-names.mjs headInTarget: ctex's for Chinese), its number and punctuation the
 * original's. The parts it is drawn in: its name and number in the style of its first character, its punctuation after them
 * in the style of its last (amsthm's bold "Definition 5.1" and the note's upright "("), and whether it ends in an opening
 * bracket, which the unit's text follows with no space. Null where it is no head of a name the target's dictionary holds,
 * nor one the paper's name units translate (`names`, English → the target's: §19.14)
 */
export function headLabelInTarget(chars, to, names = null) {
  const text = spacedText(chars)
  // (a babel name's head is the names' own, nameInTarget's: amsthm's "Proof.", whose name group a label's drawing never hides,
  // 2610.18513v1 p38 u347, the file holding no name there and the label box the name and its joint both)
  if (BABEL_HEADS.test(text)) return null
  const drawn = headInTarget(text, to, names)
  if (!drawn) return null
  const cs = [...chars].filter(c => /\S/.test(c.ch ?? '')).sort((a, b) => a.x0 - b.x0)
  const tail = /[\s.:([]*$/.exec(text)[0], drawnTail = /[\s.:([]*$/.exec(drawn)[0]
  const own = st => (st && st.fam !== 'math' ? { bold: !!st.bold, italic: !!st.italic, ...colourOfStyle(st) } : {})
  const nTail = tail.replace(/\s/g, '').length
  const parts = [{ text: drawn.slice(0, drawn.length - drawnTail.length), st: own(cs[0]?.st) }]
  if (drawnTail) parts.push({ text: drawnTail, st: own((nTail ? cs[cs.length - nTail] : cs.at(-1))?.st) })
  return { text: drawn, parts, open: /[([]\s*$/.test(drawn) }
}
/**
 * A structural name's row (a unit of kind `name`, bundleUnitsOf's, as rows.mjs unitOf reads it) as [its English, the target's
 * word for it] (PDF-READER §19.14): its source's text and its translation's text pieces joined, each's white space one space,
 * an ideographic full stop the translator ends a word with as a sentence gone. Null for another unit, a row of no
 * translation (none, lost) or of an empty one
 */
export function nameOfRow(u) {
  if (u?.kind !== NAME_KIND || typeof u.src !== 'string' || !Array.isArray(u.pieces) || (u.state !== 'whole' && u.state !== 'partial')) return null
  const english = u.src.replace(/\s+/g, ' ').trim()
  const word = u.pieces.filter(q => q?.t === 'text' && typeof q.s === 'string').map(q => q.s).join('').replace(/\s+/g, ' ').trim().replace(/[\u3002\uff0e]$/u, '').trim()
  return english && word ? [english, word] : null
}
/** a head that is a babel name whole (NAME_ENGLISH: "Proof", "Abstract"), its punctuation after it; a theorem's of a longer
 *  name ("Proof Sketch 1.", translator's own) is no babel name's */
const BABEL_HEADS = new RegExp(`^\\s*(?:${Object.values(NAME_ENGLISH).join('|')})\\s*[.:\\u2013\\u2014]?\\s*$`, 'u')
/** the placeholders whose text TeX's cross-referencing packages generate, a counter type's name before the number:
 *  cleveref's \cref and \Cref (and their range, page and name forms), hyperref's \autoref */
export const GENERATED_REF = new RegExp(`^\\\\(?:${GENERATED_COMMANDS.join('|')})\\*?\\s*\\{`)
/** a citation's note (its last optional argument: \cite[Lemma~1]{…}, natbib's \citep[see][Section~2]{…}) as TeX sets it */
const CITE_NOTE = /^\\(?:cite[a-z]*|parencite|textcite|autocite)\*?((?:\s*\[[^\]]*\])+)\s*\{/
/**
 * Each placeholder a unit's reading draws as its page's text (`orig-text`) whose names a package generated, in the target's
 * names (`rename`, [start, end, word] over its text: rules/tex-names.mjs refInTarget): a generated reference whole
 * (GENERATED_REF: "Theorem A.17" in zh ctex's name for a theorem and "A.17"), a citation's note where it is a name and its
 * numbers ("[Ascolani et al., 2026, Lemma 1]", the note "Lemma 1" in ctex's name for a lemma and "1"), the rest of a citation
 * the cited work's own. One no package names whole in
 * the target is left as its page shows it. `labels`: the layout rules' labels (babel's names); `names`: the paper's own name
 * units' translations (English → the target's: §19.14), a word no package names in the target
 */
export function renameRefs(prep, to, labels, names = null) {
  for (const r of prep.values()) {
    if (r?.mode !== 'orig-text' || r.sup || typeof r.src !== 'string' || typeof r.text !== 'string') continue
    if (GENERATED_REF.test(r.src)) {
      const x = refInTarget(r.text, to, labels, names)
      if (x?.length) r.rename = x
      continue
    }
    const m = CITE_NOTE.exec(r.src)
    if (!m) continue
    const note = [...m[1].matchAll(/\[([^\]]*)\]/g)].at(-1)?.[1].replace(/~|\\[ ,]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!note || !/\p{L}/u.test(note)) continue
    const at = r.text.lastIndexOf(note)
    if (at < 0 || r.text.indexOf(note) !== at || /[\p{L}\p{N}]/u.test(r.text[at + note.length] ?? '')) continue
    const x = refInTarget(note, to, labels, names)
    if (x?.length) r.rename = x.map(([a, b, w]) => [a + at, b + at, w])
  }
}
/** a rendering's runs (each { text, st }, their texts joined its text) with its replacements made, each inside one run; null
 *  where one crosses two runs (a name half in a link's colour), the runs then as they are */
export function renameRuns(runs, rename) {
  const out = runs.map(r => ({ ...r }))
  let from = 0
  const starts = out.map(r => { const s = from; from += r.text.length; return s })
  for (const [a, b, w] of [...rename].sort((x, y) => y[0] - x[0])) {
    const i = starts.findIndex((s, j) => a >= s && b <= s + out[j].text.length)
    if (i < 0) return null
    const s = starts[i]
    out[i].text = out[i].text.slice(0, a - s) + w + out[i].text.slice(b - s)
  }
  return out
}
/** a text's width at size 1 in a face (its run's at 100 px over 100: the canvas's, cached), for a name's room */
export const widthOf = (s, face) => w100(s, face) / 100

/** what a label reads as: a number, a mark, an item's, or a float's or a theorem's name and number */
const LABEL = /^(?:[\d*†‡§¶•◦▪–·]{1,3}|\(?[a-z0-9ivx]{1,4}[.)]|(?:Figure|Fig\.|FIGURE|FIG\.|Table|TABLE|Algorithm|ALGORITHM|Listing|Theorem|Lemma|Definition|Proposition|Corollary|Remark|Example|Assumption)\s*[\dIVXL]+(?:\.\d+)?[a-z]?[.:]?)$/

/** a placeholder's class as the renderings are kept: a citation, a reference's or a mark's number, anything else */
const renderingClass = c => (c === 'macro' || c === 'umacro' || c === 'display' ? 'other' : c)
/** a citation's keys, from its source */
export const citeKeys = src => src.replace(CITE, '').replace(/\}$/, '').split(',').map(k => k.trim()).filter(Boolean)
const numsOf = g => {
  const r = []
  for (const m of g.text.matchAll(/(\d+)(?:\]?\s*[–-]\s*\[?(\d+))?/g)) {
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a
    for (let n = a; n <= b && n - a < 50; n++) r.push(String(n))
  }
  return r
}
/**
 * A citation's rendering found: in the source's own brackets ("([10, 25, 24, 35])") its brackets are the source's text,
 * and the rendering is what is inside them; and what it says learnt for the paper (citeMap: a key's number, an
 * author-year key's text), by which the units laid after it draw a citation not found. Returns the rendering.
 */
export function learnCite(p, g0, citeMap) {
  let g = g0
  if (/^\(\s*\[/.test(g.text) && /\]\s*\)$/.test(g.text)) {
    const real = g.chars.filter(c => !c.sep && !c.space && /\S/.test(c.ch))
    const inner = g.chars.slice(g.chars.indexOf(real[0]) + 1, g.chars.indexOf(real.at(-1)))
    g = { text: inner.map(c => c.ch).join('').replace(/\s+/g, ' ').trim(), chars: inner, of: g }
  }
  if (citeMap && p.keys.length === 1) citeMap.set(p.keys[0], numsOf(g)[0])
  if (citeMap && p.keys.length === 1 && YEAR.test(g.text)) {
    if (!citeMap.text) citeMap.text = new Map()
    citeMap.text.set(p.keys[0], g.text)
  }
  return g
}

/**
 * A rendering in its own brackets without them (`real`, its characters, the brackets first and last; `inner`, those
 * between): their text and characters. A rendering a layout file's segment gives (`proof`, its `box`) keeps its box,
 * clipped across to what lies between the brackets on its line, so that its crop is still cut from the segment's own ink
 * (layer2.mjs drawnAs), never estimated from the text layer's characters
 */
function unbracketed(g, real, inner) {
  const out = { text: inner.map(c => c.ch).join('').replace(/\s+/g, ' ').trim(), chars: inner, of: g.of ?? g, unbracketed: true, ...(g.proof ? { proof: true } : {}) }
  const box = g.box
  if (!box) return out
  const open = real[0], close = real.at(-1)
  const x0 = Math.max(box.x0, open.x1), x1 = Math.min(box.x1, close.x0)
  out.box = box.lines === 1 && open.page === close.page && x1 > x0 ? { ...box, x0, x1 } : box
  return out
}

/**
 * The resolution's rules, over the layout file's renderings (`renderingsOf`, tex.mjs texParts): each placeholder by piece
 * index drawn as nothing, a space, a symbol from its source, a kept rendering, its rendering's page text or crop (drawnAs), a
 * citation as the unit wrote it before (cite-map), or its source's plain text; a rendering in brackets the translation sets
 * itself without its own; the unit's own macros learnt by their renderings. Sets the resolutions, out.gaps and the kept
 * lines of displays.
 */
function resolvePlaceholders(out, ctx, renderingsOf) {
  const { unit, phs, rects, charsByPage, citeMap } = ctx
  const uc = out.uc
  for (const p of phs) if (p.cls === 'cite') p.keys = citeKeys(p.src)
  // a paper's own macro is known by its rendering once it has been found (citeMap.macros, the paper's)
  if (citeMap && !citeMap.macros) citeMap.macros = new Map()
  const macros = citeMap ? citeMap.macros : new Map()
  const { gaps, gapFor, fixed, inked } = renderingsOf({ ...ctx, uc, out })
  out.gaps = gaps
  const gapOf = new Map()
  for (const p of phs) {
    // (a source that knows how a placeholder is drawn: a layout file's macro that sets no ink, or its text symbol)
    const f = fixed?.(p)
    if (f) out.set(p.k, f)
    else if (p.cls === 'zero') out.set(p.k, { mode: 'none', text: '' })
    // (a space but where its source knows TeX set ink for it, a layout file's found row: drawn as that ink, below)
    else if (p.cls === 'space' && !inked?.(p)) out.set(p.k, { mode: 'none', text: ' ' })
    else if (p.cls === 'symbol') {
      // (a LaTeX text symbol is its character, never a superscript: \textasciicircum's caret is no script's mark)
      const own = symbolText(p.src)
      const text = own ?? texToText2(p.src)
      // a mark the unit starts with that the original shows just before the unit's first line (not erased): not drawn
      // twice (2610.02069's "* These authors…", drawn "**")
      if (p === phs[0] && unit.pieces.slice(0, p.k).every(q => q.t === 'ph' || !/\S/.test(q.s ?? '')) && leadMark(rects, charsByPage, own ?? text.replace(/^\^/, ''))) out.set(p.k, { mode: 'kept', text: '' })
      else if (own !== null) out.set(p.k, { mode: 'symbol', text: own, math: true, sup: false })
      else out.set(p.k, { mode: 'symbol', text: text.replace(/^\^\(?|\)$/g, ''), math: true, sup: /^\$?\^/.test(p.src.replace(/^\$/, '')) || /^\^/.test(text) })
    }
    else {
      const cls = renderingClass(p.cls)
      let g = gapFor(p, cls)
      // (a citation's own round brackets as well: "\uFF08(Zhai et al., 2019a)\uFF09")
      if (g && (cls === 'num' || cls === 'other' || (cls === 'cite' && /^\(/.test(g.text))) && /^[([]/.test(g.text) && /[)\]]$/.test(g.text) && bracketed(unit.pieces, p.k)) {
        // the translation sets the brackets round it itself ("Eqn.\uFF08\ref{…}\uFF09"): the rendering without its own, which
        // the gap took from the source's text ("Eqn.(1)"), or the reader sees "\uFF08(1)\uFF09"
        const real = g.chars.filter(c => !c.sep && !c.space && /\S/.test(c.ch))
        const inner = g.chars.slice(g.chars.indexOf(real[0]) + 1, g.chars.indexOf(real.at(-1)))
        if (inner.some(c => /[\p{L}\p{N}]/u.test(c.ch))) g = unbracketed(g, real, inner)
      }
      if (g) gapOf.set(p.k, g)
      if (!g && cls === 'cite' && citeMap && p.keys.length && p.keys.every(k => citeMap.has(k))) {
        // an author-year paper's citation as the page wrote it before (iteration 2 gave "[2017]")
        const years = p.keys.every(k => citeMap.text?.has(k))
        out.set(p.k, { mode: 'cite-map', text: years ? p.keys.map(k => citeMap.text.get(k)).join('; ') : `[${p.keys.map(k => citeMap.get(k)).join(', ')}]` })
        continue
      }
      const sup = p.nested || /^\\footnotemark/.test(p.src)
      if (p.cls === 'display') {
        if (g) out.keep = [...(out.keep ?? []), ...displayLines(g, uc)]
        out.set(p.k, { mode: g ? 'kept' : 'none', text: '' })
        continue
      }
      if (g && out.keep?.length && g.chars.filter(c => !c.sep && !c.space).every(c => out.keep.includes(`${c.page}|${c.rect.join()}`))) {
        out.set(p.k, { mode: 'kept', text: '' })
        continue
      }
      if (!g) out.set(p.k, { mode: 'source', text: p.nested ? '*' : texToText2(p.src), math: p.cls === 'other', sup })
      else out.set(p.k, drawnAs(p, g, cls, sup, out.lineInfo))
    }
  }
  // each resolution with its placeholder and the gap it took (the checker's)
  for (const p of phs) {
    const r = out.get(p.k)
    if (r) Object.assign(r, { k: p.k, src: p.src, cls: p.cls, gap: gapOf.get(p.k) ?? null })
  }
  // a rendering in the source's own brackets inside the translation's ("\uFF08(RMSE)\uFF09"), wherever it was found
  for (const p of phs) {
    const r = out.get(p.k)
    const g = r?.gap
    if (!g || g.unbracketed || (r.mode !== 'crop' && r.mode !== 'orig-text') || !/^[([]/.test(g.text) || !/[)\]]$/.test(g.text) || !bracketed(unit.pieces, p.k)) continue
    const real = g.chars.filter(c => !c.sep && !c.space && /\S/.test(c.ch))
    const inner = g.chars.slice(g.chars.indexOf(real[0]) + 1, g.chars.indexOf(real.at(-1)))
    if (!inner.some(c => /[\p{L}\p{N}]/u.test(c.ch))) continue
    const ng = unbracketed(g, real, inner)
    const cls = p.cls === 'cite' ? 'cite' : p.cls === 'num' ? 'num' : 'other'
    out.set(p.k, { ...drawnAs(p, ng, cls, r.sup, out.lineInfo), k: p.k, src: p.src, cls: p.cls, gap: ng })
  }
  for (const p of phs) {
    const r = out.get(p.k)
    if (!p.unknown || !r) continue
    if ((r.mode === 'orig-text' || r.mode === 'crop') && r.gap?.text && !macros.has(p.src)) macros.set(p.src, r.gap.text)
    // not found: drawn as it was found before, if it was
    if (r.mode === 'source' && !r.text && macros.has(p.src)) r.text = macros.get(p.src)
  }
}

/**
 * The finish, either source's: a located display's lines all kept, the kept lines in runs (regions) in the unit's order
 * with the kept placeholders' regions (the text after one starts below it), and what became of each of the unit's
 * characters (categoriesOf: what the restore puts back and the checker reads).
 */
function finishUnit(out, unit, rects, charsByPage) {
  const uc = out.uc
  // a located display's lines all kept: those it holds a third of, and their pieces on the same band (a fraction's
  // numerator line it holds less of was laid over and erased)
  out.keep = [...new Set([...(out.keep ?? []), ...displayTouched(out, uc)])]
  // the kept lines in runs (regions), in the unit's order: the text after a kept placeholder starts below its region. A
  // forced break the source locates (`breaks`: its pieces, each with the file's line TeX set after it and TeX's room
  // between the two) ends the laid line where its pieces are. Inside a frame its frame's pitch is kept on the line after it
  // (`joinAt`, by its key: the rows on both sides of the gap one block, the gap closed to that pitch, blocks2) and its room
  // on its pieces (left in the drawing's pitches after the line it ends, breakLines), so that the unit is laid on one grid at one leading and what its
  // translation does not use of its lines is at its end. One whose next line opens another frame is a region of no lines
  // of its own just before that line (`breakAt`, by its key), which its pieces hold: the text after it starts there
  const keepSet = new Set(out.keep ?? [])
  out.regionOf = new Map()
  out.breakAt = new Map()
  out.joinAt = new Map()
  const breakNext = new Set(), joinNext = new Map(), breakOf = new Map(), joined = new Set()
  for (const { next, room, pitch } of out.breaks?.values() ?? []) { if (room === null) breakNext.add(next); else joinNext.set(next, pitch) }
  let region = -1, inRun = false
  for (const r of rects) {
    const k = rectKey(r)
    const j = breakNext.size || joinNext.size ? out.lineInfo.get(k)?.j : undefined
    if (j !== undefined && breakNext.has(j) && !keepSet.has(k) && !breakOf.has(j)) { region++; inRun = false; out.breakAt.set(k, region); breakOf.set(j, region) }
    if (j !== undefined && joinNext.has(j) && !keepSet.has(k) && !joined.has(j)) { out.joinAt.set(k, joinNext.get(j)); joined.add(j) }
    if (keepSet.has(k)) { if (!inRun) region++; inRun = true; out.regionOf.set(k, region) }
    else inRun = false
  }
  out.referenced = new Set()
  for (const r of out.values()) {
    if (r.mode !== 'kept' || !r.gap) continue
    // (and the lines a display's rendering is, a held run's, where they hold none of its characters: tex.mjs)
    const regs = [...r.gap.chars.filter(c => !c.sep && !c.space).map(c => `${c.page}|${c.rect.join()}`), ...(r.gap.held ?? [])].map(k => out.regionOf.get(k)).filter(g => g !== undefined)
    if (regs.length) { r.region = Math.max(...regs); out.referenced.add(r.region) }
  }
  for (const [i, { next, room }] of out.breaks ?? []) {
    const r = out.get(i)
    if (!r) continue
    // (inside a frame: its room, and the line after it, by which its group's pieces are one break, tokensOf2)
    if (room !== null) { if (joined.has(next)) Object.assign(r, { brk: true, room, brkAt: next }); continue }
    const g = breakOf.get(next)
    if (g === undefined) continue
    Object.assign(r, { region: g, brk: true })
    out.referenced.add(g)
  }
  // the original's first character after each displayed formula the drawing breaks at (its region), or before which a
  // display outside the unit's lines stands (`inPlace`: the unit's first): tokensOf2 drops a translation's mark that may
  // not start a line at that segment's head where the original's line there opens with none
  const real = c => !c.sep && !c.space && /\S/.test(c.ch)
  for (const r of out.values()) {
    if (r?.cls !== 'display') continue
    if (r.mode === 'none' && r.inPlace) { r.origAfter = uc.find(real)?.ch ?? null; continue }
    if (r.mode !== 'kept' || r.region === undefined) continue
    let last = -1
    uc.forEach((c, i) => { if (out.regionOf.get(`${c.page}|${c.rect.join()}`) === r.region) last = i })
    const next = uc.slice(last + 1).find(c => real(c) && !keepSet.has(`${c.page}|${c.rect.join()}`))
    r.origAfter = next?.ch ?? null
  }
  // the original's own character a held line shows right after a kept placeholder's ink (1512.03385's footnote 1: a URL's
  // line kept, its full stop with it), `heldAfter`, and how many marks no line may start with it shows there in a row
  // (`heldMarks`, the characters): tokensOf2 drops the translation's marks there that stand for one the line shows, which
  // would show them twice, and no other (a closing corner bracket U+300D after the translation's ideographic full stop is
  // its own; so is a ")" before it where the line shows only a full stop)
  for (const r of out.values()) {
    if (r?.mode !== 'kept' || r.cls === 'display' || r.region === undefined || !r.gap) continue
    const own = new Set(r.gap.chars.filter(real).map(charKey))
    let last = -1
    uc.forEach((c, i) => { if (own.has(charKey(c))) last = i })
    const after = last >= 0 ? uc.slice(last + 1).filter(real) : []
    const inRegion = c => out.regionOf.get(`${c.page}|${c.rect.join()}`) === r.region
    r.heldAfter = after[0] && inRegion(after[0]) ? after[0].ch : null
    let n = 0
    while (n < after.length && inRegion(after[n]) && noStart(after[n].ch)) n++
    r.heldMarks = after.slice(0, n).map(c => c.ch)
  }
  // the translation's own text, letters only: a name it keeps as the page writes it ("Niño", whose ñ the source wrote
  // as a command) is drawn, not shown twice
  const trLetters = norm(unit.pieces.filter(p => p.t === 'text').map(p => p.s).join(' ') + ' ' + [...out.values()].map(r => r?.text ?? '').join(' '))
  out.cat = categoriesOf(out, uc, unit.src, keepSet, drawnTextOf(out, charsByPage), trLetters, out.inkKnown)
  // (and the marks its source writes there itself, which its translation writes: the class's are drawn after them, tokensOf2)
  const ends = sourceEndMarks(unit)
  out.tail = tailOf(out, unit, keepSet, ends)
  out.tailOwn = out.tail ? ends : null
}

/** the most marks a class sets after a unit's text (amsthm's note: ")."; a run-in head's "." or ":"; a style's stop after a
 *  reference) */
const TAIL_MAX = 3
/** a TeX source's tokens, as its end is read back: a command, an escaped character, a ligature of quotes or dashes, a character */
const TEX_TOKEN = /\\[A-Za-z@]+\*?|\\[\s\S]|---|--|''|``|[\s\S]/gu
/** what TeX sets no ink for at a text's end: an end-of-sentence mark, a thin or a word's space, a discretionary, a group's brace */
const NO_INK = new Set(['\\@', '\\,', '\\;', '\\:', '\\!', '\\/', '\\ ', '\\-', '~', '{', '}'])
/** the marks TeX's text fonts set for a ligature of the source's characters, and for a straight double quote (OT1's and T1's
 *  closing one, as a translation writes it) */
const TEX_LIGATURE = Object.freeze({ '---': '\u2014', '--': '\u2013', "''": '\u201d', '``': '\u201c', '`': '\u2018', "'": '\u2019', '"': '\u201d' })
/** the marks a source text ends with, after its last letter, digit or a command that sets a word, as TeX prints them, in order,
 *  and whether that content was reached (`stopped`) */
function textEndMarks(s) {
  const toks = String(s).match(TEX_TOKEN) ?? [], marks = []
  for (let i = toks.length - 1; i >= 0; i--) {
    const t = toks[i]
    if (/^\s$/u.test(t) || NO_INK.has(t)) continue
    const ch = t.length > 1 && t[0] === '\\' ? (/^\\[A-Za-z]/.test(t) ? symbolText(t) : t.slice(1)) : TEX_LIGATURE[t] ?? t
    if (ch == null || /[\p{L}\p{N}]/u.test(ch)) return { marks, stopped: true }
    marks.unshift(...ch)
  }
  return { marks, stopped: false }
}
/**
 * The marks a unit's source writes at its end, after its last letter, digit or placeholder (its source pieces `unit.source`,
 * rows.mjs unitOf's: a style group's braces are no ink, a placeholder that sets none (layer1.mjs phClass `zero`, `space`) is
 * passed over, any other placeholder or a nested unit is content; else its source text), as TeX prints them: an entry's ")"
 * after its year, a sentence's ".", a quotation's "\u201d.". The translation writes these in the target's; whatever the page sets
 * after them on the unit's last line is the class's own (tailOf). Null where a placeholder whose rendering is no letter or
 * digit stands among them (phClass `symbol`, "\\%": never looked for on the page, its ink is among the page's marks there, as
 * many as its source does not tell); and, for a unit read without its source pieces, where its source text ends in anything but a
 * letter or a digit (its placeholders are spaces there: what stands among its end marks is not known)
 */
export function sourceEndMarks(unit) {
  const pieces = unit?.source
  if (!Array.isArray(pieces)) return /[\p{L}\p{N}]\s*$/u.test(unit?.src ?? '') ? [] : null
  const out = []
  for (let k = pieces.length - 1; k >= 0; k--) {
    const p = pieces[k]
    if (p?.t === 'open' || p?.t === 'close') continue
    if (p?.t === 'ph') {
      const cls = phClass(String(p.src ?? ''))
      if (cls === 'zero' || cls === 'space') continue
      if (cls === 'symbol') return null
    }
    if (p?.t !== 'text') break
    const r = textEndMarks(utf8(p.s ?? ''))
    out.unshift(...r.marks)
    if (r.stopped) break
  }
  return out
}
/**
 * The class's own marks after a unit's text, which its source does not write: a theorem's note (amsthm sets
 * "Definition 4.5 (" before the note, its label, and ")." after it, 2610.21084 page 6), a run-in head's full stop, a
 * bibliography style's stop after an entry ("… (2025)."). The characters of its last line after its last content — the last
 * letter or digit its source's words or its label take, or its renderings' last — less the marks its source writes there
 * itself (sourceEndMarks, as many: its translation writes those), each a punctuation mark in a text font, TAIL_MAX at most,
 * all on that line and none kept. Their ink is the unit's text, hidden with it (layout/own.mjs MR 4c, as the maker's line takes
 * them); tokensOf2 draws them after the translation, each in its own style, in place of its own marks of their kinds:
 * [{ ch, st }], or null. A source that ends in ")" kept its style's stop hidden and drawn nowhere while the rule asked for a
 * source ending in a letter or a digit (193 of 196 reference entries that end in their year's bracket, 2026-11-01)
 */
function tailOf(out, unit, keepSet, ownEnds = sourceEndMarks(unit)) {
  const uc = out.uc
  const real = c => !c.sep && !c.space && /\S/.test(c.ch)
  const lineOf = c => `${c.page}|${c.rect.join()}`
  const own = new Set(out.matchedKeys), rendered = new Set()
  for (const r of out.values()) for (const c of r?.gap?.chars ?? []) rendered.add(charKey(c))
  for (const c of out.label?.chars ?? []) own.add(charKey(c))
  let last = -1
  uc.forEach((c, i) => { if (real(c) && (rendered.has(charKey(c)) || (own.has(charKey(c)) && /[\p{L}\p{N}]/u.test(c.ch)))) last = i })
  if (last < 0) return null
  const line = lineOf(uc[last])
  if (ownEnds === null) return null
  const after = uc.slice(last + 1).filter(real), ends = ownEnds.length
  if (after.length <= ends) return null
  const rest = after.slice(ends)
  // (a punctuation mark in a text font, as a class sets its own: a formula's delimiter in a math font is its formula's ink,
  // 1512.03385's Table 1 brackets beside its cells, never the unit's)
  const mark = c => /^\p{P}$/u.test(c.ch) && !c.nu && c.st?.fam !== 'math'
  // (the source's own end marks may be a symbol, "90\u00b0": the class's alone are held to be marks)
  if (rest.length > TAIL_MAX || keepSet.has(line) || after.some(c => lineOf(c) !== line) || rest.some(c => !mark(c) || out.cat.get(charKey(c)) !== 'acc')) return null
  return rest.map(c => ({ ch: c.ch, st: c.st ?? null }))
}

/** the lines a located displayed formula holds a third of the characters of, or more */
export function displayTouched(res, uc) {
  const all = new Map()
  const key = c => `${c.page}|${c.rect.join()}`
  for (const c of uc) if (!c.sep && !c.space && /\S/.test(c.ch)) all.set(key(c), (all.get(key(c)) ?? 0) + 1)
  const out = new Set()
  for (const r of res.values()) {
    if (r?.cls !== 'display' || !r.gap) continue
    const mine = new Map()
    for (const c of r.gap.chars) if (!c.sep && !c.space && /\S/.test(c.ch)) mine.set(key(c), (mine.get(key(c)) ?? 0) + 1)
    for (const [k, n] of mine) if (n >= (all.get(k) ?? 0) / 3) out.add(k)
  }
  // with the line's other rectangles (a formula's line comes in pieces: "RMSE(t) = …" and "RMSE_i(t) (6)")
  const box = k => { const [pg, r] = k.split('|'); const [, y0, , y1] = r.split(',').map(Number); return { pg, y0, y1 } }
  const held = [...out].map(box)
  for (const k of all.keys()) {
    if (out.has(k)) continue
    const b = box(k)
    if (held.some(h => h.pg === b.pg && Math.min(h.y1, b.y1) - Math.max(h.y0, b.y0) > 0.5 * Math.min(h.y1 - h.y0, b.y1 - b.y0))) out.add(k)
  }
  return out
}

const normU = s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
/** what the unit's placeholders draw, as one string of letters and digits a placeholder apart: their text, a crop's
 *  page characters */
function drawnTextOf(res, charsByPage) {
  const parts = []
  for (const r of res.values()) {
    if (!r) continue
    if (r.mode === 'crop') {
      // (each of its parts' page characters, a formula TeX broke over lines: cropPartsOf)
      for (const q of cropPartsOf(r)) {
        const [x0, y0, x1, y1] = q.crop
        parts.push(normU((charsByPage[q.page - 1] ?? []).filter(c => (c.x0 + c.x1) / 2 >= x0 && (c.x0 + c.x1) / 2 <= x1 && c.yb >= y0 && c.yb <= y1).sort((a, b) => a.x0 - b.x0).map(c => c.ch).join('')))
      }
      parts.push(normU(r.text))
    } else if (r.text) parts.push(normU(r.text))
  }
  return `|${parts.join('|')}|`
}

/**
 * A crop's baseline without a source that knows its ink (step 3): the baseline its glyphs of its line's text size stand
 * on, the line's own (its rendering's line: the unit's line that holds most of its characters, `lineInfo`); where it has
 * none (a fraction, a formula all scripts), that line's baseline where it was measured from its characters (exact) and
 * stands within 0.6 em; else its largest glyphs' (`main`). By its characters' median size, a crop most of whose glyphs
 * were a script ("i^{th}": 'i' and two of the script) was set on the script's baseline, 3.96 pt low, and a fraction on
 * its radical's origin (1706.03762's "1/√dk", 1.2 pt low).
 */
export function cropBaselineOf(real, lineInfo, main) {
  const big = Math.max(...real.map(c => c.size))
  const n = new Map()
  for (const c of real) { const k = `${c.page}|${c.rect?.join()}`; n.set(k, (n.get(k) ?? 0) + 1) }
  const info = lineInfo && real.length ? lineInfo.get([...n].sort((a, b) => b[1] - a[1])[0][0]) : null
  const atText = real.filter(c => c.size >= 0.85 * (info?.size || big))
  if (atText.length) return median(atText.map(c => c.yb))
  const own = median(main.map(c => c.yb))
  return info?.exact && Math.abs(info.baseline - own) <= 0.6 * big ? info.baseline : own
}

/** a script's characters: under this share of the rendering's largest size (the layout maker's SCRIPT_SIZE) */
const SCRIPT_SHARE = 0.85
/** a character over its rendering's main baseline by this share of the largest size or more: raised (TeX raises a
 *  superscript 0.29 em at the least, sup3; the text layer gives one line's items one baseline) */
const OFF_BASELINE = 0.1
/**
 * Whether a rendering's own characters hold one raised off the baseline of its main glyphs (those within SCRIPT_SHARE of
 * its largest size): a superscript ("AIDE" and its "2" 4.3 pt up, 2609.26457's \aidesq{}, AIDE^2), a raised letter
 * (\LaTeX's A). Set on the baseline as page text, a raised script reads as another token, "AIDE 2" (a version) for AIDE
 * squared. A lowered one reads as the same words ("AIDE human" for 2609.26457's AIDE_human, "BERT BASE" for 1810.04805's
 * BERT_BASE) and stays page text, which breaks across lines where a crop cannot. Read from the page's characters, which
 * a layout file's segment holds as its own ink (renderingOf) and v0's alignment as its gap's, never from the macro's name.
 */
export function scriptedOf(chars) {
  const ink = chars.filter(c => !c.sep && !c.space && /\S/.test(c.ch))
  if (ink.length < 2) return false
  const big = Math.max(...ink.map(c => c.size))
  const y = median(ink.filter(c => c.size >= SCRIPT_SHARE * big).map(c => c.ybEff ?? c.yb))
  return ink.some(c => (c.ybEff ?? c.yb) - y >= OFF_BASELINE * big)
}

/** a placeholder drawn from its rendering on the page: as the page's text (a citation, a reference, a macro, a formula
 *  over lines) or as a crop of the page (a formula, and a text macro that sets a raised script: scriptedOf, whose page
 *  text on one baseline read "AIDE 2" for AIDE^2); `lineInfo`, the unit's lines' (Prepared's) */
function drawnAs(p, g, cls, sup, lineInfo = null) {
  const real = g.chars.filter(c => !c.sep && !c.space)
  const lines = new Set(real.map(c => c.rect.join()))
  const lineSize = median(real.map(c => c.size))
  const tally = new Map()
  for (const c of real) if (c.st && /\S/.test(c.ch)) { const f = fontOfStyle(c.st); tally.set(f, (tally.get(f) ?? 0) + 1) }
  const gst = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0]
  // one visual line (its baselines within 0.75 em: a fraction's numerator another rectangle holds is on it) is cropped;
  // a rendering broken over lines is drawn as the page's text
  const big = Math.max(...real.map(c => c.size))
  const mainY = median(real.filter(c => c.size >= 0.85 * big).map(c => c.ybEff ?? c.yb))
  const oneLine = real.every(c => Math.abs((c.ybEff ?? c.yb) - mainY) < 0.75 * big)
  // (a rendering whose source knows where its ink is, a layout file's segments, g.box: its lines are its segments)
  const box = g.box
  const broken = box ? box.lines > 1 : lines.size > 1 && !oneLine
  const textMacro = p.cls === 'macro' || p.cls === 'umacro'
  const scripted = textMacro && !broken && oneLine && scriptedOf(real)
  // a formula broken over lines whose segments the rendering knows (a layout file's, g.box's) is its crops, one a line, never
  // its page text, which sets every glyph on one baseline (E3b: 2610.10069's sigma^{-1}(s_t) drawn "sigma -1 (s t)"); its own
  // brackets left out where the translation sets its own (unbracketed: the first part cut after its opening one, the last
  // before its closing one)
  if (broken && box?.segs && formulaOf(p)) {
    const parts = cropPartsOfSegments(box.segs)
    if (parts) return { ...cropFields(g.unbracketed && g.of ? unbracketedParts(parts, g.of) : parts), text: texToText2(p.src) || '' }
  }
  if (cls !== 'other' || broken || (textMacro && !scripted)) return { mode: 'orig-text', text: g.text, sup: sup || (cls === 'num' && real.length && real.every(c => c.size < lineSize * 0.85)), st: gst }
  // (a text macro's crop reads as its page text where its source has none: copied and found as the page shows it)
  const text = texToText2(p.src) || (scripted ? g.text : '')
  // (with a box, a layout file's segment: the piece's own ink, on the baseline of the line TeX set it on)
  if (box?.top !== undefined) return { mode: 'crop', page: real[0].page, ...cropOfBox(box), text }
  const main = real.filter(c => c.size >= lineSize * 0.85)
  const baseline = cropBaselineOf(real, lineInfo, main.length ? main : real)
  // (a hanging glyph, a radical, from an em below its baseline to just above it: by its baseline, its box reached into
  // the line above, "√dk" taking "nd v." from "…dimension d_v.")
  const y0 = Math.min(...real.map(c => (c.ybEff !== undefined ? c.yb - c.size : c.yb - c.size * 0.26))), y1 = Math.max(...real.map(c => (c.ybEff !== undefined ? c.yb + c.size * 0.15 : c.yb + c.size * 0.8)))
  const x0 = Math.min(...real.map(c => c.x0)), x1 = Math.max(...real.map(c => c.x1))
  return { mode: 'crop', page: real[0].page, crop: [x0 - 0.4, y0, x1 + 0.4, y1], baseline, text }
}

/**
 * A crop from a layout file's segment (`box`: x0, x1, top, bottom, baseline, its piece's own glyphs' and rules' ink by
 * the content stream, layout/stream.mjs): the box itself, its antialiased edge a fraction of a point around, set by the
 * baseline of the line TeX set the piece on, so that a raised or lowered formula keeps its offset, a radical its bar
 * above it and a fraction its denominator below. Its glyphs' own origins say neither: the text layer gives a radical's
 * at its bar (1706.03762's √d_k at 400.59 over its line's 392.85, so its crop hung under its line) and a big operator's
 * above its glyph; and an estimate from them cut the segment's own ink (2307.16209's subscript 2 on page 40). Returns
 * { crop, baseline }
 */
export function cropOfBox(box) {
  return { crop: [box.x0 - 0.4, box.bottom - 0.3, box.x1 + 0.4, box.top + 0.3], baseline: box.baseline }
}

/**
 * A placeholder's ink as crops, one a line of TeX's (E3b, 2026-10-19): its row's segments (stride 6: page, x0, baseline,
 * x1, top, bottom) of one line on one page, transitively: two that meet across on its baseline, or that stand stacked in
 * it, one over the other by more than half the smaller one's height (a \\qed box's top rule given the line above, a formula's
 * tall operator or a cases' rows). Two lines' segments are two crops however their scripts reach into each other (2610.20484
 * page 5: a subscript 0.2 into the next line's arrow made one crop two lines tall). Each group's union is cut as a layout
 * file's segment is (cropOfBox), on the baseline of the segment inside it nearest its middle (a tall formula's own line), in
 * TeX's order (each group's first segment's): [{ page, crop, baseline, seg }], seg the union as a segment (its `lines` 1).
 * Null where it has none
 */
/** two segments' baselines this near (PDF units) are one line's */
const LINE_OF = 0.5
/** whether two segments are of one line: on one page, meeting across, on one baseline or stacked (cropPartsOfSegments) */
const oneLine = (a, b) => {
  if (a.page !== b.page) return false
  const over = Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom)
  return over > 0 && (Math.abs(a.base - b.base) <= LINE_OF || over > 0.5 * Math.min(a.top - a.bottom, b.top - b.bottom))
}
export function cropPartsOfSegments(segs) {
  const S = []
  for (let s = 0; s + 5 < (segs?.length ?? 0); s += 6) S.push({ page: segs[s], x0: segs[s + 1], base: segs[s + 2], x1: segs[s + 3], top: segs[s + 4], bottom: segs[s + 5] })
  if (!S.length) return null
  const left = new Set(S), out = []
  for (const s0 of S) {
    if (!left.has(s0)) continue
    left.delete(s0)
    const box = { x0: s0.x0, x1: s0.x1, top: s0.top, bottom: s0.bottom }, inside = [s0]
    for (let grew = true; grew;) {
      grew = false
      for (const s of left) if (inside.some(g => oneLine(g, s))) {
        left.delete(s)
        inside.push(s)
        Object.assign(box, { x0: Math.min(box.x0, s.x0), x1: Math.max(box.x1, s.x1), top: Math.max(box.top, s.top), bottom: Math.min(box.bottom, s.bottom) })
        grew = true
      }
    }
    const mid = (box.top + box.bottom) / 2
    const on = inside.filter(s => s.base >= box.bottom - 0.05 && s.base <= box.top + 0.05)
    const baseline = (on.length ? on : inside).reduce((a, s) => (Math.abs(s.base - mid) < Math.abs(a.base - mid) ? s : a)).base
    const seg = { ...box, baseline, lines: 1 }
    out.push({ page: s0.page, ...cropOfBox(seg), seg })
  }
  return out
}
/** a formula's parts (cropPartsOfSegments') without its own brackets (`of`: its rendering with them, unbracketed's): the
 *  first part cut after its opening bracket, the last before its closing one, where each stands in it */
function unbracketedParts(parts, of) {
  const real = (of.chars ?? []).filter(c => !c.sep && !c.space && /\S/.test(c.ch))
  const open = real[0], close = real.at(-1)
  const cut = (q, x0, x1) => (x1 > x0 ? { ...q, ...cropOfBox({ ...q.seg, x0, x1 }), seg: { ...q.seg, x0, x1 } } : q)
  const inside = (q, c) => c && c.page === q.page && c.x0 >= q.seg.x0 - 0.5 && c.x1 <= q.seg.x1 + 0.5 && c.yb >= q.seg.bottom - 1 && c.yb <= q.seg.top + 1
  const out = parts.slice()
  if (inside(out[0], open)) out[0] = cut(out[0], Math.max(out[0].seg.x0, open.x1), out[0].seg.x1)
  const n = out.length - 1
  if (inside(out[n], close)) out[n] = cut(out[n], out[n].seg.x0, Math.min(out[n].seg.x1, close.x0))
  return out
}
/** a crop resolution's own fields from its parts (cropPartsOfSegments'): the first one's page, rectangle and baseline, and
 *  the parts themselves where there are more than one (`parts`: a formula TeX broke over lines) */
export const cropFields = parts => ({ mode: 'crop', page: parts[0].page, crop: parts[0].crop, baseline: parts[0].baseline, ...(parts.length > 1 ? { parts } : {}) })
/**
 * A crop resolution as its readers take it, one a part (E3b): itself where it has no parts; else each part as a crop of its
 * own, its placeholder's (`k`, `src`, `cls`) with that part's page, rectangle and baseline, its segment its `gap.box` (the
 * extent a line reads: cropExtent), its index `part`, and the formula's copy text on the first alone. The tokens (one a
 * part: tokensOf2), the drawer's audit, the checker, the word table, the links and the removal read crops so
 */
export function cropPartsOf(r) {
  if (!r.parts) return [r]
  return r.parts.map((q, i) => ({ ...r, page: q.page, crop: q.crop, baseline: q.baseline, text: i ? '' : r.text, gap: { ...r.gap, box: q.seg }, part: i, parts: undefined }))
}
/** whether a placeholder (its resolution's or its piece's `cls` and `src`) is a formula: v0's 'other' (math, or a command
 *  whose rendering holds a letter or a digit; a symbol phClassProven reads so) that is no text piece
 *  (rules/text-piece.mjs: a code or URL mark, a plain-text source). It is drawn only as crops of its ink, never as its page
 *  text (E3b): a citation, a reference, a text macro and a text piece may be */
export const formulaOf = p => p.cls === 'other' && !textPieceOf(p.src)

const YEAR = /\b(?:19|20)\d\d[a-z]?\b/
/** whether growCrop grows a crop, and so reads its page's ink: a crop with a box, not one cut from a layout file's segment
 *  (nor so a formula's parts, cropPartsOf: each its segments', its resolution's box its first's) */
export const cropGrows = r => !!r?.crop && !r.gap?.box
/**
 * A crop's box grown over the ink it touches on the original page: a radical's tail, a fraction's bar, a big operator's
 * limits reach past its glyphs' boxes (0.26 em below their baseline to 0.8 above), and a radical often has no character
 * in the text layer at all (1706.03762's "√dk": nothing between "by" and "d"), so the crop began at "d" and the radical
 * was erased. Cell by cell of the page's ink map: two cells (3 pt) up, two down or an em down for a radical or a big
 * operator, and to either side over ink no character outside the rendering stands on (a bracket, the next word stop
 * it), six cells at most. `pageChars`: the crop's page's characters. Mutates it. A crop cut from a layout file's
 * segment (its rendering's `box`, cropOfBox) is never grown: the segment holds every glyph and rule TeX set for the
 * piece, and the map's ink beyond it is another's (a neighbour's glyph or rule, which a crop grown there carried)
 */
export function growCrop(r, ink, toDev, k, pageChars = []) {
  if (!ink || !cropGrows(r)) return
  const f = ink.factor
  const cellPt = f / k
  const own = new Set((r.gap?.chars ?? []).map(c => `${c.item}|${c.k}`))
  // (Computer Modern's extension font's glyphs all hang so: big brackets, radicals, operators)
  const deep = (r.gap?.chars ?? []).filter(c => !c.sep && !c.space && c.st?.fam === 'math' && (/[√∑∏∫∮⋃⋂⨁⨂]/.test(c.ch) || /cmex|lmmath|stixsize|txex|pxex/i.test(c.st?.name ?? '')))
  const maxDown = deep.length ? Math.ceil((1.1 * Math.max(...deep.map(c => c.size))) / cellPt) : 2
  const [ax, ay] = toDev(r.crop[0], r.crop[3]), [bx, by] = toDev(r.crop[2], r.crop[1])
  let c0 = Math.floor(Math.min(ax, bx) / f), c1 = Math.floor(Math.max(ax, bx) / f), r0 = Math.floor(Math.min(ay, by) / f), r1 = Math.floor(Math.max(ay, by) / f)
  const at = (row, c) => row >= 0 && c >= 0 && row < ink.h && c < ink.w && ink.ink[row * ink.w + c]
  const rowInk = (row, a, b) => { for (let c = a; c <= b; c++) if (at(row, c)) return true; return false }
  const colInk = (c, a, b) => { for (let row = a; row <= b; row++) if (at(row, c)) return true; return false }
  // the characters beside it on its line that are not its own: a column on one of them is theirs
  const y0 = r.crop[1], y1 = r.crop[3]
  // (a math glyph touching it is the formula's own: a fraction's subscript the text layer put outside its gap)
  const beside = pageChars.filter(c => /\S/.test(c.ch) && !own.has(`${c.item}|${c.k}`) && c.st?.fam !== 'math' && c.yb + 0.7 * c.size > y0 && c.yb - 0.2 * c.size < y1)
  const x0 = r.crop[0], x1 = r.crop[2]
  const blocked = (from, to) => beside.some(c => c.x1 > from + 0.2 && c.x0 < to - 0.2)
  // and up or down never into another line's text (a tight footnote's line above: its glyphs touch)
  const above = pageChars.filter(c => /\S/.test(c.ch) && !own.has(`${c.item}|${c.k}`) && c.st?.fam !== 'math' && c.x1 > x0 && c.x0 < x1 && Math.abs(c.yb - (y0 + y1) / 2) < 2.5 * c.size)
  const blockedRow = (from, to) => above.some(c => c.yb - 0.22 * c.size < to && c.yb + 0.72 * c.size > from)
  const grown = { top: 0, bottom: 0, left: 0, right: 0 }
  for (let n = 0; n < Math.max(6, maxDown); n++) {
    if (n < 2 && rowInk(r0 - 1, c0, c1) && rowInk(r0, c0, c1) && !blockedRow(y1 + grown.top * cellPt, y1 + (grown.top + 1) * cellPt)) { r0--; grown.top++ }
    if (n < maxDown && rowInk(r1 + 1, c0, c1) && rowInk(r1, c0, c1) && !blockedRow(y0 - (grown.bottom + 1) * cellPt, y0 - grown.bottom * cellPt)) { r1++; grown.bottom++ }
    if (n < 6 && colInk(c0 - 1, r0, r1) && !blocked(x0 - (grown.left + 1) * cellPt, x0 - grown.left * cellPt)) { c0--; grown.left++ }
    if (n < 6 && colInk(c1 + 1, r0, r1) && !blocked(x1 + grown.right * cellPt, x1 + (grown.right + 1) * cellPt)) { c1++; grown.right++ }
  }
  r.crop = [r.crop[0] - grown.left * cellPt, r.crop[1] - grown.bottom * cellPt, r.crop[2] + grown.right * cellPt, r.crop[3] + grown.top * cellPt]
}

/** the lines a displayed formula's rendering stands on, kept: those it holds most of (three fifths of their characters
 *  or more), not a text line it shares a word with */
function displayLines(g, uc) {
  const mine = new Map(), all = new Map()
  const key = c => `${c.page}|${c.rect.join()}`
  for (const c of g.chars) if (!c.sep && !c.space && /\S/.test(c.ch)) mine.set(key(c), (mine.get(key(c)) ?? 0) + 1)
  for (const c of uc) if (!c.sep && !c.space && /\S/.test(c.ch)) all.set(key(c), (all.get(key(c)) ?? 0) + 1)
  return [...mine].filter(([k, n]) => !all.get(k) || n >= 0.6 * all.get(k)).map(([k]) => k)
}

/** whether the translation sets brackets round piece k itself: the text before it ends with an opening one and the text
 *  after starts with a closing one (spaces and zero-width placeholders between) */
function bracketed(pieces, k) {
  const textAt = (from, step) => {
    for (let q = from; q >= 0 && q < pieces.length; q += step) {
      const p = pieces[q]
      if (p.t === 'text') { if (/\S/.test(p.s)) return p.s; continue }
      // a group's own braces and what renders as nothing ("\uFF08{\small \url{…}}\uFF09") stand between nothing
      if (p.t === 'open' || p.t === 'close') continue
      if (p.t === 'ph' && ['zero', 'space'].includes(phClass2(p.src).cls)) continue
      return null
    }
    return null
  }
  return /[\uFF08(\uFF3B[]\s*$/.test(textAt(k - 1, -1) ?? '') && /^\s*[\uFF09)\uFF3D\]]/.test(textAt(k + 1, 1) ?? '')
}

/**
 * What became of each of the unit's characters on the page (by charKey): 'acc' (its text, translated; or a placeholder's
 * rendering drawn elsewhere, as a crop or as text: erased), 'keep' (a kept line, a label, a kept placeholder's rendering:
 * shown where it is, never erased), 'orphan' (a rendering no placeholder took: shown where it is). A gap's piece that is
 * the source's own text (four letters or more of it, the alignment having missed it: small capitals measured in two
 * sizes) and a gap's punctuation alone are the unit's text.
 */
/** whether `letters` is in `hay` but for up to two letters dropped from it (an accent the source wrote as a placeholder
 *  inside its word: "Z rich" for "Zürich", "Lu i " for "Lučić") */
export function nearIn(letters, hay, src = '') {
  if (hay.includes(letters)) return true
  if (letters.length < 4) return false
  if (letters.length < 5) {
    // a short word only as the source's words either side of the placeholder, joined ("Ni o" for "Niño")
    const words = src.split(/\s+/).map(w => norm(w)).filter(Boolean)
    const joined = new Set()
    for (let i = 0; i + 1 < words.length; i++) { joined.add(words[i] + words[i + 1]); if (words[i + 2]) joined.add(words[i] + words[i + 1] + words[i + 2]) }
    for (let i = 0; i < letters.length; i++) if (joined.has(letters.slice(0, i) + letters.slice(i + 1))) return true
    return false
  }
  for (let i = 0; i < letters.length; i++) {
    const one = letters.slice(0, i) + letters.slice(i + 1)
    if (hay.includes(one)) return true
    if (letters.length >= 6) for (let j = i; j < one.length; j++) if (hay.includes(one.slice(0, j) + one.slice(j + 1))) return true
  }
  return false
}

function categoriesOf(res, uc, src, keepSet, drawn = '', trLetters = '', inkKnown = false) {
  const cat = new Map()
  const srcLetters = norm(src)
  const used = new Map()
  for (const r of res.values()) if (r?.gap) for (const c of r.gap.chars) if (!c.sep && !c.space) used.set(charKey(c), r)
  const label = new Set((res.label?.chars ?? []).map(charKey))
  const inGap = new Set()
  for (const g of res.gaps ?? []) for (const c of g.chars) if (!c.sep && !c.space) inGap.add(charKey(c))
  // the pieces of gaps no placeholder took, run by run
  const left = []
  let run = null
  for (const c of uc) {
    const k = c.sep || c.space ? null : charKey(c)
    if (k && inGap.has(k) && !used.has(k) && /\S/.test(c.ch)) { if (!run) { run = []; left.push(run) } run.push(c) }
    else if (k || c.sep) run = null
  }
  const missed = new Set()
  for (const piece of left) {
    const letters = norm(piece.map(c => c.ch).join(''))
    // what a placeholder of the unit draws already (from its source, as a citation's map gives it, or another's crop):
    // erased, not shown twice
    const shown = normU(piece.map(c => c.ch).join(''))
    const long = letters.replace(/\d/g, '').length >= 4
    // (where the renderings' source knows each placeholder's ink, a layout file's segments, a piece none took is no
    // rendering: the unit's own text, which TeX set on its lines, whatever its length; 1810.04805 p7's "old" of
    // "thresh-old", three letters the alignment missed after the hyphen, was left standing under the translation)
    if (inkKnown || !/[\p{L}\p{N}]/u.test(piece.map(c => c.ch).join('')) || (long && (nearIn(letters, srcLetters, src) || trLetters.includes(letters))) || (shown && drawn.includes(shown))) for (const c of piece) missed.add(charKey(c))
  }
  for (const c of uc) {
    if (c.sep || c.space || !/\S/.test(c.ch)) continue
    const k = charKey(c)
    if (keepSet.has(`${c.page}|${c.rect.join()}`) || label.has(k)) cat.set(k, 'keep')
    else if (used.has(k)) cat.set(k, used.get(k).mode === 'kept' ? 'keep' : used.get(k).mode === 'crop' || used.get(k).mode === 'orig-text' ? 'acc' : 'orphan')
    else if (inGap.has(k)) cat.set(k, missed.has(k) ? 'acc' : 'orphan')
    else cat.set(k, 'acc')
  }
  return cat
}

/** a page character's identity across the copies the unit's lines make of it */
export const charKey = c => `${c.page}|${c.item}|${c.k}`

/** whether the page shows `text` just before a unit's first line, on its baseline (a mark set outside the unit) */
function leadMark(rects, charsByPage, text) {
  const r = rects[0]
  if (!r || !text) return false
  const h = r[4] - r[2]
  const before = (charsByPage[r[0] - 1] ?? []).filter(c => c.x1 <= r[1] + 0.5 && c.x0 >= r[1] - 1.5 * h && c.yb >= r[2] - 0.2 * h && c.yb <= r[4]).sort((a, b) => a.x0 - b.x0)
  const mk = t => t.normalize('NFKC').replace(/[∗⋆✱]/g, '*').replace(/\s/g, '')
  return mk(before.map(c => c.ch).join('')).endsWith(mk(text))
}

/**
 * A unit's line rectangles grown along their baselines over the characters next to them that are no other unit's
 * (`others`: the page's other units' rectangles) where those hold the unit's own source words: the anchors may leave a
 * line's words out (1706.03762's "‡Work performed while at Google Research." anchored as "Research."), and what they
 * leave out is neither erased nor laid over. `first`: the unit's first line, as extendRects2's. Mutates the rectangles;
 * returns how many grew.
 */
export function extendRects(rects, charsByPage, others, src, wordsOfFn, normFn, wordChars = charsByPage, first = rects[0]) {
  const srcWords = wordsOfFn([...src].map(ch => ({ ch }))).map(w => w.w)
  const want = new Set(srcWords)
  const srcStart = ` ${srcWords.join(' ')} `
  let grown = 0
  for (const r of rects) {
    const page = charsByPage[r[0] - 1] ?? []
    const inside = page.filter(c => c.x0 >= r[1] - 0.5 && c.x1 <= r[3] + 0.5 && c.yb >= r[2] - 0.2 && c.yb <= r[4] && /\S/.test(c.ch))
    if (!inside.length) continue
    const yb = median(inside.map(c => c.yb)), size = median(inside.map(c => c.size))
    const lineIn = chars => chars.filter(c => Math.abs(c.yb - yb) < 0.3 * size && /\S/.test(c.ch)).sort((a, b) => a.x0 - b.x0)
    const line = lineIn(page)
    const foreign = c => (others[r[0]] ?? []).some(o => c.x0 >= o[1] - 0.5 && c.x1 <= o[3] + 0.5 && c.yb >= o[2] - 0.2 && c.yb <= o[4])
    const grow = (dir, chars = line) => {
      const got = []
      let edge = dir < 0 ? Math.min(...inside.map(c => c.x0)) : Math.max(...inside.map(c => c.x1))
      const cands = dir < 0 ? chars.filter(c => c.x1 <= edge + 0.1).reverse() : chars.filter(c => c.x0 >= edge - 0.1)
      for (const c of cands) {
        if (dir < 0 ? edge - c.x1 > 1.2 * size : c.x0 - edge > 1.2 * size) break
        if (foreign(c) || inside.some(d => d.item === c.item && d.k === c.k)) break
        got.push(c)
        edge = dir < 0 ? c.x0 : c.x1
      }
      return got
    }
    for (const dir of [-1, 1]) {
      let got = grow(dir)
      const words = got.length ? (dir < 0 ? [...got].reverse() : got).map(c => c.ch).join('').split(/[^\p{L}\p{N}]+/u).map(w => normFn(w)).filter(w => w.length > 1) : []
      if (!words.some(w => want.has(w))) {
        // (step 3: before the unit's first line, the words its source begins with, over the page's whole width on the
        // line, each word apart: the line's characters are its non-space ones, and joined they read one word that is
        // none of the source's ("whileatGoogle"), so that 1706.03762's "‡Work performed while at Google Research.",
        // anchored and located as "Research.", kept its English head unerased, and the translation, "Google Research…",
        // was laid after it: "Google Google Research")
        if (dir > 0 || r !== first) continue
        got = grow(dir, lineIn(wordChars[r[0] - 1] ?? []))
        const run = [...got].reverse()
        const text = run.map((c, n) => (n && (c.x0 - run[n - 1].x1 > 0.12 * c.size || (c.item !== run[n - 1].item && c.x0 - run[n - 1].x1 > 0.05 * c.size)) ? ` ${c.ch}` : c.ch)).join('')
        const apart = text.split(/[^\p{L}\p{N}]+/u).map(w => normFn(w)).filter(w => w.length > 1)
        if (apart.length < 2 || !srcStart.startsWith(` ${apart.join(' ')} `)) continue
      }
      if (dir < 0) r[1] = Math.round(Math.min(...got.map(c => c.x0)) * 100) / 100
      else r[3] = Math.round(Math.max(...got.map(c => c.x1)) * 100) / 100
      grown++
    }
  }
  return grown
}

// ---- tokens

const PUNCT_CLOSE = /^[\u3001\u3002\uFF0C\uFF0E\uFF1A\uFF1B\uFF01\uFF1F\uFF09\u300D\u300F\u3011\u3015\u3009\u300B\u3019\u3017”’]$/
const PUNCT_OPEN = /^[\uFF08\u300C\u300E\u3010\u3014\u3008\u300A\u3018\u3016“‘]$/
/** the characters a CJK run takes: CJK, full-width forms, Hangul, and where the rules say so (Chinese and Japanese) the curly
 *  quotes and dashes, which xeCJK sets full width there (Korean sets them as its Western punctuation). As code points, tested
 *  a code point at a time (`u`): the compatibility ideographs' first, U+F900, typed as itself was normalized into the unified
 *  ideograph U+8C48 it stands for, and its range ran on over U+A000 to U+F8FF (Yi, Lisu, Vai, Cyrillic Extended-B, Latin
 *  Extended-D, the surrogates and the private-use area, a font's icons: laid in the CJK face), as in pipeline/anchors.mjs.
 *  A character outside the BMP is CJK only in the two ideographic planes, U+20000 to U+3FFFF (the CJK extensions B to J
 *  and the compatibility supplement), where a non-`u` class took every astral character for CJK through its surrogates and
 *  sent Mathematical Alphanumeric Symbols, which the body face lacks, to it. Hangul is its syllables and every block of its
 *  jamo (the compatibility jamo and the two extended blocks among them) */
const CJK_SPANS = [[0x1100, 0x11ff], [0x2e80, 0x9fff], [0xa960, 0xa97f], [0xac00, 0xd7ff], [0xf900, 0xfaff], [0xff00, 0xffef], [0x20000, 0x3ffff]]
/** the curly quotes, the em dash, the ellipsis and the middle dot: CJK's where the rules' cjkQuotes say so */
const CJK_QUOTES = [0x201c, 0x201d, 0x2018, 0x2019, 0x2014, 0x2026, 0xb7].map(c => [c, c])
const spansClass = spans => new RegExp(`[${spans.map(([a, b]) => (a === b ? `\\u{${a.toString(16)}}` : `\\u{${a.toString(16)}}-\\u{${b.toString(16)}}`)).join('')}]`, 'u')
const CJK_CLASS = [spansClass(CJK_SPANS), spansClass([...CJK_SPANS, ...CJK_QUOTES])]
/** `quotes` (the rules' cjkQuotes): whether the curly quotes, dashes, ellipsis and middle dot are CJK's too */
export const cjkClassRe = quotes => CJK_CLASS[quotes ? 1 : 0]
/** the attributes a piece may set over what it holds, a bit each: weight, slant, small capitals, family, colour */
const WEIGHT = 1, SLANT = 2, CAPS = 4, FAMILY = 8, COLOUR = 16, EVERY = 31
const STYLE_CMDS = [
  [/^\\(?:textbf|bf|bfseries|mathbf|boldsymbol)\b/, (s) => ({ ...s, bold: true }), WEIGHT],
  [/^\\(?:textmd|mdseries)\b/, s => ({ ...s, bold: false }), WEIGHT],
  [/^\\(?:emph|em)\b/, s => ({ ...s, italic: !s.italic }), SLANT],
  [/^\\(?:textit|it|itshape|textsl|sl|slshape|mathit)\b/, s => ({ ...s, italic: true }), SLANT],
  [/^\\(?:textup|upshape)\b/, s => ({ ...s, italic: false }), SLANT],
  [/^\\(?:textsc|sc|scshape)\b/, s => ({ ...s, caps: true }), CAPS],
  [/^\\(?:texttt|tt|ttfamily|url|path|code|lstinline)\b/, (s, d) => ({ ...s, fam: 'mono', design: d.mono }), FAMILY],
  [/^\\(?:textsf|sf|sffamily)\b/, (s, d) => ({ ...s, fam: 'sans', design: d.sans }), FAMILY],
  [/^\\(?:textrm|rm|rmfamily)\b/, (s, d) => ({ ...s, fam: 'serif', design: d.serif }), FAMILY],
  [/^\\(?:textnormal|normalfont)\b/, (s, d) => ({ ...s, fam: 'serif', bold: false, italic: false, caps: false, design: d.serif }), WEIGHT | SLANT | CAPS | FAMILY],
]
const applyCmd = (src, s, d) => {
  for (const [re, f] of STYLE_CMDS) if (re.test(src)) return f(s, d)
  return null
}
/** what an open piece sets over what it holds: a style command's attributes, a colour's or a link's colour (hyperref colours
 *  its links), nothing for a bare group, and anything for any other (a paper's own macro may set any of them) */
const openSets = src => {
  if (src === '{') return 0
  for (const [re, , bits] of STYLE_CMDS) if (re.test(src)) return bits
  return /^\\(?:textcolor|color)(?![A-Za-z])/.test(src) || LINK_OPEN.test(src) ? COLOUR : EVERY
}
/** whether a piece toggles the slant (\emph, \em): what it holds is drawn the other way of what holds it */
const togglesSlant = src => /^\\(?:emph|em)\b/.test(src)
/** what a placeholder sets over the rest of its group: a style switch's attributes, a colour switch's colour; nothing else */
const switchSets = src => {
  if (/^\\color(?![A-Za-z])/.test(src)) return COLOUR
  if (!/^\\[A-Za-z]+$/.test(src)) return 0
  for (const [re, , bits] of STYLE_CMDS) if (re.test(src)) return bits
  return 0
}
/**
 * The source's text by what sets its style (E1 of the residuals' batch R2): the unit's plain source text (mt.mjs plainSource, which
 * the alignment reads as `unit.src`) with, for each of its code points, the attributes the pieces around it set (`sets`, the bits
 * of openSets and switchSets, a switch over the rest of its group), the pieces that set its colour, outermost first (`chain`), and
 * the parity of the slant toggles around it (`flip`: 1 inside an odd number of \emph and \em, pairs or switches). Null where the
 * unit carries no source pieces (`unit.source`: rows.mjs unitOf's) or their text is not `unit.src`
 */
export function sourceScopes(unit) {
  const pieces = unit?.source
  if (!Array.isArray(pieces) || typeof unit.src !== 'string') return null
  const stack = [{ sets: 0, chain: [], flip: 0 }], scopes = []
  pieces.forEach((p, k) => {
    const top = stack.at(-1)
    if (p.t === 'open') { const b = openSets(p.src ?? ''); stack.push({ sets: top.sets | b, chain: b & COLOUR ? [...top.chain, k] : top.chain, flip: top.flip ^ (togglesSlant(p.src ?? '') ? 1 : 0) }); return }
    if (p.t === 'close') { if (stack.length > 1) stack.pop(); return }
    if (p.t === 'ph') { const b = switchSets(p.src ?? ''); if (b) { top.sets |= b; if (b & COLOUR) top.chain = [...top.chain, k]; if (togglesSlant(p.src ?? '')) top.flip ^= 1 } return }
    if (p.t === 'text') scopes[k] = { sets: top.sets, chain: top.chain, flip: top.flip }
  })
  // (the plain text as plainSource makes it: a text piece's characters, a space for any other piece, white space runs one, trimmed)
  const cps = [], owner = []
  pieces.forEach((p, k) => { for (const ch of p.t === 'text' ? utf8(p.s ?? '') : ' ') { cps.push(ch); owner.push(p.t === 'text' ? k : -1) } })
  const out = [], of = []
  for (let i = 0; i < cps.length; i++) {
    if (/\s/.test(cps[i])) { if (out.length && out.at(-1) !== ' ') { out.push(' '); of.push(-1) } continue }
    out.push(cps[i]); of.push(owner[i])
  }
  while (out.length && out.at(-1) === ' ') { out.pop(); of.pop() }
  if (out.join('') !== unit.src) return null
  const none = { sets: 0, chain: [], flip: 0 }
  return of.map(k => (k >= 0 ? scopes[k] ?? none : none))
}
/** the value most of `xs` hold (`valueOf`), its ties to `base` where it is among them, else to the one met first; undefined for none */
function majorityOf(xs, valueOf, base) {
  const count = new Map(), first = new Map()
  xs.forEach((x, i) => { const v = valueOf(x); if (v === undefined) return; count.set(v, (count.get(v) ?? 0) + 1); if (!first.has(v)) first.set(v, i) })
  let best, n = -1
  for (const [v, c] of count) if (c > n || (c === n && (v === base || (best !== base && first.get(v) < first.get(best))))) { best = v; n = c }
  return best
}
/**
 * The unit's base style and its pieces' colours, measured on its original glyphs (E1): `chars`, the matched words' characters
 * with their source scope ({ st, sets, chain }: sourceScopes'), and where the unit has faked small capitals each glyph's reading of
 * them ({ small, lower }: smallCapsOf's). Each attribute — weight, slant, small capitals, family, colour — is
 * the one most of the glyphs outside every piece that may set it hold (a style pair or switch in any spelling, `{\bf …}` too, a
 * colour's, a link's, a paper's own macro), and only where no glyph lies outside, of them all; small capitals of the glyphs that
 * can tell them (capsVote); a tie goes to regular, upright, no
 * small capitals, serif and black, else to the unit's first glyph's. A glyph's slant is read as it would be without the toggles
 * around it (`flip`): a unit wholly inside \emph has its upright surroundings as its base, which the toggle turns italic again
 * (where its glyphs are upright, inside an italic theorem, the base is italic). Colour reads only the glyphs whose fill is told. Each piece
 * that may set colour takes the colour its own glyphs hold (those inside it and no piece within it; where none, all inside it).
 * Returns { st: { bold, italic, caps, fam, design }, fill (0xRRGGBB, or null: none told), pieces: Map(k -> fill) }
 */
export function measuredStyle(chars) {
  if (!chars.length) return null
  const of = (bit, list = chars) => { const out = list.filter(c => !(c.sets & bit)); return out.length ? out : list }
  const bold = majorityOf(of(WEIGHT), c => !!c.st.bold, false), italic = majorityOf(of(SLANT), c => !!c.st.italic !== !!c.flip, false)
  const caps = capsVote(of(CAPS))
  // (its design the one most of that family's glyphs hold, a tie to the first met: a decorative initial is no base)
  const famFrom = of(FAMILY), fam = majorityOf(famFrom, c => c.st.fam, 'serif')
  const design = majorityOf(famFrom.filter(c => c.st.fam === fam), c => c.st.design, undefined)
  const told = c => Number.isInteger(c.st.fill) && c.st.fill >= 0
  const outside = chars.filter(c => !(c.sets & COLOUR))
  const fill = majorityOf((outside.length ? outside : chars).filter(told), c => c.st.fill, 0) ?? null
  const pieces = new Map(), keys = new Set(chars.flatMap(c => c.chain))
  for (const k of keys) {
    const own = chars.filter(c => c.chain.at(-1) === k && told(c))
    const v = majorityOf(own.length ? own : chars.filter(c => c.chain.includes(k) && told(c)), c => c.st.fill, 0)
    if (v !== undefined) pieces.set(k, v)
  }
  return { st: { bold, italic, caps, fam, ...(design !== undefined ? { design } : {}) }, fill, pieces }
}
/** an open piece whose text is a link's (hyperref's \href, \hyperref, \hyperlink, starred or not) */
export const LINK_OPEN = /^\\(?:href|hyperref|hyperlink)(?![A-Za-z])/

/**
 * The unit's base style without what its own groups set: where explicit groups (\textit, \textbf, \textsc…) hold most of its
 * text and the original's majority has that style, the majority came from the groups, and the text outside them is
 * not so set (2608.04322's "\textbf{RQ1:} \textit{…}": the label was drawn bold italic). A small capitals switch (`{\sc …}`, which
 * the front end cuts into a group and the switch's placeholder) sets them over the rest of its group, or of the unit
 */
function baseOf(unit, base) {
  // (each open group by what it sets, bits of GROUP_ITALIC, GROUP_BOLD and GROUP_CAPS, and how many of the open ones set each: no
  // object a group and no closure a piece, the reading of every unit's tokens)
  let total = 0, capsAfter = false, inItalic = 0, inBold = 0, inCaps = 0, nItalic = 0, nBold = 0, nCaps = 0
  const open = []
  for (const p of unit.pieces) {
    if (p.t === 'open') {
      const bits = (/^\\(?:textit|emph|itshape|textsl)\b/.test(p.src) ? GROUP_ITALIC : 0) | (/^\\(?:textbf|bfseries)\b/.test(p.src) ? GROUP_BOLD : 0) | (/^\\(?:textsc|scshape)\b/.test(p.src) ? GROUP_CAPS : 0)
      open.push(bits)
      if (bits & GROUP_ITALIC) nItalic++
      if (bits & GROUP_BOLD) nBold++
      if (bits & GROUP_CAPS) nCaps++
    } else if (p.t === 'close') {
      const bits = open.pop() ?? 0
      if (bits & GROUP_ITALIC) nItalic--
      if (bits & GROUP_BOLD) nBold--
      if (bits & GROUP_CAPS) nCaps--
    } else if (p.t === 'ph' && /^\\(?:sc|scshape)$/.test(p.src ?? '')) {
      if (!open.length) capsAfter = true
      else if (!(open[open.length - 1] & GROUP_CAPS)) { open[open.length - 1] |= GROUP_CAPS; nCaps++ }
    } else if (p.t === 'text') {
      const n = nonSpace(p.s)
      total += n
      if (nItalic) inItalic += n
      if (nBold) inBold += n
      if (capsAfter || nCaps) inCaps += n
    }
  }
  const out = { ...base }
  if (total && base.italic && inItalic >= 0.5 * total) out.italic = false
  if (total && base.bold && inBold >= 0.5 * total) out.bold = false
  if (total && base.caps && inCaps >= 0.5 * total) out.caps = false
  return out
}
const GROUP_ITALIC = 1, GROUP_BOLD = 2, GROUP_CAPS = 4
/** a string's UTF-16 code units that are no white space (JavaScript's \s), counted with no string made */
function nonSpace(s) {
  let n = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c === 32 || (c >= 9 && c <= 13) || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff) continue
    n++
  }
  return n
}

const mcache = new Map(), icache = new Map()
/** a measure's ink over and under its baseline (TextMetrics' actual bounding box), 0 where the canvas gives none */
const inkOfMetrics = m => ({ a: Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : 0, d: Number.isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : 0 })
/** a run's width at 100 px in its face (canvas measureText, cached; its ink beside it, ink100) */
function w100(s, face) {
  work.measures++
  const font = fontString(face, 100)
  const key = `${font}|${s}`
  let w = mcache.get(key)
  if (w === undefined) {
    mctx.font = font
    const m = mctx.measureText(s)
    w = m.width
    mcache.set(key, w)
    icache.set(key, inkOfMetrics(m))
  }
  return w
}
/** a run's ink over (a) and under (d) its baseline at 100 px in its face: the drawn glyphs' own extent, from the measure
 *  that gives its width (cached with it), as TeX's box of a line is its characters' */
export function ink100(s, face) {
  const font = fontString(face, 100), key = `${font}|${s}`
  let v = icache.get(key)
  if (v === undefined) {
    mctx.font = font
    v = inkOfMetrics(mctx.measureText(s))
    icache.set(key, v)
  }
  return v
}

/**
 * The kind a mark no line may start with is, across scripts: the translation's ideographic full stop stands for the
 * original's ".", its closing corner bracket or full-width parenthesis for ")". A mark with no such partner is its own kind.
 */
export function markKind(ch) {
  if (/^[.\u3002\uFF0E\uFF61]$/u.test(ch)) return 'stop'
  if (/^[,\u3001\uFF0C\uFF64]$/u.test(ch)) return 'comma'
  if (/^[;\uFF1B]$/u.test(ch)) return 'semi'
  if (/^[:\uFF1A]$/u.test(ch)) return 'colon'
  if (/^[!\uFF01]$/u.test(ch)) return 'excl'
  if (/^[?\uFF1F]$/u.test(ch)) return 'quest'
  if (/^[)\]}\uFF09\uFF3D\uFF5D\u3009\u300B\u300D\u300F\u3011\u3015\u3017\u3019\u301B\u2019\u201D]$/u.test(ch)) return 'close'
  return ch
}

/**
 * The text after a placeholder kept on its held line, without the leading marks that stand for one the line itself shows
 * after the placeholder (`held`, the original's characters in order): each such mark is matched with one of those, not
 * counted against them, so that a translation's ")" before its full stop is drawn where the line shows only a full stop.
 */
export function droppedHeld(s, held) {
  const left = held.map(markKind)
  let t = s, kept = ''
  while (left.length) {
    const lead = /^\s*/.exec(t)[0], ch = String.fromCodePoint(t.codePointAt(lead.length) ?? 0x20)
    if (lead.length >= t.length || !noStart(ch)) break
    const at = left.indexOf(markKind(ch))
    if (at >= 0) left.splice(at, 1)
    else kept += lead + ch
    t = t.slice(lead.length + ch.length)
  }
  return kept + t
}

/**
 * `text` with the ranges `cuts` ([from, to), rising: stutter.mjs stutterCuts) left out, and its transformMap (`map`, or null)
 * less the same characters, so that each character left keeps the place in the piece it had; null where there is nothing to cut
 */
export function cutOut(text, cuts, map) {
  if (!cuts.length) return null
  let out = '', at = 0
  const from = map ? [] : null, span = map ? [] : null
  const keep = (a, z) => {
    out += text.slice(a, z)
    if (map) for (let i = a; i < z; i++) { from.push(map.from[i]); span.push(map.span[i]) }
  }
  for (const [a, z] of cuts) { if (a > at) keep(at, a); at = Math.max(at, z) }
  keep(at, text.length)
  return { text: out, map: map && { from, span } }
}

/** a length TeX reads as a dimension, in PDF units (big points): its number and its unit, the em by itself */
const DIMEN = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(pt|bp|mm|cm|in|pc|dd|cc|sp|em)$/
const BP = { pt: 72 / 72.27, bp: 1, mm: 72 / 25.4, cm: 72 / 2.54, in: 72, pc: (12 * 72) / 72.27, dd: ((1238 / 1157) * 72) / 72.27, cc: ((12 * 1238) / 1157 * 72) / 72.27, sp: 72 / 72.27 / 65536 }
/** the kerns LaTeX defines in the current font's em (\enspace is \kern.5em, \, and \thinspace \kern.16667em, \: \medspace,
 *  \; \thickspace), and the glue (\quad is \hskip1em, \qquad two) */
const KERNS = { '\\enspace': 0.5, '\\thinspace': 1 / 6, '\\,': 1 / 6, '\\:': 2 / 9, '\\;': 5 / 18 }
const SKIPS = { '\\quad': 1, '\\qquad': 2 }
/**
 * A placeholder's source that is explicit glue, as TeX sets it: { em } or { bp } (a length in the font's em, or in PDF
 * units), and `brk`, whether a line may break at it (TeX's glue, not its \kern). \hspace (starred or not), \hskip and \kern
 * with a plain length; the length's stretch aside. Null for any other source, and for a length that is not one number and
 * unit (\fill, 0.5\linewidth), an ex (the font's x-height, which the original's font, not a number, gives), or not above 0
 */
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
/** the characters a script that sets no spaces between its words sets none beside either: Han, kana and the full-width
 *  marks (CJK Symbols and Punctuation, the Halfwidth and Fullwidth Forms' punctuation), and where the rules set them as
 *  CJK's (cjkQuotes) the curly quotes, dashes, ellipsis and middle dot */
const SPACELESS = /[\p{sc=Han}\p{scx=Hira}\p{scx=Kana}\u3000-\u303F\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65]/u
const SPACELESS_QUOTES = /[“”‘’—…·]/u
/** two SPACELESS characters with white space between, in a unit's source: a paper that writes CJK so, its own */
const CJK_SPACED = new RegExp(`${SPACELESS.source}\\s+${SPACELESS.source}`, 'u')
/** a token whose edge (its last character, `end`, else its first) is a character SPACELESS holds, or a curly quote, dash,
 *  ellipsis or middle dot: a CJK token holds one only where the rules set them as CJK's (cjkQuotes, cjkClassRe). A superscript
 *  is no CJK token (tokensOf2 sets it 'latin') */
const spacelessEdge = (t, end) => {
  if (t?.cls !== 'cjk' || typeof t.s !== 'string' || !t.s) return false
  const cps = [...t.s], ch = end ? cps.at(-1) : cps[0]
  return SPACELESS.test(ch) || SPACELESS_QUOTES.test(ch)
}
/** a token cut in two by the breaker, its head: no kern of its own (the kern stays after the word's tail) */
const headOfCut = (t, extra) => {
  if (!t.kernW) return { ...t, ...extra }
  const { kernW: _w, kernEnd: _end, ...rest } = t
  return { ...rest, ...extra }
}

// ---- small capitals the layer draws itself (2602.23285's appendix headings, 2026-10-24)
// A run set in small capitals in a face with none of its own (Nimbus Roman, Nimbus Sans, FreeMono: no smcp feature) is drawn
// as NFSS's virtual faces set them: each lowercase letter as the face's capital at the share of the size the original's small
// capitals are set at (the unit's capsRatio, else SMALL_CAPS_RATIO), the other characters as they are, each run of one case a
// token of its own (`sc`, that share), glued to the one before, measured and drawn in the face with no small capitals asked of
// it. No browser synthesizes them: Chromium did at 0.7 where TeX sets 0.8, Firefox and WebKit each in their own way, so that
// widths and line breaks were the browser's. A face of real small capitals (its smcp, Latin Modern's caps face) draws its own

/** whether the layer draws a run's small capitals itself: a run set in them (`caps`, a Latin run's: fonts.mjs) in a face with
 *  none of its own (font-roles.mjs ownSmallCaps; a prototype face's are not known, so none) */
export const selfCaps = face => !!face?.caps && !(face.id && ownSmallCaps(face.id))
/** a face as the layer draws its small capitals in: with none asked of it where it draws them itself (selfCaps) */
const plainOf = face => (selfCaps(face) ? { ...face, caps: false } : face)
/** a target's capitals: its language's case mapping (Turkish i to İ, German ß to SS), the root's where it names none a locale
 *  reads (no code, or one no locale takes), never the device's */
const uppers = new Map()
export function upperOf(to) {
  let f = uppers.get(to)
  if (!f) {
    let loc = 'und'
    if (typeof to === 'string' && to) try { 'a'.toLocaleUpperCase(to); loc = to } catch {}
    f = s => s.toLocaleUpperCase(loc)
    uppers.set(to, f)
  }
  return f
}
const MARKS = /^\p{M}$/u, CAPITAL = /^\p{Lu}$/u
/**
 * `s` in runs of one case as the layer draws its small capitals (selfCaps): each { s: its text as drawn, k: the share of the
 * size it is drawn at (1, or `ratio` for a run of small capitals), at: its first character's UTF-16 offset in `s`, n: its
 * length there }. A small capital is a letter the target's case mapping changes (`upper`), drawn as its capitals, or a capital
 * `smallAt` (its offset in `s`) says the page sets as one (a rendering of the page's own characters, smallCapsAt); a mark stays
 * with the letter before it
 */
export function caseRuns(s, ratio, upper, smallAt = null) {
  const out = []
  let at = 0
  for (const ch of s) {
    const last = out.at(-1)
    const k = last && MARKS.test(ch) ? last.k : upper(ch) !== ch || (smallAt?.(at) && CAPITAL.test(ch)) ? ratio : 1
    if (last?.k === k) { last.src += ch; last.n += ch.length }
    else out.push({ src: ch, k, at, n: ch.length })
    at += ch.length
  }
  return out.map(({ src, k, at: a, n }) => ({ s: k === 1 ? src : upper(src), k, at: a, n }))
}
/** a rendering of the page's own characters (`chars`, its gap's; `text` as gapsOfOnce joins them, fillRunsOf's walk): by each
 *  UTF-16 offset of `text`, whether its character is set at most SMALL_CAPS_SHARE of `size` (the unit's capitals'), a faked small
 *  capital where it is a capital; null where its characters do not give the text */
export function smallCapsAt(chars, text, size) {
  if (!Array.isArray(chars) || !chars.length || typeof text !== 'string' || !(size > 0)) return null
  const flags = []
  let joined = ''
  for (const c of chars) {
    const small = c.size > 0 && c.size <= SMALL_CAPS_SHARE * size
    for (const ch of c.ch) {
      if (/\s/.test(ch)) { if (joined && !joined.endsWith(' ')) { joined += ' '; flags.push(false) } continue }
      joined += ch
      for (let i = 0; i < ch.length; i++) flags.push(small)
    }
  }
  while (joined.endsWith(' ')) { joined = joined.slice(0, -1); flags.pop() }
  return joined === text && flags.some(Boolean) ? at => !!flags[at] : null
}

/**
 * A unit's pieces as tokens: { s, st, face, cls ('cjk'|'latin'), w100, glue (no break before), punct ('open'|'close'),
 * asp (CJK–Latin autospace before it), hyph (a language to hyphenate it in) }, { space }, { crop }, { sup }. `base`: the
 * unit's style ({ fam, bold, italic, caps, design }); `designs`: the paper's serif, sans and mono designs. `lead`: what
 * the unit's first line starts with before its own text, each part in its own style ({ parts: [{ text, st }], gap }: a
 * float's label in the target's name, labelInTarget; a run-in heading and the joint TeX set after it, run.mjs), then
 * `gap`: a space where it is undefined, else that many em of the unit's size after the lead's last character, no place
 * to break (the original's: TeX's \labelsep after amsthm's "Proof.", none after IEEEtran's dash). `measure(s, face)`: a run's width at 100 px (the canvas's, cached); a host passes its own to read the
 * tokens (their faces and texts) before any face is loaded, without a width entering the cache that a face not yet there
 * would give.
 * White space in a script that sets none between its words (the rules' keepAll false: Chinese, Japanese) is not drawn where
 * its nearest drawn tokens either side are both Han, kana or full-width marks (SPACELESS), whatever set it there: the
 * translator's reply, a space placeholder (a tie, a control space, a forced break no source locates); but the space after a
 * styled pair that opens the unit, a run-in head (`\noindent\textbf{Title}` and the text after it), which TeX set there
 * itself; a space inside a code run (the typewriter face's: its spaces are its content); and every space of a unit whose source
 * sets two such characters with white space between (a paper that writes CJK so, its own: sourceRepeats' rule for a stutter).
 * A formula crop is no such token: the space beside it stays (its autospace). Explicit glue in the source (glueOf:
 * \enspace, \quad, \hspace{6pt}, …) is a kern at TeX's width after the token before it (`kernW`, at 100 px), in every target:
 * never a space, so the reply's white space around its marker goes with it, and the word after a \kern stands with the one
 * before it; none at the unit's start or a line's (TeX's line starts after it), and a laid line's last kern is dropped
 */
export function tokensOf2(unit, resolved, to, baseIn, designs, P, lead = null, measure = w100, tagWords = false) {
  const tokens = []
  // (`tagWords`, the page's word table: each token of a text piece carries `at` and `end`, its range in plainTranslated(pieces),
  // words.mjs, and a lead's last token `kernEm`, the glue after it; no other field of a token changes, and a token of a lead, a
  // label or a placeholder's rendering has no range)
  const plain = tagWords ? plainTracker() : null
  // (the unit's base as its glyphs outside its styled pieces hold it, E1; else today's reading. A colour is drawn only where it is
  // measured so, never the fill of the style the majority's character happens to carry)
  const measured = resolved.measured ?? null
  const { fill: _fill, ...given } = baseIn
  const base = measured?.st ? { ...given, ...measured.st } : baseOf(unit, given)
  if (Number.isInteger(measured?.fill) && measured.fill > 0) base.color = hexOf(measured.fill)
  const stack = [{ ...base }]
  const style = () => stack.at(-1)
  // (a colour piece's run, a \textcolor's or a \color switch's: drawn in the fill TeX set it in, the file's `colours` row,
  // `colourRun` that it came so; a piece the file has no row for keeps the colour around it, never a guess from its name)
  // A piece that may set colour and that no row tells (a paper's own macro, a link) takes the colour its own glyphs hold
  // (measuredStyle's `pieces`, by the source piece's own index `p.k`), black the run's ink (E1)
  const colourRun = (k, p) => {
    const rgb = resolved.colourOf?.(k)
    if (Number.isInteger(rgb)) return { color: hexOf(rgb), colourRun: true }
    const own = Number.isInteger(p.k) ? measured?.pieces?.get(p.k) : undefined
    if (Number.isInteger(own)) return { color: own > 0 ? hexOf(own) : undefined, colourRun: true }
    return {}
  }
  // (the layout rules': whether lines break only at spaces, which quotes are CJK's, centred punctuation, the Latin and the
  // Cyrillic words' hyphenation and the shortest hyphenated word, the line-break marks)
  const { keepAll, cjkQuotes, centredPunct: centred, latinPatterns: latinLang, cyrillicPatterns: cyrLang, hyphenation: { minWord } } = P
  const cjkRe = cjkClassRe(cjkQuotes)
  const kinsoku = kinsokuOf(P.noStart, P.noEnd)
  const prevNonSpace = () => { for (let q = tokens.length - 1; q >= 0; q--) if (!tokens[q].space) return tokens[q]; return null }
  const lastIsSpace = () => tokens.length > 0 && tokens.at(-1).space
  // (a \kern's next word stands with the word before it; the space after a run-in head, `afterHead`, is kept)
  let noBreakNext = false, afterHead = false
  const push = t => {
    const prev = tokens.at(-1)
    if (noBreakNext && !t.space) t.glue = true
    noBreakNext = false
    afterHead = false
    if (prev && !prev.space && !t.space) {
      if (kinsoku.starts(t.s ?? '') || (prev.s && kinsoku.ends(prev.s))) t.glue = true
      // (a pair UAX 14 keeps together, two em dashes or two ellipses, each a CJK character of its own: no-start.mjs keptPair)
      else if (keptPair(prev.s, t.s)) t.glue = true
      // Latin after Latin with nothing between them (a number and its ×, a word and its placeholder's text) stands
      // together, but not after a word's own hyphen
      // (a kern between them is something: the glue a line may break at, or a \kern's, which glues them itself)
      if (!t.brk && t.cls === 'latin' && prev.cls === 'latin' && !prev.crop && !prev.kernW) t.glue = true
      // CJK–Latin autospace: where a CJK character meets a letter or digit with no space between
      // (not beside a CJK mark: "\uFF08LLMs\uFF09" takes no space inside its brackets, nor "\uFF0CLLM")
      const cjkSide = t.cls === 'cjk' ? t.s : prev.s ?? ''
      if (P.autospace && !prev.kernW && t.cls && prev.cls && t.cls !== prev.cls && /[A-Za-z0-9]/.test(t.cls === 'latin' ? t.s[0] : (prev.s ?? '').at(-1) ?? '') && !/^[\u3001\u3002\uFF0C\uFF0E\uFF1A\uFF1B\uFF01\uFF1F\uFF08\uFF09\u300C\u300D\u300E\u300F\u3010\u3011\u3014\u3015\u3008\u3009\u300A\u300B“”‘’]$/.test(cjkSide)) t.asp = true
    }
    tokens.push(t)
  }
  // (small capitals the layer draws itself, where a run's face has none of its own: at the share its page sets them at, capsRatio,
  // a capital of a rendering of the page's own characters a small one where the page sets it at most SMALL_CAPS_SHARE of the
  // unit's size: caseRuns; and the capitals of an all-capitals unit's text, `upper`; each by the target's case mapping)
  const capsK = resolved.capsRatio ?? SMALL_CAPS_RATIO, upper = upperOf(to)
  const pushText = (s, st, extra = {}, track = null, smallAt = null) => {
    for (const m of s.matchAll(/\s+|\S+/g)) {
      const chunk = m[0]
      if (/^\s+$/.test(chunk)) {
        // (none right after a lead whose glue is the original's: the unit's text begins after it, its own white space
        // TeX's to skip)
        if (tokens.length && !lastIsSpace() && !tokens.at(-1).leadEnd && !tokens.at(-1).kernEnd) {
          const face = plainOf(faceOf(st, 'latin', to))
          tokens.push({ space: true, st, face, w100: measure(' ', face), ...(afterHead ? { keep: true } : {}) })
        }
        afterHead = false
        continue
      }
      // the chunk by class: CJK characters, and the runs between them
      const parts = []
      let cur = null, off = 0
      for (const ch of chunk) {
        const cls = cjkRe.test(ch) ? 'cjk' : 'latin'
        // Chinese and Japanese break between any two CJK characters: each its own part
        if (cls === 'cjk' && !keepAll) { cur = null; parts.push({ cls, s: ch, off }); off += ch.length; continue }
        if (cur && cur.cls === cls) cur.s += ch
        else { cur = { cls, s: ch, off }; parts.push(cur) }
        off += ch.length
      }
      parts.forEach((p, n) => {
        // a Latin word cut at its own hyphens and slashes: a line may break after them
        // a URL or a path (mono) after its separators, as TeX's url package breaks it
        const pieces = p.cls !== 'latin' ? [p.s] : st.fam === 'mono' || /^(?:https?:|www\.)/.test(p.s) ? p.s.split(/(?<=[/.\-_#?&=])(?=[^/.\-_#?&=])/) : !extra.ph ? p.s.split(/(?<=[A-Za-zÀ-ɏЀ-ӿ][-/])(?=[A-Za-zÀ-ɏЀ-ӿ])/) : [p.s]
        let po = 0
        pieces.forEach((s, q) => {
          const face0 = faceOf(st, p.cls, to)
          // (a word in the text's capitals, an all-capitals heading's (`upper`): the target's capitals of it, at its size; a word in
          // small capitals the layer draws itself: its runs of one case, each a token glued to the one before; neither
          // hyphenated, and any other word one token. Case is each character's own, whatever its script: caseRuns)
          const from = m.index + p.off + po
          const all = p.cls === 'latin' && !!st.upper
          const runs = !all && p.cls === 'latin' && selfCaps(face0) ? caseRuns(s, capsK, upper, smallAt && (i => smallAt(from + i))) : null
          const face = runs || all ? plainOf(face0) : face0
          // (no object a word where it is one token: the reading of nearly every word)
          for (let r = 0, count = runs ? runs.length : 1; r < count; r++) {
            const run = runs?.[r], rs = run ? run.s : all ? upper(s) : s, k = run ? run.k : 1, at = run ? run.at : 0, len = run ? run.n : s.length
            const t = { s: rs, st, face, cls: p.cls, w100: measure(rs, face) * k, ...extra, ...(q > 0 && at === 0 ? { brk: true } : {}) }
            if (k !== 1) t.sc = k
            if (track && len) {
              const i = from + at, last = i + len - 1
              const sm = track.sm, a = track.base + track.map.from[i], z = track.base + track.map.from[last] + track.map.span[last] - 1
              // (a token that is only escapes `shown` spells as white space, a lone backslash, tilde or caret, has no place of its own:
              // the plain text collapses it into the white space around it, whose offset is the next word's)
              if (!sm || /\S/.test(track.sh.slice(sm[a], sm[z] + 1))) {
                t.at = track.at[sm ? sm[a] : a]
                t.end = track.at[sm ? sm[z] : z] + 1
              }
            }
            // within a chunk, parts stand together (no break), but Chinese and Japanese break before and after a CJK
            // character, and a word may break after its own hyphen
            // (a word's later run of one case goes on the word, `cont`: the breaker cuts a word too long for its line across them)
            if (at > 0) { t.glue = true; t.cont = true }
            else if (q === 0 && n > 0 && !(!keepAll && (p.cls === 'cjk' || parts[n - 1].cls === 'cjk'))) t.glue = true
            if (p.cls === 'cjk' && s.length === 1 && !centred && P.compressMax >= 0) t.punct = PUNCT_CLOSE.test(s) ? 'close' : PUNCT_OPEN.test(s) ? 'open' : null
            if (!runs && !all && p.cls === 'latin' && P.hyphen && !extra.ph && st.fam !== 'mono' && s.length >= minWord && unit.kind !== 'heading' && !unit.title) {
              const word = s.replace(/[^A-Za-zÀ-ɏЀ-ӿ]+$/, '').replace(/^[^A-Za-zÀ-ɏЀ-ӿ]+/, '')
              const cyr = /[Ѐ-ӿ]/.test(word)
              if (word.length >= minWord && (cyr ? /^[Ѐ-ӿ]+$/.test(word) : /^[A-Za-zÀ-ɏ][a-zà-ɏß]+$/.test(word))) t.hyph = cyr ? cyrLang : latinLang
            }
            push(t)
          }
          po += s.length
        })
      })
    }
  }
  if (lead?.parts?.length) {
    for (const part of lead.parts) pushText(part.text, { ...base, ...part.st }, { label: true })
    const st = { ...base, ...lead.parts.at(-1).st }
    if (lead.gap === undefined) pushText(' ', st)
    else if (tokens.length) {
      const t = tokens[tokens.length - 1]
      t.leadEnd = true
      if (lead.gap > 0) { t.w100 += 100 * lead.gap; t.kern = true; if (plain) t.kernEm = lead.gap }
    }
  }
  // a displayed formula the text after it starts below (or one before the unit's lines): the translation's text that
  // opens that segment with a mark UAX 14 does not let a line start with (a sentence's ideographic comma or full stop Microsoft sets after
  // a display piece, a "," or ")") is drawn without it, unless the original's own line there opens with one (its
  // `origAfter`): the maintainer's fix 4 of 2026-10-15, for every script. So is such a mark after a placeholder kept on
  // its held line where that line shows the original's own mark after it (`heldAfter`). The rows and the cache keep the translation
  let after = null
  // (after a display, every such mark: the original's line there opens with none; after a held line's mark, those that
  // stand for one the line shows, `held`)
  const dropped = s => {
    if (after.held) return droppedHeld(s, after.held)
    let t = s
    for (;;) {
      const lead = /^\s*/.exec(t)[0], ch = String.fromCodePoint(t.codePointAt(lead.length) ?? 0x20)
      if (lead.length >= t.length || !noStart(ch) || noStart(after.origAfter)) return t
      t = t.slice(lead.length + ch.length)
    }
  }
  // (a translator's stutter, a word written twice in a row the source has once, drawn once: stutter.mjs, the M1 survey; not
  // where the unit's source repeats a word itself)
  const tidy = !sourceRepeats(unit.src)
  // (a run-in head: the styled pair the unit opens with, only pieces that draw nothing before it, its id)
  let headId = null
  for (const p of unit.pieces) {
    if (p.t === 'text') { if (/\S/.test(p.s)) break; continue }
    if (p.t === 'ph' && (glueOf(p.src) || ['zero', 'space'].includes(phClass2(p.src).cls))) continue
    if (p.t === 'open' && applyCmd(p.src, base, designs)) headId = p.id
    break
  }
  // (explicit glue: a kern after the token before it, the reply's white space either side of its marker gone)
  const kernOn = g => {
    const size = resolved.orig?.size
    const em = g.em ?? (g.bp !== undefined && size > 0 ? g.bp / size : 0)
    if (!(em > 0)) return
    while (tokens.at(-1)?.space) tokens.pop()
    const t = tokens.at(-1)
    if (!t || t.newline !== undefined || t.blockTo !== undefined) return
    // (the item laid of it holds the kern apart from its own width, breakLines' `kern`: what it draws, a crop's image, its word
    // box, stays its own)
    t.kernW = (t.kernW ?? 0) + 100 * em
    t.kernEnd = true
    if (!g.brk) noBreakNext = true
  }
  unit.pieces.forEach((p, k) => {
    if (p.t === 'text') {
      // (a translated piece holds TeX's escapes: drawn undone, each its own character, layer/pieces.mjs drawnText)
      const raw = drawnText(p)
      let s = raw
      // (the plain text's offsets of the piece's characters, as the PDF shows it; a piece whose shown text is not the one drawn
      // from, or whose transformed text the map cannot follow, is tagged with none)
      const sh = plain ? shown(p) : null, at = plain?.text(sh)
      if (after && /\S/.test(s)) { s = dropped(s); after = null }
      const text = s.replace(/\n/g, ' ').replace(/---/g, '—').replace(/--/g, '–').replace(/``/g, '“').replace(/''/g, '”')
      // (a translation's drawn text is shown's character for character, but an escape shown as white space, which its index map
      // reads so that a token of it has no place; a source piece must be drawn as it is shown)
      const sm = at ? (sh === raw ? true : p.tr && sh.length === raw.length ? Int32Array.from({ length: raw.length }, (_, i) => i) : null) : null
      const map = sm ? transformMap(s, text) : null
      // (a stutter's second word left out of a translated piece, each character left keeping its place: the word table's offsets
      // stay the translation's own)
      const cut = tidy && p.tr ? cutOut(text, stutterCuts(text), map) : null
      pushText(cut?.text ?? text, style(), {}, (cut ? cut.map : map) && { at, sh, base: raw.length - s.length, map: cut ? cut.map : map, sm: sm === true ? null : sm })
      return
    }
    plain?.gap()
    if (p.t === 'open') {
      const next = applyCmd(p.src, style(), designs)
      // (a link's text, \href's, \hyperref's or \hyperlink's: each token of it tells its pair by `link`, the open's id, which the
      // engine's links read (links.mjs) and no drawing does)
      const link = LINK_OPEN.test(p.src) && p.id !== undefined ? { link: p.id } : {}
      stack.push({ ...(next ?? style()), ...colourRun(k, p), ...link })
      return
    }
    if (p.t === 'close') {
      if (stack.length > 1) stack.pop()
      if (headId !== null && p.id === headId) afterHead = true
      return
    }
    if (p.t === 'ph') {
      const glue = glueOf(p.src)
      if (glue) { kernOn(glue); return }
      // a switch: the rest of its group
      const sw = applyCmd(p.src, style(), designs)
      if (sw && /^\\[A-Za-z]+$/.test(p.src)) { stack[stack.length - 1] = sw; return }
      const run = colourRun(k, p)
      if (run.colourRun) stack[stack.length - 1] = { ...style(), ...run }
    }
    const r = resolved.get(k)
    if (!r) return
    // (a forced break the file locates inside a frame, finishUnit's: the laid line ends there, and TeX's room after it is
    // left before the next line, `newline` the file's line after it, by which a group's later pieces are the same break)
    if (r.brk && r.room !== undefined) {
      while (tokens.at(-1)?.space) tokens.pop()
      if (tokens.at(-1)?.newline !== r.brkAt) tokens.push({ newline: r.brkAt, room: r.room, w100: 0 })
      return
    }
    // (one whose next line opens another frame: the laid line ends there, and the text after it starts on the line TeX
    // set after the original's break, as after a display)
    if (r.brk && r.region !== undefined && resolved.referenced?.has(r.region)) {
      while (tokens.at(-1)?.space) tokens.pop()
      // (a group's later pieces are the same break)
      if (tokens.at(-1)?.blockTo !== r.region) tokens.push({ blockTo: r.region, w100: 0, brk: true })
      return
    }
    // iteration 3: a kept rendering (a displayed formula) stands where it is; the text after it starts below it
    if (r.mode === 'kept' && r.region !== undefined && resolved.referenced?.has(r.region)) {
      while (tokens.at(-1)?.space) tokens.pop()
      tokens.push({ blockTo: r.region, w100: 0 })
      if (r.cls === 'display') after = r
      // (a held line's own mark after the placeholder stands with it, the original's: the translation's is not drawn
      // again, finishUnit's `heldAfter`)
      else if (noStart(r.heldAfter)) after = { origAfter: null, held: r.heldMarks?.length ? r.heldMarks : [r.heldAfter] }
      return
    }
    // (a display before the unit's lines, drawn as nothing: the text after it opens the unit's first line)
    if (r.cls === 'display' && r.inPlace && !tokens.some(t => !t.space)) { after = r; return }
    // (anything else drawn ends the segment's head: a crop, a rendering's text; nothing drawn and a space do not)
    if (r.mode !== 'none' && r.text !== ' ' && !(r.mode === 'kept' && r.cls === 'display')) after = null
    if (r.mode === 'crop') {
      // (a formula TeX broke over lines, its crops one after another, a space between them: the line breaks only there, at
      // TeX's own break, and where they stand on one line they are the glue TeX dropped at the break apart, a space's width)
      // A crop is glued to the token before it where no space stands between them, but not to a CJK character or a CJK mark in a
      // script that breaks between CJK characters (keepAll false): there xeCJK sets \CJKecglue between a CJK character and
      // inline math, a place TeX may break, and a Chinese or Japanese translation sets no space there, so the glue made the
      // character, the formula and the mark after it one group that a line could not take and had to end before, its gaps
      // spread (2610.10069 page 7, unit 49). A mark no line ends with (an opening bracket), a lead's end and a kern stay glued
      const pv = tokens.at(-1)
      const ecglue = !keepAll && pv?.cls === 'cjk' && !pv.leadEnd && !pv.kernW && !(pv.s && kinsoku.ends(pv.s))
      for (const [n, q] of cropPartsOf(r).entries()) {
        if (n) pushText(' ', style())
        const glue = tokens.length > 0 && !lastIsSpace() && !(n === 0 && ecglue)
        tokens.push({ crop: q, cw: q.crop[2] - q.crop[0], glue, w100: 0 })
      }
      return
    }
    if (!r.text) return
    if (r.text === ' ') { pushText(' ', style()); return }
    // (a formula's text in no small capitals and no capitals of the text's: TeX sets neither in math)
    const own = r.math ? { ...style(), italic: /[A-Za-z]/.test(r.text) && r.text.length <= 3, caps: false } : r.mode === 'orig-text' && r.st && r.st.fam !== 'math' ? { ...style(), fam: r.st.fam === 'mono' ? 'mono' : style().fam, design: r.st.fam === 'mono' ? designs.mono : style().design } : style()
    if (r.math && own.upper) own.upper = false
    // (in its glyphs' own colour where the file gives one: a citation in hyperref's colorlinks blue, which the unit's source
    // does not name; mixed or black, its run's. A run the source colours, which the file's `colours` row gives, wins)
    const fill = resolved.fillOf?.(k)
    const st = !own.colourRun && Number.isInteger(fill) && fill >= 0 ? { ...own, color: hexOf(fill) } : own
    // (a rendering of the page's own characters in their own fills, each run of one fill its own colour: "[16]"'s black brackets and
    // blue digits, cleveref's black "Figure" before its linked "1"; a character whose fill is not told in the colour above)
    // (runs drawn alike, a character whose fill is not told beside one of the colour it falls back to, are one: no token more
    // than the colours need)
    // (not inside a run a colours row tells: TeX's colour wins, as it does over the row's fill above)
    const fills = r.mode === 'orig-text' && !r.math && !own.colourRun ? fillRunsOf(r.gap?.chars, r.text) : null
    let runs = fills ? [] : null
    for (const run of fills ?? []) {
      const rs = run.fill === UNKNOWN ? st : { ...own, color: run.fill > 0 ? hexOf(run.fill) : undefined }
      const last = runs.at(-1)
      if (last && (last.st.color ?? null) === (rs.color ?? null)) last.text += run.text
      else runs.push({ text: run.text, st: rs })
    }
    // (the names a package generated in it in the target's (renameRefs: cleveref's "Theorem" of "Theorem A.17"), each in its own
    // run's colour, its numbers as they are)
    const renamed = r.mode === 'orig-text' && !r.math && !r.sup && r.rename?.length ? renameRuns(runs ?? [{ text: r.text, st }], r.rename) : null
    if (renamed) runs = renamed
    // (the page's own characters in small capitals the layer draws itself: a capital the page sets as a small one is drawn so, a
    // macro's text in faked small capitals, which the page's text gives in capitals: smallCapsAt)
    const capsAt = !renamed && r.mode === 'orig-text' && !r.math && own.caps && !own.upper ? smallCapsAt(r.gap?.chars, r.text, resolved.orig?.size) : null
    if (r.sup) {
      // (a raised rendering in its runs too, each glued to the one before: a superscript citation's black brackets, its blue digits;
      // a mark, drawn as it is, in no small capitals)
      for (const run of runs ?? [{ text: r.text, st }]) {
        const face = plainOf(faceOf(run.st, 'latin', to))
        tokens.push({ s: run.text, st: run.st, face, cls: 'latin', w100: measure(run.text, face) * 0.62, sup: true, glue: true, ph: r.mode, k })
      }
    } else if (runs) {
      let at = 0
      for (const run of runs) {
        const from = at
        pushText(run.text, run.st, { ph: r.mode, k }, null, capsAt && (i => capsAt(from + i)))
        at += run.text.length
      }
    } else pushText(r.text, st, { ph: r.mode, k, ...(r.math ? { math: true } : {}) }, null, capsAt)
  })
  // the class's own marks after the unit's text (finishUnit's `tail`), each in its own style, in place of the translation's
  // own marks of their kinds at its end (markKind: its "\uFF09\u3002" for the original's ")."), never shown twice
  if (resolved.tail?.length) {
    // (as many of a kind as the tail holds: "\u201d\uFF09\u3002" before a tail of ")." keeps its closing quote, of the kind of ")";
    // and none of the marks the source writes at its end itself (`tailOwn`), which are the translation's: "\u3002" of "error."
    // before amsthm's ")." stays, a reference's "\uFF09" before its style's "." stays, an added "\u3002" after it goes)
    const left = new Map()
    for (const c of resolved.tail) left.set(markKind(c.ch), (left.get(markKind(c.ch)) ?? 0) + 1)
    const trailing = new Map(), own = new Map()
    for (const ch of resolved.tailOwn ?? []) own.set(markKind(ch), (own.get(markKind(ch)) ?? 0) + 1)
    scan: for (let q = tokens.length - 1; q >= 0; q--) {
      const t = tokens[q]
      if (t.space) continue
      if (typeof t.s !== 'string' || t.ph || t.sup || t.label) break
      const cps = [...t.s]
      for (let i = cps.length - 1; i >= 0; i--) { if (!/^\p{P}$/u.test(cps[i])) break scan; trailing.set(markKind(cps[i]), (trailing.get(markKind(cps[i])) ?? 0) + 1) }
    }
    for (const [kind, n] of left) left.set(kind, Math.min(n, Math.max(0, (trailing.get(kind) ?? 0) - (own.get(kind) ?? 0))))
    const take = ch => { const n = left.get(markKind(ch)) ?? 0; if (n > 0) left.set(markKind(ch), n - 1); return n > 0 }
    for (;;) {
      while (tokens.at(-1)?.space) tokens.pop()
      const t = tokens.at(-1)
      if (!t || typeof t.s !== 'string' || t.ph || t.sup || t.label) break
      const cps = [...t.s]
      let n = cps.length
      while (n > 0 && take(cps[n - 1])) n--
      if (n === cps.length) break
      if (n === 0) { tokens.pop(); continue }
      t.s = cps.slice(0, n).join('')
      t.w100 = measure(t.s, t.face) * (t.sc ?? 1)
      break
    }
    for (const c of resolved.tail) {
      const cs = c.st && c.st.fam !== 'math' ? { fam: c.st.fam, bold: !!c.st.bold, italic: !!c.st.italic, caps: !!c.st.caps, ...(c.st.design ? { design: c.st.design } : {}) } : {}
      pushText(c.ch, { ...base, ...cs })
    }
  }
  while (tokens.at(-1)?.space) tokens.pop()
  void prevNonSpace
  // (a script that sets no spaces between its words: a space between two SPACELESS edges is not drawn, but a run-in head's, a
  // code run's, and any in a unit whose source sets such characters with spaces between)
  if (!keepAll && !CJK_SPACED.test(unit.src ?? '')) {
    const drawnAt = (q, step) => { for (; q >= 0 && q < tokens.length; q += step) if (!tokens[q].space) return tokens[q]; return null }
    const kept = tokens.filter((t, q) => !t.space || t.keep || t.st?.fam === 'mono' || !spacelessEdge(drawnAt(q - 1, -1), true) || !spacelessEdge(drawnAt(q + 1, 1), false))
    if (kept.length < tokens.length) { tokens.length = 0; for (const t of kept) tokens.push(t) }
  }
  tokens.base = base
  return tokens
}

/** a character style's colour as a run takes it (E1): its fill where told, black the run's ink (`color` undefined, set so that it
 *  wins over a colour around it), nothing where its fill is not told */
export const colourOfStyle = st => (Number.isInteger(st?.fill) && st.fill >= 0 ? { color: st.fill > 0 ? hexOf(st.fill) : undefined } : {})
/** a run's style from its characters (the first not a formula's): a class's bold or italic heading, small capitals, its colour;
 *  its design the paper's (`serif`, where the character's font tells none) */
export function styleOfChars(cs, serif) {
  const s0 = cs.find(c => c.st?.fam !== 'math')?.st ?? cs[0]?.st ?? {}
  return { fam: s0.fam === 'math' || !s0.fam ? 'serif' : s0.fam, bold: !!s0.bold, italic: !!s0.italic, caps: !!s0.caps, design: s0.design ?? serif, ...colourOfStyle(s0) }
}

/** a rendering's text (`text`, its characters' as gapsOfOnce joins them: white space one space, trimmed) in runs of one fill
 *  ({ text, fill }: 0xRRGGBB, or UNKNOWN), each white space the fill of the character before it; null where its characters do not
 *  give that text, or no character's fill is told */
export function fillRunsOf(chars, text) {
  if (!Array.isArray(chars) || !chars.length || typeof text !== 'string') return null
  const cps = []
  for (const c of chars) {
    const f = Number.isInteger(c.st?.fill) && c.st.fill >= 0 ? c.st.fill : UNKNOWN
    for (const ch of c.ch) cps.push({ ch, f })
  }
  const out = []
  for (const x of cps) {
    if (/\s/.test(x.ch)) { if (out.length && out.at(-1).ch !== ' ') out.push({ ch: ' ', f: out.at(-1).f }); continue }
    out.push(x)
  }
  while (out.length && out.at(-1).ch === ' ') out.pop()
  if (out.map(x => x.ch).join('') !== text || out.every(x => x.f === UNKNOWN)) return null
  const runs = []
  for (const x of out) { if (runs.at(-1)?.fill === x.f) runs.at(-1).text += x.ch; else runs.push({ text: x.ch, fill: x.f }) }
  return runs
}

/** the faces a target will most likely need, each measured once in a task of its own (a system CJK face loads on
 *  its first use, 10–40 ms, which would otherwise fall in the first unit's layout); the CJK ones where the target is set by
 *  CJK rules (`cjk`, the run's P.cjk). `ready(face, text)`: awaited before
 *  each measure, so that a face served in slices has the slice of the text it is measured with (resolves with the face
 *  usable, or not: the measure is taken either way) */
export async function warmFaces(to, cjk, designs, yieldNow, ready = async () => {}) {
  const sts = [{ bold: false, italic: false }, { bold: true, italic: false }, { bold: false, italic: true }].map(x => ({ fam: 'serif', caps: false, design: designs.serif, ...x }))
  for (const st of sts) for (const cls of cjk ? ['cjk', 'latin'] : ['latin']) {
    const face = faceOf(st, cls, to), text = cls === 'cjk' ? '\u6C38' : 'a'
    await ready(face, text)
    w100(text, face)
    await yieldNow()
  }
}

// ---- the unit's blocks, with the original's baselines

/**
 * blocksOf's blocks, each with its lines' measured baselines (B), sizes, pitch and the free space below it. A block that
 * holds a forced break of TeX's inside its frame (`joinAt`, finishUnit's: the line after it, its frame's pitch) has its
 * grid `G`: B with each such gap closed to that pitch, TeX's room and any opening its rule set for a tall next line with
 * it (which the drawing's own rule opens again where its line is tall: breakLines settle), the lines after it moved up by
 * the rest, its foot (B's last) kept. The drawing leaves the room after the line the break ends
 * wherever its translation sets it (breakLines), so that on the original's own pitch a break the translation sets where
 * TeX did puts the line after it on TeX's own, and the room the translation does not use of the block is at its foot.
 * The block's pitch is its grid's.
 */
export function blocks2(rects, pageViews, keep, lineInfo, regionOf = null, referenced = null, lineskip = null, breakAt = null, joinAt = null, centred = undefined) {
  const blocks = blocksOf2(rects, pageViews, keep, regionOf, referenced, breakAt, joinAt, centred)
  const info = r => lineInfo.get(rectKey(r)) ?? lineInfo.get(`${r[0]}|${r[2]}|${r[3]}|${r[4]}`)
  for (const b of blocks) {
    b.B = b.rects.map(r => info(r)?.baseline ?? r[2] + 0.24 * (r[4] - r[2]))
    b.exact = b.rects.map(r => !!info(r)?.exact)
    b.sizes = b.rects.map(r => info(r)?.size ?? (r[4] - r[2]) / 0.894)
    if (joinAt?.size && b.rects.some((r, i) => i > 0 && joinAt.has(rectKey(r)))) {
      let up = 0
      b.G = b.B.map((y, i) => {
        const pitch = i > 0 ? joinAt.get(rectKey(b.rects[i])) : undefined
        if (pitch !== undefined) up += Math.max(0, b.B[i - 1] - y - pitch)
        return y + up
      })
    }
    const G = b.G ?? b.B
    const d = G.slice(1).map((y, i) => G[i] - y).filter(v => v > 0)
    b.pitch0 = d.length ? median(d) : null
    // (a layout file's baselines, `file`, are written to a hundredth: an evenly set block's pitch is its gaps' mean, which
    // the rounding does not move, where their median may be off by a few thousandths and its lines' slots so a line off
    // the last baseline at 1.3 times it: 1512.03385's unit 59)
    if (d.length > 1 && b.rects.every(r => info(r)?.file) && d.every(v => Math.abs(v - b.pitch0) <= 0.02)) b.pitch0 = d.reduce((a, v) => a + v, 0) / d.length
    // (the block's grid with one pitch inside it, `E`, which slotsAt lays on at the original's leading where P.evenPitch: each gap
    // wider than the pitch that TeX's \lineskip rule set closed to it, evenGridOf. The rule's gap is no wider than the two lines'
    // boxes and \lineskip, the test `through` below makes between two blocks; a wider one holds something else (a line of the
    // unit's another block stands in it, a \vadjust, a float) and keeps its room. Made here, once a block; a block with no such
    // gap has none, nor has any where the file tells no \lineskip)
    if (lineskip && b.pitch0 !== null) {
      const opened = G.slice(1).map((y, i) => G[i] - y > b.pitch0 && tightOf(info(b.rects[i]), info(b.rects[i + 1]), G[i] - y, lineskip))
      if (opened.includes(true)) b.E = evenGridOf(G, opened, b.pitch0)
    }
    b.free = 0
  }
  // (TeX's lines, a layout file's: the blocks that continue each other in the file are one flow, breakLines. The next block
  // continues the last one's line where the file's lines between them, none or more, are all this unit's own (a script's
  // row the text beside it holds, a held run: lines of the unit that are no block's) and in one frame, the file's (a line
  // with no frame is in none), and no kept region the text passes lies between (`after`). `j` is the unit's own row in the
  // file, so another unit's lines never show in it: a gap in `j` is a row of this unit that no rectangle holds, a break; a
  // line of the page that is not this unit's is no row of it, and what keeps a line from running on past it is `through`
  // below, not the flow)
  const mine = new Set(rects.map(r => info(r)?.j).filter(Number.isInteger))
  const where = r => rects.findIndex(q => q[0] === r[0] && q[2] === r[2] && q[3] === r[3] && q[4] === r[4])
  let flow = 0
  for (const [i, b] of blocks.entries()) {
    const a = blocks[i - 1]
    const from = info(b.rects[0]), to = info(a?.rects.at(-1) ?? b.rects[0])
    let next = !!a && !!from?.file && !!to?.file && Number.isInteger(from.j) && Number.isInteger(to.j) && to.j < from.j && Number.isInteger(from.frame) && to.frame === from.frame && (a.after ?? 0) === (b.after ?? 0)
    if (next) for (let j = to.j + 1; j < from.j; j++) if (!mine.has(j)) { next = false; break }
    b.flow = next ? a.flow : flow++
    // (the room between two blocks of one flow is the paragraph's own, TeX's: where v0 split it at a gap TeX opened for a
    // tall line, a line of the block above that TeX's rule moves down may go on into it (`through`, slotsAt's foot). Two
    // things say the gap is TeX's paragraph room and holds nothing else. No line of the unit that it keeps lies lower than
    // the block's last line between them (a script's row inside that line is no matter; a held line in the gap is one).
    // And the gap is no wider than the glue TeX sets between two consecutive lines of a tall one's opening: where
    // \baselineskip would leave them nearer than \lineskiplimit, the last line's depth, the next line's height and
    // \lineskip apart (their boxes the file's own). Ink in a wider gap that is no line of the file (a float without a
    // caption inside the paragraph, a \vadjust rule) is not TeX's room, and the line stays above it. The box values are
    // written to a hundredth (±0.005 each): a gap that is exactly that sum is within 0.025 of it.
    // 1810.04805's page 6, unit 81: 9.64 + 7.45 + 1 = 18.09 for a gap of 18.02)
    if (next) {
      const last = a.rects.at(-1), ia = where(last), ib = where(b.rects[0])
      const tight = !!lineskip && tightOf(to, from, to.baseline - from.baseline, lineskip)
      a.through = tight && ia >= 0 && ib > ia && rects.slice(ia + 1, ib).every(r => r[2] >= last[2])
    }
  }
  return blocks
}

/** whether TeX's \lineskip rule set two consecutive lines of the file (`upper`, `lower`: their lineInfo, baseline, top and
 *  bottom) `gap` apart: no wider than the upper's depth, the lower's height and \lineskip, the file's hundredths within 0.025
 *  (±0.005 each of five values) */
function tightOf(upper, lower, gap, lineskip) {
  return [upper?.baseline, upper?.bottom, lower?.baseline, lower?.top].every(Number.isFinite)
    && gap <= (upper.baseline - upper.bottom) + (lower.top - lower.baseline) + lineskip[0] + 0.025
}

/**
 * Each block's displays TeX set with its short skip (tex.mjs shortSkipsOf, its `shortSkips`, slotsAt's): those set under a
 * line of the block's own (`line`, the layout file's line of the unit, lineInfo's `j`), none another block's line stands
 * over (a line of the other column beside the display, short of it, makes no short skip of the display's own column's
 * line). Mutates the blocks
 */
export function shortSkipsTo(blocks, skips, lineInfo) {
  if (!skips.length) return
  const info = r => lineInfo?.get(rectKey(r)) ?? lineInfo?.get(`${r[0]}|${r[2]}|${r[3]}|${r[4]}`)
  for (const b of blocks) {
    const own = new Set(b.rects.map(r => info(r)?.j).filter(Number.isInteger))
    const mine = skips.filter(d => own.has(d.line))
    if (mine.length) b.shortSkips = mine
  }
}

/** whether two laid lines or slots are one flow of TeX's lines (blocks2: blocks of one unit that follow each other in the
 *  layout file with only the unit's own lines between, in one frame, and no kept region the text passes; every other block
 *  a flow of its own) */
const inFlow = (a, b) => a.flow === b.flow

/** a solid-set original's pitch, × its size: TeX's \baselineskip is 1.2 × the size at 10 and 12 pt, 1.24 at 11 pt */
export const SOLID = 1.25
/**
 * The unit's leading (step 3), relative to the original's own pitch: the script's leading (leadBase, 1.3 in Chinese) is
 * of a solid-set original's line, so the translation's pitch is leadBase × SOLID × its size, but never closer than the
 * original's own pitch. Where the original is set solid that is leadBase, as before; where it is looser already, the
 * leading is not stacked on it (2307.16209, set one and a half: Chinese at 1.3 × its 1.5-spaced lines stood 1.95 em
 * apart and between them, a quarter of its text area blank that its own lines would have covered). The original's
 * pitch: its blocks' own (pitch0), the median of those that have one; none, leadBase. 1 where leadBase is. `leadRel`
 * false (a parameter): leadBase stacked on the original's pitch, as before step 3.
 */
export function leadOf(blocks, s, P) {
  // (P.leadRel false, run.mjs's default since the maintainer's ruling of 2026-10-07: leadBase on whatever pitch)
  if (P.leadRel === false || !(P.leadBase > 1) || !(s > 0)) return P.leadBase
  const pitches = blocks.map(b => b.pitch0).filter(v => v > 0).sort((a, b) => a - b)
  if (!pitches.length) return P.leadBase
  const p0 = pitches[pitches.length >> 1]
  return Math.min(P.leadBase, Math.max(1, Math.round((1000 * P.leadBase * SOLID * s) / p0) / 1000))
}

// ---- the white space below: an ink map of the original page

/** the original page's ink at a quarter of its canvas's resolution: one readback of a small canvas */
export function inkMapOf(canvas, factor = 4) {
  const w = Math.ceil(canvas.width / factor), h = Math.ceil(canvas.height / factor)
  const c = new OffscreenCanvas(w, h)
  const x = c.getContext('2d', { willReadFrequently: true })
  // (averaged over each cell: the default filter samples a few of its pixels and loses a rule a device pixel wide, a
  // table's column rule at 0.4 pt, which a slot widened over the paper then ran over: 1512.03385's Table 2)
  x.imageSmoothingQuality = 'high'
  x.drawImage(canvas, 0, 0, w, h)
  const d = x.getImageData(0, 0, w, h).data
  const ink = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) ink[i] = d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2] < 690 ? 1 : 0
  return { w, h, ink, factor }
}
/** the distance (PDF units) from yStart down to the first ink in [x0, x1], or to yLimit; `toDev` maps PDF to the
 *  canvas's device pixels, `k` device pixels per PDF unit */
export function freeBelow(map, toDev, k, x0, x1, yStart, yLimit) {
  if (!map || yLimit >= yStart) return 0
  const [ax, ay] = toDev(x0, yStart), [bx, by] = toDev(x1, yLimit)
  const f = map.factor
  const c0 = Math.max(0, Math.floor(Math.min(ax, bx) / f)), c1 = Math.min(map.w - 1, Math.ceil(Math.max(ax, bx) / f))
  const r0 = Math.max(0, Math.ceil(Math.min(ay, by) / f)), r1 = Math.min(map.h - 1, Math.floor(Math.max(ay, by) / f))
  for (let r = r0; r <= r1; r++) {
    let lit = 0
    for (let c = c0; c <= c1; c++) lit += map.ink[r * map.w + c]
    if (lit > 0) return Math.max(0, (r * f - Math.min(ay, by)) / k)
  }
  return yStart - yLimit
}

// ---- line breaking

const hyphenData = new Map()
export const setHyphenData = (lang, data) => hyphenData.set(lang, data)

/** a block's foot at a state: the lowest baseline a line of it is laid at, its last less what it borrows */
const lowOf = (b, st, s) => b.B.at(-1) - Math.min(b.free, st.borrow * (b.pitch0 ?? 1.2 * s))
/**
 * The gap under a paragraph never tighter than its lines (the half-leading round, 2026-10-17, its second form): the lowest
 * baseline a unit's last line may take at a state, where the next line of its column in the original keeps its own baseline
 * (P.halfLead.below: the original's room from the unit's last baseline down to that line; run.mjs edgesOf). A paragraph's
 * first line stays on the original's first baseline, as TeX set it, whatever is over it (a heading, a figure, a skip, the
 * page's head): a first line moved under it by half the leading drifted from the original by (L - 1) / 2 of a pitch on 56 %
 * of the paragraph starts in CJK, 70 % of them with a leading's room over them already (the maintainer's question). So the
 * room a gap lacks is the paragraph's above it: where the next line would stand nearer its last line than a leading, L p0, of
 * either paragraph (its own, `lead`, or the next one's, `next`, the page fill's: run.mjs fillPage) and the original's own
 * skip there past its pitch, it ends higher by the deficit, its last baseline no lower than that line's plus L p0 of the
 * larger and the skip, its fill spread over a shorter height
 * (the page fill's states, `box`: slotsAt stops its last frame's slots there, so that the lines a frame holds still fall with
 * the leading and the fill's search is monotone). Where the original leaves that much or more (a heading's room, nothing under
 * it in its column) nothing changes. Null where nothing is asked: at the original's pitch or
 * closer (the alphabets: nothing moves), a last line it shares with ink that stays (`foot` false: a unit begins on it), a
 * last frame of one line (no room to give), no line under it
 */
function footFloorAt(blocks, st, P, s) {
  const e = P.halfLead, L = Math.max(st.lead, st.next ?? 0)
  if (!e?.foot || !(L > 1 + 1e-9) || !blocks.length || !Number.isFinite(e.below)) return null
  const bl = blocks.at(-1), low = lowOf(bl, st, s)
  if (!(bl.B[0] - low > 0.05)) return null
  // (and the original's own skip at that boundary, its room past its pitch, capped at a pitch as the gate's measure caps
  // it, measure.mjs paraGapsOf: a NeurIPS \parskip of 5.5 pt under 11 is kept over the leading, where without it a gap of a
  // pitch and a skip equalled a leading of 1.5 and the paragraphs ran together)
  const p0 = bl.pitch0 ?? 1.2 * s, skip = Math.min(Math.max(0, e.below - p0), p0)
  const floor = bl.B.at(-1) - e.below + L * p0 + skip
  return floor > low + 1e-9 ? floor : null
}

/** footFloorAt for the page fill's guesses of a closer leading (run.mjs guessCloser): the floor a state asks, or null */
export const footFloorOf = (blocks, st, P, s) => footFloorAt(blocks, st, P, s)

/** of a line's size: a display whose top stands under its baseline nearer than this is in reach of its descent (TeX's
 *  \abovedisplayshortskip, nothing but stretch, sets one that near; its \abovedisplayskip does not) */
export const SHORT_SKIP = 0.3
/** of a line's size: how far before a display TeX's short skip asks the line over it to end (\predisplaysize, the line's
 *  width and 2 em) */
export const PREDISPLAY = 2

/**
 * A block's grid at the original's leading with one pitch inside it (P.evenPitch, lane B's B1, the maintainer's ruling of
 * 2026-10-29): each gap of the grid `G` TeX's \lineskip rule opened under a tall line of the original (`opened`, blocks2's)
 * closed to the block's own pitch `p0` (pitch0: \baselineskip, the median of its gaps), where the grid on the original's baselines carries
 * it to whatever line of the translation stands there (the block-level audit's finding 1: 32 of 520 multi-line body units at
 * leading 1 a point or more off their median pitch, up to 6.7 pt). Every other gap is the original's, its hundredths and all,
 * and so is a gap that holds something else (a line of the unit's another block, a \vadjust: wider than the rule sets).
 * The first line stays on the original's first baseline (the paragraph's start never moves, B′), every line under a closed
 * gap moves up by it, and none stands lower than the original's own (the grid's forced breaks' gaps closed, `G`). The
 * translation's own tall lines are opened by TeX's rule (breakLines' settle), and what the closed gaps free stays at the
 * block's foot
 */
export function evenGridOf(G, opened, p0) {
  const out = [G[0]]
  for (let k = 1; k < G.length; k++) { const gap = G[k - 1] - G[k]; out.push(out[k - 1] - (opened[k - 1] && gap > p0 ? p0 : gap)) }
  return out
}
/** how near a formula's baseline is to a line's of the file for it to stand on that line (PDF units): both are written to a
 *  hundredth */
const ON_LINE = 0.05

/**
 * The distance TeX set between the line of the original a formula `r` (a crop) stands on and the line after it (`below`, the
 * crop on the upper line of a pair) or before it, on the unit's grid (its blocks' `G`, the forced breaks' room closed): TeX's
 * own \lineskip rule for that formula, read from its baselines (breakLines' settle). The line is the one the formula stands
 * on: on the crop's page and baseline, its rectangle holding the crop's centre, never a line of another block merely across
 * it (a unit's two blocks side by side have lines at one baseline each, and a block's span is its widest line's: the review
 * of #496), nor the other half of a line its rectangles cut in two. -Infinity where the unit's blocks hold no line of the
 * original under the crop, or none past it on that side
 */
export function texRoomOf(blocks, r, below) {
  const cx = (r.crop[0] + r.crop[2]) / 2
  for (const b of blocks ?? []) {
    if (b.page !== r.page) continue
    const j = b.B.findIndex((y, i) => Math.abs(y - r.baseline) <= ON_LINE && b.rects[i][1] <= cx && cx <= b.rects[i][3])
    if (j < 0) continue
    const G = b.G ?? b.B, k = below ? j + 1 : j - 1
    return k >= 0 && k < G.length ? Math.abs(G[j] - G[k]) : -Infinity
  }
  return -Infinity
}

/** the slots (lines) a unit's blocks hold at a state: each { block, page, x0, x1, baseline, target, centred }. The pitch is
 *  the original's times the leading, whatever the size (D6's F6a, 2026-10-08: a Latin line shrunk with its size sat on none
 *  of the original's baselines and its unit ended a fraction of a line short, the blank added to the gap below it; every
 *  script's lines now stay on the original's baselines while the size shrinks, as CJK's did) */
function slotsAt(blocks, st, P, s) {
  const out = []
  // (each block's foot, the lowest a line of it is laid at: its last baseline less what it borrows; a line TeX's rule moves
  // down may go on past it into the next block of its flow where blocks2 found nothing kept between them, `through`, to
  // the foot of the last block it so runs into, `foot`; the page fill's states (`box`) the unit's last frame's no lower than
  // a leading over the next line of its column, footFloorAt)
  const lows = blocks.map(b => lowOf(b, st, s))
  const floor = st.box ? footFloorAt(blocks, st, P, s) : null
  if (floor !== null) lows[lows.length - 1] = floor
  const feet = lows.slice()
  for (let bi = blocks.length - 2; bi >= 0; bi--) if (blocks[bi].through) feet[bi] = feet[bi + 1]
  // (a run's blocks are laid alone, layoutRuns: the unit's first line is the first block's of the unit, P.blockBase the run's
  // first block's place in it)
  const base = P.blockBase ?? 0
  for (const [bi, b] of blocks.entries()) {
    const p0 = b.pitch0 ?? 1.2 * s
    const pitch = p0 * st.lead
    const onGrid = Math.abs(st.lead - 1) < 1e-6
    const low = lows[bi]
    const firstBlock = bi + base === 0
    // (on the original's pitch, its grid: its forced breaks' gaps closed, blocks2, the foot B's own; with evenPitch, its
    // gaps TeX's \lineskip rule opened closed to the pitch, blocks2's `E`)
    const G = onGrid && P.evenPitch && b.E ? b.E : b.G ?? b.B
    for (let k = 0; k < 400; k++) {
      // (the first line on a shared row stands on the baseline the line before it there was laid at, `startY`, where that is
      // not TeX's (run.mjs layout2, shareOf's `at`): the row's line, its measure the row's, whatever the block's foot)
      const shared = firstBlock && k === 0 && b.startY !== undefined
      let y = shared ? b.startY : onGrid ? (k < G.length ? G[k] : G.at(-1) - (k - G.length + 1) * pitch) : b.B[0] - k * pitch
      // never two lines closer than 0.7 of the pitch (a baseline the text layer could not tell)
      if (out.length && out.at(-1).block === bi && y > out.at(-1).baseline - 0.7 * pitch) y = out.at(-1).baseline - pitch
      if (y < low - 0.05 && !shared) break
      const target = k === 0 || (onGrid && k < b.B.length) ? k : null
      // (each slot the measure of the line it is laid at, where the paragraph's changed: measuresOf; the block's grid, its
      // pitch and its flow its own across the change, one paragraph's)
      const [mx0, mx1] = b.measures && !b.centred ? measureAt(b, y, (onGrid || shared) && k < G.length ? k : -1) : [b.x0, b.x1]
      // (the first line's start: the block's indent, or where a shared line leaves it, `start`, run.mjs layout2)
      const x0 = firstBlock && k === 0 && b.start !== undefined ? b.start : firstBlock && k === 0 && !b.centred ? b.x0 + b.indent : mx0
      // (a line laid over a display TeX set with its short skip, `shortSkips` (tex.mjs shortSkipsOf: under a line of the unit
      // that ends 2 em before it), whose top stands under its baseline in reach of its descent: it ends 2 em before the display,
      // as TeX's own test asks of the line before a display set so, and what no longer fits is the fit's. 2608.16117 page 23,
      // unit 76: German's last line ran on over the matrix TeX set 1.1 pt under its short line)
      const em = s * st.scale
      let x1 = mx1
      for (const d of b.shortSkips ?? []) if (d.top < y && d.top > y - SHORT_SKIP * em && Math.min(x1, d.x1) > Math.max(x0, d.x0)) x1 = Math.min(x1, d.x0 - PREDISPLAY * em)
      // a sliver beside a formula (narrower than 1.5 em) holds no text: its words were the formula's
      if (x1 - x0 < 1.5 * s * st.scale) continue
      const slot = { block: bi, page: b.page, x0, x1, baseline: y, target, centred: b.centred, pitch, after: b.after ?? 0, foot: feet[bi], flow: b.flow ?? bi }
      // (a unit TeX set flush left or flush right, run.mjs: placeItems sets its lines by it)
      if (b.flush) slot.flush = b.flush
      out.push(slot)
    }
    // (a line on a shared row whose rest stays another's, `stop` (run.mjs keptAfter): of the block's slots within an em of its
    // baseline, the nearest ends where TeX ended the unit's text there; one that leaves too narrow for text gives way, as a
    // sliver does, and the next nearest takes the stop. One slot alone: on rows closer than an em, the row before the shared
    // one is no line of it; and where the row is the block's foot, with no slot on it, the slot nearest it may stand over its
    // baseline by more than half a pitch, within an em, its text over what stays there)
    if (b.stop) {
      const d = sl => Math.abs(sl.baseline - b.stop.y)
      const near = out.filter(sl => sl.block === bi && d(sl) < b.stop.band).sort((p, q) => d(p) - d(q))
      for (const sl of near) {
        sl.x1 = Math.min(sl.x1, b.stop.x1)
        if (sl.x1 - sl.x0 >= 1.5 * s * st.scale) break
        out.splice(out.indexOf(sl), 1)
      }
    }
  }
  return out
}

/**
 * A crop's own extent over its baseline (`up`) and under it (`down`), PDF units at the original's scale: the segment's box
 * where the crop was cut from one (`gap.box`, the ink TeX set, cropOfBox), never the rectangle drawn, whose antialias
 * margin is the drawing's and no part of TeX's box. A crop with no segment (v0 alone, which opens no line and only
 * counts what it would have) takes its rectangle
 */
function cropExtent(r) {
  const b = r.gap?.box
  return b?.top !== undefined ? { up: b.top - b.baseline, down: b.baseline - b.bottom } : { up: r.crop[3] - r.baseline, down: r.baseline - r.crop[1] }
}

/**
 * A laid line's extent over its baseline (`a`) and under it (`d`), PDF units, at its drawn size `f` and the layout's
 * `scale`: its text's ink (ink100, the drawn glyphs' own; a superscript at 0.62 of the size raised 0.36 em, small capitals the
 * layer draws at their share, `sc`, as svgOfUnit sets them) and each crop's, over and under its TeX baseline, drawn at the scale
 * (cropOfBox). `text`: its text's alone
 */
export function lineExtent(line, f, scale) {
  let a = 0, d = 0, ta = 0, td = 0
  for (const it of line.items) {
    const t = it.t
    if (t.crop) { const e = cropExtent(t.crop); a = Math.max(a, e.up * scale); d = Math.max(d, e.down * scale); continue }
    if (!t.s || t.space || !t.face) continue
    const m = ink100(t.s, t.face), k = (t.sup ? 0.62 : 1) * (t.sc ?? 1), up = t.sup ? 0.36 * f : 0
    ta = Math.max(ta, up + (m.a * k * f) / 100)
    td = Math.max(td, (m.d * k * f) / 100 - up)
  }
  return { a: Math.max(a, ta), d: Math.max(d, td), text: { a: ta, d: td } }
}

/** the explicit glue after a token at size f (tokensOf2 kernOn's `kernW`, at 100 px), an advance its laid item holds apart from
 *  its width (`kern`) */
const kernOf = (t, f) => ((t.kernW ?? 0) * f) / 100

/** a token's own width at size f: no kern after it (tokensOf2 kernOn's `kernW`), which its item holds apart (kernOf) */
const tokW = (t, f, st, scale) => {
  if (t.crop) return t.cw * scale
  if (t.space) return (t.w100 * f) / 100
  let w = (t.w100 * f) / 100
  if (t.cls === 'cjk') w += st.track * f * [...t.s].length
  else if (st.trackLatin) w += st.trackLatin * f * [...t.s].length
  return w
}

/**
 * The most a CJK line closes each gap between its items to take one more group (breakLines' squeeze), in em: TeX's CJKglue
 * between two CJK characters has no shrink at all, so the squeeze is kept to the least that takes a group a line misses by a
 * little. 0.02 em is the study's (2026-10-23, the (j) rows of the release route's sweep): it took 264 of the sweep's 378
 * letter-spaced lines, with half of all justified CJK lines already within 0.02 em of their natural spacing
 */
const SQUEEZE = 0.02

/**
 * The stretch a gap past which a CJK line squeezes rather than stretch (breakLines' squeezeTakes), in em: below it the
 * stretch does not read as letter-spaced (87 % of the sweep's justified CJK lines are within 0.05 em of their natural
 * spacing), and the line is set as before; the squeeze is for the lines a group left letter-spaced
 */
const STRETCH_MIN = 0.05

/** the full-width marks whose blank half a squeeze may take: those whose ink stands in one half of the em in every CJK face
 *  the layer draws (the comma, the full stop, the enumeration comma, brackets and quotes); not the colon, the semicolon and
 *  the exclamation and question marks, which a Japanese face sets in the em's middle (Harano Aji's question mark reaches
 *  0.72 em: cut by half, it ran into the next character) */
const SQUEEZE_MARKS = /^[\u3001\u3002\uFF0C\uFF0E\uFF08\uFF09\u300C\u300D\u300E\u300F\u3010\u3011\u3014\u3015\u3008\u3009\u300A\u300B\u3018\u3019\u3016\u3017\u201C\u201D\u2018\u2019]$/

/** whether a line is set as Latin text, its slack in its word spaces (placeItems): it has spaces, and its script breaks only
 *  at spaces or fewer than half its items are CJK */
const latinishOf = (items, P) => items.some(it => it.t.space) && (P.keepAll || items.filter(it => it.t.cls === 'cjk').length < items.length / 2)

/** the marks of a line whose blank half a squeeze may take (placeItems): its full-width marks that have not lost one (`cut`),
 *  but the closing mark at its end where it hangs in the margin; none where the state compresses as far as the rules let it
 *  (compress 2: every mark has lost its half) or the rules compress none (compressMax 0) */
const squeezable = (items, hangs, compress, P) => (compress < P.compressMax ? items.filter((it, n) => it.t.punct && !it.cut && SQUEEZE_MARKS.test(it.t.s) && !(hangs && n === items.length - 1)) : [])

/**
 * Tokens into slots, greedily, at font size f: each line { ...slot, items: [{ t, w, shift }] } with the items' natural
 * widths (punctuation compressed as the state allows), the space a line may shrink, and `rest`, the first token left.
 * No line the breaker opens starts with a mark UAX 14 or the target's rules keep from a line's start (`barred`): such a
 * mark stays with the group before it, across a space too, unless that group with it is longer than a line by itself
 * (the break the glue alone allows), or a token cut by its characters would leave one at the head of its tail (the cut
 * moves back before it). A line TeX's own break opens (`newline`, `blockTo`) is tokensOf2's: its `dropped`.
 */
function breakLines(tokensIn, slotsIn, f, st, P, scale, strict = true, blocks = null) {
  work.breaks++
  // (step 3, 'flow': a kept region breaks the line and skips no slot: the text after a display may stand above it, where
  // the slots below it are too few for it and those above it too many; the last resort before the unit is not drawn)
  const flow = strict === 'flow'
  let tokens = tokensIn
  const slots = slotsIn.slice()
  const lines = []
  let li = 0, i = 0
  const half = 0.5 * f
  // (the marks no line opens with: a character UAX 14 keeps from a line's start, no-start.mjs, the one table the layer
  // gate's lineStartPunct reads too, or one the target's rules do, P.noStart: CJK's small kana and prolonged sound mark,
  // its closing quotes, the per cent sign; `barred`, a token that opens with one)
  const kinsoku = kinsokuOf(P.noStart ?? '', P.noEnd ?? '')
  const barredChar = ch => noStart(ch) || kinsoku.starts(ch)
  const barred = t => !t.space && typeof t.s === 'string' && t.s !== '' && barredChar(t.s)
  // (a word wider than its line cut by its characters, each a grapheme, what a reader sees as one character: a letter and the
  // marks over it, a flag's two regional indicators; never before a mark no line opens with, nor inside a pair UAX 14 keeps)
  const cutBarred = (chars, k) => barredChar(chars[k]) || keptPair(chars[k - 1], chars[k])
  let line = null
  // (`past`: how many of the unit's kept regions the text has passed before the line's first item, the walk's own count
  // (`consumed`, below): where the page's word table writes a region's kept lines, words.mjs, in the text's order whatever
  // slot the text after a display stands on)
  // (`slotOf`: each line's slot, which a line laid again from its first token opens on again: the page breaks' fallback, strand)
  const slotOf = new Map()
  const open = () => {
    line = { ...slots[li], items: [], x: 0, spaces: 0, from: i, past: consumed }
    lines.push(line)
    slotOf.set(line, slots[li])
  }
  // TeX's rule between two consecutive lines (its \lineskip and \lineskiplimit, P.lineskip, the paper's own: the layout
  // file's): where the line just closed comes nearer the line before it than lineskiplimit, its top to that line's foot
  // (lineExtent: the drawn text's ink and its crops'), the two baselines are set that line's depth and its height plus
  // lineskip apart. The later slots of its flow are pushed down with it, each only as far as it then comes within its
  // pitch of the slot above it (TeX's \baselineskip from the line set lower): a gap the grid holds wider than the pitch,
  // the room TeX opened in the original for a tall line of its own (a formula the translation sets on another line, the
  // gap v0 split a paragraph at), takes the push in, and the slots under it stay where they were. A slot pushed past its
  // foot (slotsAt: its block's, or its flow's through a gap of the paragraph's own) is dropped; the line itself pushed
  // past it fails the state (`over`, the first token of its line), as a unit too long for its lines does (1810.04805's
  // page 6, unit 81: the formula one line higher than in the original, the line under it opened into the room TeX had
  // opened under the formula, where v0's block ended). The line before is the last laid above it in its flow (inFlow):
  // its block; or, the blocks on TeX's lines (a layout file's), the block that follows it in the file, its first line next
  // to this one's last in the same frame with no kept region between, where v0 split a paragraph's lines in two (at a gap
  // TeX opened in the original). v0's own blocks (the anchors' rectangles of a unit the file does not locate whole, a
  // display's rows among them) are no flow: nothing says the line below is the next. A slot never moves up, nor does a
  // line: the rule only opens (a \lineskiplimit over \lineskip that would set two lines nearer is not applied). No values
  // (a file that has none, v0 alone): no line opens
  let over = null
  // (the later slots of a line's flow from slot `from` pushed down by `push`, `above` where the slot over them was: each
  // only as far as it then comes within its pitch of the slot above it; one pushed past its foot dropped, and the next
  // held to the one before it, not to the slot that is gone)
  const pushDown = (from, push, above, ref) => {
    for (let q = from; q < slots.length; q++) {
      const sl = slots[q]
      if (!inFlow(sl, ref) || !(sl.baseline < above)) continue
      const by = Math.max(0, push - Math.max(0, above - sl.baseline - sl.pitch))
      if (!(by > 0)) break
      if (sl.baseline - by < sl.foot - 0.05) { slots.splice(q, 1); q--; continue }
      slots[q] = { ...sl, baseline: sl.baseline - by }
      push = by
      above = sl.baseline
    }
  }
  const settle = () => {
    if (!P.lineskip || !line?.items.length || over !== null) return
    let k = lines.length - 2
    while (k >= 0 && !lines[k].items.length) k--
    const prev = lines[k]
    if (!prev || !inFlow(prev, line) || !(prev.baseline > line.baseline)) return
    const [skip, limit] = P.lineskip
    const e0 = lineExtent(prev, f, scale), e1 = lineExtent(line, f, scale)
    if (prev.baseline - e0.d - (line.baseline + e1.a) >= limit) return
    // (the ink stands in for TeX's boxes, which the translation's lines have none of; but where the pair holds a formula TeX set
    // in the original, TeX measured that formula's room itself: the distance TeX left between its line and the next (a crop on
    // the upper line) or the one before (on the lower), texRoomOf. Where that distance already keeps the two lines' ink
    // \lineskiplimit apart, TeX's rule holds at it, and the pair is set no farther apart than it: the ink of a radical or an
    // ascender passes its box by a few hundredths, and the rule on the ink opened 1706.03762's Spanish unit 33 by 2.35 under the
    // fraction TeX had opened 2.26 under, its last line past its foot, the unit a size smaller)
    let dist = e0.d + e1.a + skip, tex = -Infinity
    for (const it of prev.items) if (it.t.crop) tex = Math.max(tex, texRoomOf(blocks, it.t.crop, true))
    for (const it of line.items) if (it.t.crop) tex = Math.max(tex, texRoomOf(blocks, it.t.crop, false))
    if (tex - e0.d - e1.a >= limit) dist = Math.min(dist, tex)
    const shift = dist - (prev.baseline - line.baseline)
    // (a line opens; it never moves up. Where \lineskiplimit is over \lineskip, TeX sets a clearance between the two to
    // \lineskip, nearer than the slots, and every line after it nearer with it: that needs each later slot moved up,
    // which is not built. The line moved up alone spaced a paragraph unevenly, 10 and 14 apart where TeX sets 10, and a
    // \lineskiplimit of \maxdimen set every line touching the one above; so a negative shift is not applied)
    if (!(shift > 0)) return
    const was = line.baseline
    line.baseline -= shift
    line.opened = shift
    // (a block's last slot dropped, the next block's first is a pitch under the line set lower, not under the slot that is
    // gone)
    pushDown(li + 1, shift, was, line)
    if (line.baseline < line.foot - 0.05) { over = line.from; stop = true }
  }
  // iteration 3: the kept regions the text has passed (a break token each); the text may not run on into a block below
  // a region before its break (strict), or it reads before the formula it follows in the translation
  let consumed = 0, stop = false, spilled = false
  // (a slot over the last line laid, beside it in its column, is no line of the text's: a paragraph's lines go down. The
  // file's lines of a paragraph that sets a tall inline formula may come out of that order, its rows' lines after the line
  // under them: 2610.21026 page 8, unit 91, whose line laid at 694.1 after the one at 684.8 ran over the formula's crop.
  // Only a slot above it: a row the file splits from a line on its own baseline is that line's, 2610.21288 u5)
  const overLast = sl => {
    let k = lines.length - 1
    while (k >= 0 && !lines[k].items.length) k--
    const prev = lines[k]
    return !!prev && prev.page === sl.page && sl.baseline > prev.baseline + 0.05 && Math.min(prev.x1, sl.x1) > Math.max(prev.x0, sl.x0)
  }
  // (the frame breaks the lines hold (the pageBreak token, below: a page's or a column's), in the text's order: { pg, fr, at,
  // line, sent }, `fr` the frame it sends the text to (the unit's block it begins with, `blockBase` the run's first block's
  // place in the unit: a run laid alone), `pg` its page, `at` the token's index and `line` the line that holds it, `sent` once
  // the line after it opened in its frame. Two in one line: the first sends the next line, which then holds the second.
  // `immediate`: the breaks laid at their token (strand). `runFrom`: the index in `lines` of the current run's first line, the
  // line a display's break opened)
  const held = [], immediate = new Set()
  let runFrom = 0
  const base = P.blockBase ?? 0
  /** whether slot or line `sl` is in break `h`'s frame or past it */
  const reaches = (sl, h) => (h.fr !== null && h.fr !== undefined ? sl.block + base >= h.fr : sl.page >= h.pg)
  /** whether two lines stand in one frame: one page, one column */
  const oneFrame = (a, b) => a.page === b.page && Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0)
  /** break `h`'s frame's first slot past slot `from`, where the text may go on there (`past` the regions it has passed): none
   *  past a display not passed */
  const pageSlot = (h, from = li, past = consumed) => {
    let q = from + 1
    while (q < slots.length && !reaches(slots[q], h)) q++
    return q < slots.length && !((slots[q].after ?? 0) > past) ? slots[q] : null
  }
  /** the lines after line `was` hold the breaks `was` held and has not sent */
  const carry = was => { for (const h of held) if (h.line === was && !h.sent) h.line = line }
  /**
   * A held break whose frame got no text of its run: the run's text ended on the line that holds it, or on the line after it
   * that a forced break left empty (a display's break, the unit's end). That line is laid again from its first token on the
   * frame's first slot, whole, and the line before it ends the earlier frame, full; where no line of its run stands before it
   * in its frame (that frame would keep none of the run), it is laid again on its own slot with the break at its token, short
   * there (`immediate`); a break the line after the one that held it carried, which has no token on its line, is let go.
   * The one place a held break's fate is decided, in every lay of the unit (the fit's, the page fill's, a run's alone).
   * True where it laid a line again, the walk going on from its first token
   */
  const strand = () => {
    for (let k = 0; k < held.length; k++) {
      const h = held[k], at = lines.indexOf(h.line), L = h.line
      if (at < 0 || lines.slice(at + 1).some(l => l.items.length && reaches(l, h))) { held.splice(k--, 1); continue }
      let p = at - 1
      while (p >= runFrom && !lines[p].items.length) p--
      const first = p < runFrom || !oneFrame(lines[p], L)
      const own = slots.indexOf(slotOf.get(L))
      const to = own < 0 || (first && h.at < L.from) ? null : first ? slots[own] : pageSlot(h, own, L.past)
      if (!to) { held.splice(k--, 1); continue }
      // (the breaks whose token is before the line, carried to it or past it: held again by the line laid again; the rest are
      // reached again)
      const kept = held.filter(x => x !== h && !x.sent && x.at < L.from)
      held.length = 0
      lines.length = at
      i = L.from
      consumed = L.past
      if (first) immediate.add(h.at)
      li = slots.indexOf(to)
      open()
      for (const x of kept) held.push({ ...x, line, sent: false })
      return true
    }
    return false
  }
  const advance = () => {
    // (the line holds a page break: the next line opens on that page's first slot, where the text may still go on there)
    let k = -1, to = null
    while ((k = held.findIndex(h => h.line === line && !h.sent)) >= 0 && !(to = pageSlot(held[k]))) held.splice(k, 1)
    settle()
    if (stop) return
    if (to) {
      li = slots.indexOf(to)
      if (li < 0) { stop = true; return }
      const was = line
      held[k].sent = true
      open()
      carry(was)
      return
    }
    li++
    while (li < slots.length && overLast(slots[li])) li++
    if (li >= slots.length) return
    if ((slots[li].after ?? 0) > consumed) {
      if (strict === true) { stop = true; return }
      spilled = true
    }
    open()
  }
  // a group's widths, tokens `from` to `end` on the line in hand, with its punctuation compressed: at the line's start an
  // opening mark loses its blank half, two marks together lose the blank between them, and with compressMax 2 every mark
  // loses its blank half (a space the group holds before its barred mark, `sp`, as wide as the line's spaces and
  // shrinking as they do)
  const groupOf = (from, end) => {
    const items = []
    let w = 0, sp = 0
    let prev = line.items.at(-1)?.t ?? null
    for (let q = from; q < end; q++) {
      const t = tokens[q]
      if (t.space) { const tw = tokW(t, f, st, scale); items.push({ t, w: tw }); w += tw; sp += tw; prev = t; continue }
      let tw = tokW(t, f, st, scale), shift = 0
      if (t.punct && st.compress >= 2) {
        tw -= half
        if (t.punct === 'open') shift = -half
      } else if (t.punct && st.compress === 1) {
        if (prev?.punct === 'close') {
          // two marks together: the first loses its trailing blank half (the second keeps its own)
          const last = items.length ? items.at(-1) : line.items.at(-1)
          if (last && !last.cut) {
            last.w -= half
            last.cut = true
            if (items.length) w -= half
            else line.x -= half
          }
        } else if (t.punct === 'open' && (!prev || prev.punct)) {
          // an opening mark at the line's start, or after another mark: its leading blank half
          tw -= half
          shift = -half
        }
      }
      const asp = t.asp && (line.items.length || items.length) ? P.autospace * f : 0
      // (`kern`: the explicit glue after it, an advance of its own beside its width, which trim drops at a line's end: no part of
      // what it draws, a crop's image, a word's box)
      const kern = kernOf(t, f)
      // (`cut`: the mark has lost its blank half, which a squeezed line does not take from it again, placeItems)
      items.push({ t, w: tw, shift, asp, ...(kern ? { kern } : {}), ...(shift ? { cut: true } : {}) })
      w += tw + asp + kern
      prev = t
    }
    // a closing mark at the line's end hangs its blank half
    const hang = items.at(-1).t.punct === 'close' && st.compress < 2 ? half : 0
    return { items, w, sp, hang }
  }
  /** whether a group fits the line in hand: its spaces and the line's shrunk to spaceMin, a closing mark at its end hung */
  const fits = (g, cap) => line.x - line.spaces * (1 - P.spaceMin) - g.sp * (1 - P.spaceMin) + g.w - g.hang <= cap + 0.01
  // (a line's trailing spaces dropped, and the kern of its last token: glue TeX drops at a break, a kern the line no longer
  // needs)
  const trim = l => {
    while (l.items.at(-1)?.t.space) { const sp = l.items.pop(); l.x -= sp.w; l.spaces -= sp.w }
    const end = l.items.at(-1)
    if (end?.kern) { l.x -= end.kern; end.kern = 0 }
  }
  // A CJK line squeezed to take the group it misses (`squeezes`: Chinese and Japanese, the scripts that break between CJK
  // characters): light compression before stretching, as TeX takes the cheaper of the two breaks by their badness. The line
  // takes the group where the group overflows it by no more than the line can give, its marks' blank halves (the usual CJK
  // punctuation compression, where the state compresses less than the rules let it) and then SQUEEZE em a gap, its word
  // spaces at spaceMin as `fits` takes them; and only where the line would otherwise be letter-spaced, its stretch a gap
  // without the group (`stretchOf`) past STRETCH_MIN em, and the squeeze a gap less than that stretch. placeItems sets it
  // (`squeezed`). The gaps close no further than the tracking floor, trackMin: the squeeze and the unit's tracking together
  // never set two characters nearer than the fit's tightest state does. Never a centred line, nor one placeItems sets as
  // Latin text; nor at a tracking above the one the fit set the unit at (`fitTrack`, laidOut's), which only the page fill
  // sets (run.mjs fillPage: a unit short of its frame letter-spaced to fill it), whose lines the squeeze would take back
  const squeezes = !!P.cjk && !P.keepAll && !(st.track > (st.fitTrack ?? P.trackStart ?? 0) + 1e-9)
  const gapSqueeze = Math.max(0, Math.min(SQUEEZE, st.track - (P.trackMin ?? 0))) * f
  /** the stretch a gap the line in hand is justified by if it is closed here: its trailing spaces and its last kern dropped
   *  and its closing mark hung, as trim and placeItems leave it; Infinity where it has no gap */
  const stretchOf = cap => {
    let n = line.items.length, x = line.x
    while (n > 0 && line.items[n - 1].t.space) x -= line.items[--n].w
    if (n < 2) return Infinity
    const end = line.items[n - 1]
    const hang = end.t.punct === 'close' && !end.cut && st.compress < 2 ? half : 0
    return (cap - (x - (end.kern ?? 0)) + hang) / (n - 1)
  }
  /** whether the line in hand squeezes to take group g, which does not fit it */
  const squeezeTakes = (g, cap) => {
    if (!squeezes || line.centred || !line.items.length) return false
    const all = line.items.concat(g.items)
    if (latinishOf(all, P)) return false
    const need = line.x - (line.spaces + g.sp) * (1 - P.spaceMin) + g.w - g.hang - cap
    const gaps = all.length - 1
    const stretch = stretchOf(cap)
    return gaps > 0 && stretch > STRETCH_MIN * f && need <= squeezable(all, g.hang > 0, st.compress, P).length * half + gapSqueeze * gaps + 1e-9 && need / gaps < stretch
  }
  if (slots.length) open()
  // (the walk ends where the text does; a page break held on its last lines whose page got none of it is laid then, strand,
  // and the walk goes on from the line it lays again)
  for (;;) {
  while (i < tokens.length && li < slots.length && !stop) {
    // a forced break of TeX's inside a frame (tokensOf2's `newline`): the laid line ends there (a line it finds empty, the
    // text before it having filled the last, is no line of its own, as TeX's break at a full line's end sets none), and
    // TeX's room after it, in pitches (`room`), is left before the next line, the later slots of the ended line's flow
    // pushed down by it as TeX's rule pushes them (pushDown): the room is wherever the translation sets the break, and
    // what the unit does not use of its slots stays at its end. A next slot in another flow (the break at a frame's
    // foot) takes no room: TeX drops glue at a frame's head
    if (tokens[i].newline !== undefined) {
      const room = tokens[i].room ?? 0
      i++
      // (the line TeX's \\ ends, \hfil\break: ragged, placeItems)
      if (line.items.length) { trim(line); line.ends = true; advance() }
      if (stop || li >= slots.length || !(room > 0)) continue
      let k = lines.length - 2
      while (k >= 0 && !lines[k].items.length) k--
      const prev = lines[k]
      if (!prev || !inFlow(prev, slots[li])) continue
      pushDown(li, room * slots[li].pitch, prev.baseline, prev)
      // (the empty line opened on its slot before the room moved it: opened again where the slot now is, or on the next
      // where it was dropped)
      lines.pop()
      if (li >= slots.length) continue
      if ((slots[li].after ?? 0) > consumed) {
        if (strict === true) { stop = true; continue }
        spilled = true
      }
      open()
      continue
    }
    // a frame break of the paragraph's (withPageBreaks, pageCutsOf: a page's or a column's, `frame` the unit's block the frame
    // begins with): reached in an earlier frame, the line that holds it ends where the breaker ends it, and the text goes on on
    // the frame's first slot (`held`, advance): a paragraph over a page break leaves no short line before it, as TeX never does
    // (the owner, 2026-10-30: 1706.03762's Chinese §3.2.2 ended page 4 half a line short, the word for "output" split over
    // pages 4 and 5); reached at a line's start (or one `immediate`, strand's fallback), there. Where the run's text ends on
    // the line that holds it, so that its frame would get none, strand lays that line there whole. Reached in that frame or
    // later (the earlier one already full), or where that frame's first slot lies after a display the text has not passed
    // (the source sets the text before the display: the display's own break places it), nothing
    if (tokens[i].pageBreak !== undefined) {
      const h = { pg: tokens[i].pageBreak, fr: tokens[i].frame ?? null, at: i, sent: false }
      i++
      if (reaches(line, h)) continue
      const to = pageSlot(h)
      if (!to) continue
      if (line.items.length && !immediate.has(h.at)) { held.push({ ...h, line }); continue }
      if (line.items.length) trim(line)
      settle()
      if (stop) break
      li = slots.indexOf(to)
      if (li < 0) { stop = true; break }
      const was = line
      open()
      carry(was)
      continue
    }
    if (tokens[i].blockTo !== undefined) {
      const fresh = tokens[i].blockTo + 1 > consumed
      consumed = Math.max(consumed, tokens[i].blockTo + 1)
      if (!line.items.length) line.past = consumed
      if (flow) {
        // (a region passed once breaks the line once: its kept placeholders after it are no breaks)
        if (fresh && line.items.length) { trim(line); line.ends = true; advance() }
        if ((slots[li]?.after ?? 0) < consumed) spilled = true
        i++
        continue
      }
      if ((slots[li].after ?? 0) < consumed) {
        let q = li + 1
        while (q < slots.length && (slots[q].after ?? 0) < consumed) q++
        if (q < slots.length) {
          // (the slot by itself, not by its index: settle may drop slots of this line's flow above the display, before
          // it; the slot below the display is of another flow, which settle never moves)
          const to = slots[q]
          trim(line)
          // (the part of the paragraph before a display ends with TeX's \parfillskip: its last line ragged, placeItems; a page
          // break the run's lines hold whose page got none of its text is laid first: strand)
          if (held.length && strand()) continue
          line.ends = true
          settle()
          if (stop) break
          li = slots.indexOf(to)
          open()
          if (!tokens[i].brk) runFrom = lines.length - 1
        }
      }
      i++
      continue
    }
    const cap = line.x1 - line.x0
    // a token and those glued to it; a space is a group of its own (what is glued after it is the next group's: the
    // footnote marks iteration 1 lost were skipped here with the space before them)
    let j = i + 1
    if (!tokens[i].space) while (j < tokens.length && tokens[j].glue && !tokens[j].space) j++
    // (and a mark no line opens with, `barred`, joins the group before it, past the spaces between them too: a translation's
    // space before its comma or its bracket, a formula drawn as the page's characters with its spaces, a mark after a crop
    // that no rule glues. The line breaks before the group, never before the mark: kinsoku's push-out, the word or the
    // character before the mark going down with it. `own`: the group as its glue alone makes it, which a line it opens
    // takes where the joined group is longer than the line: the break the breaker always made there, nothing else fitting)
    const own = j
    if (!tokens[i].space) for (;;) {
      let q = j
      while (q < tokens.length && tokens[q].space) q++
      if (q >= tokens.length || !barred(tokens[q])) break
      j = q + 1
      while (j < tokens.length && tokens[j].glue && !tokens[j].space) j++
    }
    const t0 = tokens[i]
    if (t0.space) {
      if (line.items.length) {
        const w = tokW(t0, f, st, scale)
        line.items.push({ t: t0, w })
        line.x += w
        line.spaces += w
      }
      i = j
      continue
    }
    const shrink = line.spaces * (1 - P.spaceMin)
    let g = groupOf(i, j)
    if (j > own && !line.items.length && !fits(g, cap)) { j = own; g = groupOf(i, j) }
    const { items, w } = g
    if (fits(g, cap)) {
      for (const it of items) { line.items.push(it); if (it.t.space) line.spaces += it.w }
      line.x += w
      i = j
      continue
    }
    if (!line.items.length) {
      // nothing on the line yet, and the group is longer than it: cut by characters (a URL, a long formula word)
      if (tokens[i + 1]?.cont) {
        // (a word of small capitals the layer draws, cut into runs of one case, `cont`: as many of its characters as the line
        // holds, across its runs, as a word of one token is cut below; never its first run alone on a line of its own)
        let m = i + 1
        while (m < tokens.length && tokens[m].cont) m++
        let q = i, used = 0
        for (; q < m; q++) {
          const tw = tokW(tokens[q], f, st, scale)
          if (used + tw > cap) break
          line.items.push({ t: tokens[q], w: tw, shift: 0, asp: 0 })
          used += tw
        }
        if (q === m) {
          // (the word whole on the line: what is glued after it goes on, as the group's first token alone does below)
          if (tokens[m]) tokens = [...tokens.slice(0, m), { ...tokens[m], glue: false }, ...tokens.slice(m + 1)]
        } else {
          const t = tokens[q], chars = graphemesOf(t.s)
          const per = chars.map(c => (w100(c, t.face) * (t.sc ?? 1) * f) / 100)
          let k = 0, head = 0
          while (k < chars.length && used + head + per[k] <= cap) head += per[k++]
          if (q === i) { k = Math.max(1, k); head = per.slice(0, k).reduce((a, b) => a + b, 0) }
          while (k > 1 && k < chars.length && cutBarred(chars, k)) { k--; head -= per[k] }
          if (k > 0) {
            line.items.push({ t: headOfCut(t, { s: chars.slice(0, k).join('') }), w: head, shift: 0, asp: 0 })
            used += head
            const tail = chars.slice(k).join('')
            tokens = [...tokens.slice(0, q), { ...t, s: tail, w100: w100(tail, t.face) * (t.sc ?? 1), glue: false, cont: false, asp: false }, ...tokens.slice(q + 1)]
          } else tokens = [...tokens.slice(0, q), { ...t, glue: false, cont: false }, ...tokens.slice(q + 1)]
        }
        line.x += used
        i = q
      } else if (t0.s && graphemesOf(t0.s).length > 1 && tokW(t0, f, st, scale) > cap) {
        const chars = graphemesOf(t0.s)
        let k = 0, used = 0
        const per = chars.map(c => (w100(c, t0.face) * (t0.sc ?? 1) * f) / 100)
        while (k < chars.length && used + per[k] <= cap) used += per[k++]
        k = Math.max(1, k)
        // (the part left never opens with a mark no line starts with, nor parts a pair UAX 14 keeps: the cut moves back before it)
        while (k > 1 && k < chars.length && cutBarred(chars, k)) k--
        line.items.push({ t: headOfCut(t0, { s: chars.slice(0, k).join('') }), w: per.slice(0, k).reduce((a, b) => a + b, 0), shift: 0, asp: 0 })
        const tail = chars.slice(k).join('')
        tokens = [...tokens.slice(0, i), { ...t0, s: tail, w100: w100(tail, t0.face) * (t0.sc ?? 1), glue: false, asp: false }, ...tokens.slice(i + 1)]
      } else {
        // the group's first token alone (the rest goes on): a glued group never runs past the line
        line.items.push(items[0])
        line.x += items[0].w + (items[0].asp ?? 0)
        if (tokens[i + 1]) tokens = [...tokens.slice(0, i + 1), { ...tokens[i + 1], glue: false }, ...tokens.slice(i + 2)]
        i++
      }
      advance()
      continue
    }
    // a CJK line squeezed to take the group (squeezeTakes)
    if (squeezeTakes(g, cap)) {
      for (const it of items) { line.items.push(it); if (it.t.space) line.spaces += it.w }
      line.x += w
      line.squeezed = true
      i = j
      continue
    }
    // a word hyphenated: the most of it that fits, with its hyphen
    if (P.hyphen && t0.hyph && t0.s) {
      const word = t0.s
      const pts = breakPoints(word.replace(/[^A-Za-zÀ-ɏЀ-ӿ]+$/, ''), t0.hyph, hyphenData.get(t0.hyph), P.hyphenation[t0.hyph])
      const asp = items[0].asp
      const room = cap + shrink - line.x - asp
      let cut = null
      for (let q = pts.length - 1; q >= 0; q--) {
        const head = `${word.slice(0, pts[q])}-`
        const hw = (w100(head, t0.face) * f) / 100 + (st.trackLatin ? st.trackLatin * f * head.length : 0)
        if (hw <= room + 0.01) { cut = { head, hw, at: pts[q] }; break }
      }
      if (cut) {
        line.items.push({ t: headOfCut(t0, { s: cut.head, hyphenated: true }), w: cut.hw, shift: 0, asp })
        line.x += cut.hw + asp
        const tail = word.slice(cut.at)
        tokens = [...tokens.slice(0, i), { ...t0, s: tail, w100: w100(tail, t0.face) * (t0.sc ?? 1), glue: false, asp: false }, ...tokens.slice(i + 1)]
      }
    }
    // the line is closed: its trailing spaces dropped
    trim(line)
    advance()
  }
  let end = i
  while (end < tokens.length && textless(tokens[end])) end++
  if (stop || end < tokens.length || !held.length || !strand()) break
  }
  for (const l of lines) trim(l)
  // (the last line, settled as the others were when they closed)
  if (!stop) settle()
  // break tokens left at the end place nothing
  while (i < tokens.length && (tokens[i].blockTo !== undefined || tokens[i].newline !== undefined || tokens[i].pageBreak !== undefined)) i++
  return { lines: lines.filter(l => l.items.length), rest: over ?? i, total: tokens.length, tokens, spilled }
}

// ---- a unit over a frame break (E3c, 2026-10-20; by height, 2026-10-30): each frame holds its share of the paragraph

/**
 * Where the fit's lay of a unit (`lines`, breakLines' at the fit's state, each with its first token `from` and its block)
 * breaks for each later frame: a paragraph's lines go over its frames as its region does, by height. A frame is a column of a
 * page (the unit's consecutive blocks of one run on one page whose columns meet), so a column break is one as a page break
 * is. Each run of the unit (its blocks of one `after`: the text between two displays, set on its own slots) whose source
 * lines (originalLines: a line its rectangles cut in two one) stand in more than one frame is cut before each later frame at
 * the line end of its laid lines nearest that frame's share of the run's height, k of its n lines in the frames before it,
 * k = n × the source's lines before that frame over all of them (half up: the earlier frame the fuller, as TeX fills a
 * column), one line at least on each side. Only a line that opens at a token's start is a place to cut: one a long token's
 * cut opens (a URL cut by its characters, a hyphenated word's tail) begins inside the token the line before ends in. No
 * sentence, no word of the alignment (the owner, 2026-10-30: blocks keep their place, sentences need not, the frame changes at
 * a natural line end). A run laid in one line is cut in it, at the share of its tokens, the one short line a break leaves.
 * Only where the fit sets that line in an earlier frame (its frame before holds more than its share): else the fit's own
 * flow keeps it. Returns [{ page, frame, at }], `frame` the unit's block the frame begins with, `at` the token its text
 * begins with, rising
 */
export function pageCutsOf(lines, blocks, tokens, P) {
  const frames = []
  blocks.forEach((b, bi) => {
    const f = frames.at(-1), after = b.after ?? 0
    if (f && f.after === after && f.page === b.page && Math.min(f.x1, b.x1) > Math.max(f.x0, b.x0)) {
      f.lines += originalLines(b)
      f.x0 = Math.min(f.x0, b.x0)
      f.x1 = Math.max(f.x1, b.x1)
    } else frames.push({ after, page: b.page, x0: b.x0, x1: b.x1, first: bi, lines: originalLines(b) })
  })
  const kinsoku = kinsokuOf(P.noStart ?? '', P.noEnd ?? '')
  const opens = t => !textless(t) && !t.glue && !(typeof t.s === 'string' && t.s !== '' && (noStart(t.s) || kinsoku.starts(t.s)))
  const out = []
  for (const after of new Set(frames.map(f => f.after))) {
    const fs = frames.filter(f => f.after === after), total = fs.reduce((a, f) => a + f.lines, 0)
    if (fs.length < 2 || !(total > 0)) continue
    const rl = lines.filter(l => (blocks[l.block]?.after ?? 0) === after)
    if (!rl.length) continue
    // (one line: its tokens that set text, each frame's cut at its share of them, past the first, on one a line may open with)
    const l0 = rl[0], ix = []
    if (rl.length === 1) for (let i = l0.from, end = lines[lines.indexOf(l0) + 1]?.from ?? tokens.length; i < end; i++) if (!textless(tokens[i])) ix.push(i)
    let before = 0, k0 = 0, q0 = 0
    for (let f = 1; f < fs.length; f++) {
      before += fs[f - 1].lines
      const share = before / total, frame = fs[f]
      if (rl.length === 1) {
        let q = Math.max(q0 + 1, Math.round(ix.length * share))
        while (q < ix.length && !opens(tokens[ix[q]])) q++
        if (q >= ix.length) break
        q0 = q
        if (l0.block < frame.first) out.push({ page: frame.page, frame: frame.first, at: ix[q] })
        continue
      }
      // (the line ends a cut may stand at: past the last cut, short of the run's last line, each line one a token opens)
      const want = rl.length * share
      let k = -1
      for (let j = k0 + 1; j < rl.length; j++) {
        if (!(rl[j].from > rl[j - 1].from)) continue
        const d = Math.abs(j - want), dk = k < 0 ? Infinity : Math.abs(k - want)
        if (d < dk || (d === dk && j > k)) k = j
      }
      if (k < 0) break
      k0 = k
      // (the fit's own flow already sets that line in the frame or later: its frame before full)
      if (rl[k].block < frame.first && rl[k].from > 0) out.push({ page: frame.page, frame: frame.first, at: rl[k].from })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/**
 * A unit laid over its frame breaks (a page's, a column's): as without them, the fit's states searched once; where that
 * layout sets more of a run's lines in a frame than its share (pageCutsOf), laid once more with the breaks (withPageBreaks)
 * at that layout's own state, and kept where it fits there. Else as without them: a cut never costs a unit its fit, nor a second search of the
 * fit's states. A break ends the line that holds it where the breaker ends that line, and where that line is its run's last
 * the breaker lays it on the break's page (breakLines' strand), in this lay and in every later one of the tokens it returns.
 * Returns { layout, tokens }, the tokens it was laid from
 */
export function layoutCut(tokens, blocks, s, P) {
  const plain = layoutUnit2(tokens, blocks, s, P)
  if (plain.clipped || plain.spilled || blocks.length < 2) return { layout: plain, tokens }
  const cuts = pageCutsOf(plain.lines, blocks, plain.tokens ?? tokens, P)
  if (!cuts.length) return { layout: plain, tokens }
  const broken = withPageBreaks(tokens, cuts)
  const cut = layoutAt(broken, blocks, s, P, plain.state)
  if (cut.clipped) return { layout: plain, tokens }
  cut.tried = plain.tried
  return { layout: cut, tokens: broken }
}

/** the tokens with a page-break token (`{ pageBreak: page }`, breakLines') before each cut's token (pageCutsOf's) */
export function withPageBreaks(tokens, cuts) {
  if (!cuts.length) return tokens
  const out = []
  let c = 0
  tokens.forEach((t, i) => {
    while (c < cuts.length && cuts[c].at === i) { const { page, frame } = cuts[c++]; out.push({ pageBreak: page, ...(frame !== undefined ? { frame } : {}), w100: 0 }) }
    out.push(t)
  })
  return Object.assign(out, { base: tokens.base })
}

/** each line's items placed: justified where the slack is within the caps (CJK per gap, spaces per space), else left
 *  aligned; the unit's last line left aligned, and so a line TeX's own break ends (breakLines' `ends`: the part of a
 *  paragraph before a display, which TeX ends with \parfillskip, and a forced break, \\'s \hfil\break), its spacing the
 *  fit's state (its tracking), never spread to the edge; a centred block centred */
function placeItems(lines, f, P) {
  const last = lines.at(-1)
  for (const line of lines) {
    const cap = line.x1 - line.x0
    const natural = line.items.reduce((s, it) => s + it.w + (it.asp ?? 0) + (it.kern ?? 0), 0)
    // a closing mark at the line's end may stand in the margin by its blank half
    const end = line.items.at(-1)
    const hang = end?.t.punct === 'close' && !end.cut && P._compress < 2 ? 0.5 * f : 0
    let slack = cap - natural + hang
    const spaces = line.items.filter(it => it.t.space)
    const spW = spaces.reduce((s, it) => s + it.w, 0)
    const latinish = latinishOf(line.items, P)
    let perSpace = 0, perGap = 0
    line.mode = line.centred ? 'centred' : line === last || line.ends ? 'last' : 'just'
    // (a line of a unit TeX set flush left is ragged at its natural spacing, every line of one set flush right stands at the
    // right edge, its last too: \raggedleft sets no \parfillskip past it; P.keepAlign, run.mjs)
    if (line.flush === 'left' && line.mode === 'just') line.mode = 'ragged'
    else if (line.flush === 'right') line.mode = 'right'
    // a line squeezed to take its last group (breakLines' squeezeTakes): its marks' blank halves first, as many as it needs,
    // then its word spaces down to spaceMin, then each gap by what is left, which breakLines kept within SQUEEZE em; a mark's
    // half more than it needed is spread as any line's slack
    if (line.squeezed && slack < 0 && !latinish && line.items.length > 1) {
      for (const it of squeezable(line.items, hang > 0, P._compress, P)) {
        if (slack >= 0) break
        it.w -= 0.5 * f
        if (it.t.punct === 'open') it.shift = (it.shift ?? 0) - 0.5 * f
        it.cut = true
        slack += 0.5 * f
      }
      if (slack < 0) {
        const by = Math.max(slack, -spW * (1 - P.spaceMin))
        if (spaces.length) perSpace = by / spaces.length
        perGap = (slack - (spaces.length ? by : 0)) / (line.items.length - 1)
        slack = 0
      }
    }
    if (slack < 0 && spaces.length) perSpace = slack / spaces.length // shrunk spaces (never past spaceMin by the breaking)
    else if (line.mode === 'just' && slack > 0) {
      if (latinish) {
        const per = slack / spaces.length
        if (per <= P.spaceMax * (spW / spaces.length)) perSpace = per
        else line.mode = 'ragged'
      } else {
        const gaps = line.items.length - 1
        if (gaps > 0 && slack / gaps <= P.cjkJust * f) perGap = slack / gaps
        else if (gaps > 0) line.mode = 'ragged'
      }
    }
    if (line.mode === 'last' && slack < 0 && !spaces.length) slack = 0
    let x = line.x0 + (line.centred ? Math.max(0, slack) / 2 : line.mode === 'right' ? Math.max(0, slack) : 0)
    line.items.forEach((it, n) => {
      x += it.asp ?? 0
      it.x = x + (it.shift ?? 0)
      x += it.w + (it.kern ?? 0) + (it.t.space ? perSpace : 0) + (n < line.items.length - 1 ? perGap : 0)
    })
    line.used = x - line.x0
    line.cap = cap
  }
}

/** the fit's states, from the most natural, each knob in the order given taken to its bound before the next */
function* statesOf(P, blocks, s) {
  // maxScale: a size set from outside (the page's even pass), from which the fit starts
  // (step 3: the CJK runs' tracking from P.trackStart, a face's size correction given back, run.mjs; down from it)
  const t0 = P.cjk ? P.trackStart ?? 0 : 0
  // (capScale: the most its lines' room between the rules over and under them leaves it, cellBands: never above)
  const top = Math.min(P.maxScale ?? 1, P.capScale ?? 1)
  // (P.runTrack: a run of a unit split by its displays starts from its unit's tracking, the tightest its runs need, layoutRuns)
  const R = P.runTrack
  const st = { lead: P.leadBase, track: R ? R.track : t0, trackLatin: R ? R.trackLatin : 0, compress: R ? R.compress : P.compressMax > 0 ? 1 : 0, borrow: 0, scale: top, knob: P.maxScale ? 'even' : P.capScale < 1 ? 'clear' : 'none' }
  yield { ...st }
  for (const knob of P.order) {
    if (knob === 'track') {
      if (P.compressMax >= 2 && st.compress < 2) { st.compress = 2; yield { ...st, knob } }
      for (let t = (P.cjk ? st.track : st.trackLatin) - 0.01; t >= P.trackMin - 1e-9; t -= 0.01) {
        if (P.cjk) st.track = t
        else st.trackLatin = t
        yield { ...st, knob }
      }
    } else if (knob === 'borrow') {
      if (!P.borrow) continue
      // the free space is measured here, the first time a unit needs it (an ink map of its page, made once)
      for (const b of blocks) if (b.freeOf) { b.free = b.freeOf(); b.freeOf = null }
      const most = Math.max(0, ...blocks.map(b => Math.floor(b.free / (b.pitch0 ?? 1.2 * s) + 1e-6)))
      for (let n = 1; n <= Math.min(most, 6); n++) { st.borrow = n; yield { ...st, knob } }
      if (most > 0) { st.borrow = 99; yield { ...st, knob } }
    } else if (knob === 'lead') {
      for (let L = st.lead - 0.05; L >= P.leadFloor - 1e-9; L -= 0.05) { st.lead = Math.round(L * 1000) / 1000; yield { ...st, knob } }
      if (st.lead > P.leadFloor + 1e-9) { st.lead = P.leadFloor; yield { ...st, knob } }
    } else if (knob === 'shrink') {
      // (on the steps from the size it would start at uncapped, those under the cap: a cap of 0.956 stepping from itself
      // ended at 0.806 short of the floor's 0.8, where 1512.03385's cells fit, and left them the original's)
      for (let k = 1; ; k++) {
        const sc = Math.round(((P.maxScale ?? 1) - k * P.step) * 1000) / 1000
        if (sc < P.floor - 1e-9) break
        if (sc > top + 1e-9) continue
        st.scale = sc
        yield { ...st, knob }
      }
    }
  }
}

/**
 * A unit laid out: the first state of the fit at which every token is placed; at the last, what fits, clipped (which the
 * host never draws: run.mjs fitFurther). P.flowPast (step 3): where a kept region still stops it, every state again with
 * the text run past the region (breakLines 'flow').
 * `s`: the original's size (PDF units). Returns { lines, f, s, scale, state, knob, clipped, lostChars, chars, tried }.
 */
export function layoutUnit2(tokens, blocks, s, P) {
  let last = null, tried = 0
  for (const st of statesOf(P, blocks, s)) {
    tried++
    work.fit++
    const f = s * st.scale
    const r = breakLines(tokens, slotsAt(blocks, st, P, s), f, st, P, st.scale, true, blocks)
    last = { r, st, f }
    if (r.rest >= r.total) break
  }
  // nothing fits in order at the last state: the text may run on past a kept region (all of it shown, out of order), at the
  // most natural state at which it then fits. The walk down to the last state bought nothing the run past keeps: laid at the
  // last, a paragraph that runs on past a display was drawn at the floor's size though it fit far larger (the M1 survey of
  // 2608.16117, German page 10: units 28 and 35 at 0.8 and 0.85 of the original's size). Where it fits at none, the last
  // state's, as far as it goes
  if (last.r.rest < last.r.total && tokens.some(t => t.blockTo !== undefined)) {
    let past = null
    for (const st of statesOf(P, blocks, s)) {
      tried++
      const f = s * st.scale
      past = { r: breakLines(tokens, slotsAt(blocks, st, P, s), f, st, P, st.scale, false, blocks), st, f }
      if (past.r.rest >= past.r.total) break
    }
    if (past.r.rest >= past.r.total) last = past
    else if (past.r.rest > last.r.rest) last = { ...last, r: past.r }
  }
  // (step 3, P.flowPast: and else through every slot, a kept region only breaking the line, from the most natural state)
  if (P.flowPast && last.r.rest < last.r.total && tokens.some(t => t.blockTo !== undefined)) {
    for (const st of statesOf(P, blocks, s)) {
      tried++
      work.fit++
      const f = s * st.scale
      const r = breakLines(tokens, slotsAt(blocks, st, P, s), f, st, P, st.scale, 'flow', blocks)
      if (r.rest >= r.total) { last = { r, st, f }; break }
    }
  }
  // (fillBySize, P.growTo: where the most natural state sets the whole unit with lines to spare, the largest size up to
  // growTo × the original's at which it still does, its lines on the original's pitch: a loose original's paragraph
  // filled by its text's size, not by lines looser than the original's own)
  if (P.growTo > 1 && tried === 1 && last.r.rest >= last.r.total) {
    for (let k = Math.round((Math.min(P.growTo, P.capScale ?? Infinity) - 1) / P.step); k >= 1; k--) {
      work.fit++
      const st = { ...last.st, scale: Math.round((1 + k * P.step) * 1000) / 1000, knob: 'grow' }
      const f = s * st.scale
      const r = breakLines(tokens, slotsAt(blocks, st, P, s), f, st, P, st.scale, true, blocks)
      if (r.rest >= r.total) { last = { r, st, f }; break }
    }
  }
  return laidOut(last, s, P, tried, blocks)
}

/** a fit's breaking at its state made a layout: its lines placed, and what it set and lost counted; the lines TeX's rule
 *  opened (`opened`), and with no values for it (P.lineskip none) the lines that come nearer the one before them in their
 *  block than nothing, its foot over their top, and stay so (`unopened`: what the rule would have opened) */
function laidOut({ r, st, f }, s, P, tried, blocks) {
  const clipped = r.rest < r.total
  P._compress = st.compress
  if (P.lastLines && !clipped) toLastLines(r.lines, blocks, P.halfLead?.below, f, () => slotsAt(blocks, { ...st, lead: 1, box: undefined }, P, s))
  placeItems(r.lines, f, P)
  const count = t => (t.s ? [...t.s].length : t.crop ? 1 : 0)
  const allChars = r.tokens.reduce((a, t) => a + count(t), 0)
  const drawn = r.lines.reduce((a, l) => a + l.items.reduce((b, it) => b + count(it.t), 0), 0)
  let unopened = 0
  if (!P.lineskip) for (let i = 1; i < r.lines.length; i++) {
    const a = r.lines[i - 1], b = r.lines[i]
    if (!inFlow(a, b) || !(a.baseline > b.baseline)) continue
    if (a.baseline - lineExtent(a, f, st.scale).d < b.baseline + lineExtent(b, f, st.scale).a) unopened++
  }
  // (`fitTrack`: the tracking the fit set the unit at, which a state made from this one keeps (run.mjs fillPage's): a line
  // squeezes at no tracking above it, breakLines' squeezes)
  const state = st.fitTrack === undefined ? { ...st, fitTrack: st.track } : st
  return { lines: r.lines, f, s, scale: st.scale, state, knob: clipped ? 'clip' : st.knob, clipped, lostChars: Math.max(0, allChars - drawn), chars: allChars, tried, spilled: !!r.spilled, opened: r.lines.filter(l => l.opened > 0).length, unopened }
}

// ---- a unit's runs between its displays, each its own text block (the per-block state, 2026-10-24)

/** a token that sets nothing of the text: a kept region's break, a forced break, a page break, a space */
const textless = t => t.blockTo !== undefined || t.newline !== undefined || t.pageBreak !== undefined || !!t.space
/**
 * A unit's runs between its kept regions (a display, `blockTo`): the text between two regions is set on the slots between
 * them alone (breakLines: slots of its `after`), so each run is a text block of its own. Each run: its blocks (those of one
 * `after`, consecutive from the unit's block `bi0`) and its tokens (the region's breaks that open it first; a region with no
 * text after it before the next breaks with the run after it, or, at the unit's end, with the run before it). Null where the
 * unit is one run, where a run with text has no slots of its own or a block no run's text (the walk's own rules then place
 * it), or where the blocks are not in the order of their regions
 */
export function runsOf(tokens, blocks) {
  if (blocks.length < 2) return null
  // (a run opens at a display alone: a forced break that opens another frame (tokensOf2's `brk`) breaks the line, and its
  // frames stay the run's, as the unit's own walk sets them. Each token kept with its place in the unit's (`idx`))
  const by = new Map()
  let consumed = 0, key = 0
  tokens.forEach((t, i) => {
    if (t.blockTo !== undefined) {
      consumed = Math.max(consumed, t.blockTo + 1)
      if (!t.brk) key = consumed
    }
    ;(by.get(key) ?? by.set(key, []).get(key)).push([t, i])
  })
  // (a run that sets nothing goes with the next one, or the last one at the end)
  const keys = [...by.keys()].sort((a, b) => a - b), runs = []
  let carry = []
  for (const k of keys) {
    const ts = [...carry, ...by.get(k)]
    carry = []
    if (!ts.some(([t]) => !textless(t))) { carry = ts; continue }
    runs.push({ after: k, tokens: ts.map(x => x[0]), idx: ts.map(x => x[1]) })
  }
  if (carry.length && runs.length) { runs.at(-1).tokens.push(...carry.map(x => x[0])); runs.at(-1).idx.push(...carry.map(x => x[1])) }
  if (runs.length < 2) return null
  // (the display after a run ends its last line, TeX's \parfillskip before it: ragged, as the unit's own walk ends it there,
  // breakLines; a forced break of no room ends it so where the run is laid alone)
  for (const r of runs.slice(0, -1)) r.tokens.push({ newline: -1, room: 0, w100: 0 })
  let at = 0
  for (const [i, r] of runs.entries()) {
    const bi0 = at, upto = runs[i + 1]?.after ?? Infinity
    if (at < blocks.length && (blocks[at].after ?? 0) !== r.after) return null
    while (at < blocks.length && (blocks[at].after ?? 0) < upto) at++
    if (at === bi0) return null
    r.bi0 = bi0
    r.blocks = blocks.slice(bi0, at)
  }
  return at === blocks.length ? runs : null
}
/** a run's parameters (layoutRuns): its first block's place in the unit (slotsAt's first line), and the gap under the paragraph
 *  (P.halfLead, footFloorAt) and a heading's last lines the unit's last run's alone */
export const runParams = (P, run, last) => ({ ...P, blockBase: run.bi0, lastLines: false, ...(last ? {} : { halfLead: null }) })
/**
 * A unit's runs (runsOf) laid each at its own state: the first of the fit's states at which its own text fits its own slots,
 * so that only a cramped run shrinks, its leading its own too (the owner's ruling of 2026-10-09, sizes per unit, carried to
 * its natural unit: a block between two displays reads as its own text block). Every run fits at the state the unit fitted
 * at (the unit's walk sets each run on its own slots), so each comes out at that state or a more natural one. One tracking
 * a paragraph: the walk tightens a run's tracking (and its CJK punctuation's compression) before it shrinks it, so a cramped
 * run is set tighter than a roomy one, and a paragraph's parts would read at two letter spacings, its roomy part's last line
 * looser than its own paragraph's tightest lines (the sweep's (j)); each run is laid again from the tightest tracking any of
 * them needs (P.runTrack), its own size and leading still its own. Null where the unit is one run or a run does not fit alone; else { layout: joinRuns', runs: each with its blocks,
 * tokens, `bi0`, `P` and `layout` }
 */
export function layoutRuns(tokens, blocks, s, P, fit = null) {
  const runs = runsOf(tokens, blocks)
  if (!runs) return null
  for (const [i, r] of runs.entries()) {
    r.P = runParams(P, r, i === runs.length - 1)
    r.layout = layoutUnit2(r.tokens, r.blocks, s, r.P)
    if (r.layout.clipped) return null
  }
  const trackOf = st => (P.cjk ? st.track : st.trackLatin)
  const tight = runs.reduce((a, r) => (trackOf(r.layout.state) < trackOf(a.layout.state) - 1e-9 || (trackOf(r.layout.state) <= trackOf(a.layout.state) + 1e-9 && r.layout.state.compress > a.layout.state.compress) ? r : a)).layout.state
  const R = { track: tight.track, trackLatin: tight.trackLatin, compress: tight.compress }
  for (const r of runs) {
    const st = r.layout.state
    if (Math.abs(trackOf(st) - trackOf(R)) < 1e-9 && st.compress === R.compress) continue
    r.P = { ...r.P, runTrack: R }
    r.layout = layoutUnit2(r.tokens, r.blocks, s, r.P)
    if (r.layout.clipped) return null
  }
  // (no run sets a token on a later page than the unit's fit did (`fit`, its lines; keepsPages): a run set larger holds
  // fewer lines on a page's frame, and the page cuts keep text only from the page before. Where one would, the unit is laid
  // as one)
  if (fit && !runs.every(r => keepsPages(fit, r.layout.lines.map(l => ({ from: r.idx[l.from] ?? r.idx.at(-1), page: l.page })), tokens))) return null
  return { layout: joinRuns(runs), runs }
}
/**
 * The runs' layouts as the unit's one layout: their lines in order, each line's block its place in the unit's blocks, and each
 * with its run's size, scale and state (`seg`: what the drawing, the word table and the links read a line by, where it is
 * there); the layout's own fields the first run's, its counts summed. The runs' own layouts are not changed
 */
export function joinRuns(runs) {
  const first = runs[0].layout
  const lines = runs.flatMap(r => { const seg = { f: r.layout.f, scale: r.layout.scale, state: r.layout.state }; return r.layout.lines.map(l => ({ ...l, block: l.block + r.bi0, seg })) })
  const sum = k => runs.reduce((a, r) => a + (r.layout[k] ?? 0), 0)
  return { ...first, lines, clipped: false, lostChars: sum('lostChars'), chars: sum('chars'), tried: sum('tried'), spilled: runs.some(r => r.layout.spilled), opened: sum('opened'), unopened: sum('unopened'), runs: runs.length }
}

/**
 * A unit laid at one state of the fit, with no search (D6's page fill, run.mjs fillPage: a unit's fitted state at another
 * leading, tracking or size): layoutUnit2's answer, clipped where the state does not set every token in the text's order
 */
export function layoutAt(tokens, blocks, s, P, st) {
  work.fit++
  const f = s * st.scale
  return laidOut({ r: breakLines(tokens, slotsAt(blocks, st, P, s), f, st, P, st.scale, true, blocks), st, f }, s, P, 1, blocks)
}

/**
 * A heading its translation sets in fewer lines than the original's (P.lastLines, run.mjs: a section heading): its lines
 * moved down onto the original's last ones, so that the room it frees falls above it, not between it and the text it heads
 * (the owner, 2026-10-19: 1810.04805's "C.2 Ablation for Different Masking Procedures", two lines, its Chinese one, left a
 * blank line before its paragraph; the coordinator's ruling: on the original's last baseline, past the page fill's floor,
 * footFloorAt, which would have left 7.4 pt of C.2's 13.5 under it). The last line goes onto the original's last baseline,
 * and every line above it as far down; each keeps its slot's measure (the first its start, where the heading's number is
 * drawn with it: run.mjs). Never nearer the next line of its column (the original's room under its last line, `below`:
 * P.halfLead, run.mjs edgesOf) than the size it is set at, `f`: the line's box clear of the next line's. Only a heading of
 * one block (its lines one run of a column); a body paragraph is never moved.
 *
 * Only where the lines keep their own room where they land (`slots`: the state's slots on the original's own rows, at its
 * pitch and with no page fill's floor, which the lines go past; the one within half a pitch of the row each is moved onto).
 * Its lines stay where they were laid if a line
 * would end past where its new row's room ends: the stop of a row it shares with the next unit, TeX's text ending there
 * before what stays of the page (run.mjs keptAfter: amsthm's theorem note, whose last row the theorem's body goes on after
 * the note's `).`; 2610.18513v1 page 35, unit 316 moved down onto its row whole and drawn over the body's first words), or a
 * narrower measure. The same where a line after the first would start elsewhere than on its row, or where the first line
 * starts past its block's left edge with no start of its own (`start`: the number run.mjs draws with it): what stands
 * before it on its row stays there (a label kept as the original's, "Lemma A.2 ("), and the text moved off it stood apart
 * from it, at that line's indent on a row that has none
 */
function toLastLines(lines, blocks, below, f, slots) {
  if (blocks?.length !== 1 || !lines.length || lines.some(l => l.block !== 0)) return
  const b = blocks[0], B = b.B
  if (lines.length >= originalLines(b)) return
  const last = Math.min(...B)
  const onto = last - lines.at(-1).baseline
  let by = onto
  if (Number.isFinite(below) && below < f) by += f - below
  if (!(by < -0.05)) return
  const room = slots().filter(sl => sl.block === 0)
  for (const [i, l] of lines.entries()) {
    // (the row it lands on, the room under the last line taken into account: the slot there, within half a pitch)
    const y = l.baseline + by
    const at = room.reduce((q, sl) => (!q || Math.abs(sl.baseline - y) < Math.abs(q.baseline - y) ? sl : q), null)
    if (!at || Math.abs(at.baseline - y) > 0.5 * at.pitch || at.x1 < l.x1 - 0.05) return
    if (i > 0 ? Math.abs(at.x0 - l.x0) > 0.05 : !b.centred && b.start === undefined && l.x0 > at.x0 + 0.05) return
  }
  // (each line's target the original's line it now stands on, where it does: the record's drift reads it)
  for (const l of lines) {
    l.baseline += by
    const t = B.findIndex(v => Math.abs(v - l.baseline) < 0.05)
    l.target = t >= 0 ? t : null
  }
}
/** a block's lines as the original sets them: its baselines, a line its rectangles cut in two (a formula, a gap) one */
export const originalLines = b => new Set(b.B.map(v => Math.round(v * 100))).size

// ---- a shared line (need.mjs rowLeadOf): a unit's last row on which TeX set another unit's first, which is laid from where
// this one's translation ends there (run.mjs layout2's `start`)

/** whether a laid line stands on a shared row (shareOf): on its page, within an em of its baseline, across the block it is in */
const onShare = (share, l) => l.page === share.page && Math.abs(l.baseline - share.y) < share.band && Math.min(l.x0 + l.used, share.x1) > Math.max(l.x0, share.x0)
/**
 * The shared row as a unit's layout leaves it: `row` (the unit's last row in the layout file: page, baseline, size) in the
 * unit's block that holds it (its x0 and x1, so that a line of another column on that baseline is no line of the row),
 * `end`, the furthest end of the unit's text laid within an em of the row (its lines there, which the next unit's first line
 * would meet), and `at`, the baseline of the line that ends there: the row's own where the unit's line stands on TeX's, else
 * where its leading set it (a paragraph's two lines spread over its three rows, 2608.16117's unit 115 on page 39, 7.2 pt
 * over the row), which the next unit's first line stands on, so that the row reads as one line. Both null where it set
 * none there (its translation ended higher: the row is free). Null where no block of the unit holds the row (a row kept as
 * the original's, or dropped as another unit's): the row stays the original's.
 */
export function shareOf(layout, blocks, row) {
  const b = blocks.find(q => q.page === row.page && q.B.some(y => Math.abs(y - row.baseline) < 0.05))
  if (!b) return null
  const share = { page: row.page, y: row.baseline, band: row.size, x0: b.x0, x1: b.x1, end: null, at: null }
  for (const l of layout.lines) if (onShare(share, l) && (share.end === null || l.x0 + l.used > share.end)) { share.end = l.x0 + l.used; share.at = l.baseline }
  return share
}
/**
 * Whether `lines` set no token on a later page than the fit's lines (`fit`) set it, read by each line's first token (`from`):
 * the page fill spreads a unit's lines over its frames, and a looser leading holds fewer of them on a page's frame, so it can
 * carry text the source sets on one page over to the next, which the page cuts (pageCutsOf) only keep from the page before.
 * 2610.21884v1's unit 10 in Chinese, a paragraph over pages 1 and 2: its last run filled to 1.61 set a sentence of page 1 at
 * the top of page 2 (the sweep's (i)). Read for a unit's runs (run.mjs fillPage, fillLeadsOf): a unit of one run is filled as
 * before, byte for byte, though the same can befall it (34 pages of 19 Chinese papers move where it is read for every unit;
 * left to its own change). A line after a page break of the source's (`tokens`, the lines' own: withPageBreaks' token) may
 * stand on the break's page: its text is that page's in the source, and the line that holds the break ends where the
 * breaker ends it, sooner at a looser state (breakLines), so that the tail of that line goes on to the page it belongs to
 */
export function keepsPages(fit, lines, tokens = null) {
  const breaks = []
  tokens?.forEach((t, i) => { if (t.pageBreak !== undefined) breaks.push([i, t.pageBreak]) })
  const sent = from => breaks.reduce((pg, [i, b]) => (i < from ? Math.max(pg, b) : pg), -Infinity)
  let j = 0
  for (const l of lines) {
    while (j + 1 < fit.length && fit[j + 1].from <= l.from) j++
    if (fit[j] && l.page > fit[j].page && !(l.page <= sent(l.from))) return false
  }
  return true
}
/** whether a layout of a unit keeps its shared row as the unit's fit left it (shareOf): its text there ending no further
 *  right, none there where the fit set none, and the line that ends furthest there on the baseline the fit set it at (`at`),
 *  so that the next unit on the row, laid from the fit's end and on its baseline, stays clear of it and on its line
 *  (run.mjs fillPage). True with no share, and with one no next unit is laid from (`kept`: something stays between the two
 *  on the row, run.mjs keptAfter, and the unit's own line there ends where TeX's did, its slot's `stop`) */
export function keepsShare(share, lines) {
  if (!share || share.kept) return true
  let far = null
  for (const l of lines) {
    if (!onShare(share, l)) continue
    if (share.end === null || l.x0 + l.used > share.end + 0.01) return false
    if (!far || l.x0 + l.used > far.x0 + far.used) far = l
  }
  return far === null || share.at === null || Math.abs(far.baseline - share.at) < 0.01
}

// ---- drawing: the layer as data (crops and pastes over our page with the drawn units' groups hidden), drawn at any
// resolution; the SVG text

/** a crop's part in its audit entry (`part`, cropPartsOf's), where its formula has parts: the checker counts each part's */
const partOf = c => (c.part !== undefined ? { part: c.part } : {})
/**
 * A unit's drawing on a page of our wrapped document (docs/route/ocg-erasure.md §4.1; hide.mjs unitHiding), as data: the operations
 * drawOps draws over render A (the page with the units drawn there hidden by their groups), in v0's device pixels on the page
 * (`px`, `k` of them a PDF unit). Drawn at any other resolution they are scaled to it, from the planes PDF.js draws there. Each:
 * - { op: 'hidden', rects }: where the unit's hidden ink lies, less what is shown again (nothing drawn: what the links ask);
 * - { op: 'paste', page, plane, unit, rects }: render `plane` of this page ('B': every unit's text and label hidden; 'C': every
 *   group shown) put back in each rectangle: the ink the unit's reading keeps (`unit`, whose it is: the lab's check of what a
 *   paste brings back, lab/pdf/spikes/ocg-reader/page.mjs `resurrected`);
 * - { op: 'crop', page, plane: 'B', src, dst, clip? }: that page's render B in src laid on dst, darkened in, cut through its
 *   placeholder's own segments (`clip`, source pixels) where it has them; a label's crop (no piece) from render C.
 * `hidden`, `fromB`, `fromC`: PDF boxes; `clips`: by the piece's index (hide.mjs). `hasSource(page)`: whether a crop's page is drawn.
 * The audit has the unit's hidden rectangles (as 'erase', what the checker reads as taken away) and its crops.
 */
export function hideOps(L, page, { px, k, hasSource, pxOf, hidden = [], fromB = [], fromC = [], clips = null, audit = null, id = null }) {
  const dev = b => { const [ax, ay] = px(b[0], b[3]), [bx, by] = px(b[2], b[1]); return [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)] }
  const ops = []
  if (hidden.length) ops.push({ op: 'hidden', rects: hidden.map(dev) })
  for (const b of hidden) { const [x, y, w, h] = dev(b); audit?.push({ what: 'erase', unit: id, page, box: [x, y, x + w, y + h] }) }
  if (fromB.length) ops.push({ op: 'paste', page, plane: 'B', unit: id, rects: fromB.map(dev) })
  if (fromC.length) ops.push({ op: 'paste', page, plane: 'C', unit: id, rects: fromC.map(dev) })
  for (const line of L.lines) {
    if (line.page !== page) continue
    for (const it of line.items) {
      if (!it.t.crop) continue
      const c = it.t.crop.crop
      if (!hasSource(it.t.crop.page)) continue
      const sc = (line.seg ?? L).scale
      const [sx0, sy0] = pxOf(it.t.crop.page)(c[0], c[3]), [sx1, sy1] = pxOf(it.t.crop.page)(c[2], c[1])
      const [dx, dy] = px(it.x, line.baseline + (c[3] - it.t.crop.baseline) * sc)
      // (cut through its own segments where it has them: a crop's box may reach another line's ink, its segments do not. The clips
      // are this page's segments in this page's pixels: a crop, or a part of one, from another page has none. A crop of no piece
      // is a label's, whose group render B hides: cut from render C)
      const piece = it.t.crop.k !== undefined
      const cut = piece && it.t.crop.page === page ? clips?.get(it.t.crop.k) ?? null : null, clip = cut?.rects.map(dev) ?? null
      const plane = piece ? 'B' : 'C'
      ops.push({ op: 'crop', page: it.t.crop.page, plane, src: [sx0, sy0, sx1 - sx0, sy1 - sy0], dst: [dx, dy, it.w * k, (c[3] - c[1]) * sc * k], ...(clip?.length ? { clip } : {}) })
      audit?.push({ what: 'crop', unit: id, page, k: it.t.crop.k, ...partOf(it.t.crop), srcPage: it.t.crop.page, plane, src: c, dst: [dx, dy, dx + it.w * k, dy + (c[3] - c[1]) * sc * k], ...(clip?.length ? { clip, own: cut.own } : {}) })
    }
  }
  return ops
}

/**
 * hideOps' operations drawn on `ctx` (render A of the page, at `z` times v0's resolution), in their order. `sourceOf(page, plane)`:
 * that page's render `plane` at the same resolution as `ctx`, which the pastes and crops are cut from (null: the operation is left
 * out): a canvas of the whole page, or { canvas, x, y }, the part of the page from (x, y) that the operations cut from (opsSources).
 * A paste puts the plane's pixels back in its rectangles, out to whole device pixels (no edge blended); a crop is darkened in,
 * never pasted: its paper is white, and pasted it would cover what it is laid over (a kept label)
 */
export function drawOps(ctx, ops, z, sourceOf) {
  const at = b => [b[0] * z, b[1] * z, b[2] * z, b[3] * z]
  const part = v => (v && v.canvas ? v : v ? { canvas: v, x: 0, y: 0 } : null)
  const whole = b => { const x0 = Math.floor(b[0] * z + 1e-6), y0 = Math.floor(b[1] * z + 1e-6), x1 = Math.ceil((b[0] + b[2]) * z - 1e-6), y1 = Math.ceil((b[1] + b[3]) * z - 1e-6); return [x0, y0, x1 - x0, y1 - y0] }
  ctx.save()
  for (const o of ops) {
    if (o.op === 'paste') {
      const src = part(sourceOf(o.page, o.plane))
      if (!src || !o.rects.length) continue
      ctx.save()
      ctx.beginPath()
      for (const e of o.rects) ctx.rect(...whole(e))
      ctx.clip()
      ctx.drawImage(src.canvas, src.x, src.y)
      ctx.restore()
    } else if (o.op === 'crop') {
      const src = part(sourceOf(o.page, o.plane))
      if (!src) continue
      const s = at(o.src), d = at(o.dst)
      if (o.clip) {
        // its own ink's boxes (source pixels) where they land: the crop's map from its source to its place
        const sx = d[2] / (s[2] || 1), sy = d[3] / (s[3] || 1)
        ctx.save()
        ctx.beginPath()
        for (const e of o.clip) { const b = at(e); ctx.rect(d[0] + (b[0] - s[0]) * sx, d[1] + (b[1] - s[1]) * sy, b[2] * sx, b[3] * sy) }
        ctx.clip()
      }
      ctx.globalCompositeOperation = 'darken'
      ctx.drawImage(src.canvas, s[0] - src.x, s[1] - src.y, s[2], s[3], ...d)
      ctx.globalCompositeOperation = 'source-over'
      if (o.clip) ctx.restore()
    }
  }
  ctx.restore()
}

/**
 * The part of each plane drawOps cuts from, at `z` times v0's resolution: by `${plane}${page}`, the box [x, y, w, h] (whole device
 * pixels) that holds every paste's rectangles and every crop's source of that plane, so that a plane is rendered on a canvas of
 * that box alone, not of the whole page (a page at a view's resolution is up to COPY_PIXELS: tens of MB a plane)
 */
export function opsSources(ops, z) {
  const boxes = new Map()
  const grow = (key, x0, y0, x1, y1) => { const b = boxes.get(key); if (!b) boxes.set(key, [x0, y0, x1, y1]); else { b[0] = Math.min(b[0], x0); b[1] = Math.min(b[1], y0); b[2] = Math.max(b[2], x1); b[3] = Math.max(b[3], y1) } }
  for (const o of ops) {
    const key = `${o.plane}${o.page}`
    if (o.op === 'paste') for (const e of o.rects) grow(key, e[0] * z, e[1] * z, (e[0] + e[2]) * z, (e[1] + e[3]) * z)
    else if (o.op === 'crop') grow(key, o.src[0] * z, o.src[1] * z, (o.src[0] + o.src[2]) * z, (o.src[1] + o.src[3]) * z)
  }
  const out = new Map()
  for (const [key, [x0, y0, x1, y1]] of boxes) {
    const x = Math.max(0, Math.floor(x0) - 1), y = Math.max(0, Math.floor(y0) - 1)
    out.set(key, [x, y, Math.max(1, Math.ceil(x1) + 1 - x), Math.max(1, Math.ceil(y1) + 1 - y)])
  }
  return out
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const faceClasses = new Map(), faceNames = new Set()
let faceSheet = null
/** a face's CSS class, its rule added to the page's sheet once. Its name is the face's own (its key's digest, FNV-1a, base 36),
 *  never the order faces were first met in: a page laid by its closure meets its faces in another order than the pages laid in
 *  turn, and its markup is the same either way (1b-D). Two keys of one digest, never seen: the later one's name numbered */
function faceClass(face) {
  const key = `${face.family}|${face.weight}|${face.style}|${face.caps ? 1 : 0}`
  let c = faceClasses.get(key)
  if (!c) {
    let h = 0x811c9dc5
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0
    c = `axf${h.toString(36)}`
    for (let n = 2; faceNames.has(c); n++) c = `axf${h.toString(36)}-${n}`
    faceNames.add(c)
    faceClasses.set(key, c)
    faceSheet ??= document.head.appendChild(document.createElement('style'))
    faceSheet.sheet.insertRule(`.${c}{font-family:${face.family};font-weight:${face.weight};font-style:${face.style}${capsRule(face)}}`)
  }
  return c
}
/**
 * A run's small capitals as its face's rule draws them: by the face's own smcp feature (font-roles.mjs ownSmallCaps), as the
 * canvas that measured the run sets them (`small-caps` in fontString). No rule asks a browser to synthesize any: a face with
 * none of its own has its small capitals drawn by the layer, its runs in the face with none asked (selfCaps, caseRuns), and
 * Latin Modern's caps face, whose letters are its small capitals, is asked none (fonts.mjs)
 */
export function capsRule(face) {
  return face.caps && face.id && ownSmallCaps(face.id) ? ';font-variant:small-caps' : ''
}
const n2 = v => Math.round(v * 100) / 100
/** a fill (0xRRGGBB) as the drawing writes it */
export const hexOf = rgb => `#${rgb.toString(16).padStart(6, '0')}`
/** a run's colour as the drawing writes it: a fill as it is, a name by its CSS colour */
const fillAttr = c => (/^#[0-9a-f]{6}$/.test(c) ? c : '#141414')

/**
 * The unit's lines on one page as SVG: a <text> per line at its baseline, a <tspan> per run with its own x (a CJK run
 * a position per character), an oblique run a <text> of its own skewed about its baseline, in the line's order, a crop's formula as
 * transparent text over it (so that it is copied and found). `toPx(x, y)`: PDF to the SVG's CSS pixels; `scale`: CSS
 * pixels per PDF unit.
 */
export function svgOfUnit(L, page, toPx, scale, id) {
  let out = `<g data-u="${id}">`
  for (const line of L.lines) {
    if (line.page !== page) continue
    // (a line's size its run's, where the unit's runs are laid apart: layoutRuns)
    const LF = (line.seg ?? L).f, fs = LF * scale
    const [, by] = toPx(line.x0, line.baseline)
    // (the line's runs in their order: the upright ones in a <text> at its baseline, each oblique run a <text> of its own
    // between them, so that the copy, a search and every reader of the markup take the text in the line's order)
    let body = '', parts = ''
    for (const run of lineRuns(line, L)) {
      if (run.crop !== undefined) {
        // the formula's plain text, invisible, over its crop: copied and found with the rest
        const it = line.items[run.crop], [x] = toPx(it.x, line.baseline)
        if (it.t.crop.text) body += `<tspan class="${faceClass(faceOf({ fam: 'serif', design: 'times' }, 'latin', 'en'))}" x="${n2(x)}" y="${n2(by)}" font-size="${n2(fs * 0.9)}" fill-opacity="0">${esc(it.t.crop.text)}</tspan>`
        continue
      }
      const cls = faceClass(run.face)
      const fill = run.color ? ` fill="${fillAttr(run.color)}"` : ''
      // (v0: a role table face's size correction, 1 for the prototype's faces; small capitals the layer draws at their share, `sc`)
      const size = n2((run.sup ? fs * 0.62 : fs) * (run.face.size ?? 1) * (run.sc ?? 1))
      const y = run.sup ? n2(by - LF * 0.36 * scale) : n2(by)
      const cx = run.xs.map(x => toPx(x, line.baseline)[0])
      const xs = run.chars ? cx.map(n2).join(' ') : n2(cx[0])
      // a word laid out with tracking is drawn with it (single CJK characters carry it in their places)
      const ls = !run.chars && run.track ? ` letter-spacing="${n2(run.track * LF * scale)}"` : ''
      const span = `<tspan class="${cls}" x="${xs}" y="${y}" font-size="${size}"${ls}${fill}>${esc(run.text)}</tspan>`
      // (an oblique face, its own slant: the run's points skewed about its baseline, so its places and advance stay the
      // upright's; fonts.mjs CJK_SLANT_DEG for a CJK italic run in the role table's faces)
      if (run.face.oblique) {
        const ox = n2(cx[0])
        if (body) { parts += `<text y="${n2(by)}">${body}</text>`; body = '' }
        parts += `<text transform="translate(${ox} ${n2(by)}) skewX(${-run.face.oblique}) translate(${-ox} ${-n2(by)})">${span}</text>`
      } else body += span
    }
    out += parts && !body ? parts : `${parts}<text y="${n2(by)}">${body}</text>`
  }
  return `${out}</g>`
}

/** a face as svgOfUnit tells two apart: its CSS class's key (faceClass), with no class made */
const faceKey = face => `${face.family}|${face.weight}|${face.style}|${face.caps ? 1 : 0}`

/**
 * A laid line as svgOfUnit draws it, in order: each <tspan> of its text (a run) and each crop. A run is { face, chars, sup,
 * color, text, xs, track, items, sc }: `sc` the share of the size small capitals the layer draws are set at (none for any other
 * run); `xs` the PDF x of its start, or of each of its characters where it is a run of single CJK
 * characters (`chars`), each at its own place; `track` the tracking it is drawn with, em of the layout's size, after each
 * character; `items`, each item of the line drawn in it as [its index, the UTF-16 offset of its text in the run's]. A crop
 * is { crop: its item's index }. The one walk the SVG and the links read (links.mjs places a link over a run's characters by it)
 */
/** the least kern after a word that copies as a space (em): over a word space's floor in Computer Modern (2/9, shrunk), so a thin
 *  space (\\,: 1/6) and a medium one (\\:: 2/9) copy as none */
const COPY_SPACE_EM = 0.25
export function lineRuns(line, L) {
  const out = []
  // (a line's size and tracking its run's, where the unit's runs are laid apart: layoutRuns)
  const LS = line.seg ?? L
  let run = null
  const flush = () => { if (run) { out.push(run); run = null } }
  line.items.forEach((it, n) => {
    const t = it.t
    if (t.crop) { flush(); out.push({ crop: n }); return }
    if (t.space) {
      // the space is copied with the text before it (a run of single CJK characters takes it too: Korean and the
      // spaces around Latin words), though justification places what follows
      if (run) {
        run.items.push([n, run.text.length])
        run.text += ' '
        // a per-character run gives the space its own place, so that the characters after it keep theirs
        if (run.chars) run.xs.push(it.x)
      }
      return
    }
    const single = t.cls === 'cjk' && [...t.s].length === 1 && !t.sup
    // faces alike by their class (each token has a face object of its own): single CJK characters of one face share
    // a run, which keeps the DOM small (one tspan for a line's run, not one a character)
    // (and small capitals the layer draws at one share of the size, `sc`: a word's runs of one case are tspans of their own)
    const sameFace = run && faceKey(run.face) === faceKey(t.face) && run.face.oblique === t.face.oblique && run.sup === !!t.sup && run.color === t.st?.color && run.sc === t.sc
    if (single) {
      // single CJK characters share a run, each at its own place (justification between them included)
      if (!sameFace || !run.chars) {
        flush()
        run = { face: t.face, chars: true, sup: false, color: t.st?.color, text: '', xs: [], items: [] }
      }
      run.items.push([n, run.text.length])
      run.text += t.s
      run.xs.push(it.x)
    } else {
      // a word (Latin, or a Hangul word) flows in its face from its own place; words glued to it with no space
      // between flow on in the same run
      // (not after a lead's kern, whose width the run would not keep: TeX's \labelsep after a run-in name's joint)
      const glued = run && !run.chars && sameFace && !line.items[n - 1]?.t.space && !line.items[n - 1]?.t.kern && !line.items[n - 1]?.kern && line.items[n - 1]?.t.cls === t.cls && !t.brk
      if (!glued) {
        flush()
        run = { face: t.face, chars: false, sup: !!t.sup, color: t.st?.color, text: '', xs: [it.x], track: t.sup ? 0 : t.cls === 'cjk' ? LS.state.track : LS.state.trackLatin, items: [] }
        if (t.sc) run.sc = t.sc
      }
      run.items.push([n, run.text.length])
      run.text += t.s
    }
    // the line's last word: a space after it for the copy, where it is not hyphenated; and a word explicit glue of a space's
    // width or more follows on the line (\\enspace, \\quad: its item's kern), which the run after it starts on its own
    if (n === line.items.length - 1 && t.cls === 'latin' && !t.hyphenated) run.text += ' '
    else if (n < line.items.length - 1 && !run.chars && (it.kern ?? 0) >= COPY_SPACE_EM * LS.f) run.text += ' '
  })
  flush()
  return out
}

/**
 * Where a run of `lineRuns` draws its text: the PDF x of the edge before its UTF-16 offset `at` (its text's length: the edge
 * after its last character), as the browser lays the <tspan> out: from its start, the width of the text before `at` in its face
 * at the size it is drawn (measure: a run's width at 100 px, w100's), and its tracking after each character. A run of single
 * characters has each at its own place: the edge before one is its place, after its last the item's slot's end (`line`'s)
 */
export function runEdge(run, at, line, L, measure = w100) {
  if (run.chars) {
    // (each character of the run its own place: by its index in code points, the space's place among them)
    const cps = [...run.text.slice(0, at)].length
    if (cps < run.xs.length) return run.xs[cps]
    const [n] = run.items.at(-1)
    const it = line.items[n]
    return it.x + it.w
  }
  const before = run.text.slice(0, at)
  const LF = (line?.seg ?? L).f, f = LF * (run.sup ? 0.62 : 1) * (run.sc ?? 1)
  return run.xs[0] + (measure(before, run.face) * f) / 100 + (run.track ? run.track * LF * [...before].length : 0)
}

/**
 * The unit's lines on one page that stay the original's (a displayed formula's, and any line the unit keeps): their rectangles
 * with the baseline and size the unit's reading gave each (`prep.lineInfo`), in the unit's order, for the page's word table
 * (words.mjs), which writes each where the text's flow passes it: a line of a region a kept placeholder holds, where the text
 * breaks (finishUnit's `regionOf` and `referenced`: tokensOf2's `blockTo`), with its region (`region`) and the first of the
 * unit's pieces that holds it (`k`, its place in the translation); any other with the first of the unit's blocks (`blocks`,
 * blocks2's: their lines) that follows it in `rects` (`block`; the blocks' count where none does, none without blocks).
 * `rects`: the unit's rectangles [page, x0, bottom, x1, top]; none where it keeps none
 */
export function keptLines(rects, prep, page, blocks = null) {
  const keep = prep?.keep?.length ? new Set(prep.keep) : null
  if (!keep) return []
  // (each referenced region's first placeholder; each block by the index of its first line in rects)
  const firstK = new Map()
  for (const [k, r] of prep instanceof Map ? prep : []) {
    if (r?.mode !== 'kept' || r.region === undefined || !prep.referenced?.has(r.region)) continue
    const was = firstK.get(r.region)
    if (was === undefined || k < was) firstK.set(r.region, k)
  }
  let starts = null
  if (blocks?.length) {
    const index = new Map(rects.map((r, i) => [rectKey(r), i]))
    starts = blocks.map(b => (b.rects?.length ? index.get(rectKey(b.rects[0])) : undefined) ?? -1)
  }
  const out = []
  rects.forEach((r, i) => {
    if (r[0] !== page || !keep.has(rectKey(r))) return
    const info = prep.lineInfo?.get(rectKey(r))
    const line = { x0: r[1], x1: r[3], baseline: info?.baseline ?? r[2], size: info?.size ?? r[4] - r[2], top: r[4], bottom: r[2] }
    const g = prep.regionOf?.get(rectKey(r))
    if (g !== undefined && firstK.has(g)) Object.assign(line, { region: g, k: firstK.get(g) })
    else if (starts) { const b = starts.findIndex(s => s > i); line.block = b < 0 ? blocks.length : b }
    out.push(line)
  })
  return out
}

/**
 * A babel name's word as the layer draws it in `face` (run.mjs paintNames): { face, runs: [{ s, k }], text }. Where the layer
 * draws the face's small capitals itself (selfCaps: a name's small capitals are a face's of real ones, whose share no glyph of the
 * page tells), its runs of one case in the face with none asked, at SMALL_CAPS_RATIO; else the word whole. `text`: what is
 * drawn, for its face's slices, which are loaded before any of it is measured (runsWidth)
 */
export function nameRuns(text, face, to) {
  if (!selfCaps(face)) return { face, runs: [{ s: text, k: 1 }], text }
  const runs = caseRuns(text, SMALL_CAPS_RATIO, upperOf(to))
  return { face: { ...face, caps: false }, runs, text: runs.map(r => r.s).join('') }
}
/**
 * A name's word in its runs by script, as a unit's words are drawn (tokensOf2): its CJK characters (the rules' class, cjkClassRe of
 * `quotes`) in the target's CJK face, every other (a Latin word, a digit, a space) in the Latin face (`faceOf(cls)`, cls 'cjk' or
 * 'latin'), each run's small capitals the layer's where its face has none (nameRuns): { face (the first run's), runs: [{ s, k,
 * face }], text }. The CJK faces served hold no Latin letter or digit, so that one face for the whole of a word of two scripts
 * (an ideograph's word with a letter or a digit after it) refused it whole, its name left the original's
 */
export function nameScriptRuns(text, faceOf, to, quotes) {
  const re = cjkClassRe(quotes), parts = []
  for (const ch of text) {
    const cls = re.test(ch) ? 'cjk' : 'latin', last = parts.at(-1)
    if (last?.cls === cls) last.s += ch
    else parts.push({ cls, s: ch })
  }
  const runs = []
  for (const p of parts) { const r = nameRuns(p.s, faceOf(p.cls), to); for (const q of r.runs) runs.push({ s: q.s, k: q.k, face: r.face }) }
  return { face: runs[0]?.face ?? faceOf('latin'), runs, text: runs.map(r => r.s).join('') }
}
/** nameRuns' (or nameScriptRuns') word's width at size 1 (PDF units per unit of size): each run's in its face at its share */
export const runsWidth = ({ face, runs }) => runs.reduce((a, r) => a + widthOf(r.s, r.face ?? face) * r.k, 0)
/**
 * A babel name drawn in the target's word (run.mjs paintNames) as SVG: one <text> at its baseline (`baseline`, from `x`,
 * PDF units), its word in `face` at `size`, the face's own size correction applied, an oblique face skewed about its
 * baseline as a unit's run is (svgOfUnit); its runs of one case where the layer draws its small capitals (`runs`, nameRuns'),
 * each at its own place. `toPx(x, y)`: PDF to the SVG's CSS pixels; `scale`: CSS pixels per PDF unit
 */
export function svgOfName({ occurrence, text, x, baseline, size, face, color = null, runs = null }, toPx, scale) {
  const [px, py] = toPx(x, baseline)
  const fill = color ? ` fill="${fillAttr(color)}"` : ''
  // (small capitals the layer draws itself, nameRuns': each run of one case a <tspan> at its own x, at its share of the size)
  // (and its runs by script, nameScriptRuns': each in its own face, `r.face`, at its own x)
  let span = '', at = x
  if (runs?.length && !(runs.length === 1 && runs[0].k === 1)) {
    for (const r of runs) {
      const f = r.face ?? face
      span += `<tspan class="${faceClass(f)}" x="${n2(toPx(at, baseline)[0])}" y="${n2(py)}" font-size="${n2(size * scale * (f.size ?? 1) * r.k)}"${fill}>${esc(r.s)}</tspan>`
      at += widthOf(r.s, f) * r.k * size
    }
  } else {
    const f = runs?.[0]?.face ?? face
    span = `<tspan class="${faceClass(f)}" x="${n2(px)}" y="${n2(py)}" font-size="${n2(size * scale * (f.size ?? 1))}"${fill}>${esc(runs?.[0]?.s ?? text)}</tspan>`
  }
  const line = face.oblique ? `<text transform="translate(${n2(px)} ${n2(py)}) skewX(${-face.oblique}) translate(${-n2(px)} ${-n2(py)})">${span}</text>` : `<text y="${n2(py)}">${span}</text>`
  return `<g data-n="${occurrence}">${line}</g>`
}

/**
 * A figure's text drawn in the target's words (run.mjs paintFigures, the content class `figures`) as SVG: one <text> on its run's
 * baseline from `x`, `y` (PDF units, the place its anchor keeps), turned by `angle` (degrees anticlockwise, as the page's), its
 * runs (figureRuns: each { s, face }, one after the other along the baseline) each in its face at `size`, the face's own size
 * correction applied, in its fill (`color`, black where none). `toPx(x, y)`: PDF to the SVG's CSS pixels; `scale`: CSS pixels
 * per PDF unit
 */
export function svgOfFigure({ group, runs, x, y, angle, size, color = null }, toPx, scale) {
  const [px, py] = toPx(x, y)
  const fill = color ? ` fill="${fillAttr(color)}"` : ''
  const turn = Math.abs(angle) > 1e-6 ? ` rotate(${n2(-angle)})` : ''
  const spans = runs.map((r, i) => `<tspan class="${faceClass(r.face)}"${i ? '' : ' x="0" y="0"'} font-size="${n2(size * scale * (r.face.size ?? 1))}"${fill}>${esc(r.s)}</tspan>`).join('')
  return `<g data-f="${esc(group)}"><text transform="translate(${n2(px)} ${n2(py)})${turn}">${spans}</text></g>`
}
/** a figure's translation in its runs by script, each in its face (`faceOf(cls)`): its CJK characters (the rules' class,
 *  cjkClassRe of `quotes`) in the target's CJK face, every other (a Latin word, a digit, a space) in the Latin face, as a unit's
 *  words are drawn (tokensOf2): the CJK faces served hold no Latin, so that one face for the whole text refused it whole */
export function figureRuns(text, faceOf, quotes) {
  const cjkRe = cjkClassRe(quotes), runs = []
  for (const ch of text) {
    const cls = cjkRe.test(ch) ? 'cjk' : 'latin', last = runs.at(-1)
    if (last?.cls === cls) last.s += ch
    else runs.push({ cls, s: ch })
  }
  return runs.map(r => ({ s: r.s, face: faceOf(r.cls) }))
}
/** figureRuns' width at size 1 (PDF units per unit of size): each run's in its face */
export const figureRunsWidth = runs => runs.reduce((a, r) => a + widthOf(r.s, r.face), 0)

// ---- the scorer's view of a laid-out unit

/** the translated text's runs as drawn, by style key (class, weight, slant or its stand-in), placeholders' text left out */
export function drawnRuns(tokens) {
  const runs = []
  for (const t of tokens) {
    if (!t.s || t.sup || t.math || t.ph || !/\S/.test(t.s)) continue
    const key = styleKey(t.st)
    const n = [...t.s].length
    if (runs.at(-1)?.key === key) runs.at(-1).n += n
    else runs.push({ key, n })
  }
  return runs
}
/** runs whose style matches: the base (most characters) against the base, then the other runs as a multiset of
 *  their keys (a translation reorders its phrases: Japanese sets the verb last), each original run against a drawn
 *  run of the same class, weight and slant */
export function styleMatch(orig, drawn, drawnBase) {
  if (!orig?.runs?.length || !drawn.length) return { match: 0, total: 0 }
  const baseOf = runs => { const m = new Map(); for (const r of runs) m.set(r.key, (m.get(r.key) ?? 0) + r.n); return [...m].sort((a, b) => b[1] - a[1])[0][0] }
  // the original's base: its majority; the layer's: the style it gives the unit's text outside any group (a count of
  // characters would flip with the language: 14 Chinese characters say what 39 English letters did)
  const ob = orig.key ?? baseOf(orig.runs), db = drawnBase ?? baseOf(drawn)
  const count = (runs, base) => { const m = new Map(); for (const r of runs) if (r.key !== base) m.set(r.key, (m.get(r.key) ?? 0) + 1); return m }
  const oc = count(orig.runs, ob), dc = count(drawn, db)
  let both = 0
  for (const [k, n] of oc) both += Math.min(n, dc.get(k) ?? 0)
  const on = [...oc.values()].reduce((a, b) => a + b, 0), dn = [...dc.values()].reduce((a, b) => a + b, 0)
  return { match: (ob === db ? 1 : 0) + both, total: 1 + Math.max(on, dn), base: ob === db, ob, db }
}
