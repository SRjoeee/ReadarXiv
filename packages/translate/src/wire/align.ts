// Sentence lengths an engine reports (Microsoft's `sentLen`) or a reading finds (boundary markers), checked and nudged:
// accepted only if they partition both texts exactly; each boundary a character or two off its sentence's end is moved
// onto it, within SNAP_WINDOW, all or nothing per side (the extension's alignment.ts, measured over 483 alignments, 3,532
// boundaries: 2 moved, both onto the end they missed, none that was right).
import { ABBR, TERMINAL_ABBR } from '@readarxiv/text'

export const SNAP_WINDOW = 3
const SENTENCE_END = /[.!?。！？…]["'”」』）)\]]*$/
const TERMINATOR = /[.!?。！？…”」』）)\]]/
const CONTINUATION = /^[a-z0-9([]/

/** a partition's inner cuts, in order */
export const cutsOf = (lengths: readonly number[]): number[] => {
  const out: number[] = []
  let at = 0
  for (const n of lengths.slice(0, -1)) {
    at += n
    out.push(at)
  }
  return out
}

/** whether `lengths` partition a text of `length`: positive whole numbers that sum to it */
export const partitions = (lengths: unknown, length: number): lengths is number[] =>
  Array.isArray(lengths) &&
  lengths.length > 0 &&
  lengths.every((n) => Number.isInteger(n) && n > 0) &&
  (lengths as number[]).reduce((a, b) => a + b, 0) === length

/**
 * One side's cuts moved onto a sentence end each missed by a character or two (`filler`: what stands between text and
 * its punctuation and stands for nothing, a wire's markers and white space). All or nothing: a cut with a candidate on
 * both sides at one distance, or a result that does not rise or leaves a sentence with nothing to see, keeps the side as
 * it was
 */
export function snap(cuts: readonly number[], text: string, filler: RegExp): number[] {
  const trailing = new RegExp(`(?:${filler.source})+$`)
  const leading = new RegExp(`^(?:${filler.source})+`)
  const settled = (at: number) => SENTENCE_END.test(text.slice(0, at).replace(trailing, ''))
  const snappable = (at: number) => {
    const before = text.slice(0, at).replace(/\s+$/, '')
    if (!SENTENCE_END.test(before)) return false
    if (CONTINUATION.test(text.slice(at).replace(leading, ''))) return false
    return !ABBR.test(before) || TERMINAL_ABBR.test(before)
  }
  const walk = (at: number) => {
    let end = at
    while (end + 1 < text.length && TERMINATOR.test(text[end] ?? '') && settled(end + 1)) end++
    return end
  }
  const moved = cuts.map((cut) => {
    if (settled(cut)) return walk(cut)
    for (let step = 1; step <= SNAP_WINDOW; step++) {
      const back = cut - step > 0 && snappable(cut - step) ? cut - step : undefined
      const forward = cut + step < text.length && snappable(cut + step) ? cut + step : undefined
      if (back !== undefined && forward !== undefined) return undefined
      if (back !== undefined) return walk(back)
      if (forward !== undefined) return walk(forward)
    }
    return cut
  })
  const visible = (s: string) => s.replace(new RegExp(filler.source, 'g'), '').trim().length > 0
  const ok = moved.every((cut, i) => {
    if (cut === undefined) return false
    const low = moved[i - 1] ?? 0
    const high = moved[i + 1] ?? text.length
    return cut > low && cut < high && visible(text.slice(low, cut)) && visible(text.slice(cut, high))
  })
  return ok ? (moved as number[]) : [...cuts]
}

/** a cut out of the atom it falls inside (a marker, a tag, an entity): to the atom's end */
export function outOfAtoms(cut: number, text: string, atoms: RegExp): number {
  for (const m of text.matchAll(new RegExp(atoms.source, 'g'))) {
    const a = m.index ?? 0
    const b = a + m[0].length
    if (cut > a && cut < b) return b
    if (a >= cut) break
  }
  return cut
}
