// The acceptance rule's golden cases: each clause, accepted and refused. ACCEPT_DIGEST (src/accept.ts) is the hash of
// `accept`'s outputs over them: tests/accept.test.ts holds the literal, and `pnpm digests` recomputes it (tests/digests.ts).
import { asOut } from '../src/accept.ts'
import type { OutPiece, UnitIn } from '../src/contract.ts'
import { el, span, t, unit } from './pieces.ts'

export const u = unit('u', [
  t('We fix '),
  el('m1', 'math'),
  t(' and '),
  span('s1', 'bold', [t('the matrix')]),
  t(' as in '),
  span('l1', 'link', [t('Ref')], true),
  el('c1', 'cite'),
  t('.'),
])
export const out = (...ps: OutPiece[]) => ps

/** the golden cases the rule's behaviour digest is taken over: each clause, accepted and refused */
export const CASES: [UnitIn, OutPiece[]][] = [
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
      { t: 'text', s: '。' },
      { t: 'el', id: 'm1' },
      { t: 'span', id: 'l1', content: [{ t: 'text', s: '、' }] },
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
  // a digit for a word ("two" is 2)
  [unit('two', [t('two')]), out({ t: 'text', s: '2' })],
]
