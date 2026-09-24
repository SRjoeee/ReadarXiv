// The reader's interface in a real browser (the reader's design §4–§8, §13), on a demo paper, grown task by task in Part
// 3 of plans/2026-09-25-reader-interface.md. Exits non-zero on a failure or a page error; screenshots in out/reader-ui/.
// Build first; the demo papers made (spikes/reader-papers.mjs).
//   node experiments/pdf-bilingual/spikes/reader-ui.mjs
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launchWithReader } from './extension.mjs'

const root = new URL('..', import.meta.url).pathname
const out = join(root, 'out/reader-ui')
mkdirSync(out, { recursive: true })
const paper = '2608.02163'
const { context, readerUrl } = await launchWithReader({ profile: 'reader-ui', demos: true, viewport: { width: 1440, height: 900 } })
let failed = 0
const check = (what, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${detail}` : ''}`); if (!ok) failed++ }
async function open(query = {}, viewport) {
  const page = await context.newPage()
  if (viewport) await page.setViewportSize(viewport)
  page.on('pageerror', e => check('no page error', false, e.message))
  await page.goto(readerUrl({ paper, ...query }))
  await page.waitForFunction(() => window.__reader?.ready && window.__reader?.controller?.getState().settings, null, { timeout: 90000 })
  await page.waitForTimeout(600)
  return page
}
const state = page => page.evaluate(() => window.__reader.controller.getState())
const shot = (page, name) => page.screenshot({ path: join(out, `${name}.png`) })
/** a change of the settings, as a plain object merged one group deep (the extension's policy refuses eval) */
const patch = (page, change) => page.evaluate(p => window.__reader.controller.patchSettings(c => {
  const next = { ...c }
  for (const [k, v] of Object.entries(p)) next[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...c[k], ...v } : v
  return next
}), change)
const box = (page, selector) => page.evaluate(s => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height } }, selector)

// ---------------------------------------------------------------- Task 13: the frame
{
  const page = await open({ mode: 'bilingual' })
  const bar = await box(page, 'header[role="toolbar"]'), doc = await box(page, '.doc')
  check('the toolbar is 44 px, the document area under it', bar?.h === 44 && doc?.y === 44, JSON.stringify({ bar, doc }))
  const [l, r] = [await box(page, '.pane[data-side="left"]'), await box(page, '.pane[data-side="right"]')]
  check('side by side: two panes, an 8 px gutter', l && r && Math.round(r.x - (l.x + l.w)) === 8, JSON.stringify({ l, r }))
  // the viewers keep the browser's defaults: canvas, text layer and highlight layer share one rectangle in every page
  // a band lit on the first page, so that its highlight layer is there to be measured
  const layers = await page.evaluate(() => {
    const { debug } = window.__reader, id = [...debug.left.anchors.keys()].find(k => debug.left.anchors.get(k)?.rects?.[0]?.page === 1)
    debug.light(id)
    const p = document.querySelector('#left .page')
    return ['.canvasWrapper', '.textLayer', '.axt-hl-layer'].map(s => { const r = p.querySelector(s)?.getBoundingClientRect(); return r ? [r.x, r.y, r.width, r.height].map(Math.round).join(',') : null })
  })
  check('the page layers share one rectangle: canvas, text, highlight', layers.every(x => x !== null && x === layers[0]), JSON.stringify(layers))
  await page.evaluate(() => window.__reader.debug.light(null))
  await patch(page, { pdfReader: { swapped: true } })
  await page.waitForTimeout(400)
  const [l2, r2] = [await box(page, '.pane[data-side="left"]'), await box(page, '.pane[data-side="right"]')]
  check('swapped: the translation on the left', !!(l2 && r2) && r2.x < l2.x, JSON.stringify({ l2, r2 }))
  await patch(page, { pdfReader: { swapped: false, appearance: 'dark', dimPages: true } })
  await page.waitForTimeout(600)
  const dark = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, dim: document.documentElement.hasAttribute('data-axt-dim'), filter: getComputedStyle(document.querySelector('#left .page canvas')).filter, blend: (() => { window.__reader.debug.light(3); const b = document.querySelector('.axt-hl'); return b && getComputedStyle(b).mixBlendMode })() }))
  check('dark: the theme, the canvas inverted, the band screened', dark.theme === 'dark' && dark.dim && /invert/.test(dark.filter) && dark.blend === 'screen', JSON.stringify(dark))
  await shot(page, '13-dark-bilingual')
  await patch(page, { pdfReader: { appearance: 'system', dimPages: true } })
  await page.close()
}
{
  const page = await open({ mode: 'translation' })
  const pane = await box(page, '.pane[data-side="right"]'), pg = await box(page, '#right .page')
  check('one display: the pane spans the window', pane?.w === 1440, JSON.stringify(pane))
  check('one display: fit width stops at a reading width', pg && pg.w <= 1062 && pg.w >= 1000, JSON.stringify(pg))
  await shot(page, '13-translation')
  await page.close()
}

console.log(failed ? `${failed} failed` : 'all passed')
await context.close()
process.exit(failed ? 1 : 0)
