// The facts each crop of a laid page is cut by (the reader's paint.ts cropsOf): its own ink, the box it was cut from (an
// element's crop states it as it is laid, emit/display.ts: its ink on its line as the part states it, El.ink, or the part of
// it the crop draws, inside its own brackets where the translation sets its own round it; a label's crop here: its label's
// boxes, Label.ink and its name, number and punctuation), and the page's every piece's (each element's ink and brackets,
// each label's and babel name's counter's, on the pages the page's crops are cut from). No margin of the typesetter's: a
// glyph's antialiased edge is a device pixel of the render a crop is cut from, which the reader alone knows (a margin
// fixed in points leaves a 1x screen's edge pixels out). What the part does not state a crop cannot keep
// apart: ink in no group (a table's rule, a figure's stroke), ink of an element its box leaves out (a glyph PDF.js reads as
// a blank, an extensible delimiter: locate's element boxes are its glyphs of a Unicode that is not blank), and, for a crop
// cut from another page of its member, the ink of that page's members that are not this page's.
import type { Box, Ink, Part } from '@readarxiv/format'
import type { Item, Laid } from '../types.ts'

type Stated = { ord: number; piece: string; ink: Ink }

/** every piece's ink the part states: its elements', its label's and its counter's (its flows' members': a frame's are its
 *  frame's, lay/entry.ts layPage) */
function inkOf(part: Pick<Part, 'flows'>): Stated[] {
  const out: Stated[] = []
  for (const flow of part.flows)
    for (const m of flow) {
      for (const [id, el] of m.els ?? []) {
        for (const ink of el.ink) out.push({ ord: m.ord, piece: id, ink })
        for (const ink of el.brackets ?? []) out.push({ ord: m.ord, piece: id, ink })
      }
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

/** an ink stated in a frame of direction (ux, uy) (Part.frames) on its page: the box of its four corners turned by the frame's
 *  direction about the page's origin, its baseline that box's bottom (a page's inks are read as boxes alone: paint.ts cropsOf) */
export function inkOnPage(k: Ink, [ux, uy]: readonly [number, number]): Ink {
  const c = [
    [k[1], k[2]],
    [k[3], k[2]],
    [k[1], k[4]],
    [k[3], k[4]],
  ].map(([x, y]) => [ux * x! - uy * y!, uy * x! + ux * y!] as const)
  const x0 = Math.min(...c.map((q) => q[0])),
    y0 = Math.min(...c.map((q) => q[1]))
  return [k[0], x0, y0, Math.max(...c.map((q) => q[0])), Math.max(...c.map((q) => q[1])), y0]
}

/** every piece's ink a part states on the pages `pages`, its frames' turned onto the page (inkOnPage): what a crop of any of its
 *  members is cut clear of, whichever frame it is laid in */
export function pageInks(part: Part, pages: ReadonlySet<number>): Ink[] {
  const all = [
    ...inkOf(part).map((s) => s.ink),
    ...(part.frames ?? []).flatMap((f) => inkOf(f).map((s) => inkOnPage(s.ink, f.dir))),
  ]
  return all.filter((k) => pages.has(k[0]))
}

/**
 * The page's laid members, each label's crop stating its own ink (`ink`: its label's boxes on its page; an element's crop
 * states its own as it is laid), and the page's every piece's ink on the pages its crops are cut from (`inks`: none where it
 * draws no crop)
 */
export function cropInks(members: Laid[], part: Part): { members: Laid[]; inks: Ink[] } {
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
        if (it.ink || it.piece !== 'label') return it
        // (its owner's label: a label carried to the end of the name before is still its own member's, `of`)
        const owner = it.of ?? m.ord
        const own = all.filter((s) => s.ink[0] === page && s.ord === owner && s.piece === 'label')
        return own.length ? { ...it, ink: own.map((s) => box(s.ink)) } : it
      }),
    ])
    return { ...m, lines }
  })
  const all = stated as Stated[] | null
  return { members: out, inks: all ? all.filter((s) => pages.has(s.ink[0])).map((s) => s.ink) : [] }
}
