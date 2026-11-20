// @vitest-environment node
// The parity check lays v2's pages as the product does (lab/typeset/parity/hook.mjs, v2.mjs): gate-l1's own call of layPage, with
// the rules, patterns and options the gate's runner chooses, is replaced by the reader's lay
// (packages/reader/src/compose/typeset.ts typesetLay), so that the parity passes layPage what the reader passes and nothing more.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { GLUE_MARK, load } from '../../lab/typeset/parity/hook.mjs'

const GATE = resolve(__dirname, '../../packages/typeset/tests/replay/gate-l1.ts')
const hooked = async (source: string, url = `file://${GATE}`) =>
  String((await load(url, {}, async () => ({ format: 'module', source }))).source)
/** the entry's branch of gate-l1: from its timing's start to its end */
const entryBranch = (s: string) => s.slice(s.indexOf('const t1 = performance.now()'), s.indexOf('out.entry.ms.push'))

describe("the parity's lay is the reader's", () => {
  const source = readFileSync(GATE, 'utf8')
  it("puts the reader's lay in place of gate-l1's entry call, its rules and options gone with it", async () => {
    const before = entryBranch(source)
    expect(before).toMatch(/layPage\(/)
    // (the gate's own rules and patterns, which the hook takes away; its theorem heads were an option of the call until the
    // entry read them from the rules, Rules.heads, as the reader's lay does)
    expect(before).toMatch(/rulesFor\(/)
    expect(before).toMatch(/patternsSeen/)
    const after = entryBranch(await hooked(source))
    expect(after).toContain('const page = (globalThis as any).__parityLay(part as Part, entryRows)')
    expect(after).not.toMatch(/layPage\(|heads:|rulesFor\(|patternsSeen/)
  })
  it('throws where gate-l1 no longer holds the call once, rather than lay otherwise', async () => {
    await expect(hooked(source.replace(/const page = layPage\(/, 'const page = otherLay('))).rejects.toThrow(/no longer holds/)
  })
  it('touches no other module', async () => {
    expect(await hooked('const page = layPage(\n', 'file:///elsewhere.ts')).toBe('const page = layPage(\n')
  })
})

describe("the parity's lay with the spaces beside a full-width mark's blank side put back (the coordinator's ruling of 2026-11-10)", () => {
  const TOKENS = resolve(__dirname, '../../packages/typeset/src/breaker/tokens.ts')
  const source = readFileSync(TOKENS, 'utf8')
  const RULE = '    if (markBlankEdge(before, true, cjkFace) || markBlankEdge(after, false, cjkFace)) return false\n'
  it("skips B.tokens' blank-side line while the lab's global asks it, and nowhere else in the file: the barred-start line stays", async () => {
    expect(source.split(RULE).length).toBe(2)
    const after = await hooked(source, `file://${TOKENS}`)
    expect(after).toContain('if (!(globalThis as any).__parityBlankSides && (markBlankEdge(before, true, cjkFace) || markBlankEdge(after, false, cjkFace))) return false')
    expect(after.replace(/if \(!\(globalThis as any\)\.__parityBlankSides && \(([^\n]*)\)\) return false/, 'if ($1) return false')).toBe(source)
    expect(after).toContain('    if (!hardSpaces.has(t) && markBarredStart(after, cjkFace, barredChar)) return false\n')
  })
  it('throws where tokens.ts no longer holds the line once', async () => {
    await expect(hooked(source.replace(RULE, ''), `file://${TOKENS}`)).rejects.toThrow(/no longer holds/)
  })
})

describe("the parity's lay with no CJK line squeezed (the owner's ruling L2 of 2026-11-12, rulings.mjs)", () => {
  const BREAK = resolve(__dirname, '../../packages/typeset/src/breaker/break.ts')
  const source = readFileSync(BREAK, 'utf8')
  const RULE = '  const squeezes = !!P.cjk && !P.keepAll && !(st.track > (st.fitTrack ?? P.trackStart ?? 0) + 1e-9)\n'
  it("turns the breaker's squeeze off while the lab's global asks it, and touches nothing else in the file", async () => {
    expect(source.split(RULE).length).toBe(2)
    const after = await hooked(source, `file://${BREAK}`)
    expect(after).toContain('  const squeezes = !globalThis.__parityNoSqueeze && !!P.cjk && !P.keepAll && !(st.track > (st.fitTrack ?? P.trackStart ?? 0) + 1e-9)\n')
    expect(after.replace('!globalThis.__parityNoSqueeze && ', '')).toBe(source)
  })
  it('throws where break.ts no longer holds the line once', async () => {
    await expect(hooked(source.replace(RULE, ''), `file://${BREAK}`)).rejects.toThrow(/no longer holds/)
  })
})

describe("the parity's lay marks the text item TeX's infinite glue places (§18.104; measure-dom.mjs reads its gap as the glue's)", () => {
  const DISPLAY = resolve(__dirname, '../../packages/typeset/src/emit/display.ts')
  const source = readFileSync(DISPLAY, 'utf8')
  const ITEM = '      items.push(item)\n'
  it('puts the mark before the text item is kept, and touches nothing else in the file', async () => {
    expect(source.split(ITEM).length).toBe(2)
    const after = await hooked(source, `file://${DISPLAY}`)
    expect(after).toContain(`${GLUE_MARK}${ITEM}`)
    expect(after.replace(GLUE_MARK, '')).toBe(source)
  })
  it('throws where display.ts no longer holds the line once', async () => {
    await expect(hooked(source.replace(ITEM, ''), `file://${DISPLAY}`)).rejects.toThrow(/no longer holds/)
  })
  // (the mark's own statement, run on a line's items: `line.items` the laid items, `run.items` the run's [index, offset]s)
  const mark = new Function('line', 'run', 'item', GLUE_MARK) as (line: unknown, run: unknown, item: { glue?: 1 }) => void
  const marked = (items: { t: Record<string, unknown> }[], first: number) => {
    const item: { glue?: 1 } = {}
    mark({ items }, { items: [[first, 0]] }, item)
    return item.glue === 1
  }
  const fill = [2, 1]
  it('marks the run after a token holding Token.fill, the spaces between passed over, a fill on one of them too', () => {
    expect(marked([{ t: { s: 'A', fill } }, { t: { s: 'B' } }], 1)).toBe(true)
    expect(marked([{ t: { s: 'A' } }, { t: { space: true, fill } }, { t: { s: 'B' } }], 2)).toBe(true)
    expect(marked([{ t: { s: 'A', fill } }, { t: { space: true } }, { t: { s: 'B' } }], 2)).toBe(true)
    expect(marked([{ t: { s: 'A', fillLead: fill } }], 0)).toBe(true)
  })
  it('marks no run where no glue stands right before it', () => {
    expect(marked([{ t: { s: 'A' } }, { t: { space: true } }, { t: { s: 'B' } }], 2)).toBe(false)
    // (a glue before an earlier word places that word's run, not this one)
    expect(marked([{ t: { s: 'A', fill } }, { t: { s: 'x' } }, { t: { space: true } }, { t: { s: 'B' } }], 3)).toBe(false)
    expect(marked([{ t: { s: 'A' } }], 0)).toBe(false)
  })
})
