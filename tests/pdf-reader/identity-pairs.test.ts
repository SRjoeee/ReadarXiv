import { describe, expect, it } from 'vitest'
import { openPaper } from '../../packages/engine/src/compile/live.ts'
import { selectsArgument } from '../../packages/engine/src/source/tex-kernel.ts'
import { sourceHash } from '../../packages/engine/tests/helpers/unit-harness.ts'

// A pair whose command sets its argument and nothing else — revtex's and ACM's bibliography fields (`\bibinfo{journal}{…}`,
// `\bibnamefont{…}`), defined by the .bbl that writes them as `\providecommand \bibinfo [0]{\@secondoftwo}`, or a paper's
// `\newcommand\x[1]{#1}` — sets nothing over what it holds: the front end reads that from the command's definition (no name
// list), puts it on the open piece (`sets` 0, not enumerable), the bundle carries it (an open's fourth value), and the wire sends
// no marker for it. 11 of the 53 sweep papers' reference units held 13,639 such pairs, 34,374 markers, and the units with more
// than 20 markers went to Google 22 to 42 % of the time.

type Piece = { t: string; s?: string; src?: string; id?: number; sets?: number }
type Unit = { kind: string; pieces: Piece[] }
const enc = (s: string) => new TextEncoder().encode(s)
const open = (files: Record<string, string>) => openPaper(new Map(Object.entries(files).map(([k, v]) => [k, enc(v)])))
const doc = (body: string, pre = '') => `\\documentclass{article}\n${pre}\n\\begin{document}\n${body}\n\\bibliography{refs}\n\\end{document}\n`
/** an apsrev4-2 .bbl's head, as BibTeX writes it, and one entry */
const APS_HEAD = '\\makeatletter\n\\providecommand \\bibnamefont  [1]{#1}%\n\\providecommand \\bibfnamefont [1]{#1}%\n\\providecommand \\enquote  [1]{``#1\'\'}%\n\\providecommand \\bibinfo  [0]{\\@secondoftwo}%\n\\providecommand \\bibfield  [0]{\\@secondoftwo}%\n'
const ENTRY = '\\bibitem [{Smith(2020)}]{s20}\\BibitemOpen\n  \\bibfield  {author} {\\bibinfo {author} {\\bibfnamefont {J.}~\\bibnamefont {Smith}}},\\ \\bibfield  {title} {\\enquote {\\bibinfo {title} {A study of flows}},\\ }\\href {https://doi.org/x} {\\bibfield  {journal} {\\emph {\\bibinfo  {journal} {Phys. Rev. Lett.}}\\ }\\textbf {\\bibinfo {volume} {12}},\\ \\bibinfo {pages} {34} (\\bibinfo {year} {2020})}\\BibitemShut {NoStop}%\n'
const bbl = (head: string, entry = ENTRY) => `\\begin{thebibliography}{1}%\n${head}${entry}\\end{thebibliography}%\n`
const entryOf = (p: ReturnType<typeof open>) => (p.units as unknown as Unit[]).find(u => u.kind === 'reference')!
const verdicts = (u: Unit) => u.pieces.filter(p => p.t === 'open').map(p => `${(p.src ?? '').replace(/\s*\{[^{}]*\}\s*\{$|\s*\{$/, '')}${p.sets === 0 ? ':nothing' : ''}`)

describe('the kernel: a definition that sets one of its arguments alone', () => {
  it('a body that is one argument, or the kernel\'s selectors of none declared; nothing else', () => {
    expect(selectsArgument(2, '#2')).toEqual({ of: 2, arg: 2 })
    expect(selectsArgument(0, '\\@secondoftwo ')).toEqual({ of: 2, arg: 2 })
    // (white space is TeX's: before or after a parameter a space token the call sets; after a control word skipped)
    for (const body of [' #1 ', '#1 ', ' #1', '\n#1', '#1\n', ' \\@secondoftwo']) expect(selectsArgument(body.includes('@') ? 0 : 1, body), JSON.stringify(body)).toBeNull()
    expect(selectsArgument(0, '\\@secondoftwo')).toEqual({ of: 2, arg: 2 })
    expect(selectsArgument(0, '\\@firstofone')).toEqual({ of: 1, arg: 1 })
    for (const [n, body] of [[1, '\\textsc{#1}'], [1, '``#1\'\''], [1, '{#1}'], [2, '#1#2'], [1, '#2'], [0, '\\@gobble'], [1, '\\@secondoftwo']] as const) expect(selectsArgument(n, body), body).toBeNull()
  })
})

describe('the front end: a pair\'s verdict from its command\'s definition', () => {
  it('revtex\'s fields and name fonts set nothing, as the .bbl defines them; the paper\'s styles are no identity, its quotes no pair', () => {
    const u = entryOf(open({ 'main.tex': doc('Text \\cite{s20}.'), 'main.bbl': bbl(APS_HEAD) }))
    expect(verdicts(u)).toEqual(['\\bibfield:nothing', '\\bibinfo:nothing', '\\bibfnamefont:nothing', '\\bibnamefont:nothing', '\\bibfield:nothing', '\\bibinfo:nothing', '\\href', '\\bibfield:nothing', '\\emph', '\\bibinfo:nothing', '\\textbf', '\\bibinfo:nothing', '\\bibinfo:nothing', '\\bibinfo:nothing'])
    // (\\enquote's marks are text of the unit, PDF-READER §18.32; the front end holds UTF-8 bytes in a Latin-1 view)
    const text = u.pieces.filter(p => p.t === 'text').map(p => p.s ?? '').join('')
    expect(new TextDecoder().decode(Uint8Array.from([...text].map(c => c.charCodeAt(0))))).toContain('\u201cA study of flows\u201d')
  })
  it('a paper\'s own definition comes first: `\\bibnamefont` in small capitals stays a pair', () => {
    const u = entryOf(open({ 'main.tex': doc('Text \\cite{s20}.', '\\newcommand{\\bibnamefont}[1]{\\textsc{#1}}'), 'main.bbl': bbl(APS_HEAD) }))
    expect(verdicts(u)).toContain('\\bibnamefont')
    expect(verdicts(u)).toContain('\\bibfnamefont:nothing')
  })
  it('a .bbl that defines none of them: no verdict, every pair as before', () => {
    const u = entryOf(open({ 'main.tex': doc('Text \\cite{s20}.'), 'main.bbl': bbl('') }))
    expect(verdicts(u).some(v => v.endsWith(':nothing'))).toBe(false)
  })
  it('ACM\'s head: `\\providecommand\\bibinfo[2]{#2}` and the conditional `\\def \\showarticletitle #1{#1}`', () => {
    const head = '\\ifx \\showarticletitle \\undefined \\def \\showarticletitle #1{#1}   \\fi\n\\providecommand\\bibfield[2]{#2}\n\\providecommand\\bibinfo[2]{#2}\n'
    const entry = '\\bibitem[Abnar(2020)]{a20}\n\\bibfield{author}{\\bibinfo{person}{Samira Abnar}}. \\bibinfo{year}{2020}\\natexlab{}.\n\\newblock \\showarticletitle{Quantifying Attention Flow}. In \\bibinfo{booktitle}{\\emph{Proceedings of ACL}}.\n'
    const u = entryOf(open({ 'main.tex': doc('Text \\cite{a20}.'), 'main.bbl': bbl(head, entry) }))
    expect(verdicts(u)).toEqual(['\\bibfield:nothing', '\\bibinfo:nothing', '\\bibinfo:nothing', '\\showarticletitle:nothing', '\\bibinfo:nothing', '\\emph'])
  })
  it('a paper\'s macro whose body is its argument alone is no pair on the wire; one that sets a style is', () => {
    const p = open({ 'main.tex': `\\documentclass{article}\n\\newcommand{\\plain}[1]{#1}\\newcommand{\\loud}[1]{\\textbf{#1}}\n\\begin{document}\nWe study \\plain{deep flows} and \\loud{shallow ones} in turn.\n\\end{document}\n` })
    expect(verdicts((p.units as unknown as Unit[])[0]!)).toEqual(['\\plain:nothing', '\\loud'])
  })
  it('one whose body sets a space beside its argument is no identity; one whose lines end in comments is (review of #581): the front end\'s verdict', () => {
    const p = open({ 'main.tex': `\\documentclass{article}\n\\newcommand{\\word}[1]{#1 }\n\\newcommand{\\same}[1]{%\n  #1%\n}\n\\begin{document}\nWe study \\word{deep}flows and \\same{shallow ones} in turn.\n\\end{document}\n` })
    expect(verdicts((p.units as unknown as Unit[])[0]!)).toEqual(['\\word', '\\same:nothing'])
  })
  it('the verdict is no field of the unit: its hash, its JSON and its marks are its pieces\' as before', async () => {
    // (b's head defines \\enquote alone, so that its marks are text in both: the verdicts are what differs)
    const quotes = '\\providecommand \\enquote  [1]{``#1\'\'}%\n'
    const a = entryOf(open({ 'main.tex': doc('Text \\cite{s20}.'), 'main.bbl': bbl(APS_HEAD) })), b = entryOf(open({ 'main.tex': doc('Text \\cite{s20}.'), 'main.bbl': bbl(quotes) }))
    expect(JSON.stringify(a.pieces.map(p => ({ ...p })))).not.toContain('sets')
    // (the .bbl's head is no unit's piece: an entry of the same text has the same pieces and the same hash, verdict or none)
    expect(await sourceHash(a as never)).toBe(await sourceHash(b as never))
  })
})

