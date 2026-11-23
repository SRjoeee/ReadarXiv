// The review of a unit TeX set turned (#673): what its elements and label state is a level unit's statement read in the frame.
// A glyph's paint, not its Unicode, makes it ink (a whitespace-mapped delimiter of CMEX: lines.ts isInk, #668's rule); a reference's
// crop copies as its glyphs read (El.copy); a symbol whose ink is not that symbol is drawn as its ink (Member.asInk); a label TeX
// set on a line of its own states that line's alignment (Label.align); an annotation over its turned glyphs is its member's
// (Link.owner), so that the typesetter moves it with the crop.
import { type Piece, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import type { DocTurned } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, type PieceClass, ROLE } from '../src/instrument.ts'
import { docOf } from './helpers/doc.ts'
import { locate } from './helpers/locate.ts'

const text = (s: string): Piece => ({ t: 'text', s })
/** a run of a unit's turned text: its characters, their role and piece, their size, their drop under the line's baseline, and
 *  their own ink up and down from the baseline in em where it is not the font's band (`up`, `down`) */
type Run = { s: string; role?: number; piece?: number; size?: number; drop?: number; up?: number; down?: number }
/** a turned glyph of no unit's on the page beside the unit's (another unit's ink, as its frame's room reads it) */
type Other = Pick<DocTurned, 'u' | 'ox' | 'oy' | 'ex' | 'ey' | 'ux' | 'uy'> & Partial<DocTurned>
/** a page with a level line and lines of runs set a quarter turned (0, 1): line q from (60 + 12 q + lift, 400) up the page, 6 a
 *  glyph along it (its frame's x from 400, its baseline -60 - 12 q - lift); then the turned glyphs of no unit's (`others`) */
const pageOf = (lines: Run[][], lift: number[] = [], others: Other[] = []) => {
  const d = docOf([{ lines: ['Method 0.91'] }])
  const T: DocTurned[] = []
  const owner: [number, number][] = []
  lines.forEach((runs, q) => {
    let j = 0
    for (const r of runs)
      for (const u of [...r.s]) {
        const [x, y] = [60 + 12 * q + (lift[q] ?? 0) + (r.drop ?? 0), 400 + 6 * j]
        T.push({
          u,
          code: u.codePointAt(0) as number,
          base: 'CMR10',
          n: 1 + q,
          k: j,
          at: 11,
          box: -1,
          ox: x,
          oy: y,
          ex: x,
          ey: y + 6,
          ux: 0,
          uy: 1,
          size: r.size ?? 10,
          ascent: 0.7,
          descent: -0.2,
          up: r.up ?? (/\S/.test(u) ? 0.7 : 0),
          down: r.down ?? (/\S/.test(u) ? -0.2 : 0),
          form: false,
        })
        owner.push([r.role ?? ROLE.text, r.piece ?? -1])
        j++
      }
  })
  for (const t of others) {
    T.push({ code: t.u.codePointAt(0) ?? 32, base: 'CMR10', n: 9, k: T.length, at: 11, box: -1, size: 10, ascent: 0.7, descent: -0.2, up: 0.7, down: -0.2, form: false, ...t })
    owner.push([-1, -1])
  }
  d.pages[0]!.turned = T
  return { d, owner }
}
const runOf = (
  content: Piece[],
  lines: Run[][],
  more: Partial<InstrumentUnit> = {},
  kind = 'cell',
  o: { lift?: number[]; annotations?: unknown[]; others?: Other[] } = {},
) => {
  const level: InstrumentUnit = {
    id: unitId('cell', [text('Method 0.91')]),
    kind: 'cell',
    content: [text('Method 0.91')],
  }
  const unit: InstrumentUnit = { id: unitId(kind, content), kind, content, ...more }
  const B = pageOf(lines, o.lift, o.others).d
  const A = pageOf(lines, o.lift, o.others).d
  const { owner } = pageOf(lines, o.lift, o.others)
  const ins: Instrument = {
    ink: B,
    units: [level, unit],
    glyphs: B.pages.map((pg) => {
      const O = ownersOf(pg.glyphs.length)
      pg.glyphs.forEach((_, j) => {
        O.unit[j] = 0
        O.role[j] = ROLE.text
      })
      return O
    }),
    boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
    turned: [
      {
        unit: Int32Array.from(owner.map(([r]) => (r < 0 ? -1 : 1))),
        role: Uint8Array.from(owner.map(([r]) => Math.max(r, 0))),
        piece: Int32Array.from(owner.map(([, k]) => k)),
      },
    ],
    tex: {},
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  }
  const L = locate(ins, A, align(B, A), o.annotations ? { annotations: [o.annotations] } : {})
  return { L, mem: L.members[1]! }
}
const E = ROLE.element

describe('the review of a unit TeX set turned (#673)', () => {
  it('reads a painted glyph whose Unicode is white space as ink of its element: a big delimiter in its crop', () => {
    // (CMEX10's Bigg "(", code 32, read by PDF.js as U+0020, its outline 1.5 em over the baseline and 0.8 under: painted, so its
    // formula's crop holds it, as a level element's box holds it (lines.ts isInk); read by its Unicode it stood on no line and
    // in no box of its element, erased with the element's group and never drawn again)
    const content: Piece[] = [text('Size '), { t: 'el', id: '1', kind: 'math', src: '$\\Bigg(n$' }]
    const { mem } = runOf(
      content,
      [[{ s: 'Size ' }, { s: ' ', role: E, piece: 1, up: 1.5, down: -0.8 }, { s: 'n', role: E, piece: 1 }]],
      { classes: [['1', { cls: 'other' } as PieceClass]] },
    )
    expect(mem).toMatchObject({ located: true, frame: [0, 1] })
    // (the formula from the delimiter's origin, 430, to the n's advance end, 442; down to its outline's 0.8 em under the
    // baseline -60, up to its 1.5 em over it)
    expect(new Map(mem.elements).get('1')!.ink).toEqual([[1, 430, -68, 442, -45, -60]])
  })
  it('states a turned reference’s and citation’s copy text as their glyphs read, as a level element’s text is read', () => {
    // (selected and copied from a translated sideways caption, "Sect. 4.2" and "[7]", never the source's reading "?" or "[·]")
    const content: Piece[] = [
      text('Runs (Sect. '),
      { t: 'el', id: '1', kind: 'ref', src: '\\ref{s}' },
      text(') of '),
      { t: 'el', id: '3', kind: 'cite', src: '\\cite{a}' },
    ]
    const { mem } = runOf(
      content,
      [[{ s: 'Runs (Sect. ' }, { s: '4.2', role: E, piece: 1 }, { s: ') of ' }, { s: '[7]', role: E, piece: 3 }]],
      {
        classes: [
          ['1', { cls: 'num', copy: '?' } as PieceClass],
          ['3', { cls: 'cite', copy: '[·]' } as PieceClass],
        ],
      },
      'caption',
    )
    const els = new Map(mem.elements)
    expect(els.get('1')!.copy).toBe('4.2')
    expect(els.get('3')!.copy).toBe('[7]')
  })
  it('draws a symbol whose turned ink is not that symbol as its ink: a letter among its glyphs', () => {
    // (2610.10069v1's `$\\vs^*$` set turned: the reading's "*", its ink a bold s and the star; drawn as "*" alone the s is lost)
    const content: Piece[] = [text('Rate '), { t: 'el', id: '1', kind: 'math', src: '$\\vs^*$' }]
    const { mem } = runOf(content, [[{ s: 'Rate ' }, { s: 's*', role: E, piece: 1 }]], {
      classes: [['1', { cls: 'symbol', sym: ['*'] } as PieceClass]],
    })
    expect(mem.asInk?.has('1')).toBe(true)
  })
  it('states the alignment of a turned label TeX set on a line of its own (IEEEtran’s TABLE I over its caption)', () => {
    // (the label at the frame's baseline -48, the caption's text at -60 under it, centred over the caption's measure)
    const content: Piece[] = [text('Results of the runs')]
    const { mem } = runOf(
      content,
      [[{ s: 'TABLE I', role: ROLE.label }], [{ s: 'Results of the runs' }]],
      { float: 'table' },
      'caption',
      { lift: [-24, -12] },
    )
    expect(mem).toMatchObject({ located: true, frame: [0, 1] })
    expect(mem.labelAt?.line).toBeUndefined()
    expect(mem.labelAt?.align).toBeDefined()
  })
  it('gives an annotation over a turned reference its member and piece: what the typesetter moves with the crop', () => {
    // (a link over "4.2" of a sideways caption, its glyphs at y 472 to 490 along x 60 on the page: no level glyph under it)
    const content: Piece[] = [text('Runs (Sect. '), { t: 'el', id: '1', kind: 'ref', src: '\\ref{s}' }, text(').')]
    const { L, mem } = runOf(
      content,
      [[{ s: 'Runs (Sect. ' }, { s: '4.2', role: E, piece: 1 }, { s: ').' }]],
      { classes: [['1', { cls: 'num' } as PieceClass]] },
      'caption',
      { annotations: [{ annotationType: 2, rect: [52, 471, 63, 491], dest: 'sec.4.2' }] },
    )
    const [link] = L.links.get(1) ?? []
    expect(link).toMatchObject({ owner: [mem.ord, '1'], text: '4.2' })
  })
})

describe('the review of round 2 into main (#676): a unit TeX set turned', () => {
  it('leaves a turned unit whose text sets no glyph of ink the original’s, its reason stated: the prepare goes on', () => {
    // (a sideways cell of two formulas and the space between them, which pdfTeX sets as a glyph under \pdfinterwordspaceon:
    // its text glyphs all white space, its glyphs of ink its formulas'. Its turn was read off its text's ink alone, of which
    // it had none: the read threw and the paper's prepare with it)
    const content: Piece[] = [
      { t: 'el', id: '0', kind: 'math', src: '$x$' },
      text(' '),
      { t: 'el', id: '2', kind: 'math', src: '$y$' },
    ]
    const { mem } = runOf(content, [[{ s: 'x', role: E, piece: 0 }, { s: ' ' }, { s: 'y', role: E, piece: 2 }]])
    expect(mem).toMatchObject({ located: false, cause: 'turned: no text of ink' })
  })
  // (a cell `Rate` set a quarter turned, its frame's line on baseline -60 from x 400 to 424, its band -62 to -53; under it, across
  // its measure, a glyph of another unit's whose ink's top stands 3 under the line's bottom, at -65)
  const under = (t: Partial<Other>): Other => ({ u: '(', ox: 80, oy: 405, ex: 80, ey: 411, ux: 0, uy: 1, up: 1.5, down: -0.8, ...t })
  const roomOf = (others: Other[]) => runOf([text('Rate')], [[{ s: 'Rate' }]], {}, 'cell', { others }).mem.room
  it('reads a neighbour’s painted glyph whose Unicode is white space as ink under a framed member', () => {
    // (CMEX's big parenthesis, which PDF.js reads as U+0020: it paints (its outline 1.5 em up, 0.8 down); passed over by its
    // Unicode, the room under the cell ran to its size, 10, over the parenthesis)
    expect(roomOf([under({ u: ' ' })]).below).toBe(3)
  })
  it('reads a neighbour’s glyph by its own ink where it passes its font’s band', () => {
    // (by its font's band, 0.7 em up, its top at -73: 11 of room where its ink stands 3 under the line)
    expect(roomOf([under({})]).below).toBe(3)
  })
  it('reads a neighbour’s glyph turned at another angle by the four corners of its band', () => {
    // (a glyph turned 45 degrees, its advance its band's height (9): its origin's corner under its baseline and its end's over it
    // stand on one line of the page; by those two its band collapsed to a line, its top at -71.36, 9.36 of room. By its four
    // corners its top is its origin's over the baseline, at -65)
    const s = Math.SQRT1_2
    const ox = 65 + 7 * s
    expect(roomOf([{ u: 'x', ox, oy: 405, ex: ox + 9 * s, ey: 405 + 9 * s, ux: s, uy: s, up: 0.7, down: -0.2 }]).below).toBe(3)
  })
  it('weighs an annotation over turned glyphs by all of them under it: three of a held member’s among nine of none are not its', () => {
    // (a link over the caption's "4)." and nine glyphs of no unit's beside them, the line after it on the page: the member owns 3
    // of the 12 under it, no majority; counted among its own alone, 3 of 3, it took the link)
    const content: Piece[] = [text('Runs '), { t: 'el', id: '1', kind: 'ref', src: '\\ref{s}' }, text(').')]
    const others: Other[] = [...'abcdefghi'].map((u, j) => ({ u, ox: 72, oy: 430 + 6 * j, ex: 72, ey: 436 + 6 * j, ux: 0, uy: 1 }))
    const { L } = runOf(content, [[{ s: 'Runs ' }, { s: '4', role: E, piece: 1 }, { s: ').' }]], {
      classes: [['1', { cls: 'num' } as PieceClass]],
    }, 'caption', { others, annotations: [{ annotationType: 2, rect: [52, 425, 80, 486], dest: 'sec.4' }] })
    const [link] = L.links.get(1) ?? []
    expect(link?.owner).toBeUndefined()
  })
  // RECORDED, NOT BUILT (Devin on #676, Codex on #673's second review: counted then, 0 of the 68 framed units over the lab's 245
  // papers hold a forced break; it fails until it is): a forced break in a framed member states no line it ends (El.ends), which
  // the typesetter's breaks need to end its translation's line there, as a level member's does (facts-pass.ts readElements).
  it.fails('states the line a forced break ends in a framed cell, as a level one’s', () => {
    const content: Piece[] = [text('Training results'), { t: 'el', id: '1', kind: 'break', src: '\\newline' }, text('Validation results')]
    const { mem } = runOf(content, [[{ s: 'Training results' }], [{ s: 'Validation results' }]], {
      classes: [['1', { cls: 'break' } as PieceClass]],
    })
    expect(new Map(mem.elements).get('1')?.ends).toBeDefined()
  })
})
