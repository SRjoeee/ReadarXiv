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
import { instrumentOf } from '../../packages/engine/src/instrument/instrument.ts'
import { LAYOUT_CLASSES } from '../../packages/engine/src/marks/marks.ts'
import { compileImageRef } from '../../lab/pdf/spikes/compile-image.mjs'
import { DOCUMENT_OPTIONS } from './helpers/ocg-pdfs'

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
  const m = made as { options?: Record<string, unknown>; probeLog?: string }
  return {
    paper,
    pdf,
    log: last?.log ?? '',
    written: last?.written ?? new Map<string, string>(),
    own: own.pdf!,
    ownLog: own.log,
    options: m.options ?? {},
    probeLog: m.probeLog ?? null,
  }
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
      // (a title's start point is set by neither: its first mark stands in vertical mode, where \axt@hm sets none by design,
      // and the unit is located by its end)
      const title = (h: number) => JSON.stringify(r.paper.units[h]).includes('A title of our own words')
      for (const h of heads)
        expect([points.get(`h${h}s`) ?? 0, points.get(`h${h}e`) ?? 0], `${tex.slice(0, 40)} heading ${h}`).toEqual([title(h) ? 0 : 1, 1])
      expect(await itemsOf(r.pdf)).toEqual(await itemsOf(r.own))
      expect(strays(r.written)).toEqual([])
    }
  }, 1_800_000)
})

describe.skipIf(!docker)('the compile these tests read', () => {
  it('a final pass that dies leaves no PDF to compare: an earlier pass\'s is not taken for it', () => {
    // (a document of our own that counts its passes in a file of its own and stops TeX at its third: the second pass's PDF
    // must not stand for the run)
    const tex = String.raw`\documentclass{article}
\newread\axtcnt \openin\axtcnt=passes.txt \ifeof\axtcnt \def\axtn{0}\else \read\axtcnt to\axtn \fi \closein\axtcnt
\newwrite\axtout \immediate\openout\axtout=passes.txt \immediate\write\axtout{\the\numexpr\axtn+1\relax}\immediate\closeout\axtout
\begin{document}
Our own words.\ifnum\axtn>1 \batchmode\read-1 to\axtx\fi
\end{document}
`
    const c = compileIn(new Map([['main.tex', new TextEncoder().encode(tex)]]))
    expect(c.ok).toBe(false)
  }, 300_000)
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

/** the points a PDF sets, by page: each name with the pages it is set on */
const pointPagesOf = async (pdf: Uint8Array) => {
  const doc = await getDocument({ data: pdf.slice(), verbosity: 0 }).promise
  const out = new Map<string, number[]>()
  for (let n = 1; n <= doc.numPages; n++) {
    const ops = await (await doc.getPage(n)).getOperatorList()
    ops.fnArray.forEach((f, j) => {
      const name = (ops.argsArray[j]?.[0] as { name?: string } | undefined)?.name
      if (f === OPS.setRenderingIntent && typeof name === 'string' && name.startsWith('axt-')) out.set(name.slice(4), [...(out.get(name.slice(4)) ?? []), n])
    })
  }
  await doc.loadingTask.destroy()
  return out
}
/** what the ownership (own/own.ts ownOf, as the instrument calls it) reads for a unit: null where it owns it, else why not; and
 *  the pages it owns it on */
async function ownedOf(r: Awaited<ReturnType<typeof prepared>>, id: number) {
  const pdfjs = { getDocument, OPS } as never
  const { today } = await instrumentOf({
    paper: r.paper as never,
    finalPdf: r.pdf,
    options: r.options,
    log: r.log,
    probeLog: r.probeLog,
    pdfjs,
    documentOptions: DOCUMENT_OPTIONS,
    made: { compiler: 'pdflatex', tree: '2025', front: 'today' },
  })
  const u = today.own.units.get(id)
  return { unhidden: u ? u.unhidden : 'no unit', pages: [...(u?.pages ?? [])].sort() }
}
/** a section of several pages of our own words, so that its running head stands on the pages after its own */
const PAGES = Array.from({ length: 14 }, (_, i) => `Our own paragraph number ${i + 1} of the section, ${'with words of ours that fill the line out and go on to the next one, '.repeat(6)}and an end.`).join('\n\n')

describe.skipIf(!docker)("what the marks do where LaTeX stores a heading and sets it again without writing it", () => {
  it("a running head (\\markboth under the headings style, and fancyhdr's \\leftmark and \\rightmark, two-sided): no point of the heading's set there, the heading located once, every head's words where the paper's own compile sets them", async () => {
    for (const pre of [
      '\\documentclass[twoside]{article}\n\\pagestyle{headings}',
      '\\documentclass[twoside]{article}\n\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n\\fancyhead[LE]{\\leftmark}\\fancyhead[RO]{\\rightmark}',
    ]) {
      const r = await prepared(`${pre}\n\\begin{document}\n\\section{Introduction to the test}\n${PAGES}\n\\subsection{A part of ours with $x$ in it}\n${PAGES}\n\\end{document}\n`)
      const items = await itemsOf(r.pdf)
      // (the running heads stand on the pages after the headings' own: the case the test is about)
      expect(items.some((i) => /^[2-9] .* (?:1 )?INTRODUCTION/.test(i) || /^[2-9] .*Introduction to the test/.test(i)), pre).toBe(true)
      expect(items, pre).toEqual(await itemsOf(r.own))
      const points = await pointPagesOf(r.pdf)
      for (const h of headingsOf(r.paper)) {
        const s = points.get(`h${h}s`) ?? [],
          e = points.get(`h${h}e`) ?? []
        expect([s.length, e.length], `${pre} heading ${h}`).toEqual([1, 1])
        expect(await ownedOf(r, h), `${pre} heading ${h}`).toEqual({ unhidden: null, pages: [e[0]] })
      }
      expect(strays(r.written)).toEqual([])
    }
  }, 1_800_000)
  it("hyperref's PDF strings (bookmarks of a numbered, a starred and a \\texorpdfstring heading, the title and the author in the document's information): each string the paper's own compile writes, and no warning of a token not allowed in one but the paper's own", async () => {
    const r = await prepared(
      [
        '\\documentclass{article}',
        '\\usepackage[pdfusetitle,bookmarks=true]{hyperref}',
        '\\title{A title of our own words with $x$}',
        '\\author{Ann Lee}',
        '\\begin{document}',
        '\\maketitle',
        '\\section{Introduction to $x$ and the test}',
        'Our own first paragraph, long enough to be a unit of its own.',
        '\\section*{A starred heading of ours}',
        '\\addcontentsline{toc}{section}{A starred heading of ours}',
        'Our own second paragraph, long enough to be a unit of its own.',
        '\\section{Results \\texorpdfstring{with $y$}{with y} of ours}',
        'Our own last paragraph, long enough to be a unit of its own.',
        '\\end{document}',
        '',
      ].join('\n'),
    )
    const stringsOf = async (pdf: Uint8Array) => {
      const doc = await getDocument({ data: pdf.slice(), verbosity: 0 }).promise
      const titles: string[] = []
      const walk = (o: { title: string; items?: unknown[] }[] | null) => {
        for (const x of o ?? []) {
          titles.push(x.title)
          walk((x.items ?? []) as never)
        }
      }
      walk((await doc.getOutline()) as never)
      const info = (await doc.getMetadata()).info as Record<string, unknown>
      await doc.loadingTask.destroy()
      return { titles, title: info.Title, author: info.Author }
    }
    const marked = await stringsOf(r.pdf),
      own = await stringsOf(r.own)
    expect(marked.titles.length).toBeGreaterThanOrEqual(3)
    expect(marked).toEqual(own)
    expect(marked.titles.join('\n')).not.toMatch(/axt|[hp]\d+[se.]/)
    const warnings = (log: string) => (log.match(/Token not allowed in a PDF string/g) ?? []).length
    expect(warnings(r.log)).toBe(warnings(r.ownLog))
    expect(strays(r.written)).toEqual([])
  }, 900_000)
})

describe.skipIf(!docker)('a gated mark expands where TeX scans past it as it did', () => {
  it("a paragraph TeX resumes after a display (\\[ \\], $$ $$, equation, align): the space after the display skipped, every word where the paper's own compile sets it", async () => {
    // (a placeholder's closing mark right after a display must expand to nothing on the empty list TeX resumes the paragraph
    // with, so that TeX's skip of the space after the display sees past it: a step that does not expand stops the skip, and
    // the line after the display begins with a space)
    const r = await prepared(
      [
        '\\documentclass{article}',
        '\\usepackage{amsmath}',
        '\\begin{document}',
        'Our own first paragraph sets a formula, \\[ a = b + c \\]',
        'where the words go on after it and fill a line of our own.',
        '',
        'Our own paragraph sets one as plain TeX does,',
        '$$',
        'g(p) = f(b) \\, .',
        '$$',
        'where $x$ solves it and the words go on after it.',
        '',
        'Our own second paragraph numbers one,',
        '\\begin{equation} f(x) = x^2 \\end{equation}',
        'or, equivalently, the words go on after it again.',
        '',
        'Our own third paragraph aligns two,',
        '\\begin{align} u &= v \\\\ w &= z \\end{align}',
        'and hence the words go on after them too.',
        '\\end{document}',
        '',
      ].join('\n'),
    )
    expect(await itemsOf(r.pdf)).toEqual(await itemsOf(r.own))
  }, 900_000)
})

/** the glyphs TeX shows between a piece's two points (`p<u>.<k>a`, `p<u>.<k>b`) on the page holding the first, in the content
 *  stream's order: a count of the text-showing operations between them; null where either point is not set on that page */
const shownBetween = async (pdf: Uint8Array, a: string, b: string): Promise<number | null> => {
  const doc = await getDocument({ data: pdf.slice(), verbosity: 0 }).promise
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const ops = await (await doc.getPage(n)).getOperatorList()
      let at = -1,
        shown = 0
      for (let j = 0; j < ops.fnArray.length; j++) {
        const f = ops.fnArray[j]
        const name = (ops.argsArray[j]?.[0] as { name?: string } | undefined)?.name
        if (f === OPS.setRenderingIntent && name === `axt-${a}`) at = j
        else if (f === OPS.setRenderingIntent && name === `axt-${b}` && at >= 0) return shown
        else if (at >= 0 && (f === OPS.showText || f === OPS.showSpacedText)) shown++
      }
      if (at >= 0) return null
    }
    return null
  } finally {
    await doc.loadingTask.destroy()
  }
}
/** the name of the placeholder whose source begins so, in the first unit holding one: `p<u>.<k>` */
const pieceName = (paper: ReturnType<typeof openPaper>, begins: string) => {
  for (const [i, u] of paper.units.entries()) {
    const k = u.pieces.findIndex((p) => p.t === 'ph' && (p.src ?? '').startsWith(begins))
    if (k >= 0) return `p${i}.${k}`
  }
  throw new Error(`no placeholder ${begins}`)
}

describe.skipIf(!docker)('a piece’s opening point where its glyphs begin', () => {
  it('a piece first in a box of its own (\\mbox{\\texttt{…}}): its opening point is set before its glyphs, on the box’s empty list', async () => {
    const r = await prepared(
      [
        '\\documentclass{article}',
        '\\begin{document}',
        'Our own paragraph holds a name set whole \\mbox{\\texttt{ourname}} in a box and goes on with words of ours.',
        '\\end{document}',
        '',
      ].join('\n'),
    )
    const p = pieceName(r.paper, '\\texttt')
    expect(await shownBetween(r.pdf, `${p}a`, `${p}b`)).toBeGreaterThan(0)
    expect(await itemsOf(r.pdf)).toEqual(await itemsOf(r.own))
  }, 900_000)
  it('a formula that begins a centred line after a forced break: its two points around its glyphs, the paragraph begun as TeX begins it', async () => {
    const r = await prepared(
      [
        '\\documentclass{article}',
        '\\begin{document}',
        '\\begin{center}',
        'A centred line of our own words\\\\',
        '$x+y$ and more centred words of ours',
        '\\end{center}',
        '\\end{document}',
        '',
      ].join('\n'),
    )
    const p = pieceName(r.paper, '$x+y$')
    expect(await shownBetween(r.pdf, `${p}a`, `${p}b`)).toBeGreaterThan(0)
    expect(await itemsOf(r.pdf)).toEqual(await itemsOf(r.own))
  }, 900_000)
  it('a pended opening mark before what begins no paragraph (\\noindent, \\vspace, a display, \\par) stays pended: every word where the paper’s own compile sets it', async () => {
    const r = await prepared(
      [
        '\\documentclass{article}',
        '\\begin{document}',
        '\\begin{center}',
        'A centred line of our own words\\\\',
        '\\noindent$x$ and more centred words of ours\\\\',
        '\\vspace{2pt}$y$ and words of ours again\\\\',
        '\\[ z = 1 \\]',
        '$w$ and the last centred words of ours',
        '\\end{center}',
        'Our own paragraph after it, with a formula $v$ in it.',
        '\\end{document}',
        '',
      ].join('\n'),
    )
    expect(await itemsOf(r.pdf)).toEqual(await itemsOf(r.own))
  }, 900_000)
})
