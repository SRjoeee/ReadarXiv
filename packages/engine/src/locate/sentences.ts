// Phase 7 of locate (PHASES, locate.ts): where a sentence may begin on A, for a unit lit by sentence (words.ts).
// Reads: the index; the record's `members` (their lines and elements, phase 6's), `units`, `born` (phase 5's).
// Writes: the members' words.
import { sourceText } from './facts.ts'
import { bySentence, elementsOf, wordsOn } from './words.ts'
import { field, standsOn, type Work } from './work.ts'

export function sentenceStarts(w: Work): void {
  const { gA } = w.ix
  const { members, units } = w
  const born = field(w, 'born')
  // ---- where a sentence may begin: each word of a running unit's projection at its first glyph on A (words.ts), a unit drawn
  // with its own row (no echo of another's, no kept block, no babel name's occurrence, no figure text)
  for (const mem of members) {
    const unit = mem.unit >= 0 ? units[mem.unit] : undefined
    const content = unit ? unit.content : born.get(mem.ord)?.content
    if (!content || !mem.located || !mem.lines.length || mem.fixed || mem.figure || mem.dir || mem.name !== undefined)
      continue
    if (unit?.echo !== undefined || unit?.kept || !bySentence(mem.kind, !!unit?.figure)) continue
    const lineOf = new Map<number, number>()
    mem.lineGlyphs.forEach((gs, j) => {
      for (const a of gs) lineOf.set(a, j)
    })
    const text = [...mem.text].sort((x, y) => x - y)
    const words = wordsOn(content, text.map(gA), (i) => lineOf.get(text[i] as number) ?? -1, sourceText(content))
    // (an element a sentence may begin with, where a row's start falls on it (its translator set it first in its sentence:
    // "\method{} trains …", "\citet{x} proposes …"), placed at its ink's first box on A, its line and x0, as a word is; never a
    // display (a block of its own) nor an element TeX set outside the unit's text (kept where it stands). Words alone, the left
    // pane lit it with the sentence before, the start moved on past it: 556 of 2,148 starts of staging's rows, 2026-11-10)
    const els = new Map(mem.elements)
    for (const [o, id] of elementsOf(content)) {
      const el = els.get(id)
      const k = el?.ink[0]
      if (!el || !k || el.kind === 'display' || el.keep) continue
      const j = standsOn(mem.lines, k[0], k[2], k[4], k[5])
      if (j >= 0) words.push([o, j, k[1]])
    }
    words.sort((a, b) => a[0] - b[0])
    if (words.length) mem.words = words
  }
}
