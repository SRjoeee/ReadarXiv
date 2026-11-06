// What the plan says of each placeholder it marked, for the reading of its ink in B's stream (contract stage 1c-2, item 3):
// today's marks.mjs followsOf and headsOf rebuilt that from the units and the names of the points B holds — which piece a name
// is (its class decided again from its source), whether the next piece has a mark, which marks end the unit. Here each fact is
// the plan's: a mark names its unit and piece, and the plan lists every mark written. What remains read from B is whether
// TeX set a point (a mark written whose point B does not hold is no point), and from the SourceDoc the text after a piece.
import type { SourceDoc } from '../source/read.ts'
import { classOf, symbolText } from './classes.ts'
import type { Plan } from './mark.ts'

/** the characters of the text after an opening point alone it is found by (stream.mjs WANT) */
export const WANT = 8
/** source text as TeX's ligatures and LaTeX's quotes set it, white space and ties none (marks.mjs asSet) */
export const asSet = (s: string): string =>
  s
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/``/g, '“')
    .replace(/''/g, '”')
    .replace(/`/g, '‘')
    .replace(/'/g, '’')
    .replace(/[~\s]/g, '')
/** the letters a text is told by, without accents, lower case (stream.mjs spellOf): a letter Unicode does not decompose is its
 *  base letters (\o, \ae, \ss, \l: OT1 and T1 set them otherwise), a final sigma a sigma */
const BASE_LETTERS: Readonly<Record<string, string>> = {
  ß: 'ss',
  ı: 'i',
  ȷ: 'j',
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  ħ: 'h',
  þ: 'th',
  ŋ: 'n',
  ς: 'σ',
}
export const spellOf = (s: string): string =>
  s
    .normalize('NFKD')
    .replace(/[\p{M}ˆˇ˘-˝]/gu, '')
    .toLowerCase()
    .replace(/[ßıȷøæœłđðħþŋς]/g, (c) => BASE_LETTERS[c] as string)
    .replace(/[^\p{L}\p{N}]/gu, '')
const wantOf = (s: string) => asSet(s).normalize('NFKC').toLowerCase().replace(/\s/g, '').slice(0, WANT)

/** the classes whose placeholder after a paper's macro the probe asks about (marks.mjs AHEAD_FOLLOWS): a split's piece */
const AHEAD_FOLLOWS = new Set(['math', 'cite', 'ref', 'eqref', 'code', 'url', 'footnote', 'number'])

/** what the plan says of one opening mark's piece (today's stream.mjs Follow) */
export interface Follow {
  unit: number
  piece: number
  /** its closing mark was written and TeX set its point */
  closing: boolean
  /** the first WANT characters of the text TeX sets after it in its unit, up to its next visible piece; all of it, spelled */
  want: string
  rest: string
  display: boolean
  /** the names of the marks that may come next in its unit: the next visible piece's opening (where one was written and set),
   *  the unit's end mark */
  ends: string[]
  /** the next visible piece has no point of its own */
  blocked: boolean
  /** past the unmarked visible pieces right after it, nothing but white space between, the next marked piece's opening */
  through: string | null
  /** the displays right after it with nothing visible between that have no point of their own (TeX sets none on the empty
   *  list it resumes the paragraph with): the first owns the group's ink */
  group: number[]
  /** a paper's macro and the one unmarked placeholder after it: that piece's name, the text TeX sets for the macro (the
   *  probe's), and the text after that piece as an opening's */
  split?: { name: string; text: string; want?: string; rest?: string; ends?: string[] }
  /** the punctuation the plan's closing mark stands after (TeX said the command sets it before its own ink) */
  moved?: string
}

/** each unit's marks as the plan wrote them, and the points B holds */
export interface Written {
  /** the opening mark's name of a unit's piece, where one was written and its point is in B */
  opening(unit: number, piece: number): string | null
  closing(unit: number, piece: number): string | null
  /** the unit's start and end mark names (any kind), where written */
  start(unit: number): string | null
  end(unit: number): string | null
}
export function writtenOf(plan: Plan, read: ReadonlySet<string>): Written {
  const open = new Map<string, string>()
  const close = new Map<string, string>()
  const start = new Map<number, string>()
  const end = new Map<number, string>()
  for (const m of plan.marks) {
    if (m.kind === 'open') open.set(`${m.unit}.${m.piece}`, m.name)
    else if (m.kind === 'close') close.set(`${m.unit}.${m.piece}`, m.name)
    else if (m.kind === 'backref') {
      // (backref's list after an entry: one mark, \axtbrname, sets both points around the list it names)
      open.set(`${m.unit}.${m.piece}`, `${m.name}a`)
      close.set(`${m.unit}.${m.piece}`, `${m.name}b`)
    } else if (m.kind === 'start' || m.kind === 'cell-start' || m.kind === 'heading-start') start.set(m.unit, m.name)
    else if (m.kind === 'end' || m.kind === 'cell-end' || m.kind === 'heading-end') end.set(m.unit, m.name)
  }
  const ifRead = (n: string | undefined) => (n !== undefined && read.has(n) ? n : null)
  return {
    opening: (u, k) => ifRead(open.get(`${u}.${k}`)),
    closing: (u, k) => ifRead(close.get(`${u}.${k}`)),
    start: (u) => start.get(u) ?? null,
    end: (u) => end.get(u) ?? null,
  }
}

/**
 * The Follow of each opening mark the plan wrote, by its name: `texts` the text the probe showed each paper's macro sets
 * (readInkTexts), `inkless` the macros TeX said set no ink, `moved` the plan's closing marks written after the punctuation they
 * move (by name)
 */
export function followsOf(
  doc: SourceDoc,
  plan: Plan,
  w: Written,
  o: { texts?: ReadonlyMap<string, string> | null; inkless?: ReadonlySet<string> },
): Map<string, Follow> {
  const noInk = o.inkless ?? new Set<string>()
  const moved = new Map<string, string>()
  for (const m of plan.marks) if (m.kind === 'close' && m.moved) moved.set(`${m.unit}.${m.piece}`, m.moved)
  const out = new Map<string, Follow>()
  for (const m of plan.marks) {
    if (m.kind !== 'open' && m.kind !== 'backref') continue
    const name = m.kind === 'backref' ? `${m.name}a` : m.name
    const i = m.unit
    const k = m.piece
    const u = doc.units[i]
    if (!u) continue
    const ps = u.pieces
    const endName = w.end(i)
    const ends = endName ? [endName] : []
    /** what piece q sets past a piece's ink as text (followsOf's shownAt): a text's text, an unmarked text symbol's character
     *  where nothing but white space comes before it, nothing for a piece of no class or a macro of no ink; null for a visible
     *  piece */
    const shownAt = (q: number, after: string): string | null => {
      const p = ps[q] as (typeof ps)[number]
      const c = classOf(p)
      if (!c) return p.t === 'text' ? p.s : ''
      if (c !== 'macro') return null
      if (p.t === 'ph' && noInk.has(p.src)) return ''
      const sym = p.t === 'ph' ? symbolText(p.src) : null
      return sym !== null && asSet(sym) === sym && !w.opening(i, q) && !/\S/.test(after) ? sym : null
    }
    const display = classOf(ps[k]) === 'display'
    const group: number[] = []
    let after = ''
    let q = k + 1
    for (;;) {
      for (; q < ps.length; q++) {
        const t = shownAt(q, after)
        if (t === null) break
        after += t
      }
      if (!display || q >= ps.length || classOf(ps[q]) !== 'display' || /\S/.test(after) || w.opening(i, q)) break
      group.push(q)
      q++
    }
    const nextOpen = q < ps.length ? w.opening(i, q) : null
    const blocked = q < ps.length && !nextOpen
    let through: string | null = null
    let others = 0
    if (blocked && !/\S/.test(after))
      for (let r = q + 1; r < ps.length; r++) {
        const p = ps[r] as (typeof ps)[number]
        if (p.t === 'text') {
          if (/\S/.test(p.s)) break
          continue
        }
        if (!classOf(p)) continue
        const n = w.opening(i, r)
        if (n) {
          through = n
          break
        }
        others++
      }
    const F = blocked && !/\S/.test(after) ? ps[q] : undefined
    const fcls = classOf(F)
    const parted =
      !!F &&
      classOf(ps[k]) === 'macro' &&
      (AHEAD_FOLLOWS.has(fcls ?? '') || (fcls === 'macro' && F.t === 'ph' && symbolText(F.src) === null))
    let trail: { want: string; rest: string; ends: string[] } | null = null
    if (parted && !through) {
      let rest = ''
      let r = q + 1
      for (; r < ps.length && !classOf(ps[r]); r++) {
        const p = ps[r] as (typeof ps)[number]
        if (p.t === 'text') rest += p.s
      }
      const fnext = r < ps.length ? w.opening(i, r) : null
      if (/\S/.test(rest))
        trail = { want: wantOf(rest), rest: spellOf(rest), ends: [...(fnext ? [fnext] : []), ...ends] }
    }
    const src = (ps[k] as { src?: string }).src ?? ''
    const text = o.texts && parted && ((through && !others) || trail) ? o.texts.get(src) : undefined
    const said = typeof text === 'string' && /[\p{L}\p{N}]/u.test(text) ? text : ''
    // (the name the piece after it would have had: the split's reading is kept under it)
    const splitName = `${classOf(F) === 'footnote' ? 'n' : 'p'}${i}.${q}a`
    const mv = moved.get(`${i}.${k}`)
    out.set(name, {
      unit: i,
      piece: k,
      // (a closing mark TeX did not set — LAYOUT_TEX's \axt@pm sets none on the empty list after a display, which a mark there
      // would keep a line — leaves the piece an opening alone, read to the text after it)
      closing: w.closing(i, k) !== null,
      want: wantOf(after),
      rest: spellOf(after),
      display,
      ends: [...(nextOpen ? [nextOpen] : []), ...ends],
      blocked,
      through,
      group,
      ...(said ? { split: { name: splitName, text: said, ...(trail ?? {}) } } : {}),
      ...(mv ? { moved: mv } : {}),
    })
  }
  return out
}
