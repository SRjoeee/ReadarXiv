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

// An apacite entry, its authors in `APACrefauthors` and the rest in apacite's field commands, is one unit, and the marked compile
// owns its whole: the authors', the title's and the journal's glyphs on B are that unit's (latex-front.ts entryEnvironment). Read
// as an environment of its own, the authors were a unit alone and the rest of the entry was owned by none. The .bbl is written
// as apacite's style writes it, of our own entries.
const APA_ENTRY = (key: string, who: string, title: string, journal: string) =>
  [
    `\\bibitem [\\protect \\citeauthoryear {%\n${who}%\n}{%\n${who}%\n}{%\n{\\protect \\APACyear {2020}}%\n}]{%\n${key}}`,
    `\\APACinsertmetastar {%\n${key}}%`,
    '\\begin{APACrefauthors}%',
    `${who}, A\\BPBI B.%`,
    '\\end{APACrefauthors}%',
    '\\unskip\\',
    '\\newblock',
    '\\APACrefYearMonthDay{2020}{}{}.',
    '\\newblock',
    `{\\BBOQ}\\APACrefatitle {${title}} {${title}}{\\BBCQ}`,
    '\\newblock',
    `\\APACjournalVolNumPages{${journal}}{12}{3}{45--67}.`,
    '\\PrintBackRefs{\\CurrentBib}',
    '',
  ].join('\n')
const APA_BBL = [
  '\\begin{thebibliography}{}',
  '',
  APA_ENTRY('quokka2020', 'Quokkason', 'Hopping patterns of island quokkas', 'Marsupial Letters'),
  APA_ENTRY('wombat2020', 'Wombatley', 'Burrow depth of coastal wombats', 'Burrowing Review'),
  '\\end{thebibliography}',
  '',
].join('\n')
const APA_MAIN = [
  '\\documentclass{article}',
  '\\usepackage[natbibapa]{apacite}',
  '\\begin{document}',
  'Our own text cites \\citet{quokka2020} and \\citet{wombat2020}.',
  '\\bibliographystyle{apacite}',
  '\\bibliography{refs}',
  '\\end{document}',
].join('\n')
/** a unit's text, its pairs' content within (a piece holding pieces: every array it carries read in turn) */
const textOf = (pieces: readonly unknown[]): string =>
  pieces
    .map((p) => {
      const o = p as Record<string, unknown>
      return o.t === 'text' && typeof o.s === 'string' ? o.s : Object.values(o).filter(Array.isArray).map((a) => textOf(a)).join('')
    })
    .join('')
/** each reference unit's text pieces, and the characters of B's glyphs it owns, page by page in stream order */
async function entriesOwned(files: Map<string, Uint8Array>) {
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
  const owned = new Map<number, string>()
  instrument.ink.pages.forEach((page, p) => {
    const by = instrument.glyphs[p]!.unit
    page.glyphs.forEach((g, i) => {
      const u = by[i]!
      if (u >= 0) owned.set(u, (owned.get(u) ?? '') + g.u)
    })
  })
  return instrument.units.flatMap((u, i) =>
    u.kind === 'reference'
      ? [{ text: textOf(u.content), owned: (owned.get(i) ?? '').replace(/\s+/g, '') }]
      : [],
  )
}

describe.skipIf(!docker)("an apacite entry, its authors in an environment of their own: one unit, the marked compile owning its whole", () => {
  it("each entry's unit owns its authors', its title's and its journal's glyphs", async () => {
    const entries = await entriesOwned(new Map([['main.tex', new TextEncoder().encode(APA_MAIN)], ['main.bbl', new TextEncoder().encode(APA_BBL)]]))
    for (const [who, title, journal] of [
      ['Quokkason', 'Hoppingpatternsofislandquokkas', 'MarsupialLetters'],
      ['Wombatley', 'Burrowdepthofcoastalwombats', 'BurrowingReview'],
    ]) {
      const e = entries.find((x) => x.text.includes(who!))
      expect(e, who).toBeDefined()
      expect(e!.owned).toContain(who)
      expect(e!.owned).toContain(title)
      expect(e!.owned).toContain(journal)
    }
  }, 900_000)
})
