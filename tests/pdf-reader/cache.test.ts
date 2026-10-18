// The reader's side of its cache (src/pdf-reader/engine/pipeline/cache.mjs): when a run whose translation none of the ways could
// set may leave the untypeset mark. The mark answers the next visit on its identity alone (pdf-record.ts stillUntypeset),
// so it is written only for a translation that one identity made whole — as a copy is current only when every unit is
// (the final review of Codex 1 on #306)
import { describe, expect, it } from 'vitest'
import { allTranslatedBy, endOf, knownOriginal, labelOf, originalRow, passagesInSource, reusable, seedAgain, seedFrom, sourceHash, unitsOf } from '@/pdf-reader/engine/pipeline/cache.mjs'
import { openPaper, translationFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import { translateUnits } from '@/pdf-reader/engine/translate/mt.mjs'
import { strategiesFor } from '@/pdf-reader/engine/pipeline/scripts.mjs'

/** a run's results as live.mjs keeps them: index → { pieces, state, by, tried } */
const results = (...rows: { by?: string; state?: string; pieces?: boolean }[]) =>
  new Map(rows.map((r, i) => [i, { ...(r.pieces === false ? {} : { pieces: [`t${i}`] }), state: r.state ?? 'whole', ...(r.by !== undefined ? { by: r.by } : {}), tried: 'F' }]))

describe('allTranslatedBy', () => {
  it('holds when every unit the run tried came back whole from the identity', () => {
    expect(allTranslatedBy(results({ by: 'F' }, { by: 'F' }, { by: 'F' }), 'F')).toBe(true)
  })

  // Codex 6: units never translated were passed over and a partial one counted, so a run that a retry could still have
  // completed was marked as one that cannot be typeset, and visits after it on that identity asked nothing
  it.each([
    ['none', { state: 'none', pieces: false }],
    ['lost', { state: 'lost', pieces: false }],
    ['partial', { by: 'F', state: 'partial' }],
  ] as const)('not beside a unit left %s: the run did not make the whole translation, and the next visit asks again', (_, row) => {
    expect(allTranslatedBy(results({ by: 'F' }, { by: 'F' }, row), 'F')).toBe(false)
  })

  it('names kept in the source have no result (live.mjs never sends them): they do not block', () => {
    // a paper of five units, two of them names kept (nameCells): the run's results hold the three it sent
    const run = new Map([[0, { pieces: ['t0'], state: 'whole', by: 'F', tried: 'F' }], [2, { pieces: ['t2'], state: 'whole', by: 'F', tried: 'F' }], [4, { pieces: ['t4'], state: 'whole', by: 'F', tried: 'F' }]])
    expect(allTranslatedBy(run, 'F')).toBe(true)
  })

  it('not for a run a hand-over mixed: the reader\'s service refused midway and the free one finishing — for neither identity', () => {
    const mixed = results({ by: 'A' }, { by: 'A' }, { by: 'F' }, { by: 'F' })
    expect([allTranslatedBy(mixed, 'F'), allTranslatedBy(mixed, 'A')]).toEqual([false, false])
  })

  it('not for a unit whose own pieces came from two identities, nor for a run with nothing translated', () => {
    expect(allTranslatedBy(results({ by: 'F' }, { by: 'mixed' }), 'F')).toBe(false)
    expect(allTranslatedBy(results({ state: 'lost', pieces: false }), 'F')).toBe(false)
    expect(allTranslatedBy(new Map(), 'F')).toBe(false)
  })
})

// Sentence level (B3): a copy keeps each unit's sentences with the translation they belong to, additive and optional —
// a copy made before has none, and its units are lit whole
describe('a unit the final set in the source', () => {
  it('unitsOf: keeps its translation for the next run, and says the final set it in the source (the F2 review\'s M2)', async () => {
    const units = [{ kind: 'author', pieces: [{ t: 'text', s: 'Ada Lovelace' }] }] as never[]
    const [u] = unitsOf(units, new Set(), ['h'], new Map([[0, { pieces: [{ t: 'text', s: 'tr', tr: true }], state: 'whole', by: 'B', tried: 'B', inSource: true }]]))
    expect([u?.state, !!(u as { pieces?: unknown }).pieces, (u as { inSource?: boolean }).inSource]).toEqual(['whole', true, true])
  })

  // Devin and Codex on #309: the mark is the copy's PDF's, and a run that sets no final keeps that PDF — so the mark
  // travels with the translation it was made for, through the seed and the run again's seed, until a final sets it again
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

  it('seedAgain: the last run\'s mark over the copy\'s, and the copy\'s where the last run made nothing of the unit', () => {
    const tr = [{ t: 'text', s: 'tr', tr: true }]
    const copy = new Map<number, unknown>([[0, { pieces: tr, by: 'B', tried: 'B', state: 'whole', inSource: true }], [1, { pieces: tr, by: 'B', tried: 'B', state: 'whole', inSource: true }]])
    const made = new Map<number, unknown>([[0, { pieces: tr, state: 'whole', by: 'C', tried: 'C' }], [2, { pieces: tr, state: 'whole', by: 'C', tried: 'C', inSource: true }]])
    const seed = seedAgain(copy as never, made as never)
    expect(seed.get(0)).not.toHaveProperty('inSource')
    expect(seed.get(1)).toMatchObject({ inSource: true })
    expect(seed.get(2)).toMatchObject({ inSource: true })
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

  it('seedAgain: a run again seeds each unit the last run made with its sentences, over the copy\'s (the final review, m3)', () => {
    const copy = new Map<number, unknown>([[0, { pieces: tr('Alt.'), by: 'g', tried: 'g', state: 'whole', sentences: { src: [1], tr: [1] } }], [2, { pieces: tr('Vier'), by: 'g', tried: 'g', state: 'whole' }]])
    const made = new Map<number, unknown>([
      [0, { pieces: tr('Eins. Zwei.'), state: 'whole', by: 'ms', tried: 'ms', sentences: { src: [5], tr: [6] } }],
      [1, { pieces: tr('Drei.'), state: 'whole', by: 'ms', tried: 'ms' }],
      [2, { state: 'lost', tried: 'ms' }],
    ])
    const seed = seedAgain(copy as never, made as never)
    expect(seed.get(0)).toEqual({ pieces: tr('Eins. Zwei.'), by: 'ms', tried: 'ms', state: 'whole', sentences: { src: [5], tr: [6] } })
    expect(seed.get(1)).not.toHaveProperty('sentences')
    // a unit the last run did not translate keeps the copy's seed
    expect(seed.get(2)).toMatchObject({ pieces: tr('Vier'), by: 'g' })
    expect(seedAgain(null, null).size).toBe(0)
  })
})

// A unit nested in another — a footnote in a paragraph, an author's \thanks — is set where the outer unit's nested piece
// stands, by that piece's own unit (latex-front.mjs patch). A record keeps a copy of it, by which no translation is
// found: a seeded paragraph set its note in the source, its marks unnamed (\axtmark{undefineds}) — every re-set, and
// 2608.02163's re-set of 2026-10-02 set the authors' notes in English where its first visit set them in Chinese
describe('a seed\'s nested pieces, after the record\'s round trip', () => {
  const zh = async (texts: string[]) => texts.map(text => ({ text: text.replace(/(?<![@a-z])[A-Za-z]{2,}/g, '\u8bba\u6587'), by: 'B' }))
  const seeded = async (src: string) => {
    const paper = openPaper(new Map([['main.tex', new TextEncoder().encode(src)]]))
    const { results } = await translateUnits(paper.units as never, zh, 'markers')
    const made = new Map(paper.units.map((u, i) => [i, { pieces: results.get(u as never)?.pieces, state: 'whole', by: 'B', tried: 'B' }]))
    const record = JSON.parse(JSON.stringify({ units: unitsOf(paper.units, new Set(), await Promise.all(paper.units.map(u => sourceHash(u as never))), made) }))
    const { seed } = await seedFrom(record, paper.units)
    const translated = new Map([...seed].map(([i, s]) => [paper.units[i], s.pieces]))
    const tex = new TextDecoder().decode(translationFiles(paper, translated as never, { strategy: strategiesFor(paper.meta, 'zh')[0] as never, fonts: { rm: 'cmr', sf: 'cmss', tt: 'cmtt', body: 'cmr' } }).get('main.tex'))
    return { paper, seed, tex }
  }

  it('are the unit\'s own again: the note is set translated, with its marks', async () => {
    const { paper, seed, tex } = await seeded('\\documentclass{article}\\begin{document}\nA paragraph with a note\\footnote{The note text is here.} and more words after it.\n\\end{document}\n')
    const para = paper.units.findIndex(u => u.kind === 'para'), note = paper.units.findIndex(u => u.kind === 'footnote')
    const nested = ((seed.get(para)?.pieces ?? []) as { t: string; unit?: unknown }[]).find(p => p.t === 'nested')
    expect(nested?.unit).toBe(paper.units[note])
    expect(tex).toContain(`\\footnote{\\axtlead{${note}}\\leavevmode\\axtmark{${note}s}\u8bba\u6587`)
    expect(tex).not.toContain('The note text')
  })

  it('two notes of the same braces, each its own, wherever the translation moved them', async () => {
    const { paper, seed, tex } = await seeded('\\documentclass{article}\\begin{document}\nFirst words\\footnote{Alpha note here.} then other words\\footnote{Beta note here.} end.\n\\end{document}\n')
    const para = paper.units.findIndex(u => u.kind === 'para')
    const units = ((seed.get(para)?.pieces ?? []) as { t: string; unit?: unknown }[]).filter(p => p.t === 'nested').map(p => paper.units.indexOf(p.unit as never))
    expect(units.sort()).toEqual(paper.units.map((u, i) => (u.kind === 'footnote' ? i : -1)).filter(i => i >= 0).sort())
    expect(tex).not.toMatch(/Alpha|Beta|undefineds/)
  })
})

// A typesetting change never asks the service again (the evaluation's ruling 4, 2026-10-01): a seed is taken as it is
// when it is whole, made by the identity that would answer now, and of the wire the unit is sent as now — this visit's
// last run's, or the copy's when the copy was made by this translation pipeline in this wire format
describe('reusable: the seeds a run takes as they are', () => {
  const seed = () => new Map([
    [0, { pieces: ['a'], state: 'whole', by: 'F', tried: 'F' }],
    [1, { pieces: ['b'], state: 'partial', by: 'F', tried: 'F' }],
    [2, { pieces: ['c'], state: 'whole', by: 'G', tried: 'G' }],
  ])
  const current = (m: Map<number, { current?: boolean }>) => [...m].filter(([, s]) => s.current).map(([i]) => i)
  it('the copy\'s, whole and by the identity now, when its pipeline and wire format are this run\'s', () => {
    expect(current(reusable(seed(), { identity: 'F', copyWire: true }))).toEqual([0])
  })
  it('none of the copy\'s on another pipeline or format: the wire it was sent may not be the one sent now', () => {
    expect(current(reusable(seed(), { identity: 'F', copyWire: false }))).toEqual([])
  })
  it('the visit\'s own last run\'s whatever the copy was: its wire is this run\'s', () => {
    const made = new Map([[2, { pieces: ['c2'], state: 'whole', by: 'F', tried: 'F' }]])
    expect(current(reusable(seedAgain(seed(), made), { identity: 'F', copyWire: false, made }))).toEqual([2])
  })
  it('never one made by another identity: another service, model or prompt is asked', () => {
    expect(current(reusable(seed(), { identity: 'G', copyWire: true }))).toEqual([2])
  })
})

// The marked original's readings, one row per paper version in the store (src/cache/pdf-store.ts `originals`): JSON as
// stored, taken back only under the versions that made them and with the left side's marks (the F2 review's I3)
describe('the original\'s readings as stored', () => {
  const readings = { log: 'AXT-LINES 0 4 12.0pt 10\nAXT-END', cites: '\\bibcite{a}{1}', labels: '\\newlabel{s}{{1}{1}}', bbl: '\\entry{a}{article}{}{}', marks: { pages: 1, width: 612, height: 792, columns: [1], marks: new Map([['0s', { page: 0, x: 72, y: 700 }]]) } }
  const made = { pipeline: '7', typesetting: '1', page: 'cv/eid/tid/ix' }
  const left: [string, unknown][] = [['0s', { word: 'Paragraph' }]]

  it('a row is JSON, and taken back as the readings it was made of, with the left side\'s marks', () => {
    const row = JSON.parse(JSON.stringify(originalRow(readings, left, made)))
    expect(knownOriginal(row, made)).toEqual({ readings, left })
  })

  it('none under another pipeline, typesetting or TeX page, without left marks, or with no row', () => {
    const row = originalRow(readings, left, made)
    for (const now of [{ ...made, pipeline: '8' }, { ...made, typesetting: '2' }, { ...made, page: '1' }]) expect(knownOriginal(row, now)).toBeNull()
    expect(knownOriginal(originalRow(readings, [], made), made)).toBeNull()
    expect(knownOriginal(undefined, made)).toBeNull()
  })
})

// The versions a write labels its record with (the F2 review's M3): "current" claimed only for a final this typesetting
// made, and a copy's PDF kept under the versions that set it
describe('labelOf', () => {
  const now = { pipeline: '7', typesetting: '2' }
  it('a full write: this run\'s versions; no typesetting where a passing failure kept the rule from its final, set again', () => {
    expect(labelOf('full', { ...now, passing: false, cached: undefined })).toEqual({ pipeline: '7', typesetting: '2' })
    expect(labelOf('full', { ...now, passing: true, cached: undefined })).toEqual({ pipeline: '7', typesetting: undefined })
  })
  it('a provenance write: the copy\'s PDF with the copy\'s typesetting, and none on another pipeline, whose units are not these', () => {
    expect(labelOf('provenance', { ...now, passing: false, cached: { pipeline: '7', typesetting: '1' } })).toEqual({ pipeline: '7', typesetting: '1' })
    expect(labelOf('provenance', { ...now, passing: false, cached: { pipeline: '6', typesetting: '2' } })).toBeNull()
    expect(labelOf(null, { ...now, passing: false, cached: { pipeline: '7', typesetting: '2' } })).toBeNull()
  })
})

// How a run that none of the ways could set ends for the reader (plans/2026-10-04-compile-resilience.md, Task 5): with
// nothing of this visit ever shown, the paper cannot be had (S-R-17); with a preview of it on screen and no final, the
// translation is shown in part (S-R-19); with a final or this machine's copy on screen, nothing more is said
describe('endOf: what a run that could not set its final says', () => {
  it('nothing ever shown is S-R-17; a preview and no final is the translation shown in part; a final or a copy, nothing', () => {
    const ex = { exhausted: true, stopped: null }
    expect(endOf(ex, { compiledOnce: false, finalShown: false, cached: false })).toBe('cannot typeset')
    expect(endOf(ex, { compiledOnce: true, finalShown: false, cached: false })).toBe('shown in part')
    expect(endOf(ex, { compiledOnce: true, finalShown: true, cached: false })).toBeNull()
    expect(endOf(ex, { compiledOnce: false, finalShown: false, cached: true })).toBeNull()
    expect(endOf({ exhausted: true, stopped: 'network' }, { compiledOnce: true, finalShown: false, cached: false })).toBeNull()
    expect(endOf({ exhausted: false, stopped: null }, { compiledOnce: true, finalShown: false, cached: false })).toBeNull()
  })
  it('a preview on screen that set the whole translation is no translation shown in part: nothing is said of it (M-2 of 2026-10-04)', () => {
    const visit = { compiledOnce: true, finalShown: false, cached: false }
    expect(endOf({ exhausted: true, stopped: null, shownPartial: false }, visit)).toBeNull()
    expect(endOf({ exhausted: true, stopped: null, shownPartial: true }, visit)).toBe('shown in part')
    // a preview an earlier run of the visit showed: not known whole
    expect(endOf({ exhausted: true, stopped: null, shownPartial: null }, visit)).toBe('shown in part')
  })
})

// The passages a copy holds that its typesetting left in the original (the review of 2026-10-04, I-6): the reader's
// failure note counts them on every visit to the copy, as on the one that made it. A unit is marked set in the source
// for one reason more: the author block under a strategy that sets its names as the paper has them (scripts.mjs
// typesetBy), on purpose — the count leaves the author block out
describe('passagesInSource: what a copy holds in the original that it had translated', () => {
  it("every unit marked set in the source but the author block's", () => {
    expect(passagesInSource([{ kind: 'paragraph', inSource: true }, { kind: 'author', inSource: true }, { kind: 'paragraph' }, { kind: 'caption', inSource: true }, { kind: 'paragraph', state: 'kept' }])).toBe(2)
    expect(passagesInSource([])).toBe(0)
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
    for (const [i, s] of seed) expect(ids(s.pieces)).toEqual(ids((paper.units[i] as { pieces: unknown[] }).pieces))
    // and set as the unit's own: its note by its own unit, translated, in the file as written
    const translated = new Map([...seed].map(([k, s]) => [paper.units[k], s.pieces]))
    const tex = new TextDecoder().decode(translationFiles(paper, translated as never, { strategy: strategiesFor(paper.meta, 'zh')[0] as never, fonts: { rm: 'cmr', sf: 'cmss', tt: 'cmtt', body: 'cmr' } }).get('main.tex'))
    expect(tex).toMatch(/\\textbf\{\s*\u8bba\u6587/)
    expect(tex).not.toMatch(/bold words|italics/)
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
