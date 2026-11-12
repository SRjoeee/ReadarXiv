// S.names (design-b §1.6 L3, T9, T28, G15; the ruling of D1a I4: babel names wherever TeX identified them): each babel name
// the file locates on a page (Abstract, References, Contents, …) set in the target's word for it, at the original's size,
// weight and slant, its left edge kept or, centred, its centre, shrunk into the room on its line to the script's last floor at
// most (floorMin), else left the original's (`unfit`). A name that leads a unit (RUN_IN) is that unit's lead (U.lead): its word
// and style handed on. Ported from engine 065c1d973 run.mjs paintNames RUN:1355-1425 (counterOf RUN:1353), layer2.mjs
// nameInTarget L2:1205-1210, nameStyleOf L2:1220-1228 (SMALL_CAPS_SHARE L2:808, cased L2:816), nameRuns and nameScriptRuns
// L2:4755-4777 (SMALL_CAPS_RATIO L2:812, selfCaps L2:2448), runsWidth L2:4779. Without its paint (the hiding, the markup, the
// text layer and the word table: the reader's, D.*): it returns what is drawn and where.
//
// Its facts are the name's row of the file (lane L1: a member of kind 'name', its Word, its line) and what today reads off the
// page's characters around it: the name's own characters (`nameChars`: its text, its size and small capitals, its style; L1's
// Word and Style), the counter TeX set after it (`counterOf`: L1's Word.counter), and the room its line leaves it (`nameRoom`:
// the next characters either side; L1's Room.side). Those readings are ported here too, over a page's characters, so that the
// replay reads them as today does; the decision (`setName`) takes their answers.
import { cover } from '../breaker/cover.ts'
import { fontString } from '../breaker/measure.ts'
import { cjkClassRe } from '../breaker/script.ts'
import { caseRuns, type Face, type Token, type TStyle, upperOf } from '../breaker/tokens.ts'
import type { FaceId, Metrics } from '../types.ts'
import { styleOfChars } from '../unit/lead.ts'
import { CJK_CAPS_SIZE } from '../unit/params.ts'
import { median } from '../util.ts'

/** a babel name the file locates (layout/file.mjs `names`, indexLayout's): its row's box, size, flags, the unit it leads
 *  (RUN_IN, else -1), its glue to that unit or the counter's width at its row's end, its column's text edges */
export type NameRow = {
  occurrence: number
  key: string
  page: number
  x0: number
  baseline: number
  x1: number
  top: number
  bottom: number
  size: number
  font: number
  centred: boolean
  capitals: boolean
  unit: number
  glue: number
  counter: number
  cx0: number
  cx1: number
}
/** a character of a page as today's reading gives it (layer2.mjs pageChars2): its text, box, baseline, size, item, style */
export type PageChar = {
  ch: string
  x0: number
  x1: number
  yb: number
  size: number
  item?: number
  k?: number
  st?: { fam?: string; bold?: boolean; italic?: boolean; caps?: boolean; design?: string; fill?: number } & Record<
    string,
    unknown
  >
  [more: string]: unknown
}

/** a capital set at this share of a name's largest letter or less is a faked small capital (L2:808) */
export const SMALL_CAPS_SHARE = 0.9
/** the share of the size small capitals the layer draws itself are set at (L2:812) */
export const SMALL_CAPS_RATIO = 0.8
const cased = (ch: string) => ch.toLowerCase() !== ch.toUpperCase()

// ---------------------------------------------------------------- the readings of the page around a name

/** the name's own characters: those whose middle stands within its box, on its baseline (RUN:1360) */
export const nameChars = (nm: NameRow, chars: readonly PageChar[]): PageChar[] =>
  chars.filter(
    (c) =>
      /\S/.test(c.ch) &&
      (c.x0 + c.x1) / 2 >= nm.x0 - 0.5 &&
      (c.x0 + c.x1) / 2 <= nm.x1 + 0.5 &&
      Math.abs(c.yb - nm.baseline) < 0.3 * nm.size,
  )
/** the characters of a name's row that are the counter TeX set after it, as the maker found it: those whose middle stands
 *  within the counter's width at the row's end (RUN:1353 counterOf) */
export const counterOf = (chars: readonly PageChar[], nm: NameRow): PageChar[] =>
  nm.counter > 0 ? chars.filter((c) => (c.x0 + c.x1) / 2 > nm.x1 - nm.counter) : []
/** a name's size and whether it is set in faked small capitals, read off its characters (L2:1220 nameStyleOf) */
export function nameStyleOf(chars: readonly PageChar[] | null, name: NameRow): { size: number; small: boolean } {
  const letters = (chars ?? []).filter((c) => c.size > 0 && /\S/.test(c.ch ?? '') && c.st?.fam !== 'math')
  if (!letters.length) return { size: name.size, small: false }
  let big = 0
  for (const c of letters) if (c.size > big) big = c.size
  const small = new Set(
    name.capitals
      ? letters.filter((c) => cased(c.ch) && c.ch === c.ch.toUpperCase() && c.size <= SMALL_CAPS_SHARE * big)
      : [],
  )
  const rest = letters.filter((c) => !small.has(c))
  return { size: rest.length ? median(rest.map((c) => c.size)) : name.size, small: small.size > 0 }
}
/** its room on its line: its TeX column's text edges, or the next characters of the line either side (a quarter of an em
 *  clear), never narrower than its own box (RUN:1394-1402) */
export function nameRoom(
  nm: NameRow,
  chars: readonly PageChar[],
  mine: readonly PageChar[],
): { left: number; right: number } {
  const own = new Set(mine)
  let left = nm.cx0,
    right = nm.cx1
  for (const c of chars) {
    if (own.has(c) || !/\S/.test(c.ch) || Math.abs(c.yb - nm.baseline) >= 0.4 * nm.size) continue
    if (c.x1 <= nm.x0 + 0.1) left = Math.max(left, c.x1 + 0.25 * nm.size)
    else if (c.x0 >= nm.x1 - 0.1) right = Math.min(right, c.x0 - 0.25 * nm.size)
  }
  return { left: Math.min(left, nm.x0), right: Math.max(right, nm.x1) }
}

// ---------------------------------------------------------------- the word

/** the target's word for a name, in capitals where the class changed its case; null where the target has none (an empty one
 *  keeps the original's) or the word is the original's already (L2:1205 nameInTarget) */
export function nameInTarget(
  name: Pick<NameRow, 'key' | 'capitals'>,
  own: string,
  labels: Readonly<Record<string, string>> | null | undefined,
  to: string,
): string | null {
  const word = labels?.[name.key]
  if (!word) return null
  const text = name.capitals ? word.toLocaleUpperCase(to) : word
  return text.replace(/\s+/g, '') === String(own ?? '').replace(/\s+/g, '') ? null : text
}

/** a run of a name's word as drawn: its text, its share of the size, its face */
export type NameRun = { s: string; k: number; face: Face }
/** a name's word as the layer draws it: its first run's face, its runs, what is drawn */
export type NameDrawn = { face: Face; runs: NameRun[]; text: string }

/** a name's word in `face` (L2:4755 nameRuns): its runs of one case where the layer draws the face's small capitals itself */
export function nameRuns(
  text: string,
  face: Face,
  to: string,
  ownSmallCaps: (id: string) => boolean,
): { face: Face; runs: { s: string; k: number }[]; text: string } {
  const self = !!face?.caps && !(face.id && ownSmallCaps(face.id))
  if (!self) return { face, runs: [{ s: text, k: 1 }], text }
  const runs = caseRuns(text, SMALL_CAPS_RATIO, upperOf(to)).map((r) => ({ s: r.s, k: r.k }))
  return { face: { ...face, caps: false }, runs, text: runs.map((r) => r.s).join('') }
}
/** a name's word in its runs by script, each in its face (L2:4767 nameScriptRuns): its CJK characters in the target's CJK face,
 *  every other in the Latin one */
export function nameScriptRuns(
  text: string,
  faceOf: (cls: 'cjk' | 'latin') => Face,
  to: string,
  quotes: boolean,
  ownSmallCaps: (id: string) => boolean,
): NameDrawn {
  const re = cjkClassRe(quotes),
    parts: { cls: 'cjk' | 'latin'; s: string }[] = []
  for (const ch of text) {
    const cls = re.test(ch) ? 'cjk' : 'latin',
      last = parts.at(-1)
    if (last?.cls === cls) last.s += ch
    else parts.push({ cls, s: ch })
  }
  const runs: NameRun[] = []
  for (const p of parts) {
    const r = nameRuns(p.s, faceOf(p.cls), to, ownSmallCaps)
    for (const q of r.runs) runs.push({ s: q.s, k: q.k, face: r.face })
  }
  return { face: runs[0]?.face ?? faceOf('latin'), runs, text: runs.map((r) => r.s).join('') }
}
/** a word's width at size 1 (L2:4779 runsWidth): each run's in its face at its share */
export const runsWidth = (d: NameDrawn, metrics: Metrics): number =>
  d.runs.reduce((a, r) => a + (metrics.advance(fontString(r.face ?? d.face, 100), 100, r.s) / 100) * r.k, 0)

// ---------------------------------------------------------------- the decision

const r1 = (x: number) => Math.round(x * 100) / 100

export type NameInput = {
  nm: NameRow
  /** the name's own characters on its page (nameChars) */
  mine: readonly PageChar[]
  /** the room its line leaves it (nameRoom), read only where it is drawn on its own */
  room: () => { left: number; right: number }
  /** the target and its words for babel's names (the rule set's labels) */
  to: string
  labels: Readonly<Record<string, string>> | null | undefined
  /** the paper's serif design (a name's style's design where its characters tell none) */
  serif: string
  P: { cjk?: boolean; cjkQuotes?: boolean; floorMin: number }
  /** the face a run of a style is drawn in (B.faces), and whether a face holds small capitals of its own */
  faceOf: (st: TStyle, cls: 'cjk' | 'latin') => Face
  ownSmallCaps: (id: string) => boolean
  metrics: Metrics
  /** the name's group: its ink can be hidden (a name whose group the document does not hold stays the original's) */
  shown: boolean
  /** what TeX set before the word on its line that is the name's own and moves with it, from its start to the word's: its label,
   *  the number a class set right before a heading it sets itself, and the space after it (Placed.label, own.mjs MR 6c). A
   *  centred name is centred whole, that width before its word; one kept at its left edge keeps the number where it stands */
  before?: number
}
/** what S.names decides of a name (today's record, RUN:1358): drawn or why not, its word, size, place and width */
export type NameRecord = {
  occurrence: number
  key: string
  page: number
  drawn: boolean
  why: string | null
  text?: string
  unit?: number
  size?: number
  x?: number
  w?: number
  room?: number
  box: { x0: number; x1: number; baseline: number; top: number; bottom: number; size: number }
  column: [number, number]
}
/** a name that leads a unit: the unit's lead (U.lead reads it): its word and style, its characters */
export type NameLeads = { nm: NameRow; text: string; st: TStyle; chars: readonly PageChar[] }
export type SetName = {
  rec: NameRecord
  /** a name leading a unit: handed to that unit's lay */
  lead?: NameLeads
  /** a name drawn on its own: its runs, at `x` on its baseline at `size`, in its colour */
  drawn?: { runs: NameRun[]; face: Face; x: number; baseline: number; size: number; color: unknown }
  /** the faces its word waits for (B.cover: not loaded yet); today's check awaited them */
  wait?: [FaceId, string][]
}

/** what S.names reads of a name's own characters (today's, over the page's; the part states them: Placed.plain, Style): its
 *  text without the counter TeX set after it, the counter's, its size and whether it is set in faked small capitals, its
 *  style; `chars` its characters, a lead's joint (none from the part) */
export type NameRead = {
  text: string
  counter: string
  size: number
  small: boolean
  st: TStyle
  chars: readonly PageChar[]
}

/** S.names: one name of a page set in the target (RUN:1357-1424), its readings today's over the page's characters */
export function setName(i: NameInput): SetName {
  const { nm, mine } = i
  if (!mine.length) return setNameOf({ ...i, own: null })
  const counter = nm.unit >= 0 ? [] : counterOf(mine, nm)
  const text0 = mine.filter((c) => !counter.includes(c))
  const own = nameStyleOf(text0, nm)
  const st0 = styleOfChars(mine as never, i.serif) as TStyle
  return setNameOf({
    ...i,
    own: {
      text: text0.map((c) => c.ch).join(''),
      counter: counter.map((c) => c.ch).join(''),
      size: own.size,
      small: own.small,
      st: own.small ? { ...st0, caps: true } : st0,
      chars: mine,
    },
  })
}

/** S.names' decision over what is read of the name (setName's readings, or the part's facts: lay/entry.ts) */
export function setNameOf(i: Omit<NameInput, 'mine'> & { own: NameRead | null }): SetName {
  const { nm, own } = i
  const rec: NameRecord = {
    occurrence: nm.occurrence,
    key: nm.key,
    page: nm.page,
    drawn: false,
    why: null,
    box: { x0: nm.x0, x1: nm.x1, baseline: nm.baseline, top: nm.top, bottom: nm.bottom, size: nm.size },
    column: [nm.cx0, nm.cx1],
  }
  if (!own) return { rec: { ...rec, why: 'unread' } }
  const word = nameInTarget(own.small ? { ...nm, capitals: false } : nm, own.text, i.labels, i.to)
  const text = word === null ? null : own.counter ? `${word} ${own.counter}` : word
  if (text === null) return { rec: { ...rec, why: !i.labels?.[nm.key] ? 'no word' : 'same' } }
  const st = own.st
  const at = own.small && i.P.cjk ? own.size * CJK_CAPS_SIZE : own.size
  if (nm.unit >= 0)
    return {
      rec: { ...rec, why: 'inline: its unit not drawn', text, unit: nm.unit },
      lead: { nm, text, st, chars: own.chars },
    }
  const drawn = nameScriptRuns(text, (cls) => i.faceOf(st, cls), i.to, !!i.P.cjkQuotes, i.ownSmallCaps)
  const covered = cover(
    drawn.runs.map((q) => ({ s: q.s, face: q.face }) as Token),
    i.metrics,
  )
  if ('wait' in covered) return { rec, wait: covered.wait }
  if (!covered.ok) return { rec: { ...rec, why: covered.why } }
  const { left, right } = i.room()
  const before = nm.centred ? (i.before ?? 0) : 0
  const w = runsWidth(drawn, i.metrics) * at,
    mid = (nm.x0 - before + nm.x1) / 2
  const room = nm.centred ? 2 * Math.min(mid - left, right - mid) - before : right - nm.x0
  const k = w > room ? room / w : 1
  if (k < i.P.floorMin - 1e-9) return { rec: { ...rec, why: 'unfit', text, w: r1(w), room: r1(room) } }
  const size = at * k,
    x = nm.centred ? mid - (w * k + before) / 2 + before : nm.x0
  if (!i.shown) return { rec: { ...rec, why: 'unhidden', text } }
  return {
    rec: { ...rec, drawn: true, text, size: r1(size), x: r1(x), w: r1(w * k) },
    drawn: {
      runs: drawn.runs,
      face: drawn.face,
      x,
      baseline: nm.baseline,
      size,
      color: (st as { color?: unknown }).color ?? null,
    },
  }
}
