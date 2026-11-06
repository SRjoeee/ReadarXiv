// The reading (L5) and the tokens (L7) of a part's member from what the part states (lay/read.ts): each element drawn by its
// El (a formula as a crop of its ink, a citation as the page's text, a tie as a space), the label drawn anew, the base style
// from Style through today's baseOf, on hand-made members with a measurer of fixed widths.
import type { Placed } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { rectOf } from '../../src/lay/adapt.ts'
import { paperOf, readMember, type RowUnit, sourcePieces } from '../../src/lay/read.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics } from '../../src/types.ts'
import type { V0Piece } from '../../src/unit/breaks.ts'

const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
}
const P = rulesFor('de').set as never
const paper = paperOf([['NimbusRomNo9L-Regu', 100]], 'de', null)
const member = (o: Partial<Placed> = {}): Placed => ({
  ord: 3,
  kind: 'para',
  text: 'a'.repeat(64),
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'j',
  lines: [[1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10]],
  room: { below: 0 },
  ...o,
})
const read = (m: Placed, pieces: V0Piece[], kind = 'para') =>
  readMember({
    m,
    unit: { kind, state: 'whole', pieces } as RowUnit,
    rects: m.lines.map((l) => rectOf(l, m)),
    to: 'de',
    P,
    paper,
    labels: {
      words: { figure: 'Abbildung', table: 'Tabelle' },
      captions: { figure: 'target', table: 'target' },
      heads: null,
      names: null,
    },
    relabels: !!m.label,
    metrics,
    shown: Number.POSITIVE_INFINITY,
  })

describe('the reading from the part', () => {
  it('reads a unit’s tree of pieces back as today’s flat ones, a group an open and a close', () => {
    const got = sourcePieces([
      { t: 'text', s: 'a ' },
      { t: 'span', id: '1', style: 'italic', open: '\\emph{', close: '}', content: [{ t: 'text', s: 'b' }] },
      { t: 'el', id: '4', kind: 'cite', src: '\\cite{x}' },
    ])
    expect(got.map((p) => [p.t, p.k])).toEqual([
      ['text', 0],
      ['open', 1],
      ['text', 2],
      ['close', 3],
      ['ph', 4],
    ])
    expect((got[1] as { id?: unknown }).id).toBe((got[3] as { id?: unknown }).id)
  })
  it('draws a formula as a crop of its ink, a citation as its page text, a tie as a space', () => {
    const src = sourcePieces([
      { t: 'text', s: 'see ' },
      { t: 'el', id: '1', kind: 'other', src: '$x$' },
      { t: 'el', id: '2', kind: 'other', src: '~' },
      { t: 'el', id: '3', kind: 'cite', src: '\\cite{a}' },
    ])
    const m = member({
      els: [
        ['1', { kind: 'other', copy: 'x', ink: [[1, 100, 699, 106, 705, 700]] }],
        ['2', { kind: 'space', copy: ' ', ink: [] }],
        ['3', { kind: 'cite', copy: '[·]', text: '[1]', ink: [[1, 110, 698, 124, 708, 700]] }],
      ],
    })
    const tr = (s: string) => ({ t: 'text' as const, tr: true, s })
    const got = read(m, [tr('siehe '), src[1]!, tr(' und'), src[2]!, src[3]!, tr('.')])
    expect(got.unproven).toBe(-1)
    const toks = got.tokens as unknown as {
      s?: string
      crop?: { crop: number[]; baseline: number }
      ph?: string
      space?: true
    }[]
    // (the crop: its ink's box, 0.4 out on either side and 0.3 up and down, set by its baseline: cropOfBox)
    const crop = toks.find((t) => t.crop)!.crop!
    expect(crop.crop.map((v) => Math.round(v * 100) / 100)).toEqual([99.6, 698.7, 106.4, 705.3])
    expect(crop.baseline).toBe(700)
    const cite = toks.find((t) => t.ph === 'orig-text')!
    expect(cite.s).toBe('[1]')
    // (the tie, TeX's ~, a space before the citation)
    const i = toks.indexOf(cite)
    expect(toks[i - 1]!.space).toBe(true)
  })
  it('crops a citation one of whose glyphs no Unicode reads (no text stated), and draws a float’s label in the target', () => {
    const src = sourcePieces([
      { t: 'text', s: 'see ' },
      { t: 'el', id: '1', kind: 'cite', src: '\\cite{a}' },
    ])
    const m = member({
      kind: 'caption',
      label: {
        kind: 'float',
        ink: [1, 72, 698, 110, 708, 700],
        style: { role: 'serif', size: 10 },
        name: ['Figure', [1, 72, 698, 98, 708, 700]],
        num: ['1', [1, 100, 698, 105, 708, 700]],
        punct: [':', [1, 105, 698, 107, 708, 700]],
      },
      els: [['1', { kind: 'cite', copy: '[·]', ink: [[1, 140, 698, 154, 708, 700]] }]],
    })
    const got = read(m, [{ t: 'text', tr: true, s: 'siehe ' } as V0Piece, src[1]!], 'caption')
    expect(got.labelDrawn).toBe('Abbildung 1:')
    const toks = got.tokens as unknown as { s?: string; label?: true; crop?: unknown }[]
    expect(toks[0]).toMatchObject({ s: 'Abbildung', label: true })
    expect(toks.some((t) => t.crop)).toBe(true)
  })
  it('takes the base style from the original’s through today’s baseOf: a majority its own groups set is theirs', () => {
    const src = sourcePieces([
      { t: 'span', id: '0', style: 'bold', open: '\\textbf{', close: '}', content: [{ t: 'text', s: 'Bold words' }] },
      { t: 'text', s: ' rest' },
    ])
    const m = member({ style: { role: 'serif', size: 10, bold: 1, design: 'NimbusRomNo9L-Medi' } })
    const got = read(m, [
      src[0]!,
      { t: 'text', tr: true, s: 'Fett' } as V0Piece,
      src[2]!,
      { t: 'text', tr: true, s: ' Rest' } as V0Piece,
    ])
    const toks = got.tokens as unknown as { s?: string; st?: { bold?: boolean } }[]
    expect(toks.find((t) => t.s === 'Fett')!.st!.bold).toBe(true)
    expect(toks.find((t) => t.s === 'Rest')!.st!.bold).toBe(false)
  })
})
