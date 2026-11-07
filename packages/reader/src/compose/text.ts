// A laid page's text layer (design §4.5 "Text and links"; design-a §1.4 "hiding and text by the same groups"; docs/PDF-READER.md
// §11.11): arXiv's text content of the page in content-stream order, the items under a group that is off dropped and the member's
// laid items put at its first dropped item, so that selection, the browser's find and a screen reader meet one copy of the text,
// in reading order (I8). Built by PDF.js's own TextLayerBuilder (its handling of a drag and of a copy), carried from today's
// layer text (layer-proto/textlayer.mjs, view/text-layer.mjs at baf2083e0):
//
// - a crop's text is the original's text under its source, moved to where the crop is drawn (a formula's text where its ink is
//   drawn); a crop with none under it carries its own plain text;
// - a kept item the stream sets between two of one member's dropped items (a display the unit keeps, a float set inside its
//   run) goes inside the member's block, before the first of its lines below it or on its line to its right;
// - between two sources a copy breaks the line where they stand on two lines and gets a space where they stand apart on one;
//   a translated paragraph's lines are joined as one;
// - the page's own items that abut on one baseline at one size are one item, and a layer holds at most TEXT_ITEMS_MAX items
//   (past it a line's neighbours are merged);
// - the layer is the paper's language (`en`), each translated span the target's.
//
// Which group an item is under: PDF.js's text content reports our `/OC /<prop> BDC` as a marked content of tag OC with no name
// (pdf.worker.mjs 6.3.289: its id is an MCID only), and splits its items at every BDC and EMC, so that every item lies in one run
// of one group, and a run is one group's ink, drawn or hidden whole (docs/PDF-READER.md §19.9 "The wrap": a run of ours closes at
// any marked content, so it holds none). So an OC run that holds marked content is the page's own optional content, never ours:
// its items are kept and each run inside it is read on its own (1706.03762v7 pp. 13-15, a figure's own `/OC` around 60 of ours).
// A run of ours is the group its items stand on: each item's middle along its own direction, on its baseline, against a unit's
// elements' and label's ink before its lines (an element lies inside its line), with half a point to spare; exact ownership makes
// them disjoint. Each item, not the run's middle, since a run may span several of its member's lines and its middle stand on none.
// Its items on two units' boxes: no one unit's run, kept whole; between one unit's groups, the one under most of its characters.
// Measured over the 87 corpus papers' 2,328 pages against the name the operator list gives each BDC (2026-11-07): of our 206,794
// runs with text, 205,968 given their group, 793 their unit with another of its groups (a raised mark beside its element's ink),
// 1 another unit, 32 none, none on two units; the 5 runs holding marked content all the page's own. (The add-on naming each run,
// a `/axt:<ord>.<page>.<g> BMC` inside it, would put the name in the text content itself: asked of the prepare.)
import type { Placed } from '@readarxiv/format'
import type { PageViewport, PDFPageProxy } from 'pdfjs-dist'
import type { Kit } from '../pdfjs/kit.ts'
import type { Faces } from './faces.ts'
import type { Ink, Item, Laid, Page } from './page.ts'

/** PDF.js's text content of a page, and a text item of it */
export type TextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>
export type TextItem = Extract<TextContent['items'][number], { str: string }>
type Marked = { type: string; tag?: string | null }
type Entry = TextItem | Marked
const isText = (e: Entry): e is TextItem => typeof (e as TextItem).str === 'string'
const EPS = 0.5
/** the items a page's layer takes at most (layer-proto/textlayer.mjs TEXT_ITEMS_MAX) */
export const TEXT_ITEMS_MAX = 2000
/** the paper's language, on the text layer (docs/PDF-READER.md §13) */
export const SOURCE_LANG = 'en'
/** how far past a crop's ink its source reaches, PDF units (paint.ts CLIP_PAD) */
const PAD = 0.6
/** CJK and other scripts written with no space between words (a line break of a translation adds none) */
const NO_SPACE: readonly [number, number][] = [
  [0x2e80, 0x9fff],
  [0xac00, 0xd7af],
  [0xf900, 0xfaff],
  [0xff00, 0xffef],
  [0x3000, 0x303f],
]
const noSpace = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0
  return NO_SPACE.some(([a, b]) => c >= a && c <= b)
}

/** an item read across as a line: no rotation, skew or mirror, not of a vertical face */
const upright = (it: TextItem, c: TextContent) => {
  const [a, b, cc, d] = it.transform as number[]
  const style = (c.styles as Record<string, { vertical?: boolean }>)[it.fontName]
  return b === 0 && cc === 0 && (a as number) > 0 && (d as number) > 0 && !style?.vertical
}
const sizeOf = (it: TextItem) => Math.abs((it.transform[3] as number) || (it.transform[0] as number)) || 1
/** the band of the page's height an index of its boxes is cut in, PDF units */
const BAND = 16
/** where an item stands: the middle of its advance along its own direction, on its baseline (a turned figure word's too) */
function placeOf(it: TextItem): [number, number] {
  const [a, b, , , e, f] = it.transform as number[]
  const s = Math.hypot(a as number, b as number) || 1
  return [(e as number) + ((a as number) / s) * (it.width / 2), (f as number) + ((b as number) / s) * (it.width / 2)]
}
/** the boxes a page's runs stand on, of the members given, indexed once a page by bands of its height: a point asks only the
 *  boxes across its band, in their order (every unit's elements' ink, then its label's, then its lines), so that placing a page's
 *  items is linear in them. The group (member's ord and bit) under a point, or null */
function placesOf(page: number, members: Map<number, Placed>): (x: number, y: number) => [number, number] | null {
  type Box = { x0: number; y0: number; x1: number; y1: number; g: [number, number] }
  const boxes: Box[] = []
  for (const m of members.values())
    for (const [, el] of m.els ?? [])
      for (const i of el.ink) if (i[0] === page) boxes.push({ x0: i[1], y0: i[2], x1: i[3], y1: i[4], g: [m.ord, 2] })
  for (const m of members.values()) {
    const li = m.label?.ink
    if (li && li[0] === page) boxes.push({ x0: li[1], y0: li[2], x1: li[3], y1: li[4], g: [m.ord, 4] })
  }
  for (const m of members.values())
    for (const l of m.lines) if (l[0] === page) boxes.push({ x0: l[2], y0: l[6], x1: l[3], y1: l[5], g: [m.ord, 1] })
  const bands = new Map<number, Box[]>()
  for (const b of boxes)
    for (let k = Math.floor((b.y0 - EPS) / BAND); k <= Math.floor((b.y1 + EPS) / BAND); k++) {
      const at = bands.get(k)
      if (at) at.push(b)
      else bands.set(k, [b])
    }
  return (x, y) => {
    for (const b of bands.get(Math.floor(y / BAND)) ?? [])
      if (x >= b.x0 - EPS && x <= b.x1 + EPS && y >= b.y0 - EPS && y <= b.y1 + EPS) return b.g
    return null
  }
}
/** the group a run of ours is under: of the one unit its items stand on, the group under most of its characters, an element's
 *  or label's before its lines at a tie; null where they stand on none, or on two units' boxes (no one unit's run to drop: kept) */
function groupOf(run: TextItem[], at: (x: number, y: number) => [number, number] | null): [number, number] | null {
  const chars = new Map<number, { g: [number, number]; n: number }>()
  let ord: number | null = null
  for (const it of run) {
    const n = it.str.trim().length
    if (!n) continue
    const g = at(...placeOf(it))
    if (!g) continue
    if (ord === null) ord = g[0]
    else if (g[0] !== ord) return null
    const c = chars.get(g[1]) ?? { g, n: 0 }
    c.n += n
    chars.set(g[1], c)
  }
  let best: { g: [number, number]; n: number } | null = null
  for (const c of chars.values()) if (!best || c.n > best.n || (c.n === best.n && best.g[1] === 1)) best = c
  return best?.g ?? null
}

/** the items of a crop's source among the dropped items of its member (each item's middle inside the source's ink), moved by
 *  the crop's map to where it is drawn: x from the crop's place, the source's baseline on the line's */
function movedOf(dropped: TextItem[], src: Ink, k: number, x: number, y: number): TextItem[] {
  const [, x0, y0, x1, y1, base] = src
  const out: TextItem[] = []
  for (const it of dropped) {
    if (!it.str.trim()) continue
    const [a, , , d, e, f] = it.transform as number[]
    const cx = (e as number) + it.width / 2,
      cy = (f as number) + 0.3 * sizeOf(it)
    if (cx < x0 - PAD || cx > x1 + PAD || cy < y0 - PAD || cy > y1 + PAD) continue
    out.push({
      ...it,
      transform: [
        (a as number) * k,
        0,
        0,
        (d as number) * k,
        x + ((e as number) - x0) * k,
        y + ((f as number) - base) * k,
      ],
      width: it.width * k,
      height: it.height * k,
      hasEOL: false,
    })
  }
  return out
}

/** the text content of a laid page: A's, its runs under a group that is off dropped, each member's laid items in their place;
 *  `translated` the indices (among its text items) of the translation's items, which carry the target's language */
export function laidText(
  content: TextContent,
  page: Page,
  members: Map<number, Placed>,
  faces: Faces,
  measure: (s: string, family: string, size: number) => number,
): { content: TextContent; dropped: number; inserted: number; translated: number[] } {
  const laid = new Map<number, Laid>()
  for (const m of page.members) if (m.state === 'laid' && m.off) laid.set(m.ord, m)
  const here = new Map([...members].filter(([ord]) => laid.has(ord)))
  const at = placesOf(page.page, here)
  const styles: Record<string, { fontFamily: string; ascent: number; descent: number; vertical: boolean }> = {
    ...(content.styles as Record<string, { fontFamily: string; ascent: number; descent: number; vertical: boolean }>),
  }
  // ---- the stream, its runs read: each entry kept, or a run dropped under one member's group that is off
  type Piece = { kind: 'kept'; e: Entry } | { kind: 'run'; ord: number; bit: number; items: TextItem[] }
  const stream: Piece[] = []
  const entries = content.items as Entry[]
  let dropped = 0
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i] as Entry
    // (rotated and vertical text, an axis label turned a quarter, is left out of the layer: the left's layer has it,
    // textlayer.mjs itemsOf, "Not in v1")
    if (isText(e) && !upright(e, content)) continue
    if (isText(e) || e.type !== 'beginMarkedContentProps' || e.tag !== 'OC') {
      stream.push({ kind: 'kept', e })
      continue
    }
    // (the run's items, to the next marked content: its EMC for a run of ours; any other, the page's own, kept, the items and runs
    // inside it read in turn)
    let j = i + 1
    const run: TextItem[] = []
    for (; j < entries.length && isText(entries[j] as Entry); j++) run.push(entries[j] as TextItem)
    const ours = (entries[j] as Marked | undefined)?.type === 'endMarkedContent'
    const g = ours ? groupOf(run, at) : null
    const m = g ? laid.get(g[0]) : undefined
    if (m && g && m.off & g[1]) {
      dropped += run.length
      stream.push({ kind: 'run', ord: m.ord, bit: g[1], items: run })
      i = j
      continue
    }
    stream.push({ kind: 'kept', e })
  }
  // ---- each member's block: its lines' items, a crop's the original's text under its source moved, else its own text
  const droppedOf = new Map<number, TextItem[]>()
  const firstAt = new Map<number, number>(),
    lastAt = new Map<number, number>()
  stream.forEach((p, i) => {
    if (p.kind !== 'run') return
    droppedOf.set(p.ord, [...(droppedOf.get(p.ord) ?? []), ...p.items])
    if (!firstAt.has(p.ord)) firstAt.set(p.ord, i)
    lastAt.set(p.ord, i)
  })
  /** the translation's items (the target's language), and each block's items by its member (its source: a translated item,
   *  or the original's text a crop moved there) */
  const translatedSet = new Set<TextItem>()
  const src = new Map<TextItem, number>()
  type Line = { y: number; x0: number; x1: number; items: TextItem[] }
  const linesOf = (m: Laid): Line[] => {
    const out: Line[] = []
    for (const [y, x0, x1, items] of m.lines) {
      const xs: TextItem[] = []
      items.forEach((it: Item) => {
        if ('src' in it) {
          const moved = it.src[0] === page.page ? movedOf(droppedOf.get(m.ord) ?? [], it.src, it.k, it.x, y) : []
          if (moved.length) {
            for (const t of moved) src.set(t, m.ord)
            xs.push(...moved)
            return
          }
        }
        if (!it.s) return
        const face = 'face' in it ? it.face : null
        const size = 'size' in it ? it.size : it.k * (it.src[4] - it.src[2] || 1)
        const family = face ? faces.familyOf(face) : 'sans-serif'
        const font = `axt-${face ?? 'crop'}`
        styles[font] ??= { fontFamily: family, ascent: 0.8, descent: -0.2, vertical: false }
        const width = 'src' in it ? (it.src[3] - it.src[1]) * it.k : measure(it.s, family, size)
        const t: TextItem = {
          str: it.s,
          dir: 'ltr',
          transform: [size, 0, 0, size, it.x, y],
          width,
          height: size,
          fontName: font,
          hasEOL: false,
        }
        translatedSet.add(t)
        src.set(t, m.ord)
        xs.push(t)
      })
      if (xs.length) out.push({ y, x0, x1, items: xs })
    }
    // (a translated paragraph's lines joined as one: a space at a line's end between two words of a script that spaces them)
    for (let i = 0; i + 1 < out.length; i++) {
      const a = (out[i] as Line).items.at(-1) as TextItem,
        b = (out[i + 1] as Line).items[0] as TextItem
      const ca = a.str.at(-1) ?? '',
        cb = b.str[0] ?? ''
      if (!/\s/.test(ca) && !/\s/.test(cb) && ca !== '-' && !noSpace(ca) && !noSpace(cb))
        (out[i] as Line).items[(out[i] as Line).items.length - 1] = withStr(a, `${a.str} `, translatedSet, src)
    }
    return out
  }
  // ---- a kept item between two of one member's dropped items: inside its block, before the first of its lines below it or on
  // its line to its right (in its column: the line's slot across)
  const into = new Map<number, Map<number, TextItem[]>>() // ord → line index → kept items before it
  const after = new Map<number, TextItem[]>() // ord → kept items after its block
  const moved = new Set<number>() // stream indices taken into a block
  const blocks = new Map<number, Line[]>()
  for (const ord of firstAt.keys()) {
    const m = laid.get(ord) as Laid
    const ls = linesOf(m)
    blocks.set(ord, ls)
    const a = firstAt.get(ord) as number,
      b = lastAt.get(ord) as number
    for (let i = a + 1; i < b; i++) {
      const p = stream[i] as Piece
      if (p.kind !== 'kept' || !isText(p.e) || moved.has(i)) continue
      const it = p.e
      const [, , , , e, f] = it.transform as number[]
      const sz = sizeOf(it)
      const li = ls.findIndex(
        (l) =>
          (l.y < (f as number) - 0.5 * sz && (e as number) >= l.x0 - EPS && (e as number) <= l.x1 + EPS) ||
          (Math.abs(l.y - (f as number)) <= 0.5 * sz && l.x0 >= (e as number) - EPS),
      )
      moved.add(i)
      if (li < 0) after.set(ord, [...(after.get(ord) ?? []), it])
      else {
        const at = into.get(ord) ?? new Map<number, TextItem[]>()
        at.set(li, [...(at.get(li) ?? []), it])
        into.set(ord, at)
      }
    }
  }
  // ---- the content in the stream's order, each member's block at its first dropped item
  const out: Entry[] = []
  let inserted = 0
  const put = new Set<number>()
  const putBlock = (ord: number) => {
    if (put.has(ord)) return
    put.add(ord)
    const ls = blocks.get(ord) ?? linesOf(laid.get(ord) as Laid)
    const at = into.get(ord)
    ls.forEach((l, i) => {
      for (const k of at?.get(i) ?? []) out.push(k)
      for (const t of l.items) {
        out.push(t)
        inserted++
      }
    })
    for (const k of after.get(ord) ?? []) out.push(k)
  }
  stream.forEach((p, i) => {
    if (p.kind === 'kept') {
      if (!moved.has(i)) out.push(p.e)
      return
    }
    if (firstAt.get(p.ord) === i) putBlock(p.ord)
  })
  // (a member none of whose runs was found in the content: its items at the end, so that its words are read)
  for (const ord of laid.keys()) if (!put.has(ord)) putBlock(ord)
  // ---- the breaks between sources, the page's own pieces merged, the cap
  const texts = breaks(out, translatedSet, src)
  const merged = merge(texts, translatedSet, src, TEXT_ITEMS_MAX)
  const translated: number[] = []
  let k = 0
  for (const e of merged) {
    if (!isText(e)) continue
    if (translatedSet.has(e)) translated.push(k)
    k++
  }
  return {
    content: { ...content, items: merged as TextContent['items'], styles: styles as TextContent['styles'] },
    dropped,
    inserted,
    translated,
  }
}

/** an item with another text or line end (its translation's mark and its source carried) */
function withStr(
  it: TextItem,
  str: string,
  translated: Set<TextItem>,
  src: Map<TextItem, number>,
  hasEOL = it.hasEOL,
): TextItem {
  const t = { ...it, str, hasEOL }
  if (translated.has(it)) translated.add(t)
  const s = src.get(it)
  if (s !== undefined) src.set(t, s)
  return t
}
/** between two sources (the original's and a translation's), a line's end where they stand on two lines, a space where they
 *  stand apart on one; within a source its own (PDF.js's hasEOL; a translated paragraph's lines joined as one) */
function breaks(entries: Entry[], translated: Set<TextItem>, src: Map<TextItem, number>): Entry[] {
  const out = entries.slice()
  let prev = -1
  for (let i = 0; i < out.length; i++) {
    const e = out[i] as Entry
    if (!isText(e) || !e.str) continue
    if (prev >= 0) {
      const a = out[prev] as TextItem
      if ((src.get(a) ?? -1) !== (src.get(e) ?? -1) && !a.hasEOL) {
        const [, , , , ae, af] = a.transform as number[]
        const [, , , , be, bf] = e.transform as number[]
        const sz = Math.max(sizeOf(a), sizeOf(e))
        if (Math.abs((af as number) - (bf as number)) > 0.5 * sz) out[prev] = withStr(a, a.str, translated, src, true)
        else if ((be as number) - ((ae as number) + a.width) > 0.15 * sz && !/\s$/.test(a.str) && !/^\s/.test(e.str))
          out[prev] = withStr(a, `${a.str} `, translated, src)
      }
    }
    prev = i
  }
  return out
}
/** the page's own items that abut on one baseline at one size made one (a run PDF.js reads in pieces where its font changes);
 *  past `max` items, a line's neighbours merged whatever their gap */
function merge(entries: Entry[], translated: Set<TextItem>, src: Map<TextItem, number>, max: number): Entry[] {
  const join = (list: Entry[], loose: boolean): Entry[] => {
    const out: Entry[] = []
    for (const e of list) {
      const a = out.at(-1)
      if (
        a &&
        isText(a) &&
        isText(e) &&
        !a.hasEOL &&
        a.str &&
        e.str &&
        (src.get(a) ?? -1) === (src.get(e) ?? -1) &&
        translated.has(a) === translated.has(e)
      ) {
        const [aa, ab, , ad, ae, af] = a.transform as number[]
        const [ba, bb, , bd, be, bf] = e.transform as number[]
        const sz = sizeOf(a)
        const one =
          ab === 0 &&
          bb === 0 &&
          Math.abs((af as number) - (bf as number)) <= 0.05 * sz &&
          Math.abs((ad as number) - (bd as number)) <= 0.01 * sz &&
          Math.abs((aa as number) - (ba as number)) <= 0.01 * Math.abs((aa as number) || 1)
        const gap = (be as number) - ((ae as number) + a.width)
        if (one && (loose || (!src.has(a) && gap >= -0.1 * sz && gap <= 0.15 * sz))) {
          const t: TextItem = {
            ...a,
            str: a.str + (gap > 0.08 * sz && !/\s$/.test(a.str) && !/^\s/.test(e.str) ? ' ' : '') + e.str,
            width: Math.max(a.width, (be as number) + e.width - (ae as number)),
            hasEOL: e.hasEOL,
          }
          if (translated.has(a)) translated.add(t)
          const s0 = src.get(a)
          if (s0 !== undefined) src.set(t, s0)
          out[out.length - 1] = t
          continue
        }
      }
      out.push(e)
    }
    return out
  }
  let out = join(entries, false)
  const count = (l: Entry[]) => l.reduce((n, e) => n + (isText(e) ? 1 : 0), 0)
  if (count(out) > max) out = join(out, true)
  if (count(out) > max) {
    let k = 0
    out = out.filter((e) => !isText(e) || ++k <= max)
  }
  return out
}

/** a canvas measure of a string in a family at a size (PDF units: the size is in them) */
export function canvasMeasure(): (s: string, family: string, size: number) => number {
  const ctx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D
  return (s, family, size) => {
    ctx.font = `100px ${family}`
    return (ctx.measureText(s).width / 100) * size
  }
}

/** the text layers made, each one's release: PDF.js's builder keeps a layer in its registry of selection listeners until it is
 *  cancelled */
const cancels = new WeakMap<HTMLElement, () => void>()
/** a text layer let go (its drawing gone): out of PDF.js's registry */
export function releaseText(root: HTMLElement): void {
  for (const div of root.querySelectorAll<HTMLElement>('.textLayer')) {
    const f = cancels.get(div)
    cancels.delete(div)
    try {
      f?.()
    } catch {
      /* PDF.js's own */
    }
  }
}

/** the text layer of a laid page (PDF.js's TextLayerBuilder over the content laidText made): the paper's language on the layer,
 *  the target's on each translated span (`translated`, indices among the text items) */
export async function textLayerOf(
  kit: Pick<Kit, 'viewer'>,
  content: TextContent,
  vp: PageViewport,
  lang: string,
  translated: readonly number[] = [],
): Promise<HTMLElement> {
  let divs: HTMLElement[] | null = null
  // (the builder's text mapping is its highlighter's: the spans, one a text item, in order)
  const highlighter = {
    setTextMapping(d: HTMLElement[]) {
      divs = d
    },
    enable() {},
    disable() {},
  }
  const pdfPage = {
    streamTextContent: () =>
      new ReadableStream({
        start(c) {
          c.enqueue(content)
          c.close()
        },
      }),
  }
  const Builder = kit.viewer.TextLayerBuilder as unknown as new (o: {
    pdfPage: unknown
    highlighter: unknown
  }) => { div: HTMLElement; render(o: { viewport: PageViewport }): Promise<void>; cancel(): void }
  const builder = new Builder({ pdfPage, highlighter })
  try {
    await builder.render({ viewport: vp })
  } catch (e) {
    builder.cancel()
    throw e
  }
  const div = builder.div
  div.lang = SOURCE_LANG
  // (no Tab stop of its own, as PDF.js gives a page's layer: the right pane's Tab order stays the links')
  div.removeAttribute('tabindex')
  // (an upright page in the overlay's frame: never the slot's box, which PDF.js floors to whole CSS px)
  if (!((vp.rotation ?? 0) % 180)) div.setAttribute('data-axt-frame', '')
  const spans = divs as HTMLElement[] | null
  if (lang && spans) for (const i of translated) if (spans[i]) spans[i].lang = lang
  cancels.set(div, () => builder.cancel())
  return div
}

/** a page's text content with its marked content (its OC runs), as PDF.js gives it */
export const textContentOf = (p: PDFPageProxy): Promise<TextContent> => p.getTextContent({ includeMarkedContent: true })
