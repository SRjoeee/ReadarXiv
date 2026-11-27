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

// A bibliography entry's key reaches the instrument (docs/PDF-READER.md §20.3): each entry's unit states its `\bibitem`'s key, and
// the paper's own compile names the entry's destination `cite.<key>` byte for byte, with hyperref alone and with natbib, for keys
// of the characters a key holds (`_`, `:`, `+`, `/`, `.`, `-`, digits, both cases). Our own content, the marked original as the
// prepare makes it, in the pinned TeX Live image, offline.

const IMAGE = compileImageRef()
const docker = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0
type Compiled = { ok: boolean; pdf: Uint8Array | null; log: string; aux: string | null; bbl: null; ms: number }
/** a compile in the image: the files given, pdflatex three times */
function compileIn(files: ReadonlyMap<string, Uint8Array>, main = 'main.tex'): Compiled {
  const dir = mkdtempSync(join(tmpdir(), 'axt-keys-'))
  try {
    for (const [p, b] of files) {
      mkdirSync(dirname(join(dir, p)), { recursive: true })
      writeFileSync(join(dir, p), b)
    }
    for (let pass = 0; pass < 3; pass++) {
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
/** the names of the destinations the paper's own compile's links name (as locate/dests.ts reads them: each link's `dest`), each
 *  one the document resolves */
async function destNamesOf(pdf: Uint8Array): Promise<string[]> {
  const doc = await getDocument({ data: pdf.slice(), verbosity: 0 }).promise
  const names: string[] = []
  for (let n = 1; n <= doc.numPages; n++)
    for (const a of (await (await doc.getPage(n)).getAnnotations()) as { dest?: unknown }[])
      if (typeof a.dest === 'string' && (await doc.getDestination(a.dest))) names.push(a.dest)
  await doc.loadingTask.destroy()
  return names
}
/** the instrument's reference units' keys, in their order, and the paper's own compile's destination names */
async function keysAndNames(tex: string) {
  const files = new Map([['main.tex', new TextEncoder().encode(tex)]])
  const paper = openPaper(files)
  const compiles: Compiled[] = []
  const compile = async ({ main, overrides }: { main: string; overrides: Map<string, Uint8Array> }) => {
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
  const own = compileIn(files)
  return {
    keys: instrument.units.filter((u) => u.kind === 'reference').map((u) => u.key),
    names: await destNamesOf(own.pdf!),
  }
}
const KEYS = ['doe_2020', 'Roe:2021a', 'x+y/z.w-v', 'Case9']
const entries = (natbib: boolean) =>
  KEYS.map((k, i) => `\\bibitem${natbib ? `[Author${i}(${2020 + i})]` : ''}{${k}}\nAuthor ${i}. A title of ours, number ${i}. ${2020 + i}.`).join('\n')
const paperOf = (natbib: boolean) =>
  [
    '\\documentclass{article}',
    natbib ? '\\usepackage{natbib}' : '',
    '\\usepackage{hyperref}',
    '\\begin{document}',
    `Our own text cites ${KEYS.map((k) => `\\cite{${k}}`).join(', ')}.`,
    `\\begin{thebibliography}{${KEYS.length}}`,
    entries(natbib),
    '\\end{thebibliography}',
    '\\end{document}',
  ].join('\n')

describe.skipIf(!docker)("an entry's key, from the source to the instrument, and the destination the paper's own compile names by it", () => {
  for (const natbib of [false, true])
    it(`hyperref${natbib ? ' with natbib' : ' alone'}: each entry's unit states its key, and cite.<key> is a destination's name`, async () => {
      const { keys, names } = await keysAndNames(paperOf(natbib))
      expect(keys).toEqual(KEYS)
      for (const k of KEYS) expect(names).toContain(`cite.${k}`)
    }, 900_000)
})
