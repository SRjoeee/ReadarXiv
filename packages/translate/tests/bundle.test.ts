// A bundle's unit as a translator is given it (src/bundle.ts unitInOf): packages/format's unit, its pieces and a nested unit
// projected onto the contract's UnitIn. What a wire reads of them is kept; what only names them (an element's `src` and
// `keys`, a group's `open` and `close`, a heading's `depth`, the paper's `kept`, a nested unit's `unit`, `pre` and `post`)
// is left. The pin is read off the wire code itself: every field any wire, adapter or the chain reads of the projection is
// recorded, and none may be one the projection left.
import { Piece as FormatPiece, type Unit as FormatUnit, Unit as FormatUnitSchema } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import {
  type ChromeApi,
  chainOf,
  chrome,
  type FetchInit,
  google,
  microsoft,
  type Result,
  type Translator,
  type UnitIn,
  unitInOf,
} from '../src/index.ts'
import { mangler, scriptedFetch } from '../src/testing/index.ts'

const id = (c: string) => c.repeat(64)

/** a unit that sets every field packages/format states: of the unit, of a text, an element, a group and a nested unit */
const FULL: FormatUnit = {
  id: id('a'),
  kind: 'para',
  depth: 2,
  sentences: true,
  kept: true,
  content: [
    { t: 'text', s: 'We fix ' },
    { t: 'el', id: 'm', kind: 'math', src: '$\\theta$', keys: ['eq:theta'] },
    { t: 'text', s: ' and set ' },
    { t: 'el', id: 'd', kind: 'display', src: '\\[x = y.\\]', stop: '.' },
    { t: 'el', id: 'q', kind: 'other', src: '\\noindent', silent: 1 },
    {
      t: 'span',
      id: 'b',
      style: 'bold',
      must: 1,
      stop: '.',
      open: '\\textbf{',
      close: '}',
      content: [{ t: 'text', s: 'Setup' }],
    },
    { t: 'text', s: ' Words in a claim' },
    { t: 'unit', id: 'n', unit: id('b'), pre: '\\footnote{', post: '}' },
    { t: 'text', s: ' follow, ' },
    {
      t: 'span',
      id: 'i',
      style: 'italic',
      open: '{',
      close: '}',
      content: [
        { t: 'el', id: 'k', kind: 'macro', src: '\\em' },
        { t: 'text', s: 'all of them' },
      ],
    },
    { t: 'text', s: ' as stated.' },
    { t: 'el', id: 'r', kind: 'other', src: '\\BR@backref{1}', after: ' ' },
  ],
}

/** FULL as a translator is given it */
const EXPECTED: UnitIn = {
  id: id('a'),
  kind: 'para',
  sentences: true,
  content: [
    { t: 'text', s: 'We fix ' },
    { t: 'el', id: 'm', kind: 'math' },
    { t: 'text', s: ' and set ' },
    { t: 'el', id: 'd', kind: 'display', stop: '.' },
    { t: 'el', id: 'q', kind: 'other', silent: 1 },
    { t: 'span', id: 'b', style: 'bold', must: 1, stop: '.', content: [{ t: 'text', s: 'Setup' }] },
    { t: 'text', s: ' Words in a claim' },
    { t: 'el', id: 'n', kind: 'note-mark' },
    { t: 'text', s: ' follow, ' },
    {
      t: 'span',
      id: 'i',
      style: 'italic',
      content: [
        { t: 'el', id: 'k', kind: 'macro' },
        { t: 'text', s: 'all of them' },
      ],
    },
    { t: 'text', s: ' as stated.' },
    { t: 'el', id: 'r', kind: 'other', after: ' ' },
  ],
}

/** the fields format's schema states, by what holds them: `unit`, and `piece:<t>` for each piece */
function schemaFields(): Map<string, Set<string>> {
  const union = (
    FormatPiece as unknown as { unwrap(): { options: { shape: Record<string, { value?: unknown }> }[] } }
  ).unwrap().options
  const out = new Map<string, Set<string>>([['unit', new Set(Object.keys(FormatUnitSchema.shape))]])
  for (const o of union) out.set(`piece:${String(o.shape.t?.value)}`, new Set(Object.keys(o.shape)))
  return out
}
/** the fields a unit sets, by what holds them, as schemaFields names them */
function fieldsOf(u: FormatUnit): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const add = (at: string, o: object) => {
    const s = out.get(at) ?? new Set<string>()
    for (const k of Object.keys(o)) s.add(k)
    out.set(at, s)
  }
  add('unit', u)
  const walk = (ps: readonly FormatUnit['content'][number][]) => {
    for (const p of ps) {
      add(`piece:${p.t}`, p)
      if (p.t === 'span') walk(p.content)
    }
  }
  walk(u.content)
  return out
}

/** the fields the projection left, by what holds them in the projection (`unit`, or a piece's `t`: a nested unit's are an
 *  element's), read off the two side by side */
function leftOf(f: FormatUnit, w: UnitIn): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const off = (at: string, from: object, to: object) => {
    const s = out.get(at) ?? new Set<string>()
    for (const k of Object.keys(from)) if (!(k in to)) s.add(k)
    out.set(at, s)
  }
  off('unit', f, w)
  const walk = (fs: readonly FormatUnit['content'][number][], ws: readonly UnitIn['content'][number][]) =>
    fs.forEach((p, i) => {
      const q = ws[i] as UnitIn['content'][number]
      off(q.t, p, q)
      if (p.t === 'span' && q.t === 'span') walk(p.content, q.content)
    })
  walk(f.content, w.content)
  return out
}

/** a unit behind a recorder: every field any code reads of it, of its pieces and of theirs, as `<what>.<field>` (`unit`, or a
 *  piece's `t`), a field it lacks included; the same proxy for the same object, as code compares pieces by identity */
function recorded() {
  const read = new Set<string>()
  const proxies = new WeakMap<object, object>()
  const wrap = <T>(o: T, what: string | null): T => {
    if (typeof o !== 'object' || o === null) return o
    const hit = proxies.get(o)
    if (hit) return hit as T
    const proxy = new Proxy(o, {
      get(target, key, receiver) {
        const v = Reflect.get(target, key, receiver)
        if (typeof key !== 'string') return v
        if (Array.isArray(target)) return /^\d+$/.test(key) ? wrap(v, (v as { t: string }).t) : v
        if (what) read.add(`${what}.${key}`)
        return key === 'content' ? wrap(v, null) : v
      },
      has(target, key) {
        if (what && typeof key === 'string') read.add(`${what}.${key}`)
        return Reflect.has(target, key)
      },
    })
    proxies.set(o, proxy)
    return proxy as T
  }
  return { read, unit: (u: UnitIn): UnitIn => wrap(u, 'unit') }
}

// the endpoints giving each text back as its translation
const microsoftEcho = (_url: string, init: FetchInit) => {
  const lengths = (s: string) => s.split(/(?<=\.\s)/).map((p) => p.length)
  return {
    status: 200,
    body: JSON.stringify(
      (JSON.parse(init.body) as string[]).map((text) => ({
        translations: [{ text, to: 'zh-Hans', sentLen: { srcSentLen: lengths(text), transSentLen: lengths(text) } }],
      })),
    ),
  }
}
const googleEcho = (_url: string, init: FetchInit) => {
  const [[items]] = JSON.parse(init.body) as [[string[], string, string], string]
  return { status: 200, body: JSON.stringify([items]) }
}
const chromeEcho: ChromeApi = {
  availability: async () => 'available',
  create: async () => ({ translate: async (s: string) => s }),
}

const all = async <T>(it: AsyncIterable<T>): Promise<T[]> => {
  const out: T[] = []
  for await (const x of it) out.push(x)
  return out
}

describe('unitInOf: a bundle unit as a translator is given it', () => {
  it('the fixture sets every field packages/format states, each one a field of its schema', () => {
    expect(FormatUnitSchema.parse(FULL)).toStrictEqual(FULL)
    expect(fieldsOf(FULL)).toEqual(schemaFields())
  })

  it('keeps what a wire reads of a unit and its pieces, leaves what only names them; a nested unit goes as a note mark', () => {
    expect(unitInOf(FULL)).toStrictEqual(EXPECTED)
    // (the bundle's own unit untouched)
    expect(FormatUnitSchema.parse(FULL)).toStrictEqual(FULL)
  })

  it('no wire, adapter or chain step reads a field the projection leaves', async () => {
    const left = leftOf(FULL, unitInOf(FULL))
    // (the unit three ways: as it is, with no element set after its text, so that no tail is split off it and every wire
    // reads its own groups, and not by sentence)
    const noTail: FormatUnit = { ...FULL, id: id('c'), content: FULL.content.slice(0, -1) }
    const { sentences: _s, ...whole } = { ...noTail, id: id('d') }
    const r = recorded()
    const units = [FULL, noTail, whole].map((u) => r.unit(unitInOf(u)))
    const runs: Translator[][] = [
      [microsoft({ fetch: scriptedFetch(microsoftEcho).fetch })],
      [google({ fetch: scriptedFetch(googleEcho).fetch })],
      [chrome({ api: chromeEcho })],
      // (every reply refused: the runs floor)
      [mangler('drop-el')],
    ]
    const results: Result[] = []
    for (const translators of runs) results.push(...(await all(chainOf().translate(units, 'zh-Hans', { translators }))))
    // (each real adapter took the units and its echo was taken; the floor answered by runs)
    expect(results.map((x) => (x.ok ? x.by.split(':')[0] : x.why.kind))).toEqual([
      ...['microsoft', 'microsoft', 'microsoft'],
      ...['google', 'google', 'google'],
      ...['chrome', 'chrome', 'chrome'],
      ...['runs', 'runs', 'runs'],
    ])
    // (the recorder sees the wires read what they read)
    expect([...r.read]).toEqual(
      expect.arrayContaining([
        'unit.content',
        'unit.sentences',
        'text.s',
        'el.kind',
        'el.stop',
        'el.silent',
        'el.after',
        'span.must',
        'span.stop',
        'span.content',
      ]),
    )
    const readLeft = [...r.read].filter((x) => {
      const [at, field] = x.split('.') as [string, string]
      return left.get(at)?.has(field) === true
    })
    expect(readLeft).toEqual([])
  })
})
