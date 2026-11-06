// A capsule's words in parts (the reader's design, §6.6): what comes before a count, the count, a part drawn in another
// language than the interface's (a language's own name, #313), and what follows. The capsule draws each part in a cell
// of its own, so that a count changes in place (capsule-motion.ts), and tells a screen reader the words whole. Nothing
// here knows a language: a sentence is split where its count or its part stands in it, whatever its length or script
// (the maintainer plans more interface languages after launch)

export interface CapsuleWords { prefix: string; count?: number; part?: { text: string; lang: string }; suffix?: string }

/**
 * The words in their one form: a sentence that holds neither a count nor a part is its one string, and one that holds
 * either has its suffix, empty if need be. Words that draw the same are equal, however they were split
 */
function canonical(w: CapsuleWords): CapsuleWords {
  if (w.count === undefined && w.part === undefined) return { prefix: w.prefix + (w.suffix ?? '') }
  return {
    prefix: w.prefix,
    ...(w.count !== undefined && { count: w.count }),
    ...(w.part !== undefined && { part: { text: w.part.text, lang: w.part.lang } }),
    suffix: w.suffix ?? '',
  }
}

const key = (w: CapsuleWords) => [w.prefix, w.count ?? '', w.part ? `${w.part.lang}\u0001${w.part.text}` : '', w.suffix ?? ''].join('\u0000')
export const keyOf = (w: CapsuleWords): string => key(canonical(w))

/** how many words are kept interned: a capsule holds one set, the run's count goes up one set at a time */
const KEPT = 64
const interned = new Map<string, CapsuleWords>()

/** interned: equal words are one object (64 kept), so that useReader's member-by-member compare holds still */
export function words(w: CapsuleWords): CapsuleWords {
  const one = canonical(w), k = key(one)
  const known = interned.get(k)
  // the latest used kept last, so that the oldest goes first
  interned.delete(k)
  const kept = known ?? Object.freeze(one.part ? { ...one, part: Object.freeze(one.part) } : one)
  interned.set(k, kept)
  if (interned.size > KEPT) interned.delete(interned.keys().next().value as string)
  return kept
}

export const plain = (text: string): CapsuleWords => words({ prefix: text })

/** `text` split around `count` as written in it: the first place its digits stand as a number of their own (the 6 of
 *  "6 of 86", never the one inside 86). A count written otherwise (grouped, in other digits) leaves the text whole */
export function withCount(text: string, count: number): CapsuleWords {
  const digits = String(count)
  for (let at = text.indexOf(digits); at >= 0; at = text.indexOf(digits, at + 1)) {
    const end = at + digits.length
    if (/\d/.test(text[at - 1] ?? '') || /\d/.test(text[end] ?? '')) continue
    return words({ prefix: text.slice(0, at), count, suffix: text.slice(end) })
  }
  return plain(text)
}

/** `text` split around `part.text`, which is drawn in `part.lang`; where it first stands. A text without it is whole */
export function withPart(text: string, part: { text: string; lang: string }): CapsuleWords {
  const at = part.text ? text.indexOf(part.text) : -1
  return at < 0 ? plain(text) : words({ prefix: text.slice(0, at), part, suffix: text.slice(at + part.text.length) })
}

/** the words whole, in the order they are drawn: before, the count, the part, after */
export const textOf = (w: CapsuleWords): string => `${w.prefix}${w.count ?? ''}${w.part?.text ?? ''}${w.suffix ?? ''}`

/** the same words but for the count: both hold one, and every other part is the same */
export const sameShape = (a: CapsuleWords, b: CapsuleWords): boolean =>
  a.count !== undefined && b.count !== undefined && a.prefix === b.prefix && (a.suffix ?? '') === (b.suffix ?? '') && a.part?.text === b.part?.text && a.part?.lang === b.part?.lang
