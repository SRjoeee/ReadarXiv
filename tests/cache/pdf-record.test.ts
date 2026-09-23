import { describe, expect, it } from 'vitest'
import { MIXED, atLeastAsGood, isCurrent, unitIsCurrent, type CachedUnit, type PdfRecordBody } from '@/cache/pdf-record'

const now = { identity: 'B', pipeline: '2' }
const unit = (u: Partial<CachedUnit>): CachedUnit => ({ kind: 'para', src: 's', hash: 'h', state: 'whole', by: 'B', tried: 'B', ...u })
const record = (units: CachedUnit[], extra: Partial<PdfRecordBody> = {}): PdfRecordBody => ({ digest: 'd', lang: 'zh-CN', paper: 'p', engine: 'e', format: 'tags', pipeline: '2', context: {}, units, marks: [['1s', {}]], figures: [], ...extra })

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
})

describe('isCurrent', () => {
  it('needs the current pipeline and every unit to translate current; kept names do not count', () => {
    expect(isCurrent(record([unit({}), unit({ state: 'kept', by: undefined, tried: undefined })]), now)).toBe(true)
    expect(isCurrent(record([unit({})], { pipeline: '1' }), now)).toBe(false)
    expect(isCurrent(record([unit({}), unit({ by: 'A' })]), now)).toBe(false)
  })
})

describe('atLeastAsGood', () => {
  const current = record([unit({}), unit({})])
  it('the current pipeline first', () => {
    expect(atLeastAsGood(record([unit({})], { pipeline: '1' }), current, now)).toBe(false)
    expect(atLeastAsGood(current, record([unit({}), unit({})], { pipeline: '1' }), now)).toBe(true)
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
  it('kept names are not counted', () => {
    const withKept = record([...current.units, unit({ state: 'kept', by: undefined, tried: undefined })])
    expect(atLeastAsGood(withKept, current, now)).toBe(true)
    expect(atLeastAsGood(current, withKept, now)).toBe(true)
  })
})
