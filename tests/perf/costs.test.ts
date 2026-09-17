// Three costs measured rather than argued about (2026-09-17): the lazy scheduler
// observing a whole paper, the cache port writing a batch one record at a time, and the sentence highlight's
// MutationObserver taking a pipeline burst. Readings, not assertions, are the product — they are recorded beside the
// decisions they bear on (DESIGN §9, §10, §7.7) — so the tests are skipped unless asked for: AXT_MEASURE=1 pnpm vitest run tests/perf
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TranslationCache, cachePortOf, createCacheDb } from '@/cache'
import { type Block, extract, markBlocks } from '@/core/extractor'
import { clearSentenceHighlights, startSentenceHighlight } from '@/core/renderer/highlight'
import { DEFAULT_PRELOAD, createLazyScheduler } from '@/core/scheduler/lazy'

const measure = it.skipIf(!process.env.AXT_MEASURE)
/** The heaviest fixture: the block count is what the lazy scheduler and the burst are sized by */
const FIXTURE = join(import.meta.dirname, '../fixtures/arxiv/2312.17141.html')

function timed(fn: () => void): number {
  const start = performance.now()
  fn()
  return performance.now() - start
}
async function timedAsync(fn: () => Promise<void>): Promise<number> {
  const start = performance.now()
  await fn()
  return performance.now() - start
}
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0
const ms = (value: number) => `${value.toFixed(2)} ms`
const report = (line: string) => console.info(`[measure] ${line}`)

/** happy-dom has no IntersectionObserver: the fake records observe / unobserve and emits by hand, as in tests/scheduler */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  observed = new Set<Element>()
  constructor(readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this)
  }
  observe(el: Element) { this.observed.add(el) }
  unobserve(el: Element) { this.observed.delete(el) }
  disconnect() { this.observed.clear() }
  takeRecords() { return [] }
  emit(targets: Element[]) {
    this.callback(targets.map(target => ({
      target,
      isIntersecting: true,
      intersectionRatio: 1,
      rootBounds: { height: 900 + 2 * DEFAULT_PRELOAD.margin } as DOMRectReadOnly,
      boundingClientRect: target.getBoundingClientRect(),
    })) as IntersectionObserverEntry[], this as unknown as IntersectionObserver)
  }
}

describe('costs', () => {
  const g = globalThis as { IntersectionObserver?: unknown; innerHeight?: number }
  const rect = Element.prototype.getBoundingClientRect
  afterEach(() => {
    Element.prototype.getBoundingClientRect = rect
    g.IntersectionObserver = undefined
    document.body.innerHTML = ''
  })

  measure('lazy scheduler over the heaviest fixture', () => {
    const doc = new DOMParser().parseFromString(readFileSync(FIXTURE, 'utf8'), 'text/html')
    const blocks = extract(doc)
    markBlocks(blocks)
    // Every block gets a layout box of its own — happy-dom's rectangles are all zeros, which the scheduler reads as "not
    // laid out" — stacked 40 px apart, so the first screen holds a couple of dozen and the rest are observed
    blocks.forEach((block, i) => {
      const top = 100 + i * 40
      block.el.getBoundingClientRect = () => ({ top, bottom: top + 20, left: 0, right: 600, width: 600, height: 20, x: 0, y: top, toJSON: () => ({}) })
    })
    g.IntersectionObserver = FakeIntersectionObserver
    g.innerHeight = 900
    const rounds = 5
    const create: number[] = []
    const burst: number[] = []
    const claimAll: number[] = []
    const screens: number[] = []
    let observed = 0
    for (let round = 0; round < rounds; round++) {
      FakeIntersectionObserver.instances = []
      let entered = 0
      const taken: Block[] = []
      let scheduler!: ReturnType<typeof createLazyScheduler<Block>>
      // Creation hands the first screen over at once and observes the rest
      create.push(timed(() => { scheduler = createLazyScheduler(blocks, { ...DEFAULT_PRELOAD, onEnter: (picked: Block[]) => { entered += picked.length; taken.push(...picked) } }) }))
      const io = FakeIntersectionObserver.instances[0]!
      observed = io.observed.size
      expect(observed).toBe(blocks.length - entered)
      // One burst: everything left intersects at once (a reader jumping to the end of a paper)
      burst.push(timed(() => io.emit([...io.observed])))
      expect(entered).toBe(blocks.length)
      // What production does with every hand-over: the ledger's intake claims the taken blocks, and `claim` walks
      // picked × anchors to release them — the nested scan the inventory asked about (Codex on #215)
      claimAll.push(timed(() => scheduler.claim(taken)))
      scheduler.disconnect()
      // Screen by screen: twenty blocks per notification, each claimed as it comes, the way a reader scrolls
      FakeIntersectionObserver.instances = []
      const hold: { s: ReturnType<typeof createLazyScheduler<Block>> | null } = { s: null }
      hold.s = createLazyScheduler(blocks, { ...DEFAULT_PRELOAD, onEnter: (picked: Block[]) => { hold.s?.claim(picked) } })
      const io2 = FakeIntersectionObserver.instances[0]!
      const all = [...io2.observed]
      screens.push(timed(() => { for (let at = 0; at < all.length; at += 20) io2.emit(all.slice(at, at + 20)) }))
      hold.s.disconnect()
    }
    report(`lazy scheduler: ${blocks.length} blocks; create (first screen handed over, the rest observed) ${ms(median(create))}; one burst of the observed ${ms(median(burst))} + claiming all ${blocks.length} at once ${ms(median(claimAll))}; ${Math.ceil(observed / 20)} screens of 20, each claimed ${ms(median(screens))} total`)
    expect(blocks.length).toBeGreaterThan(0)
  })

  measure('cache port putMany, one set per record', async () => {
    const cache = new TranslationCache({ db: createCacheDb(`axt-perf-${Date.now()}`) })
    const port = cachePortOf(cache)
    const entries = (n: number, tag: string) => Array.from({ length: n }, (_, i) => ({ key: `k-${tag}-${i}`, translation: `translation ${i} `.repeat(20), paper: '2312.17141' }))
    const lines: string[] = []
    for (const size of [1, 50, 200, 880]) {
      const took = await timedAsync(() => port.putMany(entries(size, `b${size}`)))
      lines.push(`${size} → ${ms(took)} (${(took / size).toFixed(2)} ms each)`)
    }
    const again = await timedAsync(() => port.putMany(entries(200, 'b200')))
    lines.push(`200 rewritten → ${ms(again)}`)
    const read = await timedAsync(async () => { await port.getMany(entries(880, 'b880').map(e => e.key)) })
    lines.push(`getMany 880 → ${ms(read)}`)
    report(`cache putMany (fake-indexeddb): ${lines.join('; ')}`)
    expect((await cache.stats()).entries).toBe(1131)
  })

  measure('sentence highlight MutationObserver taking a pipeline burst', () => {
    const doc = document
    const view = doc.defaultView as unknown as Record<string, unknown>
    Object.assign(doc, { caretPositionFromPoint: () => null })
    const callbacks: ((records: MutationRecord[]) => void)[] = []
    view.MutationObserver = class {
      constructor(readonly fn: (records: MutationRecord[]) => void) {}
      // One observer watches both <body> and <html>: registered once, as a real observer delivers one callback for
      // every target it watches (Codex on #215: registered per observe(), the burst was processed twice)
      observe() { if (!callbacks.includes(this.fn)) callbacks.push(this.fn) }
      disconnect() {}
      takeRecords() { return [] }
    }
    view.ResizeObserver = class { observe() {} disconnect() {} }
    view.requestAnimationFrame = () => 1
    view.cancelAnimationFrame = () => {}
    Object.defineProperty(doc, 'fonts', { configurable: true, value: { addEventListener() {}, removeEventListener() {} } })
    const article = doc.createElement('article')
    article.className = 'ltx_document'
    for (let i = 0; i < 880; i++) {
      const p = doc.createElement('p')
      p.className = 'ltx_p'
      p.textContent = `Paragraph ${i} of the paper, long enough to look like text.`
      article.append(p)
    }
    doc.body.append(article)
    const highlight = startSentenceHighlight(doc)
    expect(highlight).toBeDefined()
    expect(callbacks.length).toBeGreaterThan(0)
    // The pipeline's burst: for every block a translation node inserted after it (a childList record on the article)
    // and its text set in place afterwards (a characterData record on the text node)
    const record = (type: MutationRecordType, target: Node, added: Node[] = []): MutationRecord => ({
      type, target, addedNodes: added as unknown as NodeList, removedNodes: [] as unknown as NodeList,
      attributeName: null, attributeNamespace: null, nextSibling: null, previousSibling: null, oldValue: null,
    })
    const records: MutationRecord[] = []
    for (const p of Array.from(article.children)) {
      const t = doc.createElement('p')
      t.className = 'axt-t'
      t.textContent = 'translation'
      p.after(t)
      records.push(record('childList', article, [t]), record('characterData', t.firstChild as Node))
    }
    const took = timed(() => { for (const fn of callbacks) fn(records) })
    // The same burst delivered in slices, the way the observer coalesces per task
    const sliced = timed(() => { for (let at = 0; at < records.length; at += 40) for (const fn of callbacks) fn(records.slice(at, at + 40)) })
    report(`highlight mutation burst: ${records.length} records in one callback ${ms(took)}; in slices of 40 ${ms(sliced)} total`)
    highlight?.stop()
    clearSentenceHighlights(doc)
  })
})
