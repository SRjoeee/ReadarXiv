// The units no source unit is, made by locate on arXiv's page by today's rule (src/locate/ink.ts): ink units, kept blocks and
// figure texts from A's glyphs no source unit owns, B's marks carried onto A.
import { read, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import { bundle } from '../src/bundle/bundle.ts'
import type { Doc } from '../src/doc.ts'
import type { PageInk } from '../src/ink.types.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { carry, spansOf } from '../src/locate/ink.ts'
import { locate } from '../src/locate/locate.ts'
import type { AddOn } from '../src/wrap/wrap.ts'
import { docOf, type PageSpec } from './helpers/doc.ts'

const text = (s: string) => ({ t: 'text' as const, s })
const unitOf = (kind: string, s: string): InstrumentUnit => {
  const content = [text(s)]
  return { id: unitId(kind, content), kind, content }
}
/** an instrument over B whose units own B's glyphs line by line (`own[p][line]`, -1 none) */
function instrumentOf(B: Doc, units: InstrumentUnit[], own: number[][]): Instrument {
  return {
    ink: B,
    units,
    glyphs: B.pages.map((pg, p) => {
      const O = ownersOf(pg.glyphs.length)
      pg.glyphs.forEach((g, j) => {
        O.unit[j] = own[p]?.[g.n] ?? -1
        O.role[j] = ROLE.text
      })
      return O
    }),
    boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
    tex: {},
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  }
}
/** A's pages as pageInk would give them (read.ts `raw`): its glyphs, boxes and their kinds */
const rawOf = (doc: Doc): PageInk[] =>
  doc.pages.map(
    (pg) =>
      ({
        glyphs: pg.glyphs.map((g) => ({ ...g })),
        boxes: pg.boxes,
        paths: pg.kinds,
        boxAt: pg.boxAt,
        points: [],
        paras: [],
        paraEnds: [],
        regions: [],
        turned: [],
        pictures: [],
        shapes: new Map(),
        figures: new Map(),
        unseen: new Set(),
        cut: new Map(),
        capped: false,
        timedOut: false,
        degraded: false,
        mergedAt: null,
        rotated: false,
      }) as unknown as PageInk,
  )
/** B and A of one page spec: B with the marks' points, A (arXiv's) with none */
function pair(spec: PageSpec): { B: Doc; A: Doc } {
  const { points: _, ...plain } = spec
  return { B: docOf([spec]), A: docOf([plain]) }
}

describe('locate: the units no source unit is, made on A by today’s rule', () => {
  it('makes a running head an ink unit of today’s id, its glyphs its own group', () => {
    // (the head shipped before the page's first mark, outside the column's body: today's ledger's `heads`)
    const { B, A } = pair({
      lines: ['Running Title', 'Body text here'],
      points: [
        ['bs1', 13],
        ['be1', 27],
      ],
    })
    const ins = instrumentOf(B, [unitOf('para', 'Body text here')], [[-1, 0]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const content = [text('Running Title')]
    expect(L.units.at(-1)).toEqual({ id: unitId('inkheads', content), kind: 'inkheads', content })
    const head = L.members.find((m) => m.kind === 'inkheads')!
    expect(head).toMatchObject({ located: true, unit: 1, place: 'same', fixed: false })
    expect(head.text).toEqual([0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12])
    expect(L.groups[0]!.glyphs[0]).toBe(`${head.ord}.1.t`)
    expect(L.born.size).toBe(0)
    expect(L.stats.made).toMatchObject({ ink: 1, kept: 0, figures: 0 })
  })
  it('sets a running head in capitals in the text’s capitals, its source its own case (PR #620 review: "ABSTRACT" lost upper)', () => {
    const { B, A } = pair({
      lines: ['RUNNING TITLE', 'Body text here'],
      points: [
        ['bs1', 13],
        ['be1', 27],
      ],
    })
    const ins = instrumentOf(B, [unitOf('para', 'Body text here')], [[-1, 0]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    expect(L.members.find((m) => m.kind === 'inkheads')!.style).toMatchObject({ upper: 1 })
    expect(L.members.find((m) => m.kind === 'para')!.style.upper).toBeUndefined()
  })

  it('makes a contents line an ink unit of its title alone, justified as today’s file sets a list', () => {
    // (the list's babel name ends before it: the contents' zone; its number, leaders and page number the original's ink)
    const { B, A } = pair({
      lines: ['1 Introduction . . . 3', 'Body text'],
      points: [
        ['bs1', 0],
        ['n0.contents.e', 0],
        ['be1', 31],
      ],
    })
    const ins = instrumentOf(B, [unitOf('para', 'Body text')], [[-1, 0]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const content = [text('Introduction')]
    expect(L.units[1]).toEqual({ id: unitId('inkcontents', content), kind: 'inkcontents', content, align: 'j' })
    const entry = L.members.find((m) => m.kind === 'inkcontents')!
    expect(entry.text).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    // (what it leaves, the number, the leaders and the page number, is a kept block's or no unit's: never the entry's group)
    expect(L.groups[0]!.glyphs[0]).not.toBe(`${entry.ord}.1.t`)
    expect(L.groups[0]!.glyphs[21]).not.toBe(`${entry.ord}.1.t`)
  })

  it('states each of an ink unit’s placeholders its own kept run’s ink, as today’s file draws each by its own segments', () => {
    // (the maker cuts each run of a math or typewriter face its own placeholder, and knows its glyphs: today's file draws each by
    // them, rows.ph. All of them stated as the first's, it drew every run at the first's place and none at the others', where a
    // translation sets words between them: 149 of the 88 corpus papers' 185 ink members of two elements or more, 2307.16209v1's
    // contents lines "ℓ = |s| … qQ … ν ≤ ν_c" in one crop)
    const spec = { lines: ['Body text here', 'and then x plus y equals z for all of them'] }
    const B = docOf([
      {
        ...spec,
        points: [
          ['bs1', 0],
          ['0s', 0],
          ['0e', 12],
          ['be1', 46],
        ],
      },
    ])
    const A = docOf([spec])
    for (const D of [A, B])
      for (const g of D.pages[0]!.glyphs)
        if (g.n === 1 && /^[xyz]$/.test(g.u)) {
          g.font = 'ABCDEF+CMMI10'
          g.base = 'CMMI10'
        }
    const ins = instrumentOf(B, [unitOf('para', 'Body text here')], [[0]])
    const classesOf = (p: readonly { t: string }[]) =>
      p.flatMap((x, k) => (x.t === 'ph' ? [[String(k), { cls: 'other' }]] : []))
    const L = locate(ins, A, align(B, A), { pages: rawOf(A), classesOf: classesOf as never })
    const member = L.members.find((m) => m.kind === 'inkorphan')!
    const els = new Map(member.elements)
    const g = A.pages[0]!.glyphs
    const at = (u: string) => g.find((x) => x.n === 1 && x.u === u)!
    for (const [id, u] of [
      ['1', 'x'],
      ['3', 'y'],
      ['5', 'z'],
    ] as const) {
      expect(els.get(id)!.ink).toHaveLength(1)
      expect(els.get(id)!.ink[0]!.slice(0, 4)).toEqual([1, at(u).x0, at(u).bottom, at(u).x1])
      expect(els.get(id)!.text).toBeUndefined()
    }
  })

  it('gives a rule the claim gave an ink unit’s placeholders to the one whose glyph stands nearest it', () => {
    // (claimInk gives the placeholders a rule inside one's extent, an inline fraction's bar, an address's underline: that one's,
    // never the first's)
    const lines = ['Body text here', 'and then x plus y equals z for all of them']
    // (a thin bar under the line's "y", the second placeholder's glyph: page glyph 30, x 168 to 174, its baseline 688)
    const boxes: [number, number, number, number, number, number][] = [[31, 0, 168.5, 689, 173.5, 689.5]]
    const B = docOf([
      {
        lines,
        boxes,
        points: [
          ['bs1', 0],
          ['0s', 0],
          ['0e', 12],
          ['be1', 46],
        ],
      },
    ])
    const A = docOf([{ lines, boxes }])
    for (const D of [A, B])
      for (const g of D.pages[0]!.glyphs)
        if (g.n === 1 && /^[xyz]$/.test(g.u)) {
          g.font = 'ABCDEF+CMMI10'
          g.base = 'CMMI10'
        }
    const ins = instrumentOf(B, [unitOf('para', 'Body text here')], [[0]])
    const classesOf = (p: readonly { t: string }[]) =>
      p.flatMap((x, k) => (x.t === 'ph' ? [[String(k), { cls: 'other' }]] : []))
    const L = locate(ins, A, align(B, A), { pages: rawOf(A), classesOf: classesOf as never })
    const member = L.members.find((m) => m.kind === 'inkorphan')!
    expect([...member.elBoxes]).toEqual([['3', [[1, 0]]]])
  })

  it('keeps an ink unit’s e-mail addresses each an element in its own ink, its fill the original’s (#28)', () => {
    // (2609.36054v2 p1's note: its two grey addresses said as text in colour groups no translation kept, drawn black)
    const note = 'Correspondence to: alan.chan@example.org and bo.writer@example.ac. The views are ours.'
    const spec = { lines: ['Body text here', note] }
    const B = docOf([
      {
        ...spec,
        points: [
          ['bs1', 0],
          ['0s', 0],
          ['0e', 12],
          ['be1', 14 + note.length],
        ],
      },
    ])
    const A = docOf([spec])
    // (each address grey, and the stop after the second, as the note's colour groups set them; the rest black)
    const grey = 0x7a7f80
    const greyAt = (at: number) =>
      (at >= note.indexOf('alan') && at < note.indexOf(' and ')) ||
      (at >= note.indexOf('bo.') && at < note.indexOf(' The'))
    for (const D of [A, B]) for (const g of D.pages[0]!.glyphs) if (g.n === 1 && greyAt(g.k - 14)) g.fill = grey
    const ins = instrumentOf(B, [unitOf('para', 'Body text here')], [[0]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const unit = L.units.find((u) => u.kind === 'inkorphan')!
    expect(
      unit.content.filter((p) => p.t === 'el').map((p) => [p.t === 'el' && p.kind, p.t === 'el' && p.src]),
    ).toEqual([
      ['url', '\\url{alan.chan@example.org}'],
      ['url', '\\url{bo.writer@example.ac}'],
    ])
    const els = new Map(L.members.find((m) => m.kind === 'inkorphan')!.elements)
    expect([...els].map(([id, e]) => [id, e.text, e.style?.fill, e.ink.length])).toEqual([
      ['1', 'alan.chan@example.org', grey, 1],
      ['3', 'bo.writer@example.ac', grey, 1],
    ])
  })

  it('writes a TeX special of an ink unit’s math run by the command that sets it in a formula: a brace alone an inline formula, never a display', () => {
    // (a brace a formula sets, `\{` (amsmath's set {0, …, J−1}, 2610.21377v1 p42) or a title's `$\{$Intra-Operator$\}$` in a
    // bibliography (2608.06007v1 p17): its glyph `{` in the symbol font's math face, a run of its own. The maker stripped TeX's
    // specials and wrote `$$`, which every reader takes as a display: a kept display row in the middle of the line)
    const line = 'the set {x} and inter-and {Intra} work'
    const spec = { lines: ['Body text here', line] }
    const B = docOf([
      {
        ...spec,
        points: [
          ['bs1', 0],
          ['0s', 0],
          ['0e', 12],
          ['be1', 14 + line.length],
        ],
      },
    ])
    const A = docOf([spec])
    for (const D of [A, B])
      for (const g of D.pages[0]!.glyphs) {
        if (g.n !== 1) continue
        const font = /^[{}]$/.test(g.u) ? 'CMSY10' : g.u === 'x' ? 'CMMI10' : null
        if (!font) continue
        g.font = `ABCDEF+${font}`
        g.base = font
      }
    const ins = instrumentOf(B, [unitOf('para', 'Body text here')], [[0]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const unit = L.units.find((u) => u.kind === 'inkorphan')!
    expect(unit.content.flatMap((p) => (p.t === 'el' ? [[p.kind, p.src]] : []))).toEqual([
      ['math', '$\\{x\\}$'],
      ['math', '$\\{$'],
      ['math', '$\\}$'],
    ])
    expect(unit.id).toBe(unitId('inkorphan', unit.content))
  })

  it('keeps a unit and a figure text TeX set wholly in a face of one pitch, where the paper’s body face is not one, always (Rule 1)', () => {
    // (2411.13093v4 p18-19: an LLM prompt, JSON and OCR samples set in Consolas, inside included figures, and 2608.25210v2's prompt
    // boxes in a typewriter face: translated, their keys and values came back garbled. What TeX or the figure's maker set wholly
    // in a typewriter face is an artefact the paper shows exactly: kept as the original, as a code environment is. A line of
    // prose holding a typewriter word is no artefact. The owner's ruling of 2026-11-10: the rule always applies, with no switch)
    const lines = (body: string) => [
      { text: 'Body text of the paper set here', font: body },
      { text: 'and more body text in that face', font: body },
      { text: '{ "ASR": null, "DET": [] }', font: 'ABCDEF+CMTT10' },
      { text: 'call the model now', font: 'ABCDEF+CMR10' },
    ]
    const make = (body: string) => {
      const B = docOf([{ lines: lines(body) }])
      const A = docOf([
        {
          lines: [
            ...lines(body),
            { text: 'request = {', y: 640, form: true, font: 'ABCDEF+CMTT10' },
            { text: 'Loss curve', y: 620, form: true, font: 'ABCDEF+CMR10' },
          ],
        },
      ])
      // (a roman face's characters each their own advance, as a proportional face sets them, the body's telling it for the
      // document; the typewriter's one)
      for (const D of [A, B])
        for (const g of D.pages[0]!.glyphs)
          if (g.font.endsWith('CMR10') && !g.blank && !g.form)
            g.x1 = g.x0 + (0.3 + ((g.u.codePointAt(0)! * 7) % 11) / 25) * g.size
      const units = [
        unitOf('para', 'Body text of the paper set here and more body text in that face'),
        unitOf('para', '{ "ASR": null, "DET": [] }'),
        unitOf('para', 'call the model now'),
      ]
      return locate(instrumentOf(B, units, [[0, 0, 1, 2]]), A, align(B, A), { pages: rawOf(A) })
    }
    const L = make('ABCDEF+CMR10')
    expect(L.units.slice(0, 3).map((u) => !!u.kept)).toEqual([false, true, false])
    expect(L.members.filter((m) => m.unit >= 0 && m.unit < 3).map((m) => m.fixed)).toEqual([false, true, false])
    const figs = L.members.filter((m) => m.figure)
    expect(figs.map((m) => [m.plain, m.fixed])).toEqual([
      ['request = {', true],
      ['Loss curve', false],
    ])
    expect(L.units[figs[0]!.unit]!.why).toBe('figure: code')
    // (each unit so kept is marked as kept by this rule, `pitch`, and no other: what the lab's dump and the parity read)
    expect(L.units.slice(0, 3).map((u) => !!u.pitch)).toEqual([false, true, false])
    expect(figs.map((m) => !!L.units[m.unit]!.pitch)).toEqual([true, false])
    // (a paper whose body face is a typewriter's keeps nothing for it: its whole text would stay untranslated)
    const T = make('ABCDEF+CMTT10')
    expect(T.units.slice(0, 3).map((u) => !!u.kept)).toEqual([false, false, false])
    expect(T.members.filter((m) => m.figure).map((m) => m.fixed)).toEqual([false, false])
  })

  it('keeps a figure’s word set in another face inside a line of a face of one pitch, with its line, always (Rule 1)', () => {
    // (2411.13093v4 p19's code boxes: `"ASR": "The number of the attractions.",` in Consolas but "attractions" in Georgia, and
    // `["coin", "table", ...]` but "coin": the lines kept, each read a Chinese word between its English ones. A word whose
    // glyphs right before and after it, in the page's order on its baseline, are of a face of one pitch stands inside a line of
    // code. A word of its own line stays translated)
    const body = (t: string) => ({ text: t, font: 'ABCDEF+CMR10' })
    const B = docOf([{ lines: [body('Body text of the paper set here'), body('and more body text in that face')] }])
    const A = docOf([
      {
        lines: [
          body('Body text of the paper set here'),
          body('and more body text in that face'),
          { text: '"key": "count all the ', x: 72, y: 640, form: true, font: 'ABCDEF+CMTT10' },
          { text: 'harbours', x: 72 + 22 * 6, y: 640, form: true, font: 'ABCDEF+CMR10' },
          { text: '.",', x: 72 + 30 * 6, y: 640, form: true, font: 'ABCDEF+CMTT10' },
          { text: 'Loss curve', x: 72, y: 600, form: true, font: 'ABCDEF+CMR10' },
        ],
      },
    ])
    for (const D of [A, B])
      for (const g of D.pages[0]!.glyphs)
        if (g.font.endsWith('CMR10') && !g.blank && !g.form)
          g.x1 = g.x0 + (0.3 + ((g.u.codePointAt(0)! * 7) % 11) / 25) * g.size
    const units = [unitOf('para', 'Body text of the paper set here and more body text in that face')]
    const L = locate(instrumentOf(B, units, [[0, 0]]), A, align(B, A), { pages: rawOf(A) })
    const fixed = new Map(L.members.filter((m) => m.figure).map((m) => [m.plain, m.fixed]))
    expect(fixed.get('"key": "count all the')).toBe(true)
    expect(fixed.get('harbours')).toBe(true)
    expect(fixed.get('Loss curve')).toBe(false)
    const pitch = new Map(
      L.members.filter((m) => m.figure && m.unit >= 0).map((m) => [m.plain, !!L.units[m.unit]!.pitch]),
    )
    expect([pitch.get('"key": "count all the'), pitch.get('harbours'), pitch.get('Loss curve')]).toEqual([
      true,
      true,
      false,
    ])
  })

  it('sets every line of a justified paragraph inside a figure from its start, an indented one too', () => {
    // (2411.13093v4 p18, Figure 8: a prompt set as a justified paragraph in an included figure, its entries' first lines indented
    // by hand. Each line a figure text, the indented one shares the paragraph's end with its full lines and not its start, and
    // was read set from its end: its translation laid flush against the box's right edge, its next line from the left. Lines
    // that share both edges, two at least, are a paragraph's measure: every line of it is set from its start)
    const B = docOf([{ lines: ['a paragraph whose word', 'continues on its last line'] }])
    const ins = instrumentOf(B, [unitOf('para', 'a paragraph whose word continues on its last line')], [[0, 0]])
    const A = docOf([
      {
        lines: [
          'a paragraph whose word',
          { text: 'The entry of the box indented here', x: 96, y: 640, form: true },
          { text: 'and its lines go on to the measure end', x: 72, y: 628, form: true },
          { text: 'set in one block of its prose', x: 72, y: 616, form: true, space: 15 },
          { text: 'its last one', x: 72, y: 604, form: true },
          { text: 'continues on its last line', y: 560 },
        ],
      },
    ])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const figs = L.members.filter((m) => m.figure)
    expect(figs.map((m) => [m.plain, m.align])).toEqual([
      ['The entry of the box indented here', 'l'],
      ['and its lines go on to the measure end', 'l'],
      ['set in one block of its prose', 'l'],
      ['its last one', 'l'],
    ])
  })

  it('sets a paragraph’s lines from their start where the figure’s maker set two of them a hundredth of a point larger', () => {
    // (2411.13093v4 p18: lines 515, an entry's indented first line, and 527, a full line, set at 7.07 pt among the paragraph's
    // 7.06's. A column is of one size, and sizes keyed to the hundredth parted the two from their paragraph into a column of their
    // own, its end the most runs': both laid from the box's right edge. One size as runs join, within 1 % of the size before)
    const B = docOf([{ lines: ['a paragraph whose word', 'continues on its last line'] }])
    const ins = instrumentOf(B, [unitOf('para', 'a paragraph whose word continues on its last line')], [[0, 0]])
    const A = docOf([
      {
        lines: [
          'a paragraph whose word',
          { text: 'The entry of the box indented here', x: 96, y: 640, size: 10.02, form: true },
          { text: 'and its lines go on to the measure end', x: 72, y: 628, form: true },
          { text: 'set in one block of its prose', x: 72, y: 616, form: true, space: 15 },
          { text: 'its lines set in one justified measure', x: 72, y: 604, size: 10.02, form: true },
          { text: 'its last one', x: 72, y: 592, form: true },
          { text: 'continues on its last line', y: 560 },
        ],
      },
    ])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    expect(L.members.filter((m) => m.figure).map((m) => [m.plain, m.align])).toEqual([
      ['The entry of the box indented here', 'l'],
      ['and its lines go on to the measure end', 'l'],
      ['set in one block of its prose', 'l'],
      ['its lines set in one justified measure', 'l'],
      ['its last one', 'l'],
    ])
  })

  it('keeps right-aligned labels set from their end where two of them, one text, share a start too', () => {
    // (the 88's figures read under a looser measure, any two runs of an end column sharing a start: 1,175 labels of 27 papers
    // turned to be set from their start: 2608.04322v1 p3's axis labels "GSM8K" "MATH" "HellaSwag", 2610.10492v1's two "Population
    // mean", 1810.04805v2's "[SEP]"s. Two runs of one text share both edges and tell no measure; a paragraph's full lines are of
    // different texts, its other lines inside its measure)
    const B = docOf([{ lines: ['a paragraph whose word', 'continues on its last line'] }])
    const ins = instrumentOf(B, [unitOf('para', 'a paragraph whose word continues on its last line')], [[0, 0]])
    const A = docOf([
      {
        lines: [
          'a paragraph whose word',
          { text: 'Population mean', x: 210, y: 640, form: true },
          { text: 'Accuracy', x: 252, y: 628, form: true },
          { text: 'Population mean', x: 210, y: 616, form: true },
          { text: 'Loss', x: 276, y: 604, form: true },
          { text: 'continues on its last line', y: 560 },
        ],
      },
    ])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    expect(L.members.filter((m) => m.figure).map((m) => [m.plain, m.align])).toEqual([
      ['Population mean', 'r'],
      ['Accuracy', 'r'],
      ['Population mean', 'r'],
      ['Loss', 'r'],
    ])
  })

  it('keeps right-aligned labels set from their end where their glyphs are as wide, whatever their texts', () => {
    // (2610.20808v1 p8's language codes "pt" "en" "es" "zh" "hi", as wide, share both edges; a shorter one starts inside them.
    // Lines of different texts as wide tell no measure: a justified paragraph's full lines are set to one width by the stretch of
    // their spaces, and these have none)
    const B = docOf([{ lines: ['a paragraph whose word', 'continues on its last line'] }])
    const ins = instrumentOf(B, [unitOf('para', 'a paragraph whose word continues on its last line')], [[0, 0]])
    const A = docOf([
      {
        lines: [
          'a paragraph whose word',
          { text: 'deu', x: 282, y: 640, form: true },
          { text: 'eng', x: 282, y: 628, form: true },
          { text: 'spa', x: 282, y: 616, form: true },
          { text: 'ja', x: 288, y: 604, form: true },
          { text: 'continues on its last line', y: 560 },
        ],
      },
    ])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    expect(L.members.filter((m) => m.figure).map((m) => [m.plain, m.align])).toEqual([
      ['deu', 'r'],
      ['eng', 'r'],
      ['spa', 'r'],
      ['ja', 'r'],
    ])
  })

  it('keeps right-aligned labels set from their end where two as wide hold other glyphs, their spaces as set', () => {
    // (2610.40394v1 p18's bar chart: "Ordinary Differential Equations" and "History & General Mathematics" start and end together,
    // the one more letters, the other more spaces, each word space as the face sets it (2.348 pt both, at 8.445 pt). A justified
    // paragraph's lines are stretched apart: 2411.13093v4 p18's full lines' word spaces run from 3.96 to 6.36 pt, its unjustified
    // lines' 3.90)
    const B = docOf([{ lines: ['a paragraph whose word', 'continues on its last line'] }])
    const ins = instrumentOf(B, [unitOf('para', 'a paragraph whose word continues on its last line')], [[0, 0]])
    const A = docOf([
      {
        lines: [
          'a paragraph whose word',
          { text: 'History of General Mathematics', x: 120, y: 640, form: true },
          { text: 'Ordinary Differential Equation', x: 120, y: 628, form: true },
          { text: 'Topology', x: 252, y: 616, form: true },
          { text: 'continues on its last line', y: 560 },
        ],
      },
    ])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    expect(L.members.filter((m) => m.figure).map((m) => [m.plain, m.align])).toEqual([
      ['History of General Mathematics', 'r'],
      ['Ordinary Differential Equation', 'r'],
      ['Topology', 'r'],
    ])
  })

  it('makes a figure’s text inside its form a figure text, where only A draws it', () => {
    const B = docOf([{ lines: ['a paragraph whose word', 'continues on its last line'] }])
    const ins = instrumentOf(B, [unitOf('para', 'a paragraph whose word continues on its last line')], [[0, 0]])
    const A = docOf([
      {
        lines: [
          'a paragraph whose word',
          { text: 'Loss', y: 640, form: true },
          { text: 'continues on its last line', y: 600 },
        ],
      },
    ])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const content = [text('Loss')]
    expect(L.units[1]).toMatchObject({
      id: unitId('inkfigures', content),
      kind: 'inkfigures',
      content,
      figure: { set: 0 },
    })
    const fig = L.members[1]!
    expect(fig).toMatchObject({ located: true, figure: true, fixed: false })
    // (where a translation of it may stand, as today's figure reading tells it, stated for S.figures: its origin and box along
    // its run, its anchor as its alignment, its room before and after as its side, its own text)
    const f = L.units[1]!.figure!
    expect(f.anchor).toBe('centre')
    expect(L.units[1]!.align).toBe('c')
    expect(f.y).toBe(640)
    expect([f.x, f.length, f.before, f.after].every((v) => typeof v === 'number' && Number.isFinite(v))).toBe(true)
    expect(fig.align).toBe('c')
    expect(fig.plain).toBe('Loss')
    const r2 = (v: number) => Math.round(v * 100) / 100
    expect(fig.room.side).toEqual([r2(f.x! - f.before!), r2(f.x! + f.length! + f.after!)])
    const at = 'a paragraph whose word'.length
    expect(fig.text).toEqual([at, at + 1, at + 2, at + 3])
    expect(L.figureGroups.has(`${fig.ord}.1.t`)).toBe(true)
    // (today's rule makes it: no unit is born of it)
    expect(L.born.size).toBe(0)
    expect(L.members[0]).toMatchObject({ located: true })
  })

  it('states a figure text’s style runs: a lead-in its glyphs set in its family’s bold a group, `must`, its style its glyphs’', () => {
    // (2608.25210v2 p2's "Data Extraction Task: Extract all …": the lead-in in HelveticaNeue-Bold, the rest in HelveticaNeue, one
    // run of today's figure reading (a family's faces); read as one style, the majority's, it was regular, the lead-in's weight
    // lost, with no run of the figure text's to carry it through a translation)
    const B = docOf([{ lines: ['a paragraph whose word', 'continues on its last line'] }])
    const ins = instrumentOf(B, [unitOf('para', 'a paragraph whose word continues on its last line')], [[0, 0]])
    const A = docOf([
      {
        lines: [
          'a paragraph whose word',
          { text: 'Task: list all the names', y: 640, form: true, font: 'ABCDEF+Helvetica' },
          { text: 'continues on its last line', y: 600 },
        ],
      },
    ])
    const at = 'a paragraph whose word'.length
    for (const g of A.pages[0]!.glyphs.slice(at, at + 4))
      Object.assign(g, { font: 'ABCDEF+Helvetica-Bold', base: 'Helvetica-Bold' })
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    // (the group the translator is given, a run-in label at the figure text's head before its colon: `must` by the run-in rule,
    // so that the markers wire brings its style back; no source, so neither `open` nor `close`)
    const content = [
      { t: 'span', id: '0', style: 'bold', must: 1, content: [text('Task')] },
      text(': list all the names'),
    ]
    expect(L.units[1]!.content).toEqual(content)
    expect(L.units[1]!.id).toBe(unitId('inkfigures', content as never))
    const fig = L.members[1]!
    // (its own style the majority's, regular; the run's its own glyphs', stated for the part's span)
    expect(fig.style).toMatchObject({ role: 'sans', design: 'Helvetica' })
    expect(fig.style.bold).toBeUndefined()
    expect(fig.spanStyles).toEqual([['0', { role: 'sans', size: 10, bold: 1, design: 'Helvetica-Bold' }]])
    expect(fig.plain).toBe('Task: list all the names')
    // (the part states the run's style as its span's: SpanAt.style)
    const addOn = {
      bytes: new Uint8Array([1, 2, 3]),
      pages: new Map([[1, { ok: true }]]),
      groups: new Set(L.groups[0]!.glyphs.filter((g): g is string => g !== null)),
      ocgs: new Map(),
      lost: new Set(),
      stats: {},
    } as unknown as AddOn
    const part = [
      ...bundle({
        ins,
        located: L,
        addOn,
        original: new Uint8Array(10),
        paper: { id: '2501.00001', version: 1, pages: 1 },
        made: 'test',
      }),
    ].find((x) => x.kind === 'part')!
    const placed = read('part', part.bytes, part.digest)
      .flows.flat()
      .find((m) => m.kind === 'figure')!
    expect(placed.spans).toEqual([['0', { style: { role: 'sans', size: 10, bold: 1, design: 'Helvetica-Bold' } }]])
    expect(placed.plain).toBe('Task: list all the names')
  })

  it('states a figure text’s runs by face and by fill: TeX’s line in a picture, a label and its address in the link’s colour, the label a group whose fill it states (2611.03178v1)', () => {
    // (the class's tcolorbox, which pgf draws: "Page:" in \sffamily\bfseries, black, then \texttt's address in the link's colour,
    // TeX's one line: one figure text, its own style the address's (most of its glyphs), the label a group in its face and its
    // black, which its own style (the address's colour) would draw otherwise)
    const at = 'a paragraph whose word'.length
    const docWith = (marks: boolean): Doc => {
      const d = docOf([
        {
          lines: [
            'a paragraph whose word',
            { text: 'Page: site.io', y: 640 },
            { text: 'continues on its last line', y: 600 },
          ],
        },
      ])
      const pg = d.pages[0]!
      pg.glyphs.slice(at, at + 13).forEach((g, j) => {
        const f = j < 6 ? 'LMSans10-Bold' : 'LMMono10-Regular'
        Object.assign(g, { font: `ABCDEF+${f}`, base: f, fill: j < 6 ? 0 : 0x315f9c })
      })
      if (marks)
        pg.marks = {
          paras: [],
          paraEnds: [],
          regions: [],
          pictures: [
            { name: 'zs', glyph: at, box: 0 },
            { name: 'ze', glyph: at + 13, box: 0 },
          ],
        }
      return d
    }
    const B = docWith(true)
    const A = docWith(false)
    const ins = instrumentOf(B, [unitOf('para', 'a paragraph whose word continues on its last line')], [[0, -1, 0]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    expect(L.units[1]!.kind).toBe('inkfigures')
    expect(L.units[1]!.content).toEqual([
      expect.objectContaining({ t: 'span', id: '0', style: 'sans-bold', content: [text('Page:')] }),
      text(' site.io'),
    ])
    const fig = L.members[1]!
    expect(fig.style).toMatchObject({ role: 'mono', fill: 0x315f9c })
    expect(fig.spanStyles).toEqual([['0', expect.objectContaining({ role: 'sans', bold: 1, fill: 0 })]])
    expect(fig.plain).toBe('Page: site.io')
  })

  it('ends TeX’s line in a picture where it goes into or out of a face of one pitch: a title’s path its own figure text, kept (Rule 1)', () => {
    // (2610.19159v1's transcript box titles, pgf's: "Agent Action: Write" in a proportional face, the path written in typewriter,
    // then "(Self-directed scope reduction)": TeX's line went on over the faces and made one figure text of them, a title,
    // translated with its path inside. The owner's ruling of 2026-11-10 keeps text set in a face of one pitch: the line goes on
    // over faces and colours, but not into or out of a face of one pitch, read off the glyphs as Rule 1 reads it)
    const line = 'Action: Write /tmp/f_a.py (scope cut)'
    const at = 'a paragraph whose word'.length
    const path = [line.indexOf('/'), line.indexOf('py') + 2]
    const docWith = (marks: boolean, body: string): Doc => {
      const d = docOf([
        {
          lines: [
            { text: 'a paragraph whose word', font: body },
            { text: line, y: 640 },
            { text: 'continues on its last line', y: 600, font: body },
          ],
        },
      ])
      const pg = d.pages[0]!
      pg.glyphs.slice(at, at + line.length).forEach((g, j) => {
        const f = j >= path[0]! && j < path[1]! ? 'LMMono10-Regular' : 'LMSans10-Bold'
        Object.assign(g, { font: `ABCDEF+${f}`, base: f })
      })
      // (a proportional face's characters each their own advance; the typewriter's one)
      for (const g of pg.glyphs)
        if (!g.font.endsWith('Mono10-Regular') && !g.font.endsWith('CMTT10') && !g.blank)
          g.x1 = g.x0 + (0.55 + (g.u.codePointAt(0)! % 3) * 0.05) * g.size
      if (marks)
        pg.marks = {
          paras: [],
          paraEnds: [],
          regions: [],
          pictures: [
            { name: 'zs', glyph: at, box: 0 },
            { name: 'ze', glyph: at + line.length, box: 0 },
          ],
        }
      return d
    }
    const figuresOf = (body: string) => {
      const B = docWith(true, body)
      const A = docWith(false, body)
      const ins = instrumentOf(B, [unitOf('para', 'a paragraph whose word continues on its last line')], [[0, -1, 0]])
      const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
      return L.members.filter((m) => m.figure && m.unit >= 0).map((m) => [m.plain, m.fixed, !!L.units[m.unit]!.pitch])
    }
    expect(figuresOf('ABCDEF+CMR10')).toEqual([
      ['Action: Write', false, false],
      ['/tmp/f_a.py', true, true],
      ['(scope cut)', false, false],
    ])
    // (a paper whose body face is of one pitch: Rule 1 keeps nothing, and TeX's line goes on as before)
    expect(figuresOf('ABCDEF+CMTT10')).toEqual([[line, false, false]])
  })

  it('makes no group of a figure text set in one face, and a group of each run its glyphs set apart from its own style', () => {
    const B = docOf([{ lines: ['a paragraph whose word', 'continues on its last line'] }])
    const ins = instrumentOf(B, [unitOf('para', 'a paragraph whose word continues on its last line')], [[0, 0]])
    const figureOf = (fonts: string[]) => {
      const A = docOf([
        {
          lines: [
            'a paragraph whose word',
            { text: 'Ab cd ef', y: 640, form: true, font: 'ABCDEF+Helvetica' },
            { text: 'continues on its last line', y: 600 },
          ],
        },
      ])
      const at = 'a paragraph whose word'.length
      A.pages[0]!.glyphs.slice(at, at + 8).forEach((g, j) => {
        const f = fonts[j] || 'Helvetica'
        Object.assign(g, { font: `ABCDEF+${f}`, base: f })
      })
      const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
      return { content: L.units[1]!.content, member: L.members[1]! }
    }
    // (one face: one text, today's unit and id)
    expect(figureOf([]).content).toEqual([text('Ab cd ef')])
    // (an oblique word inside it, a space either side its own style's: its group the word alone, `italic`, inside a sentence no
    // label, never `must`)
    const mid = figureOf(['', '', '', 'Helvetica-Oblique', 'Helvetica-Oblique'])
    expect(mid.content).toEqual([
      text('Ab '),
      { t: 'span', id: '1', style: 'italic', content: [text('cd')] },
      text(' ef'),
    ])
    expect(mid.member.spanStyles).toEqual([['1', expect.objectContaining({ slant: 1, design: 'Helvetica-Oblique' })]])
    // (most of it bold: its own style bold, its group the run set regular, `medium` (LaTeX's \textmd))
    const bold = 'Helvetica-Bold'
    const most = figureOf([bold, bold, bold, bold, bold, bold, 'Helvetica', 'Helvetica'])
    expect(most.member.style.bold).toBe(1)
    expect(most.content).toEqual([text('Ab cd '), { t: 'span', id: '1', style: 'medium', content: [text('ef')] }])
    expect(most.member.spanStyles).toEqual([['1', expect.not.objectContaining({ bold: 1 })]])
    // (as many glyphs either way: its own style the one its style's vote takes (styleOf, the first to the most), the other the
    // group's: the text outside its groups always in its own style)
    // ("Ab c" bold, "d ef" regular: three letters each, the bold first to three)
    const tie = figureOf([bold, bold, '', bold])
    expect(tie.member.style.bold).toBe(1)
    expect(tie.content).toEqual([text('Ab c'), { t: 'span', id: '1', style: 'medium', content: [text('d ef')] }])
  })

  it('echoes a heading a contents line repeats: the heading’s pieces, its index the echo', () => {
    const { B, A } = pair({
      lines: ['1 Method . . . 2', { text: 'Method', y: 600 }],
      points: [
        ['bs1', 0],
        ['n0.contents.e', 0],
        ['0s', 16],
        ['be1', 22],
      ],
    })
    const heading = unitOf('heading', 'Method')
    const ins = instrumentOf(B, [heading], [[-1, 0]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    expect(L.units[1]).toMatchObject({ id: unitId('inkcontents', heading.content), content: heading.content, echo: 0 })
    // (its groups' commands and link targets the heading's, read from the source as the heading's are; no fill of the log's)
    const linked: InstrumentUnit = {
      ...heading,
      spans: [['0', { cmd: 'href', colour: 0xff, to: { url: 'https://example.org/' } }]],
    }
    const E = locate(instrumentOf(B, [linked], [[-1, 0]]), A, align(B, A), { pages: rawOf(A) })
    expect(E.units[1]!.spans).toEqual([['0', { cmd: 'href', to: { url: 'https://example.org/' } }]])
  })
  it('states an ink unit’s link groups’ targets from their opens, as the adapter states a source unit’s (linkTargetOf)', () => {
    expect(
      spansOf([
        { t: 'open', src: '\\href{https://example.org/a\\_b}{' },
        { t: 'text', s: 'x' },
        { t: 'close', src: '}' },
        { t: 'open', src: '\\hyperlink{intro}{' },
        { t: 'close', src: '}' },
        { t: 'open', src: '\\emph{' },
      ]),
    ).toEqual([
      ['0', { cmd: 'href', to: { url: 'https://example.org/a_b' } }],
      ['3', { cmd: 'hyperlink', to: { dest: '"intro"' } }],
      ['5', { cmd: 'emph' }],
    ])
  })
  it('states an ink unit’s colour group’s fill, as a source unit’s colour group states the fill TeX set its run in', () => {
    // (2609.36054v2 p1's note: its e-mails grey, in the groups rule 9 opens from their glyphs' fill; with no `colour` the
    // typesetter drew them in the note's black. An ink unit has no log: its group's source names the fill in xcolor's HTML model)
    expect(
      spansOf([
        { t: 'text', s: 'Correspondence to: ' },
        { t: 'open', src: '\\textcolor[HTML]{7A7F80}{' },
        { t: 'text', s: 'a.b@example.org' },
        { t: 'close', src: '}' },
        { t: 'open', src: '\\textbf{' },
        { t: 'close', src: '}' },
      ]),
    ).toEqual([
      ['1', { cmd: 'textcolor', colour: 0x7a7f80 }],
      ['4', { cmd: 'textbf' }],
    ])
    // (made on A: the glyphs' own fill, the unit's group of it, its span's colour)
    const { B, A } = pair({
      lines: ['Body text here', 'Mail to alan at example now'],
      points: [
        ['bs1', 0],
        ['be1', 14 + 27],
      ],
    })
    for (const g of A.pages[0]!.glyphs) if (g.n === 1 && g.k >= 14 + 8 && g.k < 14 + 12) g.fill = 0x7a7f80
    const L = locate(instrumentOf(B, [unitOf('para', 'Body text here')], [[0, -1]]), A, align(B, A), {
      pages: rawOf(A),
    })
    const note = L.units[L.members.find((m) => m.kind === 'inkorphan')!.unit]!
    expect(note.spans).toEqual([['1', { cmd: 'textcolor', colour: 0x7a7f80 }]])
  })
  it('states an ink unit’s leading mark as its label, as a source unit’s: its glyphs the label’s group, none its text’s', () => {
    // (2610.22065v1 p1: an affiliation the class prints from its own lists, no source unit's, its raised "2" read as the unit's
    // label and left out of its text (today/ink-units.mjs labelLength), but its glyph left in the unit's text group: erased with
    // the translated text, and drawn by nobody, the part stating no label)
    const { B, A } = pair({
      lines: [
        'Body text here',
        { text: '2', x: 72, y: 691.8, size: 6 },
        { text: 'Department of Physics', x: 76, y: 688 },
      ],
      points: [
        ['bs1', 0],
        ['be1', 14 + 1 + 21],
      ],
    })
    const L = locate(instrumentOf(B, [unitOf('para', 'Body text here')], [[0, -1, -1]]), A, align(B, A), {
      pages: rawOf(A),
    })
    const note = L.members.find((m) => m.kind === 'inkorphan')!
    expect(L.units[note.unit]!.content).toEqual([text('Department of Physics')])
    const mark = 14
    expect(note.label).toEqual([mark])
    expect(note.text).not.toContain(mark)
    expect(L.groups[0]!.glyphs[mark]).toBe(`${note.ord}.1.l`)
    expect(L.groups[0]!.glyphs[mark + 1]).toBe(`${note.ord}.1.t`)
    // (its label's ink and the line it stands on, its text's line from the text on, as a source unit's label is stated)
    expect(note.labelAt).toMatchObject({ kind: 'number', ink: [1, 72, 690.6, 75.6, 696, 691.8], line: 0 })
    expect(note.lines[0]![2]).toBe(76)
  })

  it('keeps a script TeX set in a text face an element of its ink unit in its own ink, as a formula’s run, never its text', () => {
    // (2610.30854v1 p1's names, no source unit's: `Lifan Jiang$^{1,2}$` under Times sets the marks' digits in the text face, 8.11
    // pt and 3.98 over the names' 10.96 pt baseline. Read as the unit's text, the marks were drawn flat at the names' size in the
    // translation ("Jiang1,2"). TeX set them smaller than the line's text and off its baseline, a script whatever its face: each
    // run an element drawn as its ink. An address after a mark is its own run, the mark no character of it)
    const { B, A } = pair({
      lines: [
        'Body text here',
        { text: 'Lifan Jiang', x: 72, y: 688 },
        { text: '1,2', x: 138, y: 691.6, size: 7 },
        { text: ', Yibo Zhao', x: 150.6, y: 688 },
        { text: '2', x: 216.6, y: 691.6, size: 7 },
        { text: 'Mail: ', x: 72, y: 640 },
        { text: '1', x: 108, y: 643.6, size: 7 },
        { text: 'alan.chan@example.org', x: 112.2, y: 640 },
      ],
      points: [
        ['bs1', 0],
        ['be1', 14 + 11 + 3 + 11 + 1 + 6 + 1 + 21],
      ],
    })
    const L = locate(
      instrumentOf(B, [unitOf('para', 'Body text here')], [[0, -1, -1, -1, -1, -1, -1, -1]]),
      A,
      align(B, A),
      { pages: rawOf(A) },
    )
    const made = L.members.filter((m) => m.unit >= 0 && L.units[m.unit]!.kind.startsWith('ink'))
    const said = made.map((m) =>
      L.units[m.unit]!.content.map((p) => (p.t === 'text' ? p.s : p.t === 'el' ? [p.kind, p.src] : p.t)),
    )
    // (each run of scripts written as TeX writes a script, so that every reader of the source reads it as a source unit's mark)
    expect(said).toEqual([
      ['Lifan Jiang', ['math', '$^{1,2}$'], ', Yibo Zhao', ['math', '$^{2}$']],
      ['Mail: ', ['math', '$^{1}$'], ['url', '\\url{alan.chan@example.org}']],
    ])
    const names = made[0]!
    const g = A.pages[0]!.glyphs
    const els = new Map(names.elements)
    for (const [id, a, b] of [
      ['1', 25, 27],
      ['3', 39, 39],
    ] as const) {
      expect(els.get(id)!.ink).toHaveLength(1)
      // (on the engine's hundredth of a point)
      const h = (v: number) => Math.round(v * 100) / 100
      expect(els.get(id)!.ink[0]!.slice(0, 5)).toEqual([1, h(g[a]!.x0), h(g[a]!.bottom), h(g[b]!.x1), h(g[b]!.top)])
      expect(els.get(id)!.text).toBeUndefined()
    }
    for (const a of [25, 26, 27, 39]) expect(names.text).not.toContain(a)
    expect(names.text).toContain(24)
  })

  it('leaves a unit made on A the original’s where A sets text inside it our compile does not: a content difference', () => {
    // (2610.21084v1's e-mail block: arXiv's page sets the initials our compile does not; the unit made on A is A's text, and it
    // stays the original's, as a source unit whose glyphs differ does: the coordinator's call of 2026-11-07)
    const B = docOf([
      {
        lines: ['Running Title', 'Body text here'],
        points: [
          ['bs1', 13],
          ['be1', 27],
        ],
      },
    ])
    const A = docOf([{ lines: ['Running XY Title', 'Body text here'] }])
    const ins = instrumentOf(B, [unitOf('para', 'Body text here')], [[-1, 0]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const head = L.members.find((m) => m.kind === 'inkheads')!
    expect(L.units[head.unit]!.id).toBe(unitId('inkheads', [text('Running XY Title')]))
    expect(head).toMatchObject({ located: false, cause: 'content difference: aonly' })
    // (its glyphs A's ink, in no group; no unit born of the initials)
    expect(L.groups[0]!.glyphs.slice(0, 16).every((g) => g === null)).toBe(true)
    expect(L.born.size).toBe(0)
  })

  it('flows a source unit on from the unit made on A that TeX set before it on its first line (a theorem head no unit owns)', () => {
    // (2608.25210v2 p4: amsthm's head "Definition 2. Minimal Provenance." no source unit owns, made on A an orphan, and the
    // theorem's text after it on the row: one flow, the theorem's join its separation from the head, as for two source units)
    const { B, A } = pair({
      lines: [
        'Body text here',
        { text: 'Definition 2.', x: 72, y: 688 },
        { text: 'A thing is so', x: 155, y: 688 },
        { text: 'and runs on', y: 676 },
      ],
      points: [
        ['bs1', 0],
        ['be1', 14 + 13 + 13 + 11],
      ],
    })
    const ins = instrumentOf(
      B,
      [unitOf('para', 'Body text here'), unitOf('theorem', 'A thing is so and runs on')],
      [[0, -1, 1, 1]],
    )
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const head = L.members.find((m) => m.kind === 'inkorphan')!
    expect(L.units[head.unit]!.content).toEqual([text('Definition 2.')])
    const thm = L.members[1]!
    expect(L.flows.find((f) => f.includes(thm.ord))).toEqual([head.ord, thm.ord])
    expect(thm.join).toEqual([155 - (72 + 13 * 6)])
    // (the flows in the members' order, each at its first member's: the source units' as before, the head's with its theorem's)
    expect(L.flows).toEqual([[0], [head.ord, thm.ord]])
  })
  it('flows a unit made on A on from the member TeX set right before it on its row, no member after it on the page (2610.22065v1)', () => {
    // (acmart's reference format: its last author's name, a unit of \author's that TeX sets late in the stream, then
    // ". 2027. ABNAT: …", the title set again, no unit's, made on A an orphan, on the name's row; no member begins after it on the
    // page. Standing where it was made, after every member, its member before was the last of the units' order, on another
    // row: a flow of its own, laid at its original's start, a gap before it where the name's translation is the shorter)
    const { B, A } = pair({
      lines: [
        'Body text here',
        { text: 'Ru Huang.', x: 72, y: 688 },
        { text: '2027. ABNAT', x: 72 + 9 * 6 + 2, y: 688 },
      ],
      points: [
        ['bs1', 0],
        ['be1', 14 + 9 + 11],
      ],
    })
    // (the name's unit first in the units' order, the paragraph's after it, as \author's units precede the body's)
    const ins = instrumentOf(B, [unitOf('author', 'Ru Huang.'), unitOf('para', 'Body text here')], [[1, 0, -1]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const tail = L.members.find((m) => m.kind === 'inkorphan')!
    expect(L.units[tail.unit]!.content).toEqual([text('2027. ABNAT')])
    expect(L.flows.find((f) => f.includes(tail.ord))).toEqual([0, tail.ord])
    expect(tail.join).toEqual([2])
  })
  it('flows no unit made on A into the next where a paragraph end of TeX’s stands between them, nor one on another row', () => {
    const spec = (y: number) => ({
      lines: [
        'Body text here',
        { text: 'Definition 2.', x: 72, y: 688 },
        { text: 'A thing is so', x: 155, y },
        { text: 'and runs on', y: y - 12 },
      ],
      points: [
        ['bs1', 0],
        ['be1', 14 + 13 + 13 + 11],
      ] as [string, number][],
    })
    const own = [[0, -1, 1, 1]]
    const units2 = [unitOf('para', 'Body text here'), unitOf('theorem', 'A thing is so and runs on')]
    const below = pair(spec(676))
    const L = locate(instrumentOf(below.B, units2, own), below.A, align(below.B, below.A), { pages: rawOf(below.A) })
    expect(L.members[1]!.join).toBeUndefined()
    expect(L.flows.find((f) => f.includes(1))).toEqual([1])
    const row = pair(spec(688))
    const ins2 = instrumentOf(row.B, units2, own)
    ins2.tex = { paragraphEnds: [[14 + 13]] }
    const E = locate(ins2, row.A, align(row.B, row.A), { pages: rawOf(row.A) })
    expect(E.members[1]!.join).toBeUndefined()
    expect(E.flows.find((f) => f.includes(1))).toEqual([1])
  })

  it('makes the ink TeX sets in the author block under the title its names, whatever unit it echoes (2610.22065v1 p1)', () => {
    // (acmart's \@mkauthors@iii overridden by the paper: its names, places and notes literal lines no unit is, set between the
    // title and the abstract; an orphan's ink and a note's before. And a venue line before the title: not the block's)
    const lines = [
      'Venue line here',
      'A Title',
      'Ann Lee',
      'Dept of Physics, Some University',
      'Equal contribution',
      'Abstract text here',
      'Body text here',
    ]
    const { B, A } = pair({
      lines,
      points: [
        ['bs1', 0],
        ['be1', lines.join('').length],
      ],
    })
    const title = { ...unitOf('heading', 'A Title'), title: true as const, front: true as const }
    const units = [
      title,
      unitOf('author', 'Ann Lee'),
      unitOf('abstract', 'Abstract text here'),
      unitOf('para', 'Body text here'),
    ]
    const ins = instrumentOf(B, units, [[-1, 0, 1, -1, -1, 2, 3]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const made = L.members.filter((m) => m.unit >= units.length)
    const textOf = (m: (typeof made)[number]) =>
      L.units[m.unit]!.content.map((p) => (p.t === 'text' ? p.s : '')).join('')
    const block = made.filter((m) => /Dept|Equal/.test(textOf(m)))
    expect(block.length).toBeGreaterThan(0)
    expect(block.every((m) => m.kind === 'inknames')).toBe(true)
    expect(made.find((m) => /Venue/.test(textOf(m)))!.kind).toBe('inkorphan')
    expect(L.members[1]!.kind).toBe('author')
  })

  it('ends the author block where TeX begins the abstract environment, its literal heading no line of the block (2610.20967v1)', () => {
    // (spconf's \abstract sets "ABSTRACT" itself, no babel name: the marked compile's point `fm<n>` at the start of the paragraph
    // the environment begins, on B, kept apart from the marks' points (DocMarks `fronts`), carried onto A before the heading's
    // first glyph)
    const text = ['A Title', 'Ann Lee', 'Some University', 'ABSTRACT', 'Abstract text here', 'Body text here']
    const at = (k: number) => text.slice(0, k).join('').length
    // (the heading set apart under the block, as the environment's skip sets it)
    const lines = text.map((t, i) => (i < 3 ? t : { text: t, y: 700 - 12 * i - 24 }))
    const { B, A } = pair({
      lines,
      points: [
        ['bs1', 0],
        ['be1', text.join('').length],
      ],
    })
    B.pages[0]!.marks = {
      paras: [],
      paraEnds: [],
      regions: [],
      pictures: [],
      fronts: [{ name: 'fm1', glyph: at(3), box: 0 }],
    }
    const title = { ...unitOf('heading', 'A Title'), title: true as const, front: true as const }
    const units = [
      title,
      unitOf('author', 'Ann Lee'),
      unitOf('abstract', 'Abstract text here'),
      unitOf('para', 'Body text here'),
    ]
    const ins = instrumentOf(B, units, [[0, 1, -1, -1, 2, 3]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const made = L.members.filter((m) => m.unit >= units.length)
    const textOf = (m: (typeof made)[number]) =>
      L.units[m.unit]!.content.map((p) => (p.t === 'text' ? p.s : '')).join('')
    expect(made.find((m) => /University/.test(textOf(m)))!.kind).toBe('inknames')
    expect(made.find((m) => /ABSTRACT/.test(textOf(m)))!.kind).not.toBe('inknames')
  })

  it('leaves what a class prints from the author data away from the block the text it is (acmart’s reference format)', () => {
    // (2610.22065v1 p1: its \author units, set nowhere else, set in the reference format after the abstract, with "and" between
    // two of them; and a name a class prints again there, no unit's, that echoes the block's own unit: neither the names toggle's)
    const Y = 640
    const lines = [
      'A Title',
      'Ann Lee',
      'Abstract text here',
      { text: 'Kechao Tang', x: 72, y: Y },
      { text: 'and', x: 72 + 12 * 6, y: Y },
      { text: 'Ru Huang', x: 72 + 16 * 6, y: Y },
      { text: '2027. A Title', x: 72 + 25 * 6, y: Y },
      { text: 'Ann Lee', x: 72, y: Y - 12 },
    ]
    const n = ['A Title', 'Ann Lee', 'Abstract text here', 'Kechao Tang', 'and', 'Ru Huang', '2027. A Title', 'Ann Lee']
    const { B, A } = pair({
      lines,
      points: [
        ['bs1', 0],
        ['be1', n.join('').length],
      ],
    })
    const title = { ...unitOf('heading', 'A Title'), title: true as const, front: true as const }
    const units = [
      title,
      unitOf('author', 'Ann Lee'),
      unitOf('abstract', 'Abstract text here'),
      unitOf('author', 'Kechao Tang'),
      unitOf('author', 'Ru Huang'),
    ]
    const ins = instrumentOf(B, units, [[0, 1, 2, 3, -1, 4, -1, -1]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    expect(L.members[1]!.kind).toBe('author')
    expect(L.members[3]!.kind).toBe('textnames')
    expect(L.members[4]!.kind).toBe('textnames')
    const made = L.members.filter((m) => m.unit >= units.length)
    expect(made.length).toBeGreaterThan(0)
    expect(made.some((m) => m.kind === 'inknames')).toBe(false)
  })

  it('reads a glyph as an included figure’s where its partner on B is one, A’s form flattened', () => {
    const B = docOf([{ lines: ['a paragraph', { text: 'Loss', y: 640, form: true }] }])
    const A = docOf([{ lines: ['a paragraph', { text: 'Loss', y: 640 }] }])
    const ins = instrumentOf(B, [unitOf('para', 'a paragraph')], [[0, -1]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    expect(L.units[1]).toMatchObject({ kind: 'inkfigures', content: [text('Loss')] })
  })
})

describe('carry: B’s marks onto A’s stream', () => {
  it('stands a point before its glyph’s partner on A, A’s own glyphs before it counted', () => {
    const B = docOf([{ lines: ['abc def'], points: [['q1', 4]] }])
    const A = docOf([{ lines: ['xyz abc def'] }])
    B.pages[0]!.marks = { paras: [{ name: 'q1', glyph: 4, box: 0 }], paraEnds: [], regions: [], pictures: [] }
    const m = align(B, A)
    const pageA = new Int32Array(A.pages[0]!.glyphs.length).fill(1)
    const [c] = carry(B, A, m, pageA)
    expect(c!.points).toEqual([{ name: 'q1', glyph: 8, box: 0 }])
    expect(c!.paras).toEqual([{ name: 'q1', glyph: 8, box: 0 }])
  })

  it('keeps a picture’s end after the label it sets turned, its points at one glyph count (the label’s boxes its glyphs’)', () => {
    // (2610.21880v1 p5: a TikZ picture after the page's last level glyph holds an axis line and a y-axis title set turned; the
    // picture's two points stand at one glyph count, so its box count alone says which side of them the title stands. A turned
    // glyph's own box has no box partner on A, the alignment pairing the glyph instead: its partner's box is its box's)
    const docWith = (points: boolean): Doc => {
      const d = docOf([
        {
          lines: ['a caption'],
          boxes: [[9, 0, 50, 380, 52, 440]],
          ...(points
            ? {
                points: [
                  ['zs', 9],
                  ['ze', 9],
                ],
              }
            : {}),
        },
      ])
      const pg = d.pages[0]!
      for (let j = 0; j < 4; j++) {
        pg.boxes.push(40, 400 + 6 * j, 47, 406 + 6 * j)
        pg.kinds.push(-4)
      }
      pg.turned = [...'Loss'].map((u, j) => ({
        u,
        code: u.codePointAt(0) as number,
        base: 'CMR10',
        n: 1,
        k: j,
        at: 9,
        box: 1 + j,
        ox: 45,
        oy: 400 + 6 * j,
        ex: 45,
        ey: 406 + 6 * j,
        ux: 0,
        uy: 1,
        size: 10,
        ascent: 0.7,
        descent: -0.2,
        form: false,
      }))
      // (the picture opens before its axis and closes after its title: zs at no box yet, ze after the title's four)
      if (points)
        pg.marks = {
          paras: [],
          paraEnds: [],
          regions: [],
          pictures: [
            { name: 'zs', glyph: 9, box: 0 },
            { name: 'ze', glyph: 9, box: 5 },
          ],
        }
      return d
    }
    const B = docWith(true)
    const A = docWith(false)
    const m = align(B, A)
    const pageA = new Int32Array(A.pages[0]!.glyphs.length).fill(1)
    const [c] = carry(B, A, m, pageA)
    expect(c!.pictures).toEqual([
      { name: 'zs', glyph: 9, box: 0 },
      { name: 'ze', glyph: 9, box: 5 },
    ])
  })
})

describe("locate takes A's raw pages (lane mem-back)", () => {
  // (each page's figure paths, `shapes`, are read by its figure texts alone, and the raw pages by the ink step alone: locate lets
  // a page's shapes go once its figure texts are read, and every raw page once the ink units are made, so that the rest of locate,
  // the wrap and the bundle run without them: 61 MiB of shapes and 61 of raw glyphs on 2609.19644v1)
  it('lets each raw page go once its ink is made, and makes what it made with them held', () => {
    const { B, A } = pair({
      lines: ['Running Title', 'Body text here'],
      points: [
        ['bs1', 13],
        ['be1', 27],
      ],
    })
    const ins = instrumentOf(B, [unitOf('para', 'Body text here')], [[-1, 0]])
    const held = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const raws: (PageInk | null)[] = rawOf(A)
    const taken = locate(ins, A, align(B, A), { pages: raws, take: true })
    expect(raws).toEqual([null])
    expect(taken.units).toEqual(held.units)
    expect(taken.members).toEqual(held.members)
    expect(taken.groups).toEqual(held.groups)
  })
})
