import { describe, expect, it } from 'vitest'
import { bundleUnitsOf } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import { sourceUnitsOf } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { unitStands } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { rehydrate, rehydrateTags, serialize, serializeTags } from '@/pdf-reader/engine/translate/mt.mjs'

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

describe('the front end: a pair\'s verdict from its command\'s definition', () => {
  it('one whose body sets a space beside its argument is no identity, its space kept; one whose lines end in comments is (review of #581)', () => {
    const p = open({ 'main.tex': `\\documentclass{article}\n\\newcommand{\\word}[1]{#1 }\n\\newcommand{\\same}[1]{%\n  #1%\n}\n\\begin{document}\nWe study \\word{deep}flows and \\same{shallow ones} in turn.\n\\end{document}\n` })
    const u = (p.units as unknown as Unit[])[0]!
    expect(verdicts(u)).toEqual(['\\word', '\\same:nothing'])
    expect(serialize(u).wire).not.toContain('deepflows')
  })
})

describe('the bundle carries it: an open\'s fourth value', () => {
  const paper = open({ 'main.tex': doc('Text \\cite{s20}.'), 'main.bbl': bbl(APS_HEAD) })
  const units = bundleUnitsOf(paper as never) as unknown[][]
  const id = (paper.units as unknown as Unit[]).findIndex(u => u.kind === 'reference')
  it('written [2, id, src, 0] for a pair that sets nothing, [2, id, src] for any other; a reader of this format takes both', () => {
    const opens = (units[id]![5] as unknown[][]).filter(p => p[0] === 2)
    expect(opens.filter(p => p.length === 4).every(p => p[3] === 0)).toBe(true)
    expect(opens.filter(p => p.length === 4).length).toBe(11)
    expect(units.every((u, i) => unitStands(u, i, new Uint8Array(units.length).fill(1)))).toBe(true)
    // (another fourth value, or one on a close, stands for nothing this format says)
    expect(unitStands(['para', 0, null, null, null, [[2, 1, '\\x{', 1], [0, 'a'], [3, 1, '}']]], 0, new Uint8Array(1))).toBe(false)
    expect(unitStands(['para', 0, null, null, null, [[2, 1, '\\x{'], [0, 'a'], [3, 1, '}', 0]]], 0, new Uint8Array(1))).toBe(false)
  })
  it('read back onto the piece, not enumerable: the unit\'s hash is the one the front end gives', async () => {
    const back = sourceUnitsOf({ units } as never)[id] as unknown as Unit
    const front = entryOf(paper)
    expect(back.pieces.filter(p => p.t === 'open').map(p => p.sets === 0)).toEqual(front.pieces.filter(p => p.t === 'open').map(p => p.sets === 0))
    expect(Object.keys(back.pieces.find(p => p.sets === 0)!)).not.toContain('sets')
  })
})

describe('the wire: no marker for a pair that sets nothing', () => {
  const unit = (...pieces: Piece[]): Unit => ({ kind: 'reference', pieces })
  const idle = (id: number, src: string): Piece => { const p: Piece = { t: 'open', id, src }; Object.defineProperty(p, 'sets', { value: 0 }); return p }
  const shape = (r: ReturnType<typeof rehydrate>) => ('pieces' in r ? r.pieces.map(p => (p.t === 'text' ? p.s : p.t === 'open' ? `<${p.id}` : p.t === 'close' ? `${p.id}>` : `[${p.src}]`)).join('|') : r.error)
  it('its words the sentence\'s, its two ends back empty after them, on both wires', () => {
    const u = unit({ t: 'text', s: 'See ' }, idle(1, '\\bibinfo{author}{'), { t: 'text', s: 'J. Smith' }, { t: 'close', id: 1, src: '}' }, { t: 'text', s: ', and the rest of it.' })
    const ser = serialize(u)
    expect(ser.wire).toBe('See J. Smith, and the rest of it.')
    expect(shape(rehydrate('Siehe J. Smith und den Rest.', ser))).toBe('Siehe J. Smith und den Rest.|<1|1>')
    const tags = serializeTags(u)
    expect(tags.wire).toBe('See J. Smith, and the rest of it.')
    expect(shape(rehydrateTags('Siehe J. Smith und den Rest.', tags))).toBe('Siehe J. Smith und den Rest.|<1|1>')
  })
  it('round the whole unit, round the whole translation; holding no text, off the wire', () => {
    expect(serialize(unit(idle(1, '\\bibinfo{title}{'), { t: 'text', s: 'A study of flows' }, { t: 'close', id: 1, src: '}' })).wire).toBe('A study of flows')
    expect(serialize(unit({ t: 'text', s: 'Pages ' }, idle(1, '\\bibinfo{pages}{'), { t: 'close', id: 1, src: '}' }, { t: 'text', s: ' and more words.' })).wire).toBe('Pages and more words.')
  })
  it('a style inside a field is decided as it was while the field kept its markers: `\\bibinfo{booktitle}{\\emph{…}}` keeps its italic', () => {
    const u = unit({ t: 'text', s: 'Quantifying Attention Flow. In ' }, idle(1, '\\bibinfo{booktitle}{'), { t: 'open', id: 2, src: '\\emph{' }, { t: 'text', s: 'Proceedings of ACL' }, { t: 'close', id: 2, src: '}' }, { t: 'close', id: 1, src: '}' }, { t: 'text', s: '. Then more.' })
    const ser = serialize(u)
    expect(ser.wire).toBe('Quantifying Attention Flow. In @a# Proceedings of ACL @b#. Then more.')
    expect(shape(rehydrate('In @a# den Akten der ACL @b#. Dann mehr.', ser))).toBe('In |<2| den Akten der ACL |2>|. Dann mehr.|<1|1>')
  })
})
