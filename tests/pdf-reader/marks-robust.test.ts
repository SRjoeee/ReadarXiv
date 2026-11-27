// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { marksOutOfPlace } from '../../packages/engine/src/compile/guard.ts'
import { openPaper, originalFiles } from '../../packages/engine/src/compile/live.ts'
import { markedOfPaper } from '../../packages/engine/src/compile/paper.ts'
import { LAYOUT_CLASSES } from '../../packages/engine/src/marks/marks.ts'
import { compileImageRef } from '../../lab/pdf/spikes/compile-image.mjs'

// The marks survive what a class or a package does with a text before it sets it, and never reach a file TeX writes. A gated
// mark of ours (LAYOUT_TEX's \axthmark, \axtpma, \axtpmm, \axtpm, \axthpk, \axttg, \axtcolour, CARRY_TEX's \axtpmd) is
// expanded by every \edef LaTeX makes of the text it stands in. Two of them store a text by LaTeX's \protected@edef before
// they set it: REVTeX 4.0's \section, through the textcase it carries (\MakeTextUppercase: a \protected@edef, then
// \uppercase), and thmtools' proof (thm-patch.sty: the optional title through a \protected@edef). LaTeX's \protected@write,
// the one path of the contents lines, the lists' entries, the labels and the index entries, expands its text the same way,
// with the same \protect. Each case here: our own content, the marked original as the prepare makes it (markedOfPaper: the
// probe, its answers, the marked compile) or written by hand around the marked original's head, in the pinned TeX Live image,
// offline. Asked: the heading's two points set once each, by the names the marking wrote, its alignment stated (AXT-ALIGN);
// every text item where the paper's own compile sets it; and no gated mark in any file TeX wrote, none out of a list entry's
// text (compile/guard.ts marksOutOfPlace)

const IMAGE = compileImageRef()
const docker = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0
/** the marks LaTeX's \protected@write must never write (a gated mark's name, its control word) */
const GATED = /\\axt(?:pma|pmm|pmd|pm|hpk|tg|hmark|colour)(?![A-Za-z@])/
type Compiled = { ok: boolean; pdf: Uint8Array | null; log: string; aux: string | null; bbl: null; ms: number; written: Map<string, string> }
type Request = { main: string; rerun: boolean; overrides: Map<string, Uint8Array> }
/** a compile in the image: the files given and the request's, pdflatex three times; every file it wrote but its PDF and log */
function compileIn(files: ReadonlyMap<string, Uint8Array>, main = 'main.tex', passes = 3): Compiled {
  const dir = mkdtempSync(join(tmpdir(), 'axt-robust-'))
  try {
    for (const [p, b] of files) {
      mkdirSync(dirname(join(dir, p)), { recursive: true })
      writeFileSync(join(dir, p), b)
    }
    for (let pass = 0; pass < passes; pass++) {
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
    const written = new Map<string, string>()
    for (const f of readdirSync(dir)) if (!files.has(f) && !/\.(?:pdf|log)$/.test(f)) written.set(f, read(f)?.toString('latin1') ?? '')
    return { ok: !!pdf, pdf: pdf ? new Uint8Array(pdf) : null, log: read(`${stem}.log`)?.toString('latin1') ?? '', aux: written.get(`${stem}.aux`) ?? null, bbl: null, ms: 1, written }
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
/** the points (`/axt-<name> ri`) a PDF sets, each name with the times it is set */
const pointsOf = async (pdf: Uint8Array) => {
  const doc = await getDocument({ data: pdf.slice(), verbosity: 0 }).promise
  const out = new Map<string, number>()
  for (let n = 1; n <= doc.numPages; n++) {
    const ops = await (await doc.getPage(n)).getOperatorList()
    ops.fnArray.forEach((f, j) => {
      const name = (ops.argsArray[j]?.[0] as { name?: string } | undefined)?.name
      if (f === OPS.setRenderingIntent && typeof name === 'string' && name.startsWith('axt-')) out.set(name.slice(4), (out.get(name.slice(4)) ?? 0) + 1)
    })
  }
  await doc.loadingTask.destroy()
  return out
}
/** a document as the prepare marks it: its marked original's final compile (markedOfPaper, with the files every pass wrote),
 *  the paper's own compile, and its units */
async function prepared(tex: string) {
  const files = new Map([['main.tex', new TextEncoder().encode(tex)]])
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
  const own = compileIn(files)
  return { paper, pdf, log: last?.log ?? '', written: last?.written ?? new Map<string, string>(), own: own.pdf! }
}
/** the heading units' indices, in order */
const headingsOf = (paper: ReturnType<typeof openPaper>) =>
  paper.units.flatMap((u, i) => (u.kind === 'heading' ? [i] : []))
/** every written file's gated marks, and its marks out of a list entry's or a label's text: [file, what] */
const strays = (written: ReadonlyMap<string, string>) =>
  [...written].flatMap(([f, t]) => [
    ...(GATED.test(t) ? [[f, t.split('\n').find((l) => GATED.test(l))!]] : []),
    ...marksOutOfPlace(t).map((m) => [f, m]),
  ])

describe.skipIf(!docker)("a heading's marks through what a class does with its text before it sets it", () => {
  it("a \\protected@edef, then \\uppercase, over a section's title (textcase's form, of no class): both points set once, by the names written, the alignment stated", async () => {
    const r = await prepared(
      [
        '\\documentclass{article}',
        '\\makeatletter',
        '\\DeclareRobustCommand\\UpCase[1]{{\\protected@edef\\reserved@a{#1}\\expandafter\\uppercase\\expandafter{\\reserved@a}}}',
        '\\let\\oursect\\@sect',
        '\\def\\@sect#1#2#3#4#5#6[#7]#8{\\oursect{#1}{#2}{#3}{#4}{#5}{#6}[#7]{\\UpCase{#8}}}',
        '\\makeatother',
        '\\begin{document}',
        '\\tableofcontents',
        '\\section{Introduction to the test}',
        'Our own first paragraph, long enough to be a unit of its own.',
        '\\section{Results of ours with $x$ in them}',
        'Our own last paragraph, long enough to be a unit of its own.',
        '\\end{document}',
        '',
      ].join('\n'),
    )
    const points = await pointsOf(r.pdf)
    const heads = headingsOf(r.paper)
    expect(heads).toHaveLength(2)
    for (const h of heads) {
      expect([points.get(`h${h}s`), points.get(`h${h}e`)], `heading ${h}`).toEqual([1, 1])
      expect(r.log, `heading ${h}`).toContain(`AXT-ALIGN h${h} `)
    }
    // (no point named in capitals: the case change reaches no mark's name)
    expect([...points.keys()].filter((n) => /[A-Z]/.test(n))).toEqual([])
    expect(await itemsOf(r.pdf)).toEqual(await itemsOf(r.own))
    expect(strays(r.written)).toEqual([])
  }, 900_000)
  it("a \\protected@edef over a proof's optional title (thm-patch.sty's form, of no package): both points set once", async () => {
    const r = await prepared(
      [
        '\\documentclass{article}',
        '\\usepackage{amsthm}',
        '\\newtheorem{theorem}{Theorem}',
        '\\makeatletter',
        '\\expandafter\\let\\expandafter\\ourproof\\csname\\string\\proof\\endcsname',
        '\\expandafter\\def\\csname\\string\\proof\\endcsname[#1]{\\protected@edef\\tmp@args{[#1]}\\expandafter\\ourproof\\tmp@args}',
        '\\makeatother',
        '\\begin{document}',
        '\\begin{theorem}\\label{t}Our own statement of a theorem.\\end{theorem}',
        '\\begin{proof}[Proof of Theorem \\ref{t} with $x$]',
        'Our own last paragraph, long enough to be a unit of its own.',
        '\\end{proof}',
        '\\end{document}',
        '',
      ].join('\n'),
    )
    const points = await pointsOf(r.pdf)
    const heads = headingsOf(r.paper)
    expect(heads).toHaveLength(1)
    expect([points.get(`h${heads[0]}s`), points.get(`h${heads[0]}e`)]).toEqual([1, 1])
    expect(await itemsOf(r.pdf)).toEqual(await itemsOf(r.own))
    expect(strays(r.written)).toEqual([])
  }, 900_000)
  it("REVTeX 4.0's \\section and thmtools' proof, the packages themselves: every heading's two points set once", async () => {
    for (const tex of [
      '\\documentclass[aps]{revtex4}\n\\begin{document}\n\\title{A title of our own words}\n\\maketitle\n\\section{Introduction to $x$ and the test}\nOur own first paragraph, long enough to be a unit of its own.\n\\subsection{A part of ours}\nOur own last paragraph, long enough to be a unit of its own.\n\\end{document}\n',
      '\\documentclass{article}\n\\usepackage{amsthm}\n\\usepackage{thmtools}\n\\newtheorem{theorem}{Theorem}\n\\begin{document}\n\\begin{theorem}\\label{t}Our own statement of a theorem.\\end{theorem}\n\\begin{proof}[Proof of Theorem \\ref{t} with $x$]\nOur own last paragraph, long enough to be a unit of its own.\n\\end{proof}\n\\end{document}\n',
    ]) {
      const r = await prepared(tex)
      const points = await pointsOf(r.pdf)
      const heads = headingsOf(r.paper)
      expect(heads.length).toBeGreaterThan(0)
      for (const h of heads) expect([points.get(`h${h}s`) ?? 0, points.get(`h${h}e`) ?? 0], `${tex.slice(0, 40)} heading ${h}`).toEqual([1, 1])
      expect(await itemsOf(r.pdf)).toEqual(await itemsOf(r.own))
      expect(strays(r.written)).toEqual([])
    }
  }, 1_800_000)
})

describe.skipIf(!docker)('no mark of ours in a file TeX writes and reads back', () => {
  it("minitoc's part contents, read back with no \\@starttoc: no gated mark in any file, each heading's points set once", async () => {
    const r = await prepared(
      [
        '\\documentclass{article}',
        '\\usepackage{minitoc}',
        '\\doparttoc',
        '\\begin{document}',
        '\\tableofcontents',
        '\\part{The first part}',
        '\\parttoc',
        '\\section{Introduction to $x$ and the test}',
        'Our own first paragraph, long enough to be a unit of its own.',
        '\\section{Results of ours}',
        'Our own last paragraph, long enough to be a unit of its own.',
        '\\end{document}',
        '',
      ].join('\n'),
    )
    expect([...r.written.keys()].some((f) => /\.ptc\d*$/.test(f))).toBe(true)
    expect(strays(r.written)).toEqual([])
    const points = await pointsOf(r.pdf)
    for (const h of headingsOf(r.paper)) expect(points.get(`h${h}e`) ?? 0, `heading ${h}`).toBeLessThanOrEqual(1)
    expect(await itemsOf(r.pdf)).toEqual(await itemsOf(r.own))
  }, 900_000)
  it('a contents line, an index entry, a label\'s text, a caption\'s list entry and a stored text written through LaTeX\'s writes: none of the gated marks in any file', async () => {
    // (the marks written by hand into what LaTeX writes, after the marked original's head: each gated mark, raw and stored
    // first by a \protected@edef, as a class stores a title)
    const tex = '\\documentclass{article}\n\\usepackage{makeidx}\n\\makeindex\n\\begin{document}\n\\tableofcontents\n\\listoffigures\nOur own first paragraph, long enough to be a unit of its own.\n\\end{document}\n'
    const files = originalFiles(openPaper(new Map([['main.tex', new TextEncoder().encode(tex)]])), { lines: true, layout: LAYOUT_CLASSES })
    const marked = new TextDecoder('latin1').decode(files.get('main.tex'))
    const hand = [
      '\\section{\\axthmark{h90s}A heading by hand\\axthmark{h90e}}',
      // (an index entry of a term a macro of the paper's sets and indexes: \\index reads its own argument verbatim, by
      // \\@sanitize, and writes it as the source has it, but the macro's argument comes to it as tokens, expanded in the write)
      '\\newcommand\\term[1]{#1\\index{#1}}\\term{\\axtpma{p91.1a}an entry\\axtpm{p91.1b}}',
      '\\addcontentsline{toc}{section}{\\axthpk{p92.1a}a line\\axttg{p92.1g}}',
      '\\makeatletter\\protected@edef\\@currentlabel{\\axtpmm{p93.1a}7\\axtcolour{c93.1}}\\makeatother\\label{hand}',
      '\\begin{figure}[h]\\caption{\\axthmark{h94s}A caption\\axtpm{p94.1b}}\\end{figure}',
      '\\makeatletter\\protected@edef\\axtstored{\\axthmark{h95s}stored\\axthmark{h95e}}\\addtocontents{toc}{\\axtstored}\\makeatother',
      'See \\ref{hand}.',
    ].join('\n')
    const c = compileIn(new Map([['main.tex', new TextEncoder().encode(marked.replace('\\end{document}', `${hand}\n\\end{document}`))]]))
    expect(c.ok).toBe(true)
    expect([...c.written.keys()].sort()).toEqual(expect.arrayContaining(['main.aux', 'main.idx', 'main.lof', 'main.toc']))
    expect(strays(c.written)).toEqual([])
    // (and what LaTeX set of them: the heading, the entry and the caption with their own text)
    expect(c.written.get('main.toc')).toContain('A heading by hand')
    expect(c.written.get('main.idx')).toContain('an entry')
    expect(c.written.get('main.lof')).toContain('A caption')
  }, 900_000)
})
