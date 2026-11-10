// markSource: the marked tree written from SourceDoc's units and pieces, and the plan of what was written where (design §4.3,
// the `marks` row), so that nothing downstream parses our own TeX again: every mark with its name, its kind, the unit and the
// piece it brackets, its file and offset.
//
// Equivalence first (contract stage 1c-2, item 2): the placement is today's, carried as it is — the units marked
// (latex-front.mjs markUnits, frontMarks; marks.mjs layoutMarking's own), each placeholder's marks by its class and the probe's
// answers (marks.mjs layoutMarking: passedOver, LOOKS_AHEAD, ENDS_IN_CS, the paper's switch, the complete calls, the
// look-ahead pairs, moved punctuation, prefixes), a unit's start, end and line probe where patch put them (latex-front.mjs
// patch: the head's passed-over commands, a letter group, the opening marks after the start, the white space the start
// passes), the head TeX and the babel names' wraps of today (live.mjs originalFiles). What differs is how they are written:
// INSERTED into the paper's own bytes at the offsets the reader recorded for each piece, where today's patch wrote each unit's
// range again from its pieces (comments gone, indents repaired). TeX reads the same tokens either way.
import type { Tree } from '../source/definitions.ts'
import type { SourceDoc, SourcePiece, SourceUnit } from '../source/read.ts'
import {
  backrefPiece,
  classOf,
  commandOf,
  inMath,
  isMark,
  LETTER_GROUP,
  LOOKS_AHEAD,
  type Mark,
  type MarkKind,
  type MarkPiece,
  prefixWord,
  READS_NOTHING,
} from './classes.ts'
import { FRAMES_TEX, PARA_ENDS_TEX, SENTENCE_TEX, STATE_TEX } from './statements.ts'
import * as X from './tex.ts'

export const PLAN_FORMAT = 'readarxiv-plan 1'
/** every class, in this order (marks.mjs MARK_CLASSES = LAYOUT_CLASSES) */
export const MARK_CLASSES = Object.freeze([
  'math',
  'display',
  'cite',
  'ref',
  'eqref',
  'code',
  'url',
  'footnote',
  'macro',
  'number',
])

/** what the mark probe answered (marks.mjs readMarkProbe, readInkProbe, readInkApart) and the paper's complete macros
 *  (latex-front.mjs completeMacros): today's inputs of the placement, until stage 1b's count decides the probe */
export interface Answers {
  switches?: Readonly<Record<string, string>> | null
  inkless?: readonly string[] | null
  complete?:
    | ReadonlyMap<string, number>
    | readonly (readonly [string, number])[]
    | Readonly<Record<string, number>>
    | null
  apart?: readonly string[] | null
  /** the paper's macros' calls the probe asked about (marks/probe.ts: chosen before TeX, from a reading of the source with no
   *  definitions), each command's one call and the placeholder glued after it: an answer stands for a call of a complete
   *  macro (`complete`) by its command where it takes no argument, else for that call alone */
  probed?: readonly { command: string; src: string; glued?: string }[] | null
  /** the commands of the asked classes the probe's reading holds: one the probe did not see is placed as with no probe; one it
   *  saw and did not answer has no mark (today's: every command of an asked class TeX did not answer) */
  seen?: readonly string[] | null
}
export interface MarkOptions {
  /** the paper's compiler: `latex` adds the DVI drivers' marks */
  compiler?: string
  answers?: Answers
  /** each marked unit's line probe (\axtlines): the marked original's */
  lines?: boolean
  /** babel's names wrapped (NAMES_TEX); off: NAMES_OFF, and no style's literal wrapped */
  names?: boolean
  classes?: readonly string[]
  /** each colour piece's mark (AXT-COLOUR); on */
  colours?: boolean
  /** units the recovery leaves without any mark of theirs (their own and their placeholders'): unit indices */
  unmarked?: ReadonlySet<number>
  /** the text TeX sets inside a figure (a TikZ node's, an axis label's, a legend entry's) marked as a unit (stage 1b's count:
   *  today's writer never marks it; off) */
  figures?: boolean
  /** a point where TeX ends a sentence: after each ".", "?" or "!" a unit's text follows with more text, \axtsf, which sets its
   *  point only where TeX's space factor there is a sentence's (2000 or more: not after a capital, not under \frenchspacing,
   *  not after "\@"); off */
  sentences?: boolean
  /** a paragraph's end point also after a whatsit (PARA_ENDS_TEX); off */
  paragraphEnds?: boolean
}
/** the recovery's last step (design §4.1): the units' own marks alone — no placeholder's, colour's, name's or line probe */
export const UNITS_ONLY: Readonly<MarkOptions> = Object.freeze({
  classes: [],
  colours: false,
  names: false,
  lines: false,
})
export interface PlanMark {
  /** the mark's name, as its point and destination carry it (`axt-<name>`) */
  name: string
  kind: MarkKind
  /** the unit it marks (its index in SourceDoc `units`), the piece it brackets: its index in the unit's pieces and its id in
   *  the unit's content (an element's `e<n>`, a span's `s<n>`, a nested unit's `u<n>`), -1 and null for the unit's own */
  unit: number
  piece: number
  pieceId: string | null
  file: string
  /** a closing mark written after the punctuation its piece's command sets before its own ink (TeX's answer 3: cite.sty's
   *  superscripts, natmove): that punctuation */
  moved?: string
  /** where it is written: its offset in the file's text as the reader read it, and in the file's bytes (the main file's
   *  bytes after `Plan.head` bytes of ours) */
  at: number
  byte: number
  tex: string
}
export interface Plan {
  format: typeof PLAN_FORMAT
  main: string
  /** the head of ours before the main file's first byte, in bytes (ASCII) */
  head: number
  marks: PlanMark[]
  /** each unit: its id and kind, whether it has a mark of its own, and why not where it is skipped */
  units: { id: string; kind: string; marked: boolean; why?: string }[]
  /** the files written (the others are the paper's bytes) */
  files: string[]
  /** what the head holds */
  parts: { dvi: boolean; names: boolean; lines: boolean; regions: string[] }
}

// ---------------------------------------------------------------- the units' own marks
const AUTHOR_KINDS = new Set(['author', 'affiliation'])
/** a sentence's end in a text: its stop and the closing marks after it, before white space and more text */
const SENTENCE_END = /[.?!][)\]'\u2019\u201d"]*(?=[ \t\r\n]+[^ \t\r\n])/g
const inAuthorBlock = (u: SourceUnit) => AUTHOR_KINDS.has(u.kind)
interface UnitMark {
  start: string
  end: string
  before?: string
  /** the kinds of its start and end marks */
  kinds: [MarkKind, MarkKind]
  names: [string, string]
}
const unitMark = (i: number): UnitMark => ({
  start: `\\leavevmode\\axtmark{${i}s}`,
  end: `\\axtend{${i}e}`,
  kinds: ['start', 'end'],
  names: [`${i}s`, `${i}e`],
})
/** the units whose place a reader shows (latex-front.mjs markUnits) */
const markedUnit = (u: SourceUnit) =>
  !inAuthorBlock(u) &&
  u.kind !== 'heading' &&
  u.kind !== 'cell' &&
  u.kind !== 'figure' &&
  !u.front &&
  !(u.stored && !u.once) &&
  !inMath(u.pieces)
const sourceText = (u: SourceUnit) =>
  u.pieces
    .map((p) => (p.t === 'text' ? (p.src ?? p.s) : p.t === 'nested' ? `${p.pre}\u0000${p.post}` : (p.src ?? '')))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
const asTokens = (t: string) =>
  t
    .replace(/(?<!\\)%[^\n]*(?:\n[ \t]*)?/g, '')
    .replace(/[ \t]*\n[ \t]*\n\s*/g, ' ')
    .replace(/[ \t\n]+/g, ' ')
    .trim()
/** the front matter's units marked in the layout compile (latex-front.mjs frontMarks): one a class compares with another
 *  (an author block's by its block's text, a note by its own) only where no other owner shares its text */
function frontMarked(units: readonly SourceUnit[]): Set<SourceUnit> {
  const front = units.filter(
    (u) =>
      (inAuthorBlock(u) || (u.front && u.kind !== 'heading' && !u.held)) &&
      (!u.stored || (u.once && inAuthorBlock(u))) &&
      !inMath(u.pieces),
  )
  const keyOf = (u: SourceUnit) => (u.block ? `b:${asTokens(u.block.text)}` : `u:${sourceText(u)}`)
  const ownerOf = (u: SourceUnit) => (u.block ? `${u.file}:${u.block.at}` : u)
  const seen = new Map<string, Set<unknown>>()
  for (const u of front) {
    const k = keyOf(u)
    const owners = seen.get(k) ?? (seen.set(k, new Set()).get(k) as Set<unknown>)
    owners.add(ownerOf(u))
  }
  return new Set(front.filter((u) => (seen.get(keyOf(u)) as Set<unknown>).size === 1))
}

// ---------------------------------------------------------------- the placeholders' marks (marks.mjs layoutMarking)
const PUNCT = '.,;:!?'
const ASKED = new Set(['cite', 'ref', 'eqref', 'url', 'footnote'])
export const COMPLETE_PROBE_MAX = 512
export const COMPLETE_SRC_MAX = 200
const completeMap = (c: Answers['complete']): Map<string, number> =>
  c instanceof Map
    ? new Map(c)
    : new Map(Array.isArray(c) ? (c as [string, number][]) : Object.entries((c ?? {}) as Record<string, number>))
const srcOf = (p: MarkPiece | undefined) => (p && 'src' in p && typeof p.src === 'string' ? p.src : '')
const textOf = (p: MarkPiece | undefined) => (p?.t === 'text' ? p.s : '')
/** a call of one of the paper's complete macros with all its arguments (marks.mjs completeCall) */
export function completeCall(p: MarkPiece | undefined, complete: ReadonlyMap<string, number>): boolean {
  if (!complete.size || p?.t !== 'ph' || typeof p.src !== 'string') return false
  const m = /^\\([A-Za-z@]+)/.exec(p.src)
  const arity = m ? complete.get(m[1] as string) : undefined
  if (arity === undefined || arity === null || !m) return false
  const s = p.src
  let k = m[0].length
  const spaces = () => {
    while (k < s.length && /\s/.test(s[k] as string)) k++
  }
  for (let n = 0; n < arity; n++) {
    spaces()
    if (k >= s.length || s[k] === '}') return false
    if (s[k] === '{') {
      let depth = 0
      let j = k
      for (; j < s.length; j++) {
        if (s[j] === '\\') {
          j++
          continue
        }
        if (s[j] === '{') depth++
        else if (s[j] === '}' && --depth === 0) break
      }
      if (j >= s.length) return false
      k = j + 1
    } else if (s[k] === '\\') {
      const c = /^\\(?:[A-Za-z@]+|.)/s.exec(s.slice(k))
      k += c ? c[0].length : 1
    } else k++
  }
  spaces()
  if (arity === 0 && s.startsWith('{}', k)) {
    k += 2
    spaces()
  }
  return k === s.length
}
export const probeFit = (src: string) => !/[%#]|\\(?:verb|lstinline)(?![A-Za-z@])/.test(src) && src.length <= 400
export const gapOf = (s: string) => (s === '' ? '' : /^[ \t]*(?:\r?\n)?[ \t]*$/.test(s) ? ' ' : null)
export const aheadKey = (src: string, gap: string, follows: string) => `${src}#${gap}#${follows}`
/** the paper's macro the placeholder at q follows (marks.mjs pairOf) */
export function pairOf(pieces: readonly MarkPiece[], q: number): [MarkPiece, string, number] | null {
  const p = pieces[q]
  if (p?.t !== 'ph') return null
  const gapped = pieces[q - 1]?.t === 'text'
  const at = gapped ? q - 2 : q - 1
  const m = pieces[at]
  const gap = gapped ? gapOf(textOf(pieces[q - 1])) : ''
  if (
    gap === null ||
    at < 0 ||
    m?.t !== 'ph' ||
    classOf(m) !== 'macro' ||
    READS_NOTHING(m) ||
    prefixWord(m.src) ||
    !probeFit(m.src) ||
    !/^\\./.test(m.src) ||
    m.src.length > COMPLETE_SRC_MAX
  )
    return null
  const before = pieces[at - 1]
  if (at > 0 && before?.t === 'ph' && prefixWord(before.src)) return null
  return [m, gap, at]
}
const colourPiece = (p: MarkPiece | undefined) =>
  (p?.t === 'open' && X.COLOUR_OPEN.test(p.src ?? '')) ||
  (p?.t === 'ph' && !isMark(p) && X.COLOUR_SWITCH.test(p.src ?? ''))
/** where a unit's start mark goes, as patch places it (marks.mjs headEnd) */
export function headEnd(pieces: readonly MarkPiece[], from = 0): number {
  for (let k = from; k < pieces.length; k++) {
    const p = pieces[k] as MarkPiece
    if (p.t === 'text') {
      const s = p.src !== undefined ? p.src : p.s
      const w = /^[ \t\r\n]*(?=[^ \t\r\n])/.exec(s)
      if (!w) continue
      const prev = k > from ? pieces[k - 1] : null
      return w[0].length === 0 && prev?.t === 'ph' && /\\[A-Za-z@]+\*?$/.test(prev.src) ? k - 1 : k
    }
    if (p.t === 'open') continue
    if (p.t === 'ph') {
      if (X.INLINE.test(p.src)) return k
      continue
    }
    return k + 1
  }
  return pieces.length
}
/** the pieces passed over at the head and after each forced break or tab (marks.mjs passedOver) */
function passedOver(pieces: readonly MarkPiece[]): Set<number> {
  const out = new Set<number>()
  const skip = (from: number) => {
    for (let k = from, end = headEnd(pieces, from); k < end; k++) out.add(k)
  }
  skip(0)
  pieces.forEach((p, k) => {
    if (p.t === 'ph' && (X.BREAK.test(p.src ?? '') || p.src === '&')) skip(k + 1)
  })
  return out
}
const mark = (src: string, name: string, kind: MarkKind, piece: number, opens = false): Mark =>
  opens ? { t: 'ph', src, mark: { name, kind, piece }, opens: true } : { t: 'ph', src, mark: { name, kind, piece } }

interface Marking {
  /** each unit's pieces with its placeholders' marks among them */
  pieces: MarkPiece[][]
  own: (i: number) => UnitMark | null
}
function layoutMarking(units: readonly SourceUnit[], o: Required<Pick<MarkOptions, 'lines'>> & MarkOptions): Marking {
  const answers = o.answers ?? {}
  const switches = answers.switches ?? null
  const on = new Set(o.classes ?? MARK_CLASSES)
  const none = new Set(answers.inkless ?? [])
  const closed = completeMap(answers.complete)
  // (a probed call answers for its command only where it is a call of a complete macro with all its arguments, by TeX's arity)
  const asked = (answers.probed ?? []).filter((s) =>
    completeCall({ t: 'ph', src: s.src, kind: 'other', at: 0, to: 0 }, closed),
  )
  const seen = answers.seen ? new Set(answers.seen) : null
  const probed = new Map(asked.map((s) => [s.command, s.src]))
  const glued = new Map(asked.filter((s) => s.glued).map((s) => [s.command, s.glued as string]))
  const answered = (p: MarkPiece | null | undefined) => {
    if (!p || !completeCall(p, closed)) return false
    const cmd = commandOf(p) as string
    return !!switches?.[cmd] && (closed.get(cmd.slice(1)) === 0 || probed.get(cmd) === srcOf(p))
  }
  const looks = (p: MarkPiece | null | undefined) => LOOKS_AHEAD(p) && !answered(p)
  const gluedTo = (p: MarkPiece, next: MarkPiece | undefined) =>
    next?.t === 'ph' && answered(p) && glued.get(commandOf(p) as string) === next.src
  const opensAfter = (after: MarkPiece | null, spaced: boolean) =>
    !!after &&
    spaced &&
    !X.ENDS_IN_CS.test(srcOf(after)) &&
    answered(after) &&
    switches?.[commandOf(after) as string]?.[6] === '0'
  const parted = new Set(answers.apart ?? [])
  const answer = (p: MarkPiece, next: MarkPiece | undefined): string | undefined => {
    if (!switches) return undefined
    const codes = switches[commandOf(p) as string]
    if (!codes) return ASKED.has(classOf(p) as string) && !(seen && !seen.has(commandOf(p) as string)) ? '2' : undefined
    const first = next?.t === 'text' ? (next.s[0] ?? '') : ''
    const code =
      classOf(next) === 'footnote' && classOf(p) === 'footnote'
        ? codes[7] === '0'
          ? codes[6]
          : codes[7] === 'x'
            ? 'x'
            : '1'
        : gluedTo(p, next)
          ? codes[7]
          : codes[first && PUNCT.includes(first) ? PUNCT.indexOf(first) : 6]
    return code === 'x' ? '2' : code
  }
  const free = (after: MarkPiece | null, p: MarkPiece) =>
    !!after &&
    classOf(after) === 'footnote' &&
    !!switches?.[commandOf(after) as string] &&
    (classOf(p) === 'footnote'
      ? (switches[commandOf(after) as string] as string)[7] === '0'
      : (switches[commandOf(after) as string] as string)[6] === '0')
  const aheadSaid = (pieces: readonly MarkPiece[], q: number) => {
    const pair = switches ? pairOf(pieces, q) : null
    const code = pair ? switches?.[aheadKey(srcOf(pair[0]), pair[1], srcOf(pieces[q]))] : undefined
    return code === undefined || !pair ? null : { m: pair[0], at: pair[2], code }
  }
  const opened = new Set<MarkPiece>()
  const front = frontMarked(units)
  const own = (i: number): UnitMark | null => {
    const u = units[i] as SourceUnit
    if (o.unmarked?.has(i)) return null
    if (u.kind === 'cell')
      return {
        start: `\\leavevmode\\axtmark{t${i}s}`,
        end: `\\axtend{t${i}e}`,
        kinds: ['cell-start', 'cell-end'],
        names: [`t${i}s`, `t${i}e`],
      }
    if (u.kind === 'heading')
      return {
        start: `\\axthmark{h${i}s}`,
        end: `\\axthmark{h${i}e}`,
        kinds: ['heading-start', 'heading-end'],
        names: [`h${i}s`, `h${i}e`],
      }
    if (front.has(u)) return unitMark(i)
    if (o.figures && u.kind === 'figure' && !u.front && !(u.stored && !u.once) && !inMath(u.pieces)) return unitMark(i)
    if (!markedUnit(u)) return null
    return o.lines ? { ...unitMark(i), before: `\\axtlines{${i}}` } : unitMark(i)
  }
  const pieces = units.map((u, i) => {
    const ps: readonly MarkPiece[] = u.pieces
    if (o.unmarked?.has(i)) return [...ps]
    const passed = own(i) ? passedOver(ps) : null
    const lead = front.has(u) ? '\\protect' : ''
    let last: MarkPiece | null = null
    let gap = false
    let beforePrefix: MarkPiece | null = null
    let gapBefore = false
    const movedAt = new Map<number, Mark>()
    const verbatim: boolean[] = []
    /** the paper's macros the unit sets with no mark of their own, by index (none TeX said sets no ink): those passed over that
     *  nothing before them reads, and those glued to the word before them (marks.mjs layoutMarking) */
    const bare = new Set<number>()
    const out = ps.map((p, k): MarkPiece[] => {
      if (backrefPiece(p))
        return own(i) && on.has('macro') ? [mark(`\\axtbrname{p${i}.${k}}`, `p${i}.${k}`, 'backref', k)] : []
      const prev = ps[k - 1]
      const prefixed = k > 0 && prefixWord(prev?.t === 'ph' ? prev.src : null)
      const after = prefixed ? beforePrefix : last
      const spaced = prefixed ? gapBefore : gap
      if (p.t !== 'text' || /[^ \t\r\n]/.test(p.s)) {
        if (p.t === 'ph' && prefixWord(p.src)) {
          beforePrefix = last
          gapBefore = gap
        }
        last = p
        gap = false
      } else gap = true
      if (p.t === 'open') verbatim.push(verbatim.at(-1) === true || X.VERBATIM_ARG.test(p.src ?? ''))
      else if (p.t === 'close') verbatim.pop()
      if (verbatim.at(-1) === true) return [p]
      if (o.colours !== false && colourPiece(p)) return [p, mark(`\\axtcolour{c${i}.${k}}`, `c${i}.${k}`, 'colour', k)]
      const pairSaid = lead ? null : aheadSaid(ps, k)
      const ahead =
        !!pairSaid &&
        pairSaid.m === after &&
        !!after &&
        opened.has(after) &&
        (pairSaid.code === '0' || pairSaid.code === '1')
      // (`reads`: the piece before this one may read what follows it, so that nothing of ours may stand between them)
      const reads =
        LOOKS_AHEAD(after) && !READS_NOTHING(after) && !free(after, p) && !opensAfter(after, spaced) && !ahead
      const cls = passed && !passed.has(k) && !reads ? classOf(p) : null
      if (!cls || !on.has(cls) || (cls === 'macro' && none.has(srcOf(p)))) {
        if (!cls && passed?.has(k) && !reads && on.has('macro') && classOf(p) === 'macro' && !none.has(srcOf(p)))
          bare.add(k)
        return [p]
      }
      const before = ps[prefixed ? k - 2 : k - 1]
      const next = ps[k + 1]
      if (
        cls === 'macro' &&
        before?.t === 'text' &&
        X.WORD_END.test(before.s) &&
        !parted.has(srcOf(p)) &&
        !(X.BOXY.test(srcOf(p)) && !prefixed)
      ) {
        bare.add(k)
        return [p]
      }
      const raw = cls === 'macro' && !answered(p) ? undefined : answer(p, next)
      const nextFirst = next?.t === 'text' ? (next.s[0] ?? '') : ''
      const said =
        (raw === '2' || raw === '3') && cls === 'macro'
          ? '1'
          : raw === '3' &&
              !(
                next?.t === 'text' &&
                nextFirst &&
                PUNCT.includes(nextFirst) &&
                (next.src === undefined || next.src[0] === next.s[0])
              )
            ? '2'
            : raw
      if (said === '2') return [p]
      const name = `${cls === 'footnote' ? 'n' : 'p'}${i}.${k}`
      const open = mark(`${lead}\\${cls === 'math' ? 'axtpmm' : 'axtpma'}{${name}a}`, `${name}a`, 'open', k, true)
      if (said === '3') {
        const moved = mark(`${lead}\\axtpm{${name}b}`, `${name}b`, 'close', k)
        if (next?.t === 'text' && next.s[0]) moved.mark.moved = next.s[0]
        movedAt.set(k, moved)
        return [open, p]
      }
      if (cls === 'macro') opened.add(p)
      const closes =
        !answered(p) || next === undefined || (next.t === 'text' && /^[ \t\r\n.,;:!?]/.test(next.s)) || gluedTo(p, next)
      if (
        said === '1' ||
        !closes ||
        (looks(p) && !(cls === 'footnote' && said === '0')) ||
        X.ENDS_IN_CS.test(srcOf(p)) ||
        /\s$/.test(srcOf(p)) ||
        X.ENDS_ENV.test(srcOf(p))
      )
        return [open, p]
      return [open, p, mark(`${lead}\\axtpm{${name}b}`, `${name}b`, 'close', k)]
    })
    // (a closing mark after the punctuation its piece's command moves: the text after it cut after that mark)
    for (const [k, close] of movedAt) {
      const t = ps[k + 1] as SourcePiece & { t: 'text' }
      const cut = (a: number, b?: number): MarkPiece => ({
        ...t,
        s: t.s.slice(a, b),
        ...(t.src !== undefined ? { src: t.src.slice(a, b) } : {}),
        at: t.at + a,
        to: b === undefined ? t.to : t.at + b,
      })
      out[k + 1] = [cut(0, 1), close, ...(t.s.length > 1 ? [cut(1)] : [])]
    }
    for (let q = 1; q < out.length && !lead; q++) {
      const said = aheadSaid(ps, q)
      const k = said?.at ?? -1
      const m = said?.m
      const oq = out[q] as MarkPiece[]
      const ok = out[k]
      if (
        said?.code !== '0' ||
        !m ||
        !ok ||
        oq.length < 2 ||
        oq[1] !== ps[q] ||
        ok.length !== 2 ||
        ok[1] !== m ||
        !opened.has(m) ||
        !looks(m) ||
        /\s$/.test(srcOf(m)) ||
        X.ENDS_ENV.test(srcOf(m))
      )
        continue
      out[k] = [...ok, mark(`\\axtpm{p${i}.${k}b}`, `p${i}.${k}b`, 'close', k)]
    }
    for (let k = 1; k < out.length; k++) {
      const prev = ps[k - 1]
      const ok = out[k] as MarkPiece[]
      const ob = out[k - 1] as MarkPiece[]
      if (!prefixWord(prev?.t === 'ph' ? prev.src : null) || ob.length !== 1 || ok.length < 2 || ok[0] === ps[k])
        continue
      out[k - 1] = [ok[0] as MarkPiece, ...ob]
      out[k] = ok.slice(1)
    }
    // (a paper's macro with no mark of its own at the unit's head, before its start mark: \axthpk, its opening point, the start
    // mark its closing one; one after the unit's last text, after its end mark: \axttg, a point after the group it stands in.
    // Neither past a prefix, in a front unit, in a unit with no text, nor in a cell or a unit that holds an alignment's tab (a
    // mark before \multicolumn's \omit; an entry's group end) (marks.mjs layoutMarking)
    if (own(i) && bare.size && u.kind !== 'cell' && !ps.some((p) => p.t === 'ph' && p.src === '&')) {
      const head = headEnd(ps, 0)
      const lastText = ps.findLastIndex((p) => p.t === 'text' && /[^ \t\r\n]/.test(p.s))
      for (const k of bare) {
        const ok = out[k] as MarkPiece[]
        const prev = ps[k - 1]
        if (ok.length !== 1 || (k > 0 && prefixWord(prev?.t === 'ph' ? prev.src : null))) continue
        // (both written before their piece, where its source begins)
        if (k < head) out[k] = [mark(`${lead}\\axthpk{p${i}.${k}a}`, `p${i}.${k}a`, 'head', k, true), ...ok]
        // (right after the last text alone: the end mark stands between the two, nothing of the paper's)
        else if (!lead && k === lastText + 1)
          out[k] = [mark(`\\axttg{p${i}.${k}g}`, `p${i}.${k}g`, 'after', k, true), ...ok]
      }
    }
    return out.flat()
  })
  return { pieces, own }
}

// ---------------------------------------------------------------- where each mark is written (latex-front.mjs patch)
interface Insert {
  at: number
  seq: number
  tex: string
  name: string
  kind: MarkKind
  piece: number
  moved?: string
}
/** a unit's marks placed: its start, end and line probe as patch puts them, its placeholders' marks where they stand */
function place(
  pieces: readonly MarkPiece[],
  m: UnitMark | null,
  text: string,
  push: (x: Omit<Insert, 'seq'>) => void,
): void {
  const ps = pieces.filter((x) => !(x.t === 'ph' && !isMark(x) && x.src === X.BACKREF_LIST))
  const sourceOf = (p: MarkPiece) => (p.t === 'text' ? (p.src ?? p.s) : '')
  const piece = (p: MarkPiece) => (isMark(p) ? p.mark.piece : -1)
  // (the pieces' own places: a mark before a piece goes where the next piece of the source begins, one after where the last ends)
  const srcAt: number[] = []
  const srcTo: number[] = []
  let next = -1
  for (let k = ps.length - 1; k >= 0; k--) {
    const p = ps[k] as MarkPiece
    if (!isMark(p)) next = p.at
    srcAt[k] = next
  }
  let prev = -1
  for (let k = 0; k < ps.length; k++) {
    const p = ps[k] as MarkPiece
    if (!isMark(p)) prev = p.to
    srcTo[k] = prev
  }
  const beforeOf = (k: number) =>
    k < ps.length && (srcAt[k] as number) >= 0 ? (srcAt[k] as number) : (srcTo[ps.length - 1] ?? -1)
  const afterOf = (k: number) => ((srcTo[k] as number) >= 0 ? (srcTo[k] as number) : beforeOf(k))
  /** an offset in a text piece's source; where the file does not hold the source there, its edge */
  const inText = (p: SourcePiece & { t: 'text' }, c: number) =>
    text.slice(p.at, p.to) === sourceOf(p) ? p.at + c : c === 0 ? p.at : p.to
  let startAt = -1
  let startCut = 0
  let opened = -1
  if (m)
    for (let k = 0; k < ps.length; k++) {
      const p = ps[k] as MarkPiece
      if (p.t === 'text') {
        const w = /^[ \t\r\n]*(?=[^ \t\r\n])/.exec(sourceOf(p))
        if (!w) continue
        const pv = ps[k - 1]
        if (w[0].length === 0 && pv?.t === 'ph' && /\\[A-Za-z@]+\*?$/.test(pv.src)) {
          startAt = k - 1
          startCut = -1
        } else {
          startAt = k
          startCut = w[0].length
        }
        break
      }
      if (p.t === 'open') {
        if (opened < 0) opened = k
        continue
      }
      if (p.t === 'close' && opened >= 0 && LETTER_GROUP(ps.slice(opened + 1, k))) {
        startAt = opened
        startCut = -1
        break
      }
      if (p.t === 'close') {
        let q = k + 1
        while (q < ps.length && (ps[q]?.t === 'close' || (ps[q]?.t === 'text' && !/[^ \t\r\n]/.test(textOf(ps[q])))))
          q++
        if (ps[q]?.t === 'text') {
          k = q - 1
          continue
        }
        break
      }
      if (p.t === 'ph' && X.INLINE.test(p.src)) {
        startAt = k
        startCut = -1
        break
      }
      if (p.t !== 'ph') break
    }
  if (startCut === -1) while (startAt > 0 && (ps[startAt - 1] as Mark).opens === true) startAt--
  let endAt = -1
  if (m)
    for (let k = ps.length - 1; k >= 0; k--)
      if (ps[k]?.t === 'text' && /[^ \t\r\n]/.test(textOf(ps[k]))) {
        endAt = k
        break
      }
  // (the line probe: past the white space that opens the unit, where the start mark goes, outside every group: `pastBegin`)
  let beforeAt = 0
  let beforeCut = -1
  if (m?.before) {
    let k = 0
    let cut = -1
    for (; k < ps.length && ps[k]?.t === 'text'; k++) {
      const s = sourceOf(ps[k] as MarkPiece)
      const ws = (/^[ \t\r\n]*/.exec(s) as RegExpExecArray)[0]
      if (ws.length < s.length) {
        cut = ws.length
        break
      }
    }
    beforeAt = k
    beforeCut = cut
  }
  const unitOwn = (tex: string, name: string, kind: MarkKind) => ({ tex, name, kind, piece: -1 })
  for (let k = 0; k < ps.length; k++) {
    const p = ps[k] as MarkPiece
    if (m?.before && k === beforeAt && beforeCut === -1)
      push({ at: beforeOf(k), ...unitOwn(m.before, `${m.names[0]}`.replace(/s$/, 'l'), 'lines') })
    if (p.t === 'text') {
      const beforeHere = !!m?.before && k === beforeAt && beforeCut >= 0
      if (!m || (k !== startAt && k !== endAt && !beforeHere)) continue
      const cuts: [number, ReturnType<typeof unitOwn>][] =
        beforeHere && m.before ? [[beforeCut, unitOwn(m.before, m.names[0].replace(/s$/, 'l'), 'lines')]] : []
      if (k === startAt) cuts.push([startCut, unitOwn(m.start, m.names[0], m.kinds[0])])
      if (k === endAt)
        cuts.push([
          Math.max(startAt === k ? startCut : 0, sourceOf(p).replace(/[ \t\r\n]*$/, '').length),
          unitOwn(m.end, m.names[1], m.kinds[1]),
        ])
      for (const [c, x] of cuts) push({ at: inText(p as SourcePiece & { t: 'text' }, c), ...x })
      continue
    }
    if (m && k === startAt && startCut === -1) push({ at: beforeOf(k), ...unitOwn(m.start, m.names[0], m.kinds[0]) })
    if (isMark(p))
      push({
        at: p.opens ? beforeOf(k + 1) : afterOf(k),
        tex: p.src,
        name: p.mark.name,
        kind: p.mark.kind,
        piece: piece(p),
        ...(p.mark.moved ? { moved: p.mark.moved } : {}),
      })
  }
  if (m?.before && beforeAt === ps.length && beforeCut === -1)
    push({ at: afterOf(ps.length - 1), ...unitOwn(m.before, m.names[0].replace(/s$/, 'l'), 'lines') })
}

// ---------------------------------------------------------------- a style's literal babel name (marks.mjs literalNames)
const LITERAL_IN: Readonly<Record<string, readonly string[]>> = Object.freeze({
  abstract: ['abstract'],
  endabstract: ['abstract'],
  thebibliography: ['ref', 'bib'],
  tableofcontents: ['contents'],
  listoffigures: ['listfigure'],
  listoftables: ['listtable'],
  theindex: ['index'],
  proof: ['proof'],
})
const CONSTRUCT = Object.keys(LITERAL_IN).join('|')
const DEFINITION = new RegExp(
  String.raw`\\(?:(?:re)?newenvironment\*?\s*\{(${CONSTRUCT})\}|(?:New|Renew|Declare|Provide)DocumentEnvironment\s*\{(${CONSTRUCT})\}|(?:(?:renew|new|provide)command|DeclareRobustCommand)\*?\s*\{?\s*\\(${CONSTRUCT})(?![A-Za-z@])\s*\}?|(?:New|Renew|Declare|Provide)DocumentCommand\s*\{?\s*\\(${CONSTRUCT})(?![A-Za-z@])\s*\}?|[gex]?def\s*\\(${CONSTRUCT})(?![A-Za-z@]))`,
  'g',
)
const NOT_TEXT =
  /\\(?:label|ref|pageref|eqref|nameref|autoref|cite[A-Za-z]*|nocite|typeout|message|wlog|write|hypertarget|hyperdef|hyperlink|pdfbookmark|@namedef|@nameuse|@ifundefined|@ifpackageloaded|@ifclassloaded|ifthenelse|setcounter|addtocounter|newcounter|usecounter|refstepcounter|stepcounter|begin|end|(?:Package|Class|Generic)(?:Warning|WarningNoLine|Info|Error))(?![A-Za-z@])|\\csname(?![A-Za-z@])/g
const skipBlank = (t: string, i: number): number => {
  for (;;) {
    while (i < t.length && /\s/.test(t[i] as string)) i++
    if (t[i] !== '%') return i
    while (i < t.length && t[i] !== '\n') i++
  }
}
function groupEnd(t: string, i: number): number {
  if (t[i] !== '{') return -1
  let d = 0
  for (let j = i; j < t.length; j++) {
    const c = t[j]
    if (c === '\\') {
      j++
      continue
    }
    if (c === '%') {
      while (j < t.length && t[j] !== '\n') j++
      continue
    }
    if (c === '{') d++
    else if (c === '}' && --d === 0) return j + 1
  }
  return -1
}
function optionalEnd(t: string, i: number): number {
  if (t[i] !== '[') return i
  let d = 0
  for (let j = i; j < t.length; j++) {
    const c = t[j]
    if (c === '\\') {
      j++
      continue
    }
    if (c === '{') d++
    else if (c === '}') d--
    else if (c === ']' && d === 0) return j + 1
  }
  return i
}
/** each literal of a babel name's English word in the definition of the construct its macro names, wrapped in the name's
 *  marks (marks.mjs literalNames, as it is: a style's text, read as its bytes) */
export function literalNames(text: string): string {
  const edits: [number, number, string][] = []
  for (const m of text.matchAll(DEFINITION)) {
    const name = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5]) as string
    const keys = LITERAL_IN[name] ?? []
    let i = m.index + m[0].length
    const bodies: [number, number][] = []
    const xparse = /Document(?:Environment|Command)/.test(m[0])
    const env = m[1] !== undefined || m[2] !== undefined
    if (m[5] !== undefined) {
      for (const end = Math.min(text.length, i + 200); i < end && text[i] !== '{'; ) i++
    } else {
      i = skipBlank(text, i)
      if (xparse) {
        const e = groupEnd(text, i)
        if (e < 0) continue
        i = skipBlank(text, e)
      } else for (let n = 0; n < 2; n++) i = skipBlank(text, optionalEnd(text, i))
    }
    for (let n = 0; n < (env ? 2 : 1); n++) {
      i = skipBlank(text, i)
      const e = groupEnd(text, i)
      if (e < 0) break
      bodies.push([i + 1, e - 1])
      i = e
    }
    for (const [a, b] of bodies) {
      const body = text.slice(a, b)
      const off: [number, number][] = []
      for (const x of body.matchAll(NOT_TEXT)) {
        let j = x.index + x[0].length
        if (x[0] === '\\csname') {
          const e = body.indexOf('\\endcsname', j)
          off.push([x.index, e < 0 ? body.length : e])
          continue
        }
        for (let n = 0; n < 2; n++) {
          j = skipBlank(body, optionalEnd(body, skipBlank(body, j)))
          const e = groupEnd(body, j)
          if (e < 0) break
          off.push([x.index, e])
          j = e
        }
      }
      for (const key of keys) {
        const words = (X.NAME_ENGLISH[key] as string).split(' ').join(String.raw`\s+`)
        for (const l of body.matchAll(new RegExp(String.raw`(?<![\\A-Za-z@])${words}(?![A-Za-z@])`, 'g'))) {
          if (off.some(([s, e]) => l.index >= s && l.index < e)) continue
          edits.push([a + l.index, a + l.index + l[0].length, key])
        }
      }
    }
  }
  if (!edits.length) return text
  edits.sort((x, y) => y[0] - x[0])
  let out = text
  let last = Number.POSITIVE_INFINITY
  for (const [s, e, key] of edits) {
    if (e > last) continue
    out = `${out.slice(0, s)}\\axtnma{${key}}${out.slice(s, e)}\\axtnmb{${key}}${out.slice(e)}`
    last = s
  }
  return out
}

// ---------------------------------------------------------------- a file's text offsets as its bytes
const UTF8_FATAL = new TextDecoder('utf-8', { fatal: true })
const CP1252 = new TextDecoder('windows-1252')
/** the byte offset of each offset of the text the reader read (fileText: UTF-8, else the declared single-byte encoding, line
 *  ends LF), or null where the text cannot be mapped (UTF-8 not valid, read with replacement characters) */
export function byteOffsets(bytes: Uint8Array, encoding: SourceDoc['encoding']): Uint32Array | null {
  let decoded: string
  let single = false
  try {
    decoded = UTF8_FATAL.decode(bytes)
  } catch {
    if (encoding === 'utf8') return null
    single = true
    if (encoding === 'cp1252') decoded = CP1252.decode(bytes)
    else {
      decoded = ''
      for (let i = 0; i < bytes.length; i += 8192) decoded += String.fromCharCode(...bytes.subarray(i, i + 8192))
    }
  }
  const out: number[] = []
  let b = 0
  for (let i = 0; i < decoded.length; i++) {
    const c = decoded.charCodeAt(i)
    const n = single
      ? 1
      : c < 0x80
        ? 1
        : c < 0x800
          ? 2
          : c >= 0xd800 && c < 0xdc00
            ? 4
            : c >= 0xdc00 && c < 0xe000
              ? 0
              : 3
    // (CR LF is one LF; a CR alone a LF: texText. The LF of a CR LF is the CR's byte: a mark written before the line's end
    // goes before the CR, never between the two, where TeX would read the CR as a character of catcode 5 that ends the line
    // and drops the mark after it)
    if (c === 13 && decoded.charCodeAt(i + 1) === 10) {
      out.push(b)
      b += n + 1
      i++
      continue
    }
    out.push(b)
    b += n
  }
  out.push(b)
  return Uint32Array.from(out)
}

// ---------------------------------------------------------------- the marked tree
const ENC = new TextEncoder()
const latin1 = (b: Uint8Array) => {
  let s = ''
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192))
  return s
}
const latin1Bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff)

/**
 * The marked tree of a paper (`tree` its files, `doc` readSource's of them) and its plan. `o.answers` the probe's answers
 * and the complete macros (today's, as the marked original takes them); `o.lines` each unit's line probe (on, as the marked
 * original has it); `o.names` babel's names wrapped (on)
 */
export function markSource(tree: Tree, doc: SourceDoc, o: MarkOptions = {}): { tree: Tree; plan: Plan } {
  const opts = { lines: true, names: true, ...o }
  const units = doc.units
  const marking = layoutMarking(units, opts)
  const inserts = new Map<string, Insert[]>()
  const unplaced: Plan['units'] = units.map((u) => ({ id: u.id, kind: u.kind, marked: false }))
  const texts = new Map<string, { text: string; bytes: Uint8Array; map: Uint32Array | null }>()
  const fileOf = (path: string) => {
    let f = texts.get(path)
    if (!f) {
      const bytes = tree.files.get(path) as Uint8Array
      const map = byteOffsets(bytes, doc.encoding)
      const text = map ? textOfMap(bytes, doc.encoding) : ''
      f = { text, bytes, map }
      texts.set(path, f)
    }
    return f
  }
  let seq = 0
  const write = (i: number) => {
    const u = units[i] as SourceUnit
    const f = fileOf(u.file)
    if (!f.map) {
      ;(unplaced[i] as Plan['units'][number]).why = 'file: not UTF-8 and no encoding declared'
      return
    }
    const list = inserts.get(u.file) ?? (inserts.set(u.file, []).get(u.file) as Insert[])
    const m = marking.own(i)
    if (m) (unplaced[i] as Plan['units'][number]).marked = true
    else if (opts.unmarked?.has(i)) (unplaced[i] as Plan['units'][number]).why = 'the recovery: unmarked'
    place(marking.pieces[i] as MarkPiece[], m, f.text, (x) => {
      list.push({ ...x, seq: seq++, name: x.name, piece: x.piece })
      plan.push({ unit: i, x })
    })
    if (m && opts.sentences) {
      // (TeX's sentence ends inside the unit's text, where the file holds the text piece's source as it is)
      let n = 0
      const verbatim: boolean[] = []
      u.pieces.forEach((p, k) => {
        if (p.t === 'open') verbatim.push(verbatim.at(-1) === true || X.VERBATIM_ARG.test(p.src ?? ''))
        else if (p.t === 'close') verbatim.pop()
        if (p.t !== 'text' || verbatim.at(-1) === true) return
        const src = p.src ?? p.s
        if (f.text.slice(p.at, p.to) !== src) return
        for (const e of src.matchAll(SENTENCE_END)) {
          const name = `s${i}.${n++}`
          const x = {
            at: p.at + (e.index as number) + e[0].length,
            tex: `\\axtsf{${name}}`,
            name,
            kind: 'sentence' as const,
            piece: k,
          }
          list.push({ ...x, seq: seq++ })
          plan.push({ unit: i, x })
        }
      })
    }
    for (const p of u.pieces) if (p.t === 'nested' && p.unit >= 0) write(p.unit)
  }
  const plan: { unit: number; x: Omit<Insert, 'seq'> }[] = []
  // (each top-level unit by its file's order; one that begins inside the one before it is not written, as patch skips it)
  const byFile = new Map<string, number[]>()
  units.forEach((u, i) => {
    if (u.nested) return
    ;(byFile.get(u.file) ?? (byFile.set(u.file, []).get(u.file) as number[])).push(i)
  })
  for (const [, list] of byFile) {
    list.sort((a, b) => (units[a] as SourceUnit).start - (units[b] as SourceUnit).start)
    let at = 0
    for (const i of list) {
      const u = units[i] as SourceUnit
      if (u.start < at) {
        ;(unplaced[i] as Plan['units'][number]).why = 'inside the unit before it'
        continue
      }
      write(i)
      at = u.end
    }
  }
  // ---- the files: marks inserted in the paper's bytes
  const out = new Map(tree.files)
  const written: string[] = []
  const marks: PlanMark[] = []
  const pieceIds = units.map((u) => pieceIdsOf(u.pieces))
  for (const { unit, x } of plan) {
    const u = units[unit] as SourceUnit
    const f = fileOf(u.file)
    marks.push({
      name: x.name,
      kind: x.kind,
      unit,
      piece: x.piece,
      pieceId: x.piece >= 0 ? ((pieceIds[unit] as (string | null)[])[x.piece] ?? null) : null,
      ...(x.moved ? { moved: x.moved } : {}),
      file: u.file,
      at: x.at,
      byte: (f.map as Uint32Array)[x.at] ?? f.bytes.length,
      tex: x.tex,
    })
  }
  for (const [path, list] of inserts) {
    if (!list.length) continue
    const f = fileOf(path)
    const map = f.map as Uint32Array
    const sorted = [...list].sort((a, b) => a.at - b.at || a.seq - b.seq)
    const parts: Uint8Array[] = []
    let from = 0
    for (const x of sorted) {
      const b = map[x.at] ?? f.bytes.length
      parts.push(f.bytes.subarray(from, b), ENC.encode(x.tex))
      from = b
    }
    parts.push(f.bytes.subarray(from))
    out.set(path, concat(parts))
    written.push(path)
  }
  // ---- babel's names a style writes literally, in the style, class and source files (the main file's preamble)
  if (opts.names)
    for (const path of [...out.keys()].sort()) {
      if (!/\.(?:sty|cls|tex|ltx)$/i.test(path)) continue
      const text = latin1(out.get(path) as Uint8Array)
      const at = path === doc.main ? beginDocument(text) : text.length
      const wrapped = literalNames(text.slice(0, at < 0 ? text.length : at))
      if (wrapped !== text.slice(0, at < 0 ? text.length : at)) {
        out.set(path, latin1Bytes(wrapped + (at < 0 ? '' : text.slice(at))))
        if (!written.includes(path)) written.push(path)
      }
    }
  // ---- the head
  const dvi = opts.compiler === 'latex'
  const regions = doc.codeEnvs.length
    ? X.REGIONS_HEAD +
      doc.codeBodies.map((n) => `\\AddToHook{env/${n}/begin}{\\axt@codetrue}`).join('') +
      X.REGIONS_TAIL
    : ''
  const head =
    FRAMES_TEX +
    X.MARK_DEF +
    (dvi ? X.DVI_MARK_DEF : '') +
    X.LAYOUT_TEX +
    (dvi ? X.DVI_LAYOUT_TEX : '') +
    (opts.names ? '' : X.NAMES_OFF) +
    regions +
    X.END_TEX +
    (opts.lines ? X.LINES_TEX : '') +
    STATE_TEX +
    (opts.sentences ? SENTENCE_TEX : '') +
    (opts.paragraphEnds ? PARA_ENDS_TEX : '')
  const mainBytes = out.get(doc.main) as Uint8Array
  out.set(doc.main, concat([latin1Bytes(head), mainBytes]))
  if (!written.includes(doc.main)) written.push(doc.main)
  return {
    tree: { main: tree.main, files: out },
    plan: {
      format: PLAN_FORMAT,
      main: doc.main,
      head: head.length,
      marks,
      units: unplaced,
      files: written.sort(),
      parts: { dvi, names: !!opts.names, lines: !!opts.lines, regions: doc.codeBodies },
    },
  }
}

/** the text fileText reads, from the bytes its map was made of */
function textOfMap(bytes: Uint8Array, encoding: SourceDoc['encoding']): string {
  let s: string
  try {
    s = UTF8_FATAL.decode(bytes)
  } catch {
    s = encoding === 'cp1252' ? CP1252.decode(bytes) : latin1(bytes)
  }
  return s.replace(/\r\n?/g, '\n')
}
/** each piece's id in its unit's content (build.ts typed's numbering): an element's, a span's (its close's the same), a
 *  nested unit's; null for a text */
export function pieceIdsOf(pieces: readonly SourcePiece[]): (string | null)[] {
  let n = 0
  const stack: string[] = []
  return pieces.map((p) => {
    if (p.t === 'ph') return `e${n++}`
    if (p.t === 'nested') return `u${n++}`
    if (p.t === 'open') {
      const id = `s${n++}`
      stack.push(id)
      return id
    }
    if (p.t === 'close') return stack.pop() ?? `s${n++}`
    return null
  })
}
/** where the main file's \begin{document} stands, outside a comment (-1 none) */
function beginDocument(text: string): number {
  for (const m of text.matchAll(/\\begin\s*\{document\}/g)) {
    const line = text.lastIndexOf('\n', m.index) + 1
    if (!/(?<!\\)%/.test(text.slice(line, m.index))) return m.index
  }
  return -1
}
function concat(parts: readonly Uint8Array[]): Uint8Array {
  let n = 0
  for (const p of parts) n += p.length
  const out = new Uint8Array(n)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
