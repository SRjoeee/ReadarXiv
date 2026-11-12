// A unit's end mark laid at the end of its translation (El.end; docs/PDF-READER.md §18.52; the coordinator's ruling of
// 2026-11-12): the last token, a crop as far from its line's right edge as TeX set it, on the line the text ends on where the
// text ends the keep-off distance before it (B.slots' rule for ink that stays: TeX's own distance, half an em at most), else on
// a line of its own. Parts made by hand: a paragraph of two lines at 10 pt on a 228 pt measure (72-300), half a size a
// character, room under its last line for one more; amsthm's QED box at the measure's end (293-300) on its last line.
import type { El, Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Item, Laid, Metrics, Rows } from '../../src/types.ts'

const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
}
const rules = rulesFor('de')
// (no page fill: the lines as the fit lays them)
const still: typeof rules = { ...rules, set: { ...rules.set, adaptiveFill: false } as unknown as typeof rules.set }
const id = 'a'.repeat(64)
const QED: [number, number, number, number, number, number] = [1, 293, 688, 300, 695, 688]
const member = (o: Partial<Placed> = {}): Placed => ({
  ord: 0,
  kind: 'theorem',
  text: id,
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'j',
  lines: [
    [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
    [1, 0, 72, 200, 688, 695, 686, 72, 300, 0, 10],
  ],
  room: { below: 0, next: 300, runs: [[1, 200, 30]], sep: 12 },
  ...o,
})
const part = (m: Placed): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: [[m]],
})
const rowOf = (content: (Row & { ok: true })['content']): Rows => {
  const r: Row = { id, ok: true, by: 'test', content }
  return { get: (k) => (k === id ? r : undefined), done: true }
}
const words = (n: number) => 'wort '.repeat(n).trim()
/** the end mark the prepare claimed after the unit's end point (no piece's) */
const claimed: [string, El] = ['~$', { kind: 'other', copy: '', ink: [QED], trail: 1, end: 1 }]
const lay = (m: Placed, content: (Row & { ok: true })['content']): Laid =>
  layPage(part(m), rowOf(content), still, metrics).members[0]!
type Crop = Item & { src: number[]; x: number; w: number; piece: string }
/** the end mark's crop and the line it stands on, each line's baseline, its text's end */
const markOf = (laid: Laid, piece = '-2') => {
  const at = laid.lines.findIndex((l) => l[3].some((it) => 'src' in it && (it as Crop).piece === piece))
  const line = laid.lines[at]
  const crop = line?.[3].find((it) => 'src' in it && (it as Crop).piece === piece) as Crop | undefined
  const text = line?.[3].filter((it) => !('src' in it) && it.s.trim()) ?? []
  const end = text.length ? Math.max(...text.map((it) => it.x + metrics.advance('', 10, it.s))) : null
  return { at, y: line?.[0], crop, end, last: at === laid.lines.length - 1 }
}

describe('a unit’s end mark is laid at the end of its translation (El.end)', () => {
  it('follows a translation one line longer to its last line’s end, as TeX set it from the measure’s end', () => {
    // (2610.40645v1-ja p12 t80: the translation at TeX's size runs a line past the original's last; the box, left where TeX set
    // it, stood beside the 4th line of 5)
    const laid = lay(member({ els: [claimed] }), [{ t: 'text', s: words(19) }])
    expect(laid.state).toBe('laid')
    expect(laid.lines.map(([y]) => y)).toEqual([700, 688, 676])
    const mark = markOf(laid)
    expect([mark.y, mark.last]).toEqual([676, true])
    // (its rectangle where TeX set it across: the box at 293-300, the crop's antialiased edge 0.4 out)
    expect(mark.crop!.x).toBeCloseTo(292.6, 5)
    expect(mark.crop!.src.slice(1)).toEqual([292.6, 687.7, 300.4, 695.3, 688])
    // (the text before it on its line ends half an em before its ink, at least; the row TeX set it on runs full now)
    expect(mark.end!).toBeLessThanOrEqual(293 - 5 + 0.01)
    expect(laid.lines[1]![2]).toBeGreaterThan(293)
    // (drawn once: its element group off with the unit's)
    expect(laid.off & 3).toBe(3)
  })

  it('follows a translation one line shorter up to its last line’s end', () => {
    const laid = lay(member({ els: [claimed] }), [{ t: 'text', s: words(6) }])
    expect(laid.lines.map(([y]) => y)).toEqual([700])
    const mark = markOf(laid)
    expect([mark.y, mark.last]).toEqual([700, true])
    expect(mark.crop!.x).toBeCloseTo(292.6, 5)
  })

  it('takes a line of its own where the translation fills its last line, flush to the measure’s end as TeX set it', () => {
    // (amsthm's \penalty9999 before the box: a break there only where it does not fit, its spaces shrunk as far as they go;
    // the line TeX would set it on full, 220 pt of 228 with no space to shrink)
    const laid = lay(member({ els: [claimed] }), [{ t: 'text', s: `${'x'.repeat(44)} ${'x'.repeat(44)}` }])
    expect(laid.lines.map(([y]) => y)).toEqual([700, 688, 676])
    const mark = markOf(laid)
    expect([mark.y, mark.last, mark.end]).toEqual([676, true, null])
    expect(mark.crop!.x).toBeCloseTo(292.6, 5)
    expect(laid.lines[1]![2]).toBeGreaterThan(288)
  })

  it('sets the author’s own mark the translation ends with at the end of the line, not glued after its last word', () => {
    // (2610.21176v1-zh p13 t102: `\qed` written at the paragraph's end, the unit's element; drawn where the translation set it,
    // right after the last word, 268 pt short of where TeX had pushed it)
    const qed: [string, El] = ['1', { kind: 'umacro', unknown: 1, cmd: 'qed', bare: 1, ink: [QED], end: 1 }]
    const laid = lay(member({ els: [qed] }), [
      { t: 'text', s: `${words(10)} ` },
      { t: 'el', id: '1' },
    ])
    const mark = markOf(laid, '1')
    expect([mark.y, mark.last]).toEqual([688, true])
    expect(mark.crop!.x).toBeCloseTo(292.6, 5)
    expect(mark.end!).toBeLessThan(150)
  })

  it('lays a part that states no end mark exactly as before: the box a stay its lines keep off, the trail glued', () => {
    // (a part made before 2026-11-12 states amsthm's box as Room.stays and its trail with no `end`; a typesetter of before reads
    // a no-piece element with `trail` as a trail. The same part laid by this typesetter: every line and item as 35cf17994 laid it)
    const stays = lay(
      member({ room: { below: 0, next: 300, runs: [[1, 200, 30]], sep: 12, stays: [[1, 293, 688, 300, 695]] } }),
      [{ t: 'text', s: words(19) }],
    )
    expect(
      stays.lines.map(([y, x0, x1, items]) => [y, x0, +x1.toFixed(3), items.map((it) => it.s.trim()).join(' ')]),
    ).toEqual(BEFORE_STAYS)
    const { end: _end, ...asTrail } = claimed[1]
    const trail = lay(member({ els: [['~', asTrail]] }), [{ t: 'text', s: words(6) }])
    const t = trail.lines[0]![3]
    const crop = t.find((it) => 'src' in it) as Crop
    const text = t.filter((it) => !('src' in it))
    expect(crop.x).toBeCloseTo(text.at(-1)!.x + metrics.advance('', 10, text.at(-1)!.s), 5)
  })
})

/** the stays part's lines as 35cf17994 laid them: its last original row ending half an em before the box (288), a third line
 *  borrowed under it */
const BEFORE_STAYS: unknown[] = [
  [700, 72, 300, 'wort wort wort wort wort wort wort wort wort'],
  [688, 72, 288, 'wort wort wort wort wort wort wort wort wort'],
  [676, 72, 92, 'wort'],
]
