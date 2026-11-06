// The reader's offline browser checks (stage 2's exit): the harness page built with the reader's own plugin, served on the
// loopback with the fixtures' objects, in Chromium behind a route table that answers our server's origin and the stand-in of
// arXiv's and refuses any other request (a violation fails the run). Each check prints one line; the run exits 1 if any fails.
//
//   node packages/reader/e2e/run.mjs [--only=<part of a name>|…] [--browser=chromium|webkit|firefox]
//   AXT_PAPER=<dir with arxiv.pdf> runs the stack's checks on that paper too (a lab paper, read in place, never copied)
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { startServer } from './server.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '../../..')
const argOf = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const only = argOf('only')?.split('|') ?? null
const browserName = argOf('browser') ?? 'chromium'
const RESOLVER_WALL = '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'

await build({ configFile: join(HERE, 'vite.config.ts'), logLevel: 'warn' })

const sample = join(REPO, 'tests/fixtures/pdf/sample-1/sample-1.pdf')
const papers = { '2600.00001v1': sample }
if (process.env.AXT_PAPER) papers.lab = join(process.env.AXT_PAPER, 'arxiv.pdf')
const objects = new Map(Object.entries(papers).map(([id, f]) => [`/api/v2/o/arxiv/${id.replace('.', '_')}.pdf`, f]))
// the fixtures (packages/reader/e2e/fixtures: ours; AXT_LAB_FIXTURES=<id>,… : lane L1's bundles of corpus papers and the
// baseline's dumps, read in place from lab-data): each one's A, its bundle's objects under our server's paths, its dumps and rows
const FIX = join(HERE, 'fixtures')
const LAB = '/Users/cheongzhiyan/Developer/readarxiv-lab-data/refactor-2026-11'
const fixtures = {}
for (const name of readdirSync(FIX)) {
  const d = join(FIX, name)
  if (!existsSync(join(d, 'arxiv.pdf'))) continue
  fixtures[name] = { pdf: join(d, 'arxiv.pdf'), bundle: join(d, 'bundle'), files: d, dumps: {}, rows: {} }
}
for (const id of (process.env.AXT_LAB_FIXTURES ?? '').split(',').filter(Boolean)) {
  const papersJson = JSON.parse(readFileSync(join(LAB, 'baseline/corpora/papers.json'), 'utf8'))
  const p = papersJson.papers.find((x) => x.id === id)
  if (!p) throw new Error(`no corpus paper ${id}`)
  fixtures[id] = {
    pdf: join(p.dir, 'arxiv.pdf'),
    bundle: join(LAB, 'lanes/L1-out4/bundles', id),
    files: join(LAB, 'baseline/reader'),
    dumps: { zh: `${id}-zh.reader.json` },
    rows: { zh: null },
    face: 'cjk',
  }
}
const indexOf = {}
for (const [name, f] of Object.entries(fixtures)) {
  const head = JSON.parse(readFileSync(join(f.bundle, 'head.json'), 'utf8'))
  const seg = `${head.paper.id.replace('.', '_')}v${head.paper.version}`
  objects.set(`/api/v2/o/arxiv/${seg}.pdf`, f.pdf)
  for (const file of readdirSync(f.bundle))
    if (/^[0-9a-f]{64}\./.test(file)) objects.set(`/api/v2/o/p/${seg}/fx/${file.split('.')[0]}`, join(f.bundle, file))
  const headDigest = readdirSync(f.bundle)
    .find((x) => x.endsWith('.head'))
    .split('.')[0]
  indexOf[name] = {
    seg,
    original: `/api/v2/o/arxiv/${seg}.pdf`,
    objects: `/api/v2/o/p/${seg}/fx/`,
    head: headDigest,
    dumps: f.dumps,
    rows: f.rows,
    face: f.face ?? null,
  }
}
const fixtureRoute = {
  prefix: '/fixtures/',
  handle(_req, res, url) {
    const [, , name, file] = url.pathname.split('/')
    const f = fixtures[name]
    if (!f) return false
    if (file === 'index.json') {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify(indexOf[name]))
    }
    // (a corpus paper's rows: those of its dump's units, a row each, whatever their text: the dump is what is painted)
    if (/\.rows\.json$/.test(file) && f.rows[file.split('.')[0]] === null) {
      const dump = JSON.parse(readFileSync(join(f.files, f.dumps[file.split('.')[0]]), 'utf8'))
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(
        JSON.stringify({
          format: 1,
          rows: dump.units.map((u) => ({
            id: u.id,
            ok: true,
            content: [{ t: 'text', s: u.lines.map((l) => l.text).join(' ') }],
            by: 'baseline',
          })),
        }),
      )
    }
    const at = join(f.files, file)
    if (!existsSync(at)) return false
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(readFileSync(at))
  },
}
const server = await startServer({ out: join(HERE, '.out'), objects, routes: [fixtureRoute] })

const pw = await import('playwright')
const browser = await pw[browserName].launch({ args: browserName === 'chromium' ? [RESOLVER_WALL] : [] })
const violations = []
async function newPage(o = {}) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: o.dpr ?? 1 })
  await context.route('**/*', async (route) => {
    const req = route.request(),
      url = new URL(req.url())
    if (url.origin === server.origin) return route.continue()
    // the stand-in of arXiv's own server: its PDF by ranges, no entity-tag promised
    if (url.origin === 'https://arxiv.org' && url.pathname.startsWith('/pdf/')) {
      const file = papers[url.pathname.slice(5)]
      if (file) {
        const bytes = readFileSync(file),
          m = /^bytes=(\d+)-(\d+)$/.exec(req.headers().range ?? '')
        const headers = {
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'content-range, etag, content-length',
          'content-type': 'application/pdf',
        }
        if (!m) return route.fulfill({ status: 200, headers, body: bytes })
        const a = Number(m[1]),
          b = Math.min(Number(m[2]), bytes.length - 1)
        return route.fulfill({
          status: 206,
          headers: { ...headers, 'content-range': `bytes ${a}-${b}/${bytes.length}` },
          body: bytes.subarray(a, b + 1),
        })
      }
    }
    violations.push(`${req.method()} ${url.href}`)
    return route.abort('blockedbyclient')
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto(`${server.origin}/`)
  return { page, context, errors }
}

const results = []
async function check(name, fn) {
  if (only && !only.some((o) => name.includes(o))) return
  const t = performance.now()
  try {
    const detail = await fn()
    results.push({ name, ok: true, ms: Math.round(performance.now() - t), detail })
    console.log(`ok   ${name}${detail ? ` ${JSON.stringify(detail)}` : ''}`)
  } catch (e) {
    results.push({ name, ok: false, error: String(e?.message ?? e) })
    console.log(`FAIL ${name}: ${e?.message ?? e}`)
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m)
}
const waitFor = async (page, fn, arg, ms = 15_000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 50 })
const sameBoxes = (boxes) =>
  boxes.every(
    (b) =>
      b.left &&
      b.right &&
      Math.abs(b.left[0] - b.right[0]) < 0.02 &&
      Math.abs(b.left[1] - b.right[1]) < 0.02 &&
      b.left[2] === b.right[2],
  )

// ---------------------------------------------------------------- deliverable 3: the page stack under the right pane
for (const [id, label] of [['2600.00001v1', 'sample-1'], ...(process.env.AXT_PAPER ? [['lab', 'lab']] : [])]) {
  const url = `/api/v2/o/arxiv/${id.replace('.', '_')}.pdf`
  await check(`stack: the original at once (${label})`, async () => {
    const { page, context, errors } = await newPage()
    const r = await page.evaluate((u) => window.__h.open(u), url)
    await waitFor(
      page,
      () =>
        window.__h.marks.some((m) => m.what === 'drawn' && m.side === 'right' && m.page === 1) &&
        window.__h.marks.some((m) => m.what === 'drawn' && m.side === 'left' && m.page === 1),
    )
    const marks = await page.evaluate(() => window.__h.marks)
    const first = (side) => marks.find((m) => m.what === 'drawn' && m.side === side && m.page === 1)?.at
    await context.close()
    assert(!errors.length, errors.join('; '))
    return { pages: r.pages, leftPage1Ms: Math.round(first('left')), rightPage1Ms: Math.round(first('right')) }
  })
  await check(`stack: every slot is the left's page box, at every scale (${label})`, async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), url)
    await waitFor(page, () => window.__h.probe()['right.sized'] === window.__h.probe().pages)
    // (the left's eager sizes: its pagesloaded told again; both are set within a frame of each other)
    await page.waitForTimeout(300)
    const at1 = await page.evaluate(() => window.__h.boxes())
    assert(sameBoxes(at1), `at the first scale: ${JSON.stringify(at1.find((b) => !sameBoxes([b])))}`)
    const scales = []
    for (const step of [
      (z) => z.zoomBy(1.25),
      (z) => z.zoomBy(1.25),
      (z) => z.zoomTo('page-fit'),
      (z) => z.zoomTo(2.37),
      (z) => z.zoomTo('page-width'),
    ]) {
      await page.evaluate(`(${step.toString()})(window.__h.panes)`)
      await page.waitForTimeout(700)
      const b = await page.evaluate(() => window.__h.boxes())
      const s = await page.evaluate(() => window.__h.panes.scale)
      scales.push(s)
      assert(sameBoxes(b), `at scale ${s}: ${JSON.stringify(b.find((x) => !sameBoxes([x])))}`)
    }
    await context.close()
    assert(!errors.length, errors.join('; '))
    return { scales }
  })
  await check(`stack: a pinch over the right, about its point, committed once (${label})`, async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), url)
    await waitFor(page, () => window.__h.marks.some((m) => m.what === 'drawn' && m.side === 'right' && m.page === 1))
    const before = await page.evaluate(() => window.__h.panes.scale)
    const steps = await page.evaluate(async () => {
      const p = window.__h.panes,
        r = document.querySelector('.axt-pane.right').getBoundingClientRect()
      const at = [r.left + r.width / 2, r.top + r.height / 3]
      let previews = 0
      for (let i = 0; i < 8; i++) {
        p.pinch('right', 1.05, at)
        if (p.probe().pinching) previews++
        await new Promise((f) => requestAnimationFrame(f))
      }
      return { previews, scaleDuring: p.scale }
    })
    await page.waitForTimeout(500)
    const after = await page.evaluate(() => ({
      scale: window.__h.panes.scale,
      pinching: window.__h.panes.probe().pinching,
      boxes: window.__h.boxes(),
    }))
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(steps.scaleDuring === before, 'a step wrote the scale')
    assert(
      after.pinching === null && Math.abs(after.scale - Math.round(before * 1.05 ** 8 * 100) / 100) < 0.011,
      `committed at ${after.scale} from ${before}`,
    )
    assert(sameBoxes(after.boxes), `boxes differ after the pinch: ${JSON.stringify(after.boxes)}`)
    return { from: before, to: after.scale, previews: steps.previews }
  })
  await check(`stack: far pages let go within the budget, the focus kept (${label})`, async () => {
    const { page, context, errors } = await newPage()
    const r = await page.evaluate((u) => window.__h.open(u), url)
    if (r.pages < 8) {
      await context.close()
      return { skipped: `${r.pages} pages` }
    }
    await waitFor(page, () => window.__h.marks.some((m) => m.what === 'drawn' && m.side === 'right' && m.page === 1))
    await page.evaluate(() => window.__h.panes.right.focus(1))
    const walk = []
    for (const n of [Math.ceil(r.pages / 2), r.pages, 1, r.pages]) {
      await page.evaluate((n) => window.__h.panes.goToPage('right', n), n)
      await waitFor(
        page,
        (n) => window.__h.marks.some((m) => m.what === 'drawn' && m.side === 'right' && m.page === n),
        n,
      )
      await page.waitForTimeout(200)
      walk.push(
        await page.evaluate(() => {
          const p = window.__h.panes.probe()
          return { views: p['right.views'], near: p['right.near'], pixels: p['right.pixels'] }
        }),
      )
    }
    const focus = await page.evaluate(() => ({
      body: document.activeElement === document.body,
      page: document.activeElement?.dataset?.pageNumber ?? null,
    }))
    const budget = await page.evaluate(() => {
      const gb = navigator.deviceMemory
      return gb ? Math.min(128, Math.max(32, gb * 16)) * 2 ** 20 : 32 * 2 ** 20
    })
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(!focus.body, 'the focus fell to <body>')
    // (every view a near page's, or a far one the budget keeps)
    for (const w of walk)
      assert(w.pixels * 4 <= budget + w.near * 8e6, `views ${w.views}, near ${w.near}, pixels ${w.pixels}`)
    return { pages: r.pages, walk, focus: focus.page }
  })
}

// ---------------------------------------------------------------- deliverable 4: composing the right pane
const laidShown = (page, n) =>
  waitFor(
    page,
    (n) => window.__h.marks.some((m) => m.what === 'shown' && m.page === n && String(m.key).startsWith('laid:')),
    n,
    20_000,
  )
for (const name of Object.keys(fixtures)) {
  const lab = !!fixtures[name].face
  const target = lab ? 'zh' : 'de'
  await check(`compose: the original at once, then each laid page equal to its Page (${name})`, async () => {
    const { page, context, errors } = await newPage({ dpr: 2 })
    await page.evaluate((u) => window.__h.open(u), indexOf[name].original)
    await waitFor(page, () => window.__h.marks.some((m) => m.what === 'drawn' && m.side === 'right' && m.page === 1))
    const firstOriginal = await page.evaluate(() =>
      window.__h.marks.find((m) => m.what === 'drawn' && m.side === 'right' && m.page === 1),
    )
    const layer = await page.evaluate(([n, t]) => window.__h.layer(n, { target: t }), [name, target])
    const laidPages = await page.evaluate(() =>
      [...window.__h.pages.entries()].filter(([, p]) => p.members.some((m) => m.state === 'laid')).map(([n]) => n),
    )
    const per = []
    for (const n of laidPages.slice(0, lab ? 4 : 8)) {
      await page.evaluate((n) => window.__h.panes.goToPage('right', n), n)
      await laidShown(page, n)
      await page.waitForTimeout(150)
      const shot = await page
        .locator(`.axt-pane.right .axt-slot[data-page-number="${n}"] > .axt-slot-view`)
        .screenshot({
          animations: 'disabled',
          ...(process.env.AXT_SHOTS ? { path: join(HERE, '.shots', `${name}-p${n}.png`) } : {}),
        })
      const ink = await page.evaluate(([n, png]) => window.__h.overlayInk(n, png), [n, shot.toString('base64')])
      const text = await page.evaluate((n) => window.__h.textOf(n), n)
      if (process.env.AXT_DEBUG)
        console.log(JSON.stringify({ n, text: text.text.slice(0, 600), laid: text.laid.map((t) => t.slice(0, 40)) }))
      per.push({
        n,
        ...ink,
        textOk: text.laid.every((t) => text.text.replace(/\s+/g, '').includes(t.replace(/\s+/g, ''))),
        inOrder: (() => {
          let at = 0
          for (const t of text.laid) {
            const i = text.text.replace(/\s+/g, '').indexOf(t.replace(/\s+/g, ''), at)
            if (i < 0) return false
            at = i
          }
          return true
        })(),
        copied: text.copied.length,
      })
    }
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(layer.proved, 'the original is not the one the layer was made over')
    for (const x of per) {
      assert(!x.error, x.error)
      // I3: the translations' ink in their regions, on no other ink (lab papers' dumps are painted in another face: reported)
      if (!lab)
        assert(
          x.outside === 0 && x.onInk <= Math.max(4, 0.002 * x.ink),
          `page ${x.n}: ${x.outside} px of ${x.ink} outside its regions, ${x.onInk} on other ink, at ${JSON.stringify(x.where)}`,
        )
      // I4: every element of a laid member an item (none kept in these fixtures but displays)
      if (!lab) assert(x.crops === x.elements, `page ${x.n}: ${x.crops} crops for ${x.elements} elements`)
      // I8: the text layer reads each laid member's translation, in order; a selection of it copies it
      assert(
        x.textOk && x.inOrder && x.copied > 0,
        `page ${x.n}: the text layer reads ${x.textOk ? 'out of order' : 'not every translation'}`,
      )
    }
    return {
      originalPage1Ms: Math.round(firstOriginal.at),
      layer,
      pages: per.map((x) => ({ n: x.n, ink: x.ink, outside: x.outside, onInk: x.onInk, crops: x.crops })),
    }
  })
}

await browser.close()
await server.close()
if (violations.length)
  console.log(`FAIL route table: ${violations.length} requests off the fixtures: ${violations.slice(0, 5).join(', ')}`)
const failed = results.filter((r) => !r.ok).length + (violations.length ? 1 : 0)
console.log(
  `${results.length - results.filter((r) => !r.ok).length} of ${results.length} checks passed${violations.length ? ', route table violated' : ''}`,
)
process.exit(failed ? 1 : 0)
