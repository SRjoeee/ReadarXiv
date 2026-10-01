// The reader's side of its cache (src/pdf-reader/engine/cache.mjs): when a run whose translation none of the ways could
// set may leave the untypeset mark. The mark answers the next visit on its identity alone (pdf-record.ts stillUntypeset),
// so it is written only for a translation that one identity made whole — as a copy is current only when every unit is
// (the final review of Codex 1 on #306)
import { describe, expect, it } from 'vitest'
import { allTranslatedBy, knownOriginal, originalRow, reusable, seedAgain, seedFrom, sourceHash, unitsOf } from '@/pdf-reader/engine/cache.mjs'

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
  const readings = { log: 'AXT-LINES 0 4 12.0pt 10\nAXT-END', cites: '\\bibcite{a}{1}', marks: { pages: 1, width: 612, height: 792, columns: [1], marks: new Map([['0s', { page: 0, x: 72, y: 700 }]]) } }
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
