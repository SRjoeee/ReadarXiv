// A frame's members on their page (docs/PDF-READER.md §18.113): a part states the units TeX set turned in the frame of their turn
// (Part.frames); what reads a member on the page (the composer's registry: the text layer, the marks, a pane's sync; the
// contents: a heading's place) reads them turned onto it, as one traversal. Its own module, so that the reader's shell, whose
// contents place a part's headings, holds it without the composer's chunk.
import type { Part, Placed } from '@readarxiv/format'

/** a box of the frame of direction (ux, uy) on the page (a frame's (x, y) is the page's (ux x - uy y, uy x + ux y), Part.frames):
 *  the box of its four corners turned by it */
function boxOnPage([ux, uy]: readonly [number, number], b: readonly number[]): [number, number, number, number] {
  const c = [
    [b[0]!, b[1]!],
    [b[2]!, b[1]!],
    [b[0]!, b[3]!],
    [b[2]!, b[3]!],
  ].map(([x, y]) => [ux * x! - uy * y!, uy * x! + ux * y!] as const)
  return [
    Math.min(...c.map((q) => q[0])),
    Math.min(...c.map((q) => q[1])),
    Math.max(...c.map((q) => q[0])),
    Math.max(...c.map((q) => q[1])),
  ]
}
/** a frame's member on the page (docs/PDF-READER.md §18.113): each line its box turned onto the page (across, x0 to x1; up,
 *  its bottom to its top), its measure that box's extent across, its elements' and its label's ink their boxes turned so, their
 *  baselines the boxes' bottoms; everything else as the part states it */
export function onPage(m: Placed, dir: readonly [number, number]): Placed {
  type Ink = [number, number, number, number, number, number]
  const ink = (k: Ink): Ink => {
    const [x0, y0, x1, y1] = boxOnPage(dir, [k[1], k[2], k[3], k[4]])
    return [k[0], x0, y0, x1, y1, y0]
  }
  const lines = m.lines.map((l) => {
    const [x0, y0, x1, y1] = boxOnPage(dir, [l[2], l[6], l[3], l[5]])
    const out = [...l] as typeof l
    out[2] = x0
    out[3] = x1
    out[4] = y0
    out[5] = y1
    out[6] = y0
    out[7] = x0
    out[8] = x1
    return out
  })
  const lb = m.label
  return {
    ...m,
    lines,
    ...(m.els
      ? {
          els: m.els.map(([id, e]): NonNullable<Placed['els']>[number] => [
            id,
            { ...e, ink: e.ink.map((k) => ink(k as Ink)) },
          ]),
        }
      : {}),
    ...(lb
      ? {
          label: {
            ...lb,
            ink: ink(lb.ink as Ink),
            ...(lb.name ? { name: [lb.name[0], ink(lb.name[1] as Ink)] as typeof lb.name } : {}),
            ...(lb.num ? { num: [lb.num[0], ink(lb.num[1] as Ink)] as typeof lb.num } : {}),
            ...(lb.punct ? { punct: [lb.punct[0], ink(lb.punct[1] as Ink)] as typeof lb.punct } : {}),
          },
        }
      : {}),
  }
}

/** a part's members on its page: its flows' as stated, its frames' turned onto it (onPage) */
export function membersOnPage(part: Part): Placed[] {
  return [
    ...part.flows.flat(),
    ...(part.frames ?? []).flatMap((f) => f.flows.flatMap((flow) => flow.map((m) => onPage(m, f.dir)))),
  ]
}
