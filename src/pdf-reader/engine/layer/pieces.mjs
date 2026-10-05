// A translated unit's pieces as the layer takes them (the instant layer's spec, §4.3): each placeholder, and each group's
// open and close, named by `k`, the index of its source piece among the unit's pieces — the layer joins a placeholder to
// its rendering by (unit, k) alone, since a unit may hold the same placeholder twice ($x$ and $x$) —; text as the compiled
// PDF shows it; a group's style as flags. The reader loads this module: it imports nothing, so that neither mt.mjs nor
// latex-front.mjs comes into its bundle. The few rules it shares with mt.mjs — a text piece as the PDF shows it (`shown`),
// the placeholders a space never goes before (`SPACING`), the plain text sentence offsets count in (plainTranslated) —
// are written again here, and tests/pdf-reader/layer-pieces.test.ts holds them equal to mt.mjs's

/** the style flags of a group's open, and of a switch with SWITCH: it holds to the end of the group around it */
export const STYLE = Object.freeze({ BOLD: 1, ITALIC: 2, EMPH: 4, UPRIGHT: 8, MONO: 16, SANS: 32, SERIF: 64, CAPS: 128, MEDIUM: 256, NORMAL: 512, SWITCH: 1024 })
/** a colour's index + 1 is held in the bits from COLOUR_SHIFT up; 0 is no colour */
export const COLOUR_SHIFT = 11
/** the closed colour table (the web's EARLY_COLOURS, in its order): xcolor's base names */
export const LAYER_COLOURS = Object.freeze(['black', 'white', 'red', 'green', 'blue', 'cyan', 'magenta', 'yellow', 'brown', 'lime', 'orange', 'pink', 'purple', 'teal', 'violet', 'olive', 'darkgray', 'gray', 'lightgray'])

/** each command's flags: its argument form and its declaration alike */
const FLAGS = new Map([
  ...['textbf', 'bf', 'bfseries', 'mathbf', 'boldsymbol'].map(c => [c, STYLE.BOLD]),
  ...['textmd', 'mdseries'].map(c => [c, STYLE.MEDIUM]),
  ...['emph', 'em'].map(c => [c, STYLE.EMPH]),
  ...['textit', 'it', 'itshape', 'textsl', 'sl', 'slshape', 'mathit'].map(c => [c, STYLE.ITALIC]),
  ...['textup', 'upshape'].map(c => [c, STYLE.UPRIGHT]),
  ...['textsc', 'sc', 'scshape'].map(c => [c, STYLE.CAPS]),
  ...['texttt', 'tt', 'ttfamily', 'url', 'path', 'code', 'lstinline'].map(c => [c, STYLE.MONO]),
  ...['textsf', 'sf', 'sffamily'].map(c => [c, STYLE.SANS]),
  ...['textrm', 'rm', 'rmfamily'].map(c => [c, STYLE.SERIF]),
  ...['textnormal', 'normalfont'].map(c => [c, STYLE.NORMAL]),
])
const COLOURED = new Set(['textcolor', 'color'])
/** a command after an optional brace and white space; its name runs to the first character that is no letter */
const COMMAND = /^\{?\s*\\([A-Za-z]+)/
/** a colour named in braces, right after its command */
const COLOUR_NAME = /^\s*\{\s*([A-Za-z]+)\s*\}/

/** the flags a source command sets: an open's source (`\textbf{`, `{\bf `) or a switch's (`\bfseries`, `\color{red}`);
 *  a colour by its index in LAYER_COLOURS, none for a name not in it or a colour given by a model (`\color[rgb]{…}`) */
export function styleOf(src) {
  if (typeof src !== 'string') return 0
  const m = COMMAND.exec(src)
  if (!m) return 0
  if (!COLOURED.has(m[1])) return FLAGS.get(m[1]) ?? 0
  const name = COLOUR_NAME.exec(src.slice(m[0].length))?.[1]
  const at = name ? LAYER_COLOURS.indexOf(name) : -1
  return at < 0 ? 0 : (at + 1) << COLOUR_SHIFT
}

/** a placeholder that is a style switch: one of the declarations styleOf knows, alone, or \color with its colour */
const SWITCH = /^(?:\\(?:bf|bfseries|mdseries|em|it|itshape|sl|slshape|upshape|sc|scshape|tt|ttfamily|sf|sffamily|rm|rmfamily|normalfont)(?![A-Za-z])|\\color\s*(?:\[[^\]]*\]\s*)?\{[^{}]*\})\s*$/
/** a forced break: \\ (starred, with its space), \newline, \linebreak */
const BREAK = /^(?:\\\\\*?(?:\s*\[[^\]]*\])?|\\(?:newline|linebreak)(?![A-Za-z])(?:\s*\[[^\]]*\])?)\s*$/
/** mt.mjs SPACING: a piece a space never goes before — a space itself (a tie, a control space, a kern), a group's end */
const SPACING = /^(?:~|\\[ ,;:]|\\(?:q?quad|enspace|thinspace|nobreakspace)(?![A-Za-z])|\\hspace\*?\{|\}$)/
/** mt.mjs utf8: a source's text is read byte for byte (latin1), its characters UTF-8 */
const utf8 = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff; return new TextDecoder().decode(b) }
/** mt.mjs shown: a text piece as the compiled PDF shows it, a translation's TeX escapes undone, a source's bytes as UTF-8 */
const shown = p => (p.tr ? p.s.replace(/\\(textbackslash|textasciitilde|textasciicircum)\{\}/g, ' ').replace(/\\([#$%&_{}])/g, '$1') : utf8(p.s))

/** a piece's key for finding an equal one: its kind, its source and, an open's or a close's, its pair; null where it has
 *  not their shape */
const keyOf = p => {
  if (!p || typeof p !== 'object' || typeof p.t !== 'string' || (p.src !== undefined && typeof p.src !== 'string')) return null
  return JSON.stringify([p.t, p.src ?? null, p.t === 'open' || p.t === 'close' ? (p.id ?? null) : null])
}

/**
 * Each translated piece's source index (`k`): the same object's index in `source` — a run's pieces are the unit's own
 * objects (mt.mjs rehydrate, the runs path) —, else, for a piece read from JSON (a copy's, a record's), the first source
 * piece of the same kind and source (and pair, an open's or a close's) that no piece before it took; -1 where none. Two
 * equal placeholders read from JSON are so taken in the order the translation has them. A function of its own per unit,
 * since it counts what it took
 */
export function kOfSource(source) {
  const list = Array.isArray(source) ? source : []
  const used = new Set()
  let byObject = null, byKey = null
  return piece => {
    byObject ??= new Map(list.map((p, k) => [p, k]).filter(([p]) => p && typeof p === 'object').reverse())
    let k = piece && typeof piece === 'object' ? (byObject.get(piece) ?? -1) : -1
    if (k < 0) {
      const key = keyOf(piece)
      if (key === null) return -1
      if (!byKey) { byKey = new Map(); list.forEach((p, i) => { const q = keyOf(p); if (q !== null) (byKey.get(q) ?? byKey.set(q, []).get(q)).push(i) }) }
      const all = byKey.get(key) ?? []
      while (all.length && used.has(all[0])) all.shift()
      k = all.shift() ?? -1
    }
    if (k >= 0) used.add(k)
    return k
  }
}

/** each slot's index in its unit's pieces (`slots`: mt.mjs serialize(unit).slots, which the caller makes): the early's
 *  slots carry these, so that a wire read back against them names its placeholders by k */
export function slotKs(unit, slots) {
  const kOf = kOfSource(unit?.pieces)
  return (Array.isArray(slots) ? slots : []).map(kOf)
}

/**
 * The engine's translated pieces as TrPiece: a text as `shown` gives it; an open with its source's flags, a close, a
 * placeholder, each by its k; a placeholder that is a style switch as an open with SWITCH, and no close of its own; a
 * space (a tie, a kern, mt.mjs SPACING's) as a space, a forced break as a line feed — so that trText is plainTranslated.
 * Null where a piece is not of a piece's shape, or a non-text piece has no k: never a part of a unit
 */
export function trPiecesOf(pieces, kOf) {
  if (!Array.isArray(pieces) || typeof kOf !== 'function') return null
  const out = []
  for (const p of pieces) {
    if (!p || typeof p !== 'object' || typeof p.t !== 'string') return null
    if (p.t === 'text') {
      if (typeof p.s !== 'string') return null
      out.push([0, shown(p)])
      continue
    }
    const k = kOf(p)
    if (!Number.isInteger(k) || k < 0) return null
    const src = typeof p.src === 'string' ? p.src : ''
    if (p.t === 'open') out.push([2, k, styleOf(src)])
    else if (p.t === 'close') out.push([3, k])
    else if (p.t !== 'ph') out.push([1, k])
    else if (SWITCH.test(src)) out.push([2, k, styleOf(src) | STYLE.SWITCH])
    else if (BREAK.test(src)) out.push([0, '\n'])
    else if (SPACING.test(src)) out.push([0, ' '])
    else out.push([1, k])
  }
  return out
}

/** the text sentence offsets count in: plainTranslated's, from TrPiece — each non-text piece a space, white space
 *  collapsed, trimmed */
export const trText = pieces => pieces.map(p => (p[0] === 0 ? p[1] : ' ')).join('').replace(/\s+/g, ' ').trim()
