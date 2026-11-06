// What a host may state of an element besides its kind (contract.ts Piece): `alone`, a marker of its own on a wire that
// joins side-by-side elements, and `reads`, what it reads as to a sentence cutter; and of a unit, `strict`, a reply taken
// only with every placeholder whole. Each changes one thing and nothing else
import { describe, expect, it } from 'vitest'
import { google } from '../src/adapters/google.ts'
import { microsoft } from '../src/adapters/microsoft.ts'
import { chainOf } from '../src/chain.ts'
import type { Piece, Result, UnitIn } from '../src/contract.ts'
import { echo, scriptedFetch } from '../src/testing/fakes.ts'
import { fakeClock } from '../src/testing/ports.ts'
import { UNITS } from './adapters/fixtures.ts'
import { el, t, unit } from './pieces.ts'

const none = async () => {
  throw new Error('no network')
}
const ms = microsoft({ fetch: none })
const g = google({ fetch: none })
/** the unit with every element's kind and statements rewritten by `f` */
const restated = (u: UnitIn, f: (p: Extract<Piece, { t: 'el' }>) => Piece): UnitIn => {
  const walk = (ps: readonly Piece[]): Piece[] =>
    ps.map((p) => (p.t === 'el' ? f(p) : p.t === 'span' ? { ...p, content: walk(p.content) } : p))
  return { ...u, content: walk(u.content) }
}

describe('`alone`: a marker of its own, and nothing else', () => {
  const pair = unit('u', [t('The pair '), el('a'), t(' '), el('b'), t(' is orthogonal.')])
  it('side-by-side elements go as one marker; stated alone, each keeps its own', () => {
    expect(ms.write(pair, 'zh-Hans')).toBe('The pair @a# is orthogonal.')
    expect(
      ms.write(
        restated(pair, (p) => ({ ...p, alone: true })),
        'zh-Hans',
      ),
    ).toBe('The pair @a# @b# is orthogonal.')
  })
  it('the markers wire reads from the kind `display` nothing but that: on every fixture unit, a display is an element stated alone', () => {
    for (const u of UNITS) {
      const asDisplay = restated(u, (p) => ({ ...p, kind: 'display' }))
      const asAlone = restated(u, (p) => ({ ...p, kind: 'other', alone: true }))
      expect(ms.write(asAlone, 'zh-Hans'), u.id).toBe(ms.write(asDisplay, 'zh-Hans'))
    }
  })
  it('the tags wire writes no element differently for it', () => {
    for (const u of UNITS)
      expect(
        g.write(
          restated(u, (p) => ({ ...p, alone: true })),
          'zh-Hans',
        ),
        u.id,
      ).toBe(g.write(u, 'zh-Hans'))
  })
})

describe('`reads`: what an element reads as to the sentence cutter, and nothing else', () => {
  const marks = (u: UnitIn) => (g.write(u, 'zh-Hans').match(/<x id="\d+"\/>/g) ?? []).length - 1
  it('a sentence that begins with a formula after a full stop: cut where the formula reads as a capital, not as `x`', () => {
    const u = unit('u', [t('The result is given in '), el('a'), t('. '), el('b'), t(' implies the bound.')], true)
    expect(marks(u)).toBe(1)
    expect(marks(restated(u, (p) => (p.id === 'b' ? { ...p, reads: 'Φ' } : p)))).toBe(2)
  })
  it('a citation read as its bracket after an abbreviation does not end the sentence there; read as a word it does', () => {
    const u = unit('u', [t('Shown by Gopalan et al. '), el('c', 'other'), t(', which reduces to the bound.')], true)
    expect(marks(u)).toBe(1)
    expect(marks(restated(u, (p) => ({ ...p, reads: '[12]' })))).toBe(0)
  })
  it('an element inside a span with no text of its own (one void on the wire) reads as itself, not as the span', () => {
    const inner = (reads?: string): UnitIn =>
      unit(
        'u',
        [
          t('Prompt: the pair is given in Table 3. '),
          {
            t: 'span',
            id: 's',
            style: 'other',
            must: true,
            content: [reads ? { t: 'el', id: 'e', kind: 'math', reads } : el('e')],
          },
          t(' holds.'),
        ],
        true,
      )
    expect(marks(inner())).toBe(0)
    expect(marks(inner('Φ'))).toBe(1)
  })
  it("a note's mark stays an annotation whatever it reads as; and `reads` changes no byte the endpoint is sent but the cuts", () => {
    const u = unit('u', [t('A claim.'), el('n', 'note-mark'), t(' Then more.')], true)
    expect(
      g.write(
        restated(u, (p) => ({ ...p, reads: 'Xx.' })),
        'zh-Hans',
      ),
    ).toBe(g.write(u, 'zh-Hans'))
    for (const f of UNITS) {
      const plain = g.write({ ...f, sentences: false }, 'zh-Hans')
      expect(g.write({ ...restated(f, (p) => ({ ...p, reads: 'Q' })), sentences: false }, 'zh-Hans'), f.id).toBe(plain)
      expect(
        ms.write(
          restated(f, (p) => ({ ...p, reads: 'Q' })),
          'zh-Hans',
        ),
        f.id,
      ).toBe(ms.write(f, 'zh-Hans'))
    }
  })
})

describe("Microsoft's tolerant reading where the text holds a `#` of its own", () => {
  const own = unit('u', [t('Implementations in Python and F# '), el('a', 'math'), t('.')])
  const free = unit('v', [t('Implementations in Python and C '), el('a', 'math'), t('.')])
  const read = (u: UnitIn, text: string) => ms.read(u, JSON.stringify({ text }))
  it('a marker without its `#` is read only where the wire holds no `#` of its own: elsewhere the lost `#` would show', () => {
    expect(ms.write(own, 'zh-Hans')).toBe('Implementations in Python and F# @a#.')
    expect(read(own, 'Implementations in Python and F# @a(#).')).toBeNull()
    expect(read(free, 'Implementations in Python and C @a(#).')).toMatchObject({
      content: [
        { t: 'text', s: 'Implementations in Python and C ' },
        { t: 'el', id: 'a' },
        { t: 'text', s: '.' },
      ],
    })
    // a `#` beside a marker there is Microsoft's doubled closer or the text's own moved: refused, either would show wrong
    expect(read(own, 'Implementations in Python and F# @a##.')).toBeNull()
    expect(read(own, 'Implementations in Python and F# @a# #.')).toBeNull()
    expect(read(free, 'Implementations in Python and C @a##.')).not.toBeNull()
    // read strictly, the block's own `#` stands where it stood
    expect(read(own, 'Implementations in Python and F# @a#.')?.content).toEqual([
      { t: 'text', s: 'Implementations in Python and F# ' },
      { t: 'el', id: 'a' },
      { t: 'text', s: '.' },
    ])
  })
})

describe('`strict`: a reply taken only with every placeholder whole', () => {
  // (the replies are Microsoft's shapes as the HTML page met them live, lane L6 stage 4b's second round, in words of ours)
  const loose = unit('u', [t('The norm of '), el('a'), t(' and the trace of '), el('b'), t(' are equal.')])
  const strict: UnitIn = { ...loose, strict: true }
  const read = (u: UnitIn, text: string) => ms.read(u, JSON.stringify({ text }))
  const repaired = {
    'a marker without its `#` before a Han character': '@a的范数与@b#的迹相等。',
    'set inside a word': '范@a数与@b#的迹相等。',
    'two markers jammed, the words between them lost': '@a@b#的范数与迹相等。',
    'its `#` away from it': '@a 的范数与@b#的迹相等#。',
    'its `#` away from it, beside characters of its own': '@a B4# 的范数与@b#的迹相等。',
  }
  it('every marker without its `#` is read for a unit that does not say it, and refuses the reply for one that does', () => {
    expect(ms.write(loose, 'zh-Hans')).toBe('The norm of @a# and the trace of @b# are equal.')
    for (const [shape, reply] of Object.entries(repaired)) {
      expect(read(loose, reply), shape).not.toBeNull()
      expect(read(strict, reply), shape).toBeNull()
    }
  })
  it('a whole marker is read as before, its `#` doubled too: the marker stands where it stood', () => {
    for (const reply of ['@a#的范数与@b#的迹相等。', '@a##的范数与@b# #的迹相等。']) {
      expect(read(strict, reply)?.content).toEqual(read(loose, reply)?.content)
      expect(read(strict, reply)?.content.filter((p) => p.t === 'el')).toEqual([
        { t: 'el', id: 'a' },
        { t: 'el', id: 'b' },
      ])
    }
  })
  it('it changes no byte the endpoint is sent', () => {
    expect(ms.write(strict, 'zh-Hans')).toBe(ms.write(loose, 'zh-Hans'))
    for (const u of UNITS) expect(ms.write({ ...u, strict: true }, 'zh-Hans'), u.id).toBe(ms.write(u, 'zh-Hans'))
  })
  it('through the chain, the unit Microsoft answered so goes to the next translator', async () => {
    const f = scriptedFetch(() => ({
      status: 200,
      body: JSON.stringify([{ translations: [{ text: repaired['two markers jammed, the words between them lost'] }] }]),
    }))
    const results: Result[] = []
    for await (const r of chainOf({ clock: fakeClock() }).translate([strict], 'zh-Hans', {
      translators: [microsoft({ fetch: f.fetch }), echo('next:0')],
    }))
      results.push(r)
    expect(results).toMatchObject([{ id: 'u', ok: true, by: 'next:0' }])
    expect(f.requests.length).toBe(1)
  })
})
