// The units record (src/pdf-reader/engine/pipeline/cache.mjs): what a record keeps of each unit (unitsOf) and the seed it gives a
// paper's units (seedFrom, by sourceHash), as the lab's fixtures hold them (lab/pdf/spikes/layer-fixtures.mjs)
import { describe, expect, it } from 'vitest'
import { seedFrom, sourceHash, unitsOf } from '@/pdf-reader/engine/pipeline/cache.mjs'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { translateUnits } from '@/pdf-reader/engine/translate/mt.mjs'

// Sentence level (B3): a copy keeps each unit's sentences with the translation they belong to, additive and optional —
// a copy made before has none, and its units are lit whole
describe('a unit the final set in the source', () => {
  it('unitsOf: keeps its translation for the next run, and says the final set it in the source (the F2 review\'s M2)', async () => {
    const units = [{ kind: 'author', pieces: [{ t: 'text', s: 'Ada Lovelace' }] }] as never[]
    const [u] = unitsOf(units, new Set(), ['h'], new Map([[0, { pieces: [{ t: 'text', s: 'tr', tr: true }], state: 'whole', by: 'B', tried: 'B', inSource: true }]]))
    expect([u?.state, !!(u as { pieces?: unknown }).pieces, (u as { inSource?: boolean }).inSource]).toEqual(['whole', true, true])
  })

  // Devin and Codex on #309: the mark is the copy's PDF's, so it travels with the translation it was made for
  it('seedFrom: the seed carries the mark with the translation it was made for', async () => {
    const units = [{ kind: 'author', pieces: [{ t: 'text', s: 'Ada Lovelace' }] }, { kind: 'para', pieces: [{ t: 'text', s: 'One.' }] }]
    const tr = [{ t: 'text', s: 'tr', tr: true }]
    const record = { units: [
      { kind: 'author', src: 'Ada Lovelace', hash: await sourceHash(units[0] as never), pieces: tr, by: 'B', tried: 'B', state: 'whole', inSource: true },
      { kind: 'para', src: 'One.', hash: await sourceHash(units[1] as never), pieces: tr, by: 'B', tried: 'B', state: 'whole' },
    ] }
    const { seed } = await seedFrom(record as never, units as never)
    expect(seed.get(0)).toMatchObject({ inSource: true })
    expect(seed.get(1)).not.toHaveProperty('inSource')
  })

})

describe('the record keeps the sentences of the translation it keeps', () => {
  const units = [{ kind: 'para', pieces: [{ t: 'text', s: 'One. Two.' }] }, { kind: 'para', pieces: [{ t: 'text', s: 'Three.' }] }, { kind: 'heading', pieces: [{ t: 'text', s: 'Four' }] }]
  const tr = (s: string) => [{ t: 'text', tr: true, s }]

  it('unitsOf: a result\'s sentences with its pieces; none where the result has none, or no pieces', () => {
    const results = new Map<number, unknown>([
      [0, { pieces: tr('Eins. Zwei.'), state: 'whole', by: 'ms', tried: 'ms', sentences: { src: [5], tr: [6] } }],
      [1, { pieces: tr('Drei.'), state: 'whole', by: 'ms', tried: 'ms' }],
      [2, { state: 'lost', tried: 'ms', sentences: { src: [], tr: [] } }],
    ])
    const out = unitsOf(units as never, new Set(), ['a', 'b', 'c'], results)
    expect(out[0]).toMatchObject({ tr: 'Eins. Zwei.', sentences: { src: [5], tr: [6] } })
    expect(out[1]).not.toHaveProperty('sentences')
    expect(out[2]).not.toHaveProperty('sentences')
  })

  it('seedFrom: a seed carries the sentences of the translation it seeds; a copy made before carries none', async () => {
    const record = { units: [
      { kind: 'para', src: 'One. Two.', hash: await sourceHash(units[0] as never), pieces: tr('Eins. Zwei.'), by: 'ms', tried: 'ms', state: 'whole', sentences: { src: [5], tr: [6] } },
      { kind: 'para', src: 'Three.', hash: await sourceHash(units[1] as never), pieces: tr('Drei.'), by: 'ms', tried: 'ms', state: 'whole' },
    ] }
    const { seed } = await seedFrom(record as never, units as never)
    expect(seed.get(0)).toMatchObject({ sentences: { src: [5], tr: [6] } })
    expect(seed.get(1)).not.toHaveProperty('sentences')
  })

})

// A unit nested in another — a footnote in a paragraph, an author's \thanks — stands where the outer unit's nested piece
// stands, by that piece's own unit (latex-front.mjs patch). A record keeps a copy of it, by which no translation is
// found: a seeded paragraph's note was the record's copy, not the paper's unit (2608.02163's re-set of 2026-10-02)
describe('a seed\'s nested pieces, after the record\'s round trip', () => {
  const zh = async (texts: string[]) => texts.map(text => ({ text: text.replace(/(?<![@a-z])[A-Za-z]{2,}/g, '\u8bba\u6587'), by: 'B' }))
  const seeded = async (src: string) => {
    const paper = openPaper(new Map([['main.tex', new TextEncoder().encode(src)]]))
    const { results } = await translateUnits(paper.units as never, zh, 'markers')
    const made = new Map(paper.units.map((u, i) => [i, { pieces: results.get(u as never)?.pieces, state: 'whole', by: 'B', tried: 'B' }]))
    const record = JSON.parse(JSON.stringify({ units: unitsOf(paper.units, new Set(), await Promise.all(paper.units.map(u => sourceHash(u as never))), made) }))
    const { seed } = await seedFrom(record, paper.units)
    return { paper, seed }
  }

  it('are the unit\'s own again', async () => {
    const { paper, seed } = await seeded('\\documentclass{article}\\begin{document}\nA paragraph with a note\\footnote{The note text is here.} and more words after it.\n\\end{document}\n')
    const para = paper.units.findIndex(u => u.kind === 'para'), note = paper.units.findIndex(u => u.kind === 'footnote')
    const nested = ((seed.get(para)?.pieces ?? []) as { t: string; unit?: unknown }[]).find(p => p.t === 'nested')
    expect(nested?.unit).toBe(paper.units[note])
  })

  it('two notes of the same braces, each its own, wherever the translation moved them', async () => {
    const { paper, seed } = await seeded('\\documentclass{article}\\begin{document}\nFirst words\\footnote{Alpha note here.} then other words\\footnote{Beta note here.} end.\n\\end{document}\n')
    const para = paper.units.findIndex(u => u.kind === 'para')
    const units = ((seed.get(para)?.pieces ?? []) as { t: string; unit?: unknown }[]).filter(p => p.t === 'nested').map(p => paper.units.indexOf(p.unit as never))
    expect(units.sort()).toEqual(paper.units.map((u, i) => (u.kind === 'footnote' ? i : -1)).filter(i => i >= 0).sort())
  })
})

// A pair's id is its place among its file's pairs: a pair the front end makes earlier in the file (a front matter's
// unit, an argument it now reads as text) numbers every pair after it anew, and the units' hashes change with them —
// 1,471 units of the corpus's 117 papers in the front end's round of 2026-10-06 — though their sources are the same
describe('a copy\'s translation of a unit whose pairs are numbered anew', () => {
  const zh = async (texts: string[]) => texts.map(text => ({ text: text.replace(/(?<![@a-z])[A-Za-z]{2,}/g, '\u8bba\u6587'), by: 'B' }))
  type P = { t: string; id?: number; unit?: { pieces: P[] } }
  /** the pieces numbered as an earlier front end numbered them: every pair `by` further on, a nested unit's too */
  const shifted = (pieces: P[], by: number): P[] => pieces.map(p => (p.t === 'open' || p.t === 'close' ? { ...p, id: (p.id ?? 0) + by } : p.t === 'nested' && p.unit ? { ...p, unit: { ...p.unit, pieces: shifted(p.unit.pieces, by) } } : p))
  const SRC = '\\documentclass{article}\n\\begin{document}\nA paragraph with \\textbf{bold words} and \\emph{a stress}, and a note\\footnote{A note with \\textit{italics}.} after it.\n\n{\\bf Another} paragraph.\n\\end{document}\n'
  /** the paper, and a copy of it made by a front end that numbered its pairs `by` further on, translated */
  const copyOf = async (by: number, change = (s: string) => s) => {
    const paper = openPaper(new Map([['main.tex', new TextEncoder().encode(change(SRC))]]))
    const earlier = openPaper(new Map([['main.tex', new TextEncoder().encode(SRC)]]))
    const { results } = await translateUnits(earlier.units as never, zh, 'markers')
    const old = earlier.units.map(u => ({ ...u, pieces: shifted((u as { pieces: P[] }).pieces, by) }))
    const made = new Map(earlier.units.map((u, i) => [i, { pieces: shifted((results.get(u as never)?.pieces ?? []) as P[], by), state: 'whole', by: 'B', tried: 'B' }]))
    const record = JSON.parse(JSON.stringify({ units: unitsOf(old as never, new Set(), await Promise.all(old.map(u => sourceHash(u as never))), made) }))
    return { paper, record }
  }
  const ids = (pieces: unknown[]): (number | undefined)[] => (pieces as P[]).flatMap(p => (p.t === 'open' ? [p.id] : p.t === 'nested' ? ids(p.unit?.pieces ?? []) : []))
  it('is the unit\'s: matched by its pieces numbered as the copy\'s were, its pairs numbered as the unit\'s are, a nested note\'s too', async () => {
    const { paper, record } = await copyOf(5)
    const { seed } = await seedFrom(record, paper.units)
    expect(seed.size).toBe(paper.units.length)
    // (a bold word inside its sentence comes back with its pair after the translation, mt.mjs planOf: the ids as a set)
    const sorted = (xs: (number | undefined)[]) => [...xs].sort((a, b) => (a ?? 0) - (b ?? 0))
    for (const [i, s] of seed) expect(sorted(ids(s.pieces))).toEqual(sorted(ids((paper.units[i] as { pieces: unknown[] }).pieces)))
  })
  it('a cell that closes a group an earlier cell opened: the close numbered with the pairs (2608.16745\'s tables)', async () => {
    const unit = { kind: 'cell', pieces: [{ t: 'open', id: 18, src: '\\textbf{' }, { t: 'text', s: 'Style' }, { t: 'close', id: 18, src: '}' }, { t: 'close', id: 16, src: '}' }] }
    const old = { ...unit, pieces: shifted(unit.pieces, 44) }
    const record = { units: [{ kind: 'cell', src: 'Style', hash: await sourceHash(old as never), pieces: shifted(unit.pieces, 44).map(p => (p.t === 'text' ? { ...p, tr: true } : p)), by: 'B', tried: 'B', state: 'whole' }] }
    const { seed } = await seedFrom(record as never, [unit] as never)
    expect((seed.get(0)?.pieces as P[] | undefined)?.map(p => p.id ?? null)).toEqual([18, null, 18, 16])
  })
  it('not a unit whose source differs but in its text: its pieces numbered as the copy\'s do not hash to the copy\'s hash', async () => {
    const { paper, record } = await copyOf(5, s => s.replace('\\emph{a stress}', '\\textsc{a stress}'))
    const { seed } = await seedFrom(record, paper.units)
    // the note (its own unit) and the last paragraph keep theirs; the paragraph whose pair is another command has none
    expect(seed.size).toBe(paper.units.length - 1)
  })
})
