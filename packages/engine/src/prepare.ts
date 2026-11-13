// The prepare (DESIGN §16, "The prepare's two halves"). `prepare(take, host)` is the package's one entry, which the box and
// the lab call alike, so that what the lab makes of a paper is what the box makes, through this door: a paper's source files
// and arXiv's PDF (A) in, the bundle's objects out, the front half (front.ts prepareFront) then the back half, each object
// handed to the host as it is made. What the host gives it is its own: the source unpacked, the compile, PDF.js, zlib and
// pdf-lib, the TeX engines and trees it runs, where each object goes.
// prepareBack(instrument, originalPdf), the back half: arXiv's PDF read once (read.ts), B's ownership carried onto it (align,
// locate), arXiv's runs wrapped (wrap), and the bundle's objects made (bundle), yielded as each is made: the units first, then
// each page's part, the add-on, the head last; then a tally of what was done and how long each step took.
import type { Head } from '@readarxiv/format'
import { align, type Mapping } from './align/align.ts'
import { type BundleObject, bundle } from './bundle/bundle.ts'
import type { Doc } from './doc.ts'
import type { PreparePdfJs } from './compiled.ts'
import { type FrontHalf, originalFactsOf, type PrepareStage, prepareFront, type Refusal, treeOf } from './front.ts'
import { type Compiled, type CompileRequest, classesOf } from './front.types.ts'
import type { Instrument } from './instrument.ts'
import { type Located, type LocateOptions, locate } from './locate/locate.ts'
import { isMemoryError } from './memory.ts'
import { FrontRefusal, INSTRUMENT_OBJECTS, type OriginalFacts, type StoredInstrument, short } from './plan.ts'
import { type PdfJs, type ReadPage, type Recovered, readPdf } from './read.ts'
import { type AlignFacts, alignReader, type PdfLib } from './remove.ts'
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

/** what a prepare is handed, once: the source's files, A and, where a compile of the same original made them, the instrument's
 *  four objects (TeX does not run then) */
export interface PrepareInputs {
  files: Map<string, Uint8Array>
  original: Uint8Array
  stored: StoredInstrument | null
}

/** what the host gives a prepare: the paper, the TeX tree it runs and the ones it serves, the prepare's identity, the TeX
 *  engines it runs, PDF.js with the options every document is opened with, zlib and pdf-lib; and where what is made goes */
export interface PrepareHost extends Pick<PrepareDeps, 'PL' | 'deflate' | 'inflate' | 'paper' | 'made' | 'keep'> {
  /** the TeX tree this host compiles on (its year), the ones a host serves, and the one a paper that names none is compiled on */
  tree: { year: string; served: readonly string[]; fallback: string }
  /** the TeX engines the host runs, as a paper names them (openPaper's meta.compiler) */
  engines: readonly string[]
  pdfjs: PreparePdfJs
  /** PDF.js's document options, every document read with them */
  documentOptions: Record<string, unknown>
  /** the source's files, handed once before the first compile, where the host compiles them elsewhere */
  handFiles?(files: ReadonlyMap<string, Uint8Array>): Promise<void>
  compile(q: CompileRequest): Promise<Compiled>
  stage(s: PrepareStage): void
  /** a Units object of the source's units, before any compile of the marks */
  units(bytes: Uint8Array): Promise<void>
  /** one of the instrument's four objects, where TeX made them */
  instrument(name: keyof StoredInstrument, bytes: Uint8Array): Promise<void>
  /** a bundle object, as the back half makes it */
  object(x: BundleObject): Promise<void>
  /** a record of what was decided or measured (the tree, the bibliography, the stored instrument, the timings): read for the
   *  log alone */
  note(name: string, data: unknown): void
  now(): number
}

/** a prepare's end: the instrument and the back half's tally where the bundle was made; else why not; else the tree the paper
 *  is compiled on where it is not the host's (nothing compiled) */
export type PrepareEnd =
  | { ok: true; instrument: Instrument; tally: Tally }
  | ({ ok: false } & Refusal)
  | { wrongTree: string }

/** what the front half hands the back half: the instrument and A, the only two things the back half reads */
type Fronted = { instrument: Instrument; original: Uint8Array }

/**
 * The prepare: the inputs taken once (`take`), A read for what the front half asks of it, the tree decided (a paper of
 * another tree is answered with it, before any compile), the front half, then the back half, every object handed to the host
 * as it is made. A paper refused is its reason; nothing here throws past it but the host's own faults. `take` hands the
 * inputs to the front half alone (frontOf): the source's files and what the front half makes beside the instrument (B among
 * its four objects) are reachable from its frame, which has ended when the back half runs, so that the back half's peak holds
 * A and the instrument alone (DESIGN §16, "What the back half holds"). Nulling a local of a running function would not do: a
 * frame's registers keep what it read. `front` is the package's own (a test hands another to watch the frames)
 */
export async function prepare(
  take: () => PrepareInputs | Refusal,
  host: PrepareHost,
  front: FrontHalf = prepareFront,
): Promise<PrepareEnd> {
  const t0 = host.now()
  const ms: Record<string, number> = {}
  const lap = (k: string) => {
    ms[k] = host.now() - t0
  }
  try {
    const fronted = await frontOf(take, host, front, lap)
    if (!('instrument' in fronted)) return fronted
    const tally = await backOf(fronted.instrument, fronted.original, host, lap)
    host.note('timings', {
      ms,
      back: Object.fromEntries(Object.entries(tally.ms).map(([k, v]) => [k, Math.round(v)])),
      pages: tally.pages,
      located: tally.located,
      wrap: tally.wrap,
    })
    return { ok: true, instrument: fronted.instrument, tally }
  } catch (e) {
    if (e instanceof FrontRefusal) return { ok: false, why: e.why, detail: short(e) }
    if (isMemoryError(e)) return { ok: false, why: 'too-large', detail: `an allocation failed: ${short(e)}` }
    throw e
  }
}

/** the inputs taken, A read, the tree decided, the front half run and the instrument's objects handed out: the paper's end
 *  where it ends here, else the instrument and A */
async function frontOf(
  take: () => PrepareInputs | Refusal,
  host: PrepareHost,
  front: FrontHalf,
  lap: (k: string) => void,
): Promise<Exclude<PrepareEnd, { ok: true }> | Fronted> {
  const input = take()
  if (!('files' in input)) return { ok: false, why: input.why, detail: input.detail }
  const files = input.files
  lap('unpack')
  let facts: OriginalFacts
  try {
    facts = await originalFactsOf(input.original, host)
  } catch (e) {
    if (isMemoryError(e)) throw e
    return { ok: false, why: 'corrupt', detail: `arXiv's PDF cannot be read: ${short(e)}` }
  }
  lap('original')
  // ---- the tree, once: the paper's own declaration, else arXiv's banner, else the default
  const tree = treeOf({ files, banner: facts.banner, served: host.tree.served, fallback: host.tree.fallback })
  host.note('tree', tree)
  if (tree.tree !== host.tree.year) return { wrongTree: tree.tree }

  // ---- the front half: the units first, the instrument when TeX ran (the files handed to the host at the first compile)
  let handed = false
  const compile = async (q: CompileRequest): Promise<Compiled> => {
    if (!handed) {
      handed = true
      await host.handFiles?.(files)
      lap('tree')
    }
    return host.compile(q)
  }
  let sentUnits = false
  const r = await front({
    files,
    tree: host.tree.year,
    original: facts,
    compile,
    stored: input.stored,
    units: async (objects) => {
      for (const b of objects) await host.units(b)
      sentUnits = true
      lap('units')
    },
    stage: (s) => host.stage(s),
    note: (n, d) => host.note(n, d),
    engines: host.engines,
    pdfjs: host.pdfjs,
    documentOptions: host.documentOptions,
  })
  if (!r.ok) return r
  if (!sentUnits) throw new Error('the front half sent no units')
  lap('front')
  // (the instrument's four objects where TeX ran, in a run that was given none. A host that gives a prepare stored ones keeps
  // what it stored under their key and takes no other in that run, even where the front half did not take them (a plan it
  // cannot read, another original's facts) and TeX ran again: handed out there, they would end the run as the host's fault)
  if (r.made && !input.stored) for (const name of INSTRUMENT_OBJECTS) await host.instrument(name, r.made[name])
  return { instrument: r.instrument, original: input.original }
}

/** the back half as it is, every object handed out as it is made; given the front half's own reading of an ink unit's pieces
 *  (instrument.mjs classesOf: each element's class) */
async function backOf(
  ins: Instrument,
  original: Uint8Array,
  host: PrepareHost,
  lap: (k: string) => void,
): Promise<Tally> {
  host.stage('laying-out')
  let first = true
  let tally: Tally | null = null
  for await (const x of prepareBack(ins, original, {
    pdfjs: host.pdfjs,
    pdfOptions: host.documentOptions,
    PL: host.PL,
    deflate: host.deflate,
    inflate: host.inflate,
    paper: host.paper,
    made: host.made,
    now: () => host.now(),
    classesOf,
    ...(host.keep ? { keep: true } : {}),
  })) {
    if (x.kind === 'tally') {
      tally = x
      continue
    }
    if (first) {
      first = false
      lap('laid')
      host.stage('bundle')
    }
    await host.object(x)
  }
  lap('bundle')
  if (!tally) throw new Error('the back half ended with no tally')
  return tally
}
