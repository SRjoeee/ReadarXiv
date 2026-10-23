// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SourceUnit } from '@/pdf-reader/engine/source/latex-front.mjs'
import { classOf, INVISIBLE, LAYOUT_CLASSES, layoutMarking, MARK_CLASSES } from '@/pdf-reader/engine/layout/marks.mjs'
import { openPaper, originalFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import { BREAK_HINTS, INK_FREE_LEAD, INK_FREE_SYMBOLS, INK_FREE_WORDS, inkFree } from '@/pdf-reader/engine/rules/tex-kernel.mjs'
import { textless } from '@/pdf-reader/engine/rules/arg-roles.mjs'
import { PH_FLAG } from '@/pdf-reader/engine/layout/file.mjs'
import { compileImageRef } from '../../lab/pdf/spikes/compile-image.mjs'

// The control sequences TeX and the kernel define to set no ink and to read nothing after them (rules/tex-kernel.mjs): one
// table for the layout maker (no marks round one, and not a macro that may look ahead, so the placeholder after it keeps its
// marks: "Fig.\@ \ref{x}" lost the \ref's, 2602.23285) and for the layer (a placeholder that draws nothing, with no row)

type Piece = { t: string; s?: string; src?: string }
const text = (s: string): Piece => ({ t: 'text', s })
const ph = (src: string): Piece => ({ t: 'ph', src })
const unit = (pieces: Piece[]): SourceUnit => ({ kind: 'para', file: 'main.tex', start: 0, end: 0, pieces }) as SourceUnit
const srcs = (u: SourceUnit | undefined) => ((u?.pieces ?? []) as Piece[]).map(p => (p.t === 'text' ? p.t : p.t === 'ph' ? `ph ${p.src}` : p.t))
const marked = (pieces: Piece[]) => srcs(layoutMarking([unit(pieces)], MARK_CLASSES, { lines: false }).units[0])
/** every entry of the table, as a source */
const MEMBERS = [...INK_FREE_SYMBOLS, ...INK_FREE_WORDS.map(w => `\\${w}`)]

describe('the table', () => {
  it('holds control symbols and words, and the words that carry a priority apart', () => {
    expect(INK_FREE_SYMBOLS).toEqual(['\\@', '\\/', '\\-', '\\,', '\\;', '\\:', '\\!', '\\ '])
    expect(INK_FREE_WORDS).toEqual(['relax', 'nobreak', 'allowbreak', 'ignorespaces', 'unskip', 'leavevmode', 'noindent', 'indent', 'newline'])
    expect(BREAK_HINTS).toEqual(['linebreak', 'nolinebreak', 'pagebreak', 'nopagebreak'])
  })
  it('inkFree reads a placeholder\'s whole source: an entry alone or before an empty group, a control space with its space', () => {
    for (const src of MEMBERS) expect(inkFree(src), src).toBe(true)
    for (const src of ['\\relax{}', ' \\noindent ', '\\\t', '\\\n']) expect(inkFree(src), src).toBe(true)
    // not an entry: another command that starts like one, a kernel macro that starts with \@, one with an argument, a text symbol, nothing
    for (const src of ['\\relaxed', '\\@m', '\\@ifnextchar', '\\indentation', '\\relax x', '\\linebreak[2]', '\\S', '\\%', '\\\\', '~', '', '\\']) expect(inkFree(src), src).toBe(false)
    expect(inkFree(undefined)).toBe(false)
  })
  it('the arguments\' reader agrees: textless is true for each entry, and for a break hint with its priority', () => {
    for (const src of MEMBERS) expect(textless(src), src).toBe(true)
    for (const w of BREAK_HINTS) { expect(textless(`\\${w}`), w).toBe(true); expect(textless(`\\${w}[2]`), w).toBe(true) }
    // a control word the paper defines anew is its own
    expect(textless('\\indent', { bindings: new Map(), own: new Set(['indent']) } as never)).toBe(false)
    expect(textless('\\@', { bindings: new Map(), own: new Set(['indent']) } as never)).toBe(true)
  })
})

describe('the maker: a placeholder after an ink-free control sequence keeps its marks', () => {
  for (const sym of ['\\@', '\\/', '\\-', '\\relax', '\\nolinebreak', '\\ignorespaces', '\\unskip', '\\leavevmode', '\\!']) {
    it(`"Fig.${sym} \\ref{x}": the \\ref has both marks, ${sym} none`, () => {
      expect(marked([text('see Fig.'), ph(sym), text(' '), ph('\\ref{x}'), text(' for it')])).toEqual(['text', `ph ${sym}`, 'text', 'ph \\axtpma{p0.3a}', 'ph \\ref{x}', 'ph \\axtpm{p0.3b}', 'text'])
    })
  }
  it('"et al.\\@ \\cite{x}": the citation has both marks', () => {
    expect(marked([text('Smith et al.'), ph('\\@'), text(' '), ph('\\cite{x}'), text(' show')])).toEqual(['text', 'ph \\@', 'text', 'ph \\axtpma{p0.3a}', 'ph \\cite{x}', 'ph \\axtpm{p0.3b}', 'text'])
  })
  it('a LaTeX text symbol reads nothing after it either: "\\S\\ref{x}" keeps the \\ref\'s marks, the symbol its opening mark as before', () => {
    expect(marked([text('in '), ph('\\S'), ph('\\ref{x}'), text(' we')])).toEqual(['text', 'ph \\axtpma{p0.1a}', 'ph \\S', 'ph \\axtpma{p0.2a}', 'ph \\ref{x}', 'ph \\axtpm{p0.2b}', 'text'])
    expect(marked([text('rate 50 '), ph('\\%'), text(' '), ph('\\cite{x}'), text(' agree')])).toEqual(['text', 'ph \\axtpma{p0.1a}', 'ph \\%', 'text', 'ph \\axtpma{p0.3a}', 'ph \\cite{x}', 'ph \\axtpm{p0.3b}', 'text'])
  })
  it('guard: a paper\'s macro, which may look ahead, still takes the marks of the piece after it', () => {
    expect(marked([text('see '), ph('\\bert'), text(' '), ph('\\ref{x}'), text(' for it')])).toEqual(['text', 'ph \\axtpma{p0.1a}', 'ph \\bert', 'text', 'ph \\ref{x}', 'text'])
    // \xspace and a prefix look ahead too
    expect(marked([text('see '), ph('\\protect'), ph('\\ref{x}'), text(' now')])).toEqual(['text', 'ph \\protect', 'ph \\ref{x}', 'text'])
    // and a kernel macro that starts with \@ is a macro, not the symbol
    expect(marked([text('see '), ph('\\@ifnextchar'), text(' '), ph('\\ref{x}'), text(' now')])).toEqual(['text', 'ph \\axtpma{p0.1a}', 'ph \\@ifnextchar', 'text', 'ph \\ref{x}', 'text'])
  })
  it('no class, and the maker\'s INVISIBLE reads each entry (a break hint with its priority) and no kernel macro that starts like one', () => {
    for (const src of [...MEMBERS, ...BREAK_HINTS.map(w => `\\${w}[2]`)]) {
      expect(classOf({ t: 'ph', src }), src).toBeNull()
      expect(INVISIBLE.test(src), src).toBe(true)
    }
    for (const src of ['\\@m', '\\@ifnextchar', '\\@ifstar', '\\relaxed', '\\indentx']) expect(INVISIBLE.test(src), src).toBe(false)
    expect(new RegExp(`^${INK_FREE_LEAD}`).test('\\@ifnextchar')).toBe(false)
  })
})

describe('the layer: an entry draws nothing, and a unit whose only placeholders without a row are entries is located whole', () => {
  type L1 = typeof import('@/pdf-reader/engine/layer-proto/layer1.mjs')
  type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  type Tex = typeof import('@/pdf-reader/engine/layer-proto/tex.mjs')
  let L1: L1
  let L2: L2
  let T: Tex
  beforeAll(async () => {
    // layer2.mjs measures with a canvas made when it loads; the test environment has none
    const g = globalThis as { OffscreenCanvas?: unknown }
    g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length }) } } }
    L1 = await import('@/pdf-reader/engine/layer-proto/layer1.mjs')
    L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
    T = await import('@/pdf-reader/engine/layer-proto/tex.mjs')
  })
  it('phClass2 and phClassProven: zero for each entry (a thin, medium or thick space and a control space stay the layer\'s space)', () => {
    for (const src of MEMBERS) {
      const want = ['\\,', '\\;', '\\:', '\\ '].includes(src) ? 'space' : 'zero'
      expect(L2.phClass2(src).cls, src).toBe(want)
      expect(L2.phClassProven(src).cls, src).toBe(want)
    }
    // guard: a kernel macro that starts with \@ is no entry
    expect(L2.phClassProven('\\@m').cls).toBe('other')
  })
  it('a control space is a backslash and any white space (a space, a tab or a line\'s end), and the layer draws it as a space, not as nothing', () => {
    // "vs.\<newline>answer routing": the table counts the backslash and the line's end as a control space (inkFree), so
    // phClass read it as 'zero' and drew '' between "vs." and the word that follows (the translation ran "vs.Antwort" together)
    for (const src of ['\\ ', '\\\n', '\\\t']) {
      expect(inkFree(src), src).toBe(true)
      expect([L2.phClass2(src).cls, L2.phClassProven(src).cls], src).toEqual(['space', 'space'])
      expect([L1.phClass(src), L1.texToText(src), L2.texToText2(src)], src).toEqual(['space', ' ', ' '])
    }
    // not a control space: a backslash with nothing after it, and the control symbols that are no space
    for (const src of ['\\', '\\@', '\\/']) expect(L1.phClass(src), src).not.toBe('space')
  })
  it('locatedWhole: no row for any entry passes; the found \\ref after it is still asked for, and a LOST one fails the unit', () => {
    const lu = (rows: [number, number, number[]][]) => ({ ph: new Map(rows.map(([k, flags, segs]) => [k, { kind: 'ref', flags, segs }])) }) as never
    const found: [number, number, number[]] = [3, 0, [1, 20, 100, 25, 107, 98]]
    for (const sym of MEMBERS) {
      const u = { kind: 'para', src: 'a', pieces: [{ t: 'text', s: 'Fig.' }, { t: 'ph', src: sym }, { t: 'text', s: ' ' }, { t: 'ph', src: '\\ref{x}' }] } as never
      const tr = [[0, 'Fig.'], [1, 1], [0, ' '], [1, 3]]
      expect(T.locatedWhole(lu([found]), u, tr), sym).toEqual({ ok: true, why: null, kOf: [-1, 1, -1, 3] })
      expect(T.locatedWhole(lu([[3, PH_FLAG.LOST, []]]), u, tr).why, sym).toBe('lost')
      expect(T.locatedWhole(lu([]), u, tr).why, sym).toBe('no row')
    }
  })
})

// ---- the table against TeX: a real pdflatex's box of "AA<entry>BB" holds the four letters and no other character, rule or leaders
const pdflatex = spawnSync('pdflatex', ['--version'], { stdio: 'ignore' }).status === 0
describe.skipIf(!pdflatex)('the table against pdflatex: an entry adds no ink and takes none of what follows', () => {
  const TEX = String.raw`\documentclass{article}\begin{document}`
  /** the nodes of each box, by depth: `\box<n>=` up to the next `! OK.` */
  const boxes = (log: string) => [...log.matchAll(/> \\box(\d+)=\n([\s\S]*?)\n! OK\./g)].map(m => ({ n: Number(m[1]), lines: (m[2] ?? '').split('\n') }))
  /** characters, rules and leaders in a box: a character a discretionary holds is its break's hyphen, not ink of the line */
  function inkOf(lines: string[]) {
    const kinds: string[] = []
    const chars: string[] = []
    const rules: string[] = []
    for (const l of lines) {
      const m = /^(\.*)\\(.*)$/.exec(l)
      if (!m) continue
      const depth = (m[1] ?? '').length
      const rest = m[2] ?? ''
      kinds[depth] = rest.split(/[ (=]/)[0] ?? ''
      const ch = /^[A-Za-z0-9]+\/[^ ]+ (.+)$/.exec(rest)
      if (ch) { if (kinds[depth - 1] !== 'discretionary') chars.push(ch[1] ?? '') } else if (/^(?:rule|leaders|cleaders|xleaders)/.test(rest)) rules.push(rest)
    }
    return { chars, rules }
  }
  it('each entry: the letters round it stay, and no character, rule or leaders comes of it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'axt-kernel-'))
    try {
      const members = [...MEMBERS, ...BREAK_HINTS.map(w => `\\${w}[2]`)]
      const body = members.map((src, i) => String.raw`\setbox${i}\vbox{\hsize=100cm \parindent=7pt AA${/^\\[A-Za-z]/.test(src) ? `${src} ` : src}BB\par}\showbox${i}`).join('\n')
      writeFileSync(join(dir, 't.tex'), `${TEX}\\showboxbreadth=1000 \\showboxdepth=1000 \\tracingonline=1\n${body}\n\\end{document}\n`)
      spawnSync('pdflatex', ['-interaction=nonstopmode', 't.tex'], { cwd: dir, stdio: 'ignore', timeout: 120_000 })
      const found = boxes(readFileSync(join(dir, 't.log'), 'latin1'))
      expect(found.length).toBe(members.length)
      for (const b of found) {
        const src = members[b.n]
        const { chars, rules } = inkOf(b.lines)
        expect([...chars].sort().join(''), src).toBe('AABB')
        expect(rules, src).toEqual([])
      }
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it('the experiment sees ink: a text symbol adds its character and a strut a rule', () => {
    const dir = mkdtempSync(join(tmpdir(), 'axt-kernel-'))
    try {
      writeFileSync(join(dir, 't.tex'), `${TEX}\\showboxbreadth=1000 \\showboxdepth=1000 \\tracingonline=1\n\\setbox0\\vbox{\\hsize=100cm AA\\S BB\\par}\\showbox0\n\\setbox1\\vbox{\\hsize=100cm AA\\strut BB\\par}\\showbox1\n\\end{document}\n`)
      spawnSync('pdflatex', ['-interaction=nonstopmode', 't.tex'], { cwd: dir, stdio: 'ignore', timeout: 120_000 })
      const [a, b] = boxes(readFileSync(join(dir, 't.log'), 'latin1'))
      expect(inkOf(a?.lines ?? []).chars.length).toBe(5)
      expect(inkOf(b?.lines ?? []).rules.length).toBe(1)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

// ---- a real compile in the pinned TeX Live image, offline: the marked original of a paper with "Fig.\@ \ref{a}"
const IMAGE = compileImageRef()
const docker = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0
describe.skipIf(!docker)('the marked original, compiled in the pinned image', () => {
  it('"Fig.\\@ \\ref{a}" and "et al.\\@ \\cite{x}": 0 errors, and the \\ref\'s and the \\cite\'s destinations are in the PDF, the \\@\'s are not', async () => {
    const tex = String.raw`\documentclass{article}
\begin{document}
\section{Intro}\label{a}
Our method improves on Smith et al.\@ \cite{x} as Fig.\@ \ref{a} shows, and it reads \S\ref{a} too.

\begin{thebibliography}{9}
\bibitem{x} X. Smith. A paper. 2020.
\end{thebibliography}
\end{document}
`
    const paper = openPaper(new Map([['main.tex', new TextEncoder().encode(tex)]]))
    const files = originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES })
    const pieces = paper.units.flatMap((u, i) => (u.pieces as Piece[]).map((p, k) => ({ i, k, src: p.src })))
    const at = (src: string) => pieces.filter(p => p.src === src)
    const dir = mkdtempSync(join(tmpdir(), 'axt-kernel-'))
    try {
      for (const [p, b] of files) { mkdirSync(join(dir, p, '..'), { recursive: true }); writeFileSync(join(dir, p), b) }
      // (two passes: the first writes the aux that resolves the \ref and the \cite)
      for (let pass = 0; pass < 2; pass++) execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${dir}:/work`, '-w', '/work', IMAGE, 'pdflatex', '-interaction=nonstopmode', 'main.tex'], { stdio: 'pipe', timeout: 300_000 })
      const log = readFileSync(join(dir, 'main.log'), 'latin1')
      expect(log.match(/^! .*$/gm) ?? []).toEqual([])
      const doc = await getDocument({ data: new Uint8Array(readFileSync(join(dir, 'main.pdf'))), verbosity: 0 }).promise
      const all = await doc.getDestinations()
      const dests = new Set(all instanceof Map ? all.keys() : Object.keys(all))
      expect(at('\\@').length).toBe(2)
      for (const p of at('\\ref{a}')) expect(dests.has(`axt-p${p.i}.${p.k}a`), `\\ref at ${p.i}.${p.k}`).toBe(true)
      for (const p of at('\\cite{x}')) expect(dests.has(`axt-p${p.i}.${p.k}a`), `\\cite at ${p.i}.${p.k}`).toBe(true)
      for (const p of at('\\@')) expect(dests.has(`axt-p${p.i}.${p.k}a`), `\\@ at ${p.i}.${p.k}`).toBe(false)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }, 600_000)
})
