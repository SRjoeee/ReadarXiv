// The reader's pixels, before and after its tokens and controls move to the shared ones (the redesign's design, §2.4).
// `--baseline` records the reader as the build draws it now: the chrome's screenshots and the root's computed tokens,
// in light and dark — the toolbar, its menus and tooltip, the status capsule (a notice with its retry and close), the
// card of a translation that failed and the card of an address with no paper (R48: the first probe shot neither).
// Without it, the build is compared with that record — screenshots byte for byte, tokens value for
// value — and anything that differs fails, both copies kept in out/reader-pixels/ for a look. Build first; the demo
// papers made (spikes/reader-papers.mjs). The baseline lives in out/reader-pixels/baseline, which the repository does
// not hold: a machine records its own, once on the build before a change, and compares the build after it.
//   node lab/pdf/spikes/reader-pixels.mjs [--baseline]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchWithReader } from '../../../tests/e2e/lib/extension.mjs'

const root = new URL('..', import.meta.url).pathname
const recording = process.argv.includes('--baseline')
const base = join(root, 'out/reader-pixels/baseline')
const dir = recording ? base : join(root, 'out/reader-pixels/current')
mkdirSync(dir, { recursive: true })
if (!recording && !existsSync(base)) throw new Error('no baseline: run with --baseline on the build before the change')

/** the reader's own tokens before the redesign (reader.css), read off the root */
const TOKENS = ['--n-0', '--n-1', '--n-2', '--n-3', '--n-4', '--n-5', '--n-7', '--n-8', '--n-10', '--danger', '--focus', '--page-shadow', '--float-shadow', '--pop-shadow', '--font', '--bar', '--side', '--canvas', '--chrome', '--chrome-line', '--ink', '--ink-2', '--ink-3', '--line-strong', '--fill', '--well', '--lift', '--float-bg', '--ease']
/** the toolbar's popovers, by their buttons' names */
const MENUS = { language: '目标语言', service: '翻译服务', zoom: '缩放比例', options: '阅读选项' }
const ZOOM_IN = '放大'

const { context, readerUrl } = await launchWithReader({ profile: 'reader-pixels', demos: true, viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.emulateMedia({ reducedMotion: 'reduce' })
await page.goto(readerUrl({ paper: '2608.02163', mode: 'bilingual' }))
await page.waitForFunction(() => window.__reader?.ready && window.__reader?.controller?.getState().settings, null, { timeout: 90000 })
/** the appearance, wherever this build keeps it: `theme` from the redesign's Part 2, the reader's own before it */
const appear = value => page.evaluate(v => window.__reader.controller.patchSettings(c => ('theme' in c ? { ...c, theme: v } : { ...c, pdfReader: { ...c.pdfReader, appearance: v } })), value)
const save = (name, bytes) => writeFileSync(join(dir, name), bytes)
const shot = async (name, locator, on = page) => {
  await on.waitForTimeout(400)
  const box = await locator.boundingBox()
  // a pill's radius is a limit, not a measure (999px): no corner square can be bigger than half a side
  const r = Math.min(await locator.evaluate(el => Number.parseFloat(getComputedStyle(el).borderRadius)), box.width / 2, box.height / 2)
  // a popover's/tooltip's rounded corner anti-aliases with a run-to-run pixel jitter (GPU rasterisation, measured, not
  // the reader); its straight edges don't. Leave out only the r×r corner squares, in two bands whose union is
  // everything else, and compare each byte for byte: one spanning the full height with the corner columns cut,
  // one spanning the full width with the corner rows cut.
  const opts = { animations: 'disabled', caret: 'hide' }
  // a band of no width or no height (a pill is only as tall as its two corners) is left out: the other holds the rest
  if (box.width - 2 * r > 0) save(`${name}-x.png`, await on.screenshot({ clip: { x: box.x + r, y: box.y, width: box.width - 2 * r, height: box.height }, ...opts }))
  if (box.height - 2 * r > 0) save(`${name}-y.png`, await on.screenshot({ clip: { x: box.x, y: box.y + r, width: box.width, height: box.height - 2 * r }, ...opts }))
}

for (const theme of ['light', 'dark']) {
  await appear(theme)
  await page.mouse.move(700, 600)
  await page.waitForTimeout(600)
  save(`${theme}-tokens.json`, JSON.stringify(await page.evaluate(names => Object.fromEntries(names.map(n => [n, getComputedStyle(document.documentElement).getPropertyValue(n).trim()])), TOKENS), null, 1))
  // the toolbar without its last 2 px: the progress line along its foot moves with the translation, not with the tokens
  save(`${theme}-toolbar.png`, await page.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 42 }, animations: 'disabled', caret: 'hide' }))
  for (const [key, name] of Object.entries(MENUS)) {
    await page.locator('header').getByRole('button', { name }).first().click()
    await shot(`${theme}-${key}`, page.locator('.pop:popover-open').first())
    await page.keyboard.press('Escape')
    // the focus the menu gave back to its button would ring it in the next shot: let it go
    await page.evaluate(() => document.activeElement?.blur())
  }
  await page.locator('header').getByRole('button', { name: ZOOM_IN, exact: true }).hover()
  await page.waitForTimeout(700)
  await shot(`${theme}-tip`, page.locator('.tip:popover-open').first())
  await page.mouse.move(700, 600)
}
// The status capsule and the cards (R48), each from a page of its own: the interface is put in the state a run would
// leave it in by the events the run sends (window.__reader.host, session.mjs), which the demo paper never reaches
const emit = (p, event) => p.evaluate(e => window.__reader.host.emit(e), event)
const note = (event, lost = 0) => ({ type: 'note', event, data: {}, got: 0, total: 0, lost, again: false })
for (const theme of ['light', 'dark']) {
  const state = await context.newPage()
  state.on('pageerror', e => errors.push(e.message))
  await state.emulateMedia({ reducedMotion: 'reduce' })
  await state.goto(readerUrl({ paper: '2608.02163', mode: 'bilingual' }))
  await state.waitForFunction(() => window.__reader?.ready && window.__reader?.controller?.getState().settings, null, { timeout: 90000 })
  await state.evaluate(v => window.__reader.controller.patchSettings(c => ({ ...c, theme: v })), theme)
  // 2 passages that failed, the service having stopped: the notice with its retry and its close
  await emit(state, { type: 'fail', event: 'stopped', text: '', kind: 'network' })
  await emit(state, note('shown cached', 2))
  await state.mouse.move(700, 300)
  await state.waitForSelector('.capsule[data-kind="notice"]:not([data-out])')
  await shot(`${theme}-capsule`, state.locator('.capsule[data-kind="notice"]'), state)
  // nothing translated: the card in the translation's pane
  await emit(state, note('cache unusable'))
  await emit(state, { type: 'fail', event: 'no engine', text: '', kind: 'network' })
  await state.waitForSelector('.pane[data-card] .card')
  await state.mouse.move(700, 300)
  await shot(`${theme}-card`, state.locator('.card'), state)
  await state.close()
  // an address with no paper: the card in the document area
  const none = await context.newPage()
  none.on('pageerror', e => errors.push(e.message))
  await none.emulateMedia({ reducedMotion: 'reduce' })
  await none.goto(readerUrl({}))
  await none.waitForSelector('main .card a')
  await none.waitForFunction(() => window.__reader?.ready && window.__reader?.controller?.getState().settings, null, { timeout: 90000 })
  await none.evaluate(v => window.__reader.controller.patchSettings(c => ({ ...c, theme: v })), theme)
  await none.mouse.move(700, 600)
  await shot(`${theme}-card-no-paper`, none.locator('.card'), none)
  await none.close()
}
await context.close()

let failed = errors.length
for (const e of errors) console.log(`FAIL page error — ${e}`)
if (recording) console.log(`baseline recorded: ${readdirSync(base).length} files in ${base}`)
else {
  for (const name of readdirSync(base)) {
    const same = existsSync(join(dir, name)) && readFileSync(join(base, name)).equals(readFileSync(join(dir, name)))
    console.log(`${same ? 'ok  ' : 'FAIL'} ${name}`)
    if (!same) failed++
  }
}
process.exit(failed ? 1 : 0)
