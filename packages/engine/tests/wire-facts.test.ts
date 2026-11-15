// What the bundle states of a unit for the wires beyond its source (the wire move; format's Unit.entry and el `text`):
// - an entry's form with the author block's names (kind `named`, names.ts) is that entry's: it states `entry` too;
// - an element's `text`: the text TeX set for it where it stands, on its line's baseline at its text's size, stated where every
//   placement of its unit in a part agrees. Locate reads the baseline for every class of element (an internal fact of the
//   member, Member.onBase, which no part carries); a class it states El.text for without that reading (`other`, a paper's macro
//   drawn from its ink, F10's `\hl{guitar}`) is read the same. A raised element, one set smaller, a footnote's mark, one whose
//   placements disagree, one that stands in no part: none.
// Pages made by hand (helpers/doc.ts), our compile and arXiv's the same.
import { type Piece, read, type Unit, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import { bundle } from '../src/bundle/bundle.ts'
import { NAMED_KIND, namesOf, PERSON_KIND, type BlockMember } from '../src/bundle/names.ts'
import type { Doc, DocGlyph } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import type { AddOn } from '../src/wrap/wrap.ts'
import { docOf } from './helpers/doc.ts'
import { locate } from './helpers/locate.ts'

const t = (s: string): Piece => ({ t: 'text', s })

// ---------------------------------------------------------------- an entry's variant
describe('an entry’s form with the block’s names', () => {
  it('states `entry` as its entry does', () => {
    const zhou: Unit = { id: unitId('author', [t('Wenyong Zhou')]), kind: 'author', content: [t('Wenyong Zhou')] }
    const lineContent = [t('Wenyong Zhou'), { t: 'el' as const, id: '1', kind: 'math', src: '$^{1}$' }, t(',')]
    const line: Unit = { id: unitId('inknames', lineContent), kind: 'inknames', content: lineContent }
    const refContent = [t('A. Other and Wenyong Zhou. 2025. A title.')]
    const ref: Unit = { id: unitId('reference', refContent), kind: 'reference', content: refContent, entry: true }
    const members: BlockMember[] = [
      { ord: 1, unit: line.id, kind: 'inknames' },
      { ord: 2, unit: ref.id, kind: 'reference' },
      { ord: 3, unit: zhou.id, kind: 'textnames' },
    ]
    const v = namesOf([zhou, line, ref], () => undefined, members).variants.get(ref.id)!
    expect(v.kind).toBe(NAMED_KIND)
    expect(v.content.some((p) => p.t === 'el' && p.kind === PERSON_KIND)).toBe(true)
    expect(v.entry).toBe(true)
    // (and a variant of a unit that is no entry states none)
    const noteContent = [t('Corresponding author: Wenyong Zhou.')]
    const note: Unit = { id: unitId('footnote', noteContent), kind: 'footnote', content: noteContent }
    const w = namesOf([zhou, line, note], () => undefined, [
      ...members.slice(0, 1),
      { ord: 4, unit: note.id, kind: 'footnote' },
    ]).variants.get(note.id)!
    expect(w.entry).toBeUndefined()
  })
})

// ---------------------------------------------------------------- through locate and the bundle, on pages made by hand
/** the instrument over B: `own(p, line, glyph)` [unit, role, piece] */
function instrument(
  B: Doc,
  units: InstrumentUnit[],
  own: (p: number, n: number, k: number) => [number, number, number],
): Instrument {
  return {
    ink: B,
    units,
    glyphs: B.pages.map((pg, p) => {
      const O = ownersOf(pg.glyphs.length)
      pg.glyphs.forEach((g, j) => {
        const [u, role, piece] = own(p, g.n, j)
        O.unit[j] = u
        O.role[j] = role
        O.piece[j] = piece
      })
      return O
    }),
    boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
    tex: {},
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  }
}
const addOnOf = (located: ReturnType<typeof locate>, pages: number, refuse: number[] = []): AddOn => ({
  bytes: new Uint8Array([1, 2, 3]),
  pages: new Map(
    Array.from({ length: pages }, (_, i) => [
      i + 1,
      refuse.includes(i + 1) ? { ok: false, why: 'test' } : { ok: true },
    ]),
  ),
  groups: new Set(
    located.groups.flatMap((g, i) => (refuse.includes(i + 1) ? [] : g.glyphs.filter((x): x is string => x !== null))),
  ),
  ocgs: new Map(),
  lost: new Set(),
  stats: {} as AddOn['stats'],
})
/** each glyph of `at` on page 1 (by index) moved: raised by `up`, or set at `size` */
function moved(doc: Doc, at: (k: number) => boolean, o: { up?: number; size?: number }): Doc {
  return {
    pages: doc.pages.map((pg) => ({
      ...pg,
      glyphs: pg.glyphs.map((g, k) => {
        if (!at(k)) return g
        const up = o.up ?? 0
        const x: DocGlyph = { ...(g as DocGlyph), y: g.y + up, top: g.top + up, bottom: g.bottom + up }
        if (o.size !== undefined)
          Object.assign(x, { size: o.size, top: x.y + 0.7 * o.size, bottom: x.y - 0.2 * o.size })
        return x
      }),
    })),
  }
}
// ("dirty guitars." on each line: the element `\hl{guitar}`, class other (drawn from its ink), glyphs 6-11 of a line of 14)
const CONTENT: Piece[] = [t('dirty '), { t: 'el', id: '1', kind: 'macro', src: '\\hl{guitar}' }, t('s.')]
const unitOf = (more: Partial<InstrumentUnit> = {}): InstrumentUnit => ({
  id: unitId('para', CONTENT),
  kind: 'para',
  content: CONTENT,
  classes: [['1', { cls: 'other', cmd: 'hl' }]],
  ...more,
})
/** the bundle's unit of `units[0]`'s id and its element `1`, the part's El of each placement, and the members */
function stated(B: Doc, units: InstrumentUnit[], refuse: number[] = []) {
  const ins = instrument(B, units, (_, n, j) => {
    const k = j - 14 * n
    return k >= 6 && k < 12 ? [n, ROLE.element, 1] : [n, ROLE.text, -1]
  })
  const L = locate(ins, B, align(B, B))
  const objects = [
    ...bundle({
      ins,
      located: L,
      addOn: addOnOf(L, 1, refuse),
      original: new Uint8Array(10),
      paper: { id: '2501.00001', version: 1, pages: 1 },
      made: 'test',
    }),
  ]
  const u = objects
    .filter((o) => o.kind === 'units')
    .flatMap((o) => read('units', o.bytes, o.digest).units)
    .find((x) => x.id === units[0]!.id)!
  const el = u.content.find((p) => p.t === 'el') as Extract<Piece, { t: 'el' }>
  const parts = objects.filter((o) => o.kind === 'part').map((o) => read('part', o.bytes, o.digest))
  return { u, el, members: L.members, parts }
}
const ON = docOf([{ lines: ['dirty guitars.'] }])
const isEl = (k: number) => k >= 6 && k < 12

describe('an element’s text, where TeX set it on its line at its text’s size', () => {
  it('states it where the element’s glyphs stand on their line’s baseline at the text’s size: `\\hl{guitar}`’s "guitar"', () => {
    const { el, members } = stated(ON, [unitOf()])
    expect(members[0]!.onBase?.has('1')).toBe(true)
    expect(el.text).toBe('guitar')
  })
  it('states none where TeX raised it, whatever its class says (the part states its text as before: no part moves)', () => {
    const { el, members, parts } = stated(moved(ON, isEl, { up: 3 }), [unitOf()])
    expect(members[0]!.onBase?.has('1') ?? false).toBe(false)
    expect(el.text).toBeUndefined()
    const partEl = new Map(parts[0]!.flows.flat()[0]!.els ?? []).get('1')!
    expect(partEl.text).toBe('guitar')
  })
  it('states none where TeX set it at another size than its text’s (a script)', () => {
    const { el } = stated(moved(ON, isEl, { size: 7 }), [unitOf()])
    expect(el.text).toBeUndefined()
  })
  it('states none for a footnote’s mark, which is drawn raised whatever it is set as', () => {
    const { el } = stated(ON, [unitOf({ classes: [['1', { cls: 'num', mark: true }]] })])
    expect(el.text).toBeUndefined()
  })
  it('states none where two placements of the unit disagree: one on the baseline, one raised', () => {
    const two = docOf([{ lines: ['dirty guitars.', 'dirty guitars.'] }])
    const { el } = stated(
      moved(two, (k) => k >= 14 + 6 && k < 14 + 12, { up: 3 }),
      [unitOf(), unitOf()],
    )
    expect(el.text).toBeUndefined()
    // (and both on the baseline: stated)
    expect(stated(two, [unitOf(), unitOf()]).el.text).toBe('guitar')
  })
  it('states none for an element that stands in no part (its page refused, no member laid there)', () => {
    const { el, parts } = stated(ON, [unitOf()], [1])
    expect(parts.length).toBe(0)
    expect(el.text).toBeUndefined()
  })
})

describe('an entry, through the bundle', () => {
  it('states the instrument’s entry on the bundle’s unit, and none on a unit that is no entry', () => {
    expect(stated(ON, [unitOf({ entry: true })]).u.entry).toBe(true)
    expect(stated(ON, [unitOf()]).u.entry).toBeUndefined()
  })
})
