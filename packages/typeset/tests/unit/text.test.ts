// D.text's layer on hand-made pages, held to today's textLayerOf (textlayer.mjs, engine 065c1d973) on the same case: today
// finds the items a drawing replaces by its page's hide operations, the port by the groups their ink stands in; where the two
// name the same items (each hidden rectangle over one group's items), the layers are equal. And nameSeg as today's.
import { describe, expect, it } from 'vitest'
import { type Drawn, nameSeg, type TextSeg, textLayer } from '../../src/emit/text.ts'
import { hasToday, todayFile } from '../replay/tap.ts'

type Compact = { n: number; str: string[]; num: Float32Array }
type Today = {
  itemsOf(tc: unknown): Compact
  textLayerOf(page: unknown, plan: unknown, drawn: unknown, o?: unknown): { items: unknown[]; page: unknown }
  nameSeg(...a: unknown[]): unknown
}
const today = hasToday ? ((await import(todayFile('layer-proto/textlayer.mjs'))) as Today) : null

/** a text item of PDF.js's content at x, baseline y, size 10, of width w */
const item = (str: string, x: number, y: number, w: number) => ({
  str,
  transform: [10, 0, 0, 10, x, y],
  width: w,
  height: 10,
  fontName: 'f',
  dir: 'ltr',
})
/** a case: A's items, each with its group (or none), the drawn things and the groups their drawing replaces */
type Case = { items: [ReturnType<typeof item>, string | null][]; drawn: Drawn[] }
const seg = (str: string, x: number, base: number, w: number): TextSeg => ({
  str,
  x,
  y: base - 2.2,
  w,
  h: 9.7,
  base,
  size: 10,
  lx0: 72,
  lx1: 300,
})
const CASES: Record<string, Case> = {
  'a unit’s text and its crop replaced, a kept item inside its block, a kept item outside': {
    items: [
      [item('Hello', 72, 700, 25), 'axt:5.1.t'],
      [item('world', 100, 700, 25), 'axt:5.1.t'],
      [item('x+y', 152, 701, 18), 'axt:5.1.e'],
      [item('(1)', 280, 680, 12), null],
      [item('again', 72, 688, 25), 'axt:5.1.t'],
      [item('Below', 72, 600, 25), null],
    ],
    drawn: [
      {
        key: 'u5',
        unit: 5,
        segs: [
          seg('Hallo Welt ', 72, 700, 70),
          { crop: { page: 1, src: [150, 698, 172, 710], dst: [145, 697, 167, 709], text: 'x+y' }, space: true },
          seg('noch einmal', 72, 688, 60),
        ],
        groups: ['axt:5.1.t', 'axt:5.1.e'],
      },
    ],
  },
  'a babel name replaced within its line, a crop of another page with no item of this page': {
    items: [
      [item('Abstract', 250, 760, 40), 'axt:n3'],
      [item('rest', 300, 760, 20), null],
      [item('Text', 72, 740, 20), 'axt:6.1.t'],
    ],
    drawn: [
      { key: 'n3', segs: [nameSeg('Zusammenfassung', 250, 70, 760, 10)], groups: ['axt:n3'] },
      {
        key: 'u6',
        unit: 6,
        segs: [
          seg('Texte', 72, 740, 25),
          { crop: { page: 2, src: [10, 10, 30, 20], dst: [100, 738, 120, 748], text: 'z' }, space: false },
        ],
        groups: ['axt:6.1.t'],
      },
    ],
  },
  'a drawing that replaces nothing on the page, set by its place': {
    items: [
      [item('Top', 72, 760, 20), null],
      [item('Bottom', 72, 600, 30), null],
    ],
    drawn: [{ key: 'u7', unit: 7, segs: [seg('Mitte', 72, 700, 25)], groups: ['axt:7.1.t'] }],
  },
}

/** today's plan for a case: one hidden rectangle over each item a group of a drawn thing holds, owned by that thing */
function planOf(c: Case, P: Compact) {
  const ops: { op: string; rects: number[][] }[] = [],
    owners: [number, number, string][] = []
  for (const d of c.drawn) {
    const rects = c.items.flatMap(([, g], i) =>
      g && d.groups.includes(g) ? [[P.num[i * 6]! - 0.5, P.num[i * 6 + 1]! - 3, P.num[i * 6 + 2]! + 1, 13]] : [],
    )
    owners.push([ops.length, ops.length + 1, d.key])
    ops.push({ op: 'hidden', rects })
  }
  return { ops, devOf: (x: number, y: number) => [x, y], owners }
}

describe.skipIf(!today)('D.text', () => {
  for (const [name, c] of Object.entries(CASES))
    it(`${name}, as today`, () => {
      const P = today!.itemsOf({ items: c.items.map(([it]) => it), styles: { f: { ascent: 0.8 } } })
      const view = [0, 0, 612, 792]
      const source = today!.itemsOf({ items: [item('z', 12, 12, 8)], styles: { f: { ascent: 0.8 } } })
      const theirs = today!.textLayerOf({ n: 1, items: P, view }, planOf(c, P), c.drawn, { sourceOf: () => source })
      const groups = c.items.map(([, g]) => g)
      const mine = textLayer({ n: 1, items: P, view, groupOf: (i) => groups[i] ?? null }, c.drawn, {
        sourceOf: () => source,
      })
      expect(mine.items).toEqual(theirs.items)
      expect(mine.page).toEqual(theirs.page)
      expect(mine.items.length).toBeGreaterThan(1)
    })
  it('sets a name’s segment in a Latin or a CJK face’s band, as today', () => {
    for (const t of ['Abstract', '摘要']) expect(nameSeg(t, 10, 30, 700, 9)).toEqual(today!.nameSeg(t, 10, 30, 700, 9))
  })
})
