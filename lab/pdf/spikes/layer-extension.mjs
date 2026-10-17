// The layer reader measured in the extension (Stage 5 Task 11): a real window on a build of the extension, against the build's
// own server (a staging build: `pnpm build:staging`), the paper's PDF from arXiv and
// its translation from the service the settings name (Microsoft's, the default). For each paper:
//   - the open: the original on screen, then the first page laid on the right; every unit with its row (the run's end);
//   - whether the layer was ready at the edge (a catalog at the first look) or prepared on the way (202s, a prepare);
//   - whether arXiv's bytes were the layer's base, or our copy was fetched and shown; what the composed document read (`basis`:
//     the left's bytes, or our copy by ranges where the ends decided before arXiv's whole file was in);
//   - the translation: rows a second, the time to the whole paper;
//   - the main thread's long tasks while the layer worked, and the JS heap and the renderer's resident memory at rest after it.
// A reading, not an assertion: it prints one JSON line a paper and a summary. Every request is the extension's own (the
// reader's: arXiv's PDF and abstract page, our server's layer API, the translation service); the browser runs with no
// profile of the reader's. It makes one prepare a paper at most (the reader's own rule, once a visit).
//
// Usage: node lab/pdf/spikes/layer-extension.mjs <id>v<n> [<id>v<n> …]   (AXT_EXT_DIR: another build; LANG_CODE: the target,
// an extension language code, default cmn; AXT_HEADED=1 watches it)
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BUILD, launchWithReader } from '../../../tests/e2e/lib/extension.mjs'

const papers = process.argv.slice(2)
if (!papers.length) throw new Error('usage: node lab/pdf/spikes/layer-extension.mjs <id>v<n> …')
const dir = process.env.AXT_EXT_DIR ?? BUILD
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
const lang = process.env.LANG_CODE ?? 'cmn'
const TIMEOUT = Number(process.env.AXT_TIMEOUT_MS ?? 600_000)
const sleep = ms => new Promise(r => setTimeout(r, ms))
/** the resident memory of the browser's renderers, in MB: the processes of the browser that runs this profile */
function rendererRss(profile) {
  try {
    const out = execFileSync('ps', ['-axo', 'rss=,command='], { encoding: 'utf8', maxBuffer: 1 << 24 })
    return Math.round(out.split('\n').filter(l => l.includes('--type=renderer') && l.includes(profile)).reduce((n, l) => n + Number(l.trim().split(/\s+/)[0] || 0), 0) / 1024)
  } catch { return null }
}

console.log(`build ${dir}: hosts ${(manifest.host_permissions ?? []).join(', ')}`)
const { context, worker, readerUrl } = await launchWithReader({ profile: 'layer-extension', extension: dir, headless: !process.env.AXT_HEADED, viewport: { width: 1440, height: 900 } })
for (let tries = 0; tries < 50 && !(await worker.evaluate(() => chrome.storage.local.get('config').then(r => !!r.config))); tries++) await sleep(200)
await worker.evaluate(async lang => { const { config } = await chrome.storage.local.get('config'); await chrome.storage.local.set({ config: { ...config, targetLanguage: lang } }) }, lang)
const rows = []
try {
  for (const paper of papers) {
    const page = await context.newPage()
    const t0 = Date.now()
    await page.goto(readerUrl({ paper, mode: 'bilingual' }))
    await page.waitForFunction(() => !!window.__reader?.controller, null, { timeout: 60_000 })
    await page.evaluate(() => {
      window.__m = { t0: performance.now(), phases: [], long: [] }
      const c = window.__reader.controller
      const tell = () => { const s = c.getState(); const p = s.phase; if (window.__m.phases.at(-1)?.[0] !== p) window.__m.phases.push([p, Math.round(performance.now() - window.__m.t0)]) }
      tell(); c.subscribe(tell)
      new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.long.push(Math.round(e.duration)) }).observe({ type: 'longtask' })
    })
    const at = fn => page.waitForFunction(fn, null, { timeout: TIMEOUT, polling: 100 }).then(() => Date.now() - t0, () => null)
    const opened = await at(() => window.__reader.view.probe().original === 'open')
    const firstLaid = await at(() => (window.__reader.side()?.probe().commits ?? 0) > 0)
    const done = await at(() => { const p = window.__reader.run?.probe(); return ['translated', 'failed'].includes(p?.rowsState) || ['unavailable', 'failed'].includes(p?.state) })
    await sleep(3000)
    const m = await page.evaluate(() => {
      const run = window.__reader.run?.probe() ?? null, side = window.__reader.side()?.probe() ?? null, s = window.__reader.controller.getState()
      return { run, side: side && { ready: side.ready, laid: side.laid, parts: side.parts, opens: side.opens, composed: side.composed }, phases: window.__m.phases, long: window.__m.long, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e5) / 10 : null, pages: s.sides.left.pages, unavailable: s.unavailable }
    })
    const prepared = m.phases.some(p => p[0] === 'preparing')
    const rowsPerSecond = m.run && done && firstLaid ? Math.round((m.run.rows / Math.max(1, (done - (opened ?? 0)) / 1000)) * 10) / 10 : null
    const row = { paper, pages: m.pages, opened, firstLaid, done, prepared, ours: m.run?.ours ?? null, basis: m.run?.basis ?? null, rows: m.run?.rows ?? null, total: m.run?.total ?? null, lost: m.run?.lost ?? null, rowsPerSecond, longest: Math.max(0, ...m.long), longTasks: m.long.length, heapMB: m.heapMB, rendererMB: rendererRss('layer-extension'), side: m.side, phases: m.phases, unavailable: m.unavailable }
    rows.push(row)
    console.log(JSON.stringify(row))
    await page.close()
  }
} finally {
  await context.close()
}
const of = (k, f) => rows.filter(f).map(r => r[k]).filter(v => typeof v === 'number')
const median = a => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : null)
console.log(JSON.stringify({ summary: true, papers: rows.length, ready: { first: median(of('firstLaid', r => !r.prepared)), done: median(of('done', r => !r.prepared)) }, prepared: { first: median(of('firstLaid', r => r.prepared)), done: median(of('done', r => r.prepared)) }, ours: rows.filter(r => r.ours).length, rendererMB: median(of('rendererMB', () => true)), longest: Math.max(0, ...of('longest', () => true)) }))
