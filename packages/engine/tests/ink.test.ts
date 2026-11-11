// The units no source unit is, made by locate on arXiv's page by today's rule (src/locate/ink.ts): ink units, kept blocks and
// figure texts from A's glyphs no source unit owns, B's marks carried onto A.
import { type Piece, read, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import { pageGlyphsOf } from '../src/glyph.ts'
import { bundle } from '../src/bundle/bundle.ts'
import type { Doc, DocTurned } from '../src/doc.ts'
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
/** our final pass of a page arXiv's A sets: A's own ink, our compile including each figure as arXiv's does (its text has its
 *  partners on B, no source unit's), each line no form shows owned by the units' first, or as `own` says (`own[p][line]`) */
function finalOf(A: Doc, units: InstrumentUnit[], own?: number[][]): { B: Doc; ins: Instrument } {
  const B = structuredClone(A)
  const rows =
    own ??
    B.pages.map((pg) => {
      const row: number[] = []
      for (const g of pg.glyphs) row[g.n] = g.form ? -1 : 0
      return row
    })
  return { B, ins: instrumentOf(B, units, rows) }
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
        turned: (pg.turned ?? []).map((t) => ({ ...t })),
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
/** a run set a quarter turned up the page from (x, y), each glyph 6 pt along it, after the page's `at` level glyphs (pageInk's
 *  `turned`): a figure's y-axis title, arXiv's margin stamp */
const turnedRun = (s: string, x: number, y: number, at: number, form: boolean): DocTurned[] =>
  [...s].map((u, j) => ({
    u,
    code: u.codePointAt(0) as number,
    base: 'NimbusRoman-Regular',
    n: 9,
    k: j,
    at,
    box: -1,
    ox: x,
    oy: y + 6 * j,
    ex: x,
    ey: y + 6 * j + 6,
    ux: 0,
    uy: 1,
    size: 10,
    ascent: 0.7,
    descent: -0.2,
    form,
  }))
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
      const A = docOf([
        {
          lines: [
            ...lines(body),
            { text: 'request = {', y: 640, form: true, font: 'ABCDEF+CMTT10' },
            { text: 'Loss curve', y: 620, form: true, font: 'ABCDEF+CMR10' },
          ],
        },
      ])
      const B = structuredClone(A)
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

  it('makes a group of a unit set wholly in a face of one pitch one element, the original’s ink, its lines kept where TeX set them on lines of their own (Rule 1 by group)', () => {
    // (2608.25210v2 p3: the paper's `\mypython{…}` box, a framed `\ttfamily` prompt, shares a unit with its lead line where the
    // source has no blank line between them, and was translated, where p2's same box, a unit of its own, is kept (Rule 1 reads
    // a whole unit). The rule read per group, F0's for a figure's line in body text: a group whose every glyph is set in a face
    // of one pitch is an element `code`, never sent, its glyphs its ink; the rest of the unit translated. TeX set the box as a
    // vertical box of its own, on lines no other text of the unit shares: its lines stay where TeX set them, KEPT, as a
    // display's rows (its own measure and frame). A typewriter word inside a sentence is an element on its line, drawn as its
    // ink, F0's `code`; a group holding no text of its own (a colour around an identifier element) is left as it is)
    const R = 'ABCDEF+CMR10',
      TT = 'ABCDEF+CMTT10'
    const spec: PageSpec = {
      lines: [
        { text: 'Body text of the paper set here', font: R, y: 700 },
        { text: 'the prompt reads as follows.', font: R, y: 688 },
        { text: 'Answer True or False: yes', font: TT, x: 80, y: 676 },
        { text: 'Sentence 1: [s].', font: TT, x: 80, y: 664 },
        { text: 'we call ', font: R, y: 652 },
        { text: 'lookup', font: TT, x: 72 + 8 * 6, y: 652 },
        { text: ' here now', font: R, x: 72 + 14 * 6, y: 652 },
      ],
    }
    const B = docOf([spec])
    const A = docOf([spec])
    for (const D of [A, B])
      for (const g of D.pages[0]!.glyphs)
        if (g.font === R && !g.blank) g.x1 = g.x0 + (0.3 + ((g.u.codePointAt(0)! * 7) % 11) / 25) * g.size
    const span = (id: string, open: string, content: Piece[], style = 'other'): Piece => ({
      t: 'span',
      id,
      style,
      open,
      close: '}',
      content,
    })
    const unit = (content: Piece[]): InstrumentUnit => ({ id: unitId('para', content), kind: 'para', content })
    const units = [
      unitOf('para', 'Body text of the paper set here'),
      unit([
        text('the prompt reads as follows. '),
        span('1', '\\mypython{', [text('Answer True or False: yes Sentence 1: [s].')]),
      ]),
      unit([text('we call '), span('1', '\\texttt{', [text('lookup')], 'mono'), text(' here now')]),
    ]
    const L = locate(instrumentOf(B, units, [[0, 1, 1, 1, 2, 2, 2]]), A, align(B, A), { pages: rawOf(A) })
    // (the box: one element, the group's source its identity, kept by its pitch; its lines KEPT, as a display's rows)
    const box = L.units[1]!
    const boxEl = { t: 'el', id: '1', kind: 'code', src: '\\mypython{Answer True or False: yes Sentence 1: [s].}' }
    expect(box.content).toEqual([text('the prompt reads as follows. '), boxEl])
    expect(box.id).toBe(unitId('para', box.content))
    expect(box.kept).toBeUndefined()
    expect(box.keptEls).toEqual([['1', 'pitch']])
    expect(new Map(box.classes).get('1')).toMatchObject({ cls: 'display' })
    const boxMem = L.members.find((m) => m.unit === 1)!
    expect(boxMem.id).toBe(box.id)
    expect(boxMem.lines.map((l) => [l[2], l[4], l[9] & 1])).toEqual([
      [72, 688, 0],
      [80, 676, 1],
      [80, 664, 1],
    ])
    const boxInk = new Map(boxMem.elements).get('1')!
    expect(boxInk.ink.map((k) => k[5])).toEqual([676, 664])
    expect(boxInk.keep).toBe(1)
    // (the word: an element on its line, F0's class, its copy its text)
    const word = L.units[2]!
    expect(word.content).toEqual([
      text('we call '),
      { t: 'el', id: '1', kind: 'code', src: '\\texttt{lookup}' },
      text(' here now'),
    ])
    expect(word.keptEls).toEqual([['1', 'pitch']])
    expect(new Map(word.classes).get('1')).toEqual({ cls: 'other', literal: true, copy: 'lookup' })
    const wordMem = L.members.find((m) => m.unit === 2)!
    expect(wordMem.lines.map((l) => l[9] & 1)).toEqual([0])
    expect(new Map(wordMem.elements).get('1')!.ink).toHaveLength(1)
    // (the paper's body text in its own face: as it was)
    expect(L.units[0]).toEqual(units[0])
  })

  it('reads a group of one pitch with its own end marks and its identifiers, and leaves a group of no text of its own as it is (Rule 1 by group)', () => {
    // (an identifier is an element already, never sent (§18.25): a typewriter group holding one and words of its own is one
    // element, the identifier inside it; one holding the identifier alone has no text to keep and stays a group. A stop the
    // group's own text writes at its end is its glyph; the sentence's stop after it, in the body's face, stays the sentence's)
    const R = 'ABCDEF+CMR10',
      TT = 'ABCDEF+CMTT10'
    const spec: PageSpec = {
      lines: [
        { text: 'Body text of the paper set here', font: R, y: 700 },
        { text: 'run ', font: R, y: 688 },
        { text: 'call ', font: TT, x: 72 + 4 * 6, y: 688 },
        { text: 'f_x', font: TT, x: 72 + 9 * 6, y: 688 },
        { text: ' now.', font: TT, x: 72 + 12 * 6, y: 688 },
        { text: ' then', font: R, x: 72 + 17 * 6, y: 688 },
        { text: 'g_y', font: TT, x: 72 + 22 * 6, y: 688 },
        { text: '.', font: R, x: 72 + 25 * 6, y: 688 },
      ],
    }
    const B = docOf([spec])
    const A = docOf([spec])
    for (const D of [A, B])
      for (const g of D.pages[0]!.glyphs)
        if (g.font === R && !g.blank) g.x1 = g.x0 + (0.3 + ((g.u.codePointAt(0)! * 7) % 11) / 25) * g.size
    const tt = (id: string, content: Piece[]): Piece => ({
      t: 'span',
      id,
      style: 'mono',
      open: '\\texttt{',
      close: '}',
      content,
    })
    const code = (id: string, src: string): Piece => ({ t: 'el', id, kind: 'code', src })
    const content: Piece[] = [
      text('run '),
      tt('1', [text('call '), code('2', 'f\\_x'), text(' now.')]),
      text(' then'),
      tt('5', [code('6', 'g\\_y')]),
      text('.'),
    ]
    const units = [
      unitOf('para', 'Body text of the paper set here'),
      {
        id: unitId('para', content),
        kind: 'para',
        content,
        classes: [
          ['2', { cls: 'other', literal: true, copy: 'f_x' }],
          ['6', { cls: 'other', literal: true, copy: 'g_y' }],
        ],
      } as InstrumentUnit,
    ]
    const ins = instrumentOf(B, units, [[0, 1, 1, 1, 1, 1, 1, 1]])
    // (the identifiers' glyphs are their elements', as the instrument owns them)
    const O = ins.glyphs[0]!
    B.pages[0]!.glyphs.forEach((g, j) => {
      if (g.n === 3 || g.n === 6) {
        O.role[j] = ROLE.element
        O.piece[j] = g.n === 3 ? 2 : 6
      }
    })
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const u = L.units[1]!
    expect(u.content).toEqual([
      text('run '),
      code('1', '\\texttt{call f\\_x now.}'),
      text(' then'),
      content[3],
      text('.'),
    ])
    expect(u.keptEls).toEqual([['1', 'pitch']])
    expect(new Map(u.classes)).toEqual(
      new Map([
        ['6', { cls: 'other', literal: true, copy: 'g_y' }],
        ['1', { cls: 'other', literal: true, copy: 'call f_x now.' }],
      ]),
    )
    const mem = L.members.find((m) => m.unit === 1)!
    const els = new Map(mem.elements)
    expect([...els.keys()].sort()).toEqual(['1', '6'])
    expect(els.get('1')!.ink.map((k) => [k[1], k[3]])).toEqual([[72 + 4 * 6, 72 + 17 * 6]])
  })

  it('keeps a figure’s word set in another face inside a line of a face of one pitch, with its line, always (Rule 1)', () => {
    // (2411.13093v4 p19's code boxes: `"ASR": "The number of the attractions.",` in Consolas but "attractions" in Georgia, and
    // `["coin", "table", ...]` but "coin": the lines kept, each read a Chinese word between its English ones. A line every word
    // of which stands between glyphs of a face of one pitch is code, one figure text kept whole (figure-lines.ts, PDF-READER
    // §18.26: Rule 1's inside-a-line read on the line). A word of its own line stays translated)
    const body = (t: string) => ({ text: t, font: 'ABCDEF+CMR10' })
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
    const B = structuredClone(A)
    for (const D of [A, B])
      for (const g of D.pages[0]!.glyphs)
        if (g.font.endsWith('CMR10') && !g.blank && !g.form)
          g.x1 = g.x0 + (0.3 + ((g.u.codePointAt(0)! * 7) % 11) / 25) * g.size
    const units = [unitOf('para', 'Body text of the paper set here and more body text in that face')]
    const L = locate(instrumentOf(B, units, [[0, 0]]), A, align(B, A), { pages: rawOf(A) })
    const figs = L.members.filter((m) => m.figure && m.unit >= 0)
    expect(figs.map((m) => [m.plain, m.fixed, !!L.units[m.unit]!.pitch])).toEqual([
      ['"key": "count all the harbours.",', true, true],
      ['Loss curve', false, false],
    ])
  })

  it('keeps a figure text holding an identifier as the original, whatever its face: a figure text holds no element (2608.06701v1)', () => {
    // (a token of word characters joined by underscores, `str_replace`, `w/o sol_pool_freq`, in a proportional face: sent, its words
    // came back translated inside it, as 2608.25210v2's `llm_equal_human` did in a unit. A figure text is drawn whole, its text
    // and no element: one that holds an identifier stays the original's. A figure text of words alone, a camelCase name, a lone
    // underscore, is translated)
    const body = (t: string) => ({ text: t, font: 'ABCDEF+CMR10' })
    const A = docOf([
      {
        lines: [
          body('Body text of the paper set here'),
          body('and more body text in that face'),
          { text: '`CallbackBase.host_label(result)` in', y: 660, form: true, font: 'ABCDEF+CMR10' },
          { text: 'str_replace', y: 640, form: true, font: 'ABCDEF+CMR10' },
          { text: 'w/o sol_pool_freq', y: 620, form: true, font: 'ABCDEF+CMR10' },
          { text: 'Loss of camelCase', y: 600, form: true, font: 'ABCDEF+CMR10' },
          { text: 'the _ mark', y: 580, form: true, font: 'ABCDEF+CMR10' },
        ],
      },
    ])
    const B = structuredClone(A)
    const units = [unitOf('para', 'Body text of the paper set here and more body text in that face')]
    const L = locate(instrumentOf(B, units, [[0, 0]]), A, align(B, A), { pages: rawOf(A) })
    const figs = L.members.filter((m) => m.figure)
    expect(figs.map((m) => [m.plain, m.fixed])).toEqual([
      ['`CallbackBase.host_label(result)` in', true],
      ['str_replace', true],
      ['w/o sol_pool_freq', true],
      ['Loss of camelCase', false],
      ['the _ mark', false],
    ])
    const why = new Map(figs.map((m) => [m.plain, L.units[m.unit]!.why]))
    expect([why.get('str_replace'), why.get('w/o sol_pool_freq')]).toEqual(['figure: identifier', 'figure: identifier'])
    // (no face of one pitch keeps it: it is no artefact of Rule 1's)
    expect(figs.map((m) => !!L.units[m.unit]!.pitch)).toEqual([false, false, false, false, false])
  })

  it('sets every line of a justified paragraph inside a figure from its start, an indented one too', () => {
    // (2411.13093v4 p18, Figure 8: a prompt set as a justified paragraph in an included figure, its entries' first lines indented
    // by hand. Each line a figure text, the indented one shares the paragraph's end with its full lines and not its start, and
    // was read set from its end: its translation laid flush against the box's right edge, its next line from the left. Lines
    // that share both edges, two at least, are a paragraph's measure: every line of it is set from its start)
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
    const { B, ins } = finalOf(A, [unitOf('para', 'a paragraph whose word continues on its last line')])
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
    const { B, ins } = finalOf(A, [unitOf('para', 'a paragraph whose word continues on its last line')])
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
    const { B, ins } = finalOf(A, [unitOf('para', 'a paragraph whose word continues on its last line')])
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
    const { B, ins } = finalOf(A, [unitOf('para', 'a paragraph whose word continues on its last line')])
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
    const { B, ins } = finalOf(A, [unitOf('para', 'a paragraph whose word continues on its last line')])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    expect(L.members.filter((m) => m.figure).map((m) => [m.plain, m.align])).toEqual([
      ['History of General Mathematics', 'r'],
      ['Ordinary Differential Equation', 'r'],
      ['Topology', 'r'],
    ])
  })

  it('makes a figure’s text inside its form a figure text, where B sets it too and no unit owns it', () => {
    // (our final pass includes the figure as arXiv's compile does: its text has its partners on B, no source unit's)
    const spec: PageSpec = {
      lines: [
        'a paragraph whose word',
        { text: 'Loss', y: 640, form: true },
        { text: 'continues on its last line', y: 600 },
      ],
    }
    const B = docOf([spec])
    const ins = instrumentOf(B, [unitOf('para', 'a paragraph whose word continues on its last line')], [[0, -1, 0]])
    const A = docOf([spec])
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

  it('leaves ink our compile never printed, on a page it sets, arXiv’s: no figure glyph and no unit, flat and turned (its stamp)', () => {
    // (arXiv's margin stamp, "arXiv:2608.25210v2 [cs.DB] 28 Aug 2026" turned up page 1's left margin, which arXiv's newer pages
    // show inside a form of arXiv's: no glyph of it has a partner on B, and the figure reading, reading A's own form flag, made it a
    // figure text the reader sent and drew translated over the original (78 of the 88). On a page our compile sets, a glyph it
    // never printed is no text the paper's TeX set: never a figure glyph, never a unit, never sent, erased or lit)
    const lines = ['a paragraph whose word', 'continues on its last line']
    const B = docOf([{ lines }])
    const ins = instrumentOf(B, [unitOf('para', 'a paragraph whose word continues on its last line')], [[0, 0]])
    const A = docOf([{ lines: [...lines, { text: 'arXiv stamp in its form', x: 24, y: 400, form: true }] }])
    const at = A.pages[0]!.glyphs.length
    A.pages[0]!.turned = turnedRun('arXiv:2501.00001v1 [cs.CL]', 24, 200, at, true)
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    expect(L.units.map((u) => u.kind)).toEqual(['para'])
    expect(L.members.map((m) => m.unit)).toEqual([0])
    expect(L.members[0]).toMatchObject({ located: true })
    expect(L.figureGroups.size).toBe(0)
    // (nor is a unit born of it: the glyphs B never printed on a page B sets are arXiv's ink)
    expect(L.born.size).toBe(0)
  })

  it('reads a figure’s text on a page our compile sets none of as it reads it (a second file arXiv compiles, 2610.20030v1)', () => {
    // (2610.20030v1's source names two top-level files (00README.json): arXiv compiles both and joins them, our compile is the
    // first's, 8 pages. On pages 9 to 12, which our compile never makes, nothing tells who set the ink: the figure reading reads
    // them as it did, its axis titles figure texts)
    const lines = ['a paragraph whose word', 'continues on its last line']
    const B = docOf([{ lines }])
    const ins = instrumentOf(B, [unitOf('para', 'a paragraph whose word continues on its last line')], [[0, 0]])
    const A = docOf([{ lines }, { lines: [{ text: 'target area', y: 640, form: true }] }])
    A.pages[1]!.turned = turnedRun('cell motility', 60, 400, A.pages[1]!.glyphs.length, true)
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    expect(
      L.members
        .filter((m) => m.figure)
        .map((m) => m.plain)
        .sort(),
    ).toEqual(['cell motility', 'target area'])
  })

  it('states a figure text’s style runs: a lead-in its glyphs set in its family’s bold a group, `must`, its style its glyphs’', () => {
    // (2608.25210v2 p2's "Data Extraction Task: Extract all …": the lead-in in HelveticaNeue-Bold, the rest in HelveticaNeue, one
    // run of today's figure reading (a family's faces); read as one style, the majority's, it was regular, the lead-in's weight
    // lost, with no run of the figure text's to carry it through a translation)
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
    const { B, ins } = finalOf(A, [unitOf('para', 'a paragraph whose word continues on its last line')])
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

  it('makes a title and its path, TeX’s line in a picture, one figure text whose path is a code element, kept as its ink (F0)', () => {
    // (2610.19159v1's transcript box titles, pgf's: "Agent Action: Write" in a proportional face, the path written in typewriter,
    // then "(Self-directed scope reduction)": TeX's line went on over the faces and made one figure text of them, a title,
    // translated with its path inside. Rule 1's run ends at the face of one pitch (the owner's ruling of 2026-11-10), and the
    // line's runs are one figure text again whose run of one pitch is an element, never sent, its ink moving with the
    // translation (F0, the owner's ruling of 2026-11-10: figure-lines.ts, PDF-READER §18.26)
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
    const locateWith = (body: string) => {
      const B = docWith(true, body)
      const A = docWith(false, body)
      const ins = instrumentOf(B, [unitOf('para', 'a paragraph whose word continues on its last line')], [[0, -1, 0]])
      return locate(ins, A, align(B, A), { pages: rawOf(A) })
    }
    const L = locateWith('ABCDEF+CMR10')
    const figs = L.members.filter((m) => m.figure && m.unit >= 0)
    expect(figs).toHaveLength(1)
    const [fig] = figs
    const unit = L.units[fig!.unit]!
    expect(unit.content).toEqual([
      text('Action: Write '),
      { t: 'el', id: '1', kind: 'code', src: '/tmp/f_a.py' },
      text(' (scope cut)'),
    ])
    expect([fig!.fixed, !!unit.pitch, fig!.plain]).toEqual([false, false, undefined])
    // (its element drawn from its ink, as the paper sets it: class `other`, set as written; its ink the path's glyphs)
    expect(unit.classes).toEqual([['1', { cls: 'other', literal: true, copy: '/tmp/f_a.py' }]])
    // (and marked kept for its pitch, by its piece: what the lab's dump and the parity read)
    expect(unit.keptEls).toEqual([['1', 'pitch']])
    expect(fig!.els.get('1')).toHaveLength('/tmp/f_a.py'.length)
    expect(fig!.elements.find(([id]) => id === '1')?.[1]).toMatchObject({ kind: 'code', ink: [expect.any(Array)] })
    // (a paper whose body face is of one pitch: Rule 1 keeps nothing and F0 makes no element of the path, and TeX's line goes on
    // as before, one text; that text holds an identifier, `f_a`, which keeps a figure text whole as the original's whatever its
    // face (§18.25), not by Rule 1. Where F0 makes the path an element, above, the identifier is the element's ink and the line
    // is translated round it)
    const T = locateWith('ABCDEF+CMTT10')
    expect(
      T.members.filter((m) => m.figure && m.unit >= 0).map((m) => [m.plain, m.fixed, !!T.units[m.unit]!.pitch]),
    ).toEqual([[line, true, false]])
  })

  it('reads a figure’s word by its spacing, not its sizes: a heading in faked small capitals one figure text, no script and no other label joined', () => {
    // (2609.19644v1 pp. 56-71, an ICLR draft included as figures: iclr2025's faked small capitals, each word's capital at the
    // line's size and the rest of it smaller, abutting it on its baseline. The run cut at every size change: "S" | "YSTEM", the
    // rests translated alone, 'ORECASTING' -> ore casting. The owner's rule of 2026-11-10: glyphs on one baseline with no word
    // space between them are one word whatever their sizes, and a run goes on across such a change)
    /** A with a figure's line of words, each glyph [character, size, raise], set left to right on one baseline: a glyph's advance
     *  0.6 of its size, a word space of 3.3 between words and no space glyph, as TeX sets them */
    const figuresOf = (words: [string, number, number?][][]) => {
      const line = words.flat()
      const A = docOf([
        {
          lines: [
            'a paragraph whose word',
            { text: line.map(([c]) => c).join(''), y: 640, form: true, font: 'ABCDEF+NimbusRomNo9L-Regu' },
            { text: 'continues on its last line', y: 600 },
          ],
        },
      ])
      let j = 'a paragraph whose word'.length
      let x = 100
      words.forEach((word, w) => {
        if (w) x += 3.3
        for (const [, size, raise = 0] of word) {
          const y = 640 + raise
          const x1 = x + 0.6 * size
          Object.assign(A.pages[0]!.glyphs[j++]!, {
            size,
            x0: x,
            x1,
            ix0: x,
            ix1: x1,
            y,
            top: y + 0.7 * size,
            bottom: y - 0.2 * size,
          })
          x = x1
        }
      })
      const { B, ins } = finalOf(A, [unitOf('para', 'a paragraph whose word continues on its last line')])
      const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
      return L.members.filter((m) => m.figure && m.unit >= 0).map((m) => [m.plain, m.style.size, m.style.caps])
    }
    /** a word in faked small capitals: its capitals at the line's size, every other character in capitals at the smaller one */
    const sc = (s: string, big = 7.66, small = 6.13): [string, number][] =>
      [...s].map((c) => [c.toUpperCase(), /\p{Lu}|&/u.test(c) ? big : small])
    expect(figuresOf(['System', 'Overview', '&', 'Problem', 'Formulation'].map((w) => sc(w)))).toEqual([
      ['SYSTEM OVERVIEW & PROBLEM FORMULATION', 7.66, 1],
    ])
    // (a word the source writes lowercase, all its letters small, goes on with the run once a word of it held both sizes)
    expect(figuresOf(['Fusion', 'with', 'Multi-Scale', 'Gating', 'for'].map((w) => sc(w, 13.24, 10.59)))).toEqual([
      ['FUSION WITH MULTI-SCALE GATING FOR', 13.24, 1],
    ])
    // (a glyph raised or lowered off the baseline, smaller and abutting, is a script: none of the word, its run its own as
    // before (one that spells a word a figure text alone, the figure-formula lane's))
    const at = (s: string, size: number, raise = 0) => [...s].map((c): [string, number, number] => [c, size, raise])
    expect(
      figuresOf([
        [...at('Error', 10), ...at('ab', 7, 3.5)],
        [...at('Loss', 10), ...at('ik', 7, -2)],
      ]),
    ).toEqual([
      ['Error', 10, undefined],
      ['ab', 7, undefined],
      ['Loss', 10, undefined],
      ['ik', 7, undefined],
    ])
    // (two labels of two sizes a word space apart on one baseline, no word of them holding both: two figure texts, as before)
    expect(figuresOf([at('Accuracy', 10), at('loss', 7)])).toEqual([
      ['Accuracy', 10, undefined],
      ['loss', 7, undefined],
    ])
  })

  it('makes no group of a figure text set in one face, and a group of each run its glyphs set apart from its own style', () => {
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
      const { B, ins } = finalOf(A, [unitOf('para', 'a paragraph whose word continues on its last line')])
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

  it('makes the text of a float of a type with no counter a note, the page’s own text (NeurIPS’s notice); a figure’s float none', () => {
    // (NeurIPS sets "Preprint. Under review." in \\@float{noticebox}[b], a float type with \\ftype@noticebox and no counter: no
    // \\caption can number it, so TeX says it is no figure, table or algorithm. The marked compile states it, `fn<n>` beside the
    // float's `fs<n>` (layout/marks.mjs); the ledger reads its text as the page's own outside the bodies, a note, always
    // translated. Read as a float, its line was `figures` by depth, which no figure reading takes: English on every pane)
    const lines = ['Body text here', { text: 'Preprint. Under review.', x: 72, y: 80, size: 9 }]
    const made = (fn: boolean) => {
      const at = 'Body text here'.length
      const { B, A } = pair({
        lines,
        points: [
          ['bs1', 0],
          ['be1', at],
          ['fs2', at],
          ...(fn ? ([['fn2', at]] as [string, number][]) : []),
          ['fe2', at + 'Preprint. Under review.'.length],
        ],
      })
      const L = locate(instrumentOf(B, [unitOf('para', 'Body text here')], [[0, -1]]), A, align(B, A), {
        pages: rawOf(A),
      })
      return L.units.slice(1).map((u) => [u.kind, u.content.map((p) => (p.t === 'text' ? p.s : p.t)).join('')])
    }
    expect(made(true)).toEqual([['inknotes', 'Preprint. Under review.']])
    // (a float of a type with a counter, a figure's or a table's: its text no unit owns stays its figure's, as before)
    expect(made(false)).toEqual([])
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

describe("locate reads A's glyphs off its Doc (lane mem-front)", () => {
  // (the ink step reads each A page's glyphs off the Doc, never pageInk's raw ones: so that the back half reads A with its raw glyphs
  // let go page by page (readPdf's `rawGlyphs: false`), one copy of A's glyphs as of B's. A Doc read by readPdf holds page glyphs, which
  // a glyph made with a field changed keeps (glyphWith): the same units, members and groups as from plain glyphs, and from raw pages
  // that hold none)
  it('makes the same units from page glyphs with raw pages that hold none', () => {
    const { B, A } = pair({
      lines: ['Running Title', 'Body text here'],
      points: [
        ['bs1', 13],
        ['be1', 27],
      ],
    })
    const ins = instrumentOf(B, [unitOf('para', 'Body text here')], [[-1, 0]])
    const held = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const paged: Doc = { pages: A.pages.map((pg) => ({ ...pg, glyphs: pageGlyphsOf(pg.glyphs) })) }
    const bare = rawOf(A).map((r) => ({ ...r, glyphs: [] }) as unknown as PageInk)
    const read = locate(ins, paged, align(B, paged), { pages: bare, take: true })
    expect(read.units).toEqual(held.units)
    expect(read.members).toEqual(held.members)
    expect(read.groups).toEqual(held.groups)
  })
})
