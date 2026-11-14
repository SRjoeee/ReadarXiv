// The stored half of the front half (DESIGN §16, "The prepare's two halves"): what decides the instrument's four stored objects,
// called by front.ts prepareFront before it states the instrument over B. The paper opened; a stored instrument read and taken
// only for the original it was made with; the .bbl from its plan, or the bibliography TeX makes; the source's units handed out
// (by the caller, of the paper as opened: the units are not the instrument's); then either the stored objects read back, or
// the marked compile with its final pass, and what is stored of it (plan.ts storedInstrumentOf). A module of its own, so that a
// host that keys the stored instrument by the code its compile side runs names it there, with plan.ts, and every value that
// decides a stored byte is either this code's or one the host gives it (CompiledInput).
import { bibliographyKept, madeBibliography, markedOfPaper } from './compile/paper.ts'
import type { Compiled, CompileRequest, Paper } from './compile/live.ts'
import { type PdfLike, textOfPdf } from './compile/base.ts'
import { isMemoryError } from './memory.ts'
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

/** PDF.js as a prepare reads every document with it: A and B as the back half reads them (read.ts), and what the front half
 *  asks of A and of a compile's PDF (their facts, their pages' text) */
export interface PreparePdfJs extends PdfJs {
  getDocument(src: Record<string, unknown>): { promise: Promise<PdfDocument & PdfLike>; destroy(): Promise<void> }
}

/** what the stored half is given, every value from its caller */
export interface CompiledInput {
  /** the source's files */
  files: Map<string, Uint8Array>
  /** what arXiv's PDF says (front.ts originalFactsOf) */
  original: OriginalFacts
  /** the instrument's four objects a compile of the paper stored, or null */
  stored: StoredInstrument | null
  compile(q: CompileRequest): Promise<Compiled>
  /** the TeX engines the host runs */
  engines: readonly string[]
  pdfjs: PreparePdfJs
  /** PDF.js's document options, every document read with them */
  documentOptions: Record<string, unknown>
  stage(s: 'compiling'): void
  note(name: string, data: unknown): void
  /** the source's units handed out, of the paper as opened (with its .bbl): awaited before any compile of the marks */
  units(paper: Paper): Promise<void>
}
/** the stored half's end: the paper as opened, B, its log and the marked compile's options (or the stored ones read back), and
 *  the four objects to store where TeX made them and their plan reads back; or why the paper cannot be typeset */
export type CompiledResult =
  | { ok: false; why: PrepareWhy; detail: string }
  | {
      ok: true
      paper: Paper
      finalPdf: Uint8Array
      log: string
      options: Record<string, unknown>
      made: StoredInstrument | null
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

/** The stored half: the paper opened, its bibliography made where TeX must make it (or the .bbl the plan kept), the source's
 *  units handed out, and B with its log and options: the stored instrument's where one was given and taken (the facts of A the
 *  marked compile read, its page count, its day, its banner, the same), else the marked compile and its final pass with arXiv's
 *  day and page count, and the four objects to store */
export async function compiledOf(input: CompiledInput): Promise<CompiledResult> {
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
  await input.units(paper)

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
  return { ok: true, paper, finalPdf, log, options, made }
}
