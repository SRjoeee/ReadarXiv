// The acceptance rule, the chain's one (interfaces/translate/DECISION.md; design-a §1.3, design-b §1.1): applied to every
// reading of every reply, stored or fresh. A reading the rule refuses goes to the next translator for that unit alone.
import type { OutPiece, Piece, Sentences, UnitIn } from './contract.ts'

/** Why a reading is refused, for counts and tests; a caller sees only `refused` */
export type Refusal =
  /** an element lost or doubled */
  | 'elements'
  /** a span doubled, a `must` span lost or emptied, or a nesting the unit does not have */
  | 'spans'
  /** an id the unit lacks, a control character, U+FFFC or a default-ignorable code point */
  | 'foreign'
  /** no letter where the unit has one */
  | 'empty'
  /** shorter than LENGTH_FLOOR of a unit of FLOOR_FROM characters or more */
  | 'short'
  /** the reply could not be read at all (an adapter's read gave null) */
  | 'unread'

/** The one measured length floor (the LLM probe: both cut units under 0.2, p05 0.29), for every target */
export const LENGTH_FLOOR = 0.2
/** … for units of this many plain characters or more */
export const FLOOR_FROM = 200

const OBJ = '￼'
/** whether a text holds a C0 or C1 control but tab and newline */
const holdsControl = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if ((c < 0x20 && c !== 0x09 && c !== 0x0a) || (c >= 0x7f && c <= 0x9f)) return true
  }
  return false
}
const IGNORABLE = /\p{Default_Ignorable_Code_Point}/u
const LETTER = /\p{L}/u
const SOLID = /\S/

/** The plain projection of a piece list (design-a §1.4): text joined, each element one U+FFFC, spans transparent. The
 *  coordinates of `Sentences` */
export function projectionOf(content: readonly (Piece | OutPiece)[]): string {
  let out = ''
  for (const p of content) {
    if (p.t === 'text') out += p.s
    else if (p.t === 'el') out += OBJ
    else out += projectionOf(p.content)
  }
  return out
}
/** a piece list's text alone, elements and span edges out */
export function textOf(content: readonly (Piece | OutPiece)[]): string {
  let out = ''
  for (const p of content) {
    if (p.t === 'text') out += p.s
    else if (p.t === 'span') out += textOf(p.content)
  }
  return out
}
/** the projection's length with white space runs as one and its ends trimmed: what the length floor compares */
export const plainLength = (content: readonly (Piece | OutPiece)[]): number =>
  projectionOf(content).replace(/\s+/g, ' ').trim().length
/** whether a unit has any letter: one with none is its own translation, and nothing is sent */
export const hasLetter = (unit: UnitIn): boolean => LETTER.test(textOf(unit.content))

/** a unit's elements and spans, each with its enclosing spans' ids */
interface Shape {
  els: Map<string, ReadonlySet<string>>
  spans: Map<string, { within: ReadonlySet<string>; must: boolean; text: boolean }>
}
function shapeOf(
  content: readonly Piece[],
  within: ReadonlySet<string> = new Set(),
  shape: Shape = { els: new Map(), spans: new Map() },
): Shape {
  for (const p of content) {
    if (p.t === 'el') shape.els.set(p.id, within)
    else if (p.t === 'span') {
      shape.spans.set(p.id, { within, must: !!p.must, text: SOLID.test(textOf(p.content)) })
      shapeOf(p.content, new Set([...within, p.id]), shape)
    }
  }
  return shape
}

/** THE rule. Pure and total */
export function accept(unit: UnitIn, out: readonly OutPiece[]): { ok: true } | { ok: false; why: Refusal } {
  const shape = shapeOf(unit.content)
  const seenEls = new Map<string, number>()
  const seenSpans = new Map<string, number>()
  const spanText = new Map<string, boolean>()
  let refusal: Refusal | null = null
  const refuse = (why: Refusal) => {
    refusal ??= why
  }
  const walk = (content: readonly OutPiece[], within: readonly string[]) => {
    for (const p of content) {
      if (refusal) return
      if (p.t === 'text') {
        if (holdsControl(p.s) || p.s.includes(OBJ) || IGNORABLE.test(p.s)) refuse('foreign')
      } else if (p.t === 'el') {
        const at = shape.els.get(p.id)
        if (!at) return refuse('foreign')
        seenEls.set(p.id, (seenEls.get(p.id) ?? 0) + 1)
        if (within.some((s) => !at.has(s))) refuse('spans')
      } else {
        const at = shape.spans.get(p.id)
        if (!at) return refuse('foreign')
        seenSpans.set(p.id, (seenSpans.get(p.id) ?? 0) + 1)
        if (within.some((s) => !at.within.has(s))) refuse('spans')
        spanText.set(p.id, SOLID.test(textOf(p.content)))
        walk(p.content, [...within, p.id])
      }
    }
  }
  walk(out, [])
  if (refusal) return { ok: false, why: refusal }
  for (const id of shape.els.keys()) if (seenEls.get(id) !== 1) return { ok: false, why: 'elements' }
  for (const [id, s] of shape.spans) {
    const n = seenSpans.get(id) ?? 0
    if (n > 1 || (s.must && n !== 1) || (s.must && s.text && !spanText.get(id))) return { ok: false, why: 'spans' }
  }
  if (LETTER.test(textOf(unit.content)) && !LETTER.test(textOf(out))) return { ok: false, why: 'empty' }
  const from = plainLength(unit.content)
  if (from >= FLOOR_FROM && plainLength(out) < LENGTH_FLOOR * from) return { ok: false, why: 'short' }
  return { ok: true }
}

/** Whether a reading's sentences reconstruct (design-a §1.4): as many starts on each side, each side strictly
 *  increasing and strictly inside its projection. Sentences that do not are dropped; the translation stays */
export function validSentences(unit: UnitIn, out: readonly OutPiece[], s: Sentences): boolean {
  const inside = (xs: readonly number[], length: number) =>
    xs.every((o, j) => Number.isInteger(o) && o > 0 && o < length && (j === 0 || o > (xs[j - 1] as number)))
  return (
    Array.isArray(s.src) &&
    Array.isArray(s.tr) &&
    s.src.length > 0 &&
    s.src.length === s.tr.length &&
    inside(s.src, projectionOf(unit.content).length) &&
    inside(s.tr, projectionOf(out).length)
  )
}

/** a unit's content as a translation: what an echo gives back, and what a unit with no letter is */
export function asOut(content: readonly Piece[]): OutPiece[] {
  return content.map((p) =>
    p.t === 'text'
      ? { t: 'text', s: p.s }
      : p.t === 'el'
        ? { t: 'el', id: p.id }
        : { t: 'span', id: p.id, content: asOut(p.content) },
  )
}

/** The behaviour digest of `accept`: the SHA-256 of its outputs over the golden cases of tests/accept.test.ts. A change to
 *  what the rule accepts fails that test until this moves, and with it every chain's identity (identityOf) */
export const ACCEPT_DIGEST = '08f09f1341bf4d5d82df8eab4751279899c6af78f3135a018467b0a6e3604494'
