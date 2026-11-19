// @vitest-environment node
// A display is a display where TeX set one, whatever the source spells (PDF-READER §18.95): the prepare (packages/engine's one
// entry), its compiles made in the pinned TeX Live image, offline, over two papers of our own that TeX sets alike, one writing
// each display through a macro of the paper's own and one spelling it as an environment. A paper's macro with no parameter
// that opens and closes an environment (`\be … \ee`), between two stretches of text and at a unit's end; one with a parameter
// whose body is an environment (`\al{…}`); one inside a conditional of the paper's own (`\iftru … \fi`); a display whose source
// ends with the environment's own `\end{…}` after the paper's macro began it. Each is stated a display in the units object and in
// the part (El.kind), its rows held where TeX set them (the member's KEPT lines, as the spelled twin's), and sent as a spelled
// display is (Google's and Microsoft's wires the twin's byte for byte, its own marker, a break of the sentence, its stop where the
// source sets one at its end). A paper's macro that sets no display (a text macro, an inline formula's macro) stays its marks'
// class. Docker and the image are needed: without them the cases are skipped, as the marks' invariant is
import { execFile, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { deflateSync, inflateSync } from 'node:zlib'
import * as PL from '@cantoo/pdf-lib'
import { LINE_FLAG, type Part, type Piece, type Placed, type Unit } from '@readarxiv/format'
import { google, microsoft, unitInOf } from '@readarxiv/translate'
import { scriptedFetch } from '@readarxiv/translate/testing'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { COMPILE_IMAGE, latexmkEngine, PLATFORM } from '../../lab/pdf/spikes/compile-image.mjs'
import type { BundleObject } from '../../packages/engine/src/bundle/bundle.ts'
import type { CompileRequest } from '../../packages/engine/src/compile/live.ts'
import { prepare } from '../../packages/engine/src/prepare.ts'

const run = promisify(execFile)
const docker = spawnSync('docker', ['image', 'inspect', COMPILE_IMAGE], { stdio: 'ignore' }).status === 0
/** every compile's date, the lab's (2026-10-06) */
const EPOCH = 1791244800
const enc = (s: string) => new TextEncoder().encode(s)

/** the paper, its displays written through its own macros (`macro`) or spelled as environments: the same page either way */
const paperOf = (macro: boolean) => {
  const be = (body: string) => (macro ? `\\be\n${body}\n\\ee` : `\\begin{equation}\n${body}\n\\end{equation}`)
  const al = (rows: string) => (macro ? `\\al{\n${rows}\n}` : `\\begin{align}\n${rows}\n\\end{align}`)
  return String.raw`\documentclass{article}
\usepackage{amsmath}
\newcommand{\be}{\begin{equation}}
\newcommand{\ee}{\end{equation}}
\newcommand{\al}[1]{\begin{align}#1\end{align}}
\def\iftru{\iftrue}
\newcommand{\kw}{keyword}
\newcommand{\vx}{\mathbf{x}}
\newcommand{\bq}{\begin{quote}}
\newcommand{\eq}{\end{quote}}
\begin{document}
\section{Weights}
The total of the weights we keep for every row of the table is given by
${be('w = a + b + c + d + e + f + g + h + i + j + k + l + m + n + o + p + q')}
where each weight is read from the table once, and the total is never taken twice.

The paragraph closes with a display of the same kind, which ends the paragraph:
${be('s = t + u')}

The second form takes an argument holding two rows of its own:
${al('x &= y + z \\\\\n y &= 2 z')}
and both rows stay where the paper sets them.

\iftru
A display inside a conditional of the paper follows here,
${be('q = r \\cdot s')}
and the text goes on after it.
\fi

A text macro \kw{} and an inline formula $\vx$ stay as they were in this sentence of the paper.

The bound on the rows reads
${be('m = n + 1 ,')}
where m counts the rows of the table.

The total of the second table is
${be('t = 2 .')}
The next sentence starts after the display.

The rows of the second form read
${al('a &= b \\\\\n c &= d .')}
The sentence after the rows starts here.

The pair of rows reads
${al('e &= f \\\\\n g &= h ,')}
where both rows hold for the table.

A quoted line follows.
\bq
The quote ends here.
\eq
The text goes on after the quote.

The last display ends as the environment does:
${macro ? '\\be\np = 1 .\n\\end{equation}' : '\\begin{equation}\np = 1 .\n\\end{equation}'}
Then a new sentence starts after it.
\end{document}
`
}

/** one compile in the image: latexmk with the paper's engine, `once` a pass alone, `files` every file it left */
async function compile(sources: Map<string, Uint8Array>, req: { rerun: boolean; files?: boolean; date?: number }) {
  const dir = mkdtempSync(join(tmpdir(), 'axt-display-tex-'))
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
/** the prepare over a paper: arXiv's PDF its own compile, every object it makes read back */
async function prepared(tex: string): Promise<Made> {
  const files = new Map([['main.tex', enc(tex)]])
  const A = (await compile(files, { rerun: true })).pdf
  if (!A) throw new Error('the paper made no PDF')
  const made: Made = { units: [], parts: [] }
  const end = await prepare(() => ({ files, original: A, stored: null }), {
    paper: { id: '2612.99991', version: 1 },
    made: 'display-tex',
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
/** the unit holding an element whose source begins with `head`, and that element */
const holding = (m: Made, head: string) => {
  const u = m.units.find((x) => elsOf(x.content).some((e) => e.src.startsWith(head)))
  if (!u) throw new Error(`no unit holds ${head}`)
  return { u, el: elsOf(u.content).find((e) => e.src.startsWith(head))! }
}
/** a unit's members in the parts, each once (its first part's) */
const membersOf = (m: Made, id: string): Placed[] => {
  const seen = new Set<number>()
  return m.parts.flatMap((p) => p.flows.flat().filter((x) => x.text === id && !seen.has(x.ord) && !!seen.add(x.ord)))
}
/** a unit's KEPT lines (Line[9]'s LINE_FLAG.KEPT bit), each [page, x0, x1, baseline] */
const keptOf = (m: Made, id: string) =>
  membersOf(m, id).flatMap((x) => x.lines.filter((l) => (l[9] & LINE_FLAG.KEPT) !== 0).map((l) => [l[0], l[2], l[3], l[4]]))
/** an element's kind as the part states it, by its unit and its piece id */
const elKindOf = (m: Made, id: string, piece: string) =>
  membersOf(m, id)
    .flatMap((x) => x.els ?? [])
    .find(([k]) => k === piece)?.[1].kind
const g = google({ fetch: scriptedFetch(() => ({ status: 200, body: '[]' })).fetch })
const ms = microsoft({ fetch: scriptedFetch(() => ({ status: 200, body: '[]' })).fetch })

describe.skipIf(!docker)('a display TeX set through a macro of the paper, as a spelled one', () => {
  let macro: Made, spelled: Made
  beforeAll(async () => {
    ;[macro, spelled] = [await prepared(paperOf(true)), await prepared(paperOf(false))]
  }, 900_000)
  const CASES: [string, string, string][] = [
    ['between two stretches of text', '\\be\nw =', '\\begin{equation}\nw ='],
    ['with a comma before the macro that ends it', '\\be\nm =', '\\begin{equation}\nm ='],
    ['with a full stop before the macro that ends it', '\\be\nt =', '\\begin{equation}\nt ='],
    ["with a full stop before its argument's end", '\\al{\na &=', '\\begin{align}\na &='],
    ["with a comma before its argument's end", '\\al{\ne &=', '\\begin{align}\ne &='],
    ["at its unit's end", '\\be\ns =', '\\begin{equation}\ns ='],
    ['with a parameter whose body is an environment', '\\al{', '\\begin{align}'],
    ['inside a conditional of the paper', '\\be\nq =', '\\begin{equation}\nq ='],
    ["its source ending with the environment's own end", '\\be\np =', '\\begin{equation}\np ='],
  ]
  for (const [what, mine, theirs] of CASES)
    it(`${what}: stated a display, its rows held as the spelled twin's, sent as the twin is`, () => {
      const a = holding(macro, mine),
        b = holding(spelled, theirs)
      expect(b.el.kind).toBe('display')
      expect(a.el.kind).toBe('display')
      expect(a.el.stop).toBe(b.el.stop)
      expect(a.el.id).toBe(b.el.id)
      expect(elKindOf(macro, a.u.id, a.el.id)).toBe('display')
      const held = keptOf(spelled, b.u.id)
      expect(held.length).toBeGreaterThan(0)
      expect(keptOf(macro, a.u.id)).toEqual(held)
      // (the twin's id, which its source's spelling makes another: the wire's bytes are what a translator is sent)
      for (const w of [g, ms])
        expect(w.write(unitInOf({ ...a.u, id: b.u.id }), 'zh-Hans')).toBe(w.write(unitInOf(b.u), 'zh-Hans'))
    })
  it("reads a display's stop at its source's end as a spelled one's, before the paper's macro or its argument's end", () => {
    expect(holding(macro, '\\be\np =').el.stop).toBe('.')
    expect(holding(macro, '\\be\nm =').el.stop).toBe(',')
    expect(holding(macro, '\\be\nt =').el.stop).toBe('.')
    expect(holding(macro, '\\al{\na &=').el.stop).toBe('.')
    expect(holding(macro, '\\al{\ne &=').el.stop).toBe(',')
    expect(holding(macro, '\\be\nw =').el.stop).toBe(undefined)
  })
  it("keeps a paper's closing macro that closes no display as it was: its marks' class, no stop", () => {
    const us = macro.units.filter((x) => elsOf(x.content).some((e) => /^\\[be]q\b/.test(e.src)))
    expect(us.length).toBeGreaterThan(0)
    for (const e of us.flatMap((x) => elsOf(x.content)).filter((x) => /^\\[be]q\b/.test(x.src)))
      expect([e.kind, e.stop]).toEqual(['macro', undefined])
  })
  it('keeps a text macro and an inline formula as their marks state them, nothing held', () => {
    const { u } = holding(macro, '\\kw')
    expect(elsOf(u.content).map((e) => [e.src, e.kind])).toEqual([
      ['\\kw{}', 'macro'],
      ['$\\vx$', 'math'],
    ])
    expect(keptOf(macro, u.id)).toEqual([])
  })
})
