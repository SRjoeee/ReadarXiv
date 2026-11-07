// The rows made here, as today's run makes them (R session/run.ts `rank`, `contextOf`, `again`; PDF-READER §8, §11.10): the units
// the page in view waits on first, then ahead before behind; the paper's title and abstract the context; a retry asking for the
// units with no translation alone, every row held kept.
import type { Row, Unit } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import {
  ABSTRACT_MAX_CHARS,
  anchorOf,
  contextOf,
  countsOf,
  keep,
  missingOf,
  ranked,
  shownAsOriginal,
  stopOf,
} from '../src/session/rows.ts'
import type { Page } from '../src/compose/page.ts'

const u = (n: number, kind = 'para', s = `unit ${n}`): Unit => ({
  id: String(n).padStart(64, '0'),
  kind,
  content: [{ t: 'text', s }],
})
const ok = (x: Unit): Row => ({ id: x.id, ok: true, content: [{ t: 'text', s: 'x' }], by: 'x' })
const lost = (x: Unit): Row => ({ id: x.id, ok: false, why: { kind: 'unavailable' } })
const UNITS = Array.from({ length: 10 }, (_, i) => u(i))
const at = (xs: Unit[]) => xs.map((x) => UNITS.indexOf(x))

describe('the rows made here', () => {
  it('asks the units the page in view waits on first, then ahead before behind, behind counted twice as far', () => {
    const near = new Set([UNITS[5]?.id as string, UNITS[6]?.id as string])
    const anchor = anchorOf(UNITS, near, 3, 4)
    expect(anchor).toBe(5)
    expect(at(ranked(UNITS, near, anchor))).toEqual([5, 6, 4, 7, 8, 3, 9, 2, 1, 0])
    // (no page laid yet: the reading place is the page's share of the paper)
    expect(anchorOf(UNITS, new Set(), 3, 4)).toBe(5)
    expect(anchorOf(UNITS, new Set(), 1, 4)).toBe(0)
    expect(at(ranked(UNITS, new Set(), 0))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
  it("gives the paper's title and its abstract, cut at a word, as the context", () => {
    const long = `${'word '.repeat(400)}end`
    const units = [u(0, 'heading', 'Title'), u(1, 'abstract', 'First part.'), u(2, 'abstract', long), u(3)]
    const c = contextOf(units, 'Attention Is All You Need')
    expect(c.title).toBe('Attention Is All You Need')
    expect(c.abstract?.startsWith('First part. word word')).toBe(true)
    expect(c.abstract?.endsWith('word...')).toBe(true)
    expect((c.abstract?.length ?? 0) <= ABSTRACT_MAX_CHARS + 3).toBe(true)
    expect(contextOf([u(3)], '')).toEqual({})
  })
  it('a retry asks for the units with no translation alone; a translation held is never replaced by a failure', () => {
    const held = new Map<string, Row>()
    for (const x of UNITS.slice(0, 6)) keep(held, ok(x))
    keep(held, lost(UNITS[6] as Unit))
    expect(at(missingOf(UNITS, held))).toEqual([6, 7, 8, 9])
    expect(countsOf(UNITS, held)).toEqual({ got: 7, lost: 1 })
    // (a near call's failure after the first call's translation of one unit: the translation stays)
    expect(keep(held, lost(UNITS[0] as Unit))).toBe(false)
    expect(held.get(UNITS[0]?.id as string)?.ok).toBe(true)
    expect(keep(held, ok(UNITS[6] as Unit))).toBe(true)
    expect(countsOf(UNITS, held)).toEqual({ got: 7, lost: 0 })
  })
  it("tells why the units lost got none: the service's most telling word, none where none was lost", () => {
    const held = new Map<string, Row>()
    keep(held, ok(UNITS[0] as Unit))
    expect(stopOf(UNITS, held)).toBeNull()
    keep(held, { id: UNITS[1]?.id as string, ok: false, why: { kind: 'refused' } })
    keep(held, { id: UNITS[2]?.id as string, ok: false, why: { kind: 'aborted' } })
    expect(stopOf(UNITS, held)).toEqual({ kind: 'refused' })
    keep(held, { id: UNITS[3]?.id as string, ok: false, why: { kind: 'unconfigured', code: 'no-key' } })
    keep(held, lost(UNITS[4] as Unit))
    expect(stopOf(UNITS, held)).toEqual({ kind: 'unconfigured', code: 'no-key' })
  })
  it("counts a page near the view as arXiv's by the rule: no part lays a line on it, or it was laid with nothing of its own", () => {
    const page = (states: string[], wait: string[] = []): Page =>
      ({
        page: 1,
        wait: { rows: wait, faces: [] },
        members: states.map((state, ord) => ({
          ord,
          page: 1,
          state,
          off: 0,
          lines: [],
          lit: { left: [], right: [], own: [] },
        })),
        links: [],
      }) as unknown as Page
    expect(shownAsOriginal(null, null)).toBe(true)
    expect(shownAsOriginal('d'.repeat(64), page(['none', 'unfit']))).toBe(true)
    expect(shownAsOriginal('d'.repeat(64), page(['laid', 'none']))).toBe(false)
    // (a page still waiting for its rows, or not laid yet, is not settled)
    expect(shownAsOriginal('d'.repeat(64), page(['waiting'], ['x']))).toBe(false)
    expect(shownAsOriginal('d'.repeat(64), null)).toBe(false)
  })
})
