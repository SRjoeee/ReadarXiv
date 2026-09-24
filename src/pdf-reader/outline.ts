// The contents (the reader's design, §6.3): the paper's own headings, the title left out, as a tree of three levels at
// most, ranked among the depths the paper uses — an article's sections are 1, a thesis's chapters 1 and its sections 2 —
// so that the same rule holds for any paper. A heading with no depth (a copy stored before depths were kept) is at 1
export interface OutlineEntry { id: number; title: string; original: string; level: 1 | 2 | 3; page: number | null }

export function outlineOf(
  headings: { id: number; src: string; depth?: number; title?: boolean }[],
  textOf: (id: number) => string | undefined,
  pageOf: (id: number) => number | null,
): OutlineEntry[] {
  const kept = headings.filter(h => !h.title)
  const depths = [...new Set(kept.map(h => h.depth).filter((d): d is number => d !== undefined))].sort((a, b) => a - b)
  return kept.flatMap(h => {
    const level = h.depth === undefined ? 1 : depths.indexOf(h.depth) + 1
    if (level > 3) return []
    return [{ id: h.id, title: textOf(h.id) ?? h.src, original: h.src, level: level as 1 | 2 | 3, page: pageOf(h.id) }]
  })
}
