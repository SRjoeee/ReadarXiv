import { describe, expect, it } from 'vitest'
import { sourceUnitsOf } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { bundleUnitsOf, NAME_KIND } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { CONJUNCTION_GAPS, GENERATED_COMMANDS, NAME_GAPS } from '@/pdf-reader/engine/rules/tex-names.mjs'
import { NAMES_MAX, paperNames, theoremNames } from '@/pdf-reader/engine/source/paper-names.mjs'
import { plainSource } from '@/pdf-reader/engine/translate/mt.mjs'

// The structural names a paper's TeX prints that no package names in every target (PDF-READER §19.14): read from the paper's
// own definitions, each a unit of its own after the source's in the bundle (bundleUnitsOf, kind `name`), translated once
// with the paper's units

const enc = (s: string) => new TextEncoder().encode(s)
const paperOf = (tex: string, more: [string, string][] = []) => openPaper(new Map([['main.tex', enc(tex)], ...more.map(([f, t]) => [f, enc(t)] as [string, Uint8Array])]))
const doc = (preamble: string, body = 'Text.') => `\\documentclass{article}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`

describe('paperNames: the names the paper defines', () => {
  it('a theorem-like environment\'s printed name, in every form a class or a package defines one', () => {
    expect(paperNames([
      '\\newtheorem{conj}{Conjecture}[section]\n\\newtheorem{claim}[conj]{Claim}\n\\newtheorem*{rem*}{Remark}\n',
      '\\spnewtheorem{fact}{Fact}{\\bfseries}{\\itshape}\n\\newproof{pf}{Proof of the claim}\n\\newmdtheoremenv{boxed}{Assumption}\n',
      '\\declaretheorem[name=Hypothesis, refname={hypothesis,hypotheses}]{hyp}\n\\declaretheorem{observation}\n',
    ])).toEqual(['Conjecture', 'Claim', 'Remark', 'Fact', 'Proof of the claim', 'Assumption', 'Hypothesis', 'hypothesis', 'hypotheses', 'Observation'])
  })
  it('the reference names it gives cleveref and \\autoref', () => {
    expect(paperNames(['\\crefname{assumption}{assumption}{assumptions}\n\\Crefname{assumption}{Assumption}{Assumptions}\n\\renewcommand{\\sectionautorefname}{Sec.}\n\\def\\algorithmautorefname{Algorithm}\n'])).toEqual(['assumption', 'assumptions', 'Assumption', 'Assumptions', 'Sec.', 'Algorithm'])
  })
  it('where it calls cleveref or \\autoref, the words no package names in some target: 2610.18513v1\'s "Section" and "and"', () => {
    const called = paperNames(['As \\Cref{sec:technical-results} shows.'])
    expect(called).toEqual([...NAME_GAPS, ...CONJUNCTION_GAPS])
    expect(called).toEqual(expect.arrayContaining(['Section', 'Theorem', 'and']))
    // (a range's " to " is no word of one sense alone)
    expect(called).not.toContain('to')
    expect(paperNames(['See \\autoref{fig:a}.'])).toEqual(called)
    // (every command whose names the layer renames, rules/tex-names.mjs GENERATED_COMMANDS: a plural name's, a page range's; Codex on #474)
    for (const c of GENERATED_COMMANDS) expect(paperNames([`\\${c}{a}`]), c).toEqual(called)
    // (the paper's own names first, the words after)
    expect(paperNames(['\\newtheorem{conj}{Conjecture}', '\\cref{conj:a}'])).toEqual(['Conjecture', ...called])
    expect(paperNames(['See \\ref{fig:a}.'])).toEqual([])
  })
  it('each once, in the order first written; a name of plain words alone; nothing a comment holds', () => {
    expect(paperNames(['\\newtheorem{a}{Claim}\n\\newtheorem{b}{Claim}\n% \\newtheorem{c}{Conjecture}\n\\newtheorem{d}{\\textsc{Fancy}}\n\\newtheorem{e}{Lemma $\\star$}\n\\newtheorem{f}{Th\u00e9or\u00e8me}\n'])).toEqual(['Claim', 'Th\u00e9or\u00e8me'])
    // (a comment's \cref is no call)
    expect(paperNames(['% \\cref{a}\n'])).toEqual([])
  })
  it(`at most ${NAMES_MAX} a paper`, () => {
    const many = Array.from({ length: NAMES_MAX + 20 }, (_, i) => `\\newtheorem{t${i}}{Name ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}}`).join('\n')
    expect(paperNames([many])).toHaveLength(NAMES_MAX)
  })
})

describe('theoremNames: the printed names of the theorem-like environments alone, a head\'s label names (layout/own.mjs)', () => {
  it('each a name paperNames gives, none of a reference\'s, an \\autoref\'s or the gaps\' (2501.14787v1\'s "Recall", "Notation")', () => {
    const texts = [
      '\\declaretheorem[style = notebox, name = Recall, sibling = theorem]{recall}\n\\declaretheorem[style = notebox, name = Recall, numbered = no]{recall*}\n\\declaretheorem[name=Notation]{notation}\n',
      '\\newtheorem{conj}{Conjecture}\n\\declaretheorem[name=Hypothesis, refname={hypothesis,hypotheses}]{hyp}\n\\crefname{conj}{conj.}{conjs.}\n\\def\\algorithmautorefname{Algorithm}\nAs \\cref{a}.',
    ]
    expect(theoremNames(texts)).toEqual(['Recall', 'Notation', 'Conjecture', 'Hypothesis'])
    for (const n of theoremNames(texts)) expect(paperNames(texts)).toContain(n)
    expect(theoremNames(['As \\cref{a}.'])).toEqual([])
    // (openPaper's `theoremNames`, the wrap's `names`)
    expect(paperOf(doc('\\usepackage{amsthm}\n\\newtheorem{fact}{Fact}')).theoremNames).toEqual(['Fact'])
  })
})

describe('the name units in the bundle (bundleUnitsOf)', () => {
  it('after the source\'s units, whose ids and units are as they were: one text piece each, kind `name`', () => {
    const plain = paperOf(doc('\\usepackage{amsthm}', 'A paragraph of words.'))
    const named = paperOf(doc('\\usepackage{amsthm,cleveref}\n\\newtheorem{conj}{Conjecture}', 'A paragraph of words, as \\cref{x} says.\n\n\\begin{conj}\\label{x}It holds.\\end{conj}'))
    expect(plain.names).toEqual([])
    expect(bundleUnitsOf(plain)).toHaveLength(plain.units.length)
    const units = bundleUnitsOf(named), n = named.units.length
    expect(named.names[0]).toBe('Conjecture')
    expect(units.slice(n)).toEqual(named.names.map(s => [NAME_KIND, 0, null, null, null, [[0, s]]]))
    expect(units.slice(0, n).every(u => u[0] !== NAME_KIND)).toBe(true)
  })
  it('reads a name in its file\'s characters, UTF-8 or the encoding the main file declares, and holds it as any text piece is (its UTF-8 bytes read latin1)', () => {
    const tex = doc('\\newtheorem{thm}{Th\u00e9or\u00e8me}')
    const bytesOf = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0))
    const papers = [
      openPaper(new Map([['main.tex', enc(tex)]])),
      openPaper(new Map([['main.tex', bytesOf(tex.replace('\\documentclass{article}', '\\documentclass{article}\\usepackage[latin1]{inputenc}'))]])),
      openPaper(new Map([['main.tex', bytesOf(tex.replace('\\documentclass{article}', '\\documentclass{article}\\usepackage[cp1252]{inputenc}'))]])),
    ]
    for (const p of papers) {
      expect(p.names).toEqual(['Th\u00e9or\u00e8me'])
      const units = bundleUnitsOf(p), n = p.units.length
      expect(units[n]).toEqual([NAME_KIND, 0, null, null, null, [[0, 'Th\u00c3\u00a9or\u00c3\u00a8me']]])
      expect(plainSource(sourceUnitsOf({ units })[n] as never)).toBe('Th\u00e9or\u00e8me')
    }
  })
  it('reads the paper\'s every TeX file: a class it ships defines names too (acmart\'s Conjecture)', () => {
    const p = paperOf('\\documentclass{own}\n\\begin{document}\nText.\n\\end{document}\n', [['own.cls', '\\LoadClass{article}\n\\newtheorem{conjecture}{Conjecture}\n']])
    expect(p.names).toEqual(['Conjecture'])
  })
})
