// A reference's item and its full name, read in the marked compile (layout/marks.mjs refKeysOf, refsTex; the engine's
// readRefNames) and stated on the reference's element by the adapter (pipeline/instrument.mjs piecesOf `nameOf`): what a
// translator is sent for a word tied to it that abbreviates that name (packages/translate names.ts). Synthetic units.
import { describe, expect, it } from 'vitest'
import { refKeyOf, refKeysOf, refsTex } from '../../src/pdf-reader/engine/layout/marks.mjs'
import { piecesOf } from '../../src/pdf-reader/engine/pipeline/instrument.mjs'

const ph = (src: string) => ({ t: 'ph', src })
const text = (s: string) => ({ t: 'text', s })

describe('the references the marked compile asks TeX about', () => {
  it('each label a reference names, once, in the order the units name them; no page reference, no list, no key TeX cannot hold', () => {
    const units = [
      { kind: 'para', pieces: [text('In Fig.'), ph('~'), ph('\\ref{fig:a}'), text(' and Eq.'), ph('~'), ph('\\eqref{eq:b}')] },
      { kind: 'para', pieces: [text('See Sec.'), ph('~'), ph('\\ref*{sec:c}'), text(' on p.'), ph('~'), ph('\\pageref{sec:c}')] },
      { kind: 'para', pieces: [ph('\\cref{fig:a,eq:b}'), ph('\\autoref{fig:a}'), ph('\\ref{a#b}'), ph('\\ref{x_1 y}'), ph('\\cite{fig:a}')] },
    ]
    expect(refKeysOf(units)).toEqual(['fig:a', 'eq:b', 'sec:c', 'x_1 y'])
    expect(refKeyOf(ph('\\pageref{sec:c}'))).toBeNull()
    expect(refKeyOf(ph('\\cref{fig:a,eq:b}'))).toBeNull()
    expect(refKeyOf(text('fig:a'))).toBeNull()
  })
  it('its TeX on one line, the keys by their place, written at the document’s end; none for a paper with no reference', () => {
    const tex = refsTex(['fig:a', 'x_1 y'])
    expect(tex).not.toContain('\n')
    expect(tex).toContain('\\axt@rf{0}{fig:a}\\axt@rf{1}{x_1 y}')
    expect(tex).toContain('AXT-REFNAME')
    expect(tex).toContain('enddocument/afterlastpage')
    expect(tex).toContain('AXT-REFLANG')
    // (the language the paper's names are set up for: babel's main language, whatever \selectlanguage the text switches to
    // before the end, 2307.16209v1's English text under a Brazilian Portuguese main language whose hyperref names are "Figura")
    expect(tex).toContain('bbl@tbcp@\\bbl@main@language')
    expect(tex.startsWith('\\makeatletter')).toBe(true)
    expect(tex.endsWith('\\makeatother')).toBe(true)
    expect(refsTex([])).toBe('')
  })
})

describe('the adapter states a reference’s full name on its element', () => {
  it('names the element TeX stated a name for, and no other', () => {
    const names = new Map([['fig:a', { name: 'Figure', lang: 'en' }]])
    type Ph = { t: string; src: string }
    const nameOf = (p: unknown) => names.get(refKeyOf(p as Ph) ?? '')
    const kindOf = (p: unknown) => {
      const src = (p as Ph).src
      return src === '~' ? 'space' : src.startsWith('\\eqref') ? 'eqref' : 'ref'
    }
    const content = piecesOf([text('In Fig.'), ph('~'), ph('\\ref{fig:a}'), text(' and Eq.'), ph('~'), ph('\\eqref{eq:b}')], {
      kindOf,
      nameOf,
    })
    expect(content[2]).toEqual({ t: 'el', id: '2', kind: 'ref', src: '\\ref{fig:a}', name: 'Figure', nameLang: 'en' })
    expect(content[5]).toEqual({ t: 'el', id: '5', kind: 'eqref', src: '\\eqref{eq:b}' })
    expect(content[1]).not.toHaveProperty('name')
  })
})
