// The page's composition says what it waits for before any work, and a flow that throws is that flow's alone (design-a §1.4).
import type { Part, Placed } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import type { FlowMember } from '../../src/lay/flow.ts'
import { layPagePrepared } from '../../src/lay/page.ts'
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
  it('lists the rows its members and the paper’s names are set from that are not in, each once', () => {
    expect(waitOf(part, rowsOf([id('b')]))).toEqual([id('a'), id('f')])
    expect(waitOf(part, rowsOf([id('a'), id('b'), id('f')]))).toEqual([])
  })
  it('waits for nothing once no other row will come, and never for a member the prepare left the original’s', () => {
    expect(waitOf(part, rowsOf([], true))).toEqual([])
    expect(waitOf(part, rowsOf([id('a'), id('b'), id('f')]))).not.toContain(id('c'))
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
