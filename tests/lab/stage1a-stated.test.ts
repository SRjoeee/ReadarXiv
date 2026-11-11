// @vitest-environment node
// Stage 1a's statement of the baseline's units the candidate does not make (lab/pdf/prepare-back/stated.mjs, which run.mjs's
// --baseline and restate.mjs write into a dump), the cause the differential's acceptance list (baseline/acceptance.json) reads.
// The causes of the coordinator's rulings of 2026-11-09, each accepted entry by entry by a mechanical check: (a) an ink unit whose
// scripts are now elements (rebuild/script-face) where the two units read alike, its marks read as v2's elements as the parity's
// keptJoin reads them; (b') a unit whose glyphs a unit of the author block's (the names toggle) now holds; (c) a line whose marks
// are the name before's trail (rebuild/front-matter); (d) (a) with an element's characters in another order; (e) a unit whose
// lines v2 keeps whole as the original's inside a display the engine states; (f) a unit one v2 unit holds whole, its text a part
// of that unit's (a kept block holding it stated apart, not accepted); (k), 2026-11-10, a unit the prepare keeps for its text set
// wholly in a face of one pitch, the candidate's own unit's cause. Synthetic units in the dumps' form.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { CAUSE, HOLDER_JOIN, holdersDeclared, keptWhyOf, statedOf } from '../../lab/pdf/prepare-back/stated.mjs'
import { RAW_ADDRESSES, readingOf, scriptsKeptAsElements, scriptsKeptInAnotherOrder } from '../../packages/typeset/tests/replay/l1.ts'
import { ADDRESS_GROUP, EMAIL_ADDRESS } from '../../src/pdf-reader/engine/source/latex-front.mjs'

type DumpPiece = { kind: string; s?: string; src?: string }
type Line = { page: number; x0: number; x1: number; baseline: number; top: number; bottom: number }
/** a dump's unit: its id, ord, kind, flat pieces and lines (one line on page 1 at the given x and baseline) */
const unit = (id: string, ord: number, kind: string, pieces: DumpPiece[], at: [number, number, number] = [72, 300, 600]) => {
  const line: Line = { page: 1, x0: at[0], x1: at[1], baseline: at[2], top: at[2] + 8, bottom: at[2] - 2 }
  return { id, ord, kind, text: '', pieces: pieces.map((p, k) => ({ k, ...p })), lines: [line] } as {
    id: string
    ord: number
    kind: string
    text: string
    pieces: DumpPiece[]
    lines: Line[]
    kept?: true
    elements?: { k: number; kind: string; segs: Line[] }[]
  }
}
const text = (s: string): DumpPiece => ({ kind: 'text', s })
const ph = (src: string): DumpPiece => ({ kind: 'ph', src })
/** v2's flat pieces (sourcePieces' form) of a dump's */
const flat = (ps: DumpPiece[]) => ps.map((p, k) => (p.kind === 'text' ? { t: 'text' as const, s: p.s ?? '', k } : { t: 'ph' as const, src: p.src ?? '', k }))
const id = (c: string) => c.repeat(64)
const said = (stated: { u: { ord: number }; why: string }[]) => stated.map(({ u, why }) => [u.ord, why])

describe("an ink unit's scripts kept as elements: read as today's unit, its marks v2's elements", () => {
  it("reads a raised run of marks today held as text as v2's one element", () => {
    const today = { pieces: [text('Ada Lovelace1,2, Alan Turing2')] }
    const v2 = flat([text('Ada Lovelace'), ph('$^{1,2}$'), text(', Alan Turing'), ph('$^{2}$')])
    expect(scriptsKeptAsElements(v2, today)).toBe(true)
  })

  it("reads a mark today held part as text, part as a placeholder (its reading), and a lowered run", () => {
    expect(scriptsKeptAsElements(flat([text('Grace Hopper'), ph('$^{1,2}$')]), { pieces: [text('Grace Hopper1'), ph('$,2$')] })).toBe(true)
    expect(scriptsKeptAsElements(flat([text('OPT'), ph('$_{pen}$')]), { pieces: [text('OPTpen')] })).toBe(true)
  })

  it("reads a word space today's reading set inside an element's run as no character (d'), inside the element only", () => {
    // (2610.21377v1 t533's shape: today's placeholders round the stacked fractions' digits, word spaces before them)
    const today = { pieces: [text('Set '), ph('$=($'), text(' 51'), ph('$,$'), text(' 25'), ph('$)$'), text(' and')] }
    expect(scriptsKeptAsElements(flat([text('Set '), ph('$=(51,25)$'), text(' and')]), today)).toBe(true)
    // (a space before the run is the text's before it, never the element's; and a unit's texts compare whole, white space too)
    expect(scriptsKeptAsElements(flat([text('x'), ph('$12$')]), { pieces: [text('x 12')] })).toBe(false)
    expect(scriptsKeptAsElements(flat([text('Ada Lovelace'), ph('$^{1}$')]), { pieces: [text('Ada  Lovelace1')] })).toBe(false)
  })

  it('is no such reading where the texts differ, where no element was read by its characters, or where one read so is an address', () => {
    expect(scriptsKeptAsElements(flat([text('Ada Lovelace'), ph('$^{1}$')]), { pieces: [text('Ada Lovelace2')] })).toBe(false)
    expect(scriptsKeptAsElements(flat([text('Ada Lovelace'), ph('$^{1}$')]), { pieces: [text('Ada Lovelace1 and')] })).toBe(false)
    expect(scriptsKeptAsElements(flat([text('see '), ph('$x$')]), { pieces: [text('see '), ph('$x$')] })).toBe(false)
    expect(scriptsKeptAsElements(flat([text('mail '), ph('\\url{a@b.org}')]), { pieces: [text('mail a@b.org')] })).toBe(false)
  })
})

describe("the baseline's units the candidate does not make, stated with how it reads them", () => {
  it("states an ink unit whose marks are now elements, and reads alike, as its scripts kept as elements", () => {
    const base = [unit(id('a'), 7, 'inkorphan', [text('Ada Lovelace1,2')])]
    const units = [unit(id('b'), 3, 'inkorphan', [text('Ada Lovelace'), ph('$^{1,2}$')])]
    expect(said(statedOf(base, units))).toEqual([[7, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.scripts}`]])
  })

  it('states one whose marks are elements but whose text differs as another reading, and keeps the earlier causes', () => {
    const base = [unit(id('a'), 7, 'inknotes', [text('Ada Lovelace1')]), unit(id('c'), 8, 'inkcontents', [text('ab')], [72, 300, 500])]
    const units = [
      unit(id('b'), 3, 'inknotes', [text('Ada Byron'), ph('$^{1}$')]),
      unit(id('d'), 4, 'inkcontents', [text('ba')], [72, 300, 500]),
    ]
    expect(said(statedOf(base, units))).toEqual([
      [7, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.another}`],
      [8, `made on arXiv's page as ${'d'.repeat(12)}: ${CAUSE.order}`],
    ])
  })

  it("states an orphan line now the author block's names line as the author block's, kept by the names toggle", () => {
    const base = [unit(id('a'), 161, 'inkorphan', [text('Ada Lovelace,')])]
    const units = [unit(id('b'), 161, 'inknames', [text('Ada Lovelace'), ph('$^{a}$'), text(',')])]
    expect(said(statedOf(base, units))).toEqual([[161, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.names}`]])
  })

  it("states a names unit the author block's rule moved out of the block as its ledger class's unit standing for it (2610.21084v1 t587)", () => {
    // (rule 8 made today's page-foot note of the authors' e-mails inknames; outside the author block under the title the block
    // rule gives it back its ledger class, inknotes: the unit of today's kind no more, it stands for today's all the same, at its
    // place or, neither with a line, at its ord; here refused, as it was when it was inknames)
    const refused = { why: 'content difference: aonly' }
    const today = { ...unit(id('a'), 587, 'inknames', [text('(. Chung)')]), lines: [] }
    const v2 = { ...unit(id('b'), 587, 'inknotes', [text('(M. Chung)')]), lines: [], ...refused }
    expect(said(statedOf([today], [v2]))).toEqual([[587, `made on arXiv's page as ${'b'.repeat(12)}: content difference: aonly`]])
    const placed = { ...unit(id('c'), 12, 'inkorphan', [text('(M. Chung)')]), ...refused }
    expect(said(statedOf([unit(id('a'), 587, 'inknames', [text('(. Chung)')])], [placed]))).toEqual([
      [587, `made on arXiv's page as ${'c'.repeat(12)}: content difference: aonly`],
    ])
    // (a unit of its own kind there first; no other kind's: a note of today's now an orphan line is no move of the block's)
    const both = [placed, { ...unit(id('d'), 13, 'inknames', [text('(M. Chung)')]), ...refused }]
    expect(said(statedOf([unit(id('a'), 587, 'inknames', [text('(. Chung)')])], both))).toEqual([
      [587, `made on arXiv's page as ${'d'.repeat(12)}: content difference: aonly`],
    ])
    expect(statedOf([{ ...unit(id('a'), 5, 'inknotes', [text('x')]), lines: [] }], [{ ...unit(id('b'), 5, 'inkorphan', [text('y')]), lines: [] }])).toEqual([])
    // (a kept block there is no unit the block's rule moved, which never makes one: (f)'s holding by a kept block states it, as before)
    const kept = { ...unit(id('e'), 40, 'inkorphan', []), kept: true as const }
    expect(said(statedOf([unit(id('a'), 587, 'inknames', [text('(. Chung)')])], [kept]))).toEqual([
      [587, `made on arXiv's page as ${'e'.repeat(12)}: ${CAUSE.heldKept}`],
    ])
  })

  it('states no names line for a line now of another kind that is not the names toggle (held whole (f)), nor one at another place', () => {
    expect(said(statedOf([unit(id('a'), 1, 'inkorphan', [text('x')])], [unit(id('b'), 1, 'inknotes', [text('x')])]))).toEqual([
      [1, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.held}`],
    ])
    expect(
      statedOf([unit(id('a'), 1, 'inkorphan', [text('x')])], [unit(id('b'), 1, 'inknames', [text('x')], [72, 300, 400])]),
    ).toEqual([])
  })
})

describe("(b') a unit whose glyphs a unit of the author block now holds, whatever today's kind", () => {
  it("states a note's line of today's (an e-mail line) now an inknames line as the author block's", () => {
    const base = [unit(id('a'), 112, 'inknotes', [text('ada@example.org')])]
    const units = [unit(id('b'), 140, 'inknames', [text('ada@example.org')])]
    expect(said(statedOf(base, units))).toEqual([[112, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.names}`]])
  })

  it("states a line whose glyphs are now an affiliation's element, and a names line now the author unit, as the author block's", () => {
    const aff = unit(id('b'), 3, 'affiliation', [text('Institute of Things '), ph('\\url{ada@example.org}')], [72, 300, 640])
    aff.lines.push({ page: 1, x0: 72, x1: 200, baseline: 600, top: 608, bottom: 598 })
    const base = [
      unit(id('a'), 110, 'inknotes', [text('ada@example.org')], [72, 200, 600]),
      unit(id('c'), 123, 'inknotes', [text('Ada Lovelace1')], [72, 300, 680]),
    ]
    const units = [aff, unit(id('d'), 94, 'author', [text('Ada Lovelace'), ph('$^{1}$')], [72, 300, 680])]
    expect(said(statedOf(base, units))).toEqual([
      [110, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.names}`],
      [123, `made on arXiv's page as ${'d'.repeat(12)}: ${CAUSE.names}`],
    ])
  })

  it("states one whose glyphs an author block unit today made too now holds (an e-mail now its affiliation's element)", () => {
    const base = [unit(id('a'), 110, 'inknotes', [text('ada@example.org')]), unit(id('b'), 3, 'affiliation', [text('Institute')])]
    expect(said(statedOf(base, [unit(id('b'), 3, 'affiliation', [text('Institute')])]))).toEqual([
      [110, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.names}`],
    ])
  })

  it("states no names line where the unit holding its glyphs is not the author block's, or holds only part of its line", () => {
    // (held whole (f) instead: one unit meets its line, its text today's)
    const held = [[1, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.held}`]]
    expect(said(statedOf([unit(id('a'), 1, 'inknotes', [text('x')])], [unit(id('b'), 1, 'para', [text('x')])]))).toEqual(held)
    expect(said(statedOf([unit(id('a'), 1, 'inknotes', [text('x')])], [unit(id('b'), 1, 'author', [text('x')], [72, 200, 600])]))).toEqual(held)
  })
})

describe("(c) a line whose marks are the name before's trail", () => {
  /** the trail front-matter gives the name before: its glyphs' box and characters */
  const trail = (x0: number, x1: number, s: string) => ({ page: 1, x0, x1, top: 598, bottom: 586, baseline: 588.37, text: s })
  it("states today's \"<marks>, and\" now v2's \"and\" after the name before's trail as its marks the trail", () => {
    const base = [unit(id('a'), 185, 'inkorphan', [text('7,8, and')], [325.12, 362.44, 588.37])]
    const units = [unit(id('b'), 185, 'inkorphan', [text('and')], [343.58, 362.44, 588.37])]
    expect(said(statedOf(base, units, { trails: [trail(325.12, 339.69, '7,8,')] }))).toEqual([
      [185, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.trail}`],
    ])
  })

  it("reads today's text with the trail's characters taken out in order, a raised mark today's text lost too", () => {
    const base = [unit(id('a'), 651, 'inkorphan', [text(', and')], [350.53, 381.26, 588.37])]
    const units = [unit(id('b'), 651, 'inkorphan', [text('and')], [362.41, 381.26, 588.37])]
    expect(said(statedOf(base, units, { trails: [trail(350.53, 358.51, '2,')] }))).toEqual([
      [651, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.trail}`],
    ])
  })

  it('is another reading where the trail does not start today\'s line, or today holds more than the trail and v2\'s text', () => {
    const base = [unit(id('a'), 1, 'inkorphan', [text('7,8, and')], [325.12, 362.44, 588.37])]
    const units = [unit(id('b'), 1, 'inkorphan', [text('and')], [343.58, 362.44, 588.37])]
    const other = [unit(id('a'), 1, 'inkorphan', [text('7,8, and so')], [325.12, 362.44, 588.37])]
    for (const [b, t] of [
      [base, trail(330, 339.69, '7,8,')],
      [other, trail(325.12, 339.69, '7,8,')],
    ] as const)
      expect(said(statedOf(b, units, { trails: [t] }))).toEqual([[1, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.another}`]])
  })
})

describe("(d) an ink unit's scripts kept as an element, its characters in another order", () => {
  it("reads an element whose characters are today's there in another order, the rest today's", () => {
    expect(scriptsKeptInAnotherOrder(flat([text('and '), ph('$s=12$'), text(' (top)')]), { pieces: [text('and '), ph('$s=$'), text('21 (top)')] })).toBe(true)
    const base = [unit(id('a'), 747, 'inkcontents', [text('and '), ph('$s=$'), text('21 (top)')])]
    const units = [unit(id('b'), 747, 'inkcontents', [text('and '), ph('$s=12$'), text(' (top)')])]
    expect(said(statedOf(base, units))).toEqual([[747, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.orderAsElement}`]])
  })

  it("reads a word space today's reading set inside the run as no character (d'), but no other difference, nor none moved", () => {
    // (2307.16209v1 t747's shape: "[s=] 21 [,ℓ=] 21 (bottom)" today, "[s=12,ℓ=12] (bottom)" in v2)
    expect(
      scriptsKeptInAnotherOrder(flat([text('and '), ph('$s=12,l=12$'), text(' (top)')]), {
        pieces: [text('and '), ph('$s=$'), text(' 21 '), ph('$,l=$'), text(' 21 (top)')],
      }),
    ).toBe(true)
    expect(scriptsKeptInAnotherOrder(flat([text('and '), ph('$s=12$')]), { pieces: [text('and '), ph('$s=$'), text('13')] })).toBe(false)
    expect(scriptsKeptInAnotherOrder(flat([text('and '), ph('$s=12$')]), { pieces: [text('and '), ph('$s=$'), text('12')] })).toBe(false)
  })
})

describe("(e) a unit whose lines v2 keeps whole as the original's, inside a display the engine states", () => {
  it('states one whose kept lines lie inside a display element\'s box of the candidate\'s as its display lines kept', () => {
    const base = [unit(id('a'), 118, 'inknotes', [text('x = '), ph('$y$')], [107.91, 253.18, 195.57])]
    const kept = { ...unit(id('b'), 141, 'inknotes', [], [107.91, 253.18, 195.57]), kept: true as const }
    const para = unit(id('c'), 54, 'para', [text('so that '), ph('\\begin{equation}…')], [72, 300, 700])
    para.elements = [{ k: 1, kind: 'display', segs: [{ page: 1, x0: 100, x1: 540, baseline: 195.57, top: 230, bottom: 140 }] }]
    expect(said(statedOf(base, [kept, para]))).toEqual([[118, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.display}`]])
    para.elements = [{ k: 1, kind: 'math', segs: [{ page: 1, x0: 100, x1: 540, baseline: 195.57, top: 230, bottom: 140 }] }]
    expect(said(statedOf(base, [kept, para]))).toEqual([[118, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.kept}`]])
  })

  it('states one whose every line is now a kept block of its kind, its lines today\'s, as its lines kept whole', () => {
    const base = [unit(id('a'), 118, 'inknotes', [text('x = '), ph('$y$')], [107.91, 253.18, 195.57])]
    const kept = { ...unit(id('b'), 141, 'inknotes', [], [107.91, 253.18, 195.57]), kept: true as const }
    expect(said(statedOf(base, [kept]))).toEqual([[118, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.kept}`]])
    const moved = { ...unit(id('b'), 141, 'inknotes', [], [107.91, 240, 195.57]), kept: true as const }
    expect(said(statedOf(base, [moved]))).toEqual([[118, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.another}`]])
  })
})

describe("(g) and (h): one that stands for today's unit and reads otherwise (the coordinator's rulings of 2026-11-10, round 8 B2)", () => {
  /** v2's unit made on A at today's place, drawn, its text and elements given, on today's lines (x1 as v2's) and more */
  const made = (kind: string, pieces: DumpPiece[], lines: [number, number, number][], els: { k: number; line: number }[] = []) => {
    const n = unit(id('b'), 9, kind, pieces, lines[0])
    n.lines = lines.map(([x0, x1, b]) => ({ page: 1, x0, x1, baseline: b, top: b + 8, bottom: b - 2 }))
    n.elements = els.map(({ k, line }) => ({ k, kind: 'url', segs: [{ ...n.lines[line]! }] }))
    return { ...n, state: 'drawn' }
  }
  it("(g) states one whose text is arXiv's over today's lines, today's a subsequence of it, as another reading, now arXiv's text (2610.21084v1 t587)", () => {
    // (cas-common's footnote: our old compile set "(. Chung)", arXiv "(M. Chung)"; v2's unit read off arXiv's page, laid)
    const today = unit(id('a'), 587, 'inknames', [ph('\\url{a@b.org}'), text(' (. Chung); '), ph('\\url{c@d.org}'), text(' (.M. Solomon)')], [99.9, 420, 129])
    const v2 = made('inknotes', [ph('\\url{a@b.org}'), text(' (M. Chung); '), ph('\\url{c@d.org}'), text(' (J.M. Solomon)')], [[99.9, 426.7, 129]], [{ k: 0, line: 0 }, { k: 2, line: 0 }])
    expect(said(statedOf([today], [v2]))).toEqual([[587, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.arxivText}`]])
    // (today's text no subsequence of v2's, or v2's unit not on today's lines, or refused: another reading)
    const other = made('inknotes', [ph('\\url{a@b.org}'), text(' (M. Chang); '), ph('\\url{c@d.org}'), text(' (J.M. Solomon)')], [[99.9, 426.7, 129]], [{ k: 0, line: 0 }, { k: 2, line: 0 }])
    expect(said(statedOf([today], [other]))).toEqual([[587, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.another}`]])
    const more = made('inknotes', v2.pieces, [[99.9, 426.7, 129], [72, 186, 119.5]], [{ k: 0, line: 0 }, { k: 2, line: 0 }])
    expect(said(statedOf([today], [more]))).toEqual([[587, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.another}`]])
  })
  it("(h) states one whose text is today's and whole lines more that carry no text word as held whole, with its wrapped no-word lines (2610.22214v1 t310)", () => {
    // (ACM's permission note: today's two lines; v2's the same and the DOI TeX broke onto a third, which the join rule adds)
    const today = unit(id('a'), 310, 'inknotes', [text('ACM ISBN 979-8-4007')], [53.3, 186.8, 100.6])
    today.lines.push({ page: 1, x0: 53.5, x1: 162, baseline: 92.6, top: 100.6, bottom: 90.6 })
    const lines: [number, number, number][] = [[53.3, 186.8, 100.6], [53.5, 162, 92.6], [53.8, 166.9, 84.7]]
    const v2 = made('inknotes', [text('ACM ISBN 979-8-4007 '), ph('\\url{https://doi.org/10.1145/1}')], lines, [{ k: 1, line: 2 }])
    expect(said(statedOf([today], [v2]))).toEqual([[310, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.wrapped}`]])
    // (the line more holding text: no wrapping (h); the stand-in holds today's text whole, in order: held whole, (f) by a stand-in
    // of its kind, the coordinator's ruling of 2026-11-10 on round 8 B2a; one that does not hold it, another reading)
    const worded = made('inknotes', [text('ACM ISBN 979-8-4007 doi 10.1145')], lines)
    expect(said(statedOf([today], [worded]))).toEqual([[310, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.held}`]])
    const other = made('inknotes', [text('ACM ISBN 979-8-4008 doi 10.1145')], lines)
    expect(said(statedOf([today], [other]))).toEqual([[310, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.another}`]])
  })
})

describe("(i) a unit the guard left unmarked, held whole by one drawn unit with its text (the coordinator's ruling of 2026-11-10, round 8 B2)", () => {
  /** today's abstract paragraph on two lines, drawn (or not); v2's own unit of it, unlaid with the reason the dump gives it */
  const today = (state = 'drawn') => {
    const u = unit(id('a'), 4, 'abstract', [text('Scientific prediction under '), text('uncertainty needs more.')], [212, 472, 523.6])
    u.lines.push({ page: 1, x0: 212, x1: 390, baseline: 514.1, top: 522.1, bottom: 512.1 })
    return { ...u, state }
  }
  const own = (why: string) => ({ id: id('a'), ord: 4, kind: 'abstract', text: '', pieces: today().pieces, state: 'unlaid', why })
  const ink = (s: string, state = 'drawn') => {
    const n = unit(id('b'), 587, 'inkorphan', [text(s)], [212, 472, 523.6])
    n.lines.push({ page: 1, x0: 212, x1: 390, baseline: 514.1, top: 522.1, bottom: 512.1 })
    return { ...n, state }
  }
  it("states it held whole by another unit, on its own unit, the guard's reason kept (2610.21084v1 t4: cas-common's abstract)", () => {
    const stated = statedOf([today()], [own('unlocated: marks'), ink('Scientific prediction under uncertainty needs more.')])
    expect(said(stated)).toEqual([[4, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.held}`]])
    expect(stated[0]).toMatchObject({ cause: 'held', holder: id('b'), own: { ord: 4, why: 'unlocated: marks' } })
  })
  it("states none where today did not draw it (no loss to state), the reason is another, the holder is not drawn or holds other text, or two units hold its lines", () => {
    expect(said(statedOf([today('unlaid')], [own('unlocated: marks'), ink('Scientific prediction under uncertainty needs more.')]))).toEqual([])
    expect(said(statedOf([today()], [own('unlocated: no ink'), ink('Scientific prediction under uncertainty needs more.')]))).toEqual([])
    expect(said(statedOf([today()], [own('content difference: bonly'), ink('Scientific prediction under uncertainty needs more.')]))).toEqual([])
    expect(said(statedOf([today()], [own('unlocated: marks'), ink('Scientific prediction under uncertainty needs more.', 'laid')]))).toEqual([])
    expect(said(statedOf([today()], [own('unlocated: marks'), ink('4Scientific prediction under uncertainty needs more.')]))).toEqual([])
    const half = ink('Scientific prediction under uncertainty needs more.')
    half.lines = half.lines.slice(0, 1)
    const other = { ...unit(id('c'), 588, 'inkorphan', [text('x')], [212, 390, 514.1]), state: 'drawn' }
    expect(said(statedOf([today()], [own('unlocated: marks'), half, other]))).toEqual([])
  })
})

describe("(f) a unit held whole by another unit: one v2 unit holds every line of it, its text a part of that unit's", () => {
  /** v2's reference holding today's two ink notes ("[64] …Mao." and ". Benchmarking …"), a label box before its first line */
  const holder = () => {
    const n = unit(id('b'), 485, 'reference', [
      text('Ada Lovelace, '),
      ph('~'),
      text('Alan Turing. '),
      ph('2024'),
      ph('\\newblock'),
      text('. Benchmarking the engines of thought'),
    ], [334.39, 558.2, 93.86])
    n.lines.push({ page: 1, x0: 334.39, x1: 500, baseline: 86, top: 94, bottom: 84 })
    n.elements = [{ k: 3, kind: 'other', segs: [{ page: 1, x0: 440, x1: 460, baseline: 86, top: 94, bottom: 84 }] }]
    return { ...n, label: [{ page: 1, x0: 317.96, x1: 329.41, baseline: 93.86, top: 98.77, bottom: 92.51 }] }
  }
  it('states a part of its text after an element setting no glyph as held whole', () => {
    const base = [unit(id('a'), 518, 'inknotes', [text('. Benchmarking the engines')], [462, 500, 86])]
    expect(said(statedOf(base, [holder()]))).toEqual([[518, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.held}`]])
  })

  it("reads today's leading label as the holder's label where the part states its number, a tie as no glyph", () => {
    const base = [unit(id('a'), 517, 'inknotes', [text('[64] Ada Lovelace, Alan Turing.')], [317.96, 558.2, 93.86])]
    const labels = new Map([[485, '64']])
    expect(said(statedOf(base, [holder()], { labels }))).toEqual([[517, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.held}`]])
    // (no number stated for the holder's label: its characters are not read, nothing stated)
    expect(statedOf(base, [holder()])).toEqual([])
  })

  it('states a unit a kept block holds apart, not as held whole: it has no text to read', () => {
    const base = [unit(id('a'), 243, 'inknotes', [text('Ada Lovelace. Notes.')])]
    const kept = { ...unit(id('b'), 261, 'inkreferences', []), kept: true as const }
    expect(said(statedOf(base, [kept]))).toEqual([[243, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.heldKept}`]])
  })

  it('states no holding whole where two units meet its line (split (j), their texts today\'s), nor where its text is not a part of the holder\'s', () => {
    const base = [unit(id('a'), 1, 'inknotes', [text('Ada Lovelace')])]
    const two = [unit(id('b'), 1, 'para', [text('Ada')], [72, 150, 600]), unit(id('c'), 2, 'para', [text('Lovelace')], [160, 300, 600])]
    expect(said(statedOf(base, two))).toEqual([[1, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.split}`]])
    expect(statedOf(base, [unit(id('b'), 1, 'para', [text('Ada Byron')])])).toEqual([])
  })
})

/** a line's box as the dumps state it: its page, its extent across, its baseline and its ink's top and bottom */
const box = (x0: number, x1: number, baseline: number, top: number, bottom: number): Line => ({ page: 1, x0, x1, baseline, top, bottom })
/** a unit of the dumps' form on the given lines */
const on = (u: ReturnType<typeof unit>, ...lines: Line[]) => ({ ...u, lines })
/** one of arXiv's glyphs as the engine reads A (DocGlyph): its character, its advance across, its baseline and its ink */
const glyph = (u: string, x0: number, x1: number, y: number, size: number) => ({ u, x0, x1, y, top: y + 0.7 * size, bottom: y - 0.2 * size, blank: !u.trim() })

describe("(c') a line whose marks are the name before's trail, v2's line a unit of the author block of any kind", () => {
  const trail = { page: 1, x0: 350.53, x1: 358.51, top: 642.6, bottom: 636.9, baseline: 637.04, text: '2' }
  // (2610.18513v1 t651's shape: today's "2 and" an orphan, the "2" the name before's trail, v2's "and" now the block's inknames)
  const base = [on(unit(id('a'), 651, 'inkorphan', [text('2 and')]), box(350.53, 381.26, 637.04, 642.6, 632.4))]
  const before = on(unit(id('c'), 2, 'author', [text('Ada Lovelace'), ph('$^{2}$')]), box(280.47, 358.51, 632.7, 641, 630))
  it('states it as its marks the trail where the stand-in is a unit of the author block, whatever its kind', () => {
    const and = on(unit(id('b'), 651, 'inknames', [text('and')]), box(362.41, 381.26, 632.7, 640.9, 632.6))
    expect(said(statedOf(base, [before, and], { trails: [trail] }))).toEqual([[651, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.trail}`]])
  })

  it('states nothing where the stand-in of another kind is no unit of the author block', () => {
    const and = on(unit(id('b'), 651, 'para', [text('and')]), box(362.41, 381.26, 632.7, 640.9, 632.6))
    expect(statedOf(base, [before, and], { trails: [trail] })).toEqual([])
  })
})

describe("(f'') a unit of v2's meets today's line by their boxes, the glyphs' own height, not by their baselines", () => {
  // (2610.20030v1 t91's shape: today's line begins with the name before's raised marks, and today's reading gave the line
  // their baseline, 709.17; the line's body, its "and", stands at 705.55, which v2 states)
  const base = [on(unit(id('a'), 91, 'inkorphan', [text('1, 2 and')]), box(324.29, 357.06, 709.17, 713.8, 705.44))]
  const before = on(unit(id('c'), 3, 'author', [text('Ada Lovelace')]), box(265.62, 324.29, 705.55, 712.36, 703.63))
  it('states one v2 unit whose box holds today\'s line as holding it whole, its baseline another', () => {
    const and = on(unit(id('b'), 91, 'inknames', [text('1, 2 and')]), box(324.29, 357.06, 705.55, 713.8, 705.44))
    expect(said(statedOf(base, [before, and]))).toEqual([[91, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.held}`]])
  })

  it("reads two edges a hundredth or so apart as one edge: the name before's line ending where today's begins meets it not", () => {
    // (2610.21765v1 t254: the author unit's line ends at 321.24, today's line begins at 321.2, two readings of one edge)
    const edge = on(unit(id('c'), 3, 'author', [text('Ada Lovelace')]), box(265.62, 324.33, 705.55, 712.36, 703.63))
    const and = on(unit(id('b'), 91, 'inknames', [text('1, 2 and')]), box(324.29, 357.06, 705.55, 713.8, 705.44))
    expect(said(statedOf(base, [edge, and]))).toEqual([[91, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.held}`]])
  })

  it('states no holding whole where two units\' boxes meet the line (split (j) by their texts), nor anything where no box overlaps it up and down', () => {
    const wide = on(unit(id('c'), 3, 'author', [text('Ada Lovelace')]), box(265.62, 330, 705.55, 712.36, 703.63))
    const and = on(unit(id('b'), 91, 'inknames', [text('1, 2 and')]), box(324.29, 357.06, 705.55, 713.8, 705.44))
    expect(said(statedOf(base, [wide, and]))).toEqual([[91, `made on arXiv's page as ${'c'.repeat(12)}: ${CAUSE.split}`]])
    const below = on(unit(id('b'), 91, 'inknames', [text('1, 2 and')]), box(324.29, 357.06, 690, 698, 688))
    expect(statedOf(base, [before, below])).toEqual([])
  })
})

describe("(f') a line held by the author block's units on it, in order, TeX's space between them", () => {
  // (2609.26457v1 t279's shape: today's line from the name before's raised "1" to "and"; v2's author unit ends with the "1", its
  // inknames "and" begins after the space TeX set)
  const base = [on(unit(id('a'), 279, 'inkorphan', [text('and')]), box(359.42, 386.66, 683.79, 693.19, 683.69))]
  const author = on(unit(id('c'), 4, 'author', [text('Ada Lovelace'), ph('$^{1}$')]), box(298.9, 363.85, 683.79, 693.19, 681.5))
  const and = on(unit(id('b'), 279, 'inknames', [text('and')]), box(367.54, 386.66, 683.79, 691.5, 683.69))
  const line = [
    glyph('e', 352, 359.42, 683.79, 10.96),
    glyph('1', 359.42, 363.85, 687.75, 7.97),
    glyph(' ', 363.85, 367.54, 687.75, 7.97),
    glyph('a', 367.54, 373.1, 683.79, 10.96),
    glyph('n', 373.1, 380, 683.79, 10.96),
    glyph('d', 380, 386.66, 683.79, 10.96),
    glyph(' ', 386.66, 390.3, 683.79, 10.96),
    glyph('A', 390.3, 398, 683.79, 10.96),
  ]
  const glyphs = (page: number) => (page === 1 ? line : null)
  it("states it held by the block's units where each glyph of ink on today's line is one of theirs, in order", () => {
    expect(said(statedOf(base, [author, and], { glyphs }))).toEqual([[279, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.heldBlock}`]])
  })

  it("states no holding by the block where a glyph of ink stands between them, one of them is no unit of the block's, or with no glyphs (split (j), by their texts, then)", () => {
    const split = [[279, `made on arXiv's page as ${'c'.repeat(12)}: ${CAUSE.split}`]]
    const inked = (page: number) => (page === 1 ? line.map((g) => (g.u === ' ' && g.x0 === 363.85 ? glyph(',', 363.85, 367.54, 683.79, 10.96) : g)) : null)
    expect(said(statedOf(base, [author, and], { glyphs: inked }))).toEqual(split)
    const para = on(unit(id('b'), 279, 'para', [text('and')]), box(367.54, 386.66, 683.79, 691.5, 683.69))
    expect(said(statedOf(base, [author, para], { glyphs }))).toEqual(split)
    expect(said(statedOf(base, [author, and]))).toEqual(split)
    // (and nothing where the two hold a character today's does not have between today's: not one part of their text)
    expect(statedOf([on(unit(id('a'), 279, 'inkorphan', [text('1and')]), box(359.42, 386.66, 683.79, 693.19, 683.69))], [author, and])).toEqual([])
  })
})

describe('(F) a line of e-mail addresses held whole by a kept block', () => {
  const kept = { ...on(unit(id('b'), 386, 'inkorphan', []), box(70.87, 348.82, 580.2, 588, 578)), kept: true as const }
  const lineOf = (s: string) => [on(unit(id('a'), 405, 'inkfigures', [text(s)]), box(70.87, 200.88, 580.2, 588, 578))]
  it('states it as a line of addresses kept whole where its text is e-mail addresses and their separators alone', () => {
    for (const s of ['ada@example.org', 'ada@example.org, alan@cs.example.ac.uk;', '{ada, alan}@example.org'])
      expect(said(statedOf(lineOf(s), [kept]))).toEqual([[405, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.addresses}`]])
  })

  it('states one with any other word as held by a kept block, not accepted', () => {
    for (const s of ['Email: ada@example.org', 'ada at example.org', '1 ada@example.org'])
      expect(said(statedOf(lineOf(s), [kept]))).toEqual([[405, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.heldKept}`]])
  })
})

describe("(F) and (f) for an address's placeholders: the replay reads a brace's text symbol, a tie and an address as the source writes it", () => {
  // (the coordinator's ruling of 2026-11-10 on rebuild/mail-group: 1512.03385v1 t321, an affiliation of `\{kahe,~v-xiangz\}@…`
  // today held as text pieces between ties, now a kept block; 2610.21085v1 t2, a footnote's `[first name]@…` now one element;
  // 2610.17024v1 t504, a note of a group now a kept block of its kind, which stood for it and read it otherwise)
  it('reads `\\{`, `\\}` and a tie as their characters, and a placeholder that is an address as the source writes it', () => {
    expect([readingOf('\\{'), readingOf('\\}'), readingOf('~')]).toEqual(['{', '}', ' '])
    expect(readingOf('[first name]@example.com')).toBe('[first name]@example.com')
    expect(readingOf('ada@example.org')).toBe('ada@example.org')
    expect(readingOf('\\{ada,~alan\\}@example.org')).toBe('{ada, alan}@example.org')
    for (const src of ['\\textbf', '\\{ada', 'see ada@example.org', '\\,', '[see 2]@']) expect(readingOf(src)).toBe(null)
    // (one pattern for the replay and the front end)
    expect(RAW_ADDRESSES.map((r: RegExp) => r.source)).toEqual([`^(?:${EMAIL_ADDRESS.source})$`, `^(?:${ADDRESS_GROUP.source})$`])
  })
  const at = box(195.49, 399.73, 599.46, 606.93, 596.97)
  const keptOf = (kind: string, b = at) => ({ ...on(unit(id('b'), 371, kind, []), b), kept: true as const })
  it("states a source unit of a group between ties, now a kept block's line, a line of addresses kept whole (F)", () => {
    const today = on(unit(id('a'), 321, 'affiliation', [ph('\\normalsize'), text('\n'), ph('\\{'), text('ada,'), ph('~'), text('alan'), ph('\\}'), text('@example.org\n')]), at)
    expect(said(statedOf([today], [keptOf('inknotes')]))).toEqual([[321, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.addresses}`]])
  })
  it('states a footnote whose bracket group is now one element of it held whole (f)', () => {
    const line = box(80.3, 282.73, 87.44, 94, 85)
    const today = on(unit(id('a'), 2, 'footnote', [text('Correspondence: [first name]@example.com.')]), line)
    const mine = { ...on(unit(id('b'), 2, 'footnote', [text('Correspondence: '), ph('[first name]@example.com'), text('.')]), line), elements: [{ k: 1, kind: 'other', segs: [box(150, 280, 87.44, 94, 85)] }] }
    expect(said(statedOf([today], [mine]))).toEqual([[2, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.held}`]])
  })
  it('reads an identifier placeholder as its characters, and today\'s `\\_` as an underscore (lane literal-fixes)', () => {
    expect([readingOf('\\_'), readingOf('\\textunderscore')]).toEqual(['_', '_'])
    expect(readingOf('llm\\_equal\\_human')).toBe('llm_equal_human')
    expect(readingOf('[sentence\\_1]')).toBe('[sentence_1]')
    expect(readingOf('\\{root\\_question\\}')).toBe('{root_question}')
    expect(readingOf('CallbackBase.host\\_label(result)')).toBe('CallbackBase.host_label(result)')
    for (const src of ['\\code{a\\_b}', '1994.', 'conv1', 'a\\_b c', 'jatin\\_x@']) expect(readingOf(src)).toBe(null)
  })
  it('states a unit whose words joined by `\\_` are now one identifier element held whole (f)', () => {
    // (2608.25210v2 p3's prose: today's text pieces between `\_` placeholders, v2's one element as the source writes it)
    const line = box(317.9, 559.7, 450, 459.6, 448)
    // (today's `\_` pieces inked, as its dump states them: each underscore's glyph)
    const today = { ...on(unit(id('a'), 55, 'para', [text('Ask llm'), ph('\\_'), text('equal'), ph('\\_'), text('human now.')]), line), elements: [1, 3].map((k) => ({ k, kind: 'macro', segs: [box(350 + 10 * k, 354 + 10 * k, 450, 459.6, 448)] })) }
    const mine = { ...on(unit(id('b'), 55, 'para', [text('Ask '), ph('llm\\_equal\\_human'), text(' now.')]), line), elements: [{ k: 1, kind: 'code', segs: [box(340, 420, 450, 459.6, 448)] }] }
    expect(said(statedOf([today], [mine]))).toEqual([[55, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.held}`]])
  })
  it('reads a text symbol as its character whatever ink a dump states of it, any other placeholder with no ink of its own as nothing (f)', () => {
    // (2608.25210v2 p6's shape: today's dump lists `\%`, `\_` and a `\code{…}` head among its elements with no ink of their own,
    // the candidate's lists an element only with its ink; the unit's id moved with its identifier, now an element)
    const line = box(72, 540, 450, 459.6, 448)
    const today = {
      ...on(unit(id('a'), 139, 'para', [ph('\\code{run\\_id}'), text(': we ran llm'), ph('\\_'), text('s, about 1'), ph('\\%'), text(' of them.')]), line),
      elements: [0, 3, 5].map((k) => ({ k, kind: 'macro', segs: [] as Line[] })),
    }
    const mine = {
      ...on(unit(id('b'), 126, 'para', [ph('\\code{run\\_id}'), text(': we ran '), ph('llm\\_s'), text(', about 1'), ph('\\%'), text(' of them.')]), line),
      elements: [{ k: 2, kind: 'code', segs: [box(150, 180, 450, 459.6, 448)] }],
    }
    expect(said(statedOf([today], [mine]))).toEqual([[139, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.held}`]])
    // (an element with ink of its own on both sides is read as before: a citation an unread mark on each)
    const cite = (u: typeof mine, k: number) => ({ ...u, pieces: [...u.pieces, { k: 9, kind: 'ph', src: '\\cite{x}' }], elements: [...u.elements, { k: 9, kind: 'cite', segs: [box(500, 520, 450, 459.6, 448)] }].filter((e) => e.k !== k) })
    expect(said(statedOf([cite(today, -1)], [cite(mine, -1)]))).toEqual([[139, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.held}`]])
  })
  it("states a note of addresses alone a kept block of its kind holds as (F), before that block stands for it, its lines today's or not", () => {
    const today = on(unit(id('a'), 504, 'inknotes', [text('{ada, alan}@example.org')]), box(211.38, 383.89, 675.49, 681.6, 673.9))
    for (const b of [box(211.38, 383.83, 675.49, 681.6, 673.9), box(211.38, 383.89, 675.49, 681.6, 673.9)])
      expect(said(statedOf([today], [keptOf('inknotes', b)]))).toEqual([[504, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.addresses}`]])
    // (a note with a word besides: as before, the stand-in's)
    const other = on(unit(id('a'), 504, 'inknotes', [text('Contact: {ada, alan}@example.org')]), box(211.38, 383.89, 675.49, 681.6, 673.9))
    expect(said(statedOf([other], [keptOf('inknotes', box(211.38, 383.89, 675.49, 681.6, 673.9))]))).toEqual([[504, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.kept}`]])
  })
})

describe("(f), a stand-in of today's kind: one v2 unit of its kind at its place holding today's whole text in order", () => {
  // (2610.19159v1 t3804's shape: a transcript box's title, today's two figure texts in two faces, rebuild/run-on-kept's one; the
  // joined line stands for today's second piece, its text today's and more)
  const title = on(unit(id('b'), 3804, 'inkfigures', [text('Agent Action: Write (Self-directed scope reduction)')]), box(81.33, 284.69, 544.94, 551.16, 543.09))
  it('states it held whole by that unit', () => {
    const base = [on(unit(id('a'), 3804, 'inkfigures', [text('(Self-directed scope reduction)')]), box(124.42, 284.69, 544.94, 551.16, 543.09))]
    expect(said(statedOf(base, [title]))).toEqual([[3804, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.held}`]])
  })

  it('reads a group of local parts now one element of the stand-in by its characters, braces too (2610.37668v1 t415)', () => {
    // (today's "Contact information: {ada, alan}@example.org" as text; v2's the words and the group one kept run, its source the
    // characters the page sets: held whole. Read without its braces, the element is another address, and the unit another reading)
    const at = box(61.77, 258.02, 98.95, 104.96, 96.7)
    const base = [on(unit(id('a'), 415, 'inkorphan', [text('Contact information: {ada, alan}@example.org')]), at)]
    const standIn = (src: string) => [{ ...on(unit(id('b'), 415, 'inkorphan', [text('Contact information: '), ph(src)]), at), elements: [{ k: 1, kind: 'url', segs: [box(136.23, 258.02, 98.95, 104.96, 96.7)] }] }]
    expect(said(statedOf(base, standIn('\\url{{ada,alan}@example.org}')))).toEqual([[415, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.held}`]])
    expect(said(statedOf(base, standIn('\\url{ada,alan@example.org}')))).toEqual([[415, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.another}`]])
  })

  it('states another reading where today holds a character the stand-in has not, or holds them in another order', () => {
    for (const s of ['(Self-directed scope reductions)', '(scope reduction Self-directed)'])
      expect(said(statedOf([on(unit(id('a'), 3804, 'inkfigures', [text(s)]), box(124.42, 284.69, 544.94, 551.16, 543.09))], [title]))).toEqual([
        [3804, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.another}`],
      ])
  })
})

describe("(j) a unit split: its text one contiguous part of consecutive v2 units' text, in reading order, each on its box", () => {
  // (2610.19159v1 t1906's shape: today's orphan line, v2's two figure texts on it, one after the other)
  const base = [on(unit(id('a'), 1906, 'inkorphan', [text('Agent Message (Lenient Self-verification)')]), box(81.33, 284.69, 544.94, 551.16, 543.09))]
  const head = on(unit(id('b'), 3967, 'inkfigures', [text('Agent Message')]), box(81.33, 118.44, 544.94, 551.14, 543.1))
  const rest = on(unit(id('c'), 3968, 'inkfigures', [text('(Lenient Self-verification)')]), box(124.42, 284.69, 544.94, 551.16, 543.09))
  it('states it split where the units are consecutive and every character of today is theirs, in order', () => {
    expect(said(statedOf(base, [head, rest]))).toEqual([[1906, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.split}`]])
  })

  it('states nothing where another unit stands between them in reading order, or a character of today is no one\'s', () => {
    expect(statedOf(base, [head, { ...rest, ord: 3970 }, on(unit(id('d'), 3969, 'para', [text('x')]), box(72, 300, 300, 308, 298))])).toEqual([])
    const more = [on(unit(id('a'), 1906, 'inkorphan', [text('Agent Message: (Lenient Self-verification)')]), box(81.33, 284.69, 544.94, 551.16, 543.09))]
    expect(statedOf(more, [head, rest])).toEqual([])
  })
})

describe("(l) today's ink unit a source unit of v2's now holds, its formulas read apart (the coordinator's ruling of 2026-11-10, round 8 B5)", () => {
  // (2610.21377v1 pp. 34-43: today's front end lost TeX's math at a `$…\)` and read the pages off arXiv's ink; v2's reads them
  // as TeX's paragraphs. Today's ink unit splits a formula into placeholders and the upright digits its ledger read as text,
  // v2's unit holds it as one math element: each formula's span one placeholder on both sides, the rest exactly today's)
  // (today's placeholders each an element of its ink, as the dumps state an ink unit's formulas)
  const today = (pieces: DumpPiece[]) => {
    const u = on(unit(id('a'), 472, 'inkorphan', pieces), box(173.4, 384.7, 607.12, 611.8, 604))
    u.elements = pieces.flatMap((p, k) => (p.kind === 'ph' ? [{ k, kind: 'math', segs: [] }] : []))
    return [u]
  }
  const source = (pieces: DumpPiece[], math: number[]) => {
    const n = { ...on(unit(id('b'), 215, 'para', pieces), box(59.53, 537.43, 607.12, 615, 600)), state: 'drawn' }
    n.elements = math.map((k) => ({ k, kind: 'math', segs: [] }))
    return n
  }
  const v2 = source(
    [text('Hence '), ph('$\\pi=0$'), text(' on '), ph('$[a,b]$'), text('. By symmetry, also '), ph('$\\pi=0$'), text(' on '), ph('$(0,1)$'), text('. We conclude.')],
    [1, 3, 5, 7],
  )
  const why = `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.seen}`
  it('states it held, today\'s formula runs and their digits one placeholder, its text a contiguous stretch of v2\'s', () => {
    const base = today([text('. By symmetry, also '), ph('$π=$'), text(' 0 on '), ph('$($'), text('0'), ph('$,$'), text(' 1'), ph('$)$'), text('.')])
    expect(said(statedOf(base, [v2]))).toEqual([[472, why]])
  })
  it('states nothing where a word differs, today\'s text has a hole v2 fills, or the holder is no source unit', () => {
    expect(statedOf(today([text('. By symmetry, too '), ph('$π=$'), text(' 0 on')]), [v2])).toEqual([])
    expect(statedOf(today([text('Hence '), ph('$π=$'), text(' 0 on. By symmetry')]), [v2])).toEqual([])
    expect(statedOf(today([text('. By symmetry, also '), ph('$π=$'), text(' 0 on')]), [{ ...v2, kind: 'inkfigures' }])).toEqual([])
  })
  it('states nothing for a unit of formulas alone: no text of today\'s to read', () => {
    expect(statedOf(today([ph('$π=$'), text(' 0')]), [v2])).toEqual([])
  })
})

describe("(l') what the reader sees: v2's elements and label as their ink prints them, TeX's ligatures, small capitals by their face (round 8 B5)", () => {
  // (2610.21377v1: "Proposition 2.6" a \cref, "4.7" a heading's label, "state--adjoint", the headings' small capitals: each read
  // on both sides as arXiv prints it)
  const ink = (s: string, x: number, y: number, base = 'LinLibertineT') =>
    [...s].map((u, i) => ({ ...glyph(u, x + 5 * i, x + 5 * i + 5, y, 10), base }))
  const today = (pieces: DumpPiece[], at: Line) => {
    const u = on(unit(id('a'), 465, 'inkorphan', pieces), at)
    u.elements = pieces.flatMap((p, k) => (p.kind === 'ph' ? [{ k, kind: 'math', segs: [] }] : []))
    return [u]
  }
  const source = (kind: string, pieces: DumpPiece[], els: { k: number; kind: string; segs: Line[] }[], at: Line) => {
    const n = { ...on(unit(id('b'), 215, kind, pieces), at), state: 'drawn' }
    n.elements = els
    return n
  }
  const why = `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.seen}`
  it('reads a reference of v2\'s by its ink, the formulas apart', () => {
    const at = box(60, 400, 600, 608, 598)
    const v2 = source('para', [text('as in '), ph('\\cref{p}'), text(' we have '), ph('$x$'), text(' here.')], [{ k: 1, kind: 'ref', segs: [box(90, 165, 600, 607, 599)] }, { k: 3, kind: 'math', segs: [] }], at)
    const glyphs = () => ink('Proposition2.6', 90, 600)
    expect(said(statedOf(today([text('as in Proposition 2.6 we have '), ph('$x$'), text(' here.')], at), [v2], { glyphs }))).toEqual([[465, why]])
    expect(statedOf(today([text('as in Lemma 3.1 we have '), ph('$x$'), text(' here.')], at), [v2], { glyphs })).toEqual([])
  })
  it("reads v2's label by its ink, and its text through TeX's ligatures", () => {
    const at = box(60, 400, 600, 608, 598)
    const head = { ...source('heading', [text("The state--adjoint pair, ``dual'' and Baire's---all")], [], at), label: [{ kind: 'number', ...box(60, 75, 600, 607, 599) }] }
    const glyphs = () => ink('4.7', 60, 600)
    expect(said(statedOf(today([text('4.7 The state–adjoint pair, “dual” and Baire’s—all')], at), [head], { glyphs }))).toEqual([[465, why]])
  })
  it('compares letters case apart only where today\'s glyphs are in a face of small capitals', () => {
    const at = box(60, 400, 600, 608, 598)
    const head = source('heading', [text('Proof of Proposition')], [], at)
    const set = (base: string) => () => ink('proofofproposition', 60, 600, base)
    expect(said(statedOf(today([text('proof of proposition')], at), [head], { glyphs: set('CMCSC10') }))).toEqual([[465, why]])
    expect(statedOf(today([text('proof of proposition')], at), [head], { glyphs: set('CMR10') })).toEqual([])
  })
})

describe("a stand-in that reads otherwise and the units after it: (j) from the stand-in, (g) over its parts (the coordinator's rulings of 2026-11-10, round 8 B3)", () => {
  // (rebuild/author-lines-3 parts an ink unit where TeX ended a paragraph: today's one unit over two of TeX's paragraphs, v2's
  // two, the first of today's kind at its place, so a stand-in)
  const A = box(72, 300, 600, 608, 598),
    B = box(72, 260, 588, 596, 586)
  const today = (s: string, kind = 'inkorphan', ord = 172) => [on(unit(id('a'), ord, kind, [text(s)]), A, B)]
  const part = (c: string, ord: number, kind: string, s: string, l: Line) => ({ ...on(unit(id(c), ord, kind, [text(s)]), l), state: 'drawn' })
  it("(A) states one whose text is the stand-in's and the next units' in order, on its lines, split (2608.27728v1 t172, 2610.30875v1 t303)", () => {
    const parts = [part('b', 172, 'inkorphan', 'CCS Concepts', A), part('c', 173, 'inkorphan', 'Computing methodologies', B)]
    expect(said(statedOf(today('CCS Concepts Computing methodologies'), parts))).toEqual([[172, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.split}`]])
    // (a character of today's no part's, or a unit between them: another reading, as before)
    expect(said(statedOf(today('CCS Concepts: Computing methodologies'), parts))).toEqual([[172, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.another}`]])
    const apart = [parts[0]!, { ...parts[1]!, ord: 175 }, part('d', 174, 'para', 'x', box(72, 300, 300, 308, 298))]
    expect(said(statedOf(today('CCS Concepts Computing methodologies'), apart))).toEqual([[172, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.another}`]])
  })
  // (cas-common's page-foot note of the e-mails, today's names unit, v2's parted into notes at TeX's paragraph ends: our old
  // compile set "(. Chung)", arXiv "(M. Chung)")
  const word = (s: string, x: number, y: number) => [...s].map((ch, i) => glyph(ch, x + 5 * i, x + 5 * i + 5, y, 10))
  const arxiv = (a: string, b: string) => (page: number) => (page === 1 ? [...word(a, 72, 600), ...word(b, 72, 588)] : null)
  const notes = [part('b', 588, 'inknotes', '(M. Chung);', A), part('c', 589, 'inknotes', '(J.M. Solomon)', B)]
  it("(B) states one whose parts' text is arXiv's glyph text on its lines, today's a subsequence of it, another reading over its parts, now arXiv's (2610.21084v1 t587)", () => {
    const t = today('(. Chung); (.M. Solomon)', 'inknames', 587)
    expect(said(statedOf(t, notes, { glyphs: arxiv('(M.Chung);', '(J.M.Solomon)') }))).toEqual([
      [587, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.arxivParts}`],
    ])
    // (arXiv's glyphs on its lines not the parts' text, exactly; today's no subsequence; no glyphs read: another reading)
    expect(said(statedOf(t, notes, { glyphs: arxiv('(M.Chung);x', '(J.M.Solomon)') }))).toEqual([[587, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.another}`]])
    expect(said(statedOf(today('(. Cheung); (.M. Solomon)', 'inknames', 587), notes, { glyphs: arxiv('(M.Chung);', '(J.M.Solomon)') }))).toEqual([
      [587, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.another}`],
    ])
    expect(said(statedOf(t, notes))).toEqual([[587, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.another}`]])
    // (arXiv's glyphs read on the parts' own lines, where arXiv set them: today's line, short of the initials arXiv's has, ends
    // before them; 2610.21084v1's)
    const short = [on(unit(id('a'), 587, 'inknames', [text('(. Chung); (.M. Solomon)')]), box(72, 300, 600, 608, 598), box(72, 125, 588, 596, 586))]
    expect(said(statedOf(short, notes, { glyphs: arxiv('(M.Chung);', '(J.M.Solomon)') }))).toEqual([
      [587, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.arxivParts}`],
    ])
  })
})

describe("(i) for a unit set in a paragraph that sets a unit again (the coordinator's ruling of 2026-11-10, round 8 B3)", () => {
  // (2610.22065v1: acmart's reference format, one paragraph v2 re-sets as one ink unit; v2's own author units there unlocated
  // with that reason, today's author units its names, each held whole by the paragraph)
  const L = box(53, 300, 190, 198, 188)
  const today = [{ ...on(unit(id('a'), 1, 'author', [text('Ada Lee')]), L), state: 'drawn' }]
  const own = (why: string) => ({ id: id('a'), ord: 1, kind: 'author', text: '', pieces: today[0]!.pieces, state: 'unlaid', why })
  const paragraph = (s: string) => ({ ...on(unit(id('b'), 154, 'inkorphan', [text(s)]), L), state: 'drawn' })
  const RESET = 'unlocated: set in a paragraph that sets a unit again'
  it('states it held whole by the one drawn unit whose text holds its name, on its own unit', () => {
    const stated = statedOf(today, [own(RESET), paragraph('Ada Lee, Bo Chen. 2027. On tests.')])
    expect(said(stated)).toEqual([[1, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.held}`]])
    expect(stated[0]).toMatchObject({ cause: 'held', holder: id('b'), own: { ord: 1, why: RESET } })
  })
  it('states none for another reason, or where the unit does not hold the name whole', () => {
    expect(said(statedOf(today, [own('unlocated: no ink'), paragraph('Ada Lee, Bo Chen. 2027. On tests.')]))).toEqual([])
    expect(said(statedOf(today, [own(RESET), paragraph('Ada Li, Bo Chen. 2027. On tests.')]))).toEqual([])
  })
})

describe("its head's number in its phrase: a running head's alone", () => {
  it("states a running head whose number v2 reads in its phrase so, and no figure text joined with a number", () => {
    const head = (kind: string) => [{ ...unit(id('a'), 3, kind, [text('of 21')]), text: 'of 21' }]
    expect(said(statedOf(head('inkheads'), [{ ...unit(id('b'), 3, 'inkheads', [text('5 of 21')]), text: '5 of 21' }]))).toEqual([
      [3, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.head}`],
    ])
    const fig = statedOf([{ ...unit(id('a'), 3, 'inkfigures', [text('Full')]), text: 'Full' }], [{ ...unit(id('b'), 3, 'inkfigures', [text('Full 200')]), text: 'Full 200' }])
    expect(fig.map((s: { why: string }) => s.why)).not.toContain(`made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.head}`)
  })
})

describe('what the parity reads of a statement: the unit of v2\'s that holds today\'s whole', () => {
  it('names the holder of a unit held whole, by the block, and by the block\'s units (the one whose glyphs are today\'s), no other', () => {
    const one = statedOf([unit(id('a'), 1, 'inkorphan', [text('x')])], [unit(id('b'), 1, 'inknotes', [text('x')])])
    expect(one.map((s: { holder?: string; cause: string }) => [s.cause, s.holder])).toEqual([['held', id('b')]])
    const names = statedOf([unit(id('a'), 161, 'inkorphan', [text('Ada Lovelace,')])], [unit(id('b'), 161, 'inknames', [text('Ada Lovelace,')])])
    expect(names.map((s: { holder?: string; cause: string }) => [s.cause, s.holder])).toEqual([['names', id('b')]])
    const trail = { page: 1, x0: 325.12, x1: 339.69, top: 598, bottom: 586, baseline: 588.37, text: '7,8,' }
    const trailed = statedOf(
      [unit(id('a'), 185, 'inkorphan', [text('7,8, and')], [325.12, 362.44, 588.37])],
      [unit(id('b'), 185, 'inkorphan', [text('and')], [343.58, 362.44, 588.37])],
      { trails: [trail] },
    )
    expect(trailed.map((s: { holder?: string; cause: string }) => [s.cause, s.holder])).toEqual([['trail', undefined]])
  })
  it("names a names unit's stand-in of its ledger class as its holder where its characters are today's: its kind moved (2610.30034v1 t309-t311)", () => {
    // (the coordinator's ruling of 2026-11-10, round 8 B2b: today's run-in lead of a names line, v2's orphan line at its place,
    // made on arXiv's page with its characters in another order; the parity joins the two by the holder, as it did while (f)
    // stated them. One whose text is not today's holds no whole: none named)
    const moved = statedOf([unit(id('a'), 309, 'inknames', [text('ab c')])], [unit(id('b'), 12, 'inkorphan', [text('c ab')])])
    expect(moved.map((s: { holder?: string; cause: string }) => [s.cause, s.holder])).toEqual([['order', id('b')]])
    const refused = statedOf([unit(id('a'), 587, 'inknames', [text('(. Chung)')])], [{ ...unit(id('c'), 12, 'inknotes', [text('(M. Chung)')]), why: 'content difference: aonly' }])
    expect(refused.map((s: { holder?: string; cause: string }) => [s.cause, s.holder])).toEqual([['content', undefined]])
    // (a stand-in of today's own kind names none: no kind moved, the parity's joins by id and glyphs are its)
    const own = statedOf([unit(id('a'), 309, 'inknames', [text('ab c')])], [unit(id('b'), 12, 'inknames', [text('c ab')])])
    expect(own.map((s: { holder?: string; cause: string }) => [s.cause, s.holder])).toEqual([['order', undefined]])
  })
})

describe('a unit the candidate does not make whose lines lie inside a display the engine states (rebuild/display-marks)', () => {
  // (the coordinator's ruling of 2026-11-09: a display's ink is kept as part of the display; the engine states each display TeX
  // sets (the marked compile's regions), its text-mode glyphs read as text, and gives the stage its lines on arXiv's page,
  // `displays`: [page, x0, bottom, x1, top, baseline]. 2608.08481v1 t118-t121, (7)'s and (8)'s parts today translated, no unit
  // of v2's now)
  const D = [[1, 100, 190, 260, 205, 195.57]]
  it("states one absent from the candidate, every line inside a display line of the engine's, as kept as part of a display", () => {
    const base = [unit(id('a'), 118, 'inknotes', [text('x = '), ph('$y$')], [107.91, 253.18, 195.57])]
    expect(said(statedOf(base, [], { displays: D }))).toEqual([[118, CAUSE.displayPart]])
  })
  it('states nothing where a line lies outside every display line, or none is given, and keeps the earlier causes first', () => {
    const base = [unit(id('a'), 118, 'inknotes', [text('x = '), ph('$y$')], [107.91, 253.18, 195.57])]
    expect(said(statedOf(base, [], { displays: [[1, 100, 190, 200, 205, 195.57]] }))).toEqual([])
    expect(said(statedOf(base, [], { displays: [[2, 100, 190, 260, 205, 195.57]] }))).toEqual([])
    expect(said(statedOf(base, []))).toEqual([])
    const kept = { ...unit(id('b'), 141, 'inknotes', [], [107.91, 253.18, 195.57]), kept: true as const }
    expect(said(statedOf(base, [kept], { displays: D }))).toEqual([[118, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.kept}`]])
  })
})

describe("(k) a unit the prepare keeps for its text set wholly in a face of one pitch (the owner's ruling of 2026-11-10)", () => {
  // (Rule 1, PDF-READER §18.22: a prompt in `\ttfamily`, a figure's code line, kept as the paper has it. Today translated them,
  // so the differential read each as a loss: 2608.25210v2's prompts (laid), 2608.06701v1's figure code (unwrapped). The cause is
  // the candidate's own unit's, by the mark the prepare writes (the dump's `keptBy: 'pitch'`, the engine's `pitch`), the mark the
  // parity's ruling reads; a unit kept otherwise (a code environment's kept block, a crowded figure text) states none)
  it("states the cause of a unit marked kept by the rule, and of no other", () => {
    expect(keptWhyOf({ id: id('a'), kept: true, keptBy: 'pitch', state: 'laid' })).toBe(CAUSE.pitch)
    expect(keptWhyOf({ id: id('a'), keptBy: 'pitch', state: 'laid', why: 'unwrapped' })).toBe(CAUSE.pitch)
    expect(keptWhyOf({ id: id('a'), kept: true, state: 'laid' })).toBe(null)
    expect(keptWhyOf({ id: id('a'), state: 'laid', why: 'unwrapped' })).toBe(null)
    expect(keptWhyOf({ id: id('a'), state: 'drawn' })).toBe(null)
  })
  it('is no statement of a unit the candidate does not make: the candidate makes it, by its id', () => {
    const base = [unit(id('a'), 7, 'para', [text('{ "key": 1 }')])]
    const units = [{ ...unit(id('a'), 7, 'para', [text('{ "key": 1 }')]), kept: true as const, keptBy: 'pitch' }]
    expect(statedOf(base, units)).toEqual([])
  })
})

describe("(k) an identifier is never sent: what the prepare keeps whole as identifiers (the coordinator's ruling of 2026-11-10)", () => {
  // (lane literal-fixes, PDF-READER §18.25: a token holding an underscore between two word characters is no prose. A figure text
  // holding one is kept whole (the engine's `figure: identifier`, the dump's `keptBy: 'identifier'`); a cell of identifiers alone
  // is no unit (the front end's identifiersIn holds its whole text, no letter left to send); a line of ink of identifiers alone
  // is a kept block. Each is the original's text, no translation missing: the mark goes with the cause)
  const cause = (stated: { u: { ord: number }; why: string; keptBy?: string }[]) => stated.map(({ u, why, keptBy }) => [u.ord, why, keptBy])
  it("states the cause of a unit marked kept by the identifier rule, the candidate's own", () => {
    expect(keptWhyOf({ id: id('a'), keptBy: 'identifier', state: 'laid', why: 'unwrapped' })).toBe(CAUSE.identifier)
    expect(keptWhyOf({ id: id('a'), state: 'laid', why: 'unwrapped' })).toBe(null)
  })
  it('states a cell of identifiers alone, which the candidate makes no unit of, as kept by the rule, the mark with it', () => {
    // (today's text pieces between `\_` placeholders, as today's front end cut them; brackets and separators with them)
    const cells = [
      [text('response'), ph('\\_'), text('equal'), ph('\\_'), text('human')],
      [text('[sentence'), ph('\\_'), text('1], [sentence'), ph('\\_'), text('2]')],
      [text('conv3'), ph('\\_'), text('x')],
    ]
    for (const pieces of cells) expect(cause(statedOf([unit(id('a'), 72, 'cell', pieces)], []))).toEqual([[72, CAUSE.identifier, 'identifier']])
    // (and where the candidate's units on its line are kept blocks alone, no text of them sent)
    const kept = { ...unit(id('b'), 9, 'inkorphan', []), kept: true as const }
    expect(cause(statedOf([unit(id('a'), 72, 'cell', cells[0]!)], [kept]))).toEqual([[72, CAUSE.identifier, 'identifier']])
  })
  it("states a line of ink of identifiers alone a kept block holds as kept by the rule, before the block's own cause (2610.40394v1)", () => {
    const line = box(72, 140, 600, 608, 598)
    const today = on(unit(id('a'), 746, 'inkorphan', [text('main_text.md')]), line)
    const kept = { ...on(unit(id('b'), 740, 'inkorphan', []), line), kept: true as const }
    expect(cause(statedOf([today], [kept]))).toEqual([[746, CAUSE.identifier, 'identifier']])
  })
  it('states none where a word or a digit stands outside the identifiers, none holds one, or a unit the candidate sends holds it', () => {
    for (const pieces of [[text('see response'), ph('\\_'), text('equal')], [text('a'), ph('\\_'), text('b 12')], [text('response equal')], [text('x'), ph('$_1$')]])
      expect(statedOf([unit(id('a'), 72, 'cell', pieces)], [])).toEqual([])
    const sent = { ...unit(id('b'), 9, 'para', [text('Ask '), ph('response\\_equal'), text(' now.')]), elements: [{ k: 1, kind: 'code', segs: [box(100, 180, 600, 608, 598)] }] }
    // (today's `\\_` listed among its elements with no ink, as today's dumps list every one of them)
    const today = { ...unit(id('a'), 72, 'cell', [text('response'), ph('\\_'), text('equal')]), elements: [{ k: 1, kind: 'macro', segs: [] }] }
    expect(cause(statedOf([today], [sent]))).toEqual([
      [72, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.held}`, undefined],
    ])
  })
})

const ACCEPTANCE ='/Users/cheongzhiyan/Developer/readarxiv-lab-data/refactor-2026-11/baseline/acceptance.json'
describe.skipIf(!existsSync(ACCEPTANCE))("the differential's acceptance list (lab-data's baseline/acceptance.json)", () => {
  const accepted = (cause: string) =>
    (JSON.parse(readFileSync(ACCEPTANCE, 'utf8')) as { accepted: { match: string }[] }).accepted.some((e) =>
      new RegExp(e.match).test(cause),
    )
  it('accepts the ruled causes, and neither another reading nor lines kept whole outside a display the engine states', () => {
    for (const c of [CAUSE.scripts, CAUSE.names, CAUSE.trail, CAUSE.orderAsElement, CAUSE.display, CAUSE.held, CAUSE.heldBlock, CAUSE.addresses, CAUSE.split, CAUSE.arxivText, CAUSE.wrapped, CAUSE.seen])
      expect(accepted(`made on arXiv's page as ${'b'.repeat(12)}: ${c}`)).toBe(true)
    // ((k): the candidate's own unit's cause, no statement's; and an identifier's, the candidate's own or stated with its mark)
    expect(accepted(CAUSE.pitch)).toBe(true)
    // ((n), the coordinator's ruling of 2026-11-10 to lane fig-text: a stretch a decoration holds, kept with it)
    expect(accepted(CAUSE.decoration)).toBe(true)
    expect(accepted(CAUSE.identifier)).toBe(true)
    expect(accepted('unwrapped')).toBe(false)
    expect(accepted('laid')).toBe(false)
    expect(accepted(`made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.another}`)).toBe(false)
    expect(accepted(`made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.kept}`)).toBe(false)
    expect(accepted(`made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.heldKept}`)).toBe(false)
    expect(accepted(CAUSE.displayPart)).toBe(true)
  })
})

describe("(k) on elements and (n): today's unit now wholly an element a figure text keeps as the original's ink", () => {
  // (2608.06701v1 p1's shape: today's "Observation" and its run of one pitch "The path", two units; F0's one figure text, the run
  // an element marked kept for its pitch, its box today's line)
  const word = on(unit(id('a'), 344, 'inkfigures', [text('Observation')]), box(417.26, 449.1, 584.91, 588.75, 583.85))
  const path = on(unit(id('c'), 346, 'inkfigures', [text('The path')]), box(452.39, 475.56, 584.91, 588.55, 583.85))
  const joined = (keptBy: string | undefined, src = 'The path') => [
    {
      ...on(unit(id('b'), 344, 'inkfigures', [text('Observation'), text(':'), text(' '), ph(src)]), box(417.26, 475.56, 584.91, 588.75, 583.85)),
      elements: [{ k: 3, kind: 'code', ...(keptBy ? { keptBy } : {}), segs: [box(452.39, 475.56, 584.91, 588.55, 583.85)] }],
    },
  ]
  it('states the run kept as the original for its pitch, held by the text; the words before it held whole', () => {
    const stated = statedOf([word, path], joined('pitch'))
    expect(said(stated)).toEqual([
      [344, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.held}`],
      [346, CAUSE.pitch],
    ])
    expect(stated[1].holder).toBe(id('b'))
  })
  it('states a stretch a decoration holds kept with it (n), and no element of another source, nor one not kept, so', () => {
    expect(said(statedOf([path], joined('decoration')))).toEqual([[346, CAUSE.decoration]])
    expect(said(statedOf([path], joined('pitch', 'The paths')))).not.toEqual([[346, CAUSE.pitch]])
    expect(said(statedOf([path], joined(undefined)))).not.toEqual([[346, CAUSE.pitch]])
  })
})

describe("(f) over (g): a stand-in that holds today's text whole, in order, a run of one pitch after it (F0's line)", () => {
  // (2608.06701v1 p1: today's "Action:" and its command, two units; F0's one figure text on today's line, its command an element
  // kept for its pitch. Today's text a contiguous part of the stand-in's: held whole by it, its holder named for the parity's
  // joined join, never "another reading, now arXiv's text", which is characters our old compile did not set)
  it('states today’s words held whole by the line, and its command kept for its pitch, both naming the line', () => {
    const action = on(unit(id('a'), 343, 'inkfigures', [text('Action:')]), box(417.26, 435.6, 591.04, 595.03, 590.14))
    const command = on(unit(id('c'), 344, 'inkfigures', [text('view x.py')]), box(438.05, 545.39, 591.04, 594.06, 590.14))
    const line = {
      ...on(unit(id('b'), 343, 'inkfigures', [text('Action: '), ph('view x.py')]), box(417.26, 545.39, 591.04, 595.03, 590.14)),
      state: 'drawn',
      elements: [{ k: 1, kind: 'code', keptBy: 'pitch', segs: [box(438.05, 545.39, 591.04, 594.06, 590.14)] }],
    }
    const stated = statedOf([action, command], [line])
    expect(said(stated)).toEqual([
      [343, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.held}`],
      [344, CAUSE.pitch],
    ])
    expect(stated.map((s: { holder?: string }) => s.holder)).toEqual([id('b'), id('b')])
  })
})

describe("(m) a unit of today's inside a formula of a figure, kept as the original (F1)", () => {
  // (2609.19644v1 p37: today's "Mah" and "(OOD) =", runs of KaTeX's upright face beside its math italic; F1's one line, a formula
  // with no word outside it, kept whole: `keptBy: 'formula'`)
  const mah = on(unit(id('a'), 1619, 'inkfigures', [text('Mah')]), box(268, 280, 480, 484, 478))
  const ood = on(unit(id('c'), 1618, 'inkfigures', [text('(OOD) =')]), box(280, 300, 481, 486, 479))
  const line = {
    ...on(unit(id('b'), 1618, 'inkfigures', [text('PMah(OOD) = 0.5')]), box(262, 330, 481, 487, 478)),
    state: 'laid',
    keptBy: 'formula',
    why: CAUSE.formula,
  }
  it('states each kept inside the formula, the line its holder; the line itself states the same cause', () => {
    const stated = statedOf([mah, ood], [line])
    expect(said(stated)).toEqual([
      [1619, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.formula}`],
      [1618, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.formula}`],
    ])
    expect(keptWhyOf({ keptBy: 'formula' })).toBe(CAUSE.formula)
  })
  it('states a run now wholly a formula element of a line with words kept as the original inside a formula', () => {
    const x = on(unit(id('a'), 7, 'inkfigures', [text('Lflow')]), box(100, 120, 300, 306, 298))
    const text1 = {
      ...on(unit(id('b'), 7, 'inkfigures', [ph('Lflow'), text(' for the loss')]), box(100, 200, 300, 306, 298)),
      state: 'drawn',
      elements: [{ k: 0, kind: 'math', keptBy: 'formula', segs: [box(100, 120, 300, 306, 298)] }],
    }
    expect(said(statedOf([x], [text1]))).toEqual([[7, CAUSE.formula]])
  })
})

describe('(k) by group: a source unit the candidate writes as one source, a group of it kept as an element for its pitch', () => {
  // (lane b5-fixes, PDF-READER §18.22's Rule 1 read by group: 2608.25210v2 p3's `\mypython{…}` box and 1810.04805v2's
  // `{\tt [CLS]}`, one element `code` of the candidate's unit, the dump's element `keptBy: 'pitch'`. The unit is today's, the same
  // TeX source, but its id moved with its content: absent from the candidate, read as no statement, it was a loss)
  const today = () =>
    unit(id('a'), 35, 'para', [text('a token ('), { kind: 'open', src: '{' }, ph('\\tt'), text(' [CLS]'), { kind: 'close', src: '}' }, text(') first')])
  const mine = (keptBy?: 'pitch') => {
    const n = unit(id('b'), 35, 'para', [text('a token ('), ph('{\\tt [CLS]}'), text(') first')])
    n.elements = [{ k: 1, kind: 'code', segs: [box(110, 140, 600, 608, 598)], ...(keptBy ? { keptBy } : {}) }]
    return n
  }
  it('states it written as the candidate’s unit with its group kept as the original, holding it', () => {
    const got = statedOf([today()], [mine('pitch')])
    expect(said(got)).toEqual([[35, `written as ${'b'.repeat(12)}: ${CAUSE.pitchGroup}`]])
    expect(got[0].holder).toBe(id('b'))
  })
  it('states none where the source differs or no element of the candidate’s is kept for its pitch', () => {
    // (no element kept for its pitch: no group of it kept; the unit the candidate writes as today's TeX is (o)'s, lane
    // style-wire's, merged after this lane in round 8 B8)
    expect(said(statedOf([today()], [mine()])).map(([, w]) => w)).toEqual([`written as ${'b'.repeat(12)}: ${CAUSE.characters}`])
    const other = mine('pitch')
    other.pieces = [text('a token ('), ph('{\\tt [SEP]}'), text(') first')].map((p, k) => ({ k, ...p }))
    expect(statedOf([today()], [other])).toEqual([])
  })
})

// (B of lane style-wire, the coordinator's ruling of 2026-11-11: `\%`, `\&`, `\#`, `\$`, `\{`, `\}` and textcomp's \textasciitilde,
// \textbar, \textless, \textgreater, \textbackslash are characters of the candidate's text, so a unit holding one has a new id; it
// is today's unit, written as today's TeX with each of those placeholders its character, wherever the two lay it)
describe('a statement naming a holder: its cause declares how the parity joins it (HOLDER_JOIN), or the statement is refused', () => {
  // (round 8 B8: style-wire's (o) `characters` named a holder the parity's join did not read, after b5-fixes' `pitchGroup` had
  // been added to the join's own list by hand; the join now reads this table, and a cause it does not declare stops the run)
  it('declares every cause a statement names a holder by, each joined whole or as an element, and no other kind', () => {
    for (const [cause, how] of Object.entries(HOLDER_JOIN)) {
      expect(['whole', 'element']).toContain(how)
      expect(cause in CAUSE || cause === 'pitchGroup' || cause === 'characters').toBe(true)
    }
  })
  it('refuses a statement naming a holder by a cause it does not declare, and passes one without a holder', () => {
    expect(() => holdersDeclared([{ cause: 'newCause', holder: 'b'.repeat(64) }])).toThrow(/newCause/)
    expect(holdersDeclared([{ cause: 'newCause' }])).toEqual([{ cause: 'newCause' }])
    expect(holdersDeclared([{ cause: 'characters', holder: 'b'.repeat(64) }])).toHaveLength(1)
  })
})

describe('a unit the candidate writes both ways: a group kept as an element for its pitch, the rest as (o) reads today\'s TeX', () => {
  // (round 8 B8's merge of rebuild/b5-fixes and rebuild/style-wire: 2610.20848v1's references hold REVTeX's `\bibinfo` pairs
  // and groups that carry nothing, which (o) writes as their content, and a link around a `{\tt …}` group the candidate keeps
  // as an element for its pitch, which makes the whole link one placeholder of the same TeX. Each rule alone left such a unit
  // unstated (31 units of 4 papers lost at r16); read together it is today's unit, written as v2 writes it, its one-pitch
  // group the original's)
  const today = () =>
    unit(id('a'), 40, 'reference', [
      { kind: 'open', src: '\\bibinfo{author}{' },
      { kind: 'open', src: '{' },
      text('De'),
      { kind: 'close', src: '}' },
      text(', K.'),
      { kind: 'close', src: '}' },
      text(', see '),
      { kind: 'open', src: '\\href{http://x.org/1509}{' },
      { kind: 'open', src: '{' },
      ph('\\tt'),
      text(' arXiv:1509'),
      { kind: 'close', src: '}' },
      { kind: 'close', src: '}' },
      text('.'),
    ])
  const mine = (keptBy?: 'pitch') => {
    const n = {
      ...unit(id('b'), 40, 'reference', [text('De, K., see '), ph('\\href{http://x.org/1509}{{\\tt arXiv:1509}}'), text('.')]),
      state: 'drawn',
    }
    n.elements = [{ k: 9, kind: 'code', segs: [box(110, 140, 600, 608, 598)], ...(keptBy ? { keptBy } : {}) }]
    return n
  }
  it('states it written as the candidate’s unit with its group kept as the original', () => {
    const got = statedOf([today()], [mine('pitch')])
    expect(said(got)).toEqual([[40, `written as ${'b'.repeat(12)}: ${CAUSE.pitchGroup}`]])
    expect(got[0].holder).toBe(id('b'))
  })
  it('states (o) where the placeholder holds no group kept for its pitch, and none where its TeX is not today’s', () => {
    expect(said(statedOf([today()], [mine()]))).toEqual([[40, `written as ${'b'.repeat(12)}: ${CAUSE.characters}`]])
    const other = mine('pitch')
    other.pieces = [text('De, K., see '), ph('\\href{http://x.org/1510}{{\\tt arXiv:1510}}'), text('.')].map((p, k) => ({ k, ...p }))
    expect(said(statedOf([today()], [other]))).toEqual([])
  })
})

describe("today's unit the candidate writes with its escaped characters as text", () => {
  it('is that unit, by its source, whatever line either lays it on', () => {
    const today = unit(id('a'), 263, 'para', [text('Gain of 5'), ph('\\%'), text(' on R'), ph('\\&'), text('D, see '), ph('$x$'), text('.')], [72, 300, 646])
    const v2 = { ...unit(id('b'), 140, 'para', [text('Gain of 5% on R&D, see '), ph('$x$'), text('.')], [72, 300, 634]), state: 'drawn' }
    expect(said(statedOf([today], [v2]))).toEqual([[263, `written as ${'b'.repeat(12)}: ${CAUSE.characters}`]])
  })
  it("reads a control word's skipped space and a group around one alone as TeX does", () => {
    const today = unit(id('a'), 5, 'reference', [text('See www.x.org/'), ph('\\textasciitilde'), text(' aeb and '), { kind: 'open', src: '{' }, ph('\\%'), { kind: 'close', src: '}' }, text(' more, 2.08 '), ph('\\textgreater{}'), text(' q.')])
    const v2 = { ...unit(id('b'), 5, 'reference', [text('See www.x.org/~aeb and % more, 2.08 > q.')]), state: 'drawn' }
    expect(said(statedOf([today], [v2]))).toEqual([[5, `written as ${'b'.repeat(12)}: ${CAUSE.characters}`]])
  })
  it('is no such unit where anything else differs, or where today held none of those placeholders', () => {
    const today = unit(id('a'), 7, 'para', [text('Gain of 5'), ph('\\%'), text(' here.')])
    expect(String(said(statedOf([today], [{ ...unit(id('b'), 7, 'para', [text('Gain of 6% here.')]), state: 'drawn' }]))[0]?.[1] ?? '')).not.toContain(CAUSE.characters)
    const plain = unit(id('c'), 8, 'para', [text('Plain words here.')])
    expect(String(said(statedOf([plain], [{ ...unit(id('d'), 8, 'para', [text('Plain words here.')]), state: 'drawn' }]))[0]?.[1] ?? '')).not.toContain(CAUSE.characters)
  })
})

// (C of lane style-wire, 2026-11-11: a group that carries nothing, a pair that sets its argument alone or a bare group with no
// declaration of its own, is its content in v2's unit, so the unit has a new id: today's unit, written with such groups'
// opens and closes out, is it)
describe("today's unit the candidate writes with a group that carries nothing as its content", () => {
  const open = (src: string): DumpPiece => ({ kind: 'open', src })
  const close = (src = '}'): DumpPiece => ({ kind: 'close', src })
  it('is that unit, its other groups and every element and word as today\'s, alone or with an escaped character as text', () => {
    const today = unit(id('a'), 30, 'reference', [text('A. Author, '), open('\\bibinfo{title}{'), text('A study of '), open('{'), text('GPU'), close(), text(' kernels'), close(), text(', '), open('\\emph{'), text('Nature'), close(), text(' 5'), ph('\\%'), text('.')])
    const v2 = { ...unit(id('b'), 30, 'reference', [text('A. Author, A study of GPU kernels, '), open('\\emph{'), text('Nature'), close(), text(' 5%.')]), state: 'drawn' }
    expect(said(statedOf([today], [v2]))).toEqual([[30, `written as ${'b'.repeat(12)}: ${CAUSE.characters}`]])
  })
  it('is that unit where a pair v2 writes as nothing stood between two spaces, white space read as one space (2608.25210v2)', () => {
    const today = unit(id('a'), 31, 'para', [text('The cost of '), open('\\techreport{'), text(' the plan '), close(), text(' is computed.')])
    const v2 = { ...unit(id('b'), 31, 'para', [text('The cost of the plan is computed.')]), state: 'drawn' }
    expect(said(statedOf([today], [v2]))).toEqual([[31, `written as ${'b'.repeat(12)}: ${CAUSE.characters}`]])
  })
  it('is that unit where two such pairs stand a space apart (2610.22065v1\'s entries: `}. \\bibinfo{year}{`)', () => {
    const today = unit(id('a'), 33, 'reference', [open('\\bibfield{author}{'), open('\\bibinfo{person}{'), text('Samira Abnar'), close(), text('.'), close(), text(' '), open('\\bibinfo{year}{'), text('2020'), close(), text('.')])
    const v2 = { ...unit(id('b'), 33, 'reference', [text('Samira Abnar. 2020.')]), state: 'drawn' }
    expect(said(statedOf([today], [v2]))).toEqual([[33, `written as ${'b'.repeat(12)}: ${CAUSE.characters}`]])
  })
  it('is that unit where today\'s placeholder is a link with no address v2 reads as its argument (\\href@noop, step D)', () => {
    const today = unit(id('a'), 34, 'reference', [text('D. M. Sussman, '), ph('\\href@noop {} {\\bibfield  {journal} {\\bibinfo  {journal} {SoftwareX}\\ }\\textbf {\\bibinfo {volume} {6}},\\ \\bibinfo {pages} {16} (\\bibinfo {year} {2017})}')])
    const v2 = { ...unit(id('b'), 34, 'reference', [text('D. M. Sussman, SoftwareX'), ph('\\ '), open('\\textbf {'), ph('6'), close(), text(','), ph('\\ '), ph('16'), text(' ('), ph('2017'), text(')')]), state: 'drawn' }
    expect(said(statedOf([today], [v2]))).toEqual([[34, `written as ${'b'.repeat(12)}: ${CAUSE.characters}`]])
    // (as the front end reads it in an entry: \\bibinfo's two arguments, then a group of the entry's own holding \\natexlab{b},
    // a placeholder; an accent its letter: 2307.16209v1's)
    const lab = unit(id('d'), 35, 'reference', [text('A. B, '), ph('\\href@noop {} {\\emph {\\bibinfo {booktitle} {Studies on the Painlev\\\'e Equations}}\\ (\\bibinfo\n  {year} {1981}{\\natexlab{b}})}')])
    const v2lab = { ...unit(id('e'), 35, 'reference', [text('A. B, '), open('\\emph {'), text('Studies on the Painlev\u00e9 Equations'), close(), ph('\\ '), text('('), ph('1981'), ph('\\natexlab{b}'), text(')')]), state: 'drawn' }
    expect(said(statedOf([lab], [v2lab]))).toEqual([[35, `written as ${'e'.repeat(12)}: ${CAUSE.characters}`]])
    // (a link with no address that holds no word of its own: 2610.20451v1's `\\href@noop {} {\\  (\\bibinfo {year} {2024})}`)
    const year = unit(id('f'), 36, 'reference', [text('A. B, Order,'), ph('\\ '), ph('\\href@noop {} {\\  (\\bibinfo {year} {2024})}'), text(',')])
    const v2year = { ...unit(id('g'), 36, 'reference', [text('A. B, Order,'), ph('\\ '), ph('\\ '), text(' ('), ph('2024'), text('),')]), state: 'drawn' }
    expect(said(statedOf([year], [v2year]))).toEqual([[36, `written as ${'g'.repeat(12)}: ${CAUSE.characters}`]])
    // (its words as today's: another word is another unit)
    const other = { ...unit(id('c'), 34, 'reference', [text('D. M. Sussman, SoftwareY'), ph('\\ '), open('\\textbf {'), ph('6'), close(), text(','), ph('\\ '), ph('16'), text(' ('), ph('2017'), text(')')]), state: 'drawn' }
    expect(String(said(statedOf([today], [other]))[0]?.[1] ?? '')).not.toContain(CAUSE.characters)
  })
  it('is that unit where v2 writes a command\'s pair as the quotation marks it prints (\\enquote, 2026-11-11)', () => {
    const today = unit(id('a'), 32, 'reference', [text('A. Allen (2019): '), open('\\enquote{'), text('Hicksian complementarity,'), close(), text(' Econometrica.')])
    const v2 = { ...unit(id('b'), 32, 'reference', [text('A. Allen (2019): \u201cHicksian complementarity,\u201d Econometrica.')]), state: 'drawn' }
    expect(said(statedOf([today], [v2]))).toEqual([[32, `written as ${'b'.repeat(12)}: ${CAUSE.characters}`]])
    // (marks where the pair stood, nothing else: a word more is another unit)
    const more = { ...unit(id('c'), 32, 'reference', [text('A. Allen (2019): \u201cHicksian complementarity,\u201d in Econometrica.')]), state: 'drawn' }
    expect(String(said(statedOf([today], [more]))[0]?.[1] ?? '')).not.toContain(CAUSE.characters)
  })
  it('is no such unit where the candidate keeps a group today has not, or loses a word', () => {
    const today = unit(id('a'), 31, 'reference', [open('{'), text('GPU'), close(), text(' kernels.')])
    const added = { ...unit(id('b'), 31, 'reference', [open('\\emph{'), text('GPU'), close(), text(' kernels.')]), state: 'drawn' }
    expect(String(said(statedOf([today], [added]))[0]?.[1] ?? '')).not.toContain(CAUSE.characters)
    const lost = { ...unit(id('c'), 31, 'reference', [text('kernels.')]), state: 'drawn' }
    expect(String(said(statedOf([today], [lost]))[0]?.[1] ?? '')).not.toContain(CAUSE.characters)
  })
})

describe("(p) F3's item: today's figure text its marker and its words, v2's the words, its marker the label (the original's ink)", () => {
  // (2602.23285v2 p8's "(b) Normal & Pre-seizure", 2608.06007v1's "- identify": F3 reads an item's marker as its label, kept as
  // the original's ink, the text the words after it (PDF-READER §18.36); today's unit held both. 128 of the composite's units
  // read as another reading, 10 absent: the stand-in's id another baseline unit's of the same words elsewhere)
  const L = box(260.84, 328.68, 701.53, 706.15, 700.1)
  const item = (i: string, words: string) => ({
    ...on(unit(id(i), 304, 'inkfigures', [text(words)]), box(270.21, 328.68, 701.53, 706.15, 701.43)),
    label: [{ kind: 'number', ...box(260.84, 268.57, 701.53, 706.15, 700.1) }],
  })
  const today = (s: string) => [on(unit(id('a'), 301, 'inkfigures', [text(s)]), L)]
  it('states it held whole by the item, its marker its label, the item its holder', () => {
    for (const s of ['(b) Normal & Pre-seizure', '- Normal & Pre-seizure', 'b. Normal & Pre-seizure']) {
      const out = statedOf(today(s), [item('b', 'Normal & Pre-seizure')])
      expect(out.map((x: { cause: string; why: string; holder?: string }) => [x.why, x.cause, x.holder])).toEqual([
        [`made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.item}`, 'item', id('b')],
      ])
    }
  })
  it('states it so where the item has the id of another of the baseline’s units, the same words elsewhere', () => {
    const elsewhere = on(unit(id('b'), 900, 'inkfigures', [text('Normal & Pre-seizure')]), box(70, 120, 300, 305, 299))
    const out = statedOf([...today('(c) Normal & Pre-seizure'), elsewhere], [item('b', 'Normal & Pre-seizure')])
    expect(out.map((x: { u: { ord: number }; cause: string; holder?: string }) => [x.u.ord, x.cause, x.holder])).toEqual([[301, 'item', id('b')]])
  })
  it('states another reading where the item has no label at the line’s start, or more than a marker stands before its words', () => {
    const bare = { ...item('b', 'Normal & Pre-seizure'), label: [] }
    expect(said(statedOf(today('(b) Normal & Pre-seizure'), [bare]))).toEqual([[301, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.another}`]])
    expect(said(statedOf(today('Figure (b) Normal & Pre-seizure'), [item('b', 'Normal & Pre-seizure')]))).toEqual([
      [301, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.another}`],
    ])
  })
  it('is declared to the parity: the item holds today’s unit whole', () => {
    expect(HOLDER_JOIN.item).toBe('whole')
  })
})

describe("(f) F3's joined text: today's row ending in a hyphen the break set, held whole by the text that joins it", () => {
  // (2610.35877v1 p3: today's row "Use occupancy and policy propen-", v2's text of its path's two rows "Use occupancy and policy
  // propensities directly.": the hyphen is the break's, the joined word the text's)
  const rows = on(unit(id('b'), 281, 'inkfigures', [text('Use occupancy and policy propensities directly.')]), box(90, 180, 500, 506, 498), box(90, 150, 492, 498, 490))
  it('states it held whole, the joined text its holder', () => {
    const out = statedOf([on(unit(id('a'), 281, 'inkfigures', [text('Use occupancy and policy propen-')]), box(90, 180, 500, 506, 498))], [rows])
    expect(out.map((x: { cause: string; holder?: string }) => [x.cause, x.holder])).toEqual([['held', id('b')]])
  })
  it('states another reading where the word goes on otherwise than the row', () => {
    expect(said(statedOf([on(unit(id('a'), 281, 'inkfigures', [text('Use occupancy and policy propel-')]), box(90, 180, 500, 506, 498))], [rows]))).toEqual([
      [281, `made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.another}`],
    ])
  })
})

describe("(q) F3's double: a figure text drawn twice over itself kept as the original (the owner's ruling, PDF-READER §18.36)", () => {
  // (2610.21313v1 p3's "SAMA" three times: today drew it, v2 keeps it, the dump's `keptBy: 'double'` its cause)
  it('states the cause of a unit marked kept for being drawn twice', () => {
    expect(keptWhyOf({ id: id('a'), keptBy: 'double', state: 'laid', why: 'unwrapped' })).toBe(CAUSE.double)
  })
})

describe.skipIf(!existsSync(ACCEPTANCE))("F3's statements in the differential's acceptance list", () => {
  const accepted = (cause: string) =>
    (JSON.parse(readFileSync(ACCEPTANCE, 'utf8')) as { accepted: { match: string }[] }).accepted.some((e) => new RegExp(e.match).test(cause))
  it('accepts an item held whole by its label and words, and a text kept for being drawn twice', () => {
    expect(accepted(`made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.item}`)).toBe(true)
    expect(accepted(CAUSE.double)).toBe(true)
  })
})
