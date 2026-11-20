// @vitest-environment node
// A browser check's own steps bounded (tests/e2e/lib/settles.mjs): a step that settles gives its value, or its error, as it is;
// one that does not fails past its bound, naming itself and what the browser says then; that report is bounded too
import { describe, expect, it } from 'vitest'
import { settles, stallReport } from './settles.mjs'

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
