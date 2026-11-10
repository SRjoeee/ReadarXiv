// prepareBack(instrument, originalPdf): the back half of the prepare (design §4.3), the one entry the box and the lab call:
// arXiv's PDF read once (read.ts), B's ownership carried onto it (align, locate), arXiv's runs wrapped (wrap), and the bundle's
// objects made (bundle), yielded as each is made: the units first, then each page's part, the add-on, the head last; then a
// tally of what was done and how long each step took.
import type { Head } from '@readarxiv/format'
import { align, type Mapping } from './align/align.ts'
import { type BundleObject, bundle } from './bundle/bundle.ts'
import type { Doc } from './doc.ts'
import type { Instrument } from './instrument.ts'
import { type Located, type LocateOptions, locate } from './locate/locate.ts'
import { type PdfJs, type ReadPage, type Recovered, readPdf } from './read.ts'
import { type AlignFacts, alignReader, type PdfLib } from './remove.types.ts'
import { type AddOn, type WrapPageA, wrap, wrapPageOf } from './wrap/wrap.ts'

export interface PrepareDeps {
  pdfjs: PdfJs
  /** PDF.js's document options (cMaps, standard fonts, its worker) */
  pdfOptions?: Record<string, unknown>
  PL: PdfLib
  deflate: (b: Uint8Array) => Uint8Array
  /** bytes inflated, no more than `limit` + 1 of them (the remover's and the wrap's); a failed allocation thrown as it came
   *  (memory.mjs isMemoryError), never read again another way: the back half lets it through as the paper's */
  inflate: (b: Uint8Array, limit: number) => Uint8Array
  paper: { id: string; version: number }
  /** the prepare's identity: the digest of the engine build, the source, A and the TeX tree */
  made: string
  /** a clock for the tally (none: no times) */
  now?: () => number
  /** what the front half reads of an ink unit's pieces (its elements' classes: the instrument adapter's classesOf), for the units
   *  locate makes on A; none: their elements carry the kinds alone */
  classesOf?: LocateOptions['classesOf']
  /** keep what is read (the lab's proofs and reviews): A's pages in the tally's `pagesA`, and the instrument's ink. Not kept (the
   *  box), each is let go once located: A's raw pages as locate's ink step reads them, A's Doc and B's (the instrument's `ink`,
   *  its pages emptied, and its owners) once locate has ended, so that the wrap and the bundle run without them (lane mem-back) */
  keep?: boolean
}

export type Tally = {
  kind: 'tally'
  ms: Record<'read' | 'align' | 'locate' | 'wrap' | 'bundle', number>
  pages: number
  located: Located['stats']
  wrap: { refused?: string; pagesRefused: number; groups: number }
  /** what PDF.js recovered from while B and A were read (the head's `recovered`); none where nothing was */
  recovered?: NonNullable<Head['recovered']>
  /** the intermediate results, for the lab's dumps and proofs (the box drops them); A's pages only where they were kept */
  mapping: Mapping
  locatedAll: Located
  addOn: AddOn | { refused: string; why: string }
  pagesA?: ReadPage<AlignFacts>[]
}

/** arXiv's PDF read as the back half reads it: its pages as locate and the wrap take them (a lab's proofs read them again so, where
 *  prepareBack did not keep them); `rawGlyphs` false, each page's raw glyphs let go once its Doc page is made (prepareBack's,
 *  where it keeps nothing: locate and the wrap read the Doc's glyphs) */
export function readArxiv(
  pdfjs: PdfJs,
  original: Uint8Array,
  options: Record<string, unknown> = {},
  rawGlyphs = true,
): Promise<{ doc: Doc; pages: ReadPage<AlignFacts>[]; info: Record<string, unknown> | null; recovered: Recovered }> {
  return readPdf(pdfjs, original, {
    options,
    rawGlyphs,
    turned: true,
    // (every path's lines: the figure texts locate makes on A read a figure's lines where B's pictures and forms say it is one)
    shapesAll: true,
    extra: (OPS) => alignReader(OPS),
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
  const t0 = now()
  // (read, align and locate in a function of their own, whose frame ends with them: what they read is let go there, unless kept,
  // and nothing of the wrap's or the bundle's holds it. Nulled inside one running function, it stayed reachable: lane L9)
  const p = await placedOf(ins, original, deps, now)
  const { located, mapping, times } = p
  const addOn = await wrap(original, located, p.wrapPages, deps)
  const t4 = now()
  // (what PDF.js recovered from while it read B (the instrument's) and A: the head states it)
  const recovered: NonNullable<Head['recovered']> = []
  for (const [doc, r] of [
    ['B', ins.recovered],
    ['A', p.recovered],
  ] as const)
    for (const [site, n, first] of r ?? []) recovered.push([doc, site, n, first])
  for (const x of bundle({
    ins,
    located,
    addOn,
    original,
    paper: { ...deps.paper, pages: p.pages },
    made: deps.made,
    ...(recovered.length ? { recovered } : {}),
  }))
    yield x
  const t5 = now()
  yield {
    kind: 'tally',
    ms: {
      read: times.t1 - t0,
      align: times.t2 - times.t1,
      locate: times.t3 - times.t2,
      wrap: t4 - times.t3,
      bundle: t5 - t4,
    },
    pages: p.pages,
    located: located.stats,
    wrap:
      'refused' in addOn
        ? { refused: addOn.refused, pagesRefused: 0, groups: 0 }
        : { pagesRefused: [...addOn.pages.values()].filter((x) => !x.ok).length, groups: addOn.groups.size },
    ...(recovered.length ? { recovered } : {}),
    mapping,
    locatedAll: located,
    addOn,
    ...(p.pagesA ? { pagesA: p.pagesA } : {}),
  }
}

/** arXiv's PDF read once (read.ts) and B's ownership carried onto it (align, locate); what the wrap and the bundle read of it (each
 *  page's wrap facts, the page count), and, kept, its pages. Unless kept, its raw pages are locate's (taken: each let go as its
 *  ink step has read it), and its Doc and the instrument's ink end with this function (B's pages emptied, and its owners) */
async function placedOf(
  ins: Instrument,
  original: Uint8Array,
  deps: PrepareDeps,
  now: () => number,
): Promise<{
  located: Located
  mapping: Mapping
  wrapPages: (WrapPageA | null)[]
  pages: number
  pagesA: ReadPage<AlignFacts>[] | null
  recovered: Recovered
  times: { t1: number; t2: number; t3: number }
}> {
  const keep = deps.keep === true
  // (A's raw glyphs let go page by page unless kept: locate and the wrap read the Doc's; the lab's proofs and reviews read raw ones)
  const read = await readArxiv(deps.pdfjs, original, deps.pdfOptions, keep)
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
  // (B's ink and its owners: read by align and locate alone; the bundle reads the instrument's units and TeX's statements)
  if (!keep) {
    ins.ink.pages.length = 0
    ins.glyphs.length = 0
    ins.boxes.length = 0
    if (ins.turned) ins.turned.length = 0
  }
  return {
    located,
    mapping,
    wrapPages,
    pages: read.doc.pages.length,
    pagesA: keep ? read.pages : null,
    recovered: read.recovered,
    times: { t1, t2, t3 },
  }
}
