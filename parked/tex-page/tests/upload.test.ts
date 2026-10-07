// The upload list of the TeX page's site (experiments/pdf-bilingual/tex-page/upload.mjs) and the check of a bucket
// against it (verify.mjs): each object's headers, the brotli copy only where it pays, and a bucket that holds the
// wrong bytes, the wrong headers or too little found out
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { brotliWorth, ENTRY, headersOf, IMMUTABLE, listText, parseList } from '../tex-page/upload.mjs'
import { verify } from '../tex-page/verify.mjs'

describe('headersOf', () => {
  it('types the page and the engine by extension, the wasm as application/wasm; all immutable but the entry', () => {
    expect(headersOf('e/e1/busytex.wasm', 't1')).toEqual({ type: 'application/wasm', cache: IMMUTABLE })
    expect(headersOf('c/c1/tex.js', 't1')).toEqual({ type: 'text/javascript; charset=utf-8', cache: IMMUTABLE })
    expect(headersOf('c/c1/tex-page.mjs', 't1').type).toBe('text/javascript; charset=utf-8')
    expect(headersOf('c/c1/build.json', 't1').type).toBe('application/json')
    expect(headersOf('e/e1/tl-common.data', 't1').type).toBe('application/octet-stream')
    expect(headersOf('b/0b44e899d7a3.bin', 't1').type).toBe('application/octet-stream')
    expect(headersOf('c/c1/legal/LICENSE.TL', 't1').type).toBe('text/plain; charset=utf-8')
    expect(headersOf('tex.html', 't1')).toEqual({ type: 'text/html; charset=utf-8', cache: ENTRY })
  })

  it('the tree\'s files are octet-streams whatever their name; its index is text', () => {
    expect(headersOf('t/t1/tex/latex/base/article.cls', 't1')).toEqual({ type: 'application/octet-stream', cache: IMMUTABLE })
    expect(headersOf('t/t1/doc/README.txt', 't1').type).toBe('application/octet-stream')
    expect(headersOf('t/t1/index-0ba64a0c0bea.txt', 't1')).toEqual({ type: 'text/plain; charset=utf-8', cache: IMMUTABLE })
  })

  it('an extension it does not know fails: a guessed type can break the page for every reader', () => {
    expect(() => headersOf('e/e1/busytex.weird', 't1')).toThrow(/no Content-Type/)
  })
})

describe('brotliWorth', () => {
  it('the brotli copy where it is at least 5 % smaller, the file otherwise', () => {
    expect(brotliWorth(1000, 950)).toBe(true)
    expect(brotliWorth(1000, 951)).toBe(false)
    expect(brotliWorth(0, 0)).toBe(false)
  })
})

describe('the list', () => {
  it('round-trips through its text', () => {
    const rows = [{ key: 't/t1/a b/c.sty', file: '/x/c.sty.br', type: 'application/octet-stream', encoding: 'br', cache: IMMUTABLE, bytes: 12, sha256: 'ab' }, { key: 'tex.html', file: '/x/tex.html', type: 'text/html; charset=utf-8', encoding: '', cache: ENTRY, bytes: 3, sha256: 'cd' }]
    expect(parseList(listText(rows))).toEqual(rows)
  })
})

describe('verify', () => {
  const sha = (s: string) => createHash('sha256').update(s).digest('hex')
  const INDEX = './\nls-R\ntex/latex/base/\narticle.cls'
  const rows = [
    { key: 'c/c1/tex.js', file: '', type: 'text/javascript; charset=utf-8', encoding: 'br', cache: IMMUTABLE, bytes: 1, sha256: sha('js') },
    { key: 't/t1/index-0ba64a0c0bea.txt', file: '', type: 'text/plain; charset=utf-8', encoding: 'br', cache: IMMUTABLE, bytes: 1, sha256: sha(INDEX) },
    { key: 't/t1/ls-R', file: '', type: 'application/octet-stream', encoding: '', cache: IMMUTABLE, bytes: 1, sha256: sha('lsr') },
    { key: 't/t1/tex/latex/base/article.cls', file: '', type: 'application/octet-stream', encoding: 'br', cache: IMMUTABLE, bytes: 1, sha256: sha('cls') },
    { key: 'tex.html', file: '', type: 'text/html; charset=utf-8', encoding: '', cache: ENTRY, bytes: 1, sha256: sha('html') },
  ]
  const content: Record<string, string> = { 'c/c1/tex.js': 'js', 't/t1/index-0ba64a0c0bea.txt': INDEX, 't/t1/ls-R': 'lsr', 't/t1/tex/latex/base/article.cls': 'cls', 'tex.html': 'html' }
  /** a bucket behind a CDN: what each key holds (decoded, as the platform's fetch hands it over) and its headers */
  const bucket = (over: Record<string, { body?: string; headers?: Record<string, string>; status?: number }> = {}) => async (url: string, init: { method?: string } = {}) => {
    const key = decodeURIComponent(new URL(url).pathname.slice(1))
    const r = rows.find(x => x.key === key)
    const o = over[key] ?? {}
    if (!r || o.status === 404) return new Response(null, { status: 404 })
    const headers = { 'content-type': r.type, 'cache-control': r.cache, ...(r.encoding ? { 'content-encoding': r.encoding } : {}), ...o.headers }
    return new Response(init.method === 'HEAD' ? null : (o.body ?? content[key]), { headers })
  }
  const run = (fetch: ReturnType<typeof bucket>) => verify({ base: 'https://tex.example', rows, indexText: INDEX, fetch, rate: 1e6 })

  it('a bucket that holds the list: no difference; every index path asked for', async () => {
    const r = await run(bucket())
    expect(r.failures).toEqual([])
    expect(r.checked).toEqual({ site: 3, tree: 2, sampled: 2 })
  })

  it('finds a compressed copy stored without its encoding, the wrong type, a missing tree file', async () => {
    const r = await run(bucket({ 'c/c1/tex.js': { headers: { 'content-encoding': '' }, body: 'garbled' }, 't/t1/ls-R': { status: 404 }, 'tex.html': { headers: { 'content-type': 'application/octet-stream' } } }))
    expect(r.failures.map(f => f.key).sort()).toEqual(['c/c1/tex.js', 'c/c1/tex.js', 'c/c1/tex.js', 't/t1/ls-R', 't/t1/ls-R', 't/t1/ls-R', 'tex.html'])
    expect(r.failures.find(f => f.key === 'tex.html')?.what).toMatch(/^type/)
  })

  it('an object stored as it is that the CDN compresses on the way is no difference', async () => {
    const r = await run(bucket({ 'tex.html': { headers: { 'content-encoding': 'br' } } }))
    expect(r.failures).toEqual([])
  })
})
