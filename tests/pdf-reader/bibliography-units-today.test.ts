import { describe, expect, it } from 'vitest'
import { bundleUnitsOf } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import { toTranslate } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { classesOn, shownTranslated, unitClass, unitShown } from '@/pdf-reader/engine/rules/content-classes.mjs'
import { plainSource } from '../../packages/engine/tests/helpers/unit-harness.ts'

// The content classes' stage 4 (docs/route/orphan-text.md §5, "References" and "Names"; the owner's rulings of 2026-10-25 and
// 2026-10-28): a bibliography's entries are units of their own, read from the bibliography's TeX the compile reads (the paper's
// thebibliography, or the .bbl its package holds or BibTeX makes) and marked there as the body's units are; each entry one unit
// of the class `references` (kind reference), whole, its names its own: the references and the author names decoupled, "names"
// the author block's alone; its label, numbers, web addresses and formulas the original's ink. Every class is translated once
// whatever the target: the author block's names too, which before this were sent only where the target's script writes names
// its own way.

type Piece = { t: string; s?: string; src?: string }
type Unit = { kind: string; file: string; pieces: Piece[] }
const enc = (s: string) => new TextEncoder().encode(s)
const open = (files: Record<string, string>) => openPaper(new Map(Object.entries(files).map(([k, v]) => [k, enc(v)])))
const doc = (body: string, pre = '') => `\\documentclass{article}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`
const units = (p: ReturnType<typeof open>) => p.units as unknown as Unit[]
const bib = (p: ReturnType<typeof open>) => units(p).filter(u => u.kind === 'reference')

const PLAIN = `\\begin{thebibliography}{10}

\\bibitem{layernorm2016}
Jimmy~Lei Ba, Jamie~Ryan Kiros, and Geoffrey~E Hinton.
\\newblock Layer normalization.
\\newblock {\\em arXiv preprint arXiv:1607.06450}, 2016.

\\bibitem{bengio1994}
Y.~Bengio, P.~Simard, and P.~Frasconi.
\\newblock Learning long-term dependencies with gradient descent is difficult.
\\newblock {\\em IEEE Transactions on Neural Networks}, 5(2):157--166, 1994.

\\end{thebibliography}`

describe('a numeric \\bibitem bibliography written in the paper (plain, abbrv, unsrt, ieee)', () => {
  const p = open({ 'main.tex': doc(`Attention needs normalization \\cite{layernorm2016}.\n\n${PLAIN}`) })
  it('gives the entries their classes, translated once whatever the target, shown by the reader\'s toggles alone', () => {
    const bundle = { units: bundleUnitsOf(p) }
    for (const lang of ['zh', 'de']) for (const u of bib(p)) expect(toTranslate(bundle as never, lang)).toContain(units(p).indexOf(u))
    expect(bib(p).map(u => unitClass(u))).toEqual(['references', 'references'])
    // (the defaults: references off)
    expect(bib(p).map(u => unitShown(u, classesOn(null)))).toEqual([false, false])
    // (references on: each entry whole, its names with it; the names toggle, the author block's alone, shows none of it)
    expect(bib(p).map(u => unitShown(u, classesOn({ references: true })))).toEqual([true, true])
    expect(bib(p).map(u => unitShown(u, classesOn({ names: true })))).toEqual([false, false])
  })
})

describe('an author block with affiliations and \\thanks: its names and its places the class names, its note the body\'s, translated for every target', () => {
  const tex = doc('\\maketitle\n\nThe body of the paper says something.', '\\title{A Title}\n\\author{Ada Lovelace\\thanks{Supported by the Analytical Society.}\\\\\nUniversity of London\n\\and\nCharles Babbage\\\\\nCambridge}')
  const p = open({ 'main.tex': tex })
  const bundle = { units: bundleUnitsOf(p) }
  it('sends the author block\'s names and places, and its note, whatever the target writes names as', () => {
    const authors = units(p).flatMap((u, i) => (u.kind === 'author' || u.kind === 'affiliation' ? [i] : []))
    expect(units(p).filter(u => u.kind === 'author').map(u => plainSource(u as never).trim())).toEqual(['Ada Lovelace', 'Charles Babbage'])
    expect(units(p).filter(u => u.kind === 'affiliation').map(u => plainSource(u as never).trim())).toEqual(['University of London', 'Cambridge'])
    // (German writes names as the paper does: until TRANSLATE_VERSION 6 the block stayed in the source for it)
    for (const lang of ['de', 'fr', 'zh', 'ja']) expect(toTranslate(bundle as never, lang), lang).toEqual(expect.arrayContaining(authors))
    const note = units(p).findIndex(u => u.kind === 'footnote' && plainSource(u as never).includes('Analytical Society'))
    expect(note).toBeGreaterThanOrEqual(0)
    expect(toTranslate(bundle as never, 'de')).toContain(note)
  })
  it('shows the names and the places translated under the names toggle alone (the whole block, 2026-10-30); the note and the body always', () => {
    const author = units(p).find(u => u.kind === 'author')!, note = units(p).find(u => u.kind === 'footnote')!, place = units(p).find(u => u.kind === 'affiliation')!
    expect([unitClass(author), unitClass(note), unitClass(place)]).toEqual(['names', 'body', 'names'])
    expect([unitShown(place, classesOn(null)), unitShown(place, classesOn({ names: false, references: false }))]).toEqual([false, false])
    expect(shownTranslated('names', classesOn(null))).toBe(false)
    expect([unitShown(author, classesOn({ names: true })), unitShown(place, classesOn({ names: true }))]).toEqual([true, true])
    expect([unitShown(author, classesOn({ references: true })), unitShown(place, classesOn({ references: true }))]).toEqual([false, false])
    expect(unitShown(note, classesOn(null))).toBe(true)
  })
})

