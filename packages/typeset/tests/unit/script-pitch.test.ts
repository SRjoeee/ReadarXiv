// The line pitch a Japanese and a Korean translation start from (docs/PDF-READER.md §18.82; the owner's choice of 2026-11-15, on
// whole pages drawn at each class's pitch): Japanese at jlreq's, 1.7 times the block's own size (jlreq.cls:411,
// `baselineskip={17zw/10}`), over the original's own pitch and never under it; Korean at xetexko's `\linespread{1.38889}`
// (xetexko.sty:2596-2601) on the block's own pitch; Chinese as before (ctex's 1.3). U.params on blocks of our own: a body block
// at two sizes, a caption at its own smaller size, a loose original, a block with no pitch of its own, each script's.
import { describe, expect, it } from 'vitest'
import { rulesFor } from '../../src/rules-for.ts'
import type { Block } from '../../src/unit/blocks.ts'
import { params } from '../../src/unit/params.ts'

const block = (pitch0: number | null) => ({ pitch0 }) as Block
const baseOf = (target: string, kind: string, s: number, pitch0: number | null) =>
  params({
    kind,
    blocks: [block(pitch0)],
    s,
    P: rulesFor(target).set as never,
    label: null,
    edges: { first: true, last: true, below: 20 },
    rulesOf: () => null,
    cjkSize: undefined,
    lineskip: null,
    heading: false,
    numbered: false,
  }).P.leadBase

describe('U.params: the pitch a Japanese, a Korean and a Chinese translation start from', () => {
  it('sets a Japanese body block at 1.7 times its own size, whatever the paper’s size', () => {
    // (a 10pt paper's body, 10 on 12: 17 / 12; an 11pt paper's, 10.95 on 13.6: 18.615 / 13.6)
    expect(baseOf('ja', 'para', 10, 12)).toBe(1.417)
    expect(baseOf('ja', 'para', 10.95, 13.6)).toBe(1.369)
  })
  it('sets a Japanese caption at 1.7 times its own size, and a loose original at its own pitch', () => {
    // (a caption at \small of a 10pt paper, 9 on 11: 15.3 / 11; a double-spaced original, 10 on 24: its own pitch)
    expect(baseOf('ja', 'caption', 9, 11)).toBe(1.391)
    expect(baseOf('ja', 'para', 10, 24)).toBe(1)
  })
  it('sets a Japanese block with no pitch of its own at 1.7 times its size over the pitch the lay takes for it', () => {
    // (B.slots: 1.2 times the size where a block states none)
    expect(baseOf('ja', 'heading', 12, null)).toBe(1.417)
  })
  it('sets a Korean block at xetexko’s line spread, 1.38889 times its own pitch, and a loose original at its own', () => {
    expect(baseOf('ko', 'para', 10, 12)).toBe(1.38889)
    expect(baseOf('ko', 'caption', 9, 11)).toBe(1.38889)
    expect(baseOf('ko', 'heading', 12, null)).toBe(1.38889)
    expect(baseOf('ko', 'para', 10, 24)).toBe(1)
  })
  it('leaves a Chinese block at ctex’s 1.3', () => {
    expect(baseOf('zh', 'para', 10, 12)).toBe(1.3)
    expect(baseOf('zh-TW', 'para', 10, 12)).toBe(1.3)
    expect(baseOf('zh', 'para', 10, 24)).toBe(1)
  })
})
