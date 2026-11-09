// @vitest-environment node
// Stage 1a's statement of the baseline's units the candidate does not make (lab/pdf/prepare-back/stated.mjs, which run.mjs's
// --baseline and restate.mjs write into a dump), the cause the differential's acceptance list (baseline/acceptance.json) reads.
// The causes of the coordinator's rulings of 2026-11-09, each accepted entry by entry by a mechanical check: (a) an ink unit whose
// scripts are now elements (rebuild/script-face) where the two units read alike, its marks read as v2's elements as the parity's
// keptJoin reads them; (b') a unit whose glyphs a unit of the author block's (the names toggle) now holds; (c) a line whose marks
// are the name before's trail (rebuild/front-matter); (d) (a) with an element's characters in another order; (e) a unit whose
// lines v2 keeps whole as the original's inside a display the engine states; (f) a unit one v2 unit holds whole, its text a part
// of that unit's (a kept block holding it stated apart, not accepted). Synthetic units in the dumps' form.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { CAUSE, statedOf } from '../../lab/pdf/prepare-back/stated.mjs'
import { scriptsKeptAsElements, scriptsKeptInAnotherOrder } from '../../packages/typeset/tests/replay/l1.ts'

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

  it('states nothing where two units meet its line, or where its text is not a part of the holder\'s', () => {
    const base = [unit(id('a'), 1, 'inknotes', [text('Ada Lovelace')])]
    const two = [unit(id('b'), 1, 'para', [text('Ada')], [72, 150, 600]), unit(id('c'), 2, 'para', [text('Lovelace')], [160, 300, 600])]
    expect(statedOf(base, two)).toEqual([])
    expect(statedOf(base, [unit(id('b'), 1, 'para', [text('Ada Byron')])])).toEqual([])
  })
})

const ACCEPTANCE = '/Users/cheongzhiyan/Developer/readarxiv-lab-data/refactor-2026-11/baseline/acceptance.json'
describe.skipIf(!existsSync(ACCEPTANCE))("the differential's acceptance list (lab-data's baseline/acceptance.json)", () => {
  const accepted = (cause: string) =>
    (JSON.parse(readFileSync(ACCEPTANCE, 'utf8')) as { accepted: { match: string }[] }).accepted.some((e) =>
      new RegExp(e.match).test(cause),
    )
  it('accepts the ruled causes, and neither another reading nor lines kept whole outside a display the engine states', () => {
    for (const c of [CAUSE.scripts, CAUSE.names, CAUSE.trail, CAUSE.orderAsElement, CAUSE.display, CAUSE.held])
      expect(accepted(`made on arXiv's page as ${'b'.repeat(12)}: ${c}`)).toBe(true)
    expect(accepted(`made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.another}`)).toBe(false)
    expect(accepted(`made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.kept}`)).toBe(false)
    expect(accepted(`made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.heldKept}`)).toBe(false)
  })
})
