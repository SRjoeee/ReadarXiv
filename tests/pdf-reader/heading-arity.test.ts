import { describe, expect, it } from 'vitest'
import { inMemory, loadProject, patch } from '@/pdf-reader/engine/source/latex-front.mjs'
import { plainSource } from '@/pdf-reader/engine/translate/mt.mjs'

// A command whose argument is a unit of its own takes what its definition takes and nothing after it: LaTeX's sectioning
// commands (\@startsection) a star, an optional short title and the title; a caption, a footnote, a \thanks, a title an
// optional argument and their text; an author block its label and its names; \multicolumn and its kin the arguments the
// role table gives them. A group after them is the text's. Read as a second argument, the stray `{` after
// 2610.31660v1's \subsection{Approaches to determining $H_0$}, closed 330 lines later, took §II.A to mid-§IV with it:
// 43 units of 91

type Unit = { kind: string; pieces: { t: string; s?: string }[] }
const enc = (s: string) => new TextEncoder().encode(s)
const doc = (body: string, pre = '') => `\\documentclass{article}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`
const projectOf = (files: Record<string, string>) => loadProject(inMemory(new Map(Object.entries(files).map(([k, v]) => [k, enc(v)]))), 'main.tex', { tables: true })
const project = (tex: string) => projectOf({ 'main.tex': tex })
/** each unit as [kind, the text the translator reads] */
const read = (p: ReturnType<typeof project>) => (p.units as unknown as Unit[]).map(u => [u.kind, plainSource(u as never)])
const untranslated = (p: ReturnType<typeof project>) => new TextDecoder().decode(patch(p, new Map()).get('main.tex'))

describe('a heading takes a star, an optional short title and one title: a group after it is the text', () => {
  it('a stray { on the line after a heading, closed sections later, is walked as the body it holds (2610.31660v1)', () => {
    const tex = doc('\\section{Introduction}\nOpening words.\n\\subsection{Approaches to determining $H_0$}\n{Measurements of the Hubble constant differ.\n\n\\subsection{Distance ladder}\nCepheids calibrate the supernovae.\n}\nClosing words.')
    const p = project(tex)
    expect(read(p)).toEqual([
      ['heading', 'Introduction'],
      ['para', 'Opening words.'],
      ['heading', 'Approaches to determining'],
      ['para', 'Measurements of the Hubble constant differ.'],
      ['heading', 'Distance ladder'],
      // (the group's close is no paragraph's end: the words after it go on its last paragraph, as TeX sets them)
      ['para', 'Cepheids calibrate the supernovae. Closing words.'],
    ])
    expect(untranslated(p)).toBe(tex)
  })

  it('\\section*[short]{long}: the long title is the heading, the short one kept as it is, the text after it the body\'s', () => {
    // (with no short title the group after the title was taken for one: two groups were read whatever they were)
    const tex = doc('\\section*[Short]{The long title of the section}\n{Body text} follows the heading.\n\n\\section*{A starred title}\n{Its body} follows too.')
    const p = project(tex)
    expect(read(p)).toEqual([
      ['heading', 'The long title of the section'],
      ['para', 'Body text follows the heading.'],
      ['heading', 'A starred title'],
      ['para', 'Its body follows too.'],
    ])
    expect(untranslated(p)).toBe(tex)
  })

  it('a heading followed by {\\bf text}: the bold words open the paragraph', () => {
    const tex = doc('\\section{Results}\n{\\bf Main result.} The method converges in every case.')
    const p = project(tex)
    expect(read(p)).toEqual([
      ['heading', 'Results'],
      ['para', 'Main result. The method converges in every case.'],
    ])
    expect(untranslated(p)).toBe(tex)
  })

  it('a heading the paper defines takes its own arity: \\renewcommand{\\section}[2] reads both of its groups', () => {
    const p = project(doc('\\section{Results}{sec:results}\nThe method converges.', '\\let\\oldsection\\section\n\\renewcommand{\\section}[2]{\\oldsection{#1}\\label{#2}}'))
    expect(read(p)).toEqual([
      ['heading', 'Results'],
      ['para', 'The method converges.'],
    ])
  })
})

describe('the same rule for the other commands whose argument is a unit of their own', () => {
  it('a caption, a footnote and a title: the group after each is the text\'s', () => {
    const p = project(doc('\\begin{figure}\\caption{A caption}\n{\\small Below the caption.}\\end{figure}\nText\\footnote{A note}{\\em next} words.', '\\title{The title}'))
    expect(read(p)).toEqual([
      ['heading', 'The title'],
      ['caption', 'A caption'],
      ['para', 'Below the caption.'],
      ['footnote', 'A note'],
      ['para', 'Text next words.'],
    ])
  })

  it('\\subcaptionbox{heading}[width]{contents}: the width is no text, the contents walked', () => {
    const p = project(doc('\\begin{figure}\\subcaptionbox{The panel}[0.4\\linewidth]{\\fbox{Inside words here}}\\end{figure}'))
    expect(read(p)).toEqual([
      ['caption', 'The panel'],
      ['para', 'Inside words here'],
    ])
  })

  it('an author block takes its label and its names: a group after it is not an author block', () => {
    const p = project(doc('\\maketitle\n\\author[1]{Ada Lovelace}\n{\\bf First} paragraph words.'))
    expect(read(p).filter(([k]) => k === 'author')).toEqual([['author', 'Ada Lovelace']])
    expect(read(p).at(-1)).toEqual(['para', 'First paragraph words.'])
  })

  it('\\multicolumn{2}{c}{text} takes three arguments: a group after it is the cell\'s', () => {
    const p = project(doc('\\begin{tabular}{ccc}\n\\multicolumn{2}{c}{Merged header} {\\bf extra} & Third \\\\\n\\end{tabular}'))
    expect(read(p).filter(([k]) => k === 'cell').map(([, t]) => t)).toEqual(['Merged header extra', 'Third'])
  })
})
