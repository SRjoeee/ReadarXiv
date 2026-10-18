// The contents (the reader's design, §6.3): the paper's own headings, the title left out, as a tree of three levels at
// most, ranked among the depths the paper uses — an article's sections are 1, a thesis's chapters 1 and its sections 2 —
// so that the same rule holds for any paper. A paragraph heading has no depth and is not in the contents; a copy stored
// before depths were kept has none at all, and lists its headings flat
export interface OutlineEntry { id: number; title: string; original: string; level: 1 | 2 | 3; page: number | null }
type Heading = { id: number; src: string; depth?: number; title?: boolean }

/** the three depths a paper's contents show: the smallest it uses */
const depthsOf = (headings: Heading[]) => [...new Set(headings.map(h => h.depth).filter((d): d is number => d !== undefined))].sort((a, b) => a - b).slice(0, 3)

/** the headings the contents list, and among which the heading being read is found: the title left out; once any has a
 *  depth, those with none (a \paragraph, which at level 1 took the subsections after it as its own: the final review)
 *  and those below the third depth used */
export function contentsOf<H extends Heading>(headings: H[]): H[] {
  const kept = headings.filter(h => !h.title)
  const depths = depthsOf(kept)
  return depths.length ? kept.filter(h => h.depth !== undefined && depths.includes(h.depth)) : kept
}

export function outlineOf(
  headings: Heading[],
  textOf: (id: number) => string | undefined,
  pageOf: (id: number) => number | null,
): OutlineEntry[] {
  const kept = contentsOf(headings), depths = depthsOf(kept)
  return kept.map(h => ({ id: h.id, title: textOf(h.id) ?? h.src, original: h.src, level: (h.depth === undefined ? 1 : depths.indexOf(h.depth) + 1) as 1 | 2 | 3, page: pageOf(h.id) }))
}
