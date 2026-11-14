// The stored half (src/compiled.ts compiledOf), at its interface: what it returns given no stored instrument, one it takes and
// one it does not, and a refusal of the marked compile; and that the source's units are handed out (the caller's function,
// awaited) before the marked compile is asked. The marked compile is a spy here: no TeX runs. The paper is made here.
import { describe, expect, test, vi } from 'vitest'
import { type CompiledInput, compiledOf } from '../src/compiled.ts'
import type { OriginalFacts, StoredInstrument } from '../src/plan.ts'
import { FROM_UTF8 } from '../src/plan.ts'

/** what the marked compile's spy answers (null: B, its log and the options below), and the order the steps ran in */
const marked = vi.hoisted(() => ({ answer: null as unknown, events: [] as string[] }))
const OPTIONS = vi.hoisted(() => ({
  texts: new Map([['\\hlg', 'All good.']]),
  inkless: new Set(['\\noink']),
  decorated: [['\\hlg', 'All good.']],
}))
vi.mock('../src/compile/paper.ts', async (real) => {
  const m = await real<typeof import('../src/compile/paper.ts')>()
  return {
    ...m,
    // (a paper whose bibliography needs no compile)
    bibliographyKept: vi.fn(() => 'none'),
    markedOfPaper: vi.fn(async () => {
      marked.events.push('marked')
      return (
        marked.answer ?? {
          pdf: new Uint8Array([1]),
          log: 'the marked log',
          options: structuredClone(OPTIONS),
          ms: { probe: 0, compile: 0 },
          base: { pdf: new Uint8Array([37, 80, 68, 70]), log: '' },
        }
      )
    }),
  }
})

const enc = new TextEncoder()
const PAPER = '\\documentclass{article}\n\\begin{document}\nA paragraph with \\hlg{All good.} in it.\n\\end{document}\n'
const FACTS: OriginalFacts = { pages: 1, day: 1_700_000_000, banner: '2025' }

/** the stored half of the paper, given `stored` and `original`: its end, the order its steps ran in, its notes */
async function run(stored: StoredInstrument | null, original = FACTS) {
  marked.events = []
  const notes: [string, unknown][] = []
  const input: CompiledInput = {
    files: new Map([['main.tex', enc.encode(PAPER)]]),
    original,
    stored,
    compile: async () => ({ ok: false }),
    engines: ['pdflatex'],
    pdfjs: {} as never,
    documentOptions: {},
    stage: () => {},
    note: (n, d) => notes.push([n, d]),
    // (the caller's handing-out, awaited: a turn of the event loop before it says it is done)
    units: async () => {
      await new Promise((r) => setTimeout(r, 0))
      marked.events.push('units')
    },
  }
  const end = await compiledOf(input)
  return { end, events: [...marked.events], notes }
}

describe('the stored half', () => {
  test('none given: the units handed out, then the marked compile; B, its log and options, and the four objects to store', async () => {
    const { end, events } = await run(null)
    expect(events).toEqual(['units', 'marked'])
    if (!end.ok) throw new Error(end.detail)
    expect([...end.finalPdf]).toEqual([37, 80, 68, 70])
    expect(end.log).toBe('the marked log')
    expect(end.options.texts).toStrictEqual(OPTIONS.texts)
    expect(end.made && Object.keys(end.made)).toEqual(['b.pdf', 'log', 'plan', 'definitions'])
    expect(end.paper.units.length).toBeGreaterThan(0)
  })
  test('one taken (the same facts): no compile; B, its log and the options read back from it; nothing to store', async () => {
    const fresh = await run(null)
    if (!fresh.end.ok || !fresh.end.made) throw new Error('no instrument made')
    const { end, events, notes } = await run(fresh.end.made)
    expect(events).toEqual(['units'])
    expect(notes).toEqual([])
    if (!end.ok) throw new Error(end.detail)
    expect(end.finalPdf).toBe(fresh.end.made['b.pdf'])
    expect(end.log).toBe(FROM_UTF8.decode(fresh.end.made.log))
    expect(end.options).toStrictEqual({ texts: OPTIONS.texts, inkless: OPTIONS.inkless, decorated: OPTIONS.decorated })
    expect(end.made).toBe(null)
  })
  test('one not taken (another page count): said so, the units handed out, then the marked compile, and the four to store', async () => {
    const fresh = await run(null)
    if (!fresh.end.ok || !fresh.end.made) throw new Error('no instrument made')
    const { end, events, notes } = await run(fresh.end.made, { ...FACTS, pages: 2 })
    expect(notes).toContainEqual(['front', { stored: 'made with another original: compiled anew' }])
    expect(events).toEqual(['units', 'marked'])
    expect(end.ok && end.made && Object.keys(end.made)).toEqual(['b.pdf', 'log', 'plan', 'definitions'])
  })
  test('the marked compile refused: the paper cannot be typeset, its words; the units were handed out first', async () => {
    marked.answer = { refused: 'compile', why: 'TeX stopped', ms: {} }
    try {
      const { end, events } = await run(null)
      expect(events).toEqual(['units', 'marked'])
      expect(end).toEqual({ ok: false, why: 'cannot-typeset', detail: 'the marked compile: compile: TeX stopped' })
    } finally {
      marked.answer = null
    }
  })
})
