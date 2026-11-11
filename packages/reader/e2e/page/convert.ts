// The Page fixtures (stage 2, deliverable 6): a reader dump in the baseline's format (readarxiv-lab-data/refactor-2026-11/
// baseline/FORMAT.md §4: each laid unit's size, leading, lines and the text on each, its crops) made into the `Page`s the reader
// paints, over the parts of lane L1's bundle of the same paper, so that the reader runs before lane L3's typesetter exists, and
// its `layPage` then takes the converter's place behind the same call (`Lay`). The same converter reads the baseline's dumps of
// corpus papers (licensed: read in place, never committed) and the dumps of the repository's own papers.
//
// A dump says less than a display list: a line's text, not its runs' places. So a line is one run from its start to its first
// crop, each crop where the dump drew it, and the text after a crop from the crop's end; nothing is justified. A unit is joined
// to its member by its id, equal ids by their order (the baseline's comparator's rule); a crop to the element of that member on
// that page whose ink is of its width (its piece by number first).
import type { El, Part, Placed } from '@readarxiv/format'
import { CJK_INK } from '@readarxiv/typeset'
import type { Box, FaceId, Item, Lay, Laid, Page, Rows } from '../../src/compose/page.ts'

export interface DumpLine {
  page: number
  x0: number
  x1: number
  baseline: number
  text: string
}
export interface DumpUnit {
  id: string
  ord: number
  kind: string
  size: number
  leading: number
  lines: DumpLine[]
  elements?: { k: number; page: number; x0: number; x1: number; top: number; bottom: number }[]
}
export interface ReaderDump {
  units: DumpUnit[]
  notLaid?: { id: string; ord: number; why: string }[]
}

const r2 = (v: number) => Math.round(v * 100) / 100
/** a member's displays on a page, each a block of its own by its piece (Laid.lit's `own`, as the typesetter's lit.ts states it) */
const displaysOf = (m: Placed, page: number): [string, Box[]][] =>
  (m.els ?? []).flatMap(([id, el]): [string, Box[]][] => {
    const boxes =
      el.kind === 'display' ? el.ink.filter((i) => i[0] === page).map((i) => [i[1], i[2], i[3], i[4]] as Box) : []
    return boxes.length ? [[id, boxes]] : []
  })
/** a member's own boxes on a page: its lines' [x0, bottom, x1, top], but its displays' rows (a KEPT line on one: the display's) */
const lineBoxes = (m: Placed, page: number): Box[] => {
  const ds = displaysOf(m, page).flatMap(([, b]) => b)
  const onDisplay = (l: Placed['lines'][number]) =>
    !!(l[9] & 1) &&
    ds.some(
      (d) =>
        Math.min(l[3], d[2]) > Math.max(l[2], d[0]) &&
        Math.min(l[5], d[3]) - Math.max(l[6], d[1]) > 0.5 * (l[5] - l[6]),
    )
  return m.lines.filter((l) => l[0] === page && !onDisplay(l)).map((l) => [l[2], l[6], l[3], l[5]] as Box)
}

/** every member of the parts, once (a part repeats the flows of the page a member begins on), by ord */
export function membersOf(parts: Iterable<Part>): Map<number, Placed> {
  const out = new Map<number, Placed>()
  for (const part of parts) for (const flow of part.flows) for (const m of flow) if (!out.has(m.ord)) out.set(m.ord, m)
  return out
}

/** each dump unit's member: by id, the k-th by ord with the k-th */
function join(members: Map<number, Placed>, dump: ReaderDump): Map<number, DumpUnit> {
  const byId = new Map<string, Placed[]>()
  for (const m of [...members.values()].sort((a, b) => a.ord - b.ord))
    if (typeof m.text === 'string') byId.set(m.text, [...(byId.get(m.text) ?? []), m])
  const units = new Map<string, DumpUnit[]>()
  for (const u of [...dump.units].sort((a, b) => a.ord - b.ord)) units.set(u.id, [...(units.get(u.id) ?? []), u])
  const out = new Map<number, DumpUnit>()
  for (const [id, us] of units) {
    const ms = byId.get(id) ?? []
    us.forEach((u, k) => {
      const m = ms[k]
      if (m) out.set(m.ord, u)
    })
  }
  return out
}

/** member m's laid lines on `page` from dump unit u, its groups off and its crops' elements */
function laidOf(m: Placed, u: DumpUnit, page: number, faceOf: (m: Placed) => FaceId): Laid | null {
  const lines = u.lines.filter((l) => l.page === page)
  if (!lines.length) return null
  const crops = (u.elements ?? []).filter((e) => e.page === page)
  const els = (m.els ?? []).map(
    ([id, el]) => [id, el, el.ink.find((i) => i[0] === page) ?? null] as [string, El, El['ink'][number] | null],
  )
  const used = new Set<string>()
  let crop = 0
  const face = faceOf(m)
  const out: Laid['lines'] = []
  for (const l of lines) {
    const items: Item[] = []
    const parts = l.text.split('￼')
    let x = l.x0
    parts.forEach((s, i) => {
      if (s.trim()) items.push({ s, x: r2(x), face, size: u.size })
      if (i === parts.length - 1) return
      const e = crops[crop++]
      if (!e) return
      const w = e.x1 - e.x0
      const free = els.filter(([id, , ink]) => ink && !used.has(id))
      const pick =
        free.find(([id, , ink]) => id === String(e.k) && ink && Math.abs(ink[3] - ink[1] - w) < Math.max(2, 0.2 * w)) ??
        free.sort(
          (a, b) =>
            Math.abs((a[2] as number[])[3]! - (a[2] as number[])[1]! - w) -
            Math.abs((b[2] as number[])[3]! - (b[2] as number[])[1]! - w),
        )[0]
      if (pick?.[2]) {
        used.add(pick[0])
        const ink = pick[2]
        const k = Math.min(2, Math.max(0.5, w / Math.max(0.01, ink[3] - ink[1])))
        items.push({ s: pick[1].text ?? '', x: r2(e.x0), src: ink, k: r2(k), piece: pick[0] })
      }
      x = e.x1
    })
    out.push([l.baseline, l.x0, l.x1, items])
  }
  // its label: off where the translation's first line stands over it (set anew in the text), else it stays
  const first = out[0]
  const label = m.label && m.label.ink[0] === page ? m.label : null
  const relabelled = !!label && !!first && first[1] < label.ink[3] - 0.5 && first[0] >= label.ink[2]
  const right: Box[] = out.map(([y, x0, x1]) => [x0, r2(y - 0.25 * u.size), x1, r2(y + 0.8 * u.size)])
  // (its kept ink: a display a block of its own, any other piece lit with the member on both panes)
  const keptBoxes = els
    .filter(([, el, ink]) => el.keep && el.kind !== 'display' && ink)
    .map(([, , ink]) => [ink![1], ink![2], ink![3], ink![4]] as Box)
  return {
    ord: m.ord,
    page,
    state: 'laid',
    off: 1 | (used.size ? 2 : 0) | (relabelled ? 4 : 0),
    fit: { size: u.size, lead: r2(u.leading * m.lead), track: 0 },
    lines: out,
    lit: { left: [[...lineBoxes(m, page), ...keptBoxes]], right: [[...right, ...keptBoxes]], own: displaysOf(m, page) },
  }
}

/** every laid page of a dump: page → Page, as committed */
export function pagesOf(parts: Map<number, Part>, dump: ReaderDump, faceOf: (m: Placed) => FaceId): Map<number, Page> {
  const members = membersOf(parts.values())
  const units = join(members, dump)
  const out = new Map<number, Page>()
  for (const [page, part] of parts) {
    const here = [...membersOf([part]).values()]
      .filter((m) => m.lines.some((l) => l[0] === page))
      .sort((a, b) => a.ord - b.ord)
    const laid: Laid[] = here.map((m) => {
      const u = units.get(m.ord)
      const l = u && !m.why ? laidOf(m, u, page, faceOf) : null
      return (
        l ?? {
          ord: m.ord,
          page,
          state: m.why ?? 'none',
          off: 0,
          lines: [],
          lit: { left: [lineBoxes(m, page)], right: [lineBoxes(m, page)], own: displaysOf(m, page) },
        }
      )
    })
    // the page's links: moved with the crop of the element that holds one, else where A has them; each with its own
    // annotation's border (Link.border), as the typesetter carries it
    const at = new Map(laid.map((l) => [l.ord, l]))
    const links: Page['links'] = (part.links ?? []).map((k): Page['links'][number] => {
      const owner = k.owner ? at.get(k.owner[0]) : undefined
      const c = owner?.lines
        .flatMap(([y, , , items]) => items.flatMap((i) => ('src' in i && i.piece === k.owner?.[1] ? [{ i, y }] : [])))
        .at(0)
      const dx = c ? c.i.x - c.i.src[1] : 0,
        dy = c ? c.y - c.i.src[5] : 0
      const box: Box = c ? [r2(k.box[0] + dx), r2(k.box[1] + dy), r2(k.box[2] + dx), r2(k.box[3] + dy)] : k.box
      return k.border ? [box, k.to, undefined, k.border] : [box, k.to]
    })
    out.set(page, { page, wait: { rows: [], faces: [] }, members: laid, links })
  }
  return out
}

/** the stand-in of the typesetter's layPage over converted pages: a page whose laid members' rows are not all in waits for
 *  them (every member 'waiting', lit whole from A, nothing off), unless no other row will come; then those members are the
 *  original's ('none'). A member whose row says it has no translation is the original's ('refused') at once */
export function fixtureLay(pages: Map<number, Page>, parts: Map<number, Part>): Lay {
  const members = membersOf(parts.values())
  return (part: Part, rows: Rows): Page => {
    const page0 = pages.get(part.page)
    if (!page0) return { page: part.page, wait: { rows: [], faces: [] }, members: [], links: [] }
    const textOf = (ord: number) => members.get(ord)?.text
    const refused = new Set(
      page0.members
        .filter((l) => typeof textOf(l.ord) === 'string' && rows.get(textOf(l.ord) as string)?.ok === false)
        .map((l) => l.ord),
    )
    const page: Page = refused.size
      ? {
          ...page0,
          members: page0.members.map((l) =>
            refused.has(l.ord)
              ? {
                  ...l,
                  state: 'refused',
                  off: 0,
                  lines: [],
                  lit: { left: l.lit.left, right: l.lit.left, own: l.lit.own },
                }
              : l,
          ),
        }
      : page0
    const missing = page.members.filter(
      (l) => l.state === 'laid' && typeof textOf(l.ord) === 'string' && !rows.get(textOf(l.ord) as string),
    )
    if (!missing.length) return page
    if (!rows.done)
      return {
        page: page.page,
        wait: { rows: [...new Set(missing.map((l) => textOf(l.ord) as string))], faces: [] },
        members: page.members.map((l) => ({
          ...l,
          state: 'waiting',
          off: 0,
          lines: [],
          lit: { left: l.lit.left, right: l.lit.left, own: l.lit.own },
        })),
        links: [],
      }
    const gone = new Set(missing.map((l) => l.ord))
    return {
      ...page,
      members: page.members.map((l) =>
        gone.has(l.ord)
          ? { ...l, state: 'none', off: 0, lines: [], lit: { left: l.lit.left, right: l.lit.left, own: l.lit.own } }
          : l,
      ),
    }
  }
}

/** a colour of a run's own (as a notice line's or a link's): the dimmed pages' check */
export const COLOURED = 0xc00000
/**
 * Three inks on page `n` (the dimmed pages' check): its first laid member of three lines of text or more keeps its first as laid
 * (runs that name no fill: the layer's ink), its second's runs set in CJK characters in CJK_INK (the fill the typesetter gives a
 * CJK run, typeset display.ts), its third's in COLOURED
 */
export function inked(lay: Lay, n: number): Lay {
  const texty = (l: Laid['lines'][number]) => l[3].some((it) => !('src' in it))
  return (part, rows) => {
    const p = lay(part, rows)
    const at =
      part.page === n ? p.members.findIndex((m) => m.state === 'laid' && m.lines.filter(texty).length >= 3) : -1
    if (at < 0) return p
    const m = p.members[at] as Laid
    let k = 0
    const lines = m.lines.map((l): Laid['lines'][number] => {
      if (!texty(l)) return l
      const which = k++
      if (which !== 1 && which !== 2) return l
      const items = l[3].map((it): Item => {
        if ('src' in it) return it
        if (which === 2) return { ...it, fill: COLOURED }
        // (a CJK character about twice a Latin one's width: half as many, so that the line keeps within its page)
        const n = Math.ceil([...it.s].length / 2)
        return {
          ...it,
          s: '\u6c38'.repeat(n),
          fill: CJK_INK,
          ...(it.dx ? { dx: it.dx.filter((_, i) => i % 2 === 0).slice(0, n) } : {}),
        }
      })
      return [l[0], l[1], l[2], items]
    })
    return { ...p, members: p.members.map((x, i) => (i === at ? { ...m, lines } : x)) }
  }
}
