// What the back half reads of the mark probe's own log (the compile move's B3: the display design's F14 and F16), from listings
// written here in TeX's form: the samples whose box TeX ends with ink a glue of infinite stretch pushed (readInkEnds), the pieces
// a unit ends with that TeX sets as its end mark (endPiecesOf), and TeX's quotation marks read as the glyphs a text font sets for
// them (readInkTexts' `quotes`).
import { describe, expect, it } from 'vitest'
import { endPiecesOf, readInkDecorated, readInkEnds, readInkTexts } from '../../src/marks/marks.ts'

/** one sample's listing as the ink section writes it */
const listing = (i: number, nodes: string[]) =>
  [
    `LAYOUT-PROBE 1 ink-at ${i}`,
    '> \\box60=',
    '\\hbox(6.75+0.0)x17.77',
    ...nodes,
    '',
    '! OK.',
    `LAYOUT-PROBE 1 ink-end ${i}`,
  ].join('\n')

describe('readInkEnds: a sample TeX ends with ink a fil or fill glue pushed (F14)', () => {
  const log = [
    // (amsthm's \qed: \hfill\quad and the box of its square's rules)
    listing(0, [
      '.\\penalty 9999',
      '.\\hbox(0.0+0.0)x0.0',
      '.\\penalty 10000',
      '.\\glue 0.0 plus 1.0fill',
      '.\\glue 10.0',
      '.\\hbox(6.75003+0.0)x7.77786',
      '..\\rule(0.4+0.0)x7.77786',
      '..\\rule(*+*)x0.4',
    ]),
    // (an author's own: \hfill and a symbol of a formula's)
    listing(1, ['.\\glue 0.0 plus 1.0fill', '.\\mathon', '.\\U/msa/m/n/10.95 ^^C', '.\\mathoff']),
    // (LLNCS's: a fil, a penalty, a skip, then a fil again before its square)
    listing(2, [
      '.\\penalty 10000',
      '.\\glue 0.0 plus 1.0fil',
      '.\\penalty 50',
      '.\\glue 10.0',
      '.\\glue 0.0 plus 1.0fil',
      '.\\hbox(5.55557+0.0)x6.66669',
      '..\\mathon',
      '..\\OMS/lmsy/m/n/10 u',
      '..\\mathoff',
    ]),
    // (a fill after the last ink, a finite glue before it, a fill inside a box only: none pushes the ink)
    listing(3, ['.\\OT1/cmr/m/n/10 x', '.\\glue 0.0 plus 1.0fill']),
    listing(4, ['.\\glue 3.0 plus 1.0', '.\\OT1/cmr/m/n/10 x']),
    listing(5, ['.\\hbox(6.0+0.0)x10.0', '..\\glue 0.0 plus 1.0fill', '..\\OT1/cmr/m/n/10 x']),
    // (an error inside the listing: no answer)
    [
      `LAYOUT-PROBE 1 ink-at 6`,
      '! Undefined control sequence.',
      '> \\box60=',
      '\\hbox(0+0)x0',
      '.\\glue 0.0 plus 1.0fill',
      '.\\OT1/cmr/m/n/10 x',
      '! OK.',
      'LAYOUT-PROBE 1 ink-end 6',
    ].join('\n'),
  ].join('\n')
  it('gives the samples whose outer list holds a glue of infinite stretch before its last ink', () => {
    expect(readInkEnds(log, ['\\qed', '\\myqed', '\\llncsqed', '\\a', '\\b', '\\c', '\\d'])).toEqual([
      '\\qed',
      '\\myqed',
      '\\llncsqed',
    ])
  })
})

describe('endPiecesOf: the pieces a unit ends with that TeX sets as its end mark (F14)', () => {
  const text = (s: string) => ({ t: 'text', s })
  const ph = (src: string) => ({ t: 'ph', src })
  it('takes the unit’s last ink, a sample the probe says ends in pushed ink, or one the source pushes with a fill', () => {
    expect(endPiecesOf([text('so it holds. '), ph('\\qed')], new Set(['\\qed']))).toEqual([1])
    // (\hfill $\square$, the six of 2610.40394v1; \hspace*{\fill} the same glue)
    expect(endPiecesOf([text('so it holds. '), ph('\\hfill'), text(' '), ph('$\\square$')], new Set())).toEqual([3])
    expect(
      endPiecesOf([text('so it holds.'), ph('\\hspace*{\\fill}'), ph('$\\blacksquare$'), text(' ')], new Set()),
    ).toEqual([2])
  })
  it('takes none that is not the unit’s last ink, nor one no fill pushes', () => {
    expect(endPiecesOf([ph('\\qed'), text(' and more text')], new Set(['\\qed']))).toEqual([])
    expect(endPiecesOf([text('so it holds '), ph('$\\square$')], new Set())).toEqual([])
    expect(endPiecesOf([text('a '), ph('\\hfill'), text('word '), ph('$\\square$')], new Set())).toEqual([])
  })
})

describe('readInkTexts with `quotes`: TeX’s quotation marks as the glyphs a text font sets for them (F16)', () => {
  const log = [
    listing(0, ['.\\OT1/cmr/m/n/10 i', '.\\OT1/cmr/m/n/10 t', ".\\OT1/cmr/m/n/10 '", '.\\OT1/cmr/m/n/10 s']),
    listing(1, ['.\\T1/cmr/m/n/10 " (ligature ``)', '.\\T1/cmr/m/n/10 q', ".\\T1/cmr/m/n/10 \" (ligature '')"]),
    listing(2, ['.\\OT1/cmr/m/n/10 `', '.\\OT1/cmr/m/n/10 a']),
    // (XeTeX's word of a font of its own: the marks TeX's ligature mapping made, their UTF-8 bytes as the log is read)
    listing(3, ['.\\TU/lmr/m/n/10 itâ\u0080\u0099s']),
  ].join('\n')
  const samples = ['\\a', '\\b', '\\c', '\\d']
  it('reads none of them without it, as before', () => {
    expect(readInkTexts(log, samples)).toEqual([])
  })
  it('reads each as its glyph: ’ ‘ ” “, a ligature’s whatever slot the encoding gives it', () => {
    expect(readInkTexts(log, samples, { quotes: true })).toEqual([
      ['\\a', 'it’s'],
      ['\\b', '“q”'],
      ['\\c', '‘a'],
      ['\\d', 'it’s'],
    ])
    expect(readInkDecorated(log, samples, { quotes: true })).toEqual([])
  })
})
