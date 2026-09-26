// The reader's pixels, before and after its tokens and controls move to the shared ones (the redesign's design, §2.4).
// `--baseline` records the reader as the build draws it now: the chrome's screenshots and the root's computed tokens,
// in light and dark. Without it, the build is compared with that record — screenshots byte for byte, tokens value for
// value — and anything that differs fails, both copies kept in out/reader-pixels/ for a look. Build first; the demo
// papers made (spikes/reader-papers.mjs).
//   node experiments/pdf-bilingual/spikes/reader-pixels.mjs [--baseline]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchWithReader } from './extension.mjs'

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
const shot = async (name, locator) => {
  await page.waitForTimeout(400)
  const box = await locator.boundingBox()
  const r = await locator.evaluate(el => Number.parseFloat(getComputedStyle(el).borderRadius))
  // a popover's/tooltip's rounded corner anti-aliases with a run-to-run pixel jitter (GPU rasterisation, measured, not
  // the reader); its straight edges don't. Leave out only the r×r corner squares, in two bands whose union is
  // everything else, and compare each byte for byte: one spanning the full height with the corner columns cut,
  // one spanning the full width with the corner rows cut.
  const opts = { animations: 'disabled', caret: 'hide' }
  save(`${name}-x.png`, await page.screenshot({ clip: { x: box.x + r, y: box.y, width: box.width - 2 * r, height: box.height }, ...opts }))
  save(`${name}-y.png`, await page.screenshot({ clip: { x: box.x, y: box.y + r, width: box.width, height: box.height - 2 * r }, ...opts }))
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
