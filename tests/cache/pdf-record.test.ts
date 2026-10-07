import { describe, expect, it } from 'vitest'
import { MIXED, atLeastAsGood, isCurrent, stillUntypeset, unitIsCurrent, type CachedUnit, type PdfRecordBody } from '@/cache/pdf-record'

const now = { identity: 'B', pipeline: '2' }
const unit = (u: Partial<CachedUnit>): CachedUnit => ({ kind: 'para', src: 's', hash: 'h', state: 'whole', by: 'B', tried: 'B', ...u })
const record = (units: CachedUnit[], extra: Partial<PdfRecordBody> = {}): PdfRecordBody => ({ digest: 'd', lang: 'zh-CN', paper: 'p', engine: 'e', format: 'tags', pipeline: '2', context: {}, units, marks: [['1s', {}]], rightMarks: [], figures: [], ...extra })

describe('unitIsCurrent', () => {
  it('a whole unit by the identity it was made under; a mixed one never', () => {
    expect(unitIsCurrent(unit({}), 'B')).toBe(true)
    expect(unitIsCurrent(unit({ by: 'A', tried: 'B' }), 'B')).toBe(false)
    expect(unitIsCurrent(unit({ by: MIXED }), 'B')).toBe(false)
  })
  it('a settled unit by the identity it was last tried under, whatever made the translation it keeps', () => {
    expect(unitIsCurrent(unit({ state: 'partial', by: 'A', tried: 'B' }), 'B')).toBe(true)
    expect(unitIsCurrent(unit({ state: 'none', by: undefined, tried: 'B' }), 'B')).toBe(true)
    expect(unitIsCurrent(unit({ state: 'none', tried: 'A' }), 'B')).toBe(false)
  })
  it('a lost unit never', () => expect(unitIsCurrent(unit({ state: 'lost' }), 'B')).toBe(false))
  it("a cell of a table group kept whole by what the translator gave it, apart from its being shown in the source", () => {
    // (Codex's review of PR A: a cell given in part and recorded kept was current as a whole one)
    expect(unitIsCurrent(unit({ state: 'kept', translation: 'whole' }), 'B')).toBe(true)
    expect(unitIsCurrent(unit({ state: 'kept', translation: 'whole', by: 'A' }), 'B')).toBe(false)
    expect(unitIsCurrent(unit({ state: 'kept', translation: 'partial', by: 'B', tried: 'B' }), 'B')).toBe(true)
    expect(unitIsCurrent(unit({ state: 'kept', translation: 'lost' }), 'B')).toBe(false)
  })
})

describe('isCurrent', () => {
  it('needs the current pipeline and every unit to translate current; kept names do not count', () => {
    expect(isCurrent(record([unit({}), unit({ state: 'kept', by: undefined, tried: undefined })]), now)).toBe(true)
    expect(isCurrent(record([unit({})], { pipeline: '1' }), now)).toBe(false)
    expect(isCurrent(record([unit({}), unit({ by: 'A' })]), now)).toBe(false)
    // a kept cell with what the translator gave it counts by that; one of a copy made before kept cells kept it, as before
    expect(isCurrent(record([unit({}), unit({ state: 'kept', translation: 'lost' })]), now)).toBe(false)
    expect(isCurrent(record([unit({}), unit({ state: 'kept' })]), now)).toBe(true)
  })
  it('and the current typesetting: a copy set by another is compiled again — its translation taken as it is (live.mjs)', () => {
    const at = { ...now, typesetting: '2' }
    expect(isCurrent(record([unit({})], { typesetting: '2' }), at)).toBe(true)
    expect(isCurrent(record([unit({})], { typesetting: '1' }), at)).toBe(false)
    expect(isCurrent(record([unit({})]), at)).toBe(false)
  })
})

describe('atLeastAsGood', () => {
  const current = record([unit({}), unit({})])
  it('the current pipeline first', () => {
    expect(atLeastAsGood(record([unit({})], { pipeline: '1' }), current, now)).toBe(false)
    expect(atLeastAsGood(current, record([unit({}), unit({})], { pipeline: '1' }), now)).toBe(true)
  })
  it('then the current typesetting', () => {
    const at = { ...now, typesetting: '2' }
    expect(atLeastAsGood(record(current.units, { typesetting: '1' }), record(current.units, { typesetting: '2' }), at)).toBe(false)
    expect(atLeastAsGood(record([unit({})], { typesetting: '2' }), record(current.units, { typesetting: '1' }), at)).toBe(true)
  })
  it('then more units current', () => expect(atLeastAsGood(record([unit({}), unit({ by: 'A' })]), current, now)).toBe(false))
  it('then more units whole, translation beating the source', () => {
    const settledNone = record([unit({ state: 'none', by: undefined }), unit({ state: 'none', by: undefined })])
    expect(atLeastAsGood(settledNone, current, now)).toBe(false)
    expect(atLeastAsGood(current, settledNone, now)).toBe(true)
  })
  it('then fewer lost, then marks, and a tie goes to the newer', () => {
    const lost = record([unit({}), unit({ state: 'lost' })])
    const lostMore = record([unit({ state: 'lost' }), unit({ state: 'lost' })])
    expect(atLeastAsGood(lostMore, lost, now)).toBe(false)
    expect(atLeastAsGood(record(current.units, { marks: [] }), current, now)).toBe(false)
    expect(atLeastAsGood(record(current.units), current, now)).toBe(true)
  })
  // each of the last tiers alone, every tier before it tied (#299: "lost" above is decided by "whole" first)
  it('with as many units current and whole, more units partly translated', () => {
    // both current (tried under B), neither whole: a partial translation beats the source settled
    const partial = record([unit({ state: 'partial', by: 'A' })])
    const settled = record([unit({ state: 'none', by: undefined })])
    expect(atLeastAsGood(settled, partial, now)).toBe(false)
    expect(atLeastAsGood(partial, settled, now)).toBe(true)
  })
  it('with as many units current, whole and partial, fewer lost', () => {
    // neither current (tried under A), none whole or partial: settled under another identity beats lost
    const triedElsewhere = record([unit({ state: 'none', by: undefined, tried: 'A' })])
    const lost = record([unit({ state: 'lost' })])
    expect(atLeastAsGood(lost, triedElsewhere, now)).toBe(false)
    expect(atLeastAsGood(triedElsewhere, lost, now)).toBe(true)
  })
  it('kept names are not counted', () => {
    const withKept = record([...current.units, unit({ state: 'kept', by: undefined, tried: undefined })])
    expect(atLeastAsGood(withKept, current, now)).toBe(true)
    expect(atLeastAsGood(current, withKept, now)).toBe(true)
  })
})

// A paper none of the ways of typesetting could set is said again without asking the service or the TeX page (the
// maintainer, 2026-09-26) — only when the same service would be asked for the same translation: the failure is the
// translated text's, which another service, model or prompt may not repeat (Codex on #306)
describe('stillUntypeset', () => {
  it('holds under the same pipeline and the same identity', () => expect(stillUntypeset({ pipeline: '2', identity: 'B' }, now)).toBe(true))
  it('not under another identity: another service, model or prompt is asked', () => expect(stillUntypeset({ pipeline: '2', identity: 'A' }, now)).toBe(false))
  it('not under another pipeline: a new one tries once more', () => expect(stillUntypeset({ pipeline: '1', identity: 'B' }, now)).toBe(false))
  it('not under other versions of the TeX page: a page fixed since may set it (the S3a review, I5 d)', () => {
    const at = { ...now, typesetting: '2', page: 'c1/e1/t1/i1' }
    expect(stillUntypeset({ pipeline: '2', identity: 'B', typesetting: '2', page: 'c1/e1/t1/i1' }, at)).toBe(true)
    expect(stillUntypeset({ pipeline: '2', identity: 'B', typesetting: '2', page: 'c1/e2/t1/i1' }, at)).toBe(false)
    expect(stillUntypeset({ pipeline: '2', identity: 'B', typesetting: '2' }, at)).toBe(false)
  })
  it('not under another typesetting: it may set what the last could not', () => {
    const at = { ...now, typesetting: '2' }
    expect(stillUntypeset({ pipeline: '2', identity: 'B', typesetting: '2' }, at)).toBe(true)
    expect(stillUntypeset({ pipeline: '2', identity: 'B', typesetting: '1' }, at)).toBe(false)
    expect(stillUntypeset({ pipeline: '2', identity: 'B' }, at)).toBe(false)
  })
  it('not for a mark written before the identity was kept, nor for none', () => {
    expect(stillUntypeset({ pipeline: '2' }, now)).toBe(false)
    expect(stillUntypeset(undefined, now)).toBe(false)
  })
})
