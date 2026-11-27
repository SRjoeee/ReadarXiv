// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { openPaper } from '../../packages/engine/src/compile/live.ts'
import { markedOfPaper } from '../../packages/engine/src/compile/paper.ts'
import { instrumentOf } from '../../packages/engine/src/instrument/instrument.ts'
import { compileImageRef } from '../../lab/pdf/spikes/compile-image.mjs'
import { DOCUMENT_OPTIONS } from './helpers/ocg-pdfs'

// An element the marking reads as setting no ink (marks.ts classOf null: INVISIBLE, textless) is stated empty by the instrument
// (instrument/instrument.ts inklessPieces), whatever class the element carries: an `\index{…}` and a `\color[HTML]{…}` the
// class table reads as `other`, an inked class, which the instrument stated nothing and the typesetter therefore left unproven.
// Asked of TeX itself, in the pinned TeX Live image, offline, on content of our own: the marked original as the prepare makes
// it (markedOfPaper), its instrument (instrumentOf) states the two pieces empty; and TeX sets no glyph for them, the paper's
// own compile with them and without them setting the same text items in the same places (what "stated empty" claims: their
// unit drawn with nothing in their place loses no ink of the original's)

const IMAGE = compileImageRef()
const docker = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0
type Compiled = { ok: boolean; pdf: Uint8Array | null; log: string; aux: string | null; bbl: null; ms: number }
type Request = { main: string; overrides: Map<string, Uint8Array> }
/** a compile in the image: the files given, pdflatex three times */
function compileIn(files: ReadonlyMap<string, Uint8Array>, main = 'main.tex', passes = 3): Compiled {
  const dir = mkdtempSync(join(tmpdir(), 'axt-stated-'))
  try {
    for (const [p, b] of files) {
      mkdirSync(dirname(join(dir, p)), { recursive: true })
      writeFileSync(join(dir, p), b)
    }
    for (let pass = 0; pass < passes; pass++) {
      // (each pass's PDF its own: one a pass that dies leaves behind is never read as the run's)
      rmSync(join(dir, main.replace(/\.tex$/, '.pdf')), { force: true })
      try {
        execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${dir}:/work`, '-w', '/work', IMAGE, 'pdflatex', '-interaction=nonstopmode', main], { stdio: 'pipe', timeout: 300_000 })
      } catch {
        /* errors are the log's */
      }
    }
    const stem = main.replace(/\.tex$/, '')
    const read = (f: string) => {
      try {
        return readFileSync(join(dir, f))
      } catch {
        return null
      }
    }
    const pdf = read(`${stem}.pdf`)
    return { ok: !!pdf, pdf: pdf ? new Uint8Array(pdf) : null, log: read(`${stem}.log`)?.toString('latin1') ?? '', aux: read(`${stem}.aux`)?.toString('latin1') ?? null, bbl: null, ms: 1 }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
/** every text item of a PDF, its text and its place, by page */
const itemsOf = async (pdf: Uint8Array) => {
  const doc = await getDocument({ data: pdf.slice(), verbosity: 0 }).promise
  const out: string[] = []
  for (let n = 1; n <= doc.numPages; n++)
    for (const it of (await (await doc.getPage(n)).getTextContent()).items as { str: string; transform: number[] }[])
      if (it.str.trim()) out.push(`${n} ${it.transform[4]?.toFixed(2)} ${it.transform[5]?.toFixed(2)} ${it.str}`)
  await doc.loadingTask.destroy()
  return out
}
const enc = (s: string) => new TextEncoder().encode(s)
const doc = (body: string) =>
  [
    '\\documentclass{article}',
    '\\usepackage{xcolor}',
    '\\usepackage{makeidx}',
    '\\makeindex',
    '\\begin{document}',
    body,
    '\\end{document}',
  ].join('\n')
const WITH =
  'Our own words of a first paragraph, with an entry\\index{entry!of ours} standing in it, and more words of ours after it to fill the line out and go on.\n\n' +
  'Our own words of a second paragraph, {\\color[HTML]{3366AA} some words of ours in a colour} and more words of ours after them to fill the line.'
const WITHOUT = WITH.replace('\\index{entry!of ours}', '').replace('\\color[HTML]{3366AA} ', '')

describe.skipIf(!docker)('an element TeX sets no ink for, by the marking’s own reading, stated empty', () => {
  it('an \\index and a \\color with a model: stated empty by the instrument, and TeX sets no glyph for them', async () => {
    const files = new Map([['main.tex', enc(doc(WITH))]])
    const paper = openPaper(files)
    const compiles: Compiled[] = []
    const compile = async ({ main, overrides }: Request) => {
      const c = compileIn(new Map([...files, ...overrides]), main)
      compiles.push(c)
      return c
    }
    const made = await markedOfPaper(paper, { compile: compile as never, final: false })
    if (!('pdf' in made) || !made.pdf) throw new Error(`no marked original: ${JSON.stringify(made).slice(0, 300)}`)
    const pdf = made.pdf as Uint8Array
    const last = compiles.find((c) => c.pdf && c.pdf.length === pdf.length && c.pdf.every((b, i) => b === pdf[i]))
    const m = made as { options?: Record<string, unknown>; probeLog?: string }
    const { instrument } = await instrumentOf({
      paper: paper as never,
      finalPdf: pdf,
      options: m.options ?? {},
      log: last?.log ?? '',
      probeLog: m.probeLog ?? null,
      pdfjs: { getDocument, OPS } as never,
      documentOptions: DOCUMENT_OPTIONS,
      made: { compiler: 'pdflatex', tree: '2025', front: 'today' },
    })
    const empty = new Set((instrument.empty ?? []).map((x) => `${x.unit}|${x.piece}`))
    /** the unit and piece of the placeholder whose source begins so */
    const where = (begins: string) => {
      for (const [i, u] of paper.units.entries()) {
        const k = (u.pieces as { t: string; src?: string }[]).findIndex((p) => p.t === 'ph' && (p.src ?? '').startsWith(begins))
        if (k >= 0) return `${i}|${k}`
      }
      return null
    }
    expect(where('\\index')).not.toBeNull()
    expect(where('\\color[HTML]')).not.toBeNull()
    expect(empty.has(where('\\index')!)).toBe(true)
    expect(empty.has(where('\\color[HTML]')!)).toBe(true)
    // (TeX's own: the paper's compile with them and without them sets the same text items in the same places)
    const own = compileIn(files)
    const bare = compileIn(new Map([['main.tex', enc(doc(WITHOUT))]]))
    expect(own.ok && bare.ok).toBe(true)
    expect(await itemsOf(own.pdf!)).toEqual(await itemsOf(bare.pdf!))
  }, 900_000)
})
