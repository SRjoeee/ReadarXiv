import { describe, expect, it } from 'vitest'
import { ACCEPT_DIGEST, accept, asOut, hasLetter, plainLength, projectionOf, validSentences } from '../src/accept.ts'
import type { OutPiece, UnitIn } from '../src/contract.ts'
import { sha256Hex } from '../src/sha256.ts'
import { el, span, t, unit } from './pieces.ts'

const u = unit('u', [
  t('We fix '),
  el('m1', 'math'),
  t(' and '),
  span('s1', 'bold', [t('the matrix')]),
  t(' as in '),
  span('l1', 'link', [t('Ref')], true),
  el('c1', 'cite'),
  t('.'),
])
const out = (...ps: OutPiece[]) => ps

/** the golden cases the rule's behaviour digest is taken over: each clause, accepted and refused */
const CASES: [UnitIn, OutPiece[]][] = [
  [u, asOut(u.content)],
  [
    u,
    out(
      { t: 'text', s: '我们固定' },
      { t: 'el', id: 'm1' },
      { t: 'text', s: '和矩阵，见' },
      { t: 'span', id: 'l1', content: [{ t: 'text', s: '文献' }] },
      { t: 'el', id: 'c1' },
    ),
  ],
  [
    u,
    out(
      { t: 'text', s: '我们' },
      { t: 'el', id: 'm1' },
      { t: 'el', id: 'm1' },
      { t: 'span', id: 'l1', content: [{ t: 'text', s: '文献' }] },
      { t: 'el', id: 'c1' },
    ),
  ],
  [
    u,
    out({ t: 'text', s: '我们' }, { t: 'span', id: 'l1', content: [{ t: 'text', s: '文献' }] }, { t: 'el', id: 'c1' }),
  ],
  [
    u,
    out(
      { t: 'text', s: '我们' },
      { t: 'el', id: 'm1' },
      { t: 'el', id: 'zz' },
      { t: 'span', id: 'l1', content: [{ t: 'text', s: '文献' }] },
      { t: 'el', id: 'c1' },
    ),
  ],
  [u, out({ t: 'text', s: '我们' }, { t: 'el', id: 'm1' }, { t: 'el', id: 'c1' })],
  [
    u,
    out(
      { t: 'text', s: '我们' },
      { t: 'el', id: 'm1' },
      { t: 'span', id: 'l1', content: [{ t: 'text', s: ' ' }] },
      { t: 'el', id: 'c1' },
    ),
  ],
  [
    u,
    out(
      { t: 'text', s: '我们\u0007' },
      { t: 'el', id: 'm1' },
      { t: 'span', id: 'l1', content: [{ t: 'text', s: '文献' }] },
      { t: 'el', id: 'c1' },
    ),
  ],
  [
    u,
    out(
      { t: 'text', s: '我​们' },
      { t: 'el', id: 'm1' },
      { t: 'span', id: 'l1', content: [{ t: 'text', s: '文献' }] },
      { t: 'el', id: 'c1' },
    ),
  ],
  [
    u,
    out(
      { t: 'text', s: '12' },
      { t: 'el', id: 'm1' },
      { t: 'span', id: 'l1', content: [{ t: 'text', s: '3' }] },
      { t: 'el', id: 'c1' },
    ),
  ],
  [
    u,
    out(
      {
        t: 'span',
        id: 'l1',
        content: [
          { t: 'text', s: '文献' },
          { t: 'el', id: 'm1' },
        ],
      },
      { t: 'el', id: 'c1' },
    ),
  ],
]

describe('accept: the one rule (DECISION: "one acceptance rule over typed pieces")', () => {
  it('takes an echo of the unit', () => {
    expect(accept(u, asOut(u.content))).toEqual({ ok: true })
  })
  it('(a) every element exactly once, in any order', () => {
    expect(accept(u, CASES[1]![1])).toEqual({ ok: true })
    expect(accept(u, CASES[2]![1])).toEqual({ ok: false, why: 'elements' })
    expect(accept(u, CASES[3]![1])).toEqual({ ok: false, why: 'elements' })
  })
  it('(b) a span that is not `must` may come back unstyled; a `must` span exactly once, holding text', () => {
    expect(accept(u, CASES[1]![1])).toEqual({ ok: true })
    expect(accept(u, CASES[5]![1])).toEqual({ ok: false, why: 'spans' })
    expect(accept(u, CASES[6]![1])).toEqual({ ok: false, why: 'spans' })
    const doubled = out(
      { t: 'text', s: '我们' },
      { t: 'el', id: 'm1' },
      { t: 'span', id: 's1', content: [{ t: 'text', s: '矩阵' }] },
      { t: 'span', id: 's1', content: [{ t: 'text', s: '矩阵' }] },
      { t: 'span', id: 'l1', content: [{ t: 'text', s: '文献' }] },
      { t: 'el', id: 'c1' },
    )
    expect(accept(u, doubled)).toEqual({ ok: false, why: 'spans' })
  })
  it("(b) nesting is the unit's: an element moved into a span that did not hold it is refused", () => {
    expect(accept(u, CASES[10]![1])).toEqual({ ok: false, why: 'spans' })
    const nested = unit('n', [span('a', 'link', [t('see '), el('x', 'cite')], true), t(' now')])
    expect(
      accept(nested, [
        { t: 'span', id: 'a', content: [{ t: 'text', s: '见' }] },
        { t: 'el', id: 'x' },
        { t: 'text', s: '现在' },
      ]),
    ).toEqual({ ok: true })
  })
  it('(c) nothing foreign: an unknown id, a control character, a default-ignorable code point, U+FFFC', () => {
    expect(accept(u, CASES[4]![1])).toEqual({ ok: false, why: 'foreign' })
    expect(accept(u, CASES[7]![1])).toEqual({ ok: false, why: 'foreign' })
    expect(accept(u, CASES[8]![1])).toEqual({ ok: false, why: 'foreign' })
    expect(
      accept(
        u,
        out(
          { t: 'text', s: '我们￼' },
          { t: 'el', id: 'm1' },
          { t: 'span', id: 'l1', content: [{ t: 'text', s: '文献' }] },
          { t: 'el', id: 'c1' },
        ),
      ),
    ).toEqual({ ok: false, why: 'foreign' })
    expect(
      accept(
        u,
        out(
          { t: 'text', s: '我们\t\n' },
          { t: 'el', id: 'm1' },
          { t: 'span', id: 'l1', content: [{ t: 'text', s: '文献' }] },
          { t: 'el', id: 'c1' },
        ),
      ),
    ).toEqual({ ok: true })
    // an element's id given as a span's is foreign
    expect(
      accept(
        u,
        out(
          { t: 'text', s: '我们' },
          { t: 'span', id: 'm1', content: [] },
          { t: 'span', id: 'l1', content: [{ t: 'text', s: '文献' }] },
          { t: 'el', id: 'c1' },
        ),
      ),
    ).toEqual({ ok: false, why: 'foreign' })
  })
  it('(d) no text lost: a letter where the unit has one', () => {
    expect(accept(u, CASES[9]![1])).toEqual({ ok: false, why: 'empty' })
  })
  it('(d) the length floor (DECISION: 0.2 for units of 200 characters or more, every target)', () => {
    const long = unit('long', [t('a'.repeat(150)), t(' '), t('b'.repeat(49))])
    expect(plainLength(long.content)).toBe(200)
    expect(accept(long, [{ t: 'text', s: '长'.repeat(40) }])).toEqual({ ok: true })
    expect(accept(long, [{ t: 'text', s: '长'.repeat(39) }])).toEqual({ ok: false, why: 'short' })
    const short = unit('short', [t('a'.repeat(199))])
    expect(accept(short, [{ t: 'text', s: '长' }])).toEqual({ ok: true })
  })
  it('a unit with no letter is told apart', () => {
    expect(hasLetter(unit('n', [t('2024 — '), el('m', 'math')]))).toBe(false)
    expect(hasLetter(u)).toBe(true)
  })
  it('holds its behaviour digest: a change to what it accepts moves ACCEPT_DIGEST, and the chain identity with it', () => {
    expect(sha256Hex(JSON.stringify(CASES.map(([a, b]) => accept(a, b))))).toBe(ACCEPT_DIGEST)
  })
})

describe('sentences reconstruct or are dropped (design-a §1.4)', () => {
  const v = unit('v', [t('One. Two '), el('m', 'math'), t(' three.')])
  const r: OutPiece[] = [
    { t: 'text', s: '一。二' },
    { t: 'el', id: 'm' },
    { t: 'text', s: '三。' },
  ]
  it('projections count each element as one character and spans as none', () => {
    expect(projectionOf(v.content)).toBe('One. Two ￼ three.')
    expect(projectionOf([span('s', 'bold', [t('ab')])])).toBe('ab')
  })
  it('keeps pairs of equal length, strictly increasing, strictly inside', () => {
    expect(validSentences(v, r, { src: [5], tr: [2] })).toBe(true)
    expect(validSentences(v, r, { src: [5, 9], tr: [2] })).toBe(false)
    expect(validSentences(v, r, { src: [0], tr: [2] })).toBe(false)
    expect(validSentences(v, r, { src: [5], tr: [6] })).toBe(false)
    expect(validSentences(v, r, { src: [9, 5], tr: [1, 2] })).toBe(false)
    expect(validSentences(v, r, { src: [], tr: [] })).toBe(false)
  })
})
