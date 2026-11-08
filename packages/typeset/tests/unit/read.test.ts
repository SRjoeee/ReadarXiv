// The reading (L5) and the tokens (L7) of a part's member from what the part states (lay/read.ts): each element drawn by its
// El (a formula as a crop of its ink, a citation as the page's text, a tie as a space), the label drawn anew, the base style
// from Style through today's baseOf, on hand-made members with a measurer of fixed widths.
import type { Placed } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { rectOf } from '../../src/lay/adapt.ts'
import { measured, paperOf, readMember, type RowUnit, sourcePieces } from '../../src/lay/read.ts'
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
const read = (m: Placed, pieces: V0Piece[], kind = 'para') => {
  const r = readMember({
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
    shown: Number.POSITIVE_INFINITY,
  })
  return { ...r, tokens: measured(r.tokens, metrics) }
}

describe('the reading from the part', () => {
  it('keeps a display the unit ends with in place: no region of it is referenced, no token blocks to it', () => {
    // (2307.16209v1 p58 ord 197: a paragraph ending with a display, whose rows the part states as KEPT lines after its last
    // text line; today's layout file holds no line of it, the maker's inPlace)
    const m = member({
      lines: [
        [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
        [1, 0, 120, 250, 680, 688, 676, 72, 300, 1, 10],
      ],
      els: [['1', { kind: 'display', keep: 1, ink: [[1, 120, 676, 250, 688, 680]] }]],
    })
    const got = read(m, [{ t: 'text', tr: true, s: 'Satz' } as V0Piece, { t: 'ph', src: '{=1}', k: 1 } as V0Piece])
    expect(got.resolutions.get(1)).toMatchObject({ mode: 'kept', inPlace: true })
    expect((got.tokens as unknown as { blockTo?: number }[]).some((t) => t.blockTo !== undefined)).toBe(false)
  })
  it('draws a text macro whose glyphs are the unit’s text as its stated text; one with none unread, its unit unproven', () => {
    // (1810.04805v2's \\bert{}: "BERT" set as the unit's own text, no ink of the element's; the marking probe's text stated)
    const pieces = [{ t: 'ph', src: '\\bert', k: 0 } as V0Piece, { t: 'text', tr: true, s: ' ist' } as V0Piece]
    const got = read(
      member({ els: [['0', { kind: 'umacro', unknown: 1, cmd: 'bert', bare: 1, ink: [], text: 'BERT' }]] }),
      pieces,
    )
    expect(got.resolutions.get(0)).toMatchObject({ mode: 'orig-text', text: 'BERT' })
    expect((got.tokens as unknown as { s?: string }[])[0]!.s).toBe('BERT')
    // (a paper's own macro the part states no ink and no text of: whether TeX set nothing for it or set its glyphs as the unit's
    // text, the reading cannot tell, and drawn as nothing its glyphs were erased with the text group and never drawn again
    // (2608.06007v1 p10's \\sys, "TensorCast", the checkpoint's free-17): the unit is unproven, left the original's whole)
    const none = read(member({ els: [['0', { kind: 'umacro', unknown: 1, cmd: 'bert', bare: 1, ink: [] }]] }), pieces)
    expect(none.unproven).toBe(0)
    // (a macro a table renders, no ink found and none stated set: not found, its unit unproven as a paper's own is)
    const known = read(member({ els: [['0', { kind: 'macro', ink: [] }]] }), pieces)
    expect(known.unproven).toBe(0)
  })
  it('reads an element of no ink by the one of three the part states: set nothing, outside the unit, or not found', () => {
    // (math.md §4, lave.md §2: an empty ink meant "TeX set none", "not found" and "outside the unit" alike, and the reading took
    // a visible one for TeX's nothing: 2608.25210v2 p7's algorithm erased under one line, 2402.10294v1's reference [1] drawn
    // without its year, both drawn as nothing while their glyphs went with the text group. Now El.text '' states TeX set
    // nothing (drawn as nothing), El.keep that TeX set it outside the unit's text (drawn as nothing, its ink never erased),
    // neither that its ink was not found: the unit is left the original's)
    const pieces = [
      { t: 'ph', src: '{=0}', k: 0 } as V0Piece,
      { t: 'text', tr: true, s: ' Adobe Premiere Pro.' } as V0Piece,
    ]
    for (const kind of ['other', 'cite', 'num', 'display', 'macro', 'umacro'] as const) {
      const lost = read(member({ els: [['0', { kind, ink: [] }]] }), pieces)
      expect(lost.unproven, kind).toBe(0)
      const none = read(member({ els: [['0', { kind, ink: [], text: '' }]] }), pieces)
      expect(none.unproven, kind).toBe(-1)
      expect(none.resolutions.get(0), kind).toMatchObject({ mode: 'none', text: '', proof: true })
      const outside = read(member({ els: [['0', { kind, ink: [], keep: 1 }]] }), pieces)
      expect(outside.unproven, kind).toBe(-1)
      expect(outside.resolutions.get(0), kind).toMatchObject({ mode: 'none', text: '', proof: true, inPlace: true })
    }
    // (a symbol, drawn by its own text, and TeX's nothing, as before)
    expect(read(member({ els: [['0', { kind: 'symbol', ink: [], sym: ['%'] }]] }), pieces).unproven).toBe(-1)
    expect(read(member({ els: [['0', { kind: 'zero', ink: [] }]] }), pieces).unproven).toBe(-1)
  })
  it('draws a paper’s own macro whose span the instrument states empty as nothing, its unit read', () => {
    // (2610.19159v1's `\\trajectoryMark{}`, which sets nothing for an empty argument: the marked compile's two points around it hold
    // no glyph, the part's El.text '' with no ink, TeX set none; texParts' inklessOf, drawn as nothing and proven, where an El of
    // no ink and no text stated leaves the unit unproven)
    const pieces = [
      { t: 'text', tr: true, s: 'Werkzeug ' } as V0Piece,
      { t: 'ph', src: '\\trajectoryMark{}', k: 1 } as V0Piece,
    ]
    const got = read(
      member({ els: [['1', { kind: 'umacro', unknown: 1, cmd: 'trajectoryMark', ink: [], text: '' }]] }),
      pieces,
    )
    expect(got.unproven).toBe(-1)
    expect(got.resolutions.get(1)).toMatchObject({ mode: 'none', text: '', proof: true })
    expect((got.tokens as unknown as { s?: string }[]).map((t) => t.s ?? '').join('')).toBe('Werkzeug')
  })
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
  it('draws an abbreviated float label in the target, its name stated with its own stop', () => {
    // (2610.21880v1 p2's IEEE caption "Fig. 4.", as the engine states its parts: the name "Fig.", the number "4"; drawn as
    // today's labelInTarget draws it, the target's name, the original's number and punctuation)
    const m = member({
      kind: 'caption',
      label: {
        kind: 'float',
        ink: [1, 72, 698, 95, 708, 700],
        style: { role: 'serif', size: 10 },
        name: ['Fig.', [1, 72, 698, 87, 708, 700]],
        num: ['4', [1, 89.5, 698, 94.5, 708, 700]],
        punct: ['.', [1, 94.5, 698, 97, 708, 700]],
      },
    })
    expect(read(m, [{ t: 'text', tr: true, s: 'Ein Bild' } as V0Piece], 'caption').labelDrawn).toBe('Abbildung 4.')
    const caps = member({
      kind: 'caption',
      label: {
        kind: 'float',
        ink: [1, 72, 698, 100, 708, 700],
        style: { role: 'serif', size: 10 },
        name: ['FIG.', [1, 72, 698, 92, 708, 700]],
        num: ['4', [1, 94.5, 698, 99.5, 708, 700]],
        punct: [':', [1, 99.5, 698, 102, 708, 700]],
      },
    })
    expect(read(caps, [{ t: 'text', tr: true, s: 'Ein Bild' } as V0Piece], 'caption').labelDrawn).toBe('ABBILDUNG 4:')
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
