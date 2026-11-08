// Each crop of a laid page drawn through its own ink alone (unit/crops.ts cropClip): the part states every piece's ink on A,
// each element's boxes (El.ink, one a line of TeX's), each label's (Label.ink and its name, number and punctuation) and each
// babel name's counter (Word.counter); a crop's own are its piece's boxes on the line it was cut from (its element's, by the
// element its place among the row's pieces holds: a crop's `piece` is that place, not the part's id), the page's other
// pieces' the ink its rectangle must leave behind. What the part does not state stays in reach of a margin: ink in no group
// (a table's rule, a figure's stroke), always shown in the crop render, and, for a crop cut from another page of its member,
// the ink of that page's members that are not this page's.
import type { Ink, Part } from '@readarxiv/format'
import type { Item, Laid } from '../types.ts'
import { cropClip } from '../unit/crops.ts'

type Rect = [number, number, number, number]
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

const rect = (ink: Ink): Rect => [ink[1], ink[2], ink[3], ink[4]]

/** the page's laid members, each crop of theirs where another piece's ink stands in its rectangle drawn through its clip.
 *  `elOf(ord, piece)`: the part's element (its El id) a crop of member `ord` is cut from, by the crop's piece (its place among
 *  the row's pieces); a label's crop is its piece 'label' */
export function clipCrops(members: Laid[], part: Part, elOf: (ord: number, piece: string) => string | null): Laid[] {
  let stated: Stated[] | null = null
  return members.map((m) => {
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
        const on = all.filter((s) => s.ink[0] === page)
        // (its own: its piece's boxes on its page; of a piece TeX set on several lines, those of the line it was cut from)
        const piece = it.piece === 'label' ? 'label' : elOf(m.ord, it.piece)
        let own = on.filter((s) => s.ord === m.ord && s.piece === piece)
        const line = own.filter((s) => s.ink[5] === it.src[5])
        if (line.length && line.length < own.length) own = line
        const clip = cropClip(
          it.src,
          own.map((s) => rect(s.ink)),
          on.filter((s) => !own.includes(s)).map((s) => rect(s.ink)),
        )
        return clip ? { ...it, clip } : it
      }),
    ])
    return { ...m, lines }
  })
}
