// lab/pdf/layer-lab/smoke.mjs
// The layer lab runs: its server starts (with this process's environment: the gate's inputs where LAYER_FIXTURES and
// the others name them), and in Chromium (Playwright's) every fixture's Original, Final and quick (v0) views draw their
// first page (a screenshot of each, and ink on each canvas; v0's text over its copy, with no banner), and the Layer view
// draws: its layer where the engine's entry is there (text in the role table's faces over the copy), else its not-ready
// state over arXiv's page. A fixture with no final.pdf is not checked on Final: the lab only reads finals.
//   node lab/pdf/layer-lab/smoke.mjs [<fixture> …] [--port=8094]
// Screenshots go to data/layer-lab/shots/ (git-ignored with the rest of data/: they show the papers).
// Exits 1 on a view that does not draw.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

const here = new URL('.', import.meta.url).pathname
const root = resolve(here, '..')
const SHOTS = join(process.env.AXT_DATA ?? join(root, 'data'), 'layer-lab/shots')
const PORT = Number(process.argv.find(a => a.startsWith('--port='))?.slice(7) ?? 8094)
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
const BASE = `http://127.0.0.1:${PORT}/`

const server = spawn(process.execPath, [join(here, 'serve.mjs'), `--port=${PORT}`], { stdio: ['ignore', 'pipe', 'inherit'] })
await new Promise((ok, fail) => {
  server.stdout.on('data', d => { if (String(d).includes('layer lab:')) ok() })
  server.on('exit', code => fail(new Error(`serve.mjs exited ${code}`)))
})
let failed = 0
const row = (ok, what, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`) }
const browser = await chromium.launch()
try {
  const all = await (await fetch(`${BASE}api/fixtures`)).json()
  const fixtures = named.length ? all.filter(f => named.includes(f.name)) : all
  row(fixtures.length > 0, 'fixtures served', `${fixtures.length} of ${all.length}`)
  mkdirSync(SHOTS, { recursive: true })
  /** a view of a fixture, its first page in the left pane (and the right), one page at 100 %: whether each drew */
  async function look(f, a, b, shot) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
    const errors = []
    page.on('pageerror', e => errors.push(String(e.message ?? e)))
    try {
      await page.goto(`${BASE}#${new URLSearchParams({ f: f.name, a, b, p: '1', z: '1', s: 'single' })}`)
      await page.waitForSelector('html[data-ready="1"]', { timeout: 120_000 })
      const drawn = async side => {
        const sel = `#pane-${side} .page[data-rendered="1"]`
        try { await page.waitForSelector(sel, { timeout: 120_000 }) } catch { return { drawn: false } }
        return page.evaluate(sel => {
          const c = document.querySelector(`${sel} canvas`)
          const ctx = c.getContext('2d', { willReadFrequently: true })
          const d = ctx.getImageData(0, 0, c.width, c.height).data
          let ink = 0
          for (let i = 0; i < d.length; i += 4 * 7) if (d[i] < 128) ink++
          const b = document.querySelector(`${sel} .banner`), banner = b?.textContent ?? null, bannerKind = b?.dataset.kind ?? null
          const texts = document.querySelectorAll(`${sel} svg.layer-text text`).length, v0texts = document.querySelectorAll(`${sel} svg.tl text`).length
          return { drawn: true, ink, banner, bannerKind, texts, v0texts }
        }, sel)
      }
      const out = { a: await drawn('a'), b: b ? await drawn('b') : null, errors }
      const file = join(SHOTS, `${shot}.png`)
      await page.screenshot({ path: file })
      return out
    } finally { await page.close() }
  }
  for (const f of fixtures) {
    const r = await look(f, 'original', f.files.includes('final.pdf') ? 'final' : null, `${f.name}-original-final`)
    row(r.a.drawn && r.a.ink > 100, `${f.name} Original`, r.a.drawn ? `${r.a.ink} ink samples` : 'not drawn')
    if (f.files.includes('final.pdf')) row(r.b.drawn && r.b.ink > 100, `${f.name} Final`, r.b.drawn ? `${r.b.ink} ink samples, ${f.final?.strategy ?? '-'}` : 'not drawn')
    else console.log(`skip ${f.name} Final: no final.pdf`)
    if (r.errors.length) row(false, `${f.name} page errors`, r.errors.join(' | ').slice(0, 300))
  }
  // the Layer view: drawn where the entry is there, its not-ready state where it is not
  for (const f of fixtures.slice(0, named.length ? fixtures.length : 1)) {
    const r = await look(f, 'layer', 'original', `${f.name}-layer`)
    const engine = await (async () => { const res = await fetch(`${BASE}src/pdf-reader/engine/layer/layer.mjs`); return res.ok })()
    if (!engine) row(r.a.drawn && r.a.ink > 100 && r.a.bannerKind === 'not-ready', `${f.name} Layer (no engine entry)`, `${r.a.drawn ? 'drawn' : 'not drawn'}; banner: ${r.a.banner ?? 'none'}`)
    else row(r.a.drawn && r.a.ink > 100 && (r.a.texts > 0 || !!r.a.banner), `${f.name} Layer`, `${r.a.texts} text runs${r.a.banner ? `; banner: ${r.a.banner}` : ''}`)
    if (r.errors.length) row(false, `${f.name} Layer page errors`, r.errors.join(' | ').slice(0, 300))
  }
  // the v0 view, the instant layer as the integrated engine draws it: its text over the copy, no banner
  for (const f of fixtures) {
    const r = await look(f, 'v0', 'original', `${f.name}-v0`)
    row(r.a.drawn && r.a.ink > 100 && r.a.v0texts > 0 && !r.a.banner, `${f.name} Layer v0`, r.a.drawn ? `${r.a.v0texts} text runs${r.a.banner ? `; banner: ${r.a.banner}` : ''}` : 'not drawn')
    if (r.errors.length) row(false, `${f.name} Layer v0 page errors`, r.errors.join(' | ').slice(0, 300))
  }
} finally {
  await browser.close()
  server.kill()
}
console.log(`screenshots in ${SHOTS}`)
process.exitCode = failed ? 1 : 0
