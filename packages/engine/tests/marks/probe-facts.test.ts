// What the back half reads of the mark probe's own log (the compile move's B3: the display design's F14 and F16), from listings
// written here in TeX's form: the samples whose box TeX ends with ink a glue of infinite stretch pushed (readInkEnds), the pieces
// a unit ends with that TeX sets as its end mark (endPiecesOf), and TeX's quotation marks read as the glyphs a text font sets for
// them (readInkTexts' `quotes`); and rule 3's measured half: the samples TeX set nothing for, no ink, a box of no width and no
// separator in it (readInkNothing), and the sources TeX set nothing for where the document uses them, at every use of their
// command (usedNothingOf over B4's use answers: the probe's answer alone states none).
import { describe, expect, it } from 'vitest'
import {
  endPiecesOf,
  inkSamples,
  readInkDecorated,
  readInkEnds,
  readInkNothing,
  readInkTexts,
  useAnswersOf,
  usedNothingOf,
} from '../../src/marks/marks.ts'

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

/** one sample's listing as the ink section writes it, its box's line given, and what TeX writes before the listing */
const boxed = (i: number, box: string, nodes: string[], before: string[] = []) =>
  [
    `LAYOUT-PROBE 1 ink-at ${i}`,
    ...before,
    '> \\box74=',
    box,
    ...nodes,
    '',
    '! OK.',
    `LAYOUT-PROBE 1 ink-end ${i}`,
  ].join('\n')
const NONE = '\\hbox(0.0+0.0)x0.0'

describe('readInkNothing: the samples TeX set nothing for, no ink, no width and no separator (rule 3’s measured half)', () => {
  const log = [
    // (a macro defined as a horizontal skip, `\hspace{2.5em}`: no ink, wide)
    boxed(0, '\\hbox(0.0+0.0)x25.0', ['.\\glue 25.0']),
    // (one defined as a forced break, `\\`: no ink, no width, TeX's \nobreak \hfil \break)
    boxed(1, NONE, ['.\\penalty 10000', '.\\glue 0.0 plus 1.0fil', '.\\penalty -10000']),
    // (one defined empty; one defined as declarations, `\normalfont\bfseries\relax`: nothing listed)
    boxed(2, NONE, []),
    boxed(3, NONE, []),
    // (an anchor and a key written to a file: a destination in boxes of no width, a write; a penalty no break is forced at)
    boxed(4, NONE, [
      '.\\penalty 10000',
      '.\\hbox(0.0+0.0)x0.0',
      '..\\hbox(0.0+0.0)x0.0, shifted -12.0',
      '...\\pdfdest name{a.1} xyz',
      '.\\write1{\\@writefile{toc}{a}}',
    ]),
    // (a vertical skip, a \vadjust holding its glue; two kerns that take back what they give)
    boxed(5, NONE, ['.\\vadjust', '..\\glue 10.0']),
    boxed(6, NONE, ['.\\kern 5.0', '.\\kern -5.0']),
    // (one scaled point wide, as TeX prints it)
    boxed(7, '\\hbox(0.0+0.0)x0.00002', []),
    // (ink: a character)
    boxed(8, '\\hbox(4.30554+0.0)x5.27779', ['.\\OT1/cmr/m/n/10 x']),
    // (an error before the listing: no answer)
    boxed(9, NONE, [], ['! Undefined control sequence.']),
  ].join('\n')
  const samples = ['\\wide', '\\brk', '\\nada', '\\decl', '\\anchor', '\\vsp', '\\kerns', '\\onesp', '\\ink', '\\undef']
  it('gives the samples of no ink, no width and no glue, kern or forced break: empty, declarations, anchors and writes', () => {
    expect(readInkNothing(log, samples)).toEqual(['\\nada', '\\decl', '\\anchor'])
  })
})

describe('usedNothingOf: the sources TeX set nothing for where the document uses them, at every use of their command', () => {
  const text = (s: string) => ({ t: 'text' as const, s })
  const ph = (src: string) => ({ t: 'ph' as const, src })
  const unit = (pieces: ({ t: 'text'; s: string } | { t: 'ph'; src: string })[]) => ({ kind: 'para', pieces }) as never
  // (the asks' log, each source asked at its use by its ask's index: B4's pass)
  const asked = ['\\nada', '\\opt{}', '\\opt{x}', '\\decl', '\\wide', '\\brk']
  const log = [
    boxed(0, NONE, []),
    boxed(1, NONE, []),
    boxed(2, '\\hbox(4.30554+0.0)x5.27779', ['.\\OT1/cmr/m/n/10 x']),
    boxed(3, NONE, []),
    boxed(4, '\\hbox(0.0+0.0)x25.0', ['.\\glue 25.0']),
    boxed(5, NONE, ['.\\penalty 10000', '.\\glue 0.0 plus 1.0fil', '.\\penalty -10000']),
  ].join('\n')
  const units = [
    unit([
      text('a '),
      ph('\\nada'),
      text(' b '),
      ph('\\opt{}'),
      text(' c '),
      ph('\\opt{x}'),
      text(' d '),
      ph('\\decl'),
    ]),
    unit([text('e '), ph('\\wide'), text(' f '), ph('\\brk'), text(' g '), ph('\\nada')]),
  ]
  it('takes a command every use of which sets nothing; one a use of which sets ink, a skip, a forced break are kept', () => {
    const uses = useAnswersOf(log, asked)
    expect(uses.nothing).toEqual(['\\nada', '\\opt{}', '\\decl'])
    expect(usedNothingOf(units, uses)).toEqual(['\\nada', '\\decl'])
  })
  it('takes no command a use of which TeX was not asked about there (a title’s, an entry’s); and none without use answers', () => {
    const more = [...units, unit([text('h '), ph('\\decl{}')])]
    expect(usedNothingOf(more, useAnswersOf(log, asked))).toEqual(['\\nada'])
    // (the probe's answer after the preamble alone, however it reads, states nothing: no `uses`, no source)
    expect(usedNothingOf(units, null)).toEqual([])
  })
})

describe('D’s commands as the stored probe logs list them (lab-data s4/probes; the listings’ node kinds and widths, no text)', () => {
  // [the paper's command as a sample, the definition it was set by, its listing, TeX's answer]
  const D: [string, string, string, string[], string[], boolean][] = [
    [
      '\\authorspace',
      '2610.37818v1 `\\newcommand{\\authorspace}{\\hspace{2.5em}}`',
      '\\hbox(0.0+0.0)x25.0',
      ['.\\glue 25.0'],
      [],
      false,
    ],
    ['\\affilspace', '2610.37818v1, as \\authorspace', '\\hbox(0.0+0.0)x25.0', ['.\\glue 25.0'], [], false],
    [
      '\\authorcr',
      '2610.40394v1, authblk.sty `\\protect\\\\`',
      NONE,
      ['.\\penalty 10000', '.\\glue 0.0 plus 1.0fil', '.\\penalty -10000'],
      [],
      false,
    ],
    ['\\natexlab{a}', '2402.10294v1, 2610.21026v1, 2610.37818v1: the bibliography style’s', NONE, [], [], true],
    ['\\showISBNx{9780000000000}', '2402.10294v1, ACM’s bibliography style', NONE, [], [], true],
    [
      '\\email{a@b.c}',
      '2608.08350v2, revtex4-2.cls (its warning of the wrong context)',
      NONE,
      [],
      ['Class revtex4-2 Warning: \\email, \\homepage, \\thanks, or \\altaffiliation appears', ' in wrong context. .'],
      true,
    ],
    [
      '\\phantomsection',
      '2610.37818v1, hyperref.sty',
      NONE,
      [
        '.\\penalty 10000',
        '.\\hbox(0.0+0.0)x0.0',
        '..\\hbox(0.0+0.0)x0.0, shifted -12.0',
        '...\\pdfdest name{section*.1} xyz',
        '...\\penalty 10000',
      ],
      [],
      true,
    ],
    [
      '\\urldef',
      '2402.10294v1, url.sty: its arguments are what follows it',
      NONE,
      [],
      ['! Argument of \\urldef has an extra }.', '! Paragraph ended before \\urldef was complete.'],
      false,
    ],
    [
      '\\tempurl',
      '2402.10294v1, \\urldef’s, defined where it stands',
      NONE,
      [],
      ['! Undefined control sequence.'],
      false,
    ],
    [
      '\\name',
      '2608.08872v1, jmlr2e.sty’s, undefined where the probe sets it',
      NONE,
      [],
      ['! Undefined control sequence.'],
      false,
    ],
    [
      '\\corresponding',
      '2608.11884v1, aaai2027.sty’s, undefined where the probe sets it',
      NONE,
      [],
      ['! Undefined control sequence.'],
      false,
    ],
  ]
  const log = D.map(([, , box, nodes, before], i) => boxed(i, box, nodes, before)).join('\n')
  const nothing = new Set(
    readInkNothing(
      log,
      D.map(([s]) => s),
    ),
  )
  it.each(D.map((r) => [r[0], r[1], r[5]] as const))('%s (%s): sets nothing %s', (src, _, sets) => {
    expect(nothing.has(src)).toBe(sets)
  })
  it('asks nothing of a URL (the url class) or a group’s brace: neither is an ink sample, so neither is asked where it is used', () => {
    const units = [
      {
        kind: 'reference',
        pieces: [
          { t: 'text', s: 'a ' },
          { t: 'ph', src: '\\url{https://a.io}' },
        ],
      },
      {
        kind: 'author',
        pieces: [
          { t: 'text', s: 'b ' },
          { t: 'ph', src: '}' },
        ],
      },
    ] as never
    expect(inkSamples(units)).toEqual([])
  })
})
