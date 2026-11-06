// What the reader knows of its paper beside the layer, as today's (R engine/view/reader-view.mjs reportPaper, session/paper.ts,
// core/pdf/entry.ts htmlVersionOf): its title, the PDF's own with arXiv's margin stamp dropped, else the abstract page's (one
// request a visit, forgotten where it could not be read); arXiv's HTML version, which only a 404 or a 410 says is none.
import { describe, expect, it } from 'vitest'
import {
  ABSTRACT_MS,
  abstractPage,
  abstractTitleOf,
  HTML_CHECK_MS,
  htmlVersionOf,
  titleOf,
} from '../src/session/paper.ts'
import { flush, manualTimers } from './helpers/ranged-server.ts'

const page = (title: string) => `<html><head><meta name="citation_title" content="${title}"></head><body></body></html>`
const never = (init?: RequestInit) =>
  new Promise<Response>((_, reject) =>
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true }),
  )

describe("the paper's title", () => {
  it("is the PDF's Info Title, arXiv's margin stamp no title", () => {
    expect(titleOf({ Title: '  Deep Residual Learning  ' })).toBe('Deep Residual Learning')
    expect(titleOf({ Title: 'arXiv:1007.0072v1  [quant-ph]  1 Jul 2010' })).toBe('')
    expect(titleOf({ Title: '' })).toBe('')
    expect(titleOf(null)).toBe('')
  })
  it("else the abstract page's citation_title, asked once a visit, by the id without its version", async () => {
    expect(abstractTitleOf(page('A Title &amp; More'))).toBe('A Title & More')
    const asked: string[] = []
    const title = abstractPage(async (u) => {
      asked.push(u)
      return new Response(page('From the Abstract'))
    }, '2401.01234v3')
    expect(await title()).toBe('From the Abstract')
    expect(await title()).toBe('From the Abstract')
    expect(asked).toEqual(['https://arxiv.org/abs/2401.01234'])
  })
  it('one that could not be read is forgotten, so that a later open asks again; nothing within 15 s is none', async () => {
    let n = 0
    const title = abstractPage(
      async () => (n++ === 0 ? new Response('', { status: 503 }) : new Response(page('T'))),
      'x',
    )
    expect(await title()).toBe('')
    expect(await title()).toBe('T')
    const timers = manualTimers()
    const slow = abstractPage((_u, init) => never(init), 'x', timers)
    const p = slow()
    await flush()
    timers.advance(ABSTRACT_MS)
    expect(await p).toBe('')
    // (a host that does not serve arXiv's origin refuses at once: no title of the page, nothing else)
    expect(await abstractPage(() => Promise.reject(new TypeError('refused')), 'x')()).toBe('')
  })
})

describe("the paper's HTML version", () => {
  it('is offered with the hash that translates it unless arXiv says it has none (a 404 or a 410): one HEAD', async () => {
    const asked: [string, string | undefined][] = []
    const at = (status: number) =>
      htmlVersionOf(async (u, i) => {
        asked.push([u, i?.method])
        return new Response(null, { status })
      }, '2401.01234v2')
    expect(await at(200)).toBe('https://arxiv.org/html/2401.01234v2#readarxiv')
    expect(await at(404)).toBeNull()
    expect(await at(410)).toBeNull()
    // (a 429 or a 5xx says nothing about the paper)
    expect(await at(429)).toBe('https://arxiv.org/html/2401.01234v2#readarxiv')
    expect(await at(503)).toBe('https://arxiv.org/html/2401.01234v2#readarxiv')
    expect(asked[0]).toEqual(['https://arxiv.org/html/2401.01234v2', 'HEAD'])
  })
  it('a request that fails, or says nothing within 3 s, offers it', async () => {
    expect(await htmlVersionOf(() => Promise.reject(new TypeError('offline')), 'x')).toBe(
      'https://arxiv.org/html/x#readarxiv',
    )
    const timers = manualTimers()
    const p = htmlVersionOf((_u, init) => never(init), 'x', timers)
    await flush()
    timers.advance(HTML_CHECK_MS)
    expect(await p).toBe('https://arxiv.org/html/x#readarxiv')
  })
})
