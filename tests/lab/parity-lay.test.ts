// @vitest-environment node
// The parity check lays v2's pages as the product does (lab/typeset/parity/hook.mjs, v2.mjs): gate-l1's own call of layPage, with
// the rules, patterns and options the gate's runner chooses (its theorem heads among them), is replaced by the reader's lay
// (packages/reader/src/compose/typeset.ts typesetLay), so that the parity passes layPage what the reader passes and nothing more.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { load } from '../../lab/typeset/parity/hook.mjs'

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
    expect(before).toMatch(/heads:/)
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
