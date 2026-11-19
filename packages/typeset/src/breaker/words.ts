// B.words: where the words of the target's text end, by the platform's own word segmentation (Unicode's word boundaries,
// UAX #29, as the runtime's ICU gives them: Intl.Segmenter of the target's language, granularity 'word'), for a table cell set
// on several lines whose text the lay wraps over the cell's lines itself (lay/adapt.ts; docs/PDF-READER.md §18.75): its lines
// break between words, never inside one, at each size where a break between words fits; the size never gives way to whole
// words (fit/walk.ts triesOf: where none fits at a size, that size is laid with a word cut where a line must end, `split`).
// No list of words, characters or languages of ours, no threshold: the breaker's own break opportunities that fall where the
// platform ends a word. The segments are the runtime's ICU data's, so two runtimes may differ on a rare word.
import type { Token } from './tokens.ts'

/** each target's word segmenter, made once a tag */
const made = new Map<string, Intl.Segmenter>()

/**
 * The target's word segmenter, or null where the platform has none: runtime feature detection, the typesetter being handed no
 * segmenter by its host. Its null side is a platform below every host's floor (the reader's legacy build requires
 * Intl.Segmenter, packages/reader/src/pdfjs/builds.ts legacyRuns, as the website's floor does; the breaker makes a grapheme one
 * at load, script.ts): there a merged cell is filled as before
 */
export function wordSegmenter(tag: string): Intl.Segmenter | null {
  const S = (globalThis as { Intl?: { Segmenter?: typeof Intl.Segmenter } }).Intl?.Segmenter
  if (typeof S !== 'function') return null
  let seg = made.get(tag)
  if (!seg) {
    seg = new S(tag, { granularity: 'word' })
    made.set(tag, seg)
  }
  return seg
}

/** a token of the target's text, which the segmentation reads: a run of one face or a space, no element's (a crop, a text an
 *  element draws: `ph`), no label's, no control token */
const ofText = (t: Token): boolean =>
  !!t.space || (typeof t.s === 'string' && t.s !== '' && t.crop === undefined && t.ph === undefined && !t.label)

/**
 * The tokens with their words stated: each stretch of the target's text between two elements, a styled group's edge or the
 * label (consecutive tokens of text and spaces in one style, `st`) segmented as one text; a token (a space too) whose start
 * stands inside a word is `midWord`, no line of the fill ending before it; each text token's word ends inside it are
 * `wordEnds` (UTF-16 offsets into its text), the only places the breaker may cut it (break.ts, FitParams.words). A break at an
 * element's or a group's edge is the tokens' own, their glue as before. Nothing else of a token changes, nothing is measured
 * again; a fill that sets the cell at none of its states lays these tokens as before (lay/member.ts)
 */
export function wordsOf<T extends Token[]>(tokens: T, seg: Intl.Segmenter): T {
  const out = tokens.slice() as T
  for (let q = 0; q < out.length; ) {
    if (!ofText(out[q]!)) {
      q++
      continue
    }
    const st = out[q]!.st
    let z = q + 1
    while (z < out.length && ofText(out[z]!) && out[z]!.st === st) z++
    const texts = out.slice(q, z).map((t) => (t.space ? ' ' : (t.s as string)))
    const text = texts.join('')
    const ends = new Set<number>([text.length])
    for (const x of seg.segment(text)) ends.add(x.index)
    let at = 0
    for (let k = q; k < z; k++) {
      const n = texts[k - q]!.length
      const t: Token = { ...out[k]! }
      if (k > q && !ends.has(at)) t.midWord = true
      if (!t.space) t.wordEnds = [...ends].filter((e) => e > at && e < at + n).map((e) => e - at)
      out[k] = t
      at += n
    }
    q = z
  }
  return Object.assign(out, { base: (tokens as { base?: unknown }).base })
}
