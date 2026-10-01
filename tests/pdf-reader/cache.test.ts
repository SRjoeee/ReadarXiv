// The reader's side of its cache (src/pdf-reader/engine/cache.mjs): when a run whose translation none of the ways could
// set may leave the untypeset mark. The mark answers the next visit on its identity alone (pdf-record.ts stillUntypeset),
// so it is written only for a translation that one identity made whole — as a copy is current only when every unit is
// (the final review of Codex 1 on #306)
import { describe, expect, it } from 'vitest'
import { allTranslatedBy, seedFrom, sourceHash, unitsOf } from '@/pdf-reader/engine/cache.mjs'

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
      [0, { pieces: tr('一。二。'), state: 'whole', by: 'ms', tried: 'ms', sentences: { src: [5], tr: [2] } }],
      [1, { pieces: tr('三。'), state: 'whole', by: 'ms', tried: 'ms' }],
      [2, { state: 'lost', tried: 'ms', sentences: { src: [], tr: [] } }],
    ])
    const out = unitsOf(units as never, new Set(), ['a', 'b', 'c'], results)
    expect(out[0]).toMatchObject({ tr: '一。二。', sentences: { src: [5], tr: [2] } })
    expect(out[1]).not.toHaveProperty('sentences')
    expect(out[2]).not.toHaveProperty('sentences')
  })

  it('seedFrom: a seed carries the sentences of the translation it seeds; a copy made before carries none', async () => {
    const record = { units: [
      { kind: 'para', src: 'One. Two.', hash: await sourceHash(units[0] as never), pieces: tr('一。二。'), by: 'ms', tried: 'ms', state: 'whole', sentences: { src: [5], tr: [2] } },
      { kind: 'para', src: 'Three.', hash: await sourceHash(units[1] as never), pieces: tr('三。'), by: 'ms', tried: 'ms', state: 'whole' },
    ] }
    const { seed } = await seedFrom(record as never, units as never)
    expect(seed.get(0)).toMatchObject({ sentences: { src: [5], tr: [2] } })
    expect(seed.get(1)).not.toHaveProperty('sentences')
  })
})
