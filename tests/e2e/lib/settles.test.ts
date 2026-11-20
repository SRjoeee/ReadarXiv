// @vitest-environment node
// A browser check's own steps bounded (tests/e2e/lib/settles.mjs): a step that settles gives its value, or its error, as it is;
// one that does not fails past its bound, naming itself and what the browser says then; that report is bounded too
import { describe, expect, it } from 'vitest'
import { excerpt, framesOf, settles, stallReport, traceStall } from './settles.mjs'

const never = () => new Promise<never>(() => {})
/** a page as stallReport reads it: its address, and an evaluate that answers or never does */
const page = (url: string, answers: boolean) => ({ url: () => url, evaluate: () => (answers ? Promise.resolve('answers') : never()) })

describe('a step of a browser check', () => {
  it('that settles gives its value, and its own error, as they are', async () => {
    await expect(settles('a step', async () => 7, { ms: 1000 })).resolves.toBe(7)
    await expect(settles('a step', async () => { throw new Error('its own') }, { ms: 1000 })).rejects.toThrow('its own')
  })
  it('that does not settle fails past its bound, naming itself and what the report says then', async () => {
    await expect(settles('patch(e)', never, { ms: 50, tell: async () => 'pages: e no answer' })).rejects.toThrow(/^patch\(e\): not settled in 0\.05 s; pages: e no answer$/)
    await expect(settles('close a', never, { ms: 50 })).rejects.toThrow(/^close a: not settled in 0\.05 s$/)
  })
  it('a step that ends in an error after its bound raises nothing more (the run has failed on the bound; its end is no one\'s)', async () => {
    const unhandled: unknown[] = []
    const seen = (e: unknown) => { unhandled.push(e) }
    process.on('unhandledRejection', seen)
    try {
      // (as the patch standing on a reader does once the run's end closes the browser: "Target page ... has been closed")
      const endsLate = () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('closed at the end')), 60))
      await expect(settles('close e', endsLate, { ms: 20 })).rejects.toThrow(/^close e: not settled in 0\.02 s$/)
      await new Promise(resolve => setTimeout(resolve, 120))
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', seen)
    }
  })
  it('a report that itself does not settle, or throws, still lets the step fail', async () => {
    await expect(settles('close b', never, { ms: 50, tell: never, tellMs: 50 })).rejects.toThrow(/^close b: not settled in 0\.05 s; the report gave nothing in 0\.05 s$/)
    await expect(settles('close c', never, { ms: 50, tell: async () => { throw new Error('gone') } })).rejects.toThrow(/^close c: not settled in 0\.05 s; the report failed: gone$/)
  })
})

describe('what the browser says while a step stands', () => {
  it('names each page that does not answer, and each tab\'s flags as the extension\'s worker reads them', async () => {
    const context = { pages: () => [page('about:blank', true), page('chrome-extension://abcdef/pdf-reader.html?live=1&paper=2600.00002', false)], browser: () => null }
    const worker = { evaluate: async () => [{ active: false, frozen: false, discarded: false }, { active: true, frozen: true, discarded: false }] }
    const said = await stallReport({ context, worker }, { answerMs: 50 })
    expect(said).toContain('about:blank answers')
    expect(said).toContain('pdf-reader.html no answer in 0.05 s')
    expect(said).toContain('tabs: -, active+frozen')
  })
  it('a worker that does not answer is said so, and the pages are still read', async () => {
    const said = await stallReport({ context: { pages: () => [page('about:blank', true)], browser: () => null }, worker: { evaluate: never } }, { answerMs: 50 })
    expect(said).toContain('about:blank answers')
    expect(said).toContain('tabs: no answer in 0.05 s')
  })
})

const ORIGIN = 'chrome-extension://abcdef'

describe('a paused reader\'s frames and its chunk\'s text', () => {
  it('one line a frame, the top first: function, file less the extension\'s origin, line and column from 1; at most n', () => {
    const frames = [
      { functionName: '', url: `${ORIGIN}/chunks/reader-X.js`, location: { lineNumber: 0, columnNumber: 9 } },
      { functionName: 'tell', url: '', location: { lineNumber: 4 } },
      { functionName: 'later', url: `${ORIGIN}/chunks/clock-Y.js`, location: { lineNumber: 0, columnNumber: 0 } },
    ]
    expect(framesOf(frames)).toEqual(['(anonymous) chunks/reader-X.js:1:10', 'tell (no file):5:1', 'later chunks/clock-Y.js:1:1'])
    expect(framesOf(frames, 2)).toHaveLength(2)
  })
  it('200 characters around a column of a minified chunk\'s line, from the line\'s start where the column is near it', () => {
    const source = `first line\n${'x'.repeat(300)}HERE${'y'.repeat(300)}`
    const around = excerpt(source, 1, 300)
    expect(around).toHaveLength(200)
    expect(around.indexOf('HERE')).toBe(100)
    expect(excerpt(source, 0, 3)).toBe('first line')
  })
})

describe('a trace\'s account of the extension renderer\'s main thread', () => {
  // (Chrome's JSON trace events: the extension's frame committed in process 9, whose main thread is 3; a task begun there
  // never ended, a layout begun inside it never ended either, a slice inside it closed; the CPU profiler's samples in chunks)
  const events = [
    { name: 'TracingStartedInBrowser', ph: 'I', pid: 1, tid: 1, ts: 0, args: { data: { frames: [{ url: 'about:blank', processId: 7 }] } } },
    { name: 'FrameCommittedInBrowser', ph: 'I', pid: 1, tid: 1, ts: 10, args: { data: { url: `${ORIGIN}/pdf-reader.html?live=1`, processId: 9 } } },
    { name: 'thread_name', ph: 'M', pid: 9, tid: 3, ts: 0, args: { name: 'CrRendererMain' } },
    { name: 'RunTask', cat: 'toplevel', ph: 'X', pid: 9, tid: 3, ts: 100_000, dur: 80_000 },
    { name: 'FunctionCall', cat: 'devtools.timeline', ph: 'X', pid: 9, tid: 3, ts: 200_000, dur: 1000, args: { data: { functionName: 'tell', url: `${ORIGIN}/chunks/reader-X.js`, lineNumber: 0, columnNumber: 9 } } },
    { name: 'RunTask', cat: 'toplevel', ph: 'B', pid: 9, tid: 3, ts: 1_000_000 },
    { name: 'FunctionCall', cat: 'devtools.timeline', ph: 'B', pid: 9, tid: 3, ts: 1_000_100, args: { data: { functionName: 'spins', url: `${ORIGIN}/chunks/reader-X.js`, lineNumber: 0, columnNumber: 41 } } },
    { name: 'Layout', cat: 'devtools.timeline', ph: 'B', pid: 9, tid: 3, ts: 1_000_500 },
    { name: 'UpdateLayoutTree', cat: 'blink', ph: 'B', pid: 9, tid: 3, ts: 1_000_600 },
    { name: 'UpdateLayoutTree', cat: 'blink', ph: 'E', pid: 9, tid: 3, ts: 1_000_700 },
    { name: 'ProfileChunk', ph: 'P', id: '0x1', pid: 9, tid: 5, ts: 1_100_000, args: { data: { cpuProfile: { nodes: [{ id: 1, callFrame: { functionName: '(root)', url: '', lineNumber: -1, columnNumber: -1 } }, { id: 2, callFrame: { functionName: 'spins', url: `${ORIGIN}/chunks/reader-X.js`, lineNumber: 0, columnNumber: 41 } }], samples: [2, 2, 1] } } } },
    { name: 'ProfileChunk', ph: 'P', id: '0x1', pid: 9, tid: 5, ts: 1_200_000, args: { data: { cpuProfile: { samples: [2] } } } },
    { name: 'RunTask', cat: 'toplevel', ph: 'X', pid: 7, tid: 2, ts: 3_000_000, dur: 10 },
  ]
  it('names the slices begun and never ended, outermost first, the long tasks, the last events and the leaf sampled most', () => {
    const said = traceStall(events, { origin: ORIGIN }) ?? ''
    expect(said).toContain('renderer 9, main thread 3')
    expect(said).toContain('never ended: RunTask (toplevel) begun 2000 ms before the trace\'s end < FunctionCall [spins chunks/reader-X.js:1:42] (devtools.timeline) begun 2000 ms before the trace\'s end < Layout (devtools.timeline) begun 2000 ms before the trace\'s end;')
    expect(said).toContain('long: RunTask 80 ms, ended 2820 ms before the trace\'s end')
    expect(said).toContain('last: RunTask 80 ms, FunctionCall [tell chunks/reader-X.js:1:10] 1 ms, RunTask (B), FunctionCall [spins chunks/reader-X.js:1:42] (B), Layout (B), UpdateLayoutTree (B), UpdateLayoutTree (E)')
    expect(said).toContain('sampled most in the last 5000 ms: spins chunks/reader-X.js:1:42 x3')
    expect(said).not.toContain('(root)')
  })
  it('counts only the samples of the trace\'s last moments, by the profile\'s start and the samples\' time deltas', () => {
    const at = (ts: number, samples: number[], deltas: number[]) => ({ name: 'ProfileChunk', ph: 'P', id: '0x2', pid: 9, tid: 5, ts, args: { data: { cpuProfile: { samples }, timeDeltas: deltas } } })
    const profiled = [
      ...events.filter(e => e.name !== 'ProfileChunk'),
      { name: 'Profile', ph: 'P', id: '0x2', pid: 9, tid: 5, ts: 0, args: { data: { startTime: 0 } } },
      { name: 'ProfileChunk', ph: 'P', id: '0x2', pid: 9, tid: 5, ts: 1, args: { data: { cpuProfile: { nodes: [{ id: 1, callFrame: { functionName: 'early', url: '', lineNumber: 0, columnNumber: 0 } }, { id: 2, callFrame: { functionName: 'late', url: '', lineNumber: 0, columnNumber: 0 } }], samples: [1, 1] }, timeDeltas: [100, 100] } } },
      at(2_900_000, [2, 2], [2_899_800, 50_000]),
    ]
    expect(traceStall(profiled, { origin: ORIGIN, recentMs: 1000 }) ?? '').toContain('sampled most in the last 1000 ms: late :1:1 x2')
  })
  it('is null where the trace names no renderer of the extension', () => {
    expect(traceStall(events, { origin: 'chrome-extension://zzzzzz' })).toBeNull()
  })
})
