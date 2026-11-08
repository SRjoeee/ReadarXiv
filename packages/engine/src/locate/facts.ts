// The facts today's reader works out from the page's characters before it typesets (most of prepareUnit, and the readers the
// run calls around a lay: interfaces/typeset-inputs.md §1B-§1F), read once by the prepare on arXiv's page with exact ownership
// (stage 1a-2, contract stage1a2-facts.md). Each reading is pure, over a member's own glyphs and lines and the page's other
// ink; where today's rule had a threshold that only guarded its re-derivation of ownership, ownership answers instead and the
// threshold is gone; a threshold that is a typographic fact stays, named, with its source. File:line: today's engine at
// 065c1d973 (`L2` layer-proto/layer2.mjs, `RUN` run.mjs, `TEX` tex.mjs, `MAKE` layout/make.mjs).
import type { Ink, Line, Piece, Style } from '@readarxiv/format'
import type { DocGlyph } from '../doc.ts'
import { r2 } from './lines.ts'
// @ts-ignore: JavaScript copied as it is, typed below (never through today.types.ts: today's makers it loads import this file
// back, deps.mjs's classifyFont, and a cycle leaves one of them uninitialised where they load first, the parity's join)
import * as accents from './today/accents.mjs'

// ---------------------------------------------------------------- fonts (today's fonts.mjs classifyFont, ported as it is)
/** the PostScript name without its subset tag */
const bare = (name: string) => String(name ?? '').replace(/^[A-Z]{6}\+/, '')
export interface FontClass {
  fam: 'serif' | 'sans' | 'mono' | 'math'
  bold: boolean
  italic: boolean
  caps: boolean
}
/** a PDF font's class, weight, slant and small capitals from its PostScript name: today's classifyFont
 *  (layer-proto/fonts.mjs:42 at 065c1d973), its `design` and PDF.js's fallback guess left out (no rule of the part reads them) */
export function classifyFont(name: string): FontClass {
  const n = bare(name)
  let fam: FontClass['fam'] = 'serif'
  if (
    /^(cmmi|cmsy|cmex|msam|msbm|eufm|eufb|eusm|eu(ex|rm|rb)\d|mt(mi|sy|ex|mib|syb)|rsfs|cmbsy|cmmib|stmary|wasy|txsy|txex|txmi|pxsy|pxex|pxmi|lmmath|latinmodern-math|stixmath|stixtwomath|xitsmath|cambria-?math|esint|bbold|bbm|dsrom|ntxmi|ntxsy|ntxexx|ntxbmi|newtxmi|newtxbmi|newpxmi|newpxbmi|newtxsy|newpxsy|zxmi|zplmi|mathdesign|mdbch|symbol|euler|lasy|line10|lcircle|futs|futm|mnsymbol|esstix|txmia|pxmia)/i.test(
      n,
    ) ||
    /math|symbol/i.test(n)
  )
    fam = 'math'
  else if (
    /mono|courier|typewriter|inconsolata|consol|menlo|^(cm|lm|ec|tc)tt|^sftt|^txtt|^pcr|beramono|sourcecode|firamono|cmvtt|^zi4|nimbusmon|letter ?gothic/i.test(
      n,
    )
  )
    fam = 'mono'
  else if (
    /sans|helvetica|arial|^(cm|lm)ss|^sfs[sxi]|^cmssbx|nimbussan|biolinum|grotesk|verdana|roboto|^lato|opensans|sourcesans|firasans|calibri|avant|futura|frutiger|myriad|segoe|tahoma|gillsans|optima|cabin|raleway|montserrat|^inter|heros|^phv|^uhvr|^qhv|arimo|dejavusans/i.test(
      n,
    )
  )
    fam = 'sans'
  const bold =
    /bold|black|heavy|semibold|demibold|demi\b|-medi(?:ital)?$|-medi\b|^(cm|lm|ec)bx|^cmb\d|^sfbx|^sfsx|^cmssbx|^cmbxti|^cmmib|^cmbsy|-bd\b|^ptmb|^phvb|^linlibertinet?b|linlibertinetbi?$|libertinetb|-bol$|extrabold|ultrabold|-sb$/i.test(
      n,
    )
  const italic =
    /italic|ital\b|ital$|oblique|slant|kursiv|inclined|^(cm|lm)ti|^cmsl|^sfti|^sfsl|^sfsi|^sfbi|^cmbxti|^cmbxsl|^cmssi|^cmitt|^cmsltt|^cmmi|-it$|-bi$|linlibertineti|linlibertinetbi|linbiolinumti|-ita?$|italicmt|obliquemt/i.test(
      n,
    )
  const caps = /caps|^cmcsc|^sfcc|^sfxc|smallcap|-sc$|sc\d*$|^cmtcsc|^lmromancaps/i.test(n) && !/^cmsc/i.test(n)
  return { fam, bold, italic, caps }
}

const mostOf = <T>(xs: Iterable<T>): T | undefined => {
  const n = new Map<T, number>()
  let best: T | undefined
  let k = 0
  for (const x of xs) {
    const c = (n.get(x) ?? 0) + 1
    n.set(x, c)
    if (c > k) {
      k = c
      best = x
    }
  }
  return best
}
const real = (g: { u: string }) => /\S/.test(g.u)
/** what a style is read off a glyph by: its Unicode, its font's base name, its size (up its line; `along` it, where that differs)
 *  and its fill. A glyph set level is one (DocGlyph); so is one set turned (DocTurned, a figure's turned text), whose font, size
 *  and fill are as much the PDF's as a level one's */
export type StyleGlyph = Pick<DocGlyph, 'u' | 'base' | 'size' | 'fill'> & { along?: number | undefined }
/** a turned glyph as a style reads it */
export const turnedStyleGlyph = (t: { u: string; base: string; size: number; fill?: number }): StyleGlyph => ({
  u: t.u,
  base: t.base,
  size: t.size,
  fill: t.fill ?? -1,
})

/** the font class a style is voted by (styleOf): a glyph's role (a math font's the serif's), weight and slant, by its font's
 *  base name, as `role|b|i` */
export function faceKeyOf(base: string): string {
  const c = classifyFont(base)
  return `${c.fam === 'math' ? 'serif' : c.fam}|${c.bold ? 'b' : ''}|${c.italic ? 'i' : ''}`
}
/** a style's font class, as faceKeyOf writes a glyph's */
export const styleKeyOf = (st: Pick<Style, 'role' | 'bold' | 'slant'>): string =>
  `${st.role}|${st.bold ? 'b' : ''}|${st.slant ? 'i' : ''}`

/**
 * The style a run of glyphs is set in, as today's reader reads it off the page (C5 `originalStyle` L2:765: the majority font
 * class by character, math glyphs aside, its size the most common one; C5's `upper` L2:1099: most letters that can tell are
 * capitals): role, bold, slant from the fonts' names, size, fill (0xRRGGBB where not black), the design (the dominant font's
 * base name). TeX's own font state is stage 1b's: this is the value read, not stated
 */
export function styleOf(gs: readonly StyleGlyph[], fallbackSize = 10, source: string | null = null): Style {
  const txt = gs.filter(real)
  const text = txt.filter((g) => classifyFont(g.base).fam !== 'math')
  const by = text.length ? text : txt
  const key = mostOf(by.map((g) => faceKeyOf(g.base)))
  const [role, b, i] = (key ?? 'serif||').split('|') as [Style['role'], string, string]
  const size = mostOf(by.map((g) => r2(g.size))) ?? fallbackSize
  const fill = mostOf(by.map((g) => g.fill))
  const design = mostOf(by.map((g) => g.base))
  const letters = text.filter((g) => g.u.toLowerCase() !== g.u.toUpperCase())
  // (with its source's text, today's rule (smallCapsOf L2:837, L2:1099): capitals the source writes lowercase, more than half
  // of its lowercase letters, set at their full size: a class's \MakeTextUppercase heading; an acronym the source writes in
  // capitals is no case change. Without it, most letters capitals)
  const capitals = letters.filter((g) => g.u === g.u.toUpperCase())
  const srcLows = source === null ? 0 : [...source].filter((c) => c !== c.toUpperCase() && c === c.toLowerCase()).length
  const glyphLows = letters.length - capitals.length
  const upper =
    source === null
      ? letters.length > 1 && capitals.length > letters.length / 2
      : srcLows > 0 && 2 * (srcLows - glyphLows) > srcLows && capitals.length > 0
  return {
    role,
    size,
    ...(b ? { bold: 1 as const } : {}),
    ...(i ? { slant: 1 as const } : {}),
    ...(upper ? { upper: 1 as const } : {}),
    ...(fill !== undefined && fill > 0 ? { fill } : {}),
    ...(design ? { design } : {}),
  }
}

/**
 * A unit's size as today's reader reads it (C5, E6: layer2.mjs originalStyle L2:765 and unitSizeOf L2:796): the median (the
 * upper one of an even count) of its own text glyphs' sizes, its math fonts' glyphs aside; undefined where it has none (today
 * then reads the size off its lines' bands). Each glyph's size up the line, the size TeX was asked for: pdfTeX's font expansion
 * (microtype) scales a justified line's glyphs along it alone, by up to 2 % either way, to justify that line, and today's
 * pageChars2 (L2:188) read the size along it (PDF.js's item transform, Math.hypot(a, b)): a paragraph whose lines TeX stretched
 * read larger than its font, one it shrank smaller (2610.40645v1 p12: \normalsize paragraphs at 10.69 to 11.13, every glyph
 * 10.91 up its line), which a lay that keeps its size (borrowing before shrinking) then drew larger than the original. Faked
 * small capitals, which today leaves out by its votes over the source's words (smallCapsOf), are not told here (stage 1b:
 * TeX's font state)
 */
export function unitSize(gs: readonly StyleGlyph[]): number | undefined {
  const sizes = gs
    .filter((g) => real(g) && classifyFont(g.base).fam !== 'math')
    .map((g) => g.size)
    .sort((a, b) => a - b)
  // (as the page states it, not on the coordinates' 1/100 grid: a size is a font's scale, which the lay multiplies every width
  // by; pdfTeX writes 10 pt as 9.9626 bp, and 9.96 set a 240 pt line 0.06 pt short of today's)
  return sizes.length ? (sizes[sizes.length >> 1] as number) : undefined
}

// ---------------------------------------------------------------- faked small capitals (C7)
/** a faked small capital is set at most this share of the size the unit's letters of the source's case are (today's
 *  SMALL_CAPS_SHARE, L2:808: a fact of the classes that fake them) */
export const SMALL_CAPS_SHARE = 0.9
const casedChar = (ch: string) => ch.toLowerCase() !== ch.toUpperCase()
const medianOf = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? ((s[(s.length - 1) >> 1] as number) + (s[s.length >> 1] as number)) / 2 : 0
}
/**
 * A unit's faked small capitals, as today's reader reads them (smallCapsOf L2:837, inkSmallCaps L2:910): its text glyphs on
 * A walked in order against its source's letters (each glyph's letter the source's next one of the same letter, case aside);
 * a capital whose source letter is lowercase and whose size is at most SMALL_CAPS_SHARE of the size its letters of the
 * source's own case are set at is a faked small capital; `ratio` their median size over that, to the hundredth (Style.sc, the
 * share the typesetter fakes its own at). A unit whose source is its own case (an ink unit, whose source is the page's own
 * text) or none told (a babel name, whose key is no text of it: IEEEtran's \refname "REFERENCES", R at 9.96 and EFERENCES at
 * 7.97, where \scshape changes the letters' forms and not the size TeX was asked for): where every cased glyph is a capital,
 * those at most SMALL_CAPS_SHARE of its full letters' size (the letters past SMALL_CAPS_SHARE of its largest). A
 * unit whose page sets half its source's lowercase letters or more, and no small capital, has none (today's shortcut).
 * `upper`, in the text's capitals: the capitals the source writes lowercase set at their full size, more than half of its
 * letters that can tell (today's L2:1099); where no letter is of the source's own case, every one set as a capital, there is
 * no size to tell a small capital by, and none is (drawn at the unit's size, theirs, the target's capitals look as the page's
 * do: REVTeX's "RELATED WORK"; today's walk answers none there). A unit whose source is its own case (an ink unit, or none
 * told): every letter that can tell a capital, two at least, none faked small (a running head's "ABSTRACT"; "BERT (Ours)" is
 * set in its own case; today's inkSmallCaps answers none). `caps`, set in small capitals where it has faked ones: today's vote
 * (capsVote L2:933, read at L2:1094) over the letters the walk read, a faked small capital or a glyph of a face of real small
 * capitals for, a letter the source writes lowercase set as itself against, the rest (digits, the source's own capitals)
 * nothing, a tie against; an ink unit's faked ones alone can tell, so it is set in them (Style.caps: its Latin translation is
 * drawn in small capitals, Style.sc the share it is drawn at)
 */
export function fakedCaps<G extends StyleGlyph>(
  gs: readonly G[],
  source: string | null,
  ink = false,
): { small: Set<G>; ratio?: number; upper?: true; caps?: true } {
  const none = { small: new Set<G>() }
  const t = gs.filter((g) => real(g) && classifyFont(g.base).fam !== 'math' && g.size > 0)
  if (!t.length) return none
  let big = 0
  for (const g of t) if (g.size > big) big = g.size
  if (ink || source === null) {
    // (its source its own case: in the text's capitals where every letter of it that can tell is a capital, two at least, and
    // none a faked small capital; a lowercase letter among them says it is set in its own case, which its translation keeps)
    const cased = t.filter((g) => casedChar(g.u))
    const capitals = cased.every((g) => g.u === g.u.toUpperCase())
    const upper = capitals && cased.length > 1 ? { upper: true as const } : {}
    if (!capitals) return none
    const ref = medianOf(t.filter((g) => g.size > SMALL_CAPS_SHARE * big).map((g) => g.size))
    const small = new Set(cased.filter((g) => g.size <= SMALL_CAPS_SHARE * ref))
    return small.size
      ? { small, ratio: Math.round((100 * medianOf([...small].map((g) => g.size))) / ref) / 100, caps: true }
      : { ...none, ...upper }
  }
  const isLow = (ch: string) => /\p{Ll}/u.test(ch)
  const lows = t.filter((g) => isLow(g.u)).length
  const anySmall = t.some((g) => g.size <= SMALL_CAPS_SHARE * big && g.u !== g.u.toLowerCase())
  const src = [...source]
  if (!anySmall && 2 * lows >= src.filter(isLow).length) return none
  // (each glyph's letter the source's next one that spells it, case aside: the walk today makes over a word's characters)
  const changed: G[] = []
  const same: number[] = []
  // (each glyph the walk read, and whether its source letter is a lowercase one: the letters today's vote reads)
  const walked: [G, boolean][] = []
  let lower = 0
  let at = 0
  for (const g of t) {
    const key = g.u.normalize('NFKD').toLowerCase()
    let k = at
    while (k < src.length && src[k]!.normalize('NFKD').toLowerCase() !== key) k++
    if (k >= src.length) continue
    at = k + 1
    const s0 = src[k]!
    const low = casedChar(s0) && s0 === s0.toLowerCase()
    walked.push([g, low])
    if (low) lower++
    if (low && casedChar(g.u) && g.u === g.u.toUpperCase()) changed.push(g)
    else same.push(g.size)
  }
  // (no letter of the source's own case: no size to tell a small capital by, none is)
  const ref = same.length ? medianOf(same) : Number.NaN
  const small = new Set(same.length ? changed.filter((g) => g.size <= SMALL_CAPS_SHARE * ref) : [])
  // (in the text's capitals: the capitals the source writes lowercase set at their full size, more than half its letters that
  // can tell (today's `upper`, L2:1099); a faked small capital is none)
  const upperN = changed.length - small.size
  const upper = upperN > 0 && 2 * upperN > lower ? { upper: true as const } : {}
  if (!small.size) return { ...none, ...upper }
  let yes = 0
  let no = 0
  for (const [g, low] of walked)
    if (small.has(g) || classifyFont(g.base).caps) yes++
    else if (low) no++
  return {
    small,
    ratio: Math.round((100 * medianOf([...small].map((g) => g.size))) / ref) / 100,
    ...upper,
    ...(yes > no ? { caps: true as const } : {}),
  }
}

/** an element's fill (B14, maker `fillOfGlyphs` MAKE:1123): the colour more than half its glyphs are filled with, where it is
 *  not black; undefined else */
export function fillOfGlyphs(gs: readonly DocGlyph[]): number | undefined {
  const t = gs.filter(real)
  const f = mostOf(t.map((g) => g.fill))
  if (f === undefined || f <= 0) return undefined
  return t.filter((g) => g.fill === f).length * 2 > t.length ? f : undefined
}

// ---------------------------------------------------------------- the class's tail (C20)
/** the most marks a class sets after a unit's text (amsthm's note ")."; a run-in head's "."; a style's stop after an entry):
 *  today's TAIL_MAX (L2:1577), a fact of the classes */
export const TAIL_MAX = 3
const SENTENCE_KINDS = new Set(['stop', 'comma', 'semi', 'colon', 'excl', 'quest'])
/** the text a unit's source writes in its text pieces, its groups' too (no element's source) */
export function sourceText(content: readonly Piece[]): string {
  let out = ''
  for (const p of content) {
    if (p.t === 'text') out += p.s
    else if (p.t === 'span') out += sourceText(p.content)
  }
  return out
}
/** the code points whose default bidirectional class is R or AL (UAX #9 §3.2's defaults, DerivedBidiClass.txt's @missing
 *  ranges: Hebrew to Arabic Extended-A, the Hebrew and Arabic presentation forms, and the supplementary planes' right-to-left
 *  blocks); a letter there is a strong right-to-left character */
const RTL_LETTER = /^[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]$/u
const LETTER = /^\p{L}$/u
/**
 * Whether a unit's text runs right to left: its paragraph direction by UAX #9's P2 and P3 over its source text, the first strong
 * character's (a letter: right to left where its default class is R or AL, left to right else), its elements passed over as an
 * isolate is (a formula, a citation); left to right where it has no letter (Line.flags' RTL: the order of its characters along
 * its lines, which a link's reading order follows)
 */
export function rightToLeft(content: readonly Piece[]): boolean {
  for (const ch of sourceText(content)) if (LETTER.test(ch)) return RTL_LETTER.test(ch)
  return false
}
/** PDF.js's text content's spaces (pdf.worker evaluator compareWithLastPosition and addFakeSpaces): a glyph whose advance
 *  starts past the one before's end by more than TRACKING_SPACE_FACTOR of the font's size along the line, or on another
 *  line (its baseline moved by more than half the size: an end of line), is a space after it in the text layer */
export const TRACKING_SPACE_FACTOR = 0.102
/** whether glyph `g` is set on another line than `p`, the one before it: its baseline moved by more than half the size */
export const lineChange = (p: DocGlyph, g: DocGlyph) => Math.abs(g.y - p.y) > 0.5 * Math.max(p.size, g.size)
/** the hyphens a line may end in, TeX's own and a word's */
const HYPHENS = new Set(['-', '\u2010', '\u00ad'])
const LETTERS = /^\p{L}+$/u
/** the fewest letters TeX leaves before its hyphen and after it: \lefthyphenmin, \righthyphenmin (LaTeX's, English's) */
const LEFT_HYPHEN_MIN = 2
const RIGHT_HYPHEN_MIN = 3
/** whether glyph `b` stands apart from `a` before it, as PDF.js reads a space: past it by more than TRACKING_SPACE_FACTOR */
export const apart = (a: DocGlyph, b: DocGlyph) => b.x0 - a.x1 > TRACKING_SPACE_FACTOR * (a.along ?? a.size)
/** what a reading of an element's text knows of its source: `literal` (a URL, a code mark: TeX sets its characters as written),
 *  `source` (the TeX the element and its unit are written in, where the word a line's end breaks may be stated) */
export interface LineEndOptions {
  literal?: boolean
  source?: string
}
const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** what a source says of the word a line's end breaks after `before` and before `after`: `hyphen` where it writes the word
 *  with a hyphen there (`anti-inflammatory`), `joined` where it writes it whole (`TensorCast`; TeX's own discretionary `\-`
 *  is no hyphen of the word's), null where it writes neither, or both */
function stated(source: string, before: string, after: string): 'hyphen' | 'joined' | null {
  if (!source) return null
  const text = source.replace(/\\-/g, '').replace(/[{}]/g, '')
  const has = (word: string) => new RegExp(`(?<!\\p{L})${escapeRe(word)}(?!\\p{L})`, 'u').test(text)
  const hyphen = has(`${before}-${after}`)
  const joined = has(before + after)
  return hyphen === joined ? null : hyphen ? 'hyphen' : 'joined'
}
/**
 * What a line's end before glyph q is, in an element's text: `space` (PDF.js's end of line), `join` where the line ends in a
 * hyphen right after a letter and the next begins with a letter (inside a word: `Lee-|Thorp` is "Lee-Thorp", no space), `drop`
 * where that hyphen is TeX's own break of a word, which TeX sets at a line's end and nowhere else (`Rad-|ford` is "Radford":
 * 1810.04805v2's citation, which staging drew as "Rad- ford" in the translation). The glyphs cannot tell a word's hyphen from
 * TeX's; the source can, where it states the word (stated: the element's own TeX, its unit's text): its hyphen kept where the
 * source writes one (`anti-|inflammatory`), out where it writes the word whole (`Tensor-|Cast`, where it writes TensorCast). Where
 * it does not, TeX's rules for its hyphen decide (the TeXbook ch. 14, tex.web §894-899): it hyphenates the first word after a space alone, non-letters before it skipped (`(Col-lobert`; not
 * `arXiv:gr-|qc`, `imrn/article-|pdf`), and leaves at least \lefthyphenmin letters before its hyphen and \righthyphenmin after
 * it (not `[hep-|th]`), and no word an explicit hyphen follows before the next space (its discretionary stops it, §899:
 * not `extreme-|mass-ratio`); never in a typewriter face (LaTeX sets their \hyphenchar to −1) nor in text it sets as written
 * (`literal`: a URL, a code mark). And a change of case across the hyphen is a compound's own hyphen, TeX's falling inside a
 * word: a capital after it (`Lee-|Thorp`), or capitals alone before it (`SWE-|bench`, `BERT-|based`)
 */
export function lineEnd(gs: readonly DocGlyph[], q: number, o: LineEndOptions): 'space' | 'join' | 'drop' {
  const h = gs[q - 1] as DocGlyph
  const g = gs[q] as DocGlyph
  if (!HYPHENS.has(h.u) || !/^\p{L}/u.test(g.u)) return 'space'
  // (the word before it on its line, and whether it is the first after a space: only non-letters between them)
  let before = ''
  let k = q - 2
  for (; k >= 0; k--) {
    const a = gs[k] as DocGlyph
    if (!LETTERS.test(a.u) || lineChange(a, h) || apart(a, gs[k + 1] as DocGlyph)) break
    before = a.u + before
  }
  if (!before) return 'space'
  let first = true
  for (; k >= 0; k--) {
    const a = gs[k] as DocGlyph
    const b = gs[k + 1] as DocGlyph
    if (lineChange(a, b) || apart(a, b) || /\s/u.test(a.u)) break
    if (/\p{L}|\p{N}/u.test(a.u)) {
      first = false
      break
    }
  }
  // (the word after it, on the next line, and whether a hyphen of its own follows it before a space)
  let after = ''
  let j = q
  for (; j < gs.length; j++) {
    const b = gs[j] as DocGlyph
    if (!LETTERS.test(b.u) || lineChange(g, b) || (j > q && apart(gs[j - 1] as DocGlyph, b))) break
    after += b.u
  }
  let own = false
  for (; j < gs.length && !own; j++) {
    const b = gs[j] as DocGlyph
    if (lineChange(g, b) || apart(gs[j - 1] as DocGlyph, b) || /\s/u.test(b.u)) break
    own = HYPHENS.has(b.u)
  }
  // (the source decides where it states the word; TeX's rules where it does not)
  const said = after ? stated(o.source ?? '', before, after) : null
  if (said) return said === 'hyphen' ? 'join' : 'drop'
  const tex =
    !o.literal &&
    first &&
    !own &&
    [...before].length >= LEFT_HYPHEN_MIN &&
    [...after].length >= RIGHT_HYPHEN_MIN &&
    /^\p{Ll}/u.test(after) &&
    before !== before.toUpperCase() &&
    classifyFont(h.base).fam !== 'mono'
  return tex ? 'drop' : 'join'
}
/** a glyph as accents.mjs reads one: its Unicode, font, size, its advance along its line, its baseline and its ink's top */
type AccentGlyph = Pick<DocGlyph, 'u' | 'font' | 'size' | 'x0' | 'x1' | 'y' | 'top'>
/** each spacing accent's combining mark (accents.mjs COMBINING) */
const COMBINING = accents.COMBINING as ReadonlyMap<string, string>
/** whether spacing accent `a` is set over letter `l` by TeX's \accent: the letter's accented form (NFC), or null */
const accentOver = accents.accentOver as (a: AccentGlyph, l: AccentGlyph) => string | null
/**
 * A run of glyphs (in stream order) with each spacing accent TeX set over its letter joined to that letter: one glyph, the
 * letter's, its text the accented letter. In Unicode an accent set over a letter is one character with it (NFC); TeX's
 * \accent (OT1's, every Computer Modern text font's) sets the accent, moves back over it and sets the letter (or the letter,
 * then the accent over it), so the glyphs read the two apart: "Kl¨otergens" for Klötergens (2602.23285v2 p2's citation; 44
 * element texts of 11 papers of the corpus). The rule is today's, one for every reading of text off a page's glyphs
 * (today/accents.mjs accentOver: one font, the accent's advance centred on the letter's, its baseline the letter's or raised
 * over it by at most its height; the reader's joinAccents on the page's text items, the prepare's on its ink units' and
 * figures' words), each glyph joined once, the accent's letter the glyph after it, else the one before
 */
export function joinAccents(gs: readonly DocGlyph[]): readonly DocGlyph[] {
  const joined = new Map<number, string>()
  gs.forEach((a, i) => {
    if (!COMBINING.has(a.u) || joined.has(i)) return
    for (const l of [i + 1, i - 1]) {
      const letter = gs[l]
      if (!letter || joined.has(l)) continue
      const ch = accentOver(a, letter)
      if (ch === null) continue
      joined.set(i, '')
      joined.set(l, ch)
      return
    }
  })
  if (!joined.size) return gs
  return gs.flatMap((g, i) => {
    const t = joined.get(i)
    return t === undefined ? [g] : t ? [{ ...g, u: t }] : []
  })
}
/** a run of glyphs as the page's text layer reads it, today's rendering's text (tex.mjs renderingOf: the text layer's
 *  characters inside its segments, a space of it between two of them, white space as one space, trimmed), but for a line
 *  TeX ended inside a word (lineEnd): its hyphen out where it is TeX's, and no space; each accent TeX set over its letter
 *  joined to it (joinAccents) */
export function textOf(glyphs: readonly DocGlyph[], o: LineEndOptions = {}): string {
  const gs = joinAccents(glyphs)
  let out = ''
  gs.forEach((g, q) => {
    const p = gs[q - 1]
    if (p) {
      const size = p.along ?? p.size
      if (lineChange(p, g)) {
        const end = lineEnd(gs, q, o)
        if (end === 'drop') out = out.slice(0, -p.u.length)
        else if (end === 'space') out += ' '
      } else if (g.x0 - p.x1 > TRACKING_SPACE_FACTOR * size) out += ' '
    }
    out += g.u
  })
  return out.replace(/\s+/g, ' ').trim()
}
/** a URL's copy text, its glyphs' text as textOf reads it but for a line's end: TeX's url package breaks a URL after one of its
 *  characters with no space, and sets no hyphen of its own (a hyphen at a line's end is the URL's, 9 of the corpus's 343 URLs
 *  over lines), so a line change adds nothing and drops nothing. A gap between two glyphs on one line stays a space: it is a
 *  rule TeX drew for an underscore, or the space of a macro's text (an eprint's "id [cs.SE]"), which the glyphs cannot tell
 *  apart and a space does not lose */
export function urlCopyOf(gs: readonly DocGlyph[]): string {
  let out = ''
  gs.forEach((g, q) => {
    const p = gs[q - 1]
    if (p && !lineChange(p, g) && apart(p, g)) out += ' '
    out += g.u
  })
  return out.replace(/\s+/g, ' ').trim()
}
/** a run of glyphs as the text layer reads it, in runs of one fill (today's fillRunsOf L2:2920: each space the fill of the glyph
 *  before it), [text, fill] each, a line's end and an accent as textOf reads them; null where every glyph's fill is one (its
 *  style's) */
export function fillRunsOf(glyphs: readonly DocGlyph[], o: LineEndOptions = {}): [string, number][] | null {
  const gs = joinAccents(glyphs)
  const runs: [string, number][] = []
  const push = (ch: string, f: number) => {
    const last = runs.at(-1)
    if (last && last[1] === f) last[0] += ch
    else runs.push([ch, f])
  }
  gs.forEach((g, q) => {
    const p = gs[q - 1]
    if (p) {
      const size = p.along ?? p.size
      if (lineChange(p, g)) {
        const end = lineEnd(gs, q, o)
        if (end === 'drop') {
          const last = runs.at(-1) as [string, number]
          last[0] = last[0].slice(0, -p.u.length)
          if (!last[0]) runs.pop()
        } else if (end === 'space') push(' ', p.fill)
      } else if (g.x0 - p.x1 > TRACKING_SPACE_FACTOR * size) push(' ', p.fill)
    }
    for (const ch of g.u) /\s/.test(ch) ? push(' ', g.fill) : push(ch, g.fill)
  })
  // (white space as one space, trimmed, as textOf)
  const out: [string, number][] = []
  for (const [t, f] of runs) {
    const prevEnds = /\s$/.test(out.at(-1)?.[0] ?? '')
    const u = t.replace(/\s+/g, ' ').replace(prevEnds ? /^ / : /$^/, '')
    if (!u) continue
    if (out.at(-1)?.[1] === f) out.at(-1)![0] += u
    else out.push([u, f])
  }
  if (out[0]) out[0][0] = out[0][0].replace(/^\s+/, '')
  if (out.at(-1)) out.at(-1)![0] = out.at(-1)![0].replace(/\s+$/, '')
  const kept = out.filter(([t]) => t.length)
  return new Set(kept.map(([, f]) => f)).size > 1 ? kept : null
}
/** an element's own brackets: its first and last glyphs that set ink, where they pair ([ ], ( ), { }, ⟨ ⟩) around more (T12) */
export function bracketsOf(gs: readonly DocGlyph[]): [DocGlyph, DocGlyph] | null {
  const PAIRS: Record<string, string> = { '[': ']', '(': ')', '{': '}', '\u27e8': '\u27e9' }
  const tg = gs.filter((x) => /\S/.test(x.u))
  const b0 = tg[0],
    b1 = tg.at(-1)
  return tg.length > 2 && b0 && b1 && PAIRS[b0.u] === b1.u ? [b0, b1] : null
}

/** a mark's kind (today's markKind L2:2363) */
export function markKind(ch: string): string {
  if (/^[.\u3002\uFF0E\uFF61]$/u.test(ch)) return 'stop'
  if (/^[,\u3001\uFF0C\uFF64]$/u.test(ch)) return 'comma'
  if (/^[;\uFF1B]$/u.test(ch)) return 'semi'
  if (/^[:\uFF1A]$/u.test(ch)) return 'colon'
  if (/^[!\uFF01]$/u.test(ch)) return 'excl'
  if (/^[?\uFF1F]$/u.test(ch)) return 'quest'
  if (/^[)\]}\uFF09\uFF3D\uFF5D\u3009\u300B\u300D\u300F\u3011\u3015\u3017\u3019\u301B’”]$/u.test(ch)) return 'close'
  return ch
}
const TEX_TOKEN = /\\[A-Za-z@]+\*?|\\[\s\S]|---|--|''|``|[\s\S]/gu
const NO_INK = new Set(['\\@', '\\,', '\\;', '\\:', '\\!', '\\/', '\\ ', '\\-', '~', '{', '}'])
const TEX_LIGATURE: Record<string, string> = {
  '---': '—',
  '--': '–',
  "''": '”',
  '``': '“',
  '`': '‘',
  "'": '’',
  '"': '”',
}
/** the marks a source text ends with after its last letter or digit, as TeX prints them, and whether that content was
 *  reached (today's textEndMarks L2:1587; a command but a symbol's is a word: its text unknown here, it stops the marks) */
function textEndMarks(s: string): { marks: string[]; stopped: boolean } {
  const toks = String(s).match(TEX_TOKEN) ?? []
  const marks: string[] = []
  for (let i = toks.length - 1; i >= 0; i--) {
    const t = toks[i] as string
    if (/^\s$/u.test(t) || NO_INK.has(t)) continue
    if (t.length > 1 && t[0] === '\\' && /^\\[A-Za-z]/.test(t)) return { marks, stopped: true }
    const ch = t.length > 1 && t[0] === '\\' ? t.slice(1) : (TEX_LIGATURE[t] ?? t)
    if (/[\p{L}\p{N}]/u.test(ch)) return { marks, stopped: true }
    marks.unshift(...ch)
  }
  return { marks, stopped: false }
}
/** the element kinds that set no ink (today's phClass `zero`, `space`): passed over at a unit's end */
const INKLESS_KINDS = new Set(['zero', 'space', 'other'])
/** the marks a unit's source writes at its end, after its last letter, digit or element (today's sourceEndMarks L2:1608):
 *  null where a symbol element stands among them (its ink is among the page's marks there, as many as its source does not
 *  tell) */
export function sourceEndMarks(content: readonly Piece[]): string[] | null {
  const flat: Piece[] = []
  const walk = (ps: readonly Piece[]) => {
    for (const p of ps) {
      if (p.t === 'span') walk(p.content)
      else flat.push(p)
    }
  }
  walk(content)
  const out: string[] = []
  for (let k = flat.length - 1; k >= 0; k--) {
    const p = flat[k] as Piece
    if (p.t === 'el') {
      if (INKLESS_KINDS.has(p.kind)) continue
      // (a symbol, today's phClass `symbol`: an escaped character, \\%)
      if (p.kind === 'symbol' || /^\\[^A-Za-z\s]$/.test(p.src.trim())) return null
      break
    }
    if (p.t !== 'text') break
    const r = textEndMarks(p.s)
    out.unshift(...r.marks)
    if (r.stopped) break
  }
  return out
}
/** a glyph a text font sets as punctuation (not a formula's: a math font's glyph is the formula's; not one whose Unicode is no
 *  reading of it, `nu`: today's L2:1666) */
const isMark = (g: DocGlyph) => /^\p{P}$/u.test(g.u) && !g.nu && classifyFont(g.base).fam !== 'math'
/**
 * The class's own marks after a unit's text (C20, today's tailOf L2:1638): its own glyphs on its last line after its last
 * letter, digit or element glyph (`after`, in stream order), less the marks its source writes there itself (`ends`, as many,
 * a sentence mark of the source's kind matched with the page's), each a punctuation mark in a text font, TAIL_MAX at most;
 * with its style. Today's test that the marks are "the unit's, erased as text" is ownership itself: `after` are the unit's
 * own text glyphs
 */
export function tailOf(after: readonly DocGlyph[], ends: readonly string[] | null): [string, Style][] | null {
  if (ends === null) return null
  const a = after.filter(real)
  const n = ends.length
  if (a.length <= n) return null
  let from = n
  const lastEnd = ends[n - 1]
  while (
    n > 0 &&
    lastEnd !== undefined &&
    from < a.length &&
    SENTENCE_KINDS.has(markKind(lastEnd)) &&
    markKind((a[from] as DocGlyph).u) === markKind(lastEnd)
  )
    from++
  const rest = a.slice(from)
  if (!rest.length || rest.length > TAIL_MAX || rest.some((g) => !isMark(g))) return null
  return rest.map((g) => [g.u, styleOf([g], g.size)])
}

// ---------------------------------------------------------------- a label's parts (B16, C10, E3)
/** a character a name word holds besides its letters, as today's head rule reads a name (rules/tex-names.mjs headInTarget:
 *  letters, combining marks, stops, apostrophes and hyphens; a float's "Fig." in labelInTarget L2:1184): an abbreviation's
 *  stop is the name's; a glyph's text may be more than one of them (a ligature's "fi") */
const NAME_WORD = /^[\p{L}\p{M}.'’-]+$/u
/** the gap between two glyphs' advances that is a tie, TeX's interword glue, a tenth of their size or more: on the 87 papers'
 *  float labels it measured 0.19 em at its tightest (a justified line's, shrunk) and 0.48 at its widest, a kern inside a word
 *  -0.09 to 0 (2608.06701v1, 2610.19274v1, 2610.30875v1, 2610.42112v1) */
const FLOAT_TIE = 0.1
/** a word LaTeX prints a counter as (\arabic with its prefixes, "S2", "A.4"; \roman, \Roman; \alph, \Alph) */
const COUNTER_WORD = /\p{N}|^(?:[IVXLCDM]+|[ivxlcdm]+|\p{L})$/u
/** where the last word of glyphs `t` before `e` begins, a tie before it and a word before that (a letter in it), where it is a
 *  counter's word (COUNTER_WORD); else `e` */
function lastWordOf(t: readonly DocGlyph[], e: number): number {
  let k = e - 1
  while (k > 0) {
    const a = t[k - 1] as DocGlyph,
      b = t[k] as DocGlyph
    if (b.x0 - a.x1 >= FLOAT_TIE * Math.max(a.size, b.size)) break
    k--
  }
  if (k <= 0 || !t.slice(0, k).some((g) => /\p{L}/u.test(g.u))) return e
  const word = t
    .slice(k, e)
    .map((g) => g.u)
    .join('')
  return COUNTER_WORD.test(word) ? k : e
}
/** a label's parts by its glyphs' classes: the name (its word before the number, from its first letter, with the marks the
 *  word holds: "Figure", "Theorem", an abbreviation's "Fig.", "Thm."), the number (digits with the dots, letters and dashes
 *  between them: "3", "2.1", "A.4"; a stop or dash before its first digit or letter stands between none of them, and is the
 *  name's where a name stands before it: "Fig. 4."), the punctuation after it (":", "."), each with its ink on `page`; today's
 *  head/float label readings (L2:1184-1195, L2:1245-1259) read the same three off the label's text */
export function labelParts(
  gs: readonly DocGlyph[],
  page: number,
  float = false,
): { name?: [string, Ink]; num?: [string, Ink]; punct?: [string, Ink] } {
  const t = gs.filter(real)
  // (across their advances, as the label's own ink and today's characters, which U.decor and U.label read the parts as: a
  // label drawn anew starts its line at its first glyph's advance, 2608.04322v1 p5's "IV." at 397.89, its outline at 398.07)
  const inkOf = (xs: DocGlyph[]): Ink => [
    page,
    r2(Math.min(...xs.map((g) => g.x0))),
    r2(Math.min(...xs.map((g) => g.bottom))),
    r2(Math.max(...xs.map((g) => g.x1))),
    r2(Math.max(...xs.map((g) => g.top))),
    r2(mostOf(xs.map((g) => r2(g.y))) ?? (xs[0] as DocGlyph).y),
  ]
  const out: { name?: [string, Ink]; num?: [string, Ink]; punct?: [string, Ink] } = {}
  let e = t.length
  while (e > 0 && /^\p{P}$/u.test((t[e - 1] as DocGlyph).u)) e--
  if (e < t.length)
    out.punct = [
      t
        .slice(e)
        .map((g) => g.u)
        .join(''),
      inkOf(t.slice(e)),
    ]
  let s = e
  // (a float's label is TeX's \fnum@<type>, \<type>name~\the<type>: its number the word after its last tie, where that word is
  // a number as LaTeX prints a counter (a digit in it, a roman one, a letter alone): IEEEtran's "TABLE I", a supplement's
  // "Table S2" whose tie a justified line set tight (FLOAT_TIE))
  const lastWord = float ? lastWordOf(t, e) : e
  if (lastWord < e) s = lastWord
  else while (s > 0 && /[\p{N}.\-–]/u.test((t[s - 1] as DocGlyph).u)) s--
  // (a letter of the number: "A.4", "S1" — a letter with a digit or a dot after it in the number)
  while (
    lastWord === e &&
    s > 0 &&
    /\p{Lu}/u.test((t[s - 1] as DocGlyph).u) &&
    /[\p{N}.]/u.test((t[s] as DocGlyph | undefined)?.u ?? '')
  ) {
    const prev = t[s - 2]
    if (prev && /\p{L}/u.test(prev.u) && Math.abs((t[s - 1] as DocGlyph).x0 - prev.x1) < 0.2 * prev.size) break
    s--
  }
  // (the stops and dashes before the number's first digit or letter, where a name stands before them: the name's)
  if (t.slice(0, s).some((g) => /\p{L}/u.test(g.u))) while (s < e && /^[.\-–]$/u.test((t[s] as DocGlyph).u)) s++
  if (s < e && (lastWord < e || t.slice(s, e).some((g) => /\p{N}/u.test(g.u))))
    out.num = [
      t
        .slice(s, e)
        .map((g) => g.u)
        .join(''),
      inkOf(t.slice(s, e)),
    ]
  else s = e
  // (from its first letter, as far as the word's characters go: a sub-figure's "(a" is its letter, "Eq. (" its "Eq.")
  const f = t.findIndex((g, q) => q < s && /\p{L}/u.test(g.u))
  let w = f
  while (w >= 0 && w < s && NAME_WORD.test((t[w] as DocGlyph).u)) w++
  const name = f >= 0 ? t.slice(f, w) : []
  if (name.length) out.name = [name.map((g) => g.u).join(''), inkOf(name)]
  return out
}

// ---------------------------------------------------------------- forced breaks and their room (C14, D9)
/** a forced break's source (today's FORCED_BREAK TEX:84) */
export const FORCED_BREAK = /^\\\\\*?(?:\[[^\]]*\])?$|^\\newline$/
/** the pitch of a run of baseline gaps: their median (today's break-room.mjs pitchOf) */
export function pitchOf(gaps: readonly number[]): number | null {
  const g = gaps.filter((v) => v > 0).sort((a, b) => a - b)
  return g.length ? ((g[(g.length - 1) >> 1] as number) + (g[g.length >> 1] as number)) / 2 : null
}
/** the distance TeX puts between two lines with no room between them: the pitch, or TeX's \lineskip rule's where the next
 *  line is too tall (break-room.mjs naturalOf) */
export function naturalOf(pitch: number, depth: number, height: number, lineskip?: [number, number]): number {
  return lineskip && pitch - depth - height < lineskip[1] ? Math.max(pitch, depth + height + lineskip[0]) : pitch
}
/** the room after a break in pitches: the gap less the natural distance (break-room.mjs roomOf) */
export function roomOf(gap: number, pitch: number, natural: number): number {
  return Math.max(0, Math.round(((gap - natural) / pitch) * 1000) / 1000)
}
/**
 * A forced break's line and room (El.ends): `line` the index of the line TeX ended at it (the line of the last glyph before its
 * point in B's stream, carried to A); its room after, in pitches, by the member's lines: the gap from that line's baseline to
 * the next one's against the pitch of its other consecutive lines on that page and column (today's forcedBreaks TEX:120's
 * geometry, which found the line by its short end: SHORT; ownership and TeX's point find it instead). Null room where no
 * pitch is known (one line, or a page change)
 */
export function breakEnd(
  lines: readonly Line[],
  line: number,
  breaks: ReadonlySet<number>,
  lineskip?: [number, number],
): [number, number] | null {
  const L = lines[line]
  const N = lines[line + 1]
  if (!L || !N) return null
  if (N[0] !== L[0] || N[1] !== L[1]) return [line, 0]
  const gaps: number[] = []
  for (let j = 0; j + 1 < lines.length; j++) {
    const a = lines[j] as Line
    const b = lines[j + 1] as Line
    if (breaks.has(j) || a[0] !== b[0] || a[1] !== b[1] || a[9] & 1 || b[9] & 1) continue
    gaps.push(a[4] - b[4])
  }
  const pitch = pitchOf(gaps)
  if (pitch === null) return [line, 0]
  const gap = L[4] - N[4]
  return [line, roomOf(gap, pitch, naturalOf(pitch, L[4] - L[6], N[5] - N[4], lineskip))]
}

// ---------------------------------------------------------------- short skips (E15)
/** TeX's \abovedisplayshortskip: a display set under a line that ends \predisplaysize (2 em) or more before it, its top less
 *  than SHORT_SKIP of a size under that line's baseline (today's shortSkipsOf TEX:328, SHORT_SKIP and PREDISPLAY L2:3155,
 *  3158: TeX's rule read off the page, the display's size \predisplaysize's 2 em; TeX's own skip is stage 1b's) */
export const SHORT_SKIP = 0.3
export const PREDISPLAY = 2
/** the lines (indices) a display of the member stands under with TeX's short skip */
export function shortSkipLines(
  lines: readonly Line[],
  displays: readonly Ink[],
  sizeOf: (j: number) => number,
): Set<number> {
  const out = new Set<number>()
  for (const d of displays)
    lines.forEach((l, j) => {
      if (l[9] & 1 || l[0] !== d[0]) return
      const size = sizeOf(j)
      if (d[4] < l[4] && d[4] > l[4] - SHORT_SKIP * size && l[3] + PREDISPLAY * size <= d[1]) out.add(j)
    })
  return out
}

// ---------------------------------------------------------------- room beside, a cell's band (E13, E27, E24)
/** a piece of the page's ink: its box and its baseline (a glyph's; a box's bottom) */
export interface InkBox {
  x0: number
  x1: number
  y0: number
  y1: number
  /** a glyph's baseline (a painted box has none) */
  y?: number
}
/**
 * The free paper beside a member's lines on their baselines (Room.side): from the nearest glyph not its own standing on each
 * line's baseline (within 0.4 of its size: today's widen, RUN:1580, reads the page's characters on the line's baseline so,
 * and no rule or image) to the left and to the right, within the text block `block` (its column's extent on the page), the
 * narrowest over its lines. Today's widen keeps clear of glyphs within 6 pt to the right and 1 pt to the left of the line,
 * which stood for the unit's own glyphs past its rectangle: ownership says which are its own (a named correction where
 * another unit's glyph stands that near). Its half an em off the ink is the typesetter's choice, the paper is the part's.
 * A table's cell, which today's never widened (its rectangle was its cell's), is also walled by `walls`, the painted boxes
 * beside its line whose height meets its band: in a table the paper beside a cell is its column's, up to its rules (the
 * maintainer, 2026-11-08: 1706.03762v7 p10's Table 4, its "Training" cells run over the rule into the first column). `wall`
 * says which of its sides stop at a wall, not a glyph (1 the left, 2 the right): today's further widening of a cell goes half
 * way to another's text and keeps a quarter of its size off any other ink (run.mjs paperTo)
 */
export function sideOf(
  lines: readonly Line[],
  foreign: (page: number) => readonly InkBox[],
  block: (l: Line) => [number, number],
  walls?: (page: number) => readonly InkBox[],
): { side: [number, number]; wall: 0 | 1 | 2 | 3 } | undefined {
  let lo = Number.NEGATIVE_INFINITY
  let hi = Number.POSITIVE_INFINITY
  let loWall = false,
    hiWall = false
  for (const l of lines) {
    if (l[9] & 1) continue
    const [b0, b1] = block(l)
    let left = Math.min(b0, l[2])
    let right = Math.max(b1, l[3])
    let leftWall = false,
      rightWall = false
    const band = 0.4 * (l[10] ?? l[5] - l[6])
    for (const k of foreign(l[0])) {
      if (k.y === undefined || Math.abs(k.y - l[4]) >= band) continue
      if (k.x1 <= l[2] + 0.01 && k.x1 > left) left = k.x1
      else if (k.x0 >= l[3] - 0.01 && k.x0 < right) right = k.x0
    }
    // (a cell's walls: the painted boxes beside its line whose height meets its band, its column's rules and its neighbours'
    // fills; one across the line is none)
    for (const k of walls?.(l[0]) ?? []) {
      if (k.y0 >= l[4] + band || k.y1 <= l[4] - band) continue
      if (k.x1 <= l[2] + 0.01 && k.x1 > left) {
        left = k.x1
        leftWall = true
      } else if (k.x0 >= l[3] - 0.01 && k.x0 < right) {
        right = k.x0
        rightWall = true
      }
    }
    // (the narrowest over its lines, a side of which a wall stops on any line that stops it there)
    if (left > lo) [lo, loWall] = [left, leftWall]
    else if (left === lo) loWall ||= leftWall
    if (right < hi) [hi, hiWall] = [right, rightWall]
    else if (right === hi) hiWall ||= rightWall
  }
  if (!(Number.isFinite(lo) && Number.isFinite(hi) && hi > lo)) return undefined
  return { side: [r2(lo), r2(hi)], wall: ((loWall ? 1 : 0) | (hiWall ? 2 : 0)) as 0 | 1 | 2 | 3 }
}
/**
 * The ink that stays beside a member's text lines (Room.stays): on each of its lines (its kept rows aside), the ink no member
 * owns (`stays`: a glyph no unit claims, a rule or an image no member's) standing on its band (a glyph by its baseline, within
 * 0.4 of the line's size, as sideOf and pinnedOf read the band; a painted box by its height meeting that band, as sideOf reads
 * a cell's walls) within its text block (`block`, as sideOf), wholly before the line's start or after its end (by half a
 * point, pinnedOf's): on each side, the box of those pieces, [the line's index, x0, y0, x1, y1]. TeX set that ink on the line
 * (amsthm's QED box after a proof's last words, \hfill'd to the measure's end: four rules, no glyph; a mark no unit holds), and
 * no translation replaces it: whatever line a translation lays there, borrowed or not, keeps off it. Undefined where none
 */
export function staysOf(
  lines: readonly Line[],
  stays: (page: number) => readonly InkBox[],
  block: (l: Line) => [number, number],
): [number, number, number, number, number][] | undefined {
  const out: [number, number, number, number, number][] = []
  lines.forEach((l, j) => {
    if (l[9] & 1) return
    const [b0, b1] = block(l)
    const c0 = Math.min(b0, l[2]),
      c1 = Math.max(b1, l[3])
    const band = 0.4 * (l[10] ?? l[5] - l[6])
    const sides: (InkBox | null)[] = [null, null]
    for (const k of stays(l[0])) {
      const on = k.y !== undefined ? Math.abs(k.y - l[4]) < band : k.y0 < l[4] + band && k.y1 > l[4] - band
      if (!on || k.x1 <= c0 || k.x0 >= c1) continue
      const at = k.x1 <= l[2] - 0.5 ? 0 : k.x0 >= l[3] + 0.5 ? 1 : -1
      if (at < 0) continue
      const s = sides[at]
      sides[at] = s
        ? { x0: Math.min(s.x0, k.x0), x1: Math.max(s.x1, k.x1), y0: Math.min(s.y0, k.y0), y1: Math.max(s.y1, k.y1) }
        : { x0: k.x0, x1: k.x1, y0: k.y0, y1: k.y1 }
    }
    for (const s of sides) if (s) out.push([j, r2(s.x0), r2(s.y0), r2(s.x1), r2(s.y1)])
  })
  return out.length ? out : undefined
}
/**
 * A cell's clear band between the rules over and under its lines (Room.band; today's cellBands L2:352): over, the lowest
 * rule at or above its first line's baseline, under, the highest at or below its last line's, each across its lines by more
 * than half a point; undefined where no rule stands over or under it. Where one stands on one side alone, the other side is
 * open (Room.bandOpen: 1 under, 2 over; today's cellBands found no rule there and capped nothing from it), the band there the
 * line's own bottom or top as before. `rules` the page's painted boxes
 */
export function bandOf(
  lines: readonly Line[],
  rules: (page: number) => readonly InkBox[],
): { band: [number, number]; open?: 1 | 2 } | undefined {
  const own = lines.filter((l) => !(l[9] & 1))
  const first = own[0]
  const last = own.at(-1)
  if (!first || !last) return undefined
  const x0 = Math.min(...own.map((l) => l[2]))
  const x1 = Math.max(...own.map((l) => l[3]))
  let over = Number.POSITIVE_INFINITY
  let under = Number.NEGATIVE_INFINITY
  for (const R of rules(first[0])) {
    if (Math.min(R.x1, x1) - Math.max(R.x0, x0) <= 0.5) continue
    if (R.y0 >= first[4]) over = Math.min(over, R.y0)
  }
  for (const R of rules(last[0])) {
    if (Math.min(R.x1, x1) - Math.max(R.x0, x0) <= 0.5) continue
    if (R.y1 <= last[4]) under = Math.max(under, R.y1)
  }
  if (over === Number.POSITIVE_INFINITY && under === Number.NEGATIVE_INFINITY) return undefined
  const band: [number, number] = [
    r2(under === Number.NEGATIVE_INFINITY ? last[6] : under),
    r2(over === Number.POSITIVE_INFINITY ? first[5] : over),
  ]
  if (under === Number.NEGATIVE_INFINITY) return { band, open: 1 }
  if (over === Number.POSITIVE_INFINITY) return { band, open: 2 }
  return { band }
}

/** whether a line shares its baseline with ink that stays (Line PINNED; today's edgesOf `alone` RUN:1638, its baseline band
 *  0.4 of a size): ink on that band, across its column, outside the line's own extent by half a point */
export function pinnedOf(
  l: Line,
  size: number,
  stays: readonly { x0: number; x1: number; y: number }[],
  col: [number, number],
): boolean {
  return stays.some(
    (c) =>
      Math.abs(c.y - l[4]) < 0.4 * size && c.x1 > col[0] && c.x0 < col[1] && (c.x1 < l[2] - 0.5 || c.x0 > l[3] + 0.5),
  )
}

// ---------------------------------------------------------------- alignment read off the page (B3, E8)
/** a line's centre off its column's centre by at most CENTRE points (the maker's CENTRE MAKE:96) and the inset off both edges
 *  of a one-line paragraph centred by its own glue (INSET ems, MAKE:98): the maker's reading where TeX does not tell */
export const CENTRE = 2
export const INSET = 2
/** a unit's alignment as the maker reads it where TeX did not state it (MAKE:2121-2135): centred where every line's centre is
 *  its column's (`edges`) and one line at least is short of it by an em; else justified. With TeX's 'j' (a one-line
 *  paragraph centred by its own \hfill), centred where its line also stands INSET ems off both edges */
export function alignOf(
  lines: readonly Line[],
  sizeOf: (j: number) => number,
  edges: (l: Line) => [number, number] | null,
  told?: 'j' | 'l' | 'c' | 'r',
  labelX0?: number,
): 'j' | 'l' | 'c' | 'r' {
  if (told && told !== 'j') return told
  const own = lines.filter((l) => !(l[9] & 1))
  let centred = own.length > 0
  let short = false
  let inset = own.length === 1
  own.forEach((l, j) => {
    if (!centred) return
    const x0 = j === 0 && labelX0 !== undefined ? Math.min(l[2], labelX0) : l[2]
    const em = sizeOf(j) > 0 ? sizeOf(j) : 10
    const e = edges(l)
    if (!e || Math.abs((x0 + l[3]) / 2 - (e[0] + e[1]) / 2) > CENTRE) {
      centred = false
      return
    }
    if (e[1] - e[0] - (l[3] - x0) > em) short = true
    if (!(x0 - e[0] > INSET * em && e[1] - l[3] > INSET * em)) inset = false
  })
  if (told === 'j') return centred && inset ? 'c' : 'j'
  return centred && short ? 'c' : 'j'
}
/**
 * Whether a unit nothing tells the alignment of, and its column does not centre, is centred by its own block: its lines share
 * a middle and not their edges (cellCentred's reading), a single line by the lines stacked on it, the nearest over it and under
 * it that meet its extent within its leading `lead` (a tabular's centred column: an author block's name, place and e-mail).
 * A line the original centres stands on its own middle, never the page's or the column's (the maintainer, 2026-11-08:
 * 2303.11366v4 p1's "Massachusetts Institute of Technology", centred under its name at 393.8, was read justified by the
 * column's middle at 306 and its translation set from its left edge); a paragraph's short last line shares its left edge
 * with the lines over it and stays its own
 */
export function centredByBlock(own: readonly Line[], page: readonly Line[], lead: number): boolean {
  if (own.length > 1) return cellCentred(own.map((l) => [l[2], l[3]])) === true
  const l = own[0]
  if (!l) return false
  let over: Line | null = null
  let under: Line | null = null
  for (const k of page) {
    if (k === l || k[0] !== l[0] || k[9] & 1 || k[3] <= l[2] || k[2] >= l[3]) continue
    const d = k[4] - l[4]
    if (d > 0.05 && d <= lead + 0.05) {
      if (!over || k[4] < over[4]) over = k
    } else if (d < -0.05 && -d <= lead + 0.05 && (!under || k[4] > under[4])) under = k
  }
  const stack = [l, ...(over ? [over] : []), ...(under ? [under] : [])]
  return cellCentred(stack.map((x) => [x[2], x[3]])) === true
}
/** a single-line cell's centring by its table column's cells on its page (E8, today's cellCentred RUN:1508, its column by
 *  table, column and span), where TeX stated no class for the cell (a template not LaTeX's: marks/channels.ts readAlign):
 *  every middle within 2 of every other and the widths spread by more than 4 (a column whose cells share a start or an end
 *  has its middles half the widths' spread apart); false where the middles spread; null where nothing tells */
export function cellCentred(spans: readonly [number, number][]): boolean | null {
  if (spans.length < 2) return null
  const mids = spans.map(([a, z]) => (a + z) / 2).sort((a, b) => a - b)
  const widths = spans.map(([a, z]) => z - a)
  if ((mids.at(-1) as number) - (mids[0] as number) > 2) return false
  return Math.max(...widths) - Math.min(...widths) > 4 ? true : null
}
