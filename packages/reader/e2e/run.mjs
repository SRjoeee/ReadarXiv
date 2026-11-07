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
import { answerBytes, startServer } from './server.mjs'

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
/** each paper's twin head: its head's bytes and a newline, another catalog digest over the same layer (a scenario's newer
 *  catalog, `recatalog`), its object by path */
const twins = {},
  twinObjects = new Map()
for (const [name, f] of Object.entries(fixtures)) {
  const head = JSON.parse(readFileSync(join(f.bundle, 'head.json'), 'utf8'))
  const seg = `${head.paper.id.replace('.', '_')}v${head.paper.version}`
  objects.set(`/api/v2/o/arxiv/${seg}.pdf`, f.pdf)
  for (const file of readdirSync(f.bundle))
    if (/^[0-9a-f]{64}\./.test(file)) objects.set(`/api/v2/o/p/${seg}/fx/${file.split('.')[0]}`, join(f.bundle, file))
  const headDigest = readdirSync(f.bundle)
    .find((x) => x.endsWith('.head'))
    .split('.')[0]
  {
    const bytes = Buffer.concat([readFileSync(join(f.bundle, `${headDigest}.head`)), Buffer.from('\n')])
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    twins[seg] = { path: `p/${seg}/fx/${sha256}`, sha256, bytes: bytes.length }
    twinObjects.set(`/api/v2/o/p/${seg}/fx/${sha256}`, bytes)
  }
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
      // (a newer catalog once the check says so: the same layer under the twin head)
      if (m?.kind === 'recatalog' && m.switched)
        return json(200, { ...d, rev: 3, layer: { ...d.layer, catalog: twins[d.pv] } })
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
    const twin = twinObjects.get(url.pathname)
    if (twin) {
      answerBytes(req, res, twin)
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
  const context = await browser.newContext({
    viewport: o.viewport ?? { width: 1400, height: 900 },
    ...(o.screen ? { screen: o.screen } : {}),
    deviceScaleFactor: o.dpr ?? 1,
  })
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
    // the stand-in of arXiv's abstract page (its citation_title) and its HTML version (none: 404)
    if (url.origin === 'https://arxiv.org' && /^\/(abs|html)\//.test(url.pathname)) {
      const id = url.pathname.split('/')[2] ?? ''
      const known = Object.values(indexOf).some((x) => x.paper.replace(/v\d+$/, '') === id.replace(/v\d+$/, ''))
      const headers = { 'access-control-allow-origin': '*', 'content-type': 'text/html' }
      if (url.pathname.startsWith('/html/') || !known) return route.fulfill({ status: 404, headers, body: '' })
      return route.fulfill({
        status: 200,
        headers,
        body: `<!doctype html><meta name="citation_title" content="A paper of our own (${id})"><title>${id}</title>`,
      })
    }
    violations.push(`${req.method()} ${url.href}`)
    return route.abort('blockedbyclient')
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    // (arXiv's answer that a paper has no HTML version is a 404 the reader asks for: expected)
    if (
      m.type() === 'error' &&
      !(/status of 404/.test(m.text()) && /^https:\/\/arxiv\.org\/html\//.test(m.location()?.url ?? ''))
    )
      errors.push(m.text())
  })
  await page.goto(`${server.origin}/${o.path ?? ''}`)
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
        // (each member's runs of text, in order, in the layer's text: the translation read in reading order)
        textOk: text.runs.every((rs) => rs.every((t) => text.text.replace(/\s+/g, '').includes(t.replace(/\s+/g, '')))),
        inOrder: (() => {
          let at = 0
          const all = text.text.replace(/\s+/g, '')
          for (const rs of text.runs)
            for (const t of rs) {
              const i = all.indexOf(t.replace(/\s+/g, ''), at)
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

await check(
  "compose: a turned page's highlight and links turned with it on both panes, its lines lit end to end, what is painted is what is hit (s3-turned)",
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), indexOf['s3-turned'].original)
    await page.evaluate(() => window.__h.layer('s3-turned'))
    await laidShown(page, 1)
    // (page 1, turned a quarter: its laid member of the most lines)
    const ord = await page.evaluate(() => {
      const ms = window.__h.composer.laid(1).members.filter((m) => m.state === 'laid')
      ms.sort((a, b) => b.lit.right.flat().length - a.lit.right.flat().length)
      for (const s of ['left', 'right']) window.__h.panes.pageElement(s, 1).id = `axt-shot-${s}`
      return ms[0].ord
    })
    const shoot = async () => ({
      left: (await page.locator('#axt-shot-left').screenshot({ animations: 'disabled' })).toString('base64'),
      right: (await page.locator('#axt-shot-right').screenshot({ animations: 'disabled' })).toString('base64'),
    })
    const unlit = await shoot()
    const pt = await page.evaluate((o) => window.__h.pointOf(1, o, 'right'), ord)
    await page.mouse.move(pt.x, pt.y)
    await page.waitForTimeout(150)
    const lit = await page.evaluate(() => window.__h.highlight.lit)
    const shot = await shoot()
    const sides = {}
    for (const side of ['left', 'right']) {
      const points = await page.evaluate(([o, s]) => window.__h.linePoints(1, o, s), [ord, side])
      const differ = await page.evaluate(
        ([a, b, at]) => window.__h.differAt(a, b, at),
        [unlit[side], shot[side], points.map((p) => p.at)],
      )
      // (each point hovered lights the same member: the point turned back into the page's frame finds its row)
      const hits = []
      for (const p of points) {
        await page.mouse.move(p.x, p.y)
        await page.waitForTimeout(40)
        hits.push(await page.evaluate(() => window.__h.highlight.lit?.id ?? null))
      }
      sides[side] = { points: points.length, unlitAt: differ.filter((d) => d === 0).length, hits }
    }
    // (its link turned with it: the anchor where the page's link box shows, a click on it out through the host)
    const links = await page.evaluate(() => window.__h.linksOf(1))
    const boxes = await page.evaluate(() => window.__h.linkBoxesOf(1))
    const a = links.find((l) => l.href?.startsWith('https:'))
    if (a) await page.mouse.click(a.rect.x + a.rect.width / 2, a.rect.y + a.rect.height / 2)
    const external = await page.evaluate(() => window.__h.external)
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(
      a && boxes.length === 1 && ['x', 'y', 'width', 'height'].every((k) => Math.abs(a.rect[k] - boxes[0][k]) <= 1),
      `the turned page's link ${JSON.stringify(a?.rect)} against its box ${JSON.stringify(boxes)}`,
    )
    assert(external.includes('https://example.invalid/turned'), `a click on it opened ${JSON.stringify(external)}`)
    assert(lit?.id === ord, `hovering ${ord} lit ${JSON.stringify(lit)}`)
    for (const [side, s] of Object.entries(sides)) {
      assert(s.points >= 6 && s.unlitAt === 0, `${side}: ${s.unlitAt} of ${s.points} points along the lines not lit`)
      assert(
        s.hits.every((h) => h === ord),
        `${side}: the points along the lines light ${JSON.stringify(s.hits)}, not ${ord}`,
      )
    }
    return { ord, points: { left: sides.left.points, right: sides.right.points } }
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
await check(
  "reader: a laid page's links reached by the pointer in a host's panes; no slot keeps the left's loading mark (L11 gap 5)",
  async () => {
    const { page, context, errors } = await newPage()
    // (the host's scrollers as both hosts' chrome gives them: a .viewerContainer a pane, its own .pdfViewer, under which
    // pdf_viewer.css draws a page's loading dots over it while it is marked loading)
    await page.evaluate(() => {
      const root = document.createElement('div')
      root.style.cssText = 'position:absolute;inset:0'
      const panes = { root }
      for (const side of ['left', 'right']) {
        const el = document.createElement('div')
        el.className = `viewerContainer axt-pane ${side}`
        el.id = side
        el.append(Object.assign(document.createElement('div'), { className: 'pdfViewer' }))
        root.append(el)
        panes[side] = el
      }
      document.body.append(root)
      window.__opened = []
      window.open = (u) => {
        window.__opened.push(String(u))
        return null
      }
      window.__h.given = panes
    })
    await page.evaluate(() => window.__h.reader('s1-columns', { host: 'web', panes: window.__h.given }))
    await readerLaid(page)
    // (the laid page put in place, the left's copy before it and its frame gone by)
    await page.waitForTimeout(400)
    const seen = await page.evaluate(() => {
      const right = window.__h.given.right
      const loading = [...right.querySelectorAll('.axt-slot')]
        .filter((s) => s.classList.contains('loading') || s.classList.contains('loadingIcon'))
        .map((s) => s.dataset.pageNumber)
      const slot = right.querySelector('.axt-slot[data-page-number="1"]')
      const a = [...(slot?.querySelectorAll('.axt-over a.axt-link') ?? [])].find((x) =>
        x.getAttribute('href')?.startsWith('https:'),
      )
      const r = a?.getBoundingClientRect()
      const x = r ? r.left + r.width / 2 : 0,
        y = r ? r.top + r.height / 2 : 0
      const hit = r ? document.elementFromPoint(x, y) : null
      return {
        loading,
        href: a?.getAttribute('href') ?? null,
        at: [x, y],
        hit: hit ? `${hit.tagName}.${hit.className}` : null,
        onLink: !!a && !!hit && hit.closest('a') === a,
      }
    })
    if (seen.href) await page.mouse.click(seen.at[0], seen.at[1])
    await page.waitForTimeout(200)
    const opened = await page.evaluate(() => window.__opened)
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(!seen.loading.length, `slots still marked loading: ${seen.loading}`)
    assert(seen.href && seen.onLink, `the pointer over the link meets ${seen.hit}`)
    assert(opened.length === 1 && opened[0] === seen.href, `opened ${JSON.stringify(opened)}`)
    return { href: seen.href, opened }
  },
)
/** the host page (chrome.html): the chrome over a reader of fixture `name`, with the host's parts `o`, laid */
async function chromeLaid(name, o = {}, page0 = {}) {
  const opened = await newPage({ ...page0, path: 'chrome.html' })
  await opened.page.evaluate(([n, x]) => window.__c.open(n, x), [name, o])
  await waitFor(opened.page, () => (window.__c.reader?.probe().laidPages ?? 0) > 0, null, 25_000)
  return opened
}
await check(
  "chrome: a host's own controls in their places, each working: its way home first in the lead, its short link right after the title, its interface language the reading options' last row (L11 gap 2)",
  async () => {
    const { page, context, errors } = await chromeLaid('s1-columns', { slots: true })
    const en = await page.evaluate(() => window.__c.words('en'))
    const zh = await page.evaluate(() => window.__c.words('zh-CN'))
    const lead = await page.evaluate(() => {
      const el = document.querySelector('[data-zone="lead"]')
      const home = el.querySelector('[data-host="home"]').getBoundingClientRect()
      return {
        // (a control's tooltip, its next sibling, left out)
        children: [...el.children]
          .map((x) => x.dataset.host ?? (x.matches('.paper-title') ? 'title' : x.getAttribute('aria-label')))
          .filter((x) => x !== null),
        short: !!el.querySelector(':scope > .paper-title + [data-host="short"]'),
        home: [home.left + home.width / 2, home.top + home.height / 2],
      }
    })
    await page.mouse.click(lead.home[0], lead.home[1])
    await page.locator(`button[aria-label="${en.options}"]`).click()
    const last = await page.evaluate(
      () =>
        document.getElementById('pop-options')?.lastElementChild?.querySelector('[data-host]')?.dataset.host ?? null,
    )
    await page.locator('[data-host="ui"]').click()
    await waitFor(page, (w) => !!document.querySelector(`button[aria-label="${w}"]`), zh.options).catch(() => {})
    const after = await page.evaluate((w) => {
      const pop = document.getElementById('pop-options')
      return {
        bar: !!document.querySelector(`button[aria-label="${w.options}"]`),
        dim: [...(pop?.querySelectorAll('[role="switch"]') ?? [])]
          .map((x) => x.getAttribute('aria-label'))
          .includes(w.dim),
        clicked: window.__c.clicked,
        writes: window.__c.writes,
      }
    }, zh)
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(
      JSON.stringify(lead.children) === JSON.stringify(['home', en.contents, 'title', 'short']) && lead.short,
      `the lead ${JSON.stringify(lead)}`,
    )
    assert(last === 'ui', `the reading options' last row ${last}`)
    assert(after.bar && after.dim, `the chrome after the pick: ${JSON.stringify(after)}`)
    assert(JSON.stringify(after.clicked) === JSON.stringify(['home', 'ui:zh-CN']), `clicked ${after.clicked}`)
    assert(
      after.writes.some((w) => w.ui === 'zh-CN'),
      `the reader wrote ${JSON.stringify(after.writes)}`,
    )
    return { lead: lead.children, last, clicked: after.clicked }
  },
)
await check(
  "chrome: a host's toast in the capsule's place, in its words and sign, for its time; the word it replaced back after it (L11 gap 6, difference 8)",
  async () => {
    const { page, context, errors } = await chromeLaid('s1-columns', { slots: true })
    const capsule = () =>
      page.evaluate(() => {
        const el = document.querySelector('.capsule:not([data-out])')
        return el
          ? {
              kind: el.getAttribute('data-kind'),
              said: el.querySelector('.sr-only')?.textContent ?? '',
              sign: el.querySelector('svg path')?.getAttribute('d') ?? null,
            }
          : null
      })
    // (the host's word for a crash with something on screen, as the website's page says it: 8 s)
    await page.evaluate(() => window.__c.controller.toast({ words: 'The translation did not load', ms: 8000 }))
    const lost = await capsule()
    await page.locator('[data-host="share"]').click()
    const copied = await capsule()
    await page.waitForTimeout(3300)
    const back = await capsule()
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(
      lost?.kind === 'toast' && lost.said === 'The translation did not load',
      `the crash's word ${JSON.stringify(lost)}`,
    )
    assert(
      copied?.kind === 'toast' && copied.said === 'Link copied' && copied.sign === 'M20 6 9 17l-5-5',
      `the share's word ${JSON.stringify(copied)}`,
    )
    assert(back?.said === 'The translation did not load', `after the share's word ${JSON.stringify(back)}`)
    return { lost: lost.said, copied: copied.said, back: back.said }
  },
)
await check(
  "chrome: a host's words for the capsule's states: a paper being prepared said in them, with the spinner; the catalogue's look (the progress line alone) where it gives none (L11 differences 1, 2)",
  async () => {
    const seg = indexOf['s2-splits'].seg
    const seen = async (words) => {
      modes[seg] = { kind: 'not-opened', prepareMs: 2500 }
      try {
        const { page, context, errors } = await newPage({ path: 'chrome.html' })
        await page.evaluate((w) => window.__c.open('s2-splits', { words: w }), words)
        await waitFor(page, () => window.__c.reader?.state().layer.s === 'preparing', null, 20_000)
        await page.waitForTimeout(300)
        const during = await page.evaluate(() => {
          const el = document.querySelector('.capsule:not([data-out])')
          return el
            ? {
                kind: el.getAttribute('data-kind'),
                said: el.querySelector('.sr-only')?.textContent,
                spinner: !!el.querySelector('svg.spin'),
              }
            : null
        })
        const line = await page.evaluate(
          () => document.querySelector('.progress-line')?.hasAttribute('data-on') ?? null,
        )
        await waitFor(page, () => (window.__c.reader?.probe().laidPages ?? 0) > 0, null, 25_000)
        await page.waitForTimeout(400)
        const after = await page.evaluate(
          () => document.querySelector('.capsule:not([data-out])')?.getAttribute('data-kind') ?? null,
        )
        await context.close()
        return { during, line, after, errors: errors.filter((e) => !/status of 404/.test(e)) }
      } finally {
        delete modes[seg]
      }
    }
    const host = await seen(true)
    const none = await seen(false)
    assert(!host.errors.length && !none.errors.length, [...host.errors, ...none.errors].join('; '))
    assert(
      host.during?.kind === 'progress' && host.during.said === 'Preparing the paper' && host.during.spinner,
      `the host's words while preparing: ${JSON.stringify(host.during)}`,
    )
    assert(host.after !== 'progress', `a capsule of the run after it: ${host.after}`)
    assert(none.during === null && none.line === true, `no words given: ${JSON.stringify(none)}`)
    return { host: host.during.said, none: { capsule: none.during, line: none.line } }
  },
)
await check(
  "chrome: the narrow window by the host's rule: the extension's keeps side by side chosen and says so; the website's shows the translation chosen, side by side greyed, and says so only once narrowed while reading (L11 difference 7)",
  async () => {
    const look = (page) =>
      page.evaluate(() => {
        const w = window.__c.words('en')
        const radio = (name) => document.querySelector(`.seg.display [role="radio"][aria-label="${name}"]`)
        return {
          bilingual: [
            radio(w.bilingual)?.getAttribute('aria-checked'),
            radio(w.bilingual)?.getAttribute('aria-disabled'),
          ],
          translation: radio(w.translation)?.getAttribute('aria-checked'),
          narrow: !!document.querySelector('.capsule[data-kind="narrow"]:not([data-out])'),
          right: !!window.__c.reader?.state().view.narrow,
        }
      })
    const out = {}
    for (const rule of ['told', 'shown']) {
      const { page, context, errors } = await chromeLaid('s1-columns', rule === 'told' ? {} : { narrow: rule }, {
        viewport: { width: 700, height: 900 },
      })
      await page.waitForTimeout(300)
      const opened = await look(page)
      await page.setViewportSize({ width: 1400, height: 900 })
      await page.waitForTimeout(600)
      await page.setViewportSize({ width: 700, height: 900 })
      await page.waitForTimeout(600)
      const narrowed = await look(page)
      await context.close()
      assert(!errors.length, errors.join('; '))
      out[rule] = { opened, narrowed }
    }
    const { told, shown } = out
    assert(
      told.opened.right && told.opened.bilingual[0] === 'true' && told.opened.narrow,
      `the extension's, opened narrow: ${JSON.stringify(told.opened)}`,
    )
    assert(
      shown.opened.right &&
        shown.opened.translation === 'true' &&
        shown.opened.bilingual[1] === 'true' &&
        !shown.opened.narrow,
      `the website's, opened narrow: ${JSON.stringify(shown.opened)}`,
    )
    assert(
      shown.narrowed.translation === 'true' && shown.narrowed.narrow,
      `the website's, narrowed while reading: ${JSON.stringify(shown.narrowed)}`,
    )
    return out
  },
)
await check(
  "reader: PDF.js's legacy build handed by the host: its modules and its worker, the pages drawn and laid as on the modern (L11 gap 3)",
  async () => {
    const from = server.log.length
    const { page, context, errors } = await newPage()
    await page.evaluate(() => window.__h.reader('s1-columns', { host: 'web', legacy: true }))
    await readerLaid(page)
    const st = await page.evaluate(() => window.__h.readers[0].reader.state())
    const p = await probe(page)
    const scripts = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((e) => new URL(e.name).pathname)
        .filter((x) => x.endsWith('.js') || x.endsWith('.mjs')),
    )
    await context.close()
    const asked = server.log.slice(from).map((x) => x.path)
    assert(!errors.length, errors.join('; '))
    const workers = asked.filter((x) => x.endsWith('pdf.worker.min.mjs'))
    assert(
      workers.length > 0 && workers.every((x) => /\/pdfjs\/[\d.]+\/legacy\/pdf\.worker\.min\.mjs$/.test(x)),
      `the workers asked: ${JSON.stringify(workers)}`,
    )
    assert(
      st.original.s === 'open' && st.layer.s === 'ready' && p.laidPages > 0,
      `state ${JSON.stringify([st.original, st.layer])}`,
    )
    return { workers: [...new Set(workers)], laidPages: p.laidPages, chunks: scripts.length }
  },
)
await check(
  'reader: close lets everything go, closed before PDF.js is in too; a second reader on the same page goes on',
  async () => {
    // (closed in the task that opened it, before PDF.js's modules are in: once they are, for the reader opened after it on the
    // same page, the closed one has made nothing: no sheet, no pane, no mark, no worker, no timer, no ticket)
    const early = await newPage()
    await early.page.evaluate(async () => {
      await window.__h.reader('s1-columns', { host: 'web', width: '50%', closeAtOnce: true })
      await window.__h.reader('s2-splits', { host: 'web', width: '50%' })
    })
    await readerLaid(early.page, 1)
    const closedEarly = await early.page.evaluate(() => {
      const r = window.__h.readers[0]
      return {
        root: r.root.childElementCount,
        attrs: r.root.getAttributeNames(),
        cls: r.root.className,
        probe: r.reader.probe(),
      }
    })
    await early.context.close()
    assert(!early.errors.length, early.errors.join('; '))
    assert(
      closedEarly.root === 0 &&
        !closedEarly.attrs.some((a) => a.startsWith('data-axt')) &&
        !/axt-/.test(closedEarly.cls),
      `closed before ready: root ${closedEarly.root} children, ${closedEarly.attrs}, class "${closedEarly.cls}"`,
    )
    assert(
      closedEarly.probe.workers === 0 && closedEarly.probe.clockDue === 0 && closedEarly.probe.live === 0,
      `closed before ready ${JSON.stringify(closedEarly.probe)}`,
    )
    const { page, context, errors } = await newPage()
    await page.evaluate(async () => {
      await window.__h.reader('s1-columns', { host: 'web', width: '50%' })
      await window.__h.reader('s2-splits', { host: 'web', width: '50%' })
    })
    await readerLaid(page, 0)
    await readerLaid(page, 1)
    // (each reader's faces in the document, by the reader's number in their family: `axt-<reader>-<face>`)
    const facesOf = () =>
      page.evaluate(() => [
        ...new Set(
          [...document.fonts]
            .map((f) => /^"?axt-(\d+)-/.exec(f.family)?.[1])
            .filter(Boolean)
            .sort(),
        ),
      ])
    // (a page counts as laid at its commit, before its drawing waits for its faces: both readers' faces in first)
    await waitFor(
      page,
      () => new Set([...document.fonts].map((f) => /^"?axt-(\d+)-/.exec(f.family)?.[1]).filter(Boolean)).size === 2,
      null,
      15_000,
    ).catch(() => {})
    const facesBefore = await facesOf()
    await page.evaluate(() => window.__h.readers[0].reader.close())
    await page.waitForTimeout(500)
    const after = await page.evaluate(() => ({
      root: window.__h.readers[0].root.childElementCount,
      attrs: window.__h.readers[0].root.getAttributeNames(),
      a: window.__h.readers[0].reader.probe(),
      b: window.__h.readers[1].reader.probe(),
    }))
    const facesAfter = await facesOf()
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
    // (the closed reader's faces taken out of the document, the other's kept)
    assert(
      facesBefore.length === 2 && facesAfter.length === 1 && facesBefore.includes(facesAfter[0]),
      `the readers' faces in the document: ${JSON.stringify(facesBefore)} before the close, ${JSON.stringify(facesAfter)} after`,
    )
    assert(
      after.b.workers === 2 && after.b.laidPages > 0 && b2.probe.laidPages > 0 && b2.state.view.scale > 0,
      `the other reader ${JSON.stringify(b2.probe)}`,
    )
    return {
      early: { root: closedEarly.root, workers: closedEarly.probe.workers, live: closedEarly.probe.live },
      a: { workers: after.a.workers, live: after.a.live },
      b: { workers: after.b.workers, laidPages: b2.probe.laidPages },
    }
  },
)

await check(
  "reader: each composed document keeps its own layout: a newer catalog's pages laid by its layout, the older one's late layout dropped",
  async () => {
    const seg = indexOf['s1-columns'].seg
    modes[seg] = { kind: 'recatalog', switched: false }
    try {
      const { page, context, errors } = await newPage()
      await page.evaluate(() => window.__h.reader('s1-columns', { host: 'web', holdFirstLay: true }))
      // (the first composed document's layout asked, and held; then the server names a newer catalog)
      await waitFor(page, () => window.__h.marks.some((m) => m.what === 'lay-asked' && m.gen === 1), null, 25_000)
      modes[seg].switched = true
      await waitFor(
        page,
        () =>
          window.__h.marks.some((m) => m.what === 'lay' && m.gen === 2) &&
          window.__h.readers[0].reader.probe().laidPages > 0,
        null,
        25_000,
      )
      // (the first layout comes late; then every near page laid again, by what to translate changed)
      const from = await page.evaluate(() => {
        window.__h.releaseLay()
        return window.__h.marks.length
      })
      await page.waitForTimeout(500)
      await page.evaluate(() => {
        const r = window.__h.readers[0].reader
        const c = r.state().prefs.classes
        r.do({ do: 'set', prefs: { classes: { ...c, heads: !c.heads } } })
      })
      await waitFor(page, (n) => window.__h.marks.slice(n).some((m) => m.what === 'lay'), from, 10_000)
      await page.waitForTimeout(500)
      const gens = await page.evaluate(
        (n) =>
          window.__h.marks
            .slice(n)
            .filter((m) => m.what === 'lay')
            .map((m) => m.gen),
        from,
      )
      const probe = await page.evaluate(() => window.__h.readers[0].reader.probe())
      await context.close()
      assert(!errors.length, errors.join('; '))
      assert(
        gens.length > 0 && gens.every((g) => g === 2),
        `the pages laid after the first layout came, by generation: ${JSON.stringify(gens)}`,
      )
      return { laidAgain: gens.length, by: [...new Set(gens)], laidPages: probe.laidPages }
    } finally {
      delete modes[seg]
    }
  },
)

// ---------------------------------------------------------------- stage 5a, deliverable 2 part A: today's behaviours over the stack
// (each check names the rows of lanes/L4/list-b.md and list-a.md it holds; docs/PDF-READER.md §11.7-§11.11, §17)
const S1 = indexOf['s1-columns'].original,
  SAMPLE = '/api/v2/o/arxiv/2600_00001v1.pdf'
const drawnOn = (page, side, n, key) =>
  waitFor(
    page,
    ([side, n, key]) =>
      window.__h.marks.some(
        (m) => m.what === 'drawn' && m.side === side && m.page === n && (key === null || String(m.key).startsWith(key)),
      ),
    [side, n, key],
  )
const shownKey = (page, n) => page.evaluate((n) => window.__h.panes.right.showing(n), n)

await check(
  'port: the skeleton while no original is drawn, every slot at its size, hidden from AT (B-226)',
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u, { borrow: true }), SAMPLE)
    await drawnOn(page, 'right', 1, null)
    const before = await page.evaluate(() => window.__h.panes.right.page(1).getBoundingClientRect().toJSON())
    await page.evaluate(() => window.__h.panes.drop())
    await page.waitForTimeout(300)
    const r = await page.evaluate(() => {
      const p = window.__h.panes,
        s = p.right.page(1)
      return {
        slots: p.right.pages,
        sk: !!s.querySelector('.axt-sk'),
        lines: s.querySelectorAll('.axt-sk-lines').length,
        hidden: s.getAttribute('aria-hidden'),
        box: s.getBoundingClientRect().toJSON(),
        probe: p.right.probe(),
      }
    })
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(r.slots === 4 && r.sk && r.lines > 0 && r.hidden === 'true', JSON.stringify(r))
    assert(
      Math.abs(r.box.width - before.width) < 0.5 && Math.abs(r.box.height - before.height) < 0.5,
      'the slot resized',
    )
    assert(r.probe.views === 0 && r.probe.skeletons >= 1, JSON.stringify(r.probe))
    return { skeletons: r.probe.skeletons, slots: r.slots }
  },
)

await check(
  "port: a waiting page is the left's own drawing, no second render, no text layer or links of its own; kept by CSS through a zoom until the left draws again; its own page view with the sync off, its text the paper's language (B-006, B-228, B-229, A-332)",
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u, { borrow: true }), SAMPLE)
    await drawnOn(page, 'left', 1, null)
    await drawnOn(page, 'right', 1, 'left')
    const r1 = await page.evaluate(() => {
      const p = window.__h.panes,
        s = p.right.page(1)
      const copy = s.querySelector('canvas.axt-slot-copy'),
        src = p.leftViewer.getPageView(0).canvas
      const px = (c, x, y) => [...c.getContext('2d').getImageData(x, y, 1, 1).data]
      const at = [
        [10, 10],
        [Math.floor(src.width / 2), Math.floor(src.height / 3)],
        [src.width - 5, src.height - 5],
      ]
      copy.dataset.tag = 'first'
      return {
        copy: !!copy,
        same:
          !!copy && copy.width === src.width && at.every(([x, y]) => px(copy, x, y).join() === px(src, x, y).join()),
        text: !!s.querySelector('.textLayer'),
        annotations: !!s.querySelector('.annotationLayer'),
        made: p.right.probe().made,
        leftLang: document.querySelector('.axt-pane.left .textLayer')?.getAttribute('lang') ?? null,
        copies: p.right.probe().copies,
      }
    })
    await page.evaluate(() => window.__h.panes.zoomBy(1.25))
    const during = await page.evaluate(() => !!window.__h.panes.right.page(1).querySelector('canvas[data-tag="first"]'))
    await page.waitForTimeout(1000)
    const r2 = await page.evaluate(() => {
      const p = window.__h.panes,
        copy = p.right.page(1).querySelector('canvas.axt-slot-copy')
      return { copies: p.right.probe().copies, width: copy?.width, left: p.leftViewer.getPageView(0).canvas.width }
    })
    await page.evaluate(() => window.__h.panes.setSync(false))
    await drawnOn(page, 'right', 1, 'original')
    await page.waitForTimeout(300)
    const r3 = await page.evaluate(() => {
      const s = window.__h.panes.right.page(1)
      return {
        text: !!s.querySelector('.textLayer'),
        lang: s.querySelector('.textLayer')?.getAttribute('lang') ?? null,
      }
    })
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(r1.copy && r1.same, `the copy: ${JSON.stringify(r1)}`)
    assert(!r1.text && !r1.annotations && r1.made === 0, `a second drawing: ${JSON.stringify(r1)}`)
    assert(r1.leftLang === 'en', `the left's text layer lang ${r1.leftLang}`)
    assert(during, 'the copy left as the zoom began')
    assert(r2.copies > r1.copies && r2.width === r2.left, `after the zoom: ${JSON.stringify(r2)}`)
    assert(r3.text && r3.lang === 'en', `the sync off: ${JSON.stringify(r3)}`)
    return { copies: r2.copies }
  },
)

await check(
  'port: Glint on near pages waiting for their rows, every value of its look, in shares of the page, gone in the task the page is put in place (B-274-B-283)',
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), S1)
    await page.evaluate(() => window.__h.layer('s1-columns', { rows: 'none' }))
    await waitFor(page, () => (window.__h.marksOf(1)?.count ?? 0) > 0)
    await page.waitForTimeout(150)
    const m = await page.evaluate(() => window.__h.marksOf(1))
    const members = await page.evaluate(
      () =>
        [...window.__h.parts.values()]
          .flatMap((p) => p.flows.flat())
          .filter((x) => x.lines.some((l) => l[0] === 1))
          .filter((x, i, a) => a.findIndex((y) => y.ord === x.ord) === i).length,
    )
    await page.evaluate(() => window.__h.panes.zoomBy(1.25))
    await page.waitForTimeout(900)
    const z = await page.evaluate(() => window.__h.marksOf(1))
    await page.evaluate(() => window.__h.rows.give())
    await laidShown(page, 1)
    const at = await page.evaluate(
      () =>
        window.__h.marks.find((x) => x.what === 'shown' && x.page === 1 && String(x.key).startsWith('laid:')).marksLeft,
    )
    const after = await page.evaluate(() => window.__h.marksOf(1))
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(m.count === members, `${m.count} marks for ${members} paragraphs`)
    assert(m.ariaHidden === 'true' && m.pointerEvents === 'none', JSON.stringify(m))
    assert(m.delay === '0.3s' && m.fade === '0.4s' && m.run === '3.4s', `timing ${JSON.stringify(m)}`)
    assert(m.angle === '100deg' && /78%/.test(m.light), `look ${m.angle} ${m.light}`)
    assert(m.passes === m.count && m.starts.length === 1, `one light: ${m.passes} passes, starts ${m.starts}`)
    const moved = m.shares
      .flatMap((b, i) => b.map((v, k) => Math.abs(v - z.shares[i][k])))
      .reduce((a, b) => Math.max(a, b), 0)
    assert(moved < 0.002, `a zoom moved a mark by ${moved} of the page`)
    assert(at === 0 && after === null, `marks at the swap ${at}, after ${JSON.stringify(after)}`)
    // (reduced motion: the still veil, no light)
    const r = await newPage()
    await r.page.emulateMedia({ reducedMotion: 'reduce' })
    await r.page.evaluate((u) => window.__h.open(u), S1)
    await r.page.evaluate(() => window.__h.layer('s1-columns', { rows: 'none' }))
    await waitFor(r.page, () => (window.__h.marksOf(1)?.count ?? 0) > 0)
    await r.page.waitForTimeout(450)
    const still = await r.page.evaluate(() => window.__h.marksOf(1))
    await r.context.close()
    assert(!r.errors.length, r.errors.join('; '))
    assert(still.before === 'none' && !/rgba\(0, 0, 0, 0\)|transparent/.test(still.background), JSON.stringify(still))
    return { marks: m.count, still: still.background }
  },
)

await check(
  'port: another target in place: the page laid kept until its commit, muted meanwhile, the left untouched; rows that will not come put it back to the original (B-313-B-316, B-320, B-295, A-286, A-287)',
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), S1)
    await page.evaluate(() => window.__h.layer('s1-columns'))
    await laidShown(page, 1)
    await page.waitForTimeout(300)
    const key1 = await shownKey(page, 1)
    const left0 = await page.evaluate(() => ({
      draws: window.__h.marks.filter((m) => m.what === 'drawn' && m.side === 'left').length,
      top: document.querySelector('.axt-pane.left').scrollTop,
    }))
    const ord = await page.evaluate(() => window.__h.composer.laid(1).members.find((m) => m.state === 'laid').ord)
    await page.evaluate(() => window.__h.retargetLater('xx', 's1-columns'))
    await page.waitForTimeout(400)
    const kept = await page.evaluate(
      ([ord]) => {
        const pt = window.__h.pointOf(1, ord, 'right')
        return {
          key: window.__h.panes.right.showing(1),
          muted: window.__h.composer.muted(1),
          hit: pt ? window.__h.highlight.at('right', pt.x, pt.y) : 'no point',
        }
      },
      [ord],
    )
    await page.evaluate(() => window.__h.rows.give())
    await waitFor(
      page,
      ([k]) => {
        const s = window.__h.panes.right.showing(1)
        return s?.startsWith('laid:') && s !== k
      },
      [key1],
    )
    const key2 = await shownKey(page, 1)
    const muted2 = await page.evaluate(() => window.__h.composer.muted(1))
    await page.evaluate(() => window.__h.retargetLater('yy', 's1-columns'))
    await page.waitForTimeout(200)
    await page.evaluate(() => window.__h.rows.end())
    await waitFor(page, () => !String(window.__h.panes.right.showing(1)).startsWith('laid:'))
    const back = await shownKey(page, 1)
    const left1 = await page.evaluate(() => ({
      draws: window.__h.marks.filter((m) => m.what === 'drawn' && m.side === 'left').length,
      top: document.querySelector('.axt-pane.left').scrollTop,
    }))
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(kept.key === key1 && kept.muted && kept.hit === null, `kept: ${JSON.stringify(kept)}`)
    assert(key2 !== key1 && !muted2, `the new target's commit: ${key2}, muted ${muted2}`)
    assert(back === 'original', `rows that will not come: ${back}`)
    assert(
      left1.draws === left0.draws && left1.top === left0.top,
      `the left touched: ${JSON.stringify([left0, left1])}`,
    )
    return { kept: kept.key, next: key2, back }
  },
)

await check(
  "port: a laid page's crops drawn again 600 ms after a zoom; its text layers out of layout through the zoom's steps, a selection kept (B-258, B-403, B-404)",
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), S1)
    await page.evaluate(() => window.__h.layer('s1-columns'))
    await laidShown(page, 1)
    await page.waitForTimeout(300)
    const crop = () =>
      page.evaluate(() => {
        const s = window.__h.panes.right.page(1)
        const c = s.querySelector('.axt-over > canvas.axt-crops')
        return c ? c.width : null
      })
    const w0 = await crop()
    // (a selection in the text layer, before the zoom)
    const sel0 = await page.evaluate(() => {
      const span = window.__h.panes.right.page(1).querySelector('.axt-over .textLayer span')
      const r = document.createRange()
      r.selectNodeContents(span)
      getSelection().removeAllRanges()
      getSelection().addRange(r)
      return getSelection().toString()
    })
    await page.evaluate(() => window.__h.panes.zoomBy(1.6))
    const during = await page.evaluate(() => {
      const st = window.__h.panes.right.element
      const tl = window.__h.panes.right.page(1).querySelector('.axt-over .textLayer')
      const sel = getSelection()
      return {
        scaling: st.hasAttribute('data-axt-scaling'),
        display: getComputedStyle(tl).display,
        kept: sel.rangeCount === 1 && tl.contains(sel.getRangeAt(0).startContainer),
      }
    })
    await page.waitForTimeout(500)
    const w1 = await crop()
    await page.waitForTimeout(1100)
    const w2 = await crop()
    const after = await page.evaluate(() => {
      const st = window.__h.panes.right.element
      const tl = window.__h.panes.right.page(1).querySelector('.axt-over .textLayer')
      return {
        scaling: st.hasAttribute('data-axt-scaling'),
        display: getComputedStyle(tl).display,
        sel: getSelection().toString(),
        agains: window.__h.panes.right.probe().agains,
      }
    })
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(w0 && w1 === w0 && w2 > w0, `the crops: ${w0} → ${w1} (500 ms) → ${w2} (1.6 s)`)
    assert(during.scaling && during.display === 'none' && during.kept, `during: ${JSON.stringify(during)}`)
    assert(!after.scaling && after.display !== 'none' && after.sel === sel0, `after: ${JSON.stringify(after)}`)
    return { crops: [w0, w2], agains: after.agains }
  },
)

await check(
  'port: a laid page far and back is its very drawing, its text layer with it; zoomed while far, drawn again at the new scale; held in place while it holds the focus; a budget of 0 keeps none (B-300, B-268, B-401, B-260, B-025, B-011, B-269)',
  async () => {
    const run = async (keep) => {
      const { page, context, errors } = await newPage({
        viewport: { width: 1400, height: 500 },
        screen: { width: 2560, height: 1600 },
      })
      await page.evaluate(([u, k]) => window.__h.open(u, k === null ? {} : { keepPixels: k }), [S1, keep])
      await page.evaluate(() => window.__h.layer('s1-columns'))
      await laidShown(page, 1)
      await page.evaluate(() => window.__h.panes.zoomTo(2))
      await page.waitForTimeout(1200)
      await page.evaluate(() => {
        const s = window.__h.panes.right.page(1)
        s.querySelector('.axt-slot-view canvas').dataset.tag = 'p1'
        s.querySelector('.axt-over .textLayer').dataset.tag = 'p1'
      })
      const end = () =>
        page.evaluate(() => {
          const c = document.querySelector('.axt-pane.right')
          c.scrollTop = c.scrollHeight
        })
      const top = () => page.evaluate(() => (document.querySelector('.axt-pane.right').scrollTop = 0))
      await end()
      await waitFor(page, () => !window.__h.panes.right.near(1))
      await page.waitForTimeout(200)
      const far = await page.evaluate(() => window.__h.panes.right.probe())
      await top()
      await waitFor(page, () => window.__h.panes.right.near(1))
      await page.waitForTimeout(100)
      const back = await page.evaluate(() => {
        const s = window.__h.panes.right.page(1)
        return {
          canvas: !!s.querySelector('.axt-slot-view canvas[data-tag="p1"]'),
          text: !!s.querySelector('.axt-over .textLayer[data-tag="p1"]'),
          key: window.__h.panes.right.showing(1),
        }
      })
      // (far, a zoom; back: the same drawing, drawn again at the new scale)
      await end()
      await waitFor(page, () => !window.__h.panes.right.near(1))
      const marks0 = await page.evaluate(() => window.__h.marks.length)
      await page.evaluate(() => window.__h.panes.zoomTo(2.4))
      await page.waitForTimeout(800)
      await top()
      await waitFor(page, () => window.__h.panes.right.near(1))
      await page.waitForTimeout(1200)
      const again = await page.evaluate(
        ([m0]) =>
          window.__h.marks
            .slice(m0)
            .filter((m) => m.what === 'drawn' && m.side === 'right' && m.page === 1)
            .map((m) => ({ key: m.key, scale: m.scale })),
        [marks0],
      )
      const dbg = await page.evaluate(() => {
        const s = window.__h.panes.right.page(1)
        const c = s.querySelector('.axt-slot-view canvas')
        return {
          probe: window.__h.panes.right.probe(),
          canvas: c ? [c.width, c.style.width] : null,
          scale: window.__h.panes.scale,
          key: window.__h.panes.right.showing(1),
        }
      })
      // (the focus on a link of page 1 as it goes far: held in place; let go a task after the focus leaves)
      await page.evaluate(() => window.__h.panes.right.page(1).querySelector('a.axt-link')?.focus())
      await end()
      await waitFor(page, () => !window.__h.panes.right.near(1))
      await page.waitForTimeout(150)
      const held = await page.evaluate(() => ({
        focusHeld: window.__h.panes.right.probe().focusHeld,
        active: document.activeElement?.className ?? null,
        drawn: !!window.__h.panes.right.page(1).querySelector('.axt-over'),
      }))
      await page.evaluate(() => document.activeElement?.blur())
      await page.waitForTimeout(100)
      const left = await page.evaluate(() => ({
        focusHeld: window.__h.panes.right.probe().focusHeld,
        body: document.activeElement === document.body,
        kept: window.__h.panes.right.probe().kept,
      }))
      await context.close()
      assert(!errors.length, errors.join('; '))
      return { far, back, again, held, left, dbg }
    }
    const a = await run(null)
    assert(a.far.kept === 1, `kept off the view: ${JSON.stringify(a.far)}`)
    assert(a.back.canvas && a.back.text && String(a.back.key).startsWith('laid:'), `back: ${JSON.stringify(a.back)}`)
    assert(
      a.again.some((m) => String(m.key).startsWith('laid:') && Math.abs(m.scale - 2.4) < 0.01),
      `drawn again at 2.4: ${JSON.stringify(a.again)} ${JSON.stringify(a.dbg)}`,
    )
    assert(a.held.focusHeld === 1 && a.held.active === 'axt-link' && a.held.drawn, `held: ${JSON.stringify(a.held)}`)
    assert(a.left.focusHeld === 0, `let go: ${JSON.stringify(a.left)}`)
    const b = await run(0)
    assert(b.far.kept === 0, `a budget of 0 kept ${b.far.kept}`)
    assert(!b.back.canvas, 'a budget of 0 kept the drawing')
    return { kept: a.far.keptPixels, again: a.again.length, zero: b.far.kept }
  },
)

await check(
  "port: links named by the text under them, the PDF's border, the wash on hover, the ring on focus; a click on one levels nothing; the keyboard's jump takes the focus there (B-336-B-338, B-343, B-344, B-346-B-348, A-383)",
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), S1)
    await page.evaluate(() => window.__h.layer('s1-columns'))
    await laidShown(page, 1)
    await page.waitForTimeout(300)
    const links = await page.evaluate(async () => {
      const s = window.__h.panes.right.page(1)
      const spans = [...s.querySelectorAll('.axt-over .textLayer span')]
      const anns = (await (await window.__h.composed.getPage(1)).getAnnotations()).filter((a) => a.subtype === 'Link')
      return [...s.querySelectorAll('a.axt-link')].map((a) => {
        const r = a.getBoundingClientRect()
        const under = spans
          .filter((x) => {
            const q = x.getBoundingClientRect()
            const cx = q.left + q.width / 2,
              cy = q.top + q.height / 2
            return q.width && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom
          })
          .map((x) => x.textContent)
          .join(' ')
        const to = a.getAttribute('href')
        const ann = anns.find((x) => (x.url ?? '') === to || (to.startsWith('#') && !x.url))
        return {
          name: a.getAttribute('aria-label'),
          under: under.replace(/\s+/g, ' ').trim(),
          border: a.dataset.axtBorder ?? null,
          pdfBorder: !!(ann && ann.borderStyle?.width > 0 && ann.color),
          href: to,
          rect: r.toJSON(),
        }
      })
    })
    const box = links[0].rect
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(100)
    const wash = await page.evaluate(
      () =>
        getComputedStyle(
          window.__h.panes.right.page(1).querySelector('a.axt-link:hover > .axt-link-box') ?? document.body,
        ).backgroundColor,
    )
    const ring = await page.evaluate(() => {
      const a = window.__h.panes.right.page(1).querySelector('a.axt-link')
      a.focus({ focusVisible: true })
      const b = getComputedStyle(a.querySelector('.axt-link-box'))
      return { width: b.outlineWidth, style: b.outlineStyle }
    })
    // (a click on the link inside the paper: no levelling; the right jumps, the left follows)
    const inner = links.find((l) => l.href.startsWith('#'))
    const line0 = await page.evaluate(() => window.__h.panes.probe().readingLine)
    await page.mouse.click(inner.rect.x + inner.rect.width / 2, inner.rect.y + inner.rect.height / 2)
    await page.waitForTimeout(900)
    const after = await page.evaluate(() => ({
      line: window.__h.panes.probe().readingLine,
      level: window.__h.panes.probe().levelError,
      inView2: window.__h.panes.right.inView(2),
      top: document.querySelector('.axt-pane.right').scrollTop,
    }))
    // (by the keyboard: Enter on the link, the focus at the place jumped to)
    await page.evaluate(() => {
      document.querySelector('.axt-pane.right').scrollTop = 0
    })
    await page.waitForTimeout(400)
    await page.evaluate(() => window.__h.panes.right.page(1).querySelector('a.axt-link[href^="#"]').focus())
    await page.keyboard.press('Enter')
    await page.waitForTimeout(900)
    const focus = await page.evaluate(() => ({
      page: document.activeElement?.dataset?.pageNumber ?? null,
      cls: document.activeElement?.className ?? null,
    }))
    await context.close()
    assert(!errors.length, errors.join('; '))
    for (const l of links) {
      assert(
        l.name && (l.under ? l.name === l.under || l.under.includes(l.name) || l.name.includes(l.under) : true),
        `named ${JSON.stringify(l)}`,
      )
      assert(!!l.border === l.pdfBorder, `border ${JSON.stringify(l)}`)
    }
    assert(/255, 255, 0, 0\.2/.test(wash), `the wash ${wash}`)
    assert(ring.width === '2px' && ring.style === 'solid', `the ring ${JSON.stringify(ring)}`)
    assert(after.line === line0, `a click on a link levelled: ${line0} → ${after.line}`)
    // (a document this short ends before page 2 can stand at the top: the jump brings it into view, the left levelled)
    assert(after.inView2 && after.top > 0 && Math.abs(after.level ?? 0) <= 2, `the jump: ${JSON.stringify(after)}`)
    assert(focus.page === '2', `the keyboard's jump: the focus on ${JSON.stringify(focus)}`)
    // (the system's colours in forced colours)
    const fc = await newPage()
    await fc.page.emulateMedia({ forcedColors: 'active' })
    await fc.page.evaluate((u) => window.__h.open(u), S1)
    await fc.page.evaluate(() => window.__h.layer('s1-columns'))
    await laidShown(fc.page, 1)
    const forced = await fc.page.evaluate(() => {
      const a = window.__h.panes.right.page(1).querySelector('a.axt-link')
      a.focus({ focusVisible: true })
      const b = getComputedStyle(a.querySelector('.axt-link-box'))
      return { width: b.outlineWidth, shadow: b.boxShadow }
    })
    await fc.context.close()
    assert(forced.width === '2px' && forced.shadow === 'none', `forced colours ${JSON.stringify(forced)}`)
    return { links: links.map((l) => l.name), wash }
  },
)

await check(
  'port: the highlight: its switch, the right mirroring until laid and drawn again as laid under a resting pointer, a scroll under a still pointer, a click holding nothing, the wash multiplied and screened, through a pinch and the left redrawn (B-409, B-217, B-472, B-478, B-453, B-451, B-411, B-446, B-447, B-136, A-224, B-241, B-448, B-459)',
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), S1)
    await page.evaluate(() => window.__h.layer('s1-columns', { rows: 'none' }))
    await page.waitForTimeout(400)
    const ords = await page.evaluate(() =>
      window.__h.composer
        .page(1)
        .members.map((m) => m.ord)
        .slice(0, 6),
    )
    const lit = () =>
      page.evaluate(() => ({ lit: window.__h.highlight.lit?.id ?? null, bands: window.__h.highlight.bands() }))
    // (off: nothing lit; on: the point lights)
    await page.evaluate(() => window.__h.highlight.setOn(false))
    const p0 = await page.evaluate(([o]) => window.__h.pointOf(1, o, 'right'), [ords[1]])
    await page.mouse.move(p0.x, p0.y)
    await page.waitForTimeout(120)
    const off = await lit()
    await page.evaluate(() => window.__h.highlight.setOn(true))
    await page.mouse.move(p0.x + 1, p0.y)
    await page.waitForTimeout(120)
    const mirrored = await lit()
    // (rows in under the resting pointer: drawn again as laid)
    await page.evaluate(() => window.__h.rows.give())
    await laidShown(page, 1)
    await page.waitForTimeout(250)
    const laid = await lit()
    // (a scroll under the still pointer lights what comes under it: two members of one column, the pane scrolled down by their
    // gap, the pointer on the lower one, then scrolled back up: the upper one comes under it)
    await page.evaluate(() => (document.querySelector('.axt-pane.right').scrollTop = 0))
    await page.waitForTimeout(250)
    const pick = await page.evaluate(() => {
      const c = document.querySelector('.axt-pane.right'),
        cr = c.getBoundingClientRect(),
        max = c.scrollHeight - c.clientHeight
      const pts = window.__h.composer
        .laid(1)
        .members.map((m) => ({ o: m.ord, p: window.__h.pointOf(1, m.ord, 'right') }))
        .filter((x) => x.p && x.p.y > cr.top + 20 && x.p.y < cr.bottom - 20)
      for (const A of pts)
        for (const B of pts)
          if (B.o !== A.o && Math.abs(B.p.x - A.p.x) < 80 && A.p.y - B.p.y > 30 && A.p.y - B.p.y <= max)
            return { A: A.p, a: A.o, B: B.p, b: B.o }
      return null
    })
    assert(pick, 'no two members to scroll between')
    const dy = pick.A.y - pick.B.y
    await page.evaluate(([dy]) => (document.querySelector('.axt-pane.right').scrollTop = dy), [dy])
    await page.waitForTimeout(250)
    await page.mouse.move(pick.A.x, pick.A.y - dy)
    await page.waitForTimeout(150)
    await page.evaluate(() => (document.querySelector('.axt-pane.right').scrollTop = 0))
    await page.waitForTimeout(250)
    const scrolled = {
      ...(await lit()),
      under: await page.evaluate(
        ([x, y]) => window.__h.highlight.at('right', x, y)?.id ?? null,
        [pick.A.x, pick.A.y - dy],
      ),
      a: pick.a,
      b: pick.b,
    }
    await page.evaluate(() => (document.querySelector('.axt-pane.right').scrollTop = 0))
    await page.waitForTimeout(250)
    // (a click holds nothing)
    const pc = await page.evaluate(([o]) => window.__h.pointOf(1, o, 'right'), [ords[1]])
    await page.mouse.click(pc.x, pc.y)
    await page.mouse.move(3, 3)
    await page.waitForTimeout(300)
    const released = await lit()
    // (the wash's blend)
    const blend = await page.evaluate(() => {
      const l = document.querySelector('.axt-pane.right .axt-hl-layer')
      const a = getComputedStyle(l).mixBlendMode
      document.getElementById('root').setAttribute('data-axt-dim', '')
      const b = getComputedStyle(l).mixBlendMode
      document.getElementById('root').removeAttribute('data-axt-dim')
      return [a, b]
    })
    await page.evaluate(() => (document.querySelector('.axt-pane.right').scrollTop = 0))
    await page.waitForTimeout(300)
    // (through a pinch: the band where its unit is, within 0.7 px; the point lights through the preview's transform)
    const q = await page.evaluate(([o]) => window.__h.pointOf(1, o, 'right'), [ords[2]])
    await page.mouse.move(q.x, q.y)
    await page.waitForTimeout(150)
    const share = () =>
      page.evaluate(() => {
        const s = window.__h.panes.right.page(1).getBoundingClientRect()
        const b = document.querySelector('.axt-pane.right .axt-hl-layer > *').getBoundingClientRect()
        return [(b.left - s.left) / s.width, (b.top - s.top) / s.height, b.width / s.width, s.width]
      })
    const s0 = await share()
    await page.evaluate(
      ([x, y]) => {
        for (let i = 0; i < 4; i++) window.__h.panes.pinch('right', 1.05, [x, y])
      },
      [q.x, q.y],
    )
    await page.waitForTimeout(50)
    const s1 = await share()
    const during = await page.evaluate(([x, y]) => window.__h.highlight.at('right', x, y)?.id ?? null, [q.x, q.y])
    await page.waitForTimeout(600)
    // (the left's page redrawn after a zoom keeps its layer: lit with the pointer away from the panes, so that the zoom's scroll
    // brings nothing else under it)
    await page.evaluate(() => {
      for (const c of document.querySelectorAll('.axt-pane')) c.dispatchEvent(new MouseEvent('mouseleave'))
    })
    await page.waitForTimeout(250)
    await page.evaluate(([o]) => window.__h.highlight.light({ id: o, s: -1 }), [ords[2]])
    const gaps = await page.evaluate(async () => {
      window.__h.panes.zoomBy(1.2)
      let missing = 0
      for (let i = 0; i < 24; i++) {
        await new Promise((f) => requestAnimationFrame(f))
        if (!document.querySelector('.axt-pane.left .page[data-page-number="1"] > .axt-hl-layer > *')) missing++
      }
      return missing
    })
    // (a sweep: one look a frame, each look's script)
    const sweep = await page.evaluate(async () => {
      const r = window.__h.panes.right.page(1).getBoundingClientRect()
      const c0 = window.__h.highlight.costs().looks
      let frames = 0
      for (let i = 0; i < 40; i++) {
        for (let k = 0; k < 3; k++)
          document.querySelector('.axt-pane.right').dispatchEvent(
            new MouseEvent('mousemove', {
              clientX: r.left + 40 + i * 10 + k,
              clientY: r.top + 80 + i * 12,
              bubbles: true,
            }),
          )
        await new Promise((f) => requestAnimationFrame(f))
        frames++
      }
      const c = window.__h.highlight.costs()
      const ms = c.ms.slice(-40).sort((a, b) => a - b)
      return { looks: c.looks - c0, frames, p50: ms[Math.floor(ms.length / 2)] }
    })
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(off.lit === null && off.bands.right === 0, `off lit ${JSON.stringify(off)}`)
    assert(
      mirrored.lit === ords[1] && mirrored.bands.right === mirrored.bands.left,
      `mirrored ${JSON.stringify(mirrored)}`,
    )
    assert(laid.lit === ords[1] && laid.bands.right > 0, `drawn again as laid ${JSON.stringify(laid)}`)
    assert(scrolled.under === scrolled.b && scrolled.lit === scrolled.b, `the scroll lit ${JSON.stringify(scrolled)}`)
    assert(released.lit === null, `a click held ${JSON.stringify(released)}`)
    assert(blend[0] === 'multiply' && blend[1] === 'screen', `the wash ${blend}`)
    assert(
      Math.abs(s1[0] - s0[0]) * s1[3] < 0.7 &&
        Math.abs(s1[1] - s0[1]) * s1[3] < 0.7 &&
        Math.abs(s1[2] - s0[2]) * s1[3] < 0.7,
      `the band in a pinch ${JSON.stringify([s0, s1])}`,
    )
    assert(during === ords[2], `the pointer through the preview lit ${during}`)
    assert(gaps === 0, `the left's band missing ${gaps} frames of the redraw`)
    assert(sweep.looks <= sweep.frames && sweep.p50 <= 0.26, `the sweep ${JSON.stringify(sweep)}`)
    return { sweep }
  },
)

await check('port: the smaller unit lights where two overlap (B-444, s2-splits)', async () => {
  const { page, context, errors } = await newPage()
  await page.evaluate((u) => window.__h.open(u), indexOf['s2-splits'].original)
  await page.evaluate(() => window.__h.layer('s2-splits'))
  await laidShown(page, 1)
  await page.waitForTimeout(300)
  const heads = await page.evaluate(() =>
    window.__h.composer
      .laid(1)
      .members.filter((m) => window.__h.composer.member(m.ord)?.kind === 'heading')
      .map((m) => m.ord),
  )
  const out = []
  for (const side of ['right', 'left'])
    for (const o of heads.slice(1, 5)) {
      const pt = await page.evaluate(([o, s]) => window.__h.pointOf(1, o, s), [o, side])
      if (!pt) continue
      out.push({
        side,
        o,
        hit: await page.evaluate(([s, x, y]) => window.__h.highlight.at(s, x, y)?.id ?? null, [side, pt.x, pt.y]),
      })
    }
  await context.close()
  assert(!errors.length, errors.join('; '))
  assert(out.length && out.every((x) => x.hit === x.o), `hits ${JSON.stringify(out)}`)
  return { heads: out.length }
})

await check(
  "port: the panes: three displays, swapped, the single display's fit at 1060 px, the right alone fitted to its pane, the page told by pagechanging, the sync available once the pages exist (A-022, A-027, A-032, A-145, B-234, B-236)",
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), SAMPLE)
    await drawnOn(page, 'right', 1, null)
    const panesOf = () =>
      page.evaluate(() => {
        const r = (s) => document.querySelector(`.axt-pane.${s}`).getBoundingClientRect()
        const vis = (s) =>
          getComputedStyle(document.querySelector(`.axt-pane.${s}`)).visibility !== 'hidden' &&
          getComputedStyle(document.querySelector(`.axt-pane.${s}`)).display !== 'none' &&
          r(s).width > 0
        return {
          mode: document.getElementById('root').getAttribute('data-axt-pdf-mode'),
          left: vis('left') ? [r('left').left, r('left').width] : null,
          right: vis('right') ? [r('right').left, r('right').width] : null,
          leftPage: window.__h.panes.pageElement('left', 1)?.clientWidth ?? 0,
          rightPage: window.__h.panes.pageElement('right', 1)?.clientWidth ?? 0,
        }
      })
    const bi = await panesOf()
    await page.evaluate(() => window.__h.panes.setSwapped(true))
    const sw = await panesOf()
    await page.evaluate(() => window.__h.panes.setSwapped(false))
    await page.evaluate(() => window.__h.panes.setDisplay('original'))
    await page.waitForTimeout(800)
    const orig = await panesOf()
    await page.evaluate(() => window.__h.panes.setDisplay('translation'))
    await page.waitForTimeout(800)
    const tr = await panesOf()
    await page.evaluate(() => window.__h.panes.setDisplay('bilingual'))
    await page.waitForTimeout(800)
    await page.evaluate(() => window.__h.panes.goToPage('left', 3))
    await page.waitForTimeout(500)
    const told = await page.evaluate(() => ({
      viewer: window.__h.panes.leftViewer.currentPageNumber,
      told: window.__h.marks.filter((m) => m.what === 'page' && m.side === 'left').at(-1)?.page,
      sync: window.__h.marks.filter((m) => m.what === 'sync').map((m) => m.available),
    }))
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(
      bi.mode === 'bilingual' && bi.left && bi.right && bi.left[0] < bi.right[0],
      `bilingual ${JSON.stringify(bi)}`,
    )
    assert(sw.right[0] < sw.left[0], `swapped ${JSON.stringify(sw)}`)
    assert(orig.mode === 'original' && orig.left && !orig.right, `original ${JSON.stringify(orig)}`)
    assert(Math.abs(orig.leftPage - Math.min(1060, orig.left[1] - 40)) < 2, `the single fit ${JSON.stringify(orig)}`)
    assert(tr.mode === 'translation' && tr.right && !tr.left, `translation ${JSON.stringify(tr)}`)
    assert(Math.abs(tr.rightPage - Math.min(1060, tr.right[1] - 40)) < 2, `the right alone ${JSON.stringify(tr)}`)
    assert(told.viewer === 3 && told.told === 3, `the page told ${JSON.stringify(told)}`)
    assert(told.sync.length && told.sync.at(-1) === true, `the sync ${JSON.stringify(told.sync)}`)
    return { single: orig.leftPage, alone: tr.rightPage }
  },
)

await check(
  "port: the follower: the right by the left's steps on the compositor, levelled at rest (a timer where no scrollend comes); a click levels the same point; a zoom's steps drawn once 400 ms after the last; a zoom and a display keep the reading place (B-008, B-012, B-013, B-014, B-232, B-233, B-235, B-237, B-239, A-029, A-219)",
  async () => {
    const out = {}
    for (const end of ['native', 'timer']) {
      const { page, context, errors } = await newPage()
      await page.evaluate(([u, e]) => window.__h.open(u, { scrollEnd: e }), [SAMPLE, end])
      await drawnOn(page, 'right', 1, null)
      await page.mouse.move(350, 400)
      await page.mouse.wheel(0, 900)
      await page.waitForTimeout(900)
      const rest = await page.evaluate(() => window.__h.panes.probe())
      // (the left drew what its pages show while the right's transform led: PDF.js picks its pages by its own scroll)
      const leftDrawn = await page.evaluate(() => {
        const n = window.__h.panes.pageOf('left')
        return window.__h.panes.leftViewer.getPageView(n - 1)?.renderingState
      })
      out[end] = { level: rest.levelError, compositing: rest.compositing, leftDrawn }
      if (end === 'timer') {
        await context.close()
        assert(!errors.length, errors.join('; '))
        continue
      }
      // (a click levels the same point at the click's height)
      await page.mouse.click(300, 500)
      await page.waitForTimeout(500)
      const click = await page.evaluate(() => {
        const n = window.__h.panes.pageOf('left')
        const a = window.__h.panes.pageElement('left', n).getBoundingClientRect(),
          b = window.__h.panes.pageElement('right', n).getBoundingClientRect()
        return { dy: Math.abs(a.top - b.top), line: window.__h.panes.probe().readingLine }
      })
      // (a zoom's steps: drawn once, after the last)
      const m0 = await page.evaluate(() => window.__h.marks.length)
      const place0 = await page.evaluate(() => window.__h.panes.reading())
      const tLast = await page.evaluate(async () => {
        let at = 0
        for (let i = 0; i < 3; i++) {
          if (i) await new Promise((f) => setTimeout(f, 60))
          window.__h.panes.zoomBy(1.1)
          at = performance.now() - window.__h.t0
        }
        return at
      })
      await page.waitForTimeout(1200)
      const draws = await page.evaluate(
        ([m0]) =>
          window.__h.marks
            .slice(m0)
            .filter((m) => m.what === 'drawn' && m.side === 'right' && m.page === window.__h.panes.pageOf('right'))
            .map((m) => ({ at: m.at, scale: m.scale })),
        [m0],
      )
      const place1 = await page.evaluate(() => ({
        p: window.__h.panes.reading(),
        level: window.__h.panes.probe().levelError,
      }))
      await page.evaluate(() => window.__h.panes.setDisplay('translation'))
      await page.waitForTimeout(800)
      const place2 = await page.evaluate(() => window.__h.panes.reading())
      await context.close()
      assert(!errors.length, errors.join('; '))
      out.click = click
      out.draws = draws
      out.lastStepAt = tLast
      out.places = [place0, place1.p, place2]
      out.zoomLevel = place1.level
    }
    for (const e of ['native', 'timer'])
      assert(Math.abs(out[e].level ?? 99) <= 2 && out[e].leftDrawn === 3, `${e}: ${JSON.stringify(out[e])}`)
    assert(out.native.compositing === true, 'no compositor follower in Chromium')
    assert(out.click.dy <= 1, `the click levelled ${JSON.stringify(out.click)}`)
    const final = out.draws.at(-1)?.scale
    const atFinal = out.draws.filter((d) => d.scale === final)
    assert(
      atFinal.length === 1 && atFinal[0].at >= out.lastStepAt + 380,
      `the steps drawn ${JSON.stringify(out.draws)} after ${out.lastStepAt}`,
    )
    assert(Math.abs(out.zoomLevel ?? 99) <= 2, `levelled after the zoom: ${out.zoomLevel}`)
    const [a, b, c] = out.places
    assert(
      a.page === b.page && Math.abs(a.at - b.at) < 0.03 && a.page === c.page && Math.abs(a.at - c.at) < 0.03,
      `the place ${JSON.stringify(out.places)}`,
    )
    return out
  },
)

await check(
  "port: the pinch: its steps in hundredths, its remainder carried, nothing drawn meanwhile, the point kept on both panes, another input commits it first, the paper's ends kept (A-215-A-218, A-220, A-222, B-027, B-010)",
  async () => {
    const { page, context, errors } = await newPage()
    await page.evaluate((u) => window.__h.open(u), SAMPLE)
    await drawnOn(page, 'right', 1, null)
    await page.evaluate(() => window.__h.panes.zoomTo(1))
    await page.waitForTimeout(800)
    // (the remainder carried: two pinches of 1.004 from 1 commit 1.00 then 1.01)
    const carry = []
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => {
        const r = document.querySelector('.axt-pane.right').getBoundingClientRect()
        window.__h.panes.pinch('right', 1.004, [r.left + 200, r.top + 200])
      })
      await page.waitForTimeout(450)
      carry.push(await page.evaluate(() => window.__h.panes.scale))
    }
    // (a pinch's steps: told in hundredths, nothing made, the point under the pointer kept on both panes)
    const r = await page.evaluate(async () => {
      const p = window.__h.panes,
        c = document.querySelector('.axt-pane.right'),
        cr = c.getBoundingClientRect()
      const x = cr.left + 250,
        y = cr.top + 300
      const pointOf = (side) => {
        const pane = document.querySelector(`.axt-pane.${side}`).getBoundingClientRect()
        const n = p.pageOf(side)
        const el = p.pageElement(side, n).getBoundingClientRect()
        return [n, (pane.left + 250 - el.left) / el.width, (pane.top + 300 - el.top) / el.height]
      }
      const before = { right: pointOf('right'), left: pointOf('left') }
      const m0 = window.__h.marks.length,
        made0 = p.right.probe().made
      for (let i = 0; i < 6; i++) {
        p.pinch('right', 1.07, [x, y])
        await new Promise((f) => requestAnimationFrame(f))
      }
      const made1 = p.right.probe().made
      const scales = window.__h.marks
        .slice(m0)
        .filter((m) => m.what === 'scale')
        .map((m) => m.scale)
      await new Promise((f) => setTimeout(f, 700))
      return {
        before,
        after: { right: pointOf('right'), left: pointOf('left') },
        made: made1 - made0,
        scales,
        pinching: p.probe().pinching,
      }
    })
    // (another input commits the pinch first)
    const commit = await page.evaluate(() => {
      const p = window.__h.panes,
        cr = document.querySelector('.axt-pane.right').getBoundingClientRect()
      p.pinch('right', 1.1, [cr.left + 100, cr.top + 100])
      const was = p.probe().pinching
      p.zoomBy(1)
      return { was, now: p.probe().pinching }
    })
    await page.waitForTimeout(600)
    // (at the paper's end, a pinch in: the end is the paper's, never an empty foot)
    const foot = await page.evaluate(async () => {
      const p = window.__h.panes,
        c = document.querySelector('.axt-pane.right')
      c.scrollTop = c.scrollHeight
      await new Promise((f) => setTimeout(f, 300))
      const cr = c.getBoundingClientRect()
      for (let i = 0; i < 4; i++) {
        p.pinch('right', 0.9, [cr.left + 200, cr.bottom - 50])
        await new Promise((f) => requestAnimationFrame(f))
      }
      await new Promise((f) => setTimeout(f, 700))
      const last = p.pageElement('right', p.right.pages).getBoundingClientRect()
      return { over: c.scrollTop - (c.scrollHeight - c.clientHeight), gap: cr.bottom - last.bottom }
    })
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(carry[0] === 1 && carry[1] === 1.01, `the remainder: ${carry}`)
    assert(r.scales.length && r.scales.every((s) => Math.round(s * 100) / 100 === s), `the steps ${r.scales}`)
    assert(r.made === 0 && r.pinching === null, `made during ${r.made}, pinching ${r.pinching}`)
    for (const side of ['right', 'left']) {
      const [n0, x0, y0] = r.before[side],
        [n1, x1, y1] = r.after[side]
      assert(
        n0 === n1 && Math.abs(x0 - x1) < 0.01 && Math.abs(y0 - y1) < 0.01,
        `${side}'s point ${JSON.stringify([r.before[side], r.after[side]])}`,
      )
    }
    assert(commit.was !== null && commit.now === null, `another input ${JSON.stringify(commit)}`)
    assert(foot.over <= 1 && foot.gap >= 0, `the foot ${JSON.stringify(foot)}`)
    return { carry, steps: r.scales.length }
  },
)

await check(
  "port: the left's internals pinned, its root write quiet, the pages ahead held until the layer's first page or let go (B-149, B-019, B-047, B-050, B-231, B-017)",
  async () => {
    const { page, context, errors } = await newPage({ viewport: { width: 1400, height: 600 } })
    await page.evaluate((u) => window.__h.open(u), SAMPLE)
    await drawnOn(page, 'right', 1, null)
    const pins = await page.evaluate(() => {
      const k = window.__h.kit,
        v = window.__h.panes.leftViewer,
        pv = v.getPageView(0)
      return {
        visible:
          typeof Object.getPrototypeOf(v)._getVisiblePages === 'function' || typeof v._getVisiblePages === 'function',
        renderingState: typeof pv.renderingState === 'number',
        updateVisibleArea: typeof k.viewer.PDFPageView.prototype.updateVisibleArea === 'function',
        detailView: 'detailView' in pv,
        outputScale: 'outputScale' in pv,
        rawDims: !!pv.viewport.rawDims,
        builder: typeof k.viewer.TextLayerBuilder === 'function',
        root: document.documentElement.style.getPropertyValue('--viewer-container-height'),
        held: window.__h.panes.aheadHeld,
      }
    })
    // (at the open: page 2 near the view, not in it, on both panes: neither drawn until the pages ahead are let go)
    await page.waitForTimeout(1200)
    const state = (near) =>
      page.evaluate(
        ([near]) => ({
          right: near.filter((n) =>
            window.__h.marks.some((m) => m.what === 'drawn' && m.side === 'right' && m.page === n),
          ),
          left: near.filter((n) => window.__h.panes.leftViewer.getPageView(n - 1)?.renderingState === 3),
        }),
        [near],
      )
    const near = await page.evaluate(() =>
      [1, 2, 3, 4].filter((n) => window.__h.panes.right.near(n) && !window.__h.panes.right.inView(n)),
    )
    const before = await state(near)
    const held = {
      near,
      drawn: before.right,
      left: before.left,
      held: await page.evaluate(() => window.__h.panes.aheadHeld),
    }
    await page.evaluate(() => window.__h.panes.letAheadGo())
    await page.waitForTimeout(1500)
    const after = await state(near)
    const go = after.right
    await context.close()
    assert(!errors.length, errors.join('; '))
    for (const [k, v] of Object.entries(pins)) if (k !== 'root' && k !== 'held') assert(v === true, `pin ${k}`)
    assert(pins.root === '' && pins.held === true, `the root ${JSON.stringify(pins)}`)
    assert(
      held.near.length && held.drawn.length === 0 && held.left.length === 0 && held.held,
      `held ${JSON.stringify(held)}`,
    )
    assert(
      go.length === held.near.length && after.left.length === held.near.length,
      `let go: ${JSON.stringify(after)} of ${held.near}`,
    )
    return { near: held.near }
  },
)

await check(
  "port: a laid page's text layer paints nothing, one copy for find and assistive technology, the paper's language with the translation's spans the target's, its cost; its commit writes nothing on the root (B-386, B-398, B-400, B-407, A-333, B-023)",
  async () => {
    const { page, context, errors } = await newPage({ dpr: 2 })
    await page.evaluate((u) => window.__h.open(u), S1)
    await page.evaluate(() => {
      window.__h.rootWrites = 0
      new MutationObserver((rs) => (window.__h.rootWrites += rs.length)).observe(document.getElementById('root'), {
        attributes: true,
      })
      new MutationObserver((rs) => (window.__h.rootWrites += rs.length)).observe(document.documentElement, {
        attributes: true,
      })
      return 0
    })
    await page.evaluate(() => window.__h.layer('s1-columns'))
    await laidShown(page, 1)
    const writes = await page.evaluate(() => window.__h.rootWrites)
    await page.waitForTimeout(400)
    const slot = page.locator('.axt-pane.right .axt-slot[data-page-number="1"] > .axt-slot-view')
    const a = await slot.screenshot({ animations: 'disabled' })
    await page.evaluate(() => {
      for (const t of document.querySelectorAll('.axt-pane.right .axt-over .textLayer')) t.style.visibility = 'hidden'
    })
    const b = await slot.screenshot({ animations: 'disabled' })
    await page.evaluate(() => {
      for (const t of document.querySelectorAll('.axt-pane.right .axt-over .textLayer')) t.style.visibility = ''
    })
    const r = await page.evaluate(() => {
      const s = window.__h.panes.right.page(1)
      const tl = s.querySelector('.axt-over .textLayer'),
        svg = s.querySelector('.axt-over > svg')
      const translated = [...tl.querySelectorAll('span[lang="de"]')].map((x) => x.textContent)
      const word = (translated.find((t) => t.trim().length > 6) ?? '').trim().split(/\s+/)[0]
      getSelection().removeAllRanges()
      const found = window.find(word)
      const at = getSelection().anchorNode?.parentElement?.closest('.textLayer') === tl
      return {
        lang: tl.getAttribute('lang'),
        translated: translated.length,
        svgHidden: svg.getAttribute('aria-hidden'),
        svgSelect: getComputedStyle(svg).userSelect,
        word,
        found,
        at,
        nodes: tl.querySelectorAll('*').length,
        textMs: window.__h.composer.timings().find((t) => t.n === 1)?.textMs ?? null,
      }
    })
    const tree = await page.locator('.axt-pane.right .axt-slot[data-page-number="1"]').ariaSnapshot()
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(writes === 0, `the commit wrote ${writes} attributes on the root`)
    assert(a.equals(b), 'the text layer changed the paint')
    assert(r.lang === 'en' && r.translated > 0, `langs ${JSON.stringify(r)}`)
    assert(r.svgHidden === 'true' && r.svgSelect === 'none' && r.found && r.at, `one copy ${JSON.stringify(r)}`)
    const times = tree.split(r.word).length - 1
    assert(times === 1, `the word "${r.word}" ${times} times in the accessibility tree`)
    assert(r.nodes <= 2000, `nodes ${r.nodes}`)
    return { nodes: r.nodes, textMs: Math.round(r.textMs * 10) / 10 }
  },
)

await check(
  "port: a host's scrollers keep their own .pdfViewer, one a pane, left in place emptied on close (the lane owner's)",
  async () => {
    const { page, context, errors } = await newPage()
    const r = await page.evaluate(async () => {
      const root = document.createElement('div')
      root.style.cssText = 'position:absolute;inset:0'
      const left = document.createElement('div'),
        right = document.createElement('div')
      for (const [el, id] of [
        [left, 'left'],
        [right, 'right'],
      ]) {
        el.className = `viewerContainer axt-pane ${id}`
        el.id = id
        el.append(Object.assign(document.createElement('div'), { className: 'pdfViewer' }))
        root.append(el)
      }
      document.body.append(root)
      window.__h.given = { root, left, right }
      return true
    })
    await page.evaluate(() => window.__h.reader('s1-columns', { host: 'web', panes: window.__h.given }))
    await readerLaid(page)
    const open = await page.evaluate(() => [
      window.__h.given.left.querySelectorAll(':scope > .pdfViewer').length,
      window.__h.given.right.querySelectorAll(':scope > .pdfViewer').length,
      window.__h.given.right.querySelector(':scope > .pdfViewer').children.length,
    ])
    await page.evaluate(() => window.__h.readers[0].reader.close())
    await page.waitForTimeout(500)
    const closed = await page.evaluate(() => [
      window.__h.given.left.querySelectorAll(':scope > .pdfViewer').length,
      window.__h.given.right.querySelectorAll(':scope > .pdfViewer').length,
      window.__h.given.right.querySelector(':scope > .pdfViewer')?.children.length ?? -1,
    ])
    await context.close()
    assert(!errors.length, errors.join('; '))
    assert(r && open[0] === 1 && open[1] === 1 && open[2] > 0, `open ${open}`)
    assert(closed[0] === 1 && closed[1] === 1 && closed[2] === 0, `closed ${closed}`)
    return { open, closed }
  },
)

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
