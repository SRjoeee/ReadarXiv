// prepareBack(instrument, originalPdf): the back half of the prepare (design §4.3), the one entry the box and the lab call:
// arXiv's PDF read once (read.ts), B's ownership carried onto it (align, locate), arXiv's runs wrapped (wrap), and the bundle's
// objects made (bundle), yielded as each is made: the units first, then each page's part, the add-on, the head last; then a
// tally of what was done and how long each step took.
import { align, type Mapping } from './align/align.ts'
import { type BundleObject, bundle } from './bundle/bundle.ts'
import type { Doc } from './doc.ts'
import type { Instrument } from './instrument.ts'
import { type Located, type LocateOptions, locate } from './locate/locate.ts'
import { type PdfJs, type ReadPage, readPdf } from './read.ts'
import { type AlignFacts, alignOf, type PdfLib } from './remove.types.ts'
import { type AddOn, wrap, wrapPageOf } from './wrap/wrap.ts'

export interface PrepareDeps {
  pdfjs: PdfJs
  /** PDF.js's document options (cMaps, standard fonts, its worker) */
  pdfOptions?: Record<string, unknown>
  PL: PdfLib
  deflate: (b: Uint8Array) => Uint8Array
  inflate: (b: Uint8Array, limit: number) => Uint8Array
  paper: { id: string; version: number }
  /** the prepare's identity: the digest of the engine build, the source, A and the TeX tree */
  made: string
  /** a clock for the tally (none: no times) */
  now?: () => number
  /** what the front half reads of an ink unit's pieces (its elements' classes: the instrument adapter's classesOf), for the units
   *  locate makes on A; none: their elements carry the kinds alone */
  classesOf?: LocateOptions['classesOf']
  /** keep what is read (the lab's proofs and reviews): A's pages in the tally's `pagesA`. Not kept (the box), A's raw pages are
   *  locate's, let go as its ink step reads them, so that the rest of locate, the wrap and the bundle run without them (lane
   *  mem-back) */
  keep?: boolean
}

export type Tally = {
  kind: 'tally'
  ms: Record<'read' | 'align' | 'locate' | 'wrap' | 'bundle', number>
  pages: number
  located: Located['stats']
  wrap: { refused?: string; pagesRefused: number; groups: number }
  /** the intermediate results, for the lab's dumps and proofs (the box drops them); A's pages only where they were kept */
  mapping: Mapping
  locatedAll: Located
  addOn: AddOn | { refused: string; why: string }
  pagesA?: ReadPage<AlignFacts>[]
}

/** arXiv's PDF read as the back half reads it: its pages as locate and the wrap take them (a lab's proofs read them again so, where
 *  prepareBack did not keep them) */
export function readArxiv(
  pdfjs: PdfJs,
  original: Uint8Array,
  options: Record<string, unknown> = {},
): Promise<{ doc: Doc; pages: ReadPage<AlignFacts>[]; info: Record<string, unknown> | null }> {
  return readPdf(pdfjs, original, {
    options,
    turned: true,
    // (every path's lines: the figure texts locate makes on A read a figure's lines where B's pictures and forms say it is one)
    shapesAll: true,
    extra: (OPS, ops) => alignOf(OPS, ops),
    annotations: true,
    // (each font's own map: a glyph it gives no Unicode of is no reading of its text, A17)
    mapped: true,
  })
}

export async function* prepareBack(
  ins: Instrument,
  original: Uint8Array,
  deps: PrepareDeps,
): AsyncGenerator<BundleObject | Tally> {
  const now = deps.now ?? (() => 0)
  const keep = deps.keep === true
  const t0 = now()
  const read = await readArxiv(deps.pdfjs, original, deps.pdfOptions)
  const t1 = now()
  const owners = new Int32Array(ins.ink.pages.reduce((n, p) => n + p.glyphs.length, 0)).fill(-1)
  let o = 0
  ins.ink.pages.forEach((pg, p) => {
    const ow = ins.glyphs[p]
    for (let j = 0; j < pg.glyphs.length; j++) owners[o + j] = ow ? (ow.unit[j] as number) : -1
    o += pg.glyphs.length
  })
  const mapping = align(ins.ink, read.doc, { owners })
  const t2 = now()
  // (what the wrap reads of A's pages, made before locate takes them: each glyph's (n, k), its boxes' kinds, its facts)
  const wrapPages = read.pages.map(wrapPageOf)
  // (A's pages as pageInk read them: given to locate, which makes the ink units, kept blocks and figure texts there (ink.ts), and,
  // unless they are kept, takes them: nothing else holds them then)
  const raws = read.pages.map((pg) => pg.raw)
  if (!keep) for (const pg of read.pages) pg.raw = null
  const located = locate(ins, read.doc, mapping, {
    annotations: read.pages.map((p) => p.annotations),
    pages: raws,
    take: !keep,
    classesOf: deps.classesOf,
  })
  const t3 = now()
  const addOn = await wrap(original, located, wrapPages, deps)
  const t4 = now()
  for (const x of bundle({
    ins,
    located,
    addOn,
    original,
    paper: { ...deps.paper, pages: read.doc.pages.length },
    made: deps.made,
  }))
    yield x
  const t5 = now()
  yield {
    kind: 'tally',
    ms: { read: t1 - t0, align: t2 - t1, locate: t3 - t2, wrap: t4 - t3, bundle: t5 - t4 },
    pages: read.doc.pages.length,
    located: located.stats,
    wrap:
      'refused' in addOn
        ? { refused: addOn.refused, pagesRefused: 0, groups: 0 }
        : { pagesRefused: [...addOn.pages.values()].filter((x) => !x.ok).length, groups: addOn.groups.size },
    mapping,
    locatedAll: located,
    addOn,
    ...(keep ? { pagesA: read.pages } : {}),
  }
}
