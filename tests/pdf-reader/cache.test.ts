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
  it('holds when every unit the run has a translation of was made by the identity: a unit lost, with none, does not count', () => {
    expect(allTranslatedBy(results({ by: 'F' }, { by: 'F', state: 'partial' }, { state: 'lost', pieces: false }), 'F')).toBe(true)
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
