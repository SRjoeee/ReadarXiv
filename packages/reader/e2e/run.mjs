// The reader's offline browser checks (stage 2's exit): the harness page built with the reader's own plugin, served on the
// loopback with the fixtures' objects, in Chromium behind a route table that answers our server's origin and the stand-in of
// arXiv's and refuses any other request (a violation fails the run). Each check prints one line; the run exits 1 if any fails.
//
//   node packages/reader/e2e/run.mjs [--only=<part of a name>|…] [--browser=chromium|webkit|firefox]
//   AXT_PAPER=<dir with arxiv.pdf> runs the stack's checks on that paper too (a lab paper, read in place, never copied)
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
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
/** the stand-in of our server's v2 routes: each paper's document; a scenario a check sets (`modes[seg]`): 'not-opened' (a 404
 *  until the open, then preparing for `prepareMs`, then the document), else the document at once; and every ask, logged */
const docs = {},
  rowsObjects = new Map(),
  modes = {},
  v2log = []
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
    paper: `${head.paper.id}v${head.paper.version}`,
    seg,
    original: `/api/v2/o/arxiv/${seg}.pdf`,
    objects: `/api/v2/o/p/${seg}/fx/`,
    head: headDigest,
    dumps: f.dumps,
    rows: f.rows,
    face: f.face ?? null,
  }
  // our server's document of the paper (L5's PaperDoc): its layer the bundle, the target's rows the fixture's rows as one object
  const files = readdirSync(f.bundle)
  const refOf = (digest) => {
    const file = files.find((x) => x.startsWith(`${digest}.`))
    return { path: `p/${seg}/fx/${digest}`, sha256: digest, bytes: statSync(join(f.bundle, file)).size }
  }
  const targets = {}
  const sources = Object.keys(f.dumps).length ? Object.keys(f.dumps).map((t) => [t, null]) : [['de', 'de.rows.json']]
  for (const [t, rf] of sources) {
    const bytes = rf
      ? readFileSync(join(f.files, rf))
      : Buffer.from(JSON.stringify(rowsOfDump(JSON.parse(readFileSync(join(f.files, f.dumps[t]), 'utf8')))))
    const sha = createHash('sha256').update(bytes).digest('hex')
    rowsObjects.set(`/api/v2/o/r/${seg}/${t}/fx/${sha}`, bytes)
    const n = JSON.parse(bytes.toString('utf8')).rows.length
    targets[t] = {
      attempt: 1,
      state: 'done',
      why: null,
      retryAt: null,
      at: 0,
      translator: 'fx',
      units: null,
      rows: [{ path: `r/${seg}/${t}/fx/${sha}`, sha256: sha, bytes: bytes.length }],
      done: n,
      total: n,
      view: 1,
    }
  }
  docs[seg] = {
    v: 1,
    pv: seg,
    epoch: 'e1',
    rev: 1,
    paper: head.paper.id,
    version: head.paper.version,
    prepare: {
      attempt: 1,
      state: 'done',
      why: null,
      retryAt: null,
      at: 0,
      build: 'fx',
      stage: null,
      units: head.units.map(refOf),
      html: null,
    },
    layer: { catalog: refOf(headDigest), units: head.units.map(refOf), format: 1, build: 'fx', stale: false },
    targets,
  }
}
/** a corpus dump's rows: a row a unit, its text the dump's (what is painted is the dump) */
function rowsOfDump(dump) {
  return {
    format: 1,
    rows: dump.units.map((u) => ({
      id: u.id,
      ok: true,
      content: [{ t: 'text', s: u.lines.map((l) => l.text).join(' ') }],
      by: 'baseline',
    })),
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
const v2Route = {
  prefix: '/api/v2/',
  handle(req, res, url) {
    const json = (status, body, headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers })
      res.end(JSON.stringify(body))
    }
    if (url.pathname.startsWith('/api/v2/papers/')) {
      const seg = url.pathname.slice('/api/v2/papers/'.length)
      v2log.push({ what: 'follow', seg, query: url.search, at: performance.now() })
      const d = docs[seg] ?? Object.values(docs).find((x) => x.pv.replace(/v\d+$/, '') === seg)
      if (!d) return json(404, { error: 'not-found' })
      const m = modes[d.pv]
      if (m?.kind === 'not-opened' && !m.opened) return json(404, { error: 'not-opened' })
      if (m?.kind === 'not-opened' && performance.now() - m.opened < (m.prepareMs ?? 800))
        return json(200, {
          ...d,
          rev: 1,
          layer: null,
          prepare: { ...d.prepare, state: 'running', stage: 'compiling' },
          targets: {},
        })
      return json(200, { ...d, rev: 2 })
    }
    if (url.pathname === '/api/v2/open' && req.method === 'POST') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        const ask = JSON.parse(body || '{}')
        v2log.push({ what: 'open', ask, at: performance.now() })
        const d = Object.values(docs).find((x) => x.paper === ask.paper)
        if (!d) return json(404, { error: 'not-found' })
        const m = modes[d.pv]
        if (m) m.opened ??= performance.now()
        json(200, {
          doc: {
            ...d,
            rev: 1,
            layer: null,
            prepare: { ...d.prepare, state: 'running', stage: 'compiling' },
            targets: {},
          },
          follow: null,
        })
      })
      return true
    }
    const rows = rowsObjects.get(url.pathname)
    if (rows) {
      res.writeHead(200, {
        'content-type': 'application/json',
        etag: `"${url.pathname.split('/').pop().slice(0, 16)}"`,
      })
      res.end(rows)
      return true
    }
    return false
  },
}
const server = await startServer({ out: join(HERE, '.out'), objects, routes: [fixtureRoute, v2Route] })

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
      const file =
        papers[url.pathname.slice(5)] ??
        Object.entries(indexOf)
          .map(([n, x]) => (x.paper === url.pathname.slice(5) ? fixtures[n].pdf : null))
          .find(Boolean)
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

/** the resident memory (MiB) of the browser's renderer processes and of its GPU process, read by ps from the pids the browser's
 *  CDP names (the page's renderer runs its dedicated workers, PDF.js's among them; a GPU-backed canvas lives in the GPU process) */
async function processMiB() {
  if (browserName !== 'chromium') return null
  const cdp = await browser.newBrowserCDPSession()
  const { processInfo } = await cdp.send('SystemInfo.getProcessInfo')
  await cdp.detach()
  const { execFileSync } = await import('node:child_process')
  const rss = (type) => {
    const pids = processInfo.filter((p) => p.type === type).map((p) => p.id)
    if (!pids.length) return 0
    const out = execFileSync('ps', ['-o', 'rss=', '-p', pids.join(',')], { encoding: 'utf8' })
    return +(
      out
        .split('\n')
        .filter(Boolean)
        .reduce((a, x) => a + Number(x.trim()), 0) / 1024
    ).toFixed(1)
  }
  return { renderer: rss('renderer'), gpu: rss('GPU') }
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

await check(
  "compose: a laid page's links, out of the paper through the host, inside it on the right (s1-columns)",
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), indexOf['s1-columns'].original)
    await page.evaluate(() => window.__h.layer('s1-columns'))
    await laidShown(page, 1)
    const links = await page.evaluate(() => window.__h.linksOf(1))
    const ext = links.find((l) => l.href?.startsWith('https:')),
      inner = links.find((l) => l.href?.startsWith('#'))
    assert(ext && inner, `links ${JSON.stringify(links)}`)
    await page.mouse.click(ext.rect.x + ext.rect.width / 2, ext.rect.y + ext.rect.height / 2)
    await page.mouse.click(inner.rect.x + inner.rect.width / 2, inner.rect.y + inner.rect.height / 2)
    const hit = await page.evaluate(
      ([x, y]) => {
        const e = document.elementFromPoint(x, y)
        return `${e?.tagName}.${e?.className} in ${e?.closest('a')?.getAttribute('href')}`
      },
      [inner.rect.x + inner.rect.width / 2, inner.rect.y + inner.rect.height / 2],
    )
    // (a document this short ends before page 2 can stand at the top: the jump brings it into view)
    await waitFor(
      page,
      () => window.__h.panes.right.inView(2) && document.querySelector('.axt-pane.right').scrollTop > 0,
    ).catch(async (e) => {
      throw new Error(
        `${e.message}: hit ${hit}, right page ${await page.evaluate(() => window.__h.panes.pageOf('right'))}, scroll ${await page.evaluate(() => document.querySelector('.axt-pane.right').scrollTop)}, inner ${JSON.stringify(inner)}`,
      )
    })
    const external = await page.evaluate(() => window.__h.external)
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(
      external.length === 1 && external[0] === 'https://example.invalid/reader',
      `opened ${JSON.stringify(external)}`,
    )
    return { links: links.length, external }
  },
)
await check(
  'compose: a language switch reuses the composed document, the parts and the place (s1-columns)',
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), indexOf['s1-columns'].original)
    await page.evaluate(() => window.__h.layer('s1-columns'))
    await laidShown(page, 1)
    await page.evaluate(() => window.__h.panes.goToPage('right', 2))
    await laidShown(page, 2)
    await page.waitForTimeout(300)
    const asked = server.log.length
    const r = await page.evaluate(() => window.__h.retarget('de', 's1-columns'))
    await waitFor(
      page,
      () => window.__h.marks.filter((m) => m.what === 'shown' && String(m.key).startsWith('laid:')).length >= 3,
    )
    await page.waitForTimeout(300)
    const after = await page.evaluate(() => ({ place: window.__h.panes.reading(), probe: window.__h.composer.probe() }))
    const newAsks = server.log
      .slice(asked)
      .map((l) => l.path)
      .filter((p) => p.startsWith('/api/v2/'))
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(r.sameComposed, 'the composed document was opened again')
    assert(newAsks.length === 0, `asked again: ${newAsks.join(', ')}`)
    assert(
      r.before.place?.page === after.place?.page && Math.abs(r.before.place.at - after.place.at) < 0.02,
      `the place moved: ${JSON.stringify([r.before.place, after.place])}`,
    )
    return { place: after.place, laidPages: after.probe.laidPages, objectsAskedAgain: newAsks.length }
  },
)
await check(
  "compose: a zoom and a pinch over a laid page keep it laid, its overlay the page's frame (s1-columns)",
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), indexOf['s1-columns'].original)
    await page.evaluate(() => window.__h.layer('s1-columns'))
    await laidShown(page, 1)
    const frame = () =>
      page.evaluate(() => {
        const s = document.querySelector('.axt-pane.right .axt-slot[data-page-number="1"] > .axt-slot-view')
        const v = s.querySelector('.axt-over > svg').getBoundingClientRect(),
          c = s.getBoundingClientRect()
        return {
          key: window.__h.panes.right.showing(1),
          dw: Math.abs(v.width - c.width),
          dh: Math.abs(v.height - c.height),
        }
      })
    const out = []
    for (const z of ['zoomBy(1.25)', 'zoomTo(2)', "zoomTo('page-width')"]) {
      await page.evaluate(`window.__h.panes.${z}`)
      await page.waitForTimeout(800)
      out.push(await frame())
    }
    await page.evaluate(async () => {
      const p = window.__h.panes,
        r = document.querySelector('.axt-pane.right').getBoundingClientRect()
      for (let i = 0; i < 6; i++) {
        p.pinch('right', 1.06, [r.left + 300, r.top + 200])
        await new Promise((f) => requestAnimationFrame(f))
      }
    })
    await page.waitForTimeout(800)
    out.push(await frame())
    await context.close()
    assert(!errors.length, errors.join('; '))
    for (const f of out)
      assert(String(f.key).startsWith('laid:') && f.dw < 1.5 && f.dh < 1.5, `after a zoom: ${JSON.stringify(f)}`)
    return { steps: out.length }
  },
)

await check(
  'compose: the highlight from lit on both panes, the same unit, what is painted is what is hit (s1-columns)',
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), indexOf['s1-columns'].original)
    await page.evaluate(() => window.__h.layer('s1-columns'))
    await laidShown(page, 1)
    const ords = await page.evaluate(() =>
      window.__h.composer
        .laid(1)
        .members.filter((m) => m.state === 'laid')
        .map((m) => m.ord),
    )
    const out = []
    for (const ord of ords.slice(0, 4)) {
      for (const side of ['right', 'left']) {
        const pt = await page.evaluate(([o, s]) => window.__h.pointOf(1, o, s), [ord, side])
        if (!pt) continue
        await page.mouse.move(pt.x, pt.y)
        await page.waitForTimeout(80)
        const r = await page.evaluate(() => ({ lit: window.__h.highlight.lit, bands: window.__h.highlight.bands() }))
        out.push({
          ord,
          side,
          lit: r.lit?.id ?? null,
          bands: r.bands,
          want: { left: pt.left + pt.own, right: pt.right + pt.own },
        })
      }
    }
    await page.mouse.move(5, 5)
    await page.waitForTimeout(300)
    const after = await page.evaluate(() => ({ lit: window.__h.highlight.lit, bands: window.__h.highlight.bands() }))
    await context.close()
    assert(!errors.length, errors.join('; '))
    for (const x of out)
      assert(
        x.lit === x.ord && x.bands.left === x.want.left && x.bands.right === x.want.right,
        `hovering ${x.side} over ${x.ord}: ${JSON.stringify(x)}`,
      )
    assert(
      after.lit === null && after.bands.left === 0 && after.bands.right === 0,
      `a miss kept ${JSON.stringify(after)}`,
    )
    return { hovers: out.length }
  },
)

// ---------------------------------------------------------------- deliverables 5 and 6: openReader with a fake host
const probe = (page) => page.evaluate((i) => window.__h.readers[i ?? 0].reader.probe(), 0)
const readerLaid = (page, i = 0) =>
  waitFor(
    page,
    (i) => {
      const p = window.__h.readers[i].reader.probe()
      return p.laidPages > 0 && p['at.rightDrawn'] !== undefined
    },
    i,
    25_000,
  ).catch(async (e) => {
    throw new Error(
      `${e.message.split('\n')[0]}: ${JSON.stringify(await page.evaluate((i) => ({ probe: window.__h.readers[i].reader.probe(), state: window.__h.readers[i].reader.state(), asked: window.__h.readers[i].asked.map((a) => a.url).slice(0, 12) }), i))}`,
    )
  })
await check(
  "reader: the original at once, the layer's code after the left's page 1, the pages laid (website host)",
  async () => {
    const { page, context, errors } = await newPage()
    const r = await page.evaluate(() => window.__h.reader('s1-columns', { host: 'web' }))
    await readerLaid(page)
    const p = await probe(page)
    const st = await page.evaluate(() => window.__h.readers[0].reader.state())
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(
      r.askedBeforeReturn.some((u) => u.startsWith(indexOf['s1-columns'].original)),
      `asked before openReader returned: ${JSON.stringify(r.askedBeforeReturn)}`,
    )
    assert(
      p['at.code'] >= p['at.leftDrawn'],
      `the layer's code (${p['at.code']} ms) before the left's page 1 (${p['at.leftDrawn']} ms)`,
    )
    assert(
      st.layer.s === 'ready' && st.original.s === 'open' && st.rows.s === 'complete',
      `state ${JSON.stringify([st.original, st.layer, st.rows])}`,
    )
    return { moments: Object.fromEntries(Object.entries(p).filter(([k]) => k.startsWith('at.'))), rows: st.rows }
  },
)
await check('reader: a paper being prepared, opened and followed to its layer (website host)', async () => {
  const seg = indexOf['s2-splits'].seg
  modes[seg] = { kind: 'not-opened', prepareMs: 600 }
  const { page, context, errors } = await newPage()
  await page.evaluate(() => window.__h.reader('s2-splits', { host: 'web' }))
  const seen = new Set()
  const t0 = Date.now()
  while (Date.now() - t0 < 20_000) {
    const s = await page.evaluate(() => window.__h.readers[0].reader.state().layer.s)
    seen.add(s)
    if (s === 'ready') break
    await page.waitForTimeout(50)
  }
  await readerLaid(page)
  await context.close()
  delete modes[seg]
  // (the follow's 404 of a paper not opened is the browser's console line, and expected)
  assert(!errors.filter((e) => !/status of 404/.test(e)).length, errors.join('; '))
  const opens = v2log.filter((x) => x.what === 'open' && x.ask.paper === '2600.00003')
  assert(opens.length === 1 && opens[0].ask.target === 'de', `opens ${JSON.stringify(opens)}`)
  assert(seen.has('preparing') && seen.has('ready'), `layer states ${[...seen]}`)
  return { layer: [...seen] }
})
await check(
  "reader: the extension's host: arXiv's own PDF, rows made here, no target named to our server",
  async () => {
    const from = v2log.length
    const { page, context, errors } = await newPage()
    await page.evaluate(() => window.__h.reader('s1-columns', { host: 'ext' }))
    await readerLaid(page)
    const st = await page.evaluate(() => window.__h.readers[0].reader.state())
    const asked = await page.evaluate(() => window.__h.readers[0].asked.map((a) => a.url))
    await context.close()
    assert(!errors.length, errors.join('; '))
    const mine = v2log.slice(from)
    assert(
      asked.some((u) => u.startsWith('https://arxiv.org/pdf/2600.00002v1')),
      `the original from ${asked[0]}`,
    )
    assert(
      mine.every((x) => (x.what === 'follow' ? !/[?&]t=/.test(x.query) : x.ask.target === null)),
      `a target named: ${JSON.stringify(mine)}`,
    )
    assert(st.rows.from === 'here' && st.rows.s === 'complete', JSON.stringify(st.rows))
    return { follows: mine.length, rows: st.rows }
  },
)
await check('reader: close lets everything go; a second reader on the same page goes on', async () => {
  const { page, context, errors } = await newPage()
  await page.evaluate(async () => {
    await window.__h.reader('s1-columns', { host: 'web', width: '50%' })
    await window.__h.reader('s2-splits', { host: 'web', width: '50%' })
  })
  await readerLaid(page, 0)
  await readerLaid(page, 1)
  await page.evaluate(() => window.__h.readers[0].reader.close())
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => ({
    root: window.__h.readers[0].root.childElementCount,
    attrs: window.__h.readers[0].root.getAttributeNames(),
    a: window.__h.readers[0].reader.probe(),
    b: window.__h.readers[1].reader.probe(),
  }))
  await page.evaluate(() => window.__h.readers[1].reader.do({ do: 'zoomBy', factor: 1.25 }))
  await page.waitForTimeout(700)
  const b2 = await page.evaluate(() => ({
    probe: window.__h.readers[1].reader.probe(),
    state: window.__h.readers[1].reader.state(),
  }))
  await context.close()
  assert(!errors.length, errors.join('; '))
  assert(
    after.root === 0 && !after.attrs.some((a) => a.startsWith('data-axt')),
    `root after close: ${after.root} children, ${after.attrs}`,
  )
  assert(
    after.a.workers === 0 && after.a.clockDue === 0 && after.a.live === 0,
    `left after close ${JSON.stringify(after.a)}`,
  )
  assert(
    after.b.workers === 2 && after.b.laidPages > 0 && b2.probe.laidPages > 0 && b2.state.view.scale > 0,
    `the other reader ${JSON.stringify(b2.probe)}`,
  )
  return {
    a: { workers: after.a.workers, live: after.a.live },
    b: { workers: after.b.workers, laidPages: b2.probe.laidPages },
  }
})

// ---------------------------------------------------------------- the commit and paint times against the baseline (engine-view-host §9)
const timings = {}
for (const name of Object.keys(fixtures)) {
  for (const rate of [1, 4]) {
    await check(`timing: a laid page's commit and paint at ${rate}x CPU (${name})`, async () => {
      const { page, context, errors } = await newPage()
      const cdp = browserName === 'chromium' ? await context.newCDPSession(page) : null
      const lab = !!fixtures[name].face
      await page.evaluate((u) => window.__h.open(u), indexOf[name].original)
      await waitFor(page, () => window.__h.marks.some((m) => m.what === 'drawn' && m.side === 'right' && m.page === 1))
      if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate })
      await page.evaluate(([n, t]) => window.__h.layer(n, { target: t }), [name, lab ? 'zh' : 'de'])
      const laidPages = await page.evaluate(() =>
        [...window.__h.pages.entries()].filter(([, p]) => p.members.some((m) => m.state === 'laid')).map(([n]) => n),
      )
      for (const n of laidPages.slice(0, 4)) {
        await page.evaluate((n) => window.__h.panes.goToPage('right', n), n)
        await laidShown(page, n)
      }
      const r = await page.evaluate(() => ({
        shown: window.__h.marks.filter((m) => m.what === 'shown' && String(m.key).startsWith('laid:')),
        overlay: window.__h.composer.timings(),
      }))
      if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
      await context.close()
      assert(!errors.length, errors.join('; '))
      const rows = r.shown.map((m) => {
        const o = r.overlay.find((x) => x.n === m.page) ?? {}
        return {
          n: m.page,
          commitMs: +(m.swapMs + m.layoutMs).toFixed(1),
          swapMs: +m.swapMs.toFixed(1),
          layoutMs: +m.layoutMs.toFixed(1),
          drawMs: Math.round(m.drawMs),
          overlayMs: Math.round(o.overlayMs ?? 0),
          svgMs: +(o.svgMs ?? 0).toFixed(1),
          cropsMs: Math.round(o.cropsMs ?? 0),
          textMs: Math.round(o.textMs ?? 0),
        }
      })
      timings[`${name}@${rate}x`] = rows
      return rows.slice(0, 4)
    })
  }
}
if (process.env.AXT_TIMINGS_OUT)
  (await import('node:fs')).writeFileSync(process.env.AXT_TIMINGS_OUT, `${JSON.stringify(timings, null, 1)}\n`)

// ---------------------------------------------------------------- the memory and paint of the two ways out of the residue
const ways = {}
for (const name of Object.keys(fixtures).filter((n) => fixtures[n].face)) {
  await check(
    `ways: memory and paint, (a) pages not laid from the original, (b) both panes the composed document (${name})`,
    async () => {
      const out = {}
      for (const way of ['a', 'b']) {
        const { page, context, errors } = await newPage()
        await page.evaluate((u) => window.__h.open(u), indexOf[name].original)
        await waitFor(page, () =>
          window.__h.marks.some((m) => m.what === 'drawn' && m.side === 'right' && m.page === 1),
        )
        await page.evaluate(
          ([n, u]) => window.__h.layer(n, { target: 'zh', unlaid: u }),
          [name, way === 'b' ? 'composed' : 'original'],
        )
        await page.waitForTimeout(500)
        const re = way === 'b' ? await page.evaluate(() => window.__h.toComposed()) : null
        const w = await page.evaluate(() => window.__h.walk())
        await page.waitForTimeout(500)
        const mem = await processMiB()
        const draws = await page.evaluate(() => window.__h.marks.filter((m) => m.what === 'drawn').length)
        await context.close()
        assert(!errors.length, errors.join('; '))
        out[way] = { ...mem, walkMs: w.walkMs, draws, reopenMs: re?.reopenMs ?? null, views: w.probe['right.views'] }
      }
      ways[name] = out
      return out
    },
  )
}
if (process.env.AXT_WAYS_OUT)
  (await import('node:fs')).writeFileSync(process.env.AXT_WAYS_OUT, `${JSON.stringify(ways, null, 1)}\n`)

// ---------------------------------------------------------------- deliverable 7: the stack under the left, against PDF.js's viewer
const leftRuns = {}
const leftPapers = [
  ['2600.00001v1', '/api/v2/o/arxiv/2600_00001v1.pdf'],
  ...Object.entries(indexOf)
    .filter(([n]) => fixtures[n].face)
    .map(([n, x]) => [n, x.original]),
  ...(process.env.AXT_PAPER ? [['lab', '/api/v2/o/arxiv/lab.pdf']] : []),
]
for (const [label, url] of leftPapers) {
  await check(
    `left: the stack against PDF.js's viewer, first paint, a scroll trace, memory, behaviours (${label})`,
    async () => {
      const runs = []
      for (const kind of ['viewer', 'stack', 'stack', 'viewer']) {
        const { page, context, errors } = await newPage()
        await page.evaluate(([u, k]) => window.__h.single(u, k), [url, kind])
        await waitFor(page, () => window.__h.one.drawn.some((d) => d.n === 1), undefined, 20_000)
        const first = await page.evaluate(() => window.__h.one.drawn.find((d) => d.n === 1).at)
        await page.waitForTimeout(800)
        const behaviours = await page.evaluate(() => window.__h.behaviours())
        const trace = await page.evaluate(() => window.__h.scrollTrace(4000, 40))
        await page.waitForTimeout(800)
        const mib = await processMiB()
        await context.close()
        assert(!errors.length, errors.join('; '))
        runs.push({
          kind,
          firstPaintMs: Math.round(first),
          ...trace,
          renderer: mib?.renderer ?? null,
          gpu: mib?.gpu ?? null,
          ...behaviours,
        })
      }
      leftRuns[label] = runs
      const of = (k) => runs.filter((r) => r.kind === k)
      const avg = (xs, f) => Math.round((xs.reduce((a, x) => a + (f(x) ?? 0), 0) / xs.length) * 10) / 10
      const sum = Object.fromEntries(
        ['viewer', 'stack'].map((k) => [
          k,
          {
            firstPaintMs: avg(of(k), (r) => r.firstPaintMs),
            p95: avg(of(k), (r) => r.p95),
            over50: avg(of(k), (r) => r.over50),
            drawn: avg(of(k), (r) => r.drawn),
            renderer: avg(of(k), (r) => r.renderer),
            gpu: avg(of(k), (r) => r.gpu),
            textPages: of(k)[0].textPages,
            selectionAcross: of(k)[0].selectionAcross > 0,
            anchors: of(k)[0].anchors,
          },
        ]),
      )
      return sum
    },
  )
}
if (process.env.AXT_LEFT_OUT)
  (await import('node:fs')).writeFileSync(process.env.AXT_LEFT_OUT, `${JSON.stringify(leftRuns, null, 1)}\n`)

// ---------------------------------------------------------------- I1 and the split residue (lane L1's finding 2), both ways out
const residues = {}
for (const name of Object.keys(fixtures)) {
  await check(`I1: all groups on is arXiv's page, the split residue measured (${name})`, async () => {
    const { page, context, errors } = await newPage({ dpr: 2 })
    const lab = !!fixtures[name].face
    await page.evaluate((u) => window.__h.open(u), indexOf[name].original)
    await page.evaluate(([n, t]) => window.__h.layer(n, { target: t, rows: 'none' }), [name, lab ? 'zh' : 'de'])
    const r = await page.evaluate(() => window.__h.residue({ scale: 1.5 }))
    await context.close()
    assert(!errors.length, errors.join('; '))
    const P = r.pages
    const sum = (f) => P.reduce((a, x) => a + f(x), 0)
    const pix = sum((x) => x.pixels)
    const allPages = P.filter((x) => x.all.px > x.self.px),
      laidRows = P.filter((x) => x.laid)
    const summary = {
      pages: P.length,
      self: { pagesTouched: P.filter((x) => x.self.px).length, px: sum((x) => x.self.px) },
      b: {
        pagesTouched: allPages.length,
        px: sum((x) => x.all.px),
        share: +((sum((x) => x.all.px) / pix) * 100).toFixed(5),
        maxDelta: Math.max(0, ...P.map((x) => x.all.max)),
      },
      a: {
        laidPages: laidRows.length,
        pagesTouched: laidRows.filter((x) => x.laid.px > x.self.px).length,
        px: sum((x) => x.laid?.px ?? 0),
        maxDelta: Math.max(0, ...laidRows.map((x) => x.laid.max)),
      },
      msA: sum((x) => x.msA),
      msW: sum((x) => x.msW),
    }
    residues[name] = { summary, pages: P }
    // (our own papers: every pixel of all groups on is arXiv's, but where the canvas differs from itself)
    if (!lab)
      assert(
        allPages.length === 0,
        `all groups on differs from arXiv's page on pages ${allPages.map((x) => x.n).join(', ')}`,
      )
    return summary
  })
}
if (process.env.AXT_RESIDUE_OUT)
  (await import('node:fs')).writeFileSync(process.env.AXT_RESIDUE_OUT, `${JSON.stringify(residues, null, 1)}\n`)

await browser.close()
await server.close()
if (violations.length)
  console.log(`FAIL route table: ${violations.length} requests off the fixtures: ${violations.slice(0, 5).join(', ')}`)
const failed = results.filter((r) => !r.ok).length + (violations.length ? 1 : 0)
console.log(
  `${results.length - results.filter((r) => !r.ok).length} of ${results.length} checks passed${violations.length ? ', route table violated' : ''}`,
)
process.exit(failed ? 1 : 0)
