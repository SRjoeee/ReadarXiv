// The LLM wire: the tags plan written in typed tags, read back by number, tolerantly. Replies here are German (written for
// these tests, no model's reply quoted).
import { describe, expect, it } from 'vitest'
import { accept } from '../../src/accept.ts'
import { readTagged } from '../../src/adapters/google.ts'
import { LLM_WIRE_DIGEST, normalizeTyped, readTyped, writeTyped } from '../../src/adapters/llm-wire.ts'
import { goldenOf } from '../../src/testing/golden.ts'
import { planTags } from '../../src/wire/tags.ts'
import { DIGESTS } from '../digests.ts'
import { el, span, t, unit } from '../pieces.ts'
import { LLM_REPLIES, TAGS_UNITS } from './fixtures.ts'

const FW_OPEN = String.fromCharCode(0xff1c)
const FW_CLOSE = String.fromCharCode(0xff1e)

describe('writeTyped', () => {
  it('an element by its kind’s letter and its slot, a span with text as a pair `s`', () => {
    const u = unit('u', [t('see '), el('1', 'math'), t(' and '), span('2', 'italic', [t('this')])])
    expect(writeTyped(u)).toMatch(/^see <m\d+\/> and <s\d+>this<\/s\d+>$/)
  })
  it('each kind its letter; a kind no letter names `x`', () => {
    const first = (kind: string) => writeTyped(unit('u', [t('a '), el('e', kind), t(' b')])).slice(2, 4)
    expect(first('cite')).toBe('<c')
    expect(first('ref')).toBe('<r')
    expect(first('eqref')).toBe('<r')
    expect(first('note-mark')).toBe('<f')
    expect(first('url')).toBe('<u')
    expect(first('display')).toBe('<d')
    expect(first('other')).toBe('<x')
    expect(first('code')).toBe('<x')
  })
  it('a boundary marker is `x`; nested pairs close by their own numbers', () => {
    expect(writeTyped(TAGS_UNITS[0] as never)).toBe('We study the problem. <x1/>It is hard.')
    expect(writeTyped(TAGS_UNITS[2] as never)).toBe('<s1>Bold words</s1> and <s2>a link <s3>inside</s3></s2> end.')
  })
})

describe('readTyped', () => {
  it('round trip: every tags fixture unit reads back as the tags wire reads its own', () => {
    for (const [i, u] of TAGS_UNITS.entries())
      expect(readTyped(u, writeTyped(u)), `unit ${i}`).toEqual(readTagged(u, planTags(u).wire))
  })

  const u = unit('u', [
    t('As shown in '),
    el('a', 'cite'),
    t(', the '),
    span('b', 'italic', [t('model')]),
    t(' works.'),
  ])
  const taken = (raw: string) => {
    const r = readTyped(u, raw)
    return r !== null && accept(u, r.content).ok
  }
  it('the sent form', () => {
    expect(writeTyped(u)).toBe('As shown in <c1/>, the <s2>model</s2> works.')
    expect(taken('Wie in <c1/> gezeigt, funktioniert das <s2>Modell</s2>.')).toBe(true)
  })
  it('tolerance: the probe’s spellings read as the sent tags', () => {
    const plain = readTyped(u, 'Wie in <c1/> gezeigt, funktioniert das <s2>Modell</s2>.')
    for (const raw of [
      'Wie in < c1/> gezeigt, funktioniert das <s2>Modell</ s2>.',
      'Wie in <C1/> gezeigt, funktioniert das <S2>Modell</S2>.',
      `Wie in ${FW_OPEN}c1/${FW_CLOSE} gezeigt, funktioniert das <s2>Modell</s2>.`,
      'Wie in <c1 /> gezeigt, funktioniert das <s2>Modell</s2>.',
      'Wie in <x1/> gezeigt, funktioniert das <s2>Modell</s2>.',
    ])
      expect(readTyped(u, raw), raw).toEqual(plain)
    expect(normalizeTyped('< m1/> and </ s2> and <M1/>')).toBe('<m1/> and </s2> and <m1/>')
  })
  it('a number not sent, or a tag written twice, is unread', () => {
    expect(readTyped(u, 'Wie in <c3/> gezeigt, funktioniert das <s2>Modell</s2>.')).toBeNull()
    expect(readTyped(u, 'Wie in <c1/><c1/> gezeigt, funktioniert das <s2>Modell</s2>.')).toBeNull()
  })
  it('the length rule: a reply under 0.2 of a source of 200 characters or more is unread', () => {
    const long = unit('long', [t(`${'word '.repeat(79)}end.`)])
    expect(long.content.length === 1 && (long.content[0] as { s: string }).s.length).toBe(399)
    expect(readTyped(long, 'k'.repeat(60))).toBeNull()
    expect(readTyped(long, 'k'.repeat(100))).not.toBeNull()
    // a source under 200 characters is not held to it
    const short = unit('short', [t('word '.repeat(30))])
    expect(readTyped(short, 'k')).not.toBeNull()
  })
  it('the recorded replies read as recorded', () => {
    for (const [k, r] of LLM_REPLIES.entries()) {
      const unitOf = TAGS_UNITS[r.unit] as (typeof TAGS_UNITS)[number]
      const got = readTyped(unitOf, r.raw)
      expect(got !== null && accept(unitOf, got.content).ok, `reply ${k} (${r.why ?? ''})`).toBe(r.taken)
    }
  })
})

describe('digests', () => {
  it('LLM_WIRE_DIGEST is the golden outputs of writeTyped and readTyped over the tags fixtures', () => {
    const got = goldenOf(
      { write: (u) => writeTyped(u), read: readTyped },
      { target: 'zh-Hans', units: TAGS_UNITS, replies: LLM_REPLIES },
    )
    expect(got).toBe(LLM_WIRE_DIGEST)
    expect(DIGESTS.find((d) => d.name === 'LLM_WIRE_DIGEST')?.literal).toBe(LLM_WIRE_DIGEST)
  })
})
