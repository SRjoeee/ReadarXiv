// lab/typeset/checkpoint/entry-reader.mjs --laid=<laid.mjs --entry's file> --pair=<pair> [--out=<dir>]: the reader's own harness
// page (packages/reader/e2e/page, built with its config) composing the typesetter's own Pages (design-a's Page made by layPage
// over the paper's parts and the gate's rows: laid.mjs --entry), so that what the reader does with Laid.lit and Page.links is
// seen end to end on a corpus paper:
// - the highlight: hovering a laid member on either pane lights that member, with the bands its boxes make on both panes (the
//   reader's compose/highlight.ts from `lit`, what is painted is what is hit);
// - the links: every link the entry lays on a page is an anchor of the right's link layer over the page; a citation's link
//   moved with its piece, clicked, takes the right pane to the page its destination names (the original's annotation's own
//   destination, resolved by the original document as PDF.js resolves the left's), and lies where the entry drew its piece.
// Licensed papers are read in place from lab-data (the PDF, lane L7's bundles); nothing of them is written but the report's
// numbers. Served on the loopback; Playwright's Chromium behind a route table that refuses every other request. Run from the
// worktree's root through heavy-slot.sh e2e: npx tsx lab/typeset/checkpoint/entry-reader.mjs …
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'vite'
import { startServer } from '../../../packages/reader/e2e/server.mjs'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const ROOT = join(import.meta.dirname, '..', '..', '..')
// (the lab's data, the paper catalogue and the bundles: AXT_LAB, AXT_PAPERS, AXT_L1_BUNDLES, each defaulting to this machine's)
const LAB = process.env.AXT_LAB ?? '/Users/cheongzhiyan/Developer/readarxiv-lab-data/refactor-2026-11'
const PAIR = arg('pair')
const LAID = JSON.parse(readFileSync(arg('laid'), 'utf8'))[PAIR]
if (!LAID?.links) throw new Error(`${PAIR}: no entry pages with links in ${arg('laid')} (laid.mjs --entry)`)
const OUT = arg('out', join(ROOT, 'packages/reader/e2e/.entry-out'))
const id = PAIR.split('-')[0]
const target = PAIR.split('-')[1].split('.')[0]
const bundle = join(process.env.AXT_L1_BUNDLES ?? join(LAB, 'lanes/L7/prepare/bundles'), id)
const catalogue = process.env.AXT_PAPERS ?? join(LAB, 'baseline/corpora/papers.json')
const paper = JSON.parse(readFileSync(catalogue, 'utf8')).papers.find((p) => p.id === id)
if (!paper) throw new Error(`${id}: not in the paper catalogue ${catalogue} (AXT_PAPERS)`)
const pdf = join(paper.dir, 'arxiv.pdf')

// ---------------------------------------------------------------- what the server answers
const head = JSON.parse(readFileSync(join(bundle, 'head.json'), 'utf8'))
const seg = `${head.paper.id.replace('.', '_')}v${head.paper.version}`
const objects = new Map([[`/api/v2/o/arxiv/${seg}.pdf`, pdf]])
for (const f of readdirSync(bundle))
  if (/^[0-9a-f]{64}\./.test(f)) objects.set(`/api/v2/o/p/${seg}/fx/${f.split('.')[0]}`, join(bundle, f))
const headDigest = readdirSync(bundle)
  .find((f) => f.endsWith('.head'))
  .split('.')[0]
// (the rows the stand-in lay waits on: one for every member's unit of the parts, its text unread, the Pages are what is drawn)
const ids = new Set()
for (const d of head.parts) {
  if (!d) continue
  const part = JSON.parse(readFileSync(join(bundle, `${d}.part`), 'utf8'))
  for (const m of part.flows.flat()) if (typeof m.text === 'string') ids.add(m.text)
}
const rows = { format: 1, rows: [...ids].map((u) => ({ id: u, ok: true, content: [{ t: 'text', s: '' }], by: 'entry' })) }
// (the entry's Pages: its members and links; a run's face named for the harness's table, the drawing's face is not checked)
const cjk = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/
const pages = Object.fromEntries(
  Object.entries(LAID.pages).map(([n, members]) => [
    n,
    {
      page: Number(n),
      wait: { rows: [], faces: [] },
      members: members.map((m) => ({
        ...m,
        lines: m.lines.map(([y, x0, x1, items]) => [
          y,
          x0,
          x1,
          items.map((it) => ('face' in it ? { ...it, face: cjk.test(it.s) ? 'cjk' : 'sans' } : it)),
        ]),
      })),
      links: LAID.links[n] ?? [],
    },
  ]),
)
const name = 'entry'
const index = {
  paper: `${head.paper.id}v${head.paper.version}`,
  seg,
  original: `/api/v2/o/arxiv/${seg}.pdf`,
  objects: `/api/v2/o/p/${seg}/fx/`,
  head: headDigest,
  dumps: {},
  rows: {},
  face: null,
}
const json = (res, body) => {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}
const routes = [
  {
    prefix: '/fixtures/',
    handle(_req, res, url) {
      const [, , n, file] = url.pathname.split('/')
      if (n !== name) return false
      if (file === 'index.json') return json(res, index)
      if (file === `${target}.reader.json`) return json(res, { units: [] })
      if (file === `${target}.rows.json`) return json(res, rows)
      return false
    },
  },
  {
    prefix: '/entry/',
    handle(_req, res, url) {
      if (url.pathname !== `/entry/${name}.json`) return false
      return json(res, pages)
    },
  },
]
await build({
  configFile: join(ROOT, 'packages/reader/e2e/vite.config.ts'),
  logLevel: 'warn',
  build: { outDir: join(OUT, 'page') },
})
const server = await startServer({ out: join(OUT, 'page'), objects, routes })

// ---------------------------------------------------------------- the browser
const pw = await import('playwright')
const browser = await pw.chromium.launch({ args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] })
const refused = []
const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 })
await context.route('**/*', (route) => {
  const u = route.request().url()
  if (u.startsWith(server.origin) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue()
  refused.push(u)
  return route.abort()
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (x) => errors.push(String(x)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
await page.goto(`${server.origin}/`)
await page.waitForFunction(() => !!globalThis.__h)
await page.evaluate((u) => window.__h.open(u), index.original)
await page.evaluate(([n, t]) => window.__h.layer(n, { pages: `/entry/${n}.json`, target: t }), [name, target])
const wait = (fn, a, ms = 30_000) => page.waitForFunction(fn, a, { timeout: ms, polling: 50 })
const failures = []
const report = []
for (const n of Object.keys(pages).map(Number).sort((a, b) => a - b)) {
  await page.evaluate((k) => window.__h.panes.goToPage('right', k), n)
  await wait(
    (k) => window.__h.marks.some((m) => m.what === 'shown' && m.page === k && String(m.key).startsWith('laid:')),
    n,
  ).catch(() => failures.push(`p${n}: never shown laid`))
  await page.waitForTimeout(400)
  // the highlight: each laid member hovered on each pane lights that member on both
  const ords = await page.evaluate(
    (k) => (window.__h.composer.laid(k)?.members ?? []).filter((m) => m.state === 'laid' && m.lines.length).map((m) => m.ord),
    n,
  )
  let hovers = 0,
    lit = 0
  for (const ord of ords.slice(0, 12))
    for (const side of ['right', 'left']) {
      const pt = await page.evaluate(([k, o, s]) => window.__h.pointOf(k, o, s), [n, ord, side])
      if (!pt) continue
      await page.mouse.move(pt.x, pt.y)
      await page.waitForTimeout(60)
      const r = await page.evaluate(() => ({ lit: window.__h.highlight.lit, bands: window.__h.highlight.bands() }))
      hovers++
      // (the member hovered, or a smaller one standing over the same point: what is painted is what is hit)
      if (r.lit?.id === ord && r.bands.left > 0 && r.bands.right > 0) lit++
      else if (!r.lit) failures.push(`p${n} ord ${ord} ${side}: nothing lit`)
      else if (!(r.bands.left > 0 && r.bands.right > 0)) failures.push(`p${n} ord ${ord} ${side}: bands ${JSON.stringify(r.bands)}`)
    }
  await page.mouse.move(2, 2)
  await page.waitForTimeout(250)
  // the links: the entry's, each an anchor over the right's page; the moved internal ones followed
  const given = pages[n].links.filter(([b, to]) => b[2] > b[0] && b[3] > b[1] && (to.dest || /^https?:|^mailto:/.test(to.url)))
  const anchors = await page.evaluate((k) => window.__h.linksOf(k), n)
  if (anchors.length !== given.length) failures.push(`p${n}: ${anchors.length} anchors for ${given.length} links`)
  const inner = anchors.filter((a) => a.href?.startsWith('#'))
  let followed = 0
  for (const a of inner.slice(0, 3)) {
    const dest = decodeURIComponent(a.href.slice(1))
    const want = await page.evaluate(async (d) => {
      const doc = window.__h.doc
      const parsed = d.startsWith('[') ? JSON.parse(d) : d.startsWith('"') ? JSON.parse(d) : d
      const explicit = Array.isArray(parsed) ? parsed : await doc.getDestination(parsed)
      if (!explicit) return null
      const ref = explicit[0]
      return typeof ref === 'number' ? ref + 1 : (await doc.getPageIndex(ref)) + 1
    }, dest)
    await page.evaluate((k) => window.__h.panes.goToPage('right', k), n)
    await page.waitForTimeout(300)
    const now = (await page.evaluate((k) => window.__h.linksOf(k), n)).find((x) => x.href === a.href)
    if (!now) continue
    await page.mouse.click(now.rect.x + now.rect.width / 2, now.rect.y + now.rect.height / 2)
    const got = await wait((p) => window.__h.panes.pageOf('right') === p, want, 5000)
      .then(() => true)
      .catch(() => false)
    if (got) followed++
    else
      failures.push(
        `p${n}: ${a.href.slice(0, 60)} went to ${await page.evaluate(() => window.__h.panes.pageOf('right'))}, not ${want}`,
      )
  }
  const line = { page: n, members: ords.length, hovers, lit, links: given.length, anchors: anchors.length, inner: inner.length, followed }
  report.push(line)
  console.log(JSON.stringify(line))
}
await context.close()
await browser.close()
await server.close()
console.log(`refused requests: ${refused.length}; page errors: ${errors.length}${errors.length ? ` (${errors.slice(0, 3).join(' | ')})` : ''}`)
console.log(failures.length ? `FAIL ${failures.length}: ${failures.slice(0, 12).join('; ')}` : 'ok')
process.exit(failures.length || errors.length ? 1 : 0)
