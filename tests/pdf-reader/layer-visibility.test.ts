// The document's renders (layer-proto/visibility.mjs): its pages kept warm after them, WARM_PAGES of them, the oldest let go
import { describe, expect, it } from 'vitest'
import { visibilityOf, WARM_PAGES } from '@/pdf-reader/engine/layer-proto/visibility.mjs'

/** a page as PDF.js 6.3.289 holds one: its render asks the worker for its list unless it still holds it, its cleanup lets it go */
function pagesOf(log: string[]) {
  const pages = new Map<number, { n: number; held: boolean; render(): { promise: Promise<void> }; cleanup(): void }>()
  return (n: number, fail = false) => {
    let p = pages.get(n)
    if (!p) {
      const page = {
        n, held: false,
        render() { log.push(`render ${n}`); if (!page.held) { log.push(`list ${n}`); page.held = true } return { promise: fail ? Promise.reject(new Error('refused')) : Promise.resolve() } },
        cleanup() { log.push(`cleanup ${n}`); page.held = false },
      }
      p = page
      pages.set(n, p)
    }
    return p
  }
}

describe('a document keeps the pages it rendered last warm', () => {
  it('at most WARM_PAGES pages, the oldest let go once a newer one is rendered; a page rendered again is the newest', async () => {
    const log: string[] = [], page = pagesOf(log), V = visibilityOf({})
    for (let n = 1; n <= WARM_PAGES; n++) await V.render(page(n), {})
    expect(log.filter(l => l.startsWith('cleanup'))).toEqual([])
    // (page 1 again: no list asked, and it is the newest now)
    await V.render(page(1), {})
    expect(log.at(-1)).toBe('render 1')
    await V.render(page(WARM_PAGES + 1), {})
    expect(log.filter(l => l.startsWith('cleanup'))).toEqual(['cleanup 2'])
    expect(V.warm.map(p => (p as { n: number }).n)).toEqual([...Array.from({ length: WARM_PAGES - 2 }, (_, i) => i + 3), 1, WARM_PAGES + 1])
    // (page 2 again asks its list again: it was let go)
    log.length = 0
    await V.render(page(2), {})
    expect(log).toEqual(['render 2', 'list 2', `cleanup ${WARM_PAGES > 2 ? 3 : 1}`])
  })

  it('a page whose render threw is kept as any other, and the next render runs', async () => {
    const log: string[] = [], page = pagesOf(log), V = visibilityOf({})
    await expect(V.render(page(1, true), {})).rejects.toThrow('refused')
    await V.render(page(2), {})
    expect(V.warm.map(p => (p as { n: number }).n)).toEqual([1, 2])
  })

  it('one set of warm pages a document: a second document keeps its own', async () => {
    const log: string[] = [], a = pagesOf(log), b = pagesOf(log), A = visibilityOf({}), B = visibilityOf({})
    for (let n = 1; n <= WARM_PAGES; n++) await A.render(a(n), {})
    await B.render(b(9), {})
    expect(log.filter(l => l.startsWith('cleanup'))).toEqual([])
    expect([A.warm.length, B.warm.length]).toEqual([WARM_PAGES, 1])
  })

  it('a pinned page is never let go while a reading holds it; let go among the oldest once released', async () => {
    const log: string[] = [], page = pagesOf(log), V = visibilityOf({})
    await V.render(page(1), {})
    const release = V.pin(page(1))
    for (let n = 2; n <= WARM_PAGES + 2; n++) await V.render(page(n), {})
    expect(log.filter(l => l === 'cleanup 1')).toEqual([])
    expect(V.warm.length).toBe(WARM_PAGES)
    release()
    release()
    await V.render(page(WARM_PAGES + 3), {})
    expect(log.filter(l => l === 'cleanup 1')).toEqual(['cleanup 1'])
  })

  it('a render whose reader has let go by its turn is not drawn nor kept (an AbortError)', async () => {
    const log: string[] = [], page = pagesOf(log), V = visibilityOf({})
    let alive = true
    const first = V.render(page(1), {})
    const second = V.render(page(2), {}, [], () => alive)
    alive = false
    await first
    await expect(second).rejects.toMatchObject({ name: 'AbortError' })
    expect(log.filter(l => l.startsWith('render'))).toEqual(['render 1'])
    expect(V.warm.map(p => (p as { n: number }).n)).toEqual([1])
  })
})
