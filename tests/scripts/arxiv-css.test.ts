import { readFileSync, readdirSync } from 'node:fs'
import { get } from 'node:http'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// @ts-expect-error — plain node scripts the e2e suites and the refresh command share, deliberately untyped
import { serveOffline } from '../e2e/lib/offline-arxiv.mjs'
// @ts-expect-error — as above
import { VENDORED, importsOf, stylesheetLinks } from '../../scripts/refresh-arxiv-css.mjs'

// The style sheets vendored for the offline accessibility audit (tests/e2e/fixtures/arxiv-css/README.md, issue #100).
// arXiv names a sheet by its date and moves it; a fixture linking one the tree does not hold would make the audit's
// contrast rules judge a page nobody reads, and nothing would say so

const FIXTURES = join(import.meta.dirname, '../fixtures/arxiv')
const read = (path: string): string => readFileSync(join(VENDORED, path.slice(1)), 'utf8')

/** Every sheet a fixture links, and everything those import in turn, as /static/ paths */
function reachableFrom(html: string): { reached: Set<string>; missing: string[] } {
  const reached = new Set<string>()
  const missing: string[] = []
  const queue: string[] = stylesheetLinks(html)
  for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
    if (reached.has(path)) continue
    reached.add(path)
    try {
      queue.push(...importsOf(read(path)))
    } catch {
      missing.push(path)
    }
  }
  return { reached, missing }
}

describe('the vendored style sheets', () => {
  const papers = readdirSync(FIXTURES).filter(f => f.endsWith('.html') && f !== 'synthetic-structures.html')

  it('hold every sheet a fixture links, and every sheet those import', () => {
    expect(papers.length).toBeGreaterThan(0)
    for (const paper of papers) {
      const { reached, missing } = reachableFrom(readFileSync(join(FIXTURES, paper), 'utf8'))
      expect({ paper, linked: reached.size > 0, missing }).toEqual({ paper, linked: true, missing: [] })
    }
  })

  it('hold nothing that no fixture reaches, so a refresh leaves no stale sheet behind', () => {
    const reached = new Set<string>()
    for (const paper of papers) for (const path of reachableFrom(readFileSync(join(FIXTURES, paper), 'utf8')).reached) reached.add(path)
    const held = (readdirSync(join(VENDORED, 'static'), { recursive: true, withFileTypes: true }) as { isFile(): boolean; name: string; parentPath: string }[])
      .filter(entry => entry.isFile())
      .map(entry => join(entry.parentPath, entry.name).slice(VENDORED.length))
    expect([...held].sort()).toEqual([...reached].sort())
  })

  it('carry the licence of the repository they come from', () => {
    for (const [name, holder] of [['LICENSE-arxiv-browse', 'arXiv, Inc.'], ['LICENSE-arxiv-base', 'arXiv, Inc.'], ['LICENSE-ar5iv-css', 'Deyan Ginev']] as const) {
      const text = readFileSync(join(VENDORED, name), 'utf8')
      expect(text, name).toContain('Permission is hereby granted, free of charge')
      expect(text, name).toContain(holder)
    }
  })
})

describe('stylesheetLinks and importsOf', () => {
  it('read the sheets a page links on arXiv\'s own tree, and what a sheet imports from it', () => {
    const html = '<link rel="stylesheet" href="/static/a/x.css?v=2"><link href="/static/a/y.css" rel=stylesheet><link rel="icon" href="/static/a/i.png"><link rel="stylesheet" href="https://use.typekit.net/z.css">'
    expect(stylesheetLinks(html)).toEqual(['/static/a/x.css', '/static/a/y.css'])
    expect(importsOf('@import "/static/b/one.css" layer(a);\n@import url("/static/b/two.css");\n@import "https://elsewhere/three.css";')).toEqual(['/static/b/one.css', '/static/b/two.css'])
  })
})

describe('the offline server', () => {
  let site: { origin: string; served: { html: number; css: Set<string>; missing: Set<string> }; close(): void }
  beforeAll(async () => { site = await serveOffline() })
  afterAll(() => site.close())

  /** A request with the path exactly as given (fetch would resolve `..` and `%2e%2e` before sending), through Node's http */
  const ask = (path: string): Promise<{ status: number; type: string; body: string }> => new Promise((resolve, reject) => {
    get({ host: '127.0.0.1', port: Number(new URL(site.origin).port), path }, res => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, type: String(res.headers['content-type']), body }))
    }).on('error', reject)
  })

  it('serves a fixture as arXiv served it, and a sheet as CSS', async () => {
    const paper = await ask('/html/2410.00260')
    expect([paper.status, paper.type]).toEqual([200, 'text/html; charset=utf-8'])
    expect(paper.body).toBe(readFileSync(join(FIXTURES, '2410.00260.html'), 'utf8'))
    expect((await ask('/html/2410.00260v1')).status).toBe(200)
    const sheet = await ask('/static/browse/0.3.4/css/arxiv-html-papers-20260823.css?v=1')
    expect([sheet.status, sheet.type]).toEqual([200, 'text/css; charset=utf-8'])
    expect(sheet.body).toContain('@import')
  })

  it('serves nothing else: a script, a font, an unknown paper, and no path out of the vendored tree', async () => {
    for (const path of ['/static/browse/0.3.4/js/arxiv-html-papers-20260131.js', '/static/browse/0.3.4/fonts/STIXTwoMath-Regular.woff2', '/html/0000.00000', '/', '/static/..%2f..%2f..%2f..%2fpackage.css', '/static/%2e%2e/%2e%2e/package.json']) {
      expect([path, (await ask(path)).status]).toEqual([path, 404])
    }
    // An unknown paper says what to do, and a font the page asks for is recorded as asked-for-and-missing
    expect((await ask('/html/0000.00000')).body).toContain('pnpm fixtures:fetch')
    expect(site.served.missing.has('/static/browse/0.3.4/fonts/STIXTwoMath-Regular.woff2')).toBe(true)
  })
})
