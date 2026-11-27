// The LLM wire: the tags wire's plan (wire/tags.ts planTags, its void spelling) written with typed tags, the 11-06 LLM
// probe's form, and read back through the tags wire's own reading (google.ts readTagged). An element's slot is written
// `<Ln/>`, its letter its kind's (`<m1/>` a formula, `<c3/>` a citation) and its number the slot's; a span with text
// `<sn>…</sn>`. The letter tells the model what the piece is; the reading goes by the number alone. So this wire is the
// LLM adapter's own: the tags wire, its spellings and every digest of the free translators stay as they are.
//
// Read tolerantly first, as the probe measured: a space after `<` or `</` (DeepSeek wrote `< m2/>` and `</ s2>` in 15
// elements), capitals, full-width brackets, a letter other than the one sent (DeepSeek V4.1 1017). A reply whose text is
// under 0.2 of its source's is refused, elements or not: the probe's two units cut short (a bare quote that closed the JSON
// string; half a paragraph left out) were both under 0.2, while the LLM replies' ratio had p05 0.29 and p50 0.35.
import { projectionOf } from '../accept.ts'
import type { OutPiece, Piece, Sentences, Translator, UnitIn } from '../contract.ts'
import { planTags } from '../wire/tags.ts'
import { readTagged } from './google.ts'

/** the letter an element's slot is written with, by its kind; a span with text is `s`; a slot of several elements, of
 *  none, or a boundary marker is `x` (the 11-06 probe's typed tags) */
export const KIND_LETTER: Readonly<Record<string, string>> = Object.freeze({
  math: 'm',
  display: 'd',
  cite: 'c',
  ref: 'r',
  eqref: 'r',
  'note-mark': 'f',
  url: 'u',
})
const OTHER = 'x'
const SPAN = 's'

/** a source of this many projection characters or more is held to the length rule */
const LENGTH_FROM = 200
/** a reply's projection under this share of its source's is a unit cut short */
const LENGTH_FLOOR = 0.2

/** the behaviour digest of writeTyped and readTyped over the tags fixtures (tests/digests.ts) */
export const LLM_WIRE_DIGEST = 'd420b4080ff97b055f331cd2ac6ed96f9264ab473d5f21233450e2a7d1ca70ba'

const kindsOf = (ps: readonly Piece[], out = new Map<string, string>()): Map<string, string> => {
  for (const p of ps) {
    if (p.t === 'el') out.set(p.id, p.kind)
    else if (p.t === 'span') kindsOf(p.content, out)
  }
  return out
}

/** the tags wire's own tags, as planTags writes them in its void spelling (its texts escape `<` and `>`) */
const VOID_TAGS = /<x id="(\d+)"\/>|<t id="(\d+)">|<\/t>/g

/** the unit's tags plan written typed: `<x id="n"/>` → `<L n/>` written `<Ln/>`, `<t id="n">…</t>` → `<sn>…</sn>` */
export function writeTyped(unit: UnitIn): string {
  const plan = planTags(unit)
  const kinds = kindsOf(unit.content)
  const letterOf = (n: number): string => {
    const slot = plan.slots[n - 1]
    if (slot?.t !== 'void' || slot.out.length !== 1) return OTHER
    const only = slot.out[0] as OutPiece
    return only.t === 'el' ? (KIND_LETTER[kinds.get(only.id) ?? ''] ?? OTHER) : OTHER
  }
  const open: string[] = []
  return plan.wire.replace(VOID_TAGS, (_m, el: string | undefined, sp: string | undefined) => {
    if (el !== undefined) return `<${letterOf(Number(el))}${el}/>`
    if (sp !== undefined) {
      open.push(sp)
      return `<${SPAN}${sp}>`
    }
    return `</${SPAN}${open.pop() ?? ''}>`
  })
}

/** a typed tag as a model may spell it: `<`, `</` or a full-width bracket, spaces anywhere inside, a letter of either
 *  case, the number, `/>` or `>` */
const LOOSE_TAG = new RegExp(String.raw`[<\uFF1C]\s*(\/?)\s*([A-Za-z])\s*(\d+)\s*(\/?)\s*[>\uFF1E]`, 'g')

/** spellings a model writes for a tag, made the plan's: a space after `<` or `</`, capitals, full-width brackets
 *  (U+FF1C, U+FF1E), a letter other than the one sent (read by number) */
export function normalizeTyped(raw: string): string {
  return raw.replace(
    LOOSE_TAG,
    (_m, close: string, letter: string, n: string, self: string) => `<${close}${letter.toLowerCase()}${n}${self}>`,
  )
}

/** a typed tag after normalizeTyped: a close, a void, an open; any letter (the number says the slot) */
const TYPED_TAG = /<(\/?)[a-z](\d+)(\/?)>/g

/** the reply read back: normalised, rewritten to the void spelling, then `readTagged`; null where it cannot be read, or
 *  where its text is under 0.2 of the source's (projection length, for a source of 200 characters or more) */
export function readTyped(unit: UnitIn, raw: string): { content: OutPiece[]; sentences?: Sentences } | null {
  if (typeof raw !== 'string') return null
  const voids = normalizeTyped(raw).replace(TYPED_TAG, (m, close: string, n: string, self: string) =>
    close ? (self ? m : '</t>') : self ? `<x id="${n}"/>` : `<t id="${n}">`,
  )
  const r = readTagged(unit, voids)
  if (!r) return null
  const source = projectionOf(unit.content).length
  if (source >= LENGTH_FROM && projectionOf(r.content).length < LENGTH_FLOOR * source) return null
  return r
}

/** the LLM wire as a codec: what the LLM adapter writes and reads, and its behaviour digest */
export const llmWire: Pick<Translator, 'write' | 'read' | 'digest'> = {
  write: (unit) => writeTyped(unit),
  read: readTyped,
  digest: LLM_WIRE_DIGEST,
}
