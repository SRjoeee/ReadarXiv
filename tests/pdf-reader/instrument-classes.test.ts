// The instrument adapter states each element's class as today's reader reads its source (layer2.mjs phClass2, texToText2,
// resolvePlaceholders' symbol and footnote mark), so that the part carries it and no rule of the typesetter reads a source.
import { describe, expect, it } from 'vitest'
import { glueOf as todayGlue, phClassProven, texToText2 } from '../../src/pdf-reader/engine/layer-proto/layer2.mjs'
import { FORCED_BREAK as todayBreak } from '../../src/pdf-reader/engine/layer-proto/tex.mjs'
import {
  classesOf,
  FORCED_BREAK,
  glueOf,
  placesOf,
  spansOf,
} from '../../src/pdf-reader/engine/pipeline/instrument.mjs'

const ph = (src: string) => ({ t: 'ph', src })
/** a piece's class alone, the source's other facts aside */
const classOnly = ([k, c]: [string, Record<string, unknown>]) => {
  const { glue, cmd, bare, brk, note, same, colour, nested, ...rest } = c
  void [glue, cmd, bare, brk, note, same, colour, nested]
  return [k, rest] as const
}
describe('the instrument adapter’s element classes', () => {
  it('states the class, the copy text, a symbol’s drawing and a footnote’s mark, by piece id', () => {
    const got = new Map(
      (classesOf as unknown as (p: unknown[]) => [string, Record<string, unknown>][])([
        { t: 'text', s: 'see ' },
        ph('\\cite{a,b}'),
        ph('\\ref{fig:1}'),
        ph('$x^2$'),
        ph('$\\times$'),
        ph('$^\\dagger$'),
        ph('\\footnotemark[3]'),
        ph('\\quad'),
        ph('\\ie'),
        ph('$\\dmodel$'),
        ph('\\%'),
      ]).map(classOnly),
    )
    expect(got.get('0')).toBeUndefined()
    expect(got.get('1')).toEqual({ cls: 'cite', copy: '[·]' })
    expect(got.get('2')).toEqual({ cls: 'num', copy: '?' })
    expect(got.get('3')).toEqual({ cls: 'other', copy: 'x²' })
    expect(got.get('4')).toEqual({ cls: 'symbol', copy: '×', sym: ['×'] })
    expect(got.get('5')).toEqual({ cls: 'symbol', copy: '^†', sym: ['†', true] })
    expect(got.get('6')).toEqual({ cls: 'num', copy: '³', mark: true })
    expect(got.get('7')).toEqual({ cls: 'space', copy: ' ' })
    expect(got.get('8')).toEqual({ cls: 'macro', copy: 'i.e.' })
    expect(got.get('9')).toEqual({ cls: 'other', unknown: true })
    expect(got.get('10')).toEqual({ cls: 'symbol', copy: '%', sym: ['%'] })
    expect(new Map((classesOf([ph('\\url{http://a.b/c}')]) as unknown as [string, Record<string, unknown>][]).map(classOnly)).get('0')).toEqual({ cls: 'other', copy: 'http://a.b/c', literal: true })
  })
  it('reads each source as layer2.mjs does (its copy held equal to phClassProven and texToText2)', () => {
    const srcs = ['\\cite{a,b}', '\\citep[p.~3]{a}', '\\ref{x}', '\\eqref{e}', '$x$', '$\\sqrt{\\dmodel}$', '$\\frac{a}{b}$', '$\\sum_{\\alpha}^{\\beta}$', '$\\Sigma$', '\\~{n}', '\\"u', '$\\downarrow$', '\\[ a = b \\]', '\\begin{equation}y=F(x)\\label{eq:1}\\end{equation}', '\\bert{}', '$\\cla$', '\\textbf{x}', '\\hspace{1em}', '\\vspace{-2mm}', '\\&', '\\\\', '$$', '$^{1}$', '\\url{http://a.b}']
    for (const [k, c] of classesOf(srcs.map(ph))) {
      const src = srcs[Number(k)]!
      const want = phClassProven(src)
      expect([c.cls, c.unknown ?? false, c.copy ?? '']).toEqual([want.cls, want.unknown ?? false, texToText2(src) || ''])
    }
  })
  it('states what the other rules read of a source: its glue, command, a forced break, a citation’s note, its identity, its colour', () => {
    const pieces = [
      ph('\\,'),
      ph('\\hspace{2em}'),
      ph('\\bfseries'),
      ph('\\\\'),
      ph('\\citep[see][p.~3]{a}'),
      ph('\\cref*{fig:1}'),
      ph('\\citep[see][p.~3]{a}'),
      { t: 'open', src: '\\href{http://a.b}{' },
      { t: 'text', s: 'x' },
      { t: 'close', src: '}' },
      ph('\\color{red}'),
    ]
    const got = new Map(classesOf(pieces, new Map([[10, 0xff0000]])))
    expect(got.get('0')).toMatchObject({ glue: [1 / 6, 'em'] })
    expect(got.get('1')).toMatchObject({ glue: [2, 'em', 1], cmd: 'hspace' })
    expect(got.get('2')).toMatchObject({ cmd: 'bfseries', bare: true })
    expect(got.get('3')).toMatchObject({ brk: true })
    expect(got.get('4')).toMatchObject({ cmd: 'citep', note: 'p. 3' })
    expect(got.get('4')!.same).toBeUndefined()
    expect(got.get('5')).toMatchObject({ cmd: 'cref*' })
    expect(got.get('6')).toMatchObject({ same: '4' })
    expect(got.get('10')).toMatchObject({ cmd: 'color', colour: 0xff0000 })
    expect(spansOf(pieces, new Map([[7, 0x0000ff]]))).toEqual([['7', { cmd: 'href', colour: 0x0000ff }]])
  })
  it('reads glue and forced breaks as today’s functions do (its copies held equal to layer2.mjs glueOf and tex.mjs FORCED_BREAK)', () => {
    const srcs = ['\\,', '\\:', '\\;', '\\enspace', '\\thinspace', '\\quad', '\\qquad', '\\hspace{1em}', '\\hspace*{0.5cm}', '\\hskip 3pt plus 1pt', '\\kern-2pt', '\\kern 2bp', '\\hspace{\\fill}', '\\\\', '\\\\[2pt]', '\\\\*', '\\newline', '\\linebreak', '$x$']
    for (const s of srcs) {
      expect(glueOf(s)).toEqual(todayGlue(s))
      expect(FORCED_BREAK.test(s)).toBe(todayBreak.test(s))
    }
  })
})

describe('the instrument adapter’s places', () => {
  it('closes a head macro’s span at its unit’s start point, opens a trailing one’s at its unit’s end point', () => {
    // (a head macro's point \\axthpk's, p3.0a, closed by 3s; two head pieces, p4.0a and p4.1a, each to the next; a trailing
    // macro's point after its group, p5.2g, its span from 5e; a placeholder's own two points as before; an opening alone after the
    // start no head piece's)
    const pt = (name: string, glyph: number) => ({ name, glyph })
    const pages = [
      { points: [pt('p3.0a', 0), pt('3s', 5), pt('p3.2a', 8), pt('3e', 12), pt('p4.0a', 12), pt('p4.1a', 16), pt('4s', 20)] },
      { points: [pt('5s', 0), pt('p5.1a', 3), pt('p5.1b', 4), pt('5e', 9), pt('p5.2g', 9)] },
    ]
    const by = (u: number, k: string) => placesOf(pages, 6).filter(x => x.unit === u && x.piece === k).map(x => [x.page, x.glyph, x.end])
    expect(by(3, '0')).toEqual([[1, 0, false], [1, 5, true]])
    expect(by(3, '2')).toEqual([[1, 8, false]])
    expect(by(4, '0')).toEqual([[1, 12, false], [1, 16, true]])
    expect(by(4, '1')).toEqual([[1, 16, false], [1, 20, true]])
    expect(by(5, '1')).toEqual([[2, 3, false], [2, 4, true]])
    expect(by(5, '2')).toEqual([[2, 9, false], [2, 9, true]])
    // (no glyph but a painted box between: an icon the macro set, so no span is stated; 2610.19159v1's github logo)
    const icon = [{ points: [{ name: 'p6.0a', glyph: 4, box: 2 }, { name: '6s', glyph: 4, box: 3 }, { name: '6e', glyph: 9, box: 3 }, { name: 'p6.3g', glyph: 9, box: 4 }] }]
    const got = placesOf(icon, 7)
    expect(got.map(x => [x.piece, x.end])).toEqual([['0', false]])
  })
})
