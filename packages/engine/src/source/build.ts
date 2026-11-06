// The units as the walk makes them: a unit's pieces as they are cut (text, an element of its kind, a span's open and close
// with its style, a nested unit), then each unit closed: its addresses and (in a bibliography entry) its numbers made
// elements, an accent's letter joined with its word, a unit of fewer than two letters dropped, and its pieces typed into the
// translation's grammar (spans paired, elements and spans numbered by their place) with its id.
import { unitId } from './id.ts'
import { DISPLAY_SOURCE, MATH_SPACE_SOURCE } from './tables.ts'
import type { Piece } from './types.ts'

/** a piece as the walk cuts it, with where it stands in its unit's file: `at` its first character's offset, `to` one past its
 *  last (a text's source, an element's or a span's open or close source, a nested unit's pre to its post; none for an
 *  element the reader adds, backref's list: at the entry's end) */
export type Raw = (
  | { t: 'text'; s: string; src?: string }
  | { t: 'ph'; src: string; kind: string; display?: boolean }
  | { t: 'open'; src: string; style: string; must?: true }
  | { t: 'close'; src: string }
  | { t: 'nested'; pre: string; unit: BUnit; post: string }
) & { at: number; to: number }

/** a unit being built, and once closed */
export interface BUnit {
  file: string
  kind: string
  /** source offsets in its file */
  start: number
  end: number
  pieces: Raw[]
  title?: true
  depth?: number
  /** a front-matter unit a class may copy (no mark of its own) */
  front?: true
  /** its text a macro's to use (stored) */
  held?: true
  nested?: true
  /** numbered after the rest (an author block's later parts) */
  later?: true
  /** made from a macro's body where it is defined (storedBodies), called once (`once`) */
  stored?: true
  once?: true
  /** an author block's unit: its command's whole argument, what a class compares (the marks' front units) */
  block?: { at: number; text: string }
  bracketed?: true
  inFloat?: true
  /** set once closed */
  id?: string
  content?: Piece[]
}

const EMAIL =
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b(?:https?|ftp):\/\/[^\s{}\\]*[^\s{}\\.,;:!?)\]]|\bwww\.[\w-]+(?:\.[\w-]+)+(?:\/[^\s{}\\]*[^\s{}\\.,;:!?)\]])?|\b\d{4}-\d{4}-\d{4}-\d{3}[\dX]\b/g
const HAS_EMAIL = new RegExp(EMAIL.source)
const AT_DOMAIN = /^@[\w-]+(?:\.[\w-]+)+/
export const hasAddress = (s: string): boolean => HAS_EMAIL.test(s)

const textOf = (p: Raw): string => (p.t === 'text' ? p.s : '')
const srcOf = (p: Raw): string => (p.t === 'text' ? (p.src ?? p.s) : p.t === 'nested' ? '' : p.src)

/** an e-mail whose local part TeX escapes (`goh\_siong\_thye@a-star.edu.sg`): the words its `\_` join, the `\_` and the
 *  address one element */
function escapedLocals(pieces: Raw[]): Raw[] {
  const out: Raw[] = []
  for (let k = 0; k < pieces.length; k++) {
    const p = pieces[k] as Raw
    const last = out.at(-1)
    if (p.t === 'ph' && p.src === '\\_' && last?.t === 'text' && last.src === undefined && /[\w.+-]$/.test(last.s)) {
      let j = k
      while (
        pieces[j]?.t === 'ph' &&
        (pieces[j] as { src: string }).src === '\\_' &&
        pieces[j + 1]?.t === 'text' &&
        (pieces[j + 1] as { src?: string }).src === undefined &&
        /^[\w.+-]*$/.test((pieces[j + 1] as { s: string }).s)
      )
        j += 2
      const tail = pieces[j]?.t === 'ph' && (pieces[j] as { src: string }).src === '\\_' ? pieces[j + 1] : undefined
      const rest =
        tail?.t === 'text' && tail.src === undefined ? /^[\w.+-]*@[\w-]+(?:\.[\w-]+)+/.exec(tail.s)?.[0] : undefined
      if (rest && tail?.t === 'text') {
        out.pop()
        const head = (/[\w.+-]+$/.exec(last.s) as RegExpExecArray)[0]
        const cut = last.at + last.s.length - head.length
        if (last.s.length > head.length) out.push({ t: 'text', s: last.s.slice(0, -head.length), at: last.at, to: cut })
        out.push({
          t: 'ph',
          kind: 'url',
          src:
            head +
            pieces
              .slice(k, j + 1)
              .map(srcOf)
              .join('') +
            rest,
          at: cut,
          to: tail.at + rest.length,
        })
        if (tail.s.length > rest.length)
          out.push({ t: 'text', s: tail.s.slice(rest.length), at: tail.at + rest.length, to: tail.to })
        k = j + 1
        continue
      }
    }
    out.push(p)
  }
  return out
}
/** an address is no prose: an e-mail, an ORCID, a web address written out, a list of names in escaped braces with its
 *  domain — each an element, kept as the paper has it */
function keepAddresses(pieces: Raw[]): Raw[] {
  const ps = escapedLocals(pieces)
  const lists: Raw[] = []
  for (let k = 0; k < ps.length; k++) {
    const p = ps[k] as Raw
    const names = ps[k + 1]
    const shut = ps[k + 2]
    const after = ps[k + 3]
    const domain = after?.t === 'text' ? AT_DOMAIN.exec(after.s)?.[0] : undefined
    if (
      p.t === 'ph' &&
      p.src === '\\{' &&
      names?.t === 'text' &&
      shut?.t === 'ph' &&
      shut.src === '\\}' &&
      domain &&
      after?.t === 'text'
    ) {
      lists.push({
        t: 'ph',
        kind: 'url',
        src: p.src + names.s + shut.src + domain,
        at: p.at,
        to: after.at + domain.length,
      })
      if (after.s.length > domain.length)
        lists.push({ t: 'text', s: after.s.slice(domain.length), at: after.at + domain.length, to: after.to })
      k += 3
    } else lists.push(p)
  }
  return lists.flatMap((p): Raw[] => {
    if (p.t !== 'text' || !HAS_EMAIL.test(p.s)) return [p]
    const out: Raw[] = []
    let at = 0
    for (const m of p.s.matchAll(EMAIL)) {
      if (m.index > at) out.push(cut(p, at, m.index))
      out.push(
        p.src === undefined
          ? { t: 'ph', kind: 'url', src: m[0], at: p.at + m.index, to: p.at + m.index + m[0].length }
          : { t: 'ph', kind: 'url', src: m[0], at: p.at, to: p.to },
      )
      at = m.index + m[0].length
    }
    if (at < p.s.length) out.push(cut(p, at, p.s.length))
    return out
  })
}
/** a text piece's part [x, y) (one whose source differs from its text keeps it whole: an address is never cut out of one) */
const cut = (p: Raw & { t: 'text' }, x: number, y: number): Raw =>
  p.src === undefined
    ? { t: 'text', s: p.s.slice(x, y), at: p.at + x, to: p.at + y }
    : { t: 'text', s: p.s.slice(x, y), src: p.src, at: p.at, to: p.to }

// (today's rule read the text's UTF-8 bytes as Latin-1, where a character past ASCII begins with a letter: it is kept so, a
// character past ASCII no part of a number, so that the units' ids stay today's)
const NUMBER_TOKEN = /[^\s\p{L}\u0080-\uffff]*\d[^\s\p{L}\u0080-\uffff]*/gu
const DOI_TOKEN = /10\.\d{4,9}\/\S+/gu
function numberTokens(s: string): { index: number; text: string; doi: boolean }[] {
  const dois = [...s.matchAll(DOI_TOKEN)].map((m) => ({ index: m.index, text: m[0], doi: true }))
  const inDoi = (a: number, b: number) => dois.some((d) => a < d.index + d.text.length && b > d.index)
  const numbers = [...s.matchAll(NUMBER_TOKEN)]
    .filter((m) => !inDoi(m.index, m.index + m[0].length))
    .map((m) => ({ index: m.index, text: m[0], doi: false }))
  return [...dois, ...numbers].sort((a, b) => a.index - b.index)
}
/** a piece beside which a number stands apart: the unit's edge, a span's edge, a tie, a space or a penalty of TeX's */
const APART = (p: Raw | undefined): boolean =>
  !p ||
  p.t === 'open' ||
  p.t === 'close' ||
  (p.t === 'ph' &&
    /^(?:~|\\[ ,;:!]|\\(?:newblock|quad|qquad|enspace|thinspace|space|penalty|allowbreak|nobreak|hskip|kern)(?![A-Za-z@]))/.test(
      p.src,
    ))
/** a bibliography entry's numbers, each an element (a year, pages, a volume, a DOI): a token of a text piece with a digit
 *  and no letter, apart on both sides; in a piece whose source differs from its text only where the two agree */
function keepNumbers(pieces: Raw[]): Raw[] {
  return pieces.flatMap((p, k): Raw[] => {
    if (p.t !== 'text' || !/\d/.test(p.s)) return [p]
    const src = p.src ?? p.s
    const n = p.s.length
    const d = src.length - n
    let head = 0
    while (head < n && head < src.length && p.s[head] === src[head]) head++
    let tail = 0
    while (tail < n - head && tail < src.length - head && p.s[n - 1 - tail] === src[src.length - 1 - tail]) tail++
    const at = (i: number) => (i <= head ? i : i >= n - tail ? i + d : -1)
    const part = (x: number, y: number): Raw => {
      const t = p.s.slice(x, y)
      const from = src.slice(at(x), at(y))
      const where = { at: p.at + at(x), to: p.at + at(y) }
      return from === t ? { t: 'text', s: t, ...where } : { t: 'text', s: t, src: from, ...where }
    }
    const out: Raw[] = []
    let last = 0
    for (const m of numberTokens(p.s)) {
      const end = m.index + m.text.length
      const left =
        m.index > 0
          ? (m.doi ? /[^\p{L}\d\u0080-\uffff]/u : /\s/).test(p.s[m.index - 1] as string)
          : APART(pieces[k - 1])
      const right = end < n ? /\s/.test(p.s[end] as string) : APART(pieces[k + 1])
      if (!left || !right || at(m.index) < 0 || at(end) < 0 || src.slice(at(m.index), at(end)) !== m.text) continue
      if (m.index > last) out.push(part(last, m.index))
      out.push({ t: 'ph', kind: 'number', src: m.text, at: p.at + at(m.index), to: p.at + at(end) })
      last = end
    }
    if (!out.length) return [p]
    if (last < n) out.push(part(last, n))
    return out
  })
}
/** each letter an accent made joined with the text on either side, so that its word is one text piece */
function joinLetters(pieces: Raw[]): Raw[] {
  const out: Raw[] = []
  for (const p of pieces) {
    const last = out.at(-1)
    if (p.t === 'text' && last?.t === 'text' && (p.src !== undefined || last.src !== undefined))
      out[out.length - 1] = {
        t: 'text',
        s: last.s + p.s,
        src: (last.src ?? last.s) + (p.src ?? p.s),
        at: last.at,
        to: p.to,
      }
    else out.push(p)
  }
  return out
}

// ---------------------------------------------------------------- a display's own stop (translate/mt.mjs displayStop)
const DISPLAY = new RegExp(DISPLAY_SOURCE)
/** the math environments a display holds, which end inside it before its own end: a display's, an alignment's, a case
 *  split's, an array's or a matrix's. No other (a picture, `\end{tikzpicture}`, whose `;` is its own syntax) */
const MATH_INNER = String.raw`(?:equation|align|alignat|gather|multline|flalign|eqnarray|displaymath|dmath|IEEEeqnarray|subequations|split|aligned|alignedat|gathered|multlined|cases|dcases|rcases|array|subarray|[pbBvV]?matrix|smallmatrix)\*?`
/** one thing at a display's end that sets none of its sentence's punctuation, read from the end: white space, a comment,
 *  the display's close and an inner math environment's, a label, a tag, a number's switch, `\qedhere`, a line break, a
 *  space or a fill of TeX's, an empty group, plain TeX's \eqno and what it numbers */
const DISPLAY_TAIL = new RegExp(
  String.raw`(?:[ \t\n\f\r]+|(?<!\\)%[^\n]*|\\\]|\$\$|\\end\s*\{${MATH_INNER}\}|\\(?:label|tag\*?)\s*\{[^{}]*\}|\\(?:nonumber|notag|qedhere|displaybreak|allowbreak|hfill)(?![A-Za-z@])(?:\[[^\]]*\])?|\\\\\*?(?:\[[^\]]*\])?|${MATH_SPACE_SOURCE}|\{\}|\\l?eqno(?![A-Za-z@])[\s\S]*)$`,
)
/** the punctuation at that end: a stop, a comma, a semicolon or a colon, bare or alone in a group that sets it (`\text{.}`,
 *  never a phantom's); never an empty delimiter (`\right.`) or an escaped character (`\;` is a space) */
const DISPLAY_STOP =
  /\\(?:text|mbox|textrm|textnormal|mathrm|hbox)\s*\{\s*([.,;:])\s*\}$|(?<!\\(?:right|middle|left|[bB]igg?[lrm]?)\s*)(?<!\\)([.,;:])$/
/** the punctuation a display's source sets at its end, which is its sentence's (`x = y.\label{e}\end{equation}`), or
 *  null; read in its last 2,000 characters, where a display's end lies whatever its length. The translator sets a display's
 *  stand-in with it (the el's `stop`): a display's end punctuation goes after its marker (0 of 444 before it, 1,357 of 1,357
 *  after it, the translate lane's measure) */
export function displayStop(src: string): string | null {
  if (!DISPLAY.test(src)) return null
  let s = src.length > 2000 ? src.slice(-2000) : src
  for (let n = 0; n < 64; n++) {
    const m = DISPLAY_TAIL.exec(s)
    if (!m) break
    s = s.slice(0, m.index)
  }
  const m = DISPLAY_STOP.exec(s)
  return m ? ((m[1] ?? m[2]) as string) : null
}

/** a closed unit's pieces typed: spans paired by their open and close (an open the unit's end cuts has no close, a close
 *  whose open came before the unit none), elements and spans numbered by their place */
export function typed(pieces: readonly Raw[]): Piece[] {
  let n = 0
  const top: Piece[] = []
  const stack: { span: Piece & { t: 'span' }; into: Piece[] }[] = []
  let into = top
  for (const p of pieces) {
    switch (p.t) {
      case 'text':
        into.push({ t: 'text', s: p.s })
        break
      case 'ph': {
        const stop = displayStop(p.src)
        into.push(
          stop
            ? { t: 'el', id: `e${n++}`, kind: p.kind, src: p.src, stop }
            : { t: 'el', id: `e${n++}`, kind: p.kind, src: p.src },
        )
        break
      }
      case 'open': {
        const span: Piece & { t: 'span' } = { t: 'span', id: `s${n++}`, style: p.style, open: p.src, content: [] }
        if (p.must) span.must = 1
        into.push(span)
        stack.push({ span, into })
        into = span.content
        break
      }
      case 'close': {
        const open = stack.pop()
        if (open) {
          open.span.close = p.src
          into = open.into
        } else {
          // (a close whose open is before the unit: a span from the unit's start)
          const content = into.splice(0, into.length)
          into.push({ t: 'span', id: `s${n++}`, style: 'group', close: p.src, content })
        }
        break
      }
      case 'nested':
        into.push({ t: 'unit', id: `u${n++}`, unit: p.unit.id as string, pre: p.pre, post: p.post })
        break
    }
  }
  return top
}

export const IN_TEXT: ReadonlySet<string> = new Set(['para', 'theorem', 'abstract'])
export const BIB_KINDS: ReadonlySet<string> = new Set(['reference'])

/** a unit's flags as the walk sets them while building */
export interface BuildState {
  kind: string | undefined
  title: boolean
  depth: number | undefined
  inFloat: boolean
  cellMode: boolean
}

export class Builder implements BuildState {
  readonly file: string
  readonly units: BUnit[]
  cur: BUnit | null = null
  kind: string | undefined = undefined
  title = false
  depth: number | undefined = undefined
  inFloat = false
  cellMode = false
  /** the source text the units' gaps are read from (a display standing alone joins the paragraph before it) */
  readonly text: string
  constructor(file: string, units: BUnit[], text: string) {
    this.file = file
    this.units = units
    this.text = text
  }
  private start(at: number): BUnit {
    if (!this.cur) this.cur = { file: this.file, kind: this.kind ?? 'para', start: at, end: at, pieces: [] }
    return this.cur
  }
  text_(s: string, start: number, end: number): void {
    if (!this.cur && !s.trim()) return
    const u = this.start(start)
    u.pieces.push({ t: 'text', s, at: start, to: end })
    u.end = end
  }
  ph(src: string, kind: string, start: number, end: number, display = false): void {
    const u = this.start(start)
    u.pieces.push(
      display ? { t: 'ph', src, kind, display, at: start, to: end } : { t: 'ph', src, kind, at: start, to: end },
    )
    u.end = end
  }
  open(src: string, style: string, start: number, must = false): void {
    const u = this.start(start)
    const where = { at: start, to: start + src.length }
    u.pieces.push(must ? { t: 'open', src, style, must, ...where } : { t: 'open', src, style, ...where })
    u.end = Math.max(u.end, start + src.length)
  }
  close(src: string, end: number): void {
    if (!this.cur) return
    this.cur.pieces.push({ t: 'close', src, at: end - src.length, to: end })
    this.cur.end = end
  }
  letter(letter: string, src: string, start: number, end: number): void {
    const u = this.start(start)
    u.pieces.push({ t: 'text', s: letter, src, at: start, to: end })
    u.end = end
  }
  flush(): void {
    const u = this.cur
    this.cur = null
    if (!u) return
    const read = keepAddresses(u.pieces)
    u.pieces = joinLetters(BIB_KINDS.has(u.kind) ? keepNumbers(read) : read)
    const letters = u.pieces.map(textOf).join('')
    if ((letters.match(/\p{L}/gu) ?? []).length < 2) return
    if (this.title) u.title = true
    if (this.depth !== undefined) u.depth = this.depth
    if (this.inFloat) u.inFloat = true
    this.units.push(u)
  }
}

/** a unit closed: its typed pieces and its id (inner units first: a nested piece names its unit's id) */
export function close(u: BUnit): void {
  if (u.id) return
  for (const p of u.pieces) if (p.t === 'nested') close(p.unit)
  u.content = typed(u.pieces)
  u.id = unitId(u.kind, u.content)
}
