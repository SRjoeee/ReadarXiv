// A laid page's text layer (design §4.5 "Text and links"; design-a §1.4 "hiding and text by the same groups"): arXiv's text
// content of the page in content-stream order, the items under a group that is off dropped and the member's laid items put at
// its first dropped item, so that selection, the browser's find and a screen reader meet one copy of the text, in reading order
// (I8). Built by PDF.js's own TextLayer from that content.
//
// Which group an item is under: PDF.js's text content reports our `/OC /<prop> BDC` as a marked content of tag OC with no name
// (pdf.worker.mjs 6.3.289: its id is an MCID only), and splits its items at every BDC and EMC, so that every item lies in one run
// of one group, and a run is one group's. A run is that group's whose ink it stands on: a member's lines on this page (text), an
// element's ink (elements), its label's (label), with half a point to spare; exact ownership makes them disjoint. (The add-on
// naming each run, a `/axt:<ord>.<page>.<g> BMC` inside it, would put the name in the text content itself: asked of the prepare.)
import type { PageViewport, PDFPageProxy } from 'pdfjs-dist'
import type { Placed } from '@readarxiv/format'
import type { Faces } from './faces.ts'
import type { Item, Laid, Page } from './page.ts'

/** PDF.js's text content of a page, and a text item of it */
export type TextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>
export type TextItem = Extract<TextContent['items'][number], { str: string }>
type Marked = { type: string; tag?: string | null }
type Entry = TextItem | Marked
const isText = (e: Entry): e is TextItem => typeof (e as TextItem).str === 'string'
const EPS = 0.5

/** a run's place: the middle of its items (PDF units; their transforms, unrotated text) */
function centreOf(items: TextItem[]): [number, number] | null {
  let x0 = Number.POSITIVE_INFINITY,
    x1 = Number.NEGATIVE_INFINITY,
    y = 0,
    n = 0
  for (const it of items) {
    if (!it.str.trim()) continue
    const [, , , , e, f] = it.transform as number[]
    x0 = Math.min(x0, e as number)
    x1 = Math.max(x1, (e as number) + it.width)
    y += f as number
    n++
  }
  return n ? [(x0 + x1) / 2, y / n] : null
}

/** the group (member's ord and bit) a run at `at` (its middle, the baseline its items share) is under, of the members given */
function groupAt(at: [number, number], page: number, members: Map<number, Placed>): [number, number] | null {
  const [x, y] = at
  for (const m of members.values()) {
    for (const l of m.lines)
      if (l[0] === page && x >= l[2] - EPS && x <= l[3] + EPS && y >= l[6] - EPS && y <= l[5] + EPS) return [m.ord, 1]
    for (const [, el] of m.els ?? [])
      for (const i of el.ink)
        if (i[0] === page && x >= i[1] - EPS && x <= i[3] + EPS && y >= i[2] - EPS && y <= i[4] + EPS) return [m.ord, 2]
    const li = m.label?.ink
    if (li && li[0] === page && x >= li[1] - EPS && x <= li[3] + EPS && y >= li[2] - EPS && y <= li[4] + EPS)
      return [m.ord, 4]
  }
  return null
}

/** the text content of a laid page: A's, its runs under a group that is off dropped, each member's laid items in their place */
export function laidText(
  content: TextContent,
  page: Page,
  members: Map<number, Placed>,
  faces: Faces,
  measure: (s: string, family: string, size: number) => number,
): { content: TextContent; dropped: number; inserted: number } {
  const laid = new Map<number, Laid>()
  for (const m of page.members) if (m.state === 'laid' && m.off) laid.set(m.ord, m)
  const here = new Map([...members].filter(([ord]) => laid.has(ord)))
  const out: Entry[] = []
  const styles: Record<string, { fontFamily: string; ascent: number; descent: number; vertical: boolean }> = {
    ...(content.styles as Record<string, { fontFamily: string; ascent: number; descent: number; vertical: boolean }>),
  }
  const put = new Set<number>()
  let dropped = 0,
    inserted = 0
  const itemsOf = (m: Laid): TextItem[] => {
    const xs: TextItem[] = []
    m.lines.forEach(([y, , , items], li) => {
      items.forEach((it: Item, k) => {
        const face = 'face' in it ? it.face : null
        const size = 'size' in it ? it.size : it.k * (it.src[4] - it.src[2] || 1)
        const family = face ? faces.familyOf(face) : 'sans-serif'
        const font = `axt-${face ?? 'crop'}`
        styles[font] ??= { fontFamily: family, ascent: 0.8, descent: -0.2, vertical: false }
        const width = 'src' in it ? (it.src[3] - it.src[1]) * it.k : measure(it.s, family, size)
        if (!it.s) return
        xs.push({
          str: it.s,
          dir: 'ltr',
          transform: [size, 0, 0, size, it.x, y],
          width,
          height: size,
          fontName: font,
          hasEOL: k === items.length - 1 && li < m.lines.length - 1,
        })
      })
    })
    return xs
  }
  // the runs: an OC marked content's items, as one; anything else passes
  const entries = content.items as Entry[]
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i] as Entry
    if (isText(e) || e.type !== 'beginMarkedContentProps' || e.tag !== 'OC') {
      out.push(e)
      continue
    }
    // (the run's own items, to its EMC at its depth)
    let depth = 0,
      j = i + 1
    const run: TextItem[] = []
    for (; j < entries.length; j++) {
      const x = entries[j] as Entry
      if (!isText(x)) {
        if (x.type === 'beginMarkedContent' || x.type === 'beginMarkedContentProps') depth++
        else if (x.type === 'endMarkedContent') {
          if (depth === 0) break
          depth--
        }
        continue
      }
      run.push(x)
    }
    const at = centreOf(run)
    const g = at ? groupAt(at, page.page, here) : null
    const m = g ? laid.get(g[0]) : undefined
    if (m && g && m.off & g[1]) {
      dropped += run.length
      if (!put.has(m.ord)) {
        put.add(m.ord)
        const xs = itemsOf(m)
        inserted += xs.length
        out.push(...xs)
      }
      i = j
      continue
    }
    out.push(e)
  }
  // (a member none of whose runs was found in the content: its items at the end, so that its words are read)
  for (const m of laid.values())
    if (!put.has(m.ord)) {
      const xs = itemsOf(m)
      inserted += xs.length
      out.push(...xs)
    }
  return {
    content: { ...content, items: out as TextContent['items'], styles: styles as TextContent['styles'] },
    dropped,
    inserted,
  }
}

/** a canvas measure of a string in a family at a size (PDF units: the size is in them) */
export function canvasMeasure(): (s: string, family: string, size: number) => number {
  const ctx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D
  return (s, family, size) => {
    ctx.font = `100px ${family}`
    return (ctx.measureText(s).width / 100) * size
  }
}

/** the text layer of a laid page in `container` (PDF.js's TextLayer over the content laidText made) */
export async function textLayerOf(
  lib: {
    TextLayer: new (o: {
      textContentSource: TextContent
      container: HTMLElement
      viewport: PageViewport
    }) => { render(): Promise<void> }
  },
  content: TextContent,
  vp: PageViewport,
  lang: string,
): Promise<HTMLElement> {
  const div = document.createElement('div')
  div.className = 'textLayer'
  div.setAttribute('data-axt-frame', '')
  div.lang = lang
  const tl = new lib.TextLayer({ textContentSource: content, container: div, viewport: vp })
  await tl.render()
  return div
}

/** a page's text content with its marked content (its OC runs), as PDF.js gives it */
export const textContentOf = (p: PDFPageProxy): Promise<TextContent> => p.getTextContent({ includeMarkedContent: true })
