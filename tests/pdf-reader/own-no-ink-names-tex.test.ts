// @vitest-environment node
// A name of the marking's no-ink lists the paper itself defines to print (PDF-READER §18.122). The marking reads a placeholder by
// its spelling (marks/marks.ts classOf: INVISIBLE, the role table's textless): `\index`, a size switch and `\label` get no mark,
// whatever the paper's own definition sets. A paper that defines one of them to print a glyph inside a paragraph must never be
// laid with its translation over the glyph and the glyph gone: what a reader gets is either the glyph drawn where TeX set it, or
// the unit drawn as the original. The prepare (packages/engine's one entry) runs here in the pinned TeX Live image, offline, over
// a paper of our own, its own compile standing for arXiv's PDF; each such unit's member is then laid (the typesetter's layPage)
// with a translation of our own, and its state read. Docker and the image are needed: without them the case is skipped.
import { execFile, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { deflateSync, inflateSync } from 'node:zlib'
import * as PL from '@cantoo/pdf-lib'
import type { OutPiece, Part, Piece, Placed, Row, Unit } from '@readarxiv/format'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { COMPILE_IMAGE, latexmkEngine, PLATFORM } from '../../lab/pdf/spikes/compile-image.mjs'
import type { BundleObject } from '../../packages/engine/src/bundle/bundle.ts'
import type { CompileRequest } from '../../packages/engine/src/compile/live.ts'
import { prepare } from '../../packages/engine/src/prepare.ts'
import { layPage } from '../../packages/typeset/src/lay/entry.ts'
import { rulesFor } from '../../packages/typeset/src/rules-for.ts'
import type { Metrics, Rows } from '../../packages/typeset/src/types.ts'

const run = promisify(execFile)
const docker = spawnSync('docker', ['image', 'inspect', COMPILE_IMAGE], { stdio: 'ignore' }).status === 0
/** every compile's date, the lab's (scripts/make-sample-bundle.mjs) */
const EPOCH = 1791244800
const enc = (s: string) => new TextEncoder().encode(s)

/** the paper: three names of the marking's no-ink lists defined to print, each called inside a paragraph of its own */
const PAPER = String.raw`\documentclass{article}
\renewcommand{\index}[1]{\textdagger}
\renewcommand{\footnotesize}{\textsection}
\renewcommand{\label}[1]{[#1]}
\begin{document}
Our first paragraph of words of our own holds an entry\index{entry} standing in it, and more words of ours after it to fill
the line out and go on to a second line.

Our second paragraph of words of our own holds a switch \footnotesize standing in it, and more words of ours after it to
fill the line out and go on to a second line.

Our third paragraph of words of our own holds a label\label{key} standing in it, and more words of ours after it to fill
the line out and go on to a second line.
\end{document}
`

/** a paper whose own package defines the bibliography's separator inside the bibliography environment's definition, to print a
 *  bullet: the source reader cannot read that definition where the separator is used (it is made when the environment begins), and
 *  the class's own separator, in force before it, sets no ink. TeX's answer where the document uses it decides */
const BIB_PAPER = String.raw`\documentclass{article}
\usepackage{ours}
\begin{document}
Our paragraph of words of our own cites a book of ours \cite{a} and goes on with more words of ours to fill the line out.

\begin{thebibliography}{9}
\bibitem{a} A.~Writer. \newblock A title of ours that runs on for a while. \newblock Our Own Press, 2020.
\end{thebibliography}
\end{document}
`
const BIB_STY = String.raw`\ProvidesPackage{ours}
\let\oursbibliography\thebibliography
\renewcommand{\thebibliography}[1]{\oursbibliography{#1}\def\newblock{\textbullet\ }}
`

/** a paper whose own package makes `\label` a write to the aux file alone and `\index` a write with a dagger after it, each
 *  inside another definition's body (the source reader cannot read them where they are used), each write's token list longer
 *  than the log's 79 columns: TeX's log breaks the listed write's line and goes on on the next. The label stands after a
 *  heading, its paragraph's first piece */
const WRITE_PAPER = String.raw`\documentclass{article}
\usepackage{ourwrites}
\begin{document}
\section{A heading of ours}\label{sec:our-own-key}
Our paragraph of words of our own follows the heading and its label, and more words of ours after it to fill the line out
and go on to a second line.

Our second paragraph of words of our own holds an entry\index{entry} standing in it, and more words of ours after it to fill
the line out and go on to a second line.
\end{document}
`
const WRITE_STY = String.raw`\ProvidesPackage{ourwrites}
\newcommand{\ourwrites}{%
  \renewcommand{\label}[1]{\@bsphack\protected@write\@auxout{}{\string\newlabel{##1}{{\@currentlabel}{\thepage}{the words of a heading of ours that run on}{}}}\@esphack}%
  \renewcommand{\index}[1]{\protected@write\@auxout{}{\string\ourentry{##1}{the words of an entry of ours that run on past the columns}}\textdagger}}
\ourwrites
`
/** a paper whose own package defines `\label` inside a definition the paper never calls, so that the label in force is
 *  hyperref's: a write alone, its fields filled in the loop's first pass past the log's columns */
const HYPER_PAPER = String.raw`\documentclass{article}
\usepackage{ourtables}
\usepackage{hyperref}
\begin{document}
\section{A heading of ours with words}\label{sec:our-own-key}
Our paragraph of words of our own follows the heading and its label, and more words of ours after it to fill the line out
and go on to a second line.
\end{document}
`
const TABLES_STY = String.raw`\ProvidesPackage{ourtables}
\newcommand{\ourtable}[1]{\setcounter{table}{#1}\def\label##1{\textdagger}}
`

/** one compile in the image: latexmk with pdflatex, `files` every file it left */
async function compile(sources: Map<string, Uint8Array>, req: { rerun: boolean; files?: boolean; date?: number }) {
  const dir = mkdtempSync(join(tmpdir(), 'axt-own-no-ink-'))
  try {
    for (const [path, bytes] of sources) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), bytes)
    }
    const date = req.date ?? EPOCH
    await run(
      'docker',
      ['run', '--rm', '--init', '--pull', 'never', ...PLATFORM, '--network', 'none', '-e', 'FORCE_SOURCE_DATE=1', '-e', `SOURCE_DATE_EPOCH=${date}`, '-v', `${dir}:/work`, '-w', '/work', COMPILE_IMAGE, 'timeout', '600', 'latexmk', ...latexmkEngine('pdflatex'), ...(req.rerun ? [] : ['-e', '$max_repeat=1']), '-interaction=nonstopmode', '-f', 'main.tex'],
      { maxBuffer: 1 << 26 },
    ).catch(() => {})
    const pdf = existsSync(join(dir, 'main.pdf')) ? new Uint8Array(readFileSync(join(dir, 'main.pdf'))) : null
    const log = existsSync(join(dir, 'main.log')) ? readFileSync(join(dir, 'main.log'), 'latin1') : ''
    const left = req.files
      ? new Map(
          (readdirSync(dir, { recursive: true }) as string[])
            .filter((p) => statSync(join(dir, p)).isFile() && !/\.(?:pdf|log|fls|fdb_latexmk)$/.test(p))
            .map((p): [string, Uint8Array] => [p, new Uint8Array(readFileSync(join(dir, p)))]),
        )
      : null
    return { ok: !!pdf?.length, pdf, log, ...(left ? { files: left } : {}) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

type Made = { units: Unit[]; parts: Part[] }
/** the prepare over the paper: arXiv's PDF its own compile, every object it makes read back */
async function prepared(tex: string, more: readonly [string, string][] = []): Promise<Made> {
  const files = new Map([['main.tex', enc(tex)], ...more.map(([f, t]): [string, Uint8Array] => [f, enc(t)])])
  const A = (await compile(files, { rerun: true })).pdf
  if (!A) throw new Error('the paper made no PDF')
  const made: Made = { units: [], parts: [] }
  const end = await prepare(() => ({ files, original: A, stored: null }), {
    paper: { id: '2612.99992', version: 1 },
    made: 'own-no-ink-names',
    tree: { year: '2025', served: ['2025'], fallback: '2025' },
    engines: ['pdflatex'],
    pdfjs: { getDocument, OPS } as never,
    documentOptions: { verbosity: 0 },
    PL: PL as never,
    deflate: (b) => new Uint8Array(deflateSync(b)),
    inflate: (b, limit) => new Uint8Array(inflateSync(b, { maxOutputLength: limit + 1 })),
    compile: async (q: CompileRequest) =>
      compile(new Map([...files, ...q.overrides]), {
        rerun: q.rerun,
        ...(q.files ? { files: true } : {}),
        ...(q.sourceDate !== undefined ? { date: q.sourceDate } : {}),
      }),
    stage: () => {},
    units: async () => {},
    instrument: async () => {},
    object: async (x: BundleObject) => {
      if (x.kind === 'units') made.units.push(...JSON.parse(new TextDecoder().decode(x.bytes)).units)
      if (x.kind === 'part') made.parts.push(JSON.parse(new TextDecoder().decode(x.bytes)))
    },
    note: () => {},
    now: () => performance.now(),
  })
  if (!('ok' in end) || !end.ok) throw new Error(`the prepare refused the paper: ${JSON.stringify(end).slice(0, 300)}`)
  return made
}

const elsOf = (ps: readonly Piece[]): Extract<Piece, { t: 'el' }>[] =>
  ps.flatMap((p) => (p.t === 'el' ? [p] : p.t === 'span' ? elsOf(p.content) : []))
/** a translation of our own of a unit: its words in capitals, its elements and groups where they stand */
const echo = (ps: readonly Piece[]): OutPiece[] =>
  ps.map((p) =>
    p.t === 'text' ? { t: 'text', s: p.s.toUpperCase() } : p.t === 'span' ? { t: 'span', id: p.id, content: echo(p.content) } : { t: 'el', id: p.id },
  )
const metrics = (): Metrics => ({
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
})

/** what a reader gets for the unit holding the element whose source begins with `head`: each of its members' laid state, the
 *  part's own statement where it stays the original's (`why`), and the element's ink and text as the part states them */
function readerGets(m: Made, head: string) {
  const u = m.units.find((x) => elsOf(x.content).some((e) => e.src.startsWith(head)))
  if (!u) throw new Error(`no unit holds ${head}`)
  const el = elsOf(u.content).find((e) => e.src.startsWith(head))!
  const row: Row = { id: u.id, ok: true, by: 'test', content: echo(u.content) }
  const rows: Rows = { get: (k) => (k === row.id ? row : undefined), done: true }
  const out: { state: string; why: string | null; ink: number; text: string | undefined; kind?: string; unknown?: number }[] = []
  for (const part of m.parts) {
    const mine = part.flows.flat().filter((x: Placed) => x.text === u.id)
    if (!mine.length) continue
    const laid = layPage(part, rows, rulesFor('de'), metrics()).members
    for (const x of mine) {
      const stated = x.els?.find(([k]) => k === el.id)?.[1]
      out.push({
        state: laid.find((l) => l.ord === x.ord)?.state ?? 'absent',
        why: x.why ?? null,
        ink: stated?.ink?.length ?? 0,
        text: stated?.text,
        ...(stated?.kind ? { kind: stated.kind } : {}),
        ...(stated?.unknown ? { unknown: stated.unknown } : {}),
      })
    }
  }
  return out
}

describe.skipIf(!docker)("a name of the marking's no-ink lists the paper defines to print: never translated with its glyph gone", () => {
  let made: Made
  beforeAll(async () => {
    made = await prepared(PAPER)
  }, 900_000)
  for (const [what, head] of [
    ['an \\index the paper defines as a dagger', '\\index'],
    ['a size switch the paper defines to print a section sign', '\\footnotesize'],
  ] as const)
    it(`${what}: its glyph drawn where TeX set it, or its unit the original's`, () => {
      const got = readerGets(made, head)
      expect(got.length).toBeGreaterThan(0)
      for (const g of got) {
        // (laid: the element's ink stated, so that its glyph is drawn where TeX set it; else the unit stays the original's)
        if (g.state === 'laid') expect({ ...g, inkStated: g.ink > 0 }).toMatchObject({ inkStated: true })
        else expect(g.state).not.toBe('laid')
      }
    })
  describe('a separator the paper defines inside its bibliography environment’s definition, to print a bullet', () => {
    let bib: Made
    beforeAll(async () => {
      bib = await prepared(BIB_PAPER, [['ours.sty', BIB_STY]])
    }, 900_000)
    it('its glyph drawn where TeX set it, or its entry the original’s', () => {
      const got = readerGets(bib, '\\newblock')
      expect(got.length).toBeGreaterThan(0)
      for (const g of got) {
        if (g.state === 'laid') expect({ ...g, inkStated: g.ink > 0 }).toMatchObject({ inkStated: true })
        else expect(g.state).not.toBe('laid')
      }
    })
  })
  it("a \\label the paper defines to print its key: the source reader reads the definition in force, its printed text the unit's", () => {
    // (no placeholder: the key TeX prints is text of the unit, sent and laid as its words are)
    expect(made.units.some((u) => elsOf(u.content).some((e) => e.src.startsWith('\\label')))).toBe(false)
    expect(made.units.some((u) => u.content.some((p) => p.t === 'text' && p.s.includes('label[key] standing')))).toBe(true)
  })
})

// (TeX's file whatsits draw nothing: a `\write`, `\openout` or `\closeout` node is no ink, read so however long the log's line of
// it runs: TeX's log breaks a line at its 79 columns, max_print_line, and the listed write's rest stands on the next line)
describe.skipIf(!docker)('a name the paper defines to write to a file, its listed write past the log’s columns', () => {
  let writes: Made
  let hyper: Made
  beforeAll(async () => {
    writes = await prepared(WRITE_PAPER, [['ourwrites.sty', WRITE_STY]])
    hyper = await prepared(HYPER_PAPER, [['ourtables.sty', TABLES_STY]])
  }, 900_000)
  // (TeX's answer of no ink: the class table's no-ink reading stands, as for the kernel's name; read as a node not known, the
  // element was a paper's own macro no table renders, `umacro` and `unknown`, its ink to be found)
  it('a write alone: TeX answers it sets no ink, its unit laid and the element stated with none', () => {
    const got = readerGets(writes, '\\label')
    expect(got.length).toBeGreaterThan(0)
    for (const g of got) {
      expect(g).toMatchObject({ state: 'laid', ink: 0, kind: 'zero' })
      expect(g.unknown).toBeUndefined()
    }
  })
  it('a name the paper defines but never puts in force: the label in force is a write alone, answered as one', () => {
    const got = readerGets(hyper, '\\label')
    expect(got.length).toBeGreaterThan(0)
    for (const g of got) {
      expect(g).toMatchObject({ state: 'laid', ink: 0, kind: 'zero' })
      expect(g.unknown).toBeUndefined()
    }
  })
  it('a write with a dagger after it: TeX answers it sets ink, its glyph drawn where TeX set it', () => {
    const got = readerGets(writes, '\\index')
    expect(got.length).toBeGreaterThan(0)
    for (const g of got) expect({ ...g, inkStated: g.ink > 0 }).toMatchObject({ state: 'laid', inkStated: true })
  })
})
