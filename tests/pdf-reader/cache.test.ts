// The reader's side of its cache (src/pdf-reader/engine/cache.mjs): when a run whose translation none of the ways could
// set may leave the untypeset mark. The mark answers the next visit on its identity alone (pdf-record.ts stillUntypeset),
// so it is written only for a translation that one identity made whole — as a copy is current only when every unit is
// (the final review of Codex 1 on #306)
import { describe, expect, it } from 'vitest'
import { allTranslatedBy } from '@/pdf-reader/engine/cache.mjs'

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
