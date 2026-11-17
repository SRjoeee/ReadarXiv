import { describe, expect, it } from 'vitest'
import { sourceUnitsOf } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { bundleUnitsOf, NAME_KIND } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { plainSource } from '@/pdf-reader/engine/translate/mt.mjs'

// The structural names a paper's TeX prints that no package names in every target (PDF-READER §19.14): read from the paper's
// own definitions, each a unit of its own after the source's in the bundle (bundleUnitsOf, kind `name`), translated once
// with the paper's units

const enc = (s: string) => new TextEncoder().encode(s)
const paperOf = (tex: string, more: [string, string][] = []) => openPaper(new Map([['main.tex', enc(tex)], ...more.map(([f, t]) => [f, enc(t)] as [string, Uint8Array])]))
const doc = (preamble: string, body = 'Text.') => `\\documentclass{article}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`

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
})
