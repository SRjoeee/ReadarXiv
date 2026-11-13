// The prepare's front half (DESIGN §16, "The prepare's two halves"), which the package's one entry (prepare.ts `prepare`) runs
// before the back half: the paper opened, its bibliography made where TeX must make it, the source's units handed out before
// any compile of the marks, the marked compile with its final pass (B), and the instrument stated over B
// (instrument/instrument.mjs instrumentOf); or, given the instrument's four stored objects of a compile of the same original,
// the instrument made again from them with no TeX. With what it is given: arXiv's PDF's facts (originalFactsOf) and the TeX
// tree (treeOf). The stored plan's codec (what a prepare stores beside B and how it is read back, the paper as opened) is
// plan.ts's, a module of its own: a host that keys the stored instrument by the code its compile side runs names it there,
// never prepareFront, whose readers of what is stored (instrumentOf, the units first) stay out of the key. The orchestration
// of the two halves is prepare.ts's.
import { BOUNDS, type PrepareStage as FormatStage, type Unit, unitId, write } from '@readarxiv/format'
import {
  analyze,
  bibliographyKept,
  bundleUnitsOf,
  type Compiled,
  type CompileRequest,
  contentOf,
  creationEpochOf,
  elementKindOf,
  inMemory,
  instrumentOf,
  madeBibliography,
  markedOfPaper,
  type Paper,
  type PdfLike,
  texLiveOfPdf,
  textOfPdf,
  unitFactsOf,
} from './front.types.ts'
import type { Instrument } from './instrument.ts'
import { bySentence } from './locate/words.ts'
import { isMemoryError } from './memory.types.ts'
import {
  FROM_UTF8,
  type OriginalFacts,
  opened,
  type PrepareWhy,
  planOf,
  type StoredInstrument,
  storedInstrumentOf,
  unkeep,
  withBbl,
} from './plan.ts'
import type { PdfDocument, PdfJs } from './read.ts'

/** a paper refused, with the reason and a line of detail */
export interface Refusal {
  why: PrepareWhy
  detail: string
}
/** the stages a prepare tells, in their order (`@readarxiv/format`'s PREPARE_STAGES past the source's fetch) */
export type PrepareStage = Exclude<FormatStage, 'fetching'>

/** PDF.js as a prepare reads every document with it: A and B as the back half reads them (read.ts), and what the front half
 *  asks of A and of a compile's PDF (their facts, their pages' text) */
export interface PreparePdfJs extends PdfJs {
  getDocument(src: Record<string, unknown>): { promise: Promise<PdfDocument & PdfLike>; destroy(): Promise<void> }
}

/** what the front half is given */
export interface FrontInput {
  files: Map<string, Uint8Array>
  /** the TeX tree the paper is compiled on (its year) */
  tree: string
  original: OriginalFacts
  compile(q: CompileRequest): Promise<Compiled>
  stored: StoredInstrument | null
  /** the source's units as Units objects, before any compile of the marks */
  units(objects: Uint8Array[]): Promise<void>
  stage(s: PrepareStage): void
  note(name: string, data: unknown): void
  engines: readonly string[]
  pdfjs: PreparePdfJs
  documentOptions: Record<string, unknown>
}
/** the front half's end: the instrument, with its four objects where TeX made them; or why there is none */
export type FrontResult =
  | { ok: true; instrument: Instrument; made: StoredInstrument | null }
  | ({ ok: false } & Refusal)
export type FrontHalf = (input: FrontInput) => Promise<FrontResult>

/** what arXiv's PDF says (its page count, its day, its banner's year), read once from one document of the host's options */
export async function originalFactsOf(
  original: Uint8Array,
  host: { pdfjs: PreparePdfJs; documentOptions: Record<string, unknown> },
): Promise<OriginalFacts> {
  const task = host.pdfjs.getDocument({ ...host.documentOptions, data: original.slice() })
  try {
    const doc = await task.promise
    return { pages: doc.numPages, day: await creationEpochOf(doc), banner: await texLiveOfPdf(doc) }
  } finally {
    await task.destroy().catch(() => {})
  }
}

/** the TeX tree a paper is compiled on, decided once, before anything else: its own declaration (00README's
 *  texlive_version) where a host serves it, else the year arXiv's banner names where the paper declares none and a host
 *  serves it, else the default */
export interface TreeDecision {
  tree: string
  why: 'readme' | 'banner' | 'default'
  declared: string | null
}
export function treeOf(o: {
  files: Map<string, Uint8Array>
  banner: string | null
  served: readonly string[]
  fallback: string
}): TreeDecision {
  const v: unknown = analyze(inMemory(o.files)).tlVersion
  const declared = v === null || v === undefined ? null : String(v)
  if (declared !== null && o.served.includes(declared)) return { tree: declared, why: 'readme', declared }
  if (declared === null && o.banner !== null && o.served.includes(o.banner))
    return { tree: o.banner, why: 'banner', declared }
  return { tree: o.fallback, why: 'default', declared }
}

/** Units objects of `units` as the bundle cuts them (bundle.ts unitWindows: each window under the Units bound) */
export function unitsObjects(units: Unit[]): Uint8Array[] {
  const out: Uint8Array[] = []
  let cur: Unit[] = []
  let bytes = 32
  const cap = BOUNDS.units.bytes - 4096
  for (const u of units) {
    const n = JSON.stringify(u).length * 3
    if (cur.length && bytes + n > cap) {
      out.push(write('units', { format: 1, units: cur }).bytes)
      cur = []
      bytes = 32
    }
    cur.push(u)
    bytes += n
  }
  if (cur.length) out.push(write('units', { format: 1, units: cur }).bytes)
  return out
}

/** the paper's source units and its names as the instrument makes them (instrument.mjs instrumentOf's first two loops: the
 *  same content, the same id, kept by its own unitFactsOf), each once, before any compile of the marks: what a translator
 *  reads first. Each states what the bundle's unit will state of it and the source tells already, so that what is asked of a
 *  translator on these is what is asked on the bundle's units: an element's kind (elementKindOf: a tie a space, a forced break
 *  a break), and `sentences` where the bundle lights it by sentence (bundle.ts: `!kept && bySentence(kind, figure)`; a source
 *  unit is no figure's text). A reference's name is the marked compile's (readRefNames over its log) and cannot be told here */
export function sourceUnitsOf(paper: Paper): Unit[] {
  const units = paper.units
  const bundle = bundleUnitsOf(paper)
  const facts = unitFactsOf(paper)
  const ids: string[] = []
  const out: Unit[] = []
  const seen = new Set<string>()
  const add = (u: Unit) => {
    if (!seen.has(u.id)) {
      seen.add(u.id)
      out.push(u)
    }
  }
  units.forEach((u, i) => {
    const content = contentOf(u.pieces, {
      kindOf: elementKindOf,
      idOfNested: (x) => ids[units.indexOf(x)] ?? null,
    })
    const id = unitId(u.kind, content)
    ids[i] = id
    const kept = facts.kept.has(i)
    add({
      id,
      kind: u.kind,
      content,
      ...(u.depth !== undefined && Number.isInteger(u.depth) ? { depth: u.depth } : {}),
      ...(!kept && bySentence(u.kind) ? { sentences: true as const } : {}),
      ...(kept ? { kept: true as const } : {}),
    })
  })
  // (the paper's names, after its source's units: each a unit of one text piece)
  for (let i = units.length; i < bundle.length; i++) {
    const b = bundle[i]
    if (!b) continue
    const content = contentOf(b[5].flatMap((p) => (p[0] === 0 ? [{ t: 'text', s: p[1] }] : [])))
    add({ id: unitId(b[0], content), kind: b[0], content })
  }
  return out
}

/** each page's text of a compile's PDF (the layout guard's check), or null where PDF.js cannot read it */
async function pagesTextOf(
  pdf: Uint8Array,
  pdfjs: PreparePdfJs,
  options: Record<string, unknown>,
): Promise<string[] | null> {
  const task = pdfjs.getDocument({ ...options, data: pdf.slice() })
  try {
    return await textOfPdf(await task.promise)
  } catch (e) {
    if (isMemoryError(e)) throw e
    return null
  } finally {
    await task.destroy().catch(() => {})
  }
}

/** The front half: the paper opened, its bibliography made where TeX must make it (or the .bbl the plan kept), the source's
 *  units handed out, the marked compile and its final pass (B) with arXiv's day and page count, and the instrument stated over
 *  B, with its four objects where TeX made them. A stored instrument is taken only for the original it was made with: the
 *  facts of A the marked compile read (its page count, its day, its banner) the same, else the paper is compiled anew */
export async function prepareFront(input: FrontInput): Promise<FrontResult> {
  let paper = opened(input.files)
  const read = input.stored ? planOf(input.stored) : null
  const f = input.original
  const plan =
    read && read.facts.pages === f.pages && read.facts.day === f.day && read.facts.banner === f.banner ? read : null
  if (input.stored && !plan)
    input.note('front', { stored: read ? 'made with another original: compiled anew' : 'unreadable: compiled anew' })
  let bbl: { path: string; bytes: Uint8Array } | null = null
  if (plan) {
    if (plan.bbl) {
      bbl = plan.bbl
      paper = withBbl(paper, bbl)
    }
  } else if (bibliographyKept(paper) === null) {
    input.stage('compiling')
    const r = await madeBibliography(paper, { compile: input.compile, engines: input.engines })
    if ('paper' in r) {
      paper = r.paper
      bbl = r.made
    }
    input.note('bibliography', 'paper' in r ? { entries: r.paper.units.length, ms: r.ms } : { kept: r.kept, ms: r.ms })
  }
  await input.units(unitsObjects(sourceUnitsOf(paper)))

  let finalPdf: Uint8Array
  let log: string
  let options: Record<string, unknown>
  let made: StoredInstrument | null = null
  if (plan && input.stored) {
    finalPdf = input.stored['b.pdf']
    log = FROM_UTF8.decode(input.stored.log)
    options = {
      texts: unkeep(plan.texts),
      inkless: unkeep(plan.inkless),
      ...(plan.lineskip ? { lineskip: unkeep(plan.lineskip) } : {}),
      ...(plan.decorated ? { decorated: unkeep(plan.decorated) } : {}),
    }
  } else {
    input.stage('compiling')
    const day = f.day
    const m = await markedOfPaper(paper, {
      compile: input.compile,
      compileBudgetMs: null,
      engines: input.engines,
      pages: async () => f.pages,
      ...(day ? { sourceDate: day } : {}),
      textOf: (pdf) => pagesTextOf(pdf, input.pdfjs, input.documentOptions),
    })
    if ('refused' in m)
      return {
        ok: false,
        why: 'cannot-typeset',
        detail: `the marked compile: ${m.refused}${m.why ? `: ${m.why}` : ''}`.slice(0, 500),
      }
    const base = m.base
    if (!base || !('pdf' in base) || !(base.pdf instanceof Uint8Array))
      return {
        ok: false,
        why: 'cannot-typeset',
        detail: `the final pass: ${base && 'refused' in base ? `refused: ${base.why ?? ''}` : 'none'}`.slice(0, 500),
      }
    finalPdf = base.pdf
    log = m.log ?? ''
    options = m.options ?? {}
    // (a plan whose options do not read back as they are is not kept: a later prepare compiles again)
    made = storedInstrumentOf({ finalPdf, log, options, bbl, facts: f })
    if (!made) input.note('front', { plan: "not kept: the probe's answers do not read back as they are" })
  }
  input.stage('units')
  const r = await instrumentOf({
    paper,
    finalPdf,
    options,
    log,
    pdfjs: input.pdfjs,
    documentOptions: input.documentOptions,
    made: { compiler: paper.meta.compiler ?? 'pdflatex', tree: input.tree, front: 'today' },
  })
  return { ok: true, instrument: r.instrument, made }
}
