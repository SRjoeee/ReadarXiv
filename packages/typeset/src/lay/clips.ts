// The facts each crop of a laid page is cut by (the reader's paint.ts cropsOf): its own ink as TeX set it, its piece's boxes
// on the line it was cut from as the part states them (El.ink one a line of TeX's, a label's Label.ink and its name, number
// and punctuation; its element by the place among the row's pieces its `piece` names, which is not the part's id), and the
// page's every piece's (each element's, label's and babel name's counter's, on the pages the page's crops are cut from). No
// margin of the typesetter's: a glyph's antialiased edge is a device pixel of the render a crop is cut from, which the reader
// alone knows (round 5's parity: a margin fixed in points leaves a 1x screen's edge pixels out). What the part does not state
// a crop cannot keep apart: ink in no group (a table's rule, a figure's stroke), ink of an element its box leaves out (a glyph
// PDF.js reads as a blank, an extensible delimiter: locate's element boxes are its glyphs of a Unicode that is not blank), and,
// for a crop cut from another page of its member, the ink of that page's members that are not this page's.
import type { Box, Ink, Part } from '@readarxiv/format'
import type { Item, Laid } from '../types.ts'

type Stated = { ord: number; piece: string; ink: Ink }

/** every piece's ink the part states: its elements', its label's and its counter's */
function inkOf(part: Part): Stated[] {
  const out: Stated[] = []
  for (const flow of part.flows)
    for (const m of flow) {
      for (const [id, el] of m.els ?? []) for (const ink of el.ink) out.push({ ord: m.ord, piece: id, ink })
      const l = m.label
      if (l)
        for (const ink of [l.ink, l.name?.[1], l.num?.[1], l.punct?.[1]])
          if (ink) out.push({ ord: m.ord, piece: 'label', ink })
      const counter = typeof m.text === 'string' ? undefined : m.text.counter
      if (counter) out.push({ ord: m.ord, piece: 'counter', ink: counter[1] })
    }
  return out
}

const box = (ink: Ink): Box => [ink[1], ink[2], ink[3], ink[4]]

/**
 * The page's laid members, each crop stating its own ink (`ink`, its piece's boxes on its line), and the page's every piece's
 * ink on the pages its crops are cut from (`inks`: none where it draws no crop). `elOf(ord, piece)`: the part's element (its
 * El id) a crop of member `ord` is cut from, by the crop's piece (its place among the row's pieces); a label's crop is its
 * piece 'label'
 */
export function cropInks(
  members: Laid[],
  part: Part,
  elOf: (ord: number, piece: string) => string | null,
): { members: Laid[]; inks: Ink[] } {
  let stated: Stated[] | null = null
  const pages = new Set<number>()
  const out = members.map((m) => {
    if (m.state !== 'laid' || !m.lines.some((l) => l[3].some((it) => 'src' in it))) return m
    stated ??= inkOf(part)
    const all = stated
    const lines = m.lines.map(([y, x0, x1, items]): Laid['lines'][number] => [
      y,
      x0,
      x1,
      items.map((it): Item => {
        if (!('src' in it)) return it
        const page = it.src[0]
        pages.add(page)
        // (its own: its piece's boxes on its page; of a piece TeX set on several lines, those of the line it was cut from)
        const piece = it.piece === 'label' ? 'label' : elOf(m.ord, it.piece)
        let own = all.filter((s) => s.ink[0] === page && s.ord === m.ord && s.piece === piece)
        const line = own.filter((s) => s.ink[5] === it.src[5])
        if (line.length && line.length < own.length) own = line
        return own.length ? { ...it, ink: own.map((s) => box(s.ink)) } : it
      }),
    ])
    return { ...m, lines }
  })
  const all = stated as Stated[] | null
  return { members: out, inks: all ? all.filter((s) => pages.has(s.ink[0])).map((s) => s.ink) : [] }
}
