// @vitest-environment node
// Stage 1a's statement of the baseline's units the candidate does not make (lab/pdf/prepare-back/stated.mjs, which run.mjs's
// --baseline and restate.mjs write into a dump), the cause the differential's acceptance list (baseline/acceptance.json) reads.
// The two causes of the coordinator's rulings of 2026-11-09, each accepted entry by entry by a mechanical check: an ink unit
// whose scripts are now elements (rebuild/script-face) where the two units read alike, its marks read as v2's elements as the
// parity's keptJoin reads them; and an orphan line now the author block's names line (inknames, of the names toggle). Synthetic
// units in the dumps' form.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { CAUSE, statedOf } from '../../lab/pdf/prepare-back/stated.mjs'
import { scriptsKeptAsElements } from '../../packages/typeset/tests/replay/l1.ts'

type DumpPiece = { kind: string; s?: string; src?: string }
type Line = { page: number; x0: number; x1: number; baseline: number; top: number; bottom: number }
/** a dump's unit: its id, ord, kind, flat pieces and lines (one line on page 1 at the given x and baseline) */
const unit = (id: string, ord: number, kind: string, pieces: DumpPiece[], at: [number, number, number] = [72, 300, 600]) => {
  const line: Line = { page: 1, x0: at[0], x1: at[1], baseline: at[2], top: at[2] + 8, bottom: at[2] - 2 }
  return { id, ord, kind, text: '', pieces: pieces.map((p, k) => ({ k, ...p })), lines: [line] }
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

  it('states nothing for a line now of another kind that is not the names toggle, nor for one at another place', () => {
    expect(statedOf([unit(id('a'), 1, 'inkorphan', [text('x')])], [unit(id('b'), 1, 'inknotes', [text('x')])])).toEqual([])
    // (a note's line of today's, not an orphan (2610.21313v1 t112, an e-mail line today read as a note's): not the ruling's)
    expect(statedOf([unit(id('a'), 1, 'inknotes', [text('x')])], [unit(id('b'), 1, 'inknames', [text('x')])])).toEqual([])
    expect(
      statedOf([unit(id('a'), 1, 'inkorphan', [text('x')])], [unit(id('b'), 1, 'inknames', [text('x')], [72, 300, 400])]),
    ).toEqual([])
  })
})

const ACCEPTANCE = '/Users/cheongzhiyan/Developer/readarxiv-lab-data/refactor-2026-11/baseline/acceptance.json'
describe.skipIf(!existsSync(ACCEPTANCE))("the differential's acceptance list (lab-data's baseline/acceptance.json)", () => {
  const accepted = (cause: string) =>
    (JSON.parse(readFileSync(ACCEPTANCE, 'utf8')) as { accepted: { match: string }[] }).accepted.some((e) =>
      new RegExp(e.match).test(cause),
    )
  it('accepts the two ruled causes, and not another reading', () => {
    expect(accepted(`made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.scripts}`)).toBe(true)
    expect(accepted(`made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.names}`)).toBe(true)
    expect(accepted(`made on arXiv's page as ${'b'.repeat(12)}: ${CAUSE.another}`)).toBe(false)
  })
})
