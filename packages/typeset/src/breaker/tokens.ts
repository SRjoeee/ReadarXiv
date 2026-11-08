// B.tokens (design-b §1.5): a unit's row as the breaker's tokens, unmeasured, each in the face it is set in (T39, E21):
// the style stack over the row's groups and switches, script chunks, glue, the line-break marks, UAX 14's kept pairs,
// CJK–Latin autospace, punctuation's compression, hyphenation's language, the layer's own small capitals, TeX's explicit glue
// as kerns, crops, the control tokens (a forced break's newline, a kept region's blockTo), the marks dropped after a display or
// a held line's mark and the class's tail marks (U.marks' decisions, T16, T17: unit/marks.ts, called where today decides them,
// its trace in the answer), the spaces a spaceless script does not set, and
// each token's place in the unit's plain text (the word table's). Ported from engine 065c1d973 layer2.mjs: tokensOf2
// L2:2524-2890, baseOf L2:2253-2297, STYLE_CMDS and applyCmd L2:2106-2122, glueOf L2:2394-2416, spacelessEdge L2:2417-2430, selfCaps / plainOf / upperOf / caseRuns L2:2448-2483, renameRuns
// L2:1309-1320, cropPartsOf L2:1875-1878, LINK_OPEN L2:2245, hexOf L2:4569.
//
// What it reads, and the field each comes from once the part states it (until then the tap's recorded values):
// - `unit`: the row's pieces in the translation's order (rows.mjs unitOf), its kind and title ← Row + Placed.kind / flags
// - `resolved`: the unit's reading: the elements' resolutions (U.elements, U.breaks' marks, U.rename's names, U.marks' facts),
//   `measured` (the base style and pieces' colours its glyphs hold ← TeX's font state, Placed.style / spans), `capsRatio`
//   (Style.sc), `orig.size` (Style.size), `openBreaks` / `referenced` (U.breaks), `tail` / `tailOwn` (Placed.tail)
// - `colourOf`, `fillOf`: a colour piece's run's fill and an element's (TeX's log, A's glyphs) ← SpanAt.style.fill, El.style.fill
// - `fills`, `smallCaps`: each rendering's runs of one fill and its faked small capitals (its page characters today) ← El.style;
//   `fakedCaps`: the renderings set wholly in them ← El.style (all capitals at the small size) of a Style.sc unit
// - `cls2`: each piece's class ← El.kind; `spacedSource`: the source writes CJK with spaces between ← a unit fact
// - `faces`: B.faces' answers (faceOf over the role table and the paper's family) and whether a face has small capitals
// - `P`: the rule set's fields resolved for the target (Rules.breaking, Rules.fit); `designs`: the paper's (A3)
import { cjkClassRe, kinsokuOf, keptPair, noStart, PUNCT_CLOSE, PUNCT_OPEN, SPACELESS } from './script.ts'
import { drawnText, plainTracker, shown, type TextPiece, transformMap } from './text.ts'
import { dropMarks, type MarksAfter, type MarksTrace, mergeTail } from '../unit/marks.ts'
import type { V0Piece } from '../unit/breaks.ts'

/** a run's style as the tokens carry it: today's style object (family, weight, slant, small capitals, design, colour, link…) */
export type TStyle = {
  fam?: string
  bold?: boolean
  italic?: boolean
  caps?: boolean
  design?: string
  color?: string | undefined
  colourRun?: true
  link?: unknown
  upper?: boolean
  fill?: number
  [more: string]: unknown
}
/** a face as today's faceOf gives it (fonts.mjs roleFaceOf) */
export type Face = {
  family: string
  weight: number
  style: string
  oblique: number
  stand: string
  caps: boolean
  size: number
  id?: string
  ids?: string[]
}
/** a token (layer2.d.mts Token): a run of one face, a space, a crop, or a control token */
export type Token = {
  s?: string
  st?: TStyle
  face?: Face
  cls?: 'cjk' | 'latin'
  w100: number
  glue?: boolean
  brk?: boolean
  cont?: boolean
  asp?: boolean
  punct?: 'open' | 'close' | null
  hyph?: string
  sc?: number
  at?: number
  end?: number
  space?: true
  keep?: true
  crop?: Record<string, unknown>
  cw?: number
  sup?: true
  ph?: string
  k?: number
  math?: true
  label?: true
  leadEnd?: true
  leadGap?: number
  kern?: true
  kernEm?: number
  kernW?: number
  kernEnd?: true
  newline?: number
  room?: number
  blockTo?: number
}
/** a resolution as the tokens read it (U.elements' with the later rules' fields) */
export type TRes = {
  mode: string
  text?: string
  sup?: boolean
  math?: boolean
  st?: TStyle | null
  cls?: string
  k?: number
  parts?: { page: number; crop: number[]; baseline: number; seg: unknown }[]
  crop?: number[]
  gap?: Record<string, unknown> | null
  rename?: [number, number, string][]
  brk?: true
  room?: number
  brkAt?: number
  region?: number
  inPlace?: true
  origAfter?: string | null
  heldAfter?: string | null
  heldMarks?: string[]
  [more: string]: unknown
}
export type Reading = {
  get(k: number): TRes | undefined
  measured?: { st?: TStyle | null; fill?: number | null; pieces?: ReadonlyMap<number, number> | null } | null
  capsRatio?: number
  orig?: { size?: number } | null
  openBreaks?: ReadonlyMap<number, number> | null
  referenced?: ReadonlySet<number> | null
  tail?: readonly { ch: string; st?: TStyle | null }[] | null
  tailOwn?: readonly string[] | null
}
/** the rule set's fields the tokens read (rules/layout.mjs resolveRules' params) */
export type TokenRules = {
  keepAll: boolean
  cjkQuotes: boolean
  centredPunct: boolean
  latinPatterns: string
  cyrillicPatterns: string
  hyphenation: { minWord: number }
  noStart: string
  noEnd: string
  autospace: number
  compressMax: number
  hyphen: boolean | number
}
export type TokensInput = {
  unit: { kind: string; title?: boolean; pieces: readonly V0Piece[] }
  resolved: Reading
  colourOf: (k: number) => number | null
  fillOf: (k: number) => number | null
  fills: ReadonlyMap<number, { text: string; fill: number }[] | null>
  smallCaps: ReadonlyMap<number, readonly boolean[] | null>
  /** the renderings the part states in the page's faked small capitals, by piece (lay/read.ts: an element all capitals at its
   *  small-capitals unit's small size, El.style and Style.sc), drawn in the layer's small capitals; the tap's rounds hold none */
  fakedCaps?: ReadonlySet<number>
  cls2: readonly (string | null)[]
  spacedSource: boolean
  to: string
  base: TStyle
  designs: { serif: string; sans: string; mono: string }
  P: TokenRules
  lead: { parts?: { text: string; st: TStyle }[]; gap?: number } | null
  faces: { of(st: TStyle, cls: 'cjk' | 'latin'): Face; ownSmallCaps(id: string): boolean }
  /** each text token's range in the unit's plain text (the page's word table) */
  tagWords: boolean
}
/** the tokens, with the unit's base style (today's `tokens.base`) and U.marks' decisions taken while they were made */
export type Tokens = { tokens: Token[]; base: TStyle; marks: MarksTrace }

export const hexOf = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`
/** a fill not told (layout/fills.mjs UNKNOWN) */
const UNKNOWN = -1
/** \href's, \hyperref's and \hyperlink's open (L2:2245) */
const LINK_OPEN = /^\\(?:href|hyperref|hyperlink)(?![A-Za-z])/

type Designs = TokensInput['designs']
/** the style commands, each with what it sets (L2:2107 STYLE_CMDS) */
const STYLE_CMDS: [RegExp, (s: TStyle, d: Designs) => TStyle][] = [
  [/^\\(?:textbf|bf|bfseries|mathbf|boldsymbol)\b/, (s) => ({ ...s, bold: true })],
  [/^\\(?:textmd|mdseries)\b/, (s) => ({ ...s, bold: false })],
  [/^\\(?:emph|em)\b/, (s) => ({ ...s, italic: !s.italic })],
  [/^\\(?:textit|it|itshape|textsl|sl|slshape|mathit)\b/, (s) => ({ ...s, italic: true })],
  [/^\\(?:textup|upshape)\b/, (s) => ({ ...s, italic: false })],
  [/^\\(?:textsc|sc|scshape)\b/, (s) => ({ ...s, caps: true })],
  [/^\\(?:texttt|tt|ttfamily|url|path|code|lstinline)\b/, (s, d) => ({ ...s, fam: 'mono', design: d.mono })],
  [/^\\(?:textsf|sf|sffamily)\b/, (s, d) => ({ ...s, fam: 'sans', design: d.sans })],
  [/^\\(?:textrm|rm|rmfamily)\b/, (s, d) => ({ ...s, fam: 'serif', design: d.serif })],
  [
    /^\\(?:textnormal|normalfont)\b/,
    (s, d) => ({ ...s, fam: 'serif', bold: false, italic: false, caps: false, design: d.serif }),
  ],
]
const applyCmd = (src: string | undefined, s: TStyle, d: Designs): TStyle | null => {
  for (const [re, f] of STYLE_CMDS) if (re.test(src as string)) return f(s, d)
  return null
}

const GROUP_ITALIC = 1,
  GROUP_BOLD = 2,
  GROUP_CAPS = 4
/** a string's UTF-16 code units that are no white space (L2:2289 nonSpace) */
function nonSpace(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (
      c === 32 ||
      (c >= 9 && c <= 13) ||
      c === 0xa0 ||
      c === 0x1680 ||
      (c >= 0x2000 && c <= 0x200a) ||
      c === 0x2028 ||
      c === 0x2029 ||
      c === 0x202f ||
      c === 0x205f ||
      c === 0x3000 ||
      c === 0xfeff
    )
      continue
    n++
  }
  return n
}
/** the unit's base style without what its own groups set (L2:2253 baseOf) */
export function baseOf(unit: TokensInput['unit'], base: TStyle): TStyle {
  let total = 0,
    capsAfter = false,
    inItalic = 0,
    inBold = 0,
    inCaps = 0,
    nItalic = 0,
    nBold = 0,
    nCaps = 0
  const open: number[] = []
  for (const p of unit.pieces) {
    if (p.t === 'open') {
      const src = p.src as string
      const bits =
        (/^\\(?:textit|emph|itshape|textsl)\b/.test(src) ? GROUP_ITALIC : 0) |
        (/^\\(?:textbf|bfseries)\b/.test(src) ? GROUP_BOLD : 0) |
        (/^\\(?:textsc|scshape)\b/.test(src) ? GROUP_CAPS : 0)
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
      else if (!(open[open.length - 1]! & GROUP_CAPS)) {
        open[open.length - 1]! |= GROUP_CAPS
        nCaps++
      }
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

/** a length TeX reads as a dimension, in PDF units (L2:2394-2399) */
const DIMEN = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(pt|bp|mm|cm|in|pc|dd|cc|sp|em)$/
const BP: Record<string, number> = {
  pt: 72 / 72.27,
  bp: 1,
  mm: 72 / 25.4,
  cm: 72 / 2.54,
  in: 72,
  pc: (12 * 72) / 72.27,
  dd: ((1238 / 1157) * 72) / 72.27,
  cc: (((12 * 1238) / 1157) * 72) / 72.27,
  sp: 72 / 72.27 / 65536,
}
const KERNS: Record<string, number> = {
  '\\enspace': 0.5,
  '\\thinspace': 1 / 6,
  '\\,': 1 / 6,
  '\\:': 2 / 9,
  '\\;': 5 / 18,
}
const SKIPS: Record<string, number> = { '\\quad': 1, '\\qquad': 2 }
/** a placeholder's source that is explicit glue, as TeX sets it: { em } or { bp }, and whether a line may break at it
 *  (L2:2406 glueOf) */
export function glueOf(src: string): { em?: number; bp?: number; brk: boolean } | null {
  if (Object.hasOwn(KERNS, src)) return { em: KERNS[src]!, brk: false }
  if (Object.hasOwn(SKIPS, src)) return { em: SKIPS[src]!, brk: true }
  const m = /^\\(hspace\*?|hskip|kern)\s*(?:\{\s*([^{}]*?)\s*\}|([^{}\\]*?))\s*$/.exec(src)
  if (!m) return null
  const len = (m[2] ?? m[3] ?? '').replace(/\s+(?:plus|minus)\s.*$/, '').trim()
  const d = DIMEN.exec(len)
  if (!d || !(Number(d[1]) > 0)) return null
  const brk = m[1] !== 'kern'
  return d[2] === 'em' ? { em: Number(d[1]), brk } : { bp: Number(d[1]) * BP[d[2]!]!, brk }
}

const SPACELESS_QUOTES = /[“”‘’—…·]/u
/** a token whose edge is a character a spaceless script sets no space beside (L2:2426 spacelessEdge) */
const spacelessEdge = (t: Token | null, end: boolean) => {
  if (t?.cls !== 'cjk' || typeof t.s !== 'string' || !t.s) return false
  const cps = [...t.s],
    ch = end ? cps.at(-1)! : cps[0]!
  return SPACELESS.test(ch) || SPACELESS_QUOTES.test(ch)
}

/** a target's capitals: its language's case mapping, the root's where it names none a locale reads (L2:2454 upperOf) */
export function upperOf(to: string): (s: string) => string {
  let loc = 'und'
  if (typeof to === 'string' && to)
    try {
      'a'.toLocaleUpperCase(to)
      loc = to
    } catch {}
  return (s) => s.toLocaleUpperCase(loc)
}
const MARKS = /^\p{M}$/u,
  CAPITAL = /^\p{Lu}$/u
/** `s` in runs of one case as the layer draws its small capitals (L2:2472 caseRuns) */
export function caseRuns(
  s: string,
  ratio: number,
  upper: (s: string) => string,
  smallAt: ((at: number) => boolean) | null = null,
): { s: string; k: number; at: number; n: number }[] {
  const out: { src: string; k: number; at: number; n: number }[] = []
  let at = 0
  for (const ch of s) {
    const last = out.at(-1)
    const k = last && MARKS.test(ch) ? last.k : upper(ch) !== ch || (smallAt?.(at) && CAPITAL.test(ch)) ? ratio : 1
    if (last?.k === k) {
      last.src += ch
      last.n += ch.length
    } else out.push({ src: ch, k, at, n: ch.length })
    at += ch.length
  }
  return out.map(({ src, k, at: a, n }) => ({ s: k === 1 ? src : upper(src), k, at: a, n }))
}
/** a rendering's runs with the names a package generated in it in the target's (L2:1309 renameRuns) */
export function renameRuns<R extends { text: string }>(
  runs: readonly R[],
  rename: readonly [number, number, string][],
): R[] | null {
  const out = runs.map((r) => ({ ...r }))
  let from = 0
  const starts = out.map((r) => {
    const s = from
    from += r.text.length
    return s
  })
  for (const [a, b, w] of [...rename].sort((x, y) => y[0] - x[0])) {
    const i = starts.findIndex((s, j) => a >= s && b <= s + out[j]!.text.length)
    if (i < 0) return null
    const s = starts[i]!
    out[i]!.text = out[i]!.text.slice(0, a - s) + w + out[i]!.text.slice(b - s)
  }
  return out
}
/** a crop resolution as its readers take it, one a part (L2:1875 cropPartsOf) */
export function cropPartsOf(r: TRes): Record<string, unknown>[] {
  if (!r.parts) return [r]
  return r.parts.map((q, i) => ({
    ...r,
    page: q.page,
    crop: q.crop,
    baseline: q.baseline,
    text: i ? '' : r.text,
    gap: { ...r.gap, box: q.seg },
    part: i,
    parts: undefined,
  }))
}

/** B.tokens: the unit's row as tokens, unmeasured, each in its face (L2:2524 tokensOf2) */
export function tokens(i: TokensInput): Tokens {
  const { unit, resolved, to, designs, P, lead } = i
  const faceOf = (st: TStyle, cls: 'cjk' | 'latin') => i.faces.of(st, cls)
  const selfCaps = (face: Face | undefined) => !!face?.caps && !(face.id && i.faces.ownSmallCaps(face.id))
  const plainOf = (face: Face) => (selfCaps(face) ? { ...face, caps: false } : face)
  const tokens: Token[] = []
  const plain = i.tagWords ? plainTracker() : null
  const measured = resolved.measured ?? null
  const { fill: _fill, ...given } = i.base
  const base: TStyle = measured?.st ? { ...given, ...measured.st } : baseOf(unit, given)
  if (Number.isInteger(measured?.fill) && measured!.fill! > 0) base.color = hexOf(measured!.fill!)
  const stack: TStyle[] = [{ ...base }]
  const style = () => stack.at(-1)!
  const colourRun = (k: number, p: V0Piece): { color?: string | undefined; colourRun?: true } => {
    const rgb = i.colourOf(k)
    if (Number.isInteger(rgb)) return { color: hexOf(rgb!), colourRun: true }
    const own = Number.isInteger(p.k) ? measured?.pieces?.get(p.k!) : undefined
    if (Number.isInteger(own)) return { color: own! > 0 ? hexOf(own!) : undefined, colourRun: true }
    return {}
  }
  const { keepAll, cjkQuotes, centredPunct: centred, latinPatterns: latinLang, cyrillicPatterns: cyrLang } = P
  const minWord = P.hyphenation.minWord
  const cjkRe = cjkClassRe(cjkQuotes)
  const kinsoku = kinsokuOf(P.noStart, P.noEnd)
  const lastIsSpace = () => tokens.length > 0 && !!tokens.at(-1)!.space
  let noBreakNext = false,
    afterHead = false
  const push = (t: Token) => {
    const prev = tokens.at(-1)
    if (noBreakNext && !t.space) t.glue = true
    noBreakNext = false
    afterHead = false
    if (prev && !prev.space && !t.space) {
      if (kinsoku.starts(t.s ?? '') || (prev.s && kinsoku.ends(prev.s))) t.glue = true
      else if (keptPair(prev.s, t.s)) t.glue = true
      if (!t.brk && t.cls === 'latin' && prev.cls === 'latin' && !prev.crop && !prev.kernW) t.glue = true
      const cjkSide = t.cls === 'cjk' ? t.s : (prev.s ?? '')
      if (
        P.autospace &&
        !prev.kernW &&
        t.cls &&
        prev.cls &&
        t.cls !== prev.cls &&
        /[A-Za-z0-9]/.test((t.cls === 'latin' ? t.s![0] : ((prev.s ?? '').at(-1) ?? '')) as string) &&
        !/^[\u3001\u3002\uFF0C\uFF0E\uFF1A\uFF1B\uFF01\uFF1F\uFF08\uFF09\u300C\u300D\u300E\u300F\u3010\u3011\u3014\u3015\u3008\u3009\u300A\u300B“”‘’]$/.test(
          cjkSide as string,
        )
      )
        t.asp = true
    }
    tokens.push(t)
  }
  const capsK = resolved.capsRatio ?? 0.8,
    upper = upperOf(to)
  type Track = {
    at: Int32Array
    sh: string
    base: number
    map: { from: number[]; span: number[] }
    sm: Int32Array | null
  }
  const pushText = (
    s: string,
    st: TStyle,
    extra: { label?: true; ph?: string; k?: number; math?: true } = {},
    track: Track | null = null,
    smallAt: ((at: number) => boolean) | null = null,
  ) => {
    for (const m of s.matchAll(/\s+|\S+/g)) {
      const chunk = m[0]
      if (/^\s+$/.test(chunk)) {
        if (tokens.length && !lastIsSpace() && !tokens.at(-1)!.leadEnd && !tokens.at(-1)!.kernEnd) {
          const face = plainOf(faceOf(st, 'latin'))
          tokens.push({ space: true, st, face, w100: 0, ...(afterHead ? { keep: true as const } : {}) })
        }
        afterHead = false
        continue
      }
      const parts: { cls: 'cjk' | 'latin'; s: string; off: number }[] = []
      let cur: { cls: 'cjk' | 'latin'; s: string; off: number } | null = null,
        off = 0
      for (const ch of chunk) {
        const cls = cjkRe.test(ch) ? 'cjk' : 'latin'
        if (cls === 'cjk' && !keepAll) {
          cur = null
          parts.push({ cls, s: ch, off })
          off += ch.length
          continue
        }
        if (cur && cur.cls === cls) cur.s += ch
        else {
          cur = { cls, s: ch, off }
          parts.push(cur)
        }
        off += ch.length
      }
      parts.forEach((p, n) => {
        const pieces =
          p.cls !== 'latin'
            ? [p.s]
            : st.fam === 'mono' || /^(?:https?:|www\.)/.test(p.s)
              ? p.s.split(/(?<=[/.\-_#?&=])(?=[^/.\-_#?&=])/)
              : !extra.ph
                ? p.s.split(/(?<=[A-Za-zÀ-ɏЀ-ӿ][-/])(?=[A-Za-zÀ-ɏЀ-ӿ])/)
                : [p.s]
        let po = 0
        pieces.forEach((s, q) => {
          const face0 = faceOf(st, p.cls)
          const from = m.index + p.off + po
          const all = p.cls === 'latin' && !!st.upper
          const runs =
            !all && p.cls === 'latin' && selfCaps(face0)
              ? caseRuns(s, capsK, upper, smallAt && ((x) => smallAt(from + x)))
              : null
          const face = runs || all ? plainOf(face0) : face0
          for (let r = 0, count = runs ? runs.length : 1; r < count; r++) {
            const run = runs?.[r],
              rs = run ? run.s : all ? upper(s) : s,
              k = run ? run.k : 1,
              at = run ? run.at : 0,
              len = run ? run.n : s.length
            const t: Token = {
              s: rs,
              st,
              face,
              cls: p.cls,
              w100: 0,
              ...extra,
              ...(q > 0 && at === 0 ? { brk: true } : {}),
            }
            if (k !== 1) t.sc = k
            if (track && len) {
              const x = from + at,
                last = x + len - 1
              const sm = track.sm,
                a = track.base + track.map.from[x]!,
                z = track.base + track.map.from[last]! + track.map.span[last]! - 1
              if (!sm || /\S/.test(track.sh.slice(sm[a], sm[z]! + 1))) {
                t.at = track.at[sm ? sm[a]! : a]!
                t.end = track.at[sm ? sm[z]! : z]! + 1
              }
            }
            if (at > 0) {
              t.glue = true
              t.cont = true
            } else if (q === 0 && n > 0 && !(!keepAll && (p.cls === 'cjk' || parts[n - 1]!.cls === 'cjk')))
              t.glue = true
            if (p.cls === 'cjk' && s.length === 1 && !centred && P.compressMax >= 0)
              t.punct = PUNCT_CLOSE.test(s) ? 'close' : PUNCT_OPEN.test(s) ? 'open' : null
            if (
              !runs &&
              !all &&
              p.cls === 'latin' &&
              P.hyphen &&
              !extra.ph &&
              st.fam !== 'mono' &&
              s.length >= minWord &&
              unit.kind !== 'heading' &&
              !unit.title
            ) {
              const word = s.replace(/[^A-Za-zÀ-ɏЀ-ӿ]+$/, '').replace(/^[^A-Za-zÀ-ɏЀ-ӿ]+/, '')
              const cyr = /[Ѐ-ӿ]/.test(word)
              if (word.length >= minWord && (cyr ? /^[Ѐ-ӿ]+$/.test(word) : /^[A-Za-zÀ-ɏ][a-zà-ɏß]+$/.test(word)))
                t.hyph = cyr ? cyrLang : latinLang
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
    const st = { ...base, ...lead.parts.at(-1)!.st }
    if (lead.gap === undefined) pushText(' ', st)
    else if (tokens.length) {
      const t = tokens[tokens.length - 1]!
      t.leadEnd = true
      if (lead.gap > 0) {
        t.leadGap = 100 * lead.gap
        t.kern = true
        if (plain) t.kernEm = lead.gap
      }
    }
  }
  // (U.marks, T16: a mark no line starts with that the translation sets after a display, or after a held line's own mark)
  let after: MarksAfter | null = null
  const marks: MarksTrace = { drops: [], tail: null }
  let headId: unknown = null
  for (const [k, p] of unit.pieces.entries()) {
    if (p.t === 'text') {
      if (/\S/.test(p.s)) break
      continue
    }
    if (p.t === 'ph' && (glueOf(p.src) || ['zero', 'space'].includes(i.cls2[k] ?? ''))) continue
    if (p.t === 'open' && applyCmd(p.src, base, designs)) headId = p.id
    break
  }
  const kernOn = (g: { em?: number; bp?: number; brk: boolean }) => {
    const size = resolved.orig?.size
    const em = g.em ?? (g.bp !== undefined && size! > 0 ? g.bp / size! : 0)
    if (!(em > 0)) return
    while (tokens.at(-1)?.space) tokens.pop()
    const t = tokens.at(-1)
    if (!t || t.newline !== undefined || t.blockTo !== undefined) return
    t.kernW = (t.kernW ?? 0) + 100 * em
    t.kernEnd = true
    if (!g.brk) noBreakNext = true
  }
  unit.pieces.forEach((p, k) => {
    if (p.t === 'text') {
      const raw = drawnText(p as TextPiece)
      let s = raw
      const sh = plain ? shown(p as TextPiece) : null,
        at = plain?.text(sh!)
      if (after && /\S/.test(s)) {
        s = dropMarks(s, after, marks)
        after = null
      }
      const text = s
        .replace(/\n/g, ' ')
        .replace(/---/g, '—')
        .replace(/--/g, '–')
        .replace(/``/g, '“')
        .replace(/''/g, '”')
      const sm = at
        ? sh === raw
          ? true
          : (p as TextPiece).tr && sh!.length === raw.length
            ? Int32Array.from({ length: raw.length }, (_, x) => x)
            : null
        : null
      const map = sm ? transformMap(s, text) : null
      pushText(
        text,
        style(),
        {},
        map && { at: at!, sh: sh!, base: raw.length - s.length, map, sm: sm === true ? null : sm },
      )
      return
    }
    plain?.gap()
    // (a piece TeX opened a paragraph at, U.breaks' openBreaks: a group's open (paragraphBreaks), or an element (El.opens, drawn
    // after it): the text before it ends its block, the piece starts the paragraph's)
    const opened = resolved.openBreaks?.get(k)
    if (opened !== undefined && resolved.referenced?.has(opened)) {
      while (tokens.at(-1)?.space) tokens.pop()
      if (tokens.at(-1)?.blockTo !== opened) tokens.push({ blockTo: opened, w100: 0, brk: true })
    }
    if (p.t === 'open') {
      const next = applyCmd(p.src, style(), designs)
      const link = LINK_OPEN.test(p.src as string) && p.id !== undefined ? { link: p.id } : {}
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
      if (glue) {
        kernOn(glue)
        return
      }
      const sw = applyCmd(p.src, style(), designs)
      if (sw && /^\\[A-Za-z]+$/.test(p.src)) {
        stack[stack.length - 1] = sw
        return
      }
      const run = colourRun(k, p)
      if (run.colourRun) stack[stack.length - 1] = { ...style(), ...run }
    }
    const r = resolved.get(k)
    if (!r) return
    if (r.brk && r.room !== undefined) {
      while (tokens.at(-1)?.space) tokens.pop()
      if (tokens.at(-1)?.newline !== r.brkAt) tokens.push({ newline: r.brkAt!, room: r.room, w100: 0 })
      return
    }
    if (r.brk && r.region !== undefined && resolved.referenced?.has(r.region)) {
      while (tokens.at(-1)?.space) tokens.pop()
      if (tokens.at(-1)?.blockTo !== r.region) tokens.push({ blockTo: r.region, w100: 0, brk: true })
      return
    }
    if (r.mode === 'kept' && r.region !== undefined && resolved.referenced?.has(r.region)) {
      while (tokens.at(-1)?.space) tokens.pop()
      tokens.push({ blockTo: r.region, w100: 0 })
      if (r.cls === 'display') after = r
      else if (noStart(r.heldAfter))
        after = { origAfter: null, held: r.heldMarks?.length ? r.heldMarks : [r.heldAfter!] }
      return
    }
    if (r.cls === 'display' && r.inPlace && !tokens.some((t) => !t.space)) {
      after = r
      return
    }
    if (r.mode !== 'none' && r.text !== ' ' && !(r.mode === 'kept' && r.cls === 'display')) after = null
    if (r.mode === 'crop') {
      const pv = tokens.at(-1)
      const ecglue = !keepAll && pv?.cls === 'cjk' && !pv.leadEnd && !pv.kernW && !(pv.s && kinsoku.ends(pv.s))
      for (const [n, q] of cropPartsOf(r).entries()) {
        if (n) pushText(' ', style())
        const glue = tokens.length > 0 && !lastIsSpace() && !(n === 0 && ecglue)
        const c = q.crop as number[]
        tokens.push({ crop: q, cw: c[2]! - c[0]!, glue, w100: 0 })
      }
      return
    }
    if (!r.text) return
    if (r.text === ' ') {
      pushText(' ', style())
      return
    }
    const own0: TStyle = r.math
      ? { ...style(), italic: /[A-Za-z]/.test(r.text) && r.text.length <= 3, caps: false }
      : r.mode === 'orig-text' && r.st && r.st.fam !== 'math'
        ? {
            ...style(),
            fam: r.st.fam === 'mono' ? 'mono' : style().fam,
            design: r.st.fam === 'mono' ? designs.mono : style().design,
          }
        : style()
    if (r.math && own0.upper) own0.upper = false
    // (a rendering the part states in the page's faked small capitals (`fakedCaps`): in the layer's small capitals, every
    // capital a small one at capsRatio (caseRuns' smallAt), never in full capitals at the unit's size, whatever its unit's
    // base; triage S6)
    const faked =
      r.mode === 'orig-text' && !r.math && !r.sup && !r.rename?.length && !own0.upper && !!i.fakedCaps?.has(k)
    const own: TStyle = faked && !own0.caps ? { ...own0, caps: true } : own0
    const fill = i.fillOf(k)
    const st = !own.colourRun && Number.isInteger(fill) && fill! >= 0 ? { ...own, color: hexOf(fill!) } : own
    const fills = r.mode === 'orig-text' && !r.math && !own.colourRun ? (i.fills.get(k) ?? null) : null
    let runs: { text: string; st: TStyle }[] | null = fills ? [] : null
    for (const run of fills ?? []) {
      const rs = run.fill === UNKNOWN ? st : { ...own, color: run.fill > 0 ? hexOf(run.fill) : undefined }
      const last = runs!.at(-1)
      if (last && (last.st.color ?? null) === (rs.color ?? null)) last.text += run.text
      else runs!.push({ text: run.text, st: rs })
    }
    const renamed =
      r.mode === 'orig-text' && !r.math && !r.sup && r.rename?.length
        ? renameRuns(runs ?? [{ text: r.text, st }], r.rename)
        : null
    if (renamed) runs = renamed
    const flags =
      !renamed && r.mode === 'orig-text' && !r.math && own.caps && !own.upper
        ? faked
          ? Array.from({ length: r.text.length }, () => true)
          : (i.smallCaps.get(k) ?? null)
        : null
    const capsAt = flags ? (x: number) => !!flags[x] : null
    if (r.sup) {
      for (const run of runs ?? [{ text: r.text, st }]) {
        const face = plainOf(faceOf(run.st, 'latin'))
        tokens.push({ s: run.text, st: run.st, face, cls: 'latin', w100: 0, sup: true, glue: true, ph: r.mode, k })
      }
    } else if (runs) {
      let at = 0
      for (const run of runs) {
        const from = at
        pushText(run.text, run.st, { ph: r.mode, k }, null, capsAt && ((x) => capsAt(from + x)))
        at += run.text.length
      }
    } else pushText(r.text, st, { ph: r.mode, k, ...(r.math ? { math: true as const } : {}) }, null, capsAt)
  })
  // (U.marks, T17: the class's own marks after the unit's text, in place of the translation's of their kinds at its end)
  if (resolved.tail?.length) {
    marks.tail = [resolved.tail.length, mergeTail(tokens, resolved.tail, resolved.tailOwn ?? null)]
    for (const c of resolved.tail) {
      const cs =
        c.st && c.st.fam !== 'math'
          ? {
              fam: c.st.fam,
              bold: !!c.st.bold,
              italic: !!c.st.italic,
              caps: !!c.st.caps,
              ...(c.st.design ? { design: c.st.design } : {}),
            }
          : {}
      pushText(c.ch, { ...base, ...cs })
    }
  }
  while (tokens.at(-1)?.space) tokens.pop()
  if (!keepAll && !i.spacedSource) {
    const drawnAt = (q: number, step: number) => {
      for (; q >= 0 && q < tokens.length; q += step) if (!tokens[q]!.space) return tokens[q]!
      return null
    }
    const kept = tokens.filter(
      (t, q) =>
        !t.space ||
        t.keep ||
        t.st?.fam === 'mono' ||
        !spacelessEdge(drawnAt(q - 1, -1), true) ||
        !spacelessEdge(drawnAt(q + 1, 1), false),
    )
    if (kept.length < tokens.length) {
      tokens.length = 0
      for (const t of kept) tokens.push(t)
    }
  }
  return { tokens, base, marks }
}
