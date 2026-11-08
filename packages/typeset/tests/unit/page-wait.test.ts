// The page's composition says what it waits for before any work, and a flow that throws is that flow's alone (design-a §1.4).
import type { Part, Placed } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import type { FlowMember } from '../../src/lay/flow.ts'
import { layPagePrepared, settleTies } from '../../src/lay/page.ts'
import { waitOf } from '../../src/lay/wait.ts'
import type { RuleParams, Rows } from '../../src/types.ts'

const id = (c: string) => c.repeat(64)
const member = (ord: number, text: Placed['text'], o: Partial<Placed> = {}): Placed => ({
  ord,
  kind: 'para',
  text,
  lead: 12,
  style: { role: 'serif', size: 10 },
  align: 'j',
  lines: [[1, 0, 72, 300, 700, 707, 698, 72, 300, 0]],
  room: { below: 0 },
  ...o,
})
const rowsOf = (ids: string[], done = false): Rows => {
  const have = new Set(ids)
  return {
    get: (i) => (have.has(i) ? { id: i, ok: true, content: [{ t: 'text', s: 'x' }], by: 'test' } : undefined),
    done,
  }
}

describe('what a page waits for', () => {
  const part: Pick<Part, 'flows' | 'paper'> = {
    paper: { faces: { fonts: [] }, names: [['figure', id('f')]] },
    flows: [
      [member(0, id('a')), member(1, id('b'))],
      [member(2, { name: 'figure' }), member(3, id('c'), { why: 'unlocated' }), member(4, id('a'))],
    ],
  }
  it('lists the rows its members are set from that are not in, each once; never a paper’s name (today awaits none)', () => {
    expect(waitOf(part, rowsOf([id('b')]))).toEqual([id('a')])
    expect(waitOf(part, rowsOf([id('a'), id('b')]))).toEqual([])
  })
  it('waits for nothing once no other row will come, and never for a member the prepare left the original’s', () => {
    expect(waitOf(part, rowsOf([], true))).toEqual([])
    expect(waitOf(part, rowsOf([id('a'), id('b'), id('f')]))).not.toContain(id('c'))
  })
  it('never waits for a unit the paper keeps as it is (no row of it comes), while the rows go on', () => {
    const kept = { ...rowsOf([id('b')]), kept: (i: string) => i === id('a') }
    expect(waitOf(part, kept)).toEqual([])
    expect(waitOf(part, { ...rowsOf([]), kept: (i: string) => i === id('a') })).toEqual([id('b')])
  })
})

describe('a flow whose lay throws', () => {
  it('leaves its members the original’s with the reason, and the page is laid', () => {
    const broken = { ord: 7, kind: 'para', pages: [1], tokens: null, blocks: [] } as unknown as FlowMember
    const got = layPagePrepared(1, [[broken]], [], { adaptiveFill: null } as unknown as RuleParams)
    expect(got.members).toHaveLength(1)
    expect(got.members[0]!.state).toBe('error')
    expect(got.members[0]!.error).toMatch(/Error/)
  })
})

describe('a table group, one verdict for its members (settleTies, L11)', () => {
  const lay = (ord: number, state: 'laid' | 'error') =>
    ({
      m: { ord, pages: [1] } as unknown as FlowMember,
      state,
      slots: [],
      ...(state === 'laid' ? { unit: { layout: { clipped: false } } } : { error: 'Error: x' }),
    }) as never
  it('leaves every cell the original’s where one cell’s flow threw, the failed cell keeping its reason', () => {
    const lays = new Map([
      [4, lay(4, 'error')],
      [5, lay(5, 'laid')],
    ])
    const tables = settleTies([{ rule: 'cells', cells: [4, 5] }], lays)
    expect(tables).toHaveLength(1)
    expect(tables[0]!.why).not.toBeNull()
    expect((lays.get(5) as unknown as { state: string }).state).toBe('cells')
    expect((lays.get(5) as unknown as { unit?: unknown }).unit).toBeUndefined()
    expect((lays.get(4) as unknown as { state: string }).state).toBe('error')
  })
  it('lays a group whose every cell is laid on one page', () => {
    const lays = new Map([
      [4, lay(4, 'laid')],
      [5, lay(5, 'laid')],
    ])
    expect(settleTies([{ rule: 'cells', cells: [4, 5] }], lays)[0]!.why).toBeNull()
    expect((lays.get(5) as unknown as { state: string }).state).toBe('laid')
  })
})
