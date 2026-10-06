// A unit's translation as the tokens the line breaker places (Plan 8b, Task 9; the instant layer's spec, §4.5). Each piece
// of TrPiece becomes what the layer draws: text as words, or as one token per character where the target breaks between
// CJK characters; a placeholder as a crop of the original's ink, the page's own text, or a kept block; a style as the face
// each run is drawn in. Every token carries its offsets in trText(pieces), so that the sentence offsets a split is cut at
// find their tokens. The unit is drawn whole or not at all: a placeholder that cannot be drawn, or a character no face
// holds, gives null.
//
// Pure, as the layer is: no DOM, no clock; text is measured only through the function it is given. An original module (no
// port statement), importing only relative modules, so that the reader's bundle holds it.
import { canDraw, classifyFont, FACES, faceFor } from '../font-roles.mjs'
import { scriptOf } from '../layer-rules.mjs'
import { PH_FLAG } from '../layout/file.mjs'
import { COLOUR_SHIFT, STYLE } from './pieces.mjs'

/** the kinsoku sets: no character of NO_START begins a line, none of NO_END ends one */
export const NO_START = '\u3001\u3002\uff0c\uff0e,.\uff01\uff1f!?\uff09)]\u300d\u300f\u3011\u3015\u3009\u300b\u3019\u3017\u201d\u2019\uff1a:\uff1b;\u30fb\u30fc\u301c\u2026\u3005\u309d\u309e\u3041\u3043\u3045\u3047\u3049\u3063\u3083\u3085\u3087\u308e\u30a1\u30a3\u30a5\u30a7\u30a9\u30c3\u30e3\u30e5\u30e7\u30ee\u30f5\u30f6%\uff05'
export const NO_END = '\uff08([\u300c\u300e\u3010\u3014\u3008\u300a\u3018\u3016\u201c\u2018'
/** the full-width marks compression takes half of */
export const COMPRESS_CLOSE = '\u3001\u3002\uff0c\uff0e\uff1a\uff1b\uff01\uff1f\uff09\u300d\u300f\u3011\u3015\u3009\u300b\u3019\u3017\u201d\u2019'
export const COMPRESS_OPEN = '\uff08\u300c\u300e\u3010\u3014\u3008\u300a\u3018\u3016\u201c\u2018'

const NO_START_SET = new Set(NO_START), NO_END_SET = new Set(NO_END)
const CLOSE_SET = new Set(COMPRESS_CLOSE), OPEN_SET = new Set(COMPRESS_OPEN)
/** the marks a CJK-Latin gap is never put beside: the full-width ones above, the closing brackets and quotes of any width, the
 *  dash, the ellipsis and the middle dots (not the small kana and the long vowel mark, which are letters) */
const CJK_MARK = new Set([...COMPRESS_CLOSE, ...COMPRESS_OPEN, ...'\u3001\u3002\uff0c\uff0e\uff1a\uff1b\uff01\uff1f\uff08\uff09\u300c\u300d\u300e\u300f\u3010\u3011\u3014\u3015\u3008\u3009\u300a\u300b\u3018\u3019\u3016\u3017\u201c\u201d\u2018\u2019\u2014\u2026\u00b7\u30fb\u301c\uff5e\uff3b\uff3d\uff5b\uff5d'])

// the CJK class: ideographs, kana, Hangul, full-width forms, the CJK symbols and the Hangul jamo, by code point
const CJK_SPANS = [[0x2e80, 0x9fff], [0xf900, 0xfaff], [0xff00, 0xffef], [0x3000, 0x303f], [0xac00, 0xd7af], [0x1100, 0x11ff], [0x3130, 0x318f]]
const isCjkCode = cp => { for (const [a, b] of CJK_SPANS) if (cp >= a && cp <= b) return true; return false }
// in Chinese and Japanese the curly quotes, the dash, the ellipsis and the middle dot are CJK too
const CJK_PUNCT = new Set([0x201c, 0x201d, 0x2018, 0x2019, 0x2014, 0x2026, 0x00b7])
const CJK_BREAKING = new Set(['Hans', 'Hant', 'Jpan'])

/** the classes of a placeholder that has ink: one with no row in the layout cannot be drawn */
const NEEDS_INK = new Set(['math', 'cite', 'ref', 'eqref', 'code', 'url', 'footnote'])
/** the classes drawn as the page's own text where it can be read */
const PAGE_TEXT = new Set(['cite', 'ref', 'eqref'])
const OPEN_BRACKETS = new Set(['(', '[', '\uff08', '\uff3b']), CLOSE_BRACKETS = new Set([')', ']', '\uff09', '\uff3d'])

/** TeX's ligatures: the characters drawn for what the source has, longest first; not in a typewriter font */
const LIGATURES = [['---', '\u2014'], ['--', '\u2013'], ['``', '\u201c'], ["''", '\u201d']]

const WS = /\s/
// the characters with no glyph of their own (a zero width space, a soft hyphen, a variation selector, a joiner), which a
// translation can carry (Google's zero width spaces): neither measured nor drawn, as the TeX path's texEscape drops them.
// Drawn, Chromium would set a copyright sign and a variation selector after it as an emoji
const INVISIBLE = /\p{Default_Ignorable_Code_Point}/gu
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u
const LETTER = /\p{L}/u
const URL_LIKE = /^(?:https?|ftp):\/\/|^www\./i
// a URL or a mono run breaks after its separators; a word after its own hyphen or slash, between two letters
const AFTER_SEPARATOR = /(?<=[/.\-_#?&=])(?=[^/.\-_#?&=])/u
const AFTER_HYPHEN = /(?<=\p{L}[-/])(?=\p{L})/u
const WORD = /^[^\p{L}]*(\p{L}[\p{L}\p{M}]*)[^\p{L}]*$/u
const HYPHEN_MIN_LETTERS = 5

/**
 * A page text's width over its segments' width (both at the unit's size) that may be the placeholder's own: 0.85 to 1.15.
 * On the layer lab's 29 fixtures, the citations' and references' own text (PyMuPDF's characters inside their segments,
 * measured in the faces the layer draws in) lies at 0.94-1.07 (3,241 of 3,242; the one outside, at 0.11, an equation
 * reference whose segment holds math), and the reader's PDF.js text items, which are whole lines where a citation stands
 * within one, at 0.98-49 (median 2.42): those within the band are the citation and the sentence's period after it
 */
export const PAGE_TEXT_MIN = 0.85, PAGE_TEXT_MAX = 1.15
/**
 * The marks a reading of the page may begin or end with that the band cannot place, one character among many: a text
 * item that ran on to the sentence's period after the placeholder, or to the source's bracket around it (a formula's item
 * holding the ')' after it). A reading whose end is one of them, and that is still within the band without it, is not
 * trusted (the layout's own text is): its placeholder is drawn as its ink, and the bracket rule takes its rendering as
 * unread. Of the fixtures' readings, the 35 wrong ones the band holds all end in a period
 */
const LOOSE = new Set(['.', ',', ';', ':', '!', '?', '(', ')', '[', ']', '\uff08', '\uff09', '\uff3b', '\uff3d'])

/**
 * A face's size correction (the role table's Face.size: Source Han Serif K's Hangul set at its family's ideographs'
 * visual size), 1 for every other face. A run is drawn at the line's size × its face's correction, so the fit measures it
 * so: its width at 100 px times the correction.
 */
export function faceSize(face) {
  const v = typeof face === 'string' && Object.hasOwn(FACES, face) ? FACES[face].size : undefined
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 1
}

/** a text as the page shows it: its invisible characters dropped, its white space one space, trimmed */
const clean = s => (typeof s === 'string' ? s.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim() : '')

/**
 * A placeholder's own text, for its page text: the layout's (`row.text`, the placeholder's own glyphs' text) where its row
 * has one, else the page's text inside each of its segments (`textIn`), joined by spaces; null where neither reads, or where
 * what reads is not the placeholder's own by its width: `width(text)` in ems at the unit's `size` within PAGE_TEXT_MIN to
 * PAGE_TEXT_MAX of its segments' width, and, read by textIn, no longer so with a mark of LOOSE at either end taken off.
 * The reader's textIn may give whole text items, a line where a citation stands within one: never trusted unmeasured
 */
export function ownText(row, o) {
  let s, read = false
  if (typeof row?.text === 'string') s = clean(row.text)
  else {
    if (typeof o.textIn !== 'function' || !row?.segs) return null
    const parts = []
    for (let i = 0; i + 5 < row.segs.length; i += 6) {
      const one = clean(o.textIn(row.segs[i], row.segs[i + 1], row.segs[i + 5], row.segs[i + 3], row.segs[i + 4]))
      if (!one) return null
      parts.push(one)
    }
    s = parts.join(' ')
    read = true
  }
  if (!s || !row.segs) return null
  let segW = 0
  for (let i = 0; i + 5 < row.segs.length; i += 6) segW += row.segs[i + 3] - row.segs[i + 1]
  if (!(segW > 0)) return null
  const fits = t => {
    const r = (o.width(t) * o.size) / segW
    return r >= PAGE_TEXT_MIN && r <= PAGE_TEXT_MAX
  }
  if (!fits(s)) return null
  if (read && s.length > 1 && ((LOOSE.has(s.at(-1)) && fits(s.slice(0, -1).trimEnd())) || (LOOSE.has(s[0]) && fits(s.slice(1).trimStart())))) return null
  return s
}

/** the page text a placeholder is drawn as, or null: its own text (ownText), its own brackets dropped where the translation
 *  brackets it (`before` and `after`: the pieces beside its own), unless the source's own brackets are those */
export function pageTextOf(row, before, after, o) {
  const own = ownText(row, o)
  if (!own) return null
  return (!(row.flags & PH_FLAG.SOURCE_BRACKETS) && opensBefore(before) && closesAfter(after) ? unbracket(own) : own) || null
}

// ---------------------------------------------------------------- brackets beside a rendering

/** the classes whose rendering may bring its own brackets where no text of it reads: a citation (natbib's '(Hill et al.,
 *  2016)', a numeric '[3]'). An equation reference's are known ('(…)'); a \ref renders a bare number */
export const BRACKETED = new Set(['cite'])
/** brackets by kind, half and full width alike: round and square */
export const OPENS = new Map([['(', 'round'], ['\uff08', 'round'], ['[', 'square'], ['\uff3b', 'square']])
export const CLOSES = new Map([[')', 'round'], ['\uff09', 'round'], [']', 'square'], ['\uff3d', 'square']])

/** where each bracket of the translation's text pieces closes or is closed: by piece index and index in it, its partner's,
 *  null for one the translation leaves unmatched. A close matches the innermost open where that is of its kind */
export function bracketPairs(pieces) {
  const partner = new Map(), stack = []
  pieces.forEach((p, i) => {
    if (p[0] !== 0) return
    for (let j = 0; j < p[1].length; j++) {
      const ch = p[1][j], key = `${i}:${j}`
      if (OPENS.has(ch)) { stack.push({ key, kind: OPENS.get(ch) }); partner.set(key, null) }
      else if (CLOSES.has(ch)) {
        const top = stack[stack.length - 1]
        if (top && top.kind === CLOSES.get(ch)) { stack.pop(); partner.set(key, top.key); partner.set(top.key, key) }
        else partner.set(key, null)
      }
    }
  })
  return partner
}

/** the first or last character of a text piece that is not white space, with its key in bracketPairs, or null */
export function beside(pieces, i, end) {
  const p = pieces[i]
  if (p?.[0] !== 0) return null
  const s = p[1]
  if (end) { for (let j = s.length - 1; j >= 0; j--) if (!/\s/.test(s[j])) return { ch: s[j], key: `${i}:${j}` } }
  else for (let j = 0; j < s.length; j++) if (!/\s/.test(s[j])) return { ch: s[j], key: `${i}:${j}` }
  return null
}

/**
 * The translation's brackets that echo a citation's own, by their keys in bracketPairs: one right before a citation (white
 * space between aside) that the translation never closes, or right after one that it never opened, where the citation's
 * own text (ownText, `o` its measure: the body's upright face) begins, or ends, with a bracket of its kind, or reads
 * nowhere. A citation brings its brackets in its rendering, and a machine translation repeats one of them in its own text
 * ('… pairs [cite])…'): drawn, the page would show it twice. Every one of the 11 the net refused on the layer lab's 29
 * fixtures was such an echo. The tokens keep it for its offset in trText and draw nothing for it, and the net does not
 * take it as doubled. Not beside a citation the source brackets itself (SOURCE_BRACKETS: those brackets are the source's)
 */
export function echoesOf(pieces, unit, o) {
  const out = new Set()
  let partner = null
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]
    if (p[0] !== 1) continue
    const row = unit?.ph?.get(p[1])
    if (!row || !BRACKETED.has(row.kind) || row.flags & (PH_FLAG.EMPTY | PH_FLAG.LOST | PH_FLAG.SOURCE_BRACKETS)) continue
    const b = beside(pieces, i - 1, true), a = beside(pieces, i + 1, false)
    const open = b && OPENS.get(b.ch), close = a && CLOSES.get(a.ch)
    if (!open && !close) continue
    partner ??= bracketPairs(pieces)
    const unopened = open && partner.get(b.key) === null, unclosed = close && partner.get(a.key) === null
    if (!unopened && !unclosed) continue
    const r = ownText(row, o)
    if (unopened && (!r || OPENS.get(r[0]) === open)) out.add(b.key)
    if (unclosed && (!r || CLOSES.get(r[r.length - 1]) === close)) out.add(a.key)
  }
  return out
}

/** a character kept for its offset and drawn as nothing: a default-ignorable one (the word joiner), which every token drops */
const UNDRAWN = '\u2060'

/** thrown inside tokensOf where the unit cannot be drawn, and caught at its edge */
const UNDRAWABLE = Symbol('undrawable')

const firstChar = s => String.fromCodePoint(s.codePointAt(0))
const lastChar = s => { const n = s.length; return n > 1 && (s.charCodeAt(n - 1) & 0xfc00) === 0xdc00 ? s.slice(n - 2) : s.slice(n - 1) }

/** a word's letters, with the marks before and after it taken off: `{ lead, core }`, or null for a text that is no word of
 *  five letters or more (one with a digit or a mark in the middle is none); the hyphenator is asked for `core`, whose offsets
 *  add `lead` */
export function hyphenCore(text) {
  const m = WORD.exec(String(text))
  if (!m || [...m[1]].length < HYPHEN_MIN_LETTERS) return null
  return { lead: m[0].indexOf(m[1]), core: m[1] }
}

/** the text trText makes of `raw` (white space collapsed to one space, the ends trimmed), as where each character of `raw`
 *  lands in it: `map[i]`, and whether it is the character that stays (`kept[i]`): one space of a run does, the others and the
 *  trimmed ones do not */
function collapse(raw) {
  const n = raw.length
  const map = new Int32Array(n + 1), kept = new Uint8Array(n)
  let out = 0, i = 0
  while (i < n && WS.test(raw[i])) i++
  let space = -1
  for (; i < n; i++) {
    if (WS.test(raw[i])) {
      if (space < 0) { space = i; map[i] = out; kept[i] = 1; out++ } else map[i] = map[space]
    } else { space = -1; map[i] = out; kept[i] = 1; out++ }
  }
  if (space >= 0) { kept[space] = 0; out-- }
  map[n] = out
  return { map, kept }
}

/** the share of the unit's text its groups hold that set bold, and that set italic (an emphasis counts): by non-blank
 *  characters, a switch counting from where it stands to the end of its group */
function groupShares(pieces) {
  const stack = [{ bold: false, italic: false }]
  let total = 0, bold = 0, italic = 0
  for (const p of pieces) {
    const top = stack[stack.length - 1]
    if (p[0] === 2) {
      const flags = p[2]
      const b = (flags & STYLE.BOLD) !== 0, i = (flags & (STYLE.ITALIC | STYLE.EMPH)) !== 0
      if (flags & STYLE.SWITCH) { top.bold ||= b; top.italic ||= i } else stack.push({ bold: top.bold || b, italic: top.italic || i })
    } else if (p[0] === 3) {
      if (stack.length > 1) stack.pop()
    } else if (p[0] === 0) {
      let n = 0
      for (const ch of p[1]) if (!WS.test(ch)) n++
      total += n
      if (top.bold) bold += n
      if (top.italic) italic += n
    }
  }
  return total ? { bold: bold / total, italic: italic / total } : { bold: 0, italic: 0 }
}

// the design of a paper's sans and mono faces: those of the layout's fonts, by the first that sets one
const FILE_DESIGNS = new WeakMap()
function fileDesigns(file) {
  let d = FILE_DESIGNS.get(file)
  if (d) return d
  d = { sans: 'cmss', mono: 'cmtt' }
  let sans = false, mono = false
  for (const name of file.file?.fonts ?? []) {
    const c = classifyFont(name)
    if (c.cls === 'sans' && !sans) { d.sans = c.design; sans = true } else if (c.cls === 'mono' && !mono) { d.mono = c.design; mono = true }
    if (sans && mono) break
  }
  FILE_DESIGNS.set(file, d)
  return d
}

/** a bracketed text without its own brackets, where they are a pair around all of it */
function unbracket(text) {
  const kind = text[0] === '(' && text.at(-1) === ')' ? ['(', ')'] : text[0] === '[' && text.at(-1) === ']' ? ['[', ']'] : null
  if (!kind) return text
  const inner = text.slice(1, -1)
  let depth = 0
  for (const ch of inner) {
    if (ch === kind[0]) depth++
    else if (ch === kind[1] && --depth < 0) return text
  }
  return depth === 0 ? inner.trim() : text
}

/** a piece of text that is right before / after a placeholder, with no white space between */
const opensBefore = piece => piece?.[0] === 0 && piece[1].length > 0 && OPEN_BRACKETS.has(lastChar(piece[1]))
const closesAfter = piece => piece?.[0] === 0 && piece[1].length > 0 && CLOSE_BRACKETS.has(firstChar(piece[1]))

/**
 * A unit's translation as tokens, or null where it cannot be drawn: a placeholder whose rendering the layout lost, or has
 * none of a class with ink (`classOf` names the class of a source piece the layout has no row for, marks.mjs's: without it
 * such a piece is an invisible one), a character no face holds, a unit with no lines.
 */
export function tokensOf(pieces, o) {
  if (!Array.isArray(pieces)) return null
  try {
    return build(pieces, o)
  } catch (e) {
    if (e === UNDRAWABLE) return null
    throw e
  }
}

function build(pieces, o) {
  const { unit, file, target, rules, roles, measure, hyphen, textIn, classOf } = o

  // each piece that is no text is one space of the text trText is made from
  let raw = ''
  for (const p of pieces) {
    if (!Array.isArray(p)) throw UNDRAWABLE
    if (p[0] === 0) { if (typeof p[1] !== 'string') throw UNDRAWABLE; raw += p[1] } else if (p[0] === 1 || p[0] === 3) {
      if (!Number.isInteger(p[1])) throw UNDRAWABLE
      raw += ' '
    } else if (p[0] === 2) {
      if (!Number.isInteger(p[1]) || !Number.isInteger(p[2])) throw UNDRAWABLE
      raw += ' '
    } else throw UNDRAWABLE
  }
  const { map, kept } = collapse(raw)
  /** where raw [a, b) lands in trText, as its offset and length */
  const span = (a, b) => {
    const at = map[a]
    let end = at
    for (let r = a; r < b; r++) if (kept[r]) end = map[r] + 1
    return [at, end - at]
  }

  // the unit's own font, size and fonts: the base style
  const lines = unit?.lines
  if (!lines || lines.length < 8) throw UNDRAWABLE
  const sizes = [], counts = new Map()
  for (let i = 0; i + 7 < lines.length; i += 8) { sizes.push(lines[i + 6]); counts.set(lines[i + 7], (counts.get(lines[i + 7]) ?? 0) + 1) }
  sizes.sort((a, b) => a - b)
  const unitSize = (sizes[(sizes.length - 1) >> 1] + sizes[sizes.length >> 1]) / 2
  if (!(unitSize > 0)) throw UNDRAWABLE
  let main = -1, most = 0
  for (const [font, n] of counts) if (n > most) { most = n; main = font }
  let fontNames
  try { fontNames = [...counts.keys()].map(i => file.font(i)) } catch { throw UNDRAWABLE }
  const base = classifyFont(file.font(main))

  const designs = new Map()
  const designOf = cls => {
    let d = designs.get(cls)
    if (d === undefined) {
      d = fontNames.map(classifyFont).find(c => c.cls === cls)?.design ?? fileDesigns(file)[cls]
      designs.set(cls, d)
    }
    return d
  }
  const styles = new Map()
  const style = (cls, design, bold, italic, caps, colour) => {
    const key = `${cls}|${design}|${+bold}${+italic}${+caps}|${colour}`
    let st = styles.get(key)
    if (!st) styles.set(key, st = { cls, design, bold, italic, caps, colour })
    return st
  }
  // a text set in a group that is most of the unit has its bold or italic from the group: the base keeps neither
  const shares = groupShares(pieces)
  const body = roles.family
  const baseCls = base.cls === 'math' ? 'serif' : base.cls
  const baseDesign = base.cls === 'math' || (base.cls === 'serif' && base.design === 'other') ? body : base.design
  const root = style(baseCls, baseDesign, base.bold && shares.bold < 0.5, base.italic && shares.italic < 0.5, base.caps, 0)
  /** a style with a group's flags on top */
  const applied = (st, flags) => {
    let { cls, design, bold, italic, caps, colour } = st
    if (flags & STYLE.NORMAL) { cls = 'serif'; design = body; bold = false; italic = false; caps = false }
    if (flags & STYLE.MEDIUM) bold = false
    if (flags & STYLE.BOLD) bold = true
    if (flags & STYLE.UPRIGHT) italic = false
    if (flags & STYLE.ITALIC) italic = true
    if (flags & STYLE.EMPH) italic = !italic
    if (flags & STYLE.CAPS) caps = true
    if (flags & STYLE.SERIF) { cls = 'serif'; design = body }
    if (flags & STYLE.SANS) { cls = 'sans'; design = designOf('sans') }
    if (flags & STYLE.MONO) { cls = 'mono'; design = designOf('mono') }
    if (flags >> COLOUR_SHIFT > 0) colour = flags >> COLOUR_SHIFT
    return style(cls, design, bold, italic, caps, colour)
  }

  const faces = { cjk: new Map(), latin: new Map() }
  const faceOf = (script, st) => {
    let face = faces[script].get(st)
    if (!face) {
      face = faceFor(roles, { script, cls: st.cls, design: st.design, bold: st.bold, italic: st.italic, caps: st.caps })
      if (!face) throw UNDRAWABLE
      faces[script].set(st, face)
    }
    return face
  }
  const widths = new Map()
  const widthOf = (text, face, caps) => {
    const key = `${face}|${caps ? 1 : 0}|${text}`
    let w = widths.get(key)
    if (w === undefined) {
      // Measure gives a width at 100 px: a token's width is in ems, so that at a size f it is w * f for every kind of token
      w = measure(text, face, caps) / 100
      if (!Number.isFinite(w) || w < 0) throw UNDRAWABLE
      widths.set(key, w)
    }
    return w
  }

  // a bracket of the translation that echoes a citation's own (echoesOf): its character kept, as one that draws nothing,
  // so that every offset stays trText's
  const upright = faceFor(roles, { script: 'latin', cls: 'serif', design: body, bold: false, italic: false, caps: false })
  const echoes = upright ? echoesOf(pieces, unit, { textIn, width: t => widthOf(t, upright, false), size: unitSize }) : new Set()
  const undrawn = (s, index) => {
    let out = s
    for (let j = 0; j < s.length; j++) if (echoes.has(`${index}:${j}`)) out = `${out.slice(0, j)}${UNDRAWN}${out.slice(j + 1)}`
    return out
  }

  const cjkBreaking = CJK_BREAKING.has(scriptOf(target))
  const isCjk = ch => { const cp = ch.codePointAt(0); return isCjkCode(cp) || (cjkBreaking && CJK_PUNCT.has(cp)) }
  const cjkToken = t => t.kind === 'text' && t.script === 'cjk'
  const latinLetter = c => LETTER.test(c) && !isCjk(c)
  /** a curly apostrophe between two Latin letters ("Newton's") is a letter of the word, not a CJK closing quote */
  const insideWord = (s, i) => s.codePointAt(i) === 0x2019 && i > 0 && i + 1 < s.length && latinLetter(lastChar(s.slice(0, i))) && latinLetter(firstChar(s.slice(i + 1)))
  const noWords = unit.kind === 'heading' || unit.title === true

  const tokens = []
  const stack = [{ st: root }]
  const current = () => stack[stack.length - 1].st
  let rawPos = 0
  let run = null        // the Latin or CJK word being read: { script, st, raw, s }
  let pending = null    // white space met and not yet written: { raw, st }

  /** a text token, its invisible characters dropped (its offsets still the source's), or null where it has none other: its
   *  face must hold every character */
  const textToken = (source, script, st, rawStart, rawLen) => {
    const s = source.replace(INVISIBLE, '')
    if (!s) return null
    const face = faceOf(script, st)
    if (!canDraw(s, [face], roles)) throw UNDRAWABLE
    const [at, len] = span(rawStart, rawStart + rawLen)
    return { kind: 'text', s, script, face, caps: st.caps, w: widthOf(s, face, st.caps), colour: st.colour, at, len }
  }

  /** whether kinsoku bars a break between `prev` and `t`: before a character that may not begin a line, after one that may
   *  not end it */
  const barred = (prev, t) => (t.s !== undefined && NO_START_SET.has(firstChar(t.s))) || (prev.s !== undefined && NO_END_SET.has(lastChar(prev.s)))

  /** the break after `prev` and before `t`, none for white space between (a space token is the break then): where no break
   *  may be (glue), and where a gap of autospace goes */
  const link = (prev, t, chunk) => {
    // Chinese and Japanese break beside any CJK character; everything else stands together but at a word's own hyphen
    if (cjkBreaking && (cjkToken(prev) || cjkToken(t))) { if (barred(prev, t)) t.glue = true } else if (!chunk) t.glue = true
    if (rules.autospace > 0 && prev.script && t.script && prev.script !== t.script) {
      const cjkSide = prev.script === 'cjk' ? lastChar(prev.s) : firstChar(t.s)
      const latinSide = prev.script === 'cjk' ? firstChar(t.s) : lastChar(prev.s)
      if (!CJK_MARK.has(cjkSide) && LETTER_OR_DIGIT.test(latinSide)) t.asp = true
    }
  }

  /** a token after what came before it: the white space between is one space token, but where a line or a block began, or
   *  CJK characters meet in Chinese or Japanese */
  const emit = (t, chunk) => {
    const before = tokens.length ? tokens[tokens.length - 1] : null
    const plain = before && before.kind !== 'break' && before.kind !== 'block'
    let spaced = false
    if (pending) {
      const gap = pending
      pending = null
      if (plain && !(cjkBreaking && cjkToken(before) && cjkToken(t))) {
        const script = before.script ?? 'latin'
        const face = faceOf(script, gap.st)
        const [at, len] = span(gap.raw, gap.raw + 1)
        const space = { kind: 'space', face, caps: gap.st.caps, w: widthOf(' ', face, gap.st.caps), colour: gap.st.colour, at, len }
        // kinsoku holds across a space: no line ends on an opening mark, none begins with a closing one; the space and the
        // token after it stand with what is before
        if (barred(before, t)) { space.glue = true; t.glue = true }
        tokens.push(space)
        spaced = true
      }
    }
    if (plain && !spaced) link(before, t, chunk)
    if (t.raised) t.glue = true
    tokens.push(t)
  }
  /** a token that ends a line: no space stands before it */
  const emitPlain = t => { pending = null; tokens.push(t) }

  /** the run read so far, as tokens: a Latin word after its own hyphen or slash into parts, a URL or a mono run after its
   *  separators */
  const flush = () => {
    if (!run) return
    const { script, st, raw: start, s } = run
    run = null
    const urlLike = script === 'latin' && URL_LIKE.test(s)
    const parts = script === 'cjk' ? [s] : st.cls === 'mono' || urlLike ? s.split(AFTER_SEPARATOR) : s.split(AFTER_HYPHEN)
    let off = 0
    parts.forEach((part, i) => {
      const t = textToken(part, script, st, start + off, part.length)
      if (!t) { off += part.length; return }
      // an alphabetic word of running text: one that is cut by characters draws a hyphen, one of a language with patterns
      // (and not a heading's) may be hyphenated there
      const word = script === 'latin' && st.cls !== 'mono' && !urlLike && hyphenCore(t.s) !== null
      if (word) t.word = true
      if (hyphen && word && !noWords) t.hyph = hyphen.lang
      emit(t, i > 0)
      off += part.length
    })
  }

  /** a character on its own: a CJK one where the target breaks between them, or a ligature's */
  const single = (ch, rawStart, rawLen, st) => {
    const script = isCjk(ch) ? 'cjk' : 'latin'
    const t = textToken(ch, script, st, rawStart, rawLen)
    if (!t) return
    if (cjkBreaking && script === 'cjk' && rules.compress > 0) {
      if (CLOSE_SET.has(ch)) t.punct = 'close'
      else if (OPEN_SET.has(ch)) t.punct = 'open'
    }
    emit(t, false)
  }

  const text = s => {
    const st = current()
    if (s === '\n') {
      flush()
      const [at, len] = span(rawPos, rawPos + 1)
      emitPlain({ kind: 'break', w: 0, colour: st.colour, at, len })
      rawPos += 1
      return
    }
    for (let i = 0; i < s.length;) {
      const ch = String.fromCodePoint(s.codePointAt(i))
      if (WS.test(ch)) {
        flush()
        pending ??= { raw: rawPos + i, st }
        i += ch.length
        continue
      }
      const lig = st.cls === 'mono' ? undefined : LIGATURES.find(([source]) => s.startsWith(source, i))
      if (lig) {
        flush()
        single(lig[1], rawPos + i, lig[0].length, st)
        i += lig[0].length
        continue
      }
      const cj = isCjk(ch) && !insideWord(s, i)
      if (cjkBreaking && cj) {
        flush()
        single(ch, rawPos + i, ch.length, st)
      } else {
        const script = cj ? 'cjk' : 'latin'
        if (run && run.script === script && run.st === st) run.s += ch
        else { flush(); run = { script, st, raw: rawPos + i, s: ch } }
      }
      i += ch.length
    }
    rawPos += s.length
  }

  /** a visible placeholder of a citation or reference as the page's own text (pageTextOf), or null where it has none
   *  there: then it is drawn as the original's ink */
  const pageText = (row, k, index, st, at, len) => {
    const face = faceOf('latin', st)
    const shown = pageTextOf(row, pieces[index - 1], pieces[index + 1], { textIn, width: t => widthOf(t, face, st.caps), size: unitSize })
    if (!shown || !canDraw(shown, [face], roles)) return null
    return { kind: 'ph', s: shown, script: 'latin', face, caps: st.caps, w: widthOf(shown, face, st.caps), ph: k, mode: 'page-text', colour: st.colour, at, len }
  }

  const placeholder = (k, index) => {
    const row = unit.ph?.get(k)
    const rawIdx = rawPos
    rawPos += 1
    if (!row) {
      const cls = classOf?.(k) ?? null
      if (cls && NEEDS_INK.has(cls)) throw UNDRAWABLE
      flush()
      return
    }
    if (row.flags & PH_FLAG.LOST) throw UNDRAWABLE
    flush()
    if (row.flags & PH_FLAG.EMPTY) return
    const st = current()
    const [at, len] = span(rawIdx, rawIdx + 1)
    if (row.kind === 'display') { emitPlain({ kind: 'block', w: 0, ph: k, mode: 'kept', colour: st.colour, at, len }); return }
    const raised = (row.flags & PH_FLAG.RAISED) !== 0
    // a raised mark is the original's own ink: the page text has no size or lift of its own
    let t = !raised && PAGE_TEXT.has(row.kind) ? pageText(row, k, index, st, at, len) : null
    if (!t) {
      let width = 0
      for (let i = 0; i + 5 < row.segs.length; i += 6) width += row.segs[i + 3] - row.segs[i + 1]
      t = { kind: 'ph', w: width / unitSize, ph: k, mode: 'crop', colour: st.colour, at, len }
    }
    if (raised) t.raised = true
    emit(t, false)
  }

  pieces.forEach((p, index) => {
    switch (p[0]) {
      case 0: text(echoes.size ? undrawn(p[1], index) : p[1]); break
      case 1: placeholder(p[1], index); break
      case 2:
        flush()
        if (p[2] & STYLE.SWITCH) stack[stack.length - 1].st = applied(current(), p[2] & ~STYLE.SWITCH)
        else stack.push({ st: applied(current(), p[2]) })
        rawPos += 1
        break
      default:
        flush()
        if (stack.length > 1) stack.pop()
        rawPos += 1
    }
  })
  flush()
  return tokens
}
