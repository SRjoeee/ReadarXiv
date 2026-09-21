// The end-to-end check of image translation (DESIGN §15): real Chromium, and the recogniser the extension ships — in its
// offscreen document, as a reader's browser runs it. Nothing to install, so it runs wherever the other suites do.
//
// Usage: pnpm build && pnpm e2e:image
// Environment: AXT_PAPER picks the paper (default 2507.00150v1: 6 plots); AXT_HEADED=1 watches it run.
//
// Guarded are §15.2's structural promises: the overlay is the image's next sibling and its rectangle coincides with the image (anchor positioning); under side the overlay is only inside the split copy and
// coincides with the copy's image; visible under only; with the mode gate closed an image entering the viewport makes no request and translates once switched to an open mode; restoring the original leaves not one node or attribute.
// And two papers' own cases: a graphic that stands in no figure (2609.20818v1), and SVG figures whose <object> has other proportions than the drawing (1706.03762v7).
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { chooseBuiltIn, openOptions, setImageMode, setSwitch } from './options-page.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const EXT = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../.output/chrome-mv3', import.meta.url))
const PROFILE = `${HERE}.profile-image`
const SHOTS = `${HERE}.shots`
const PAPER = process.env.AXT_PAPER ?? '2507.00150v1'

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`)
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(SHOTS, { recursive: true })
const context = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chromium',
  headless: !process.env.AXT_HEADED,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1440, height: 900 },
})
let [worker] = context.serviceWorkers()
if (!worker) worker = await context.waitForEvent('serviceworker')
const extId = worker.url().split('/')[2]

const IDLE = /session idle: (\d+)\/(\d+) requested of (\d+)/
const IMAGES_IDLE = /images idle: (\d+)\/(\d+) of (\d+), (\d+) failed/
/** The image count content reports, SVG and bitmaps counted apart; both enter the same pipeline, and idle's denominator is their sum */
const IMAGE_COUNTS = /\[axt\] images: (\d+) SVG \+ (\d+) bitmaps/
async function waitForLog(logs, pattern, timeoutMs, predicate = () => true) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const hit = logs.find(entry => pattern.test(entry.text) && predicate(pattern.exec(entry.text)))
    if (hit) return hit
    await sleep(250)
  }
  return null
}
/** Switch the reading mode from the popup, as a reader does; the popup acts on the tab in front, so `page` is brought there first */
async function switchMode(page, name, settleMs = 300) {
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extId}/popup.html`)
  await page.bringToFront()
  await popup.getByRole('button', { name, exact: true }).waitFor({ timeout: 10_000 })
  await popup.getByRole('button', { name, exact: true }).click()
  await popup.close()
  await sleep(settleMs)
}
/** Scroll down screen by screen, re-reading the height at every step: the page grows as translations are inserted, and scrolling by the initial height misses the last screens */
async function scrollThrough(page) {
  for (let y = 0; ; y += 800) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    if (y > height) break
    await page.evaluate(top => window.scrollTo(0, top), y)
    await sleep(150)
  }
  // One sweep at a fixed step is not enough: translations are inserted while scrolling, the document grows, and a whole image can be skipped between two positions
  // (measured: a run gave `5/5 of 6`, the sixth never entered the viewport). Finally scroll image by image, so “all have entered the viewport” is certain.
  // The selector must match the production target set (the graphics of rules/latexml.ts): scrolling bitmaps only, with
  // AXT_PAPER changed to a paper with external SVG, the skipped one is never claimed and images idle waits until the timeout
  // (Codex on #163). An inline TikZ picture is no target: its labels are blocks of the text run (§15.6), checked by e2e:layout
  const TARGETS = 'img.ltx_graphics, object.ltx_graphics[type="image/svg+xml"]'
  const count = await page.evaluate(sel => document.querySelectorAll(sel).length, TARGETS)
  for (let i = 0; i < count; i++) {
    await page.evaluate(([sel, n]) => document.querySelectorAll(sel)[n]?.scrollIntoView({ block: 'center' }), [TARGETS, i])
    await sleep(150)
  }
}
/** Every bitmap with its overlay (the one in the same parent whose data-axt-for points at it): rectangles and visibility */
const PROBE = () => {
  const out = []
  for (const img of document.querySelectorAll('img.ltx_graphics')) {
    const overlay = img.nextElementSibling?.classList.contains('axt-img') ? img.nextElementSibling : null
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }
    const visible = el => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0
    const inClone = !!img.closest('.axt-split')
    const inSplitOriginal = !!img.closest('[data-axt-split]')
    out.push({
      id: img.id || img.getAttribute('data-axt-split-of') || '',
      inClone, inSplitOriginal,
      imgVisible: visible(img),
      overlay: overlay ? { visible: visible(overlay), labels: overlay.children.length, rect: rect(overlay), labelFont: overlay.firstElementChild ? Number.parseFloat(getComputedStyle(overlay.firstElementChild).fontSize) : 0 } : null,
      imgRect: rect(img),
    })
  }
  return out
}
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol
const coincide = (a, b) => near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h)

// ── The recogniser alone: what only a real canvas shows ─────────────────────────────────────────────
// The same three labels drawn on white and on a transparent ground, handed to the offscreen document as the background
// hands a figure over. A canvas starts transparent and the models take three channels: read without a white ground
// under it, the transparent figure came back with no line at all (Codex on #281)
{
  const blank = await context.newPage()
  await blank.goto('about:blank')
  const draw = transparent => blank.evaluate(clear => {
    const canvas = document.createElement('canvas')
    canvas.width = 900
    canvas.height = 500
    const c = canvas.getContext('2d')
    if (!clear) { c.fillStyle = '#fff'; c.fillRect(0, 0, 900, 500) }
    c.fillStyle = '#000'
    c.font = '40px sans-serif'
    c.fillText('Validation accuracy', 250, 120)
    c.fillText('Training steps', 300, 440)
    c.translate(80, 380)
    c.rotate(-Math.PI / 2)
    c.fillText('Cross entropy', 0, 0)
    return canvas.toDataURL('image/png').split(',')[1]
  }, transparent)
  const read = image => worker.evaluate(async bytes => {
    if (!(await chrome.offscreen.hasDocument())) await chrome.offscreen.createDocument({ url: 'ocr.html', reasons: ['WORKERS'], justification: 'e2e' })
    const reply = await chrome.runtime.sendMessage({ type: 'axt:ocr-run', image: bytes, mime: 'image/png' })
    return reply?.ok ? reply.result.lines : []
  }, image)
  const onWhite = await read(await draw(false))
  const onNothing = await read(await draw(true))
  const texts = lines => lines.map(line => line.text).sort().join(' | ')
  check('recogniser: a figure with a transparent ground is read as it is on white', onWhite.length === 3 && texts(onNothing) === texts(onWhite), `white: ${texts(onWhite)} · transparent: ${texts(onNothing)}`)
  const axis = onWhite.find(line => /entropy/i.test(line.text))
  check('recogniser: a label on its side carries its direction and its own box', !!axis && Math.abs(axis.angle + Math.PI / 2) < 1e-9 && axis.len > 0.2 && axis.thick < 0.06, axis ? `angle ${(axis.angle * 180 / Math.PI).toFixed(0)}°, len ${axis.len.toFixed(3)}, thick ${axis.thick.toFixed(3)}` : 'not read')
  await blank.close()
}

// ── The settings page: google-web, all three image translation modes ticked ────────────
const options = await openOptions(context, extId)
await chooseBuiltIn(options, 'Google 翻译')
await setSwitch(options, '图片翻译', true)
for (const name of ['上下', '左右', '仅译文']) await setImageMode(options, name, true)

// ── An SVG figure in a box of other proportions: the Transformer paper's attention figures ─────────────────────────────
// arXiv sizes the <object> 476 × 254 and the drawing's viewBox is 319 × 217: the browser fits the drawing whole and
// centres it, with air at both sides. Laid over the whole box, every label stood off its word — the first three of
// Figure 4 lay on nothing at all (reported 2026-09-21). The glyphs' own rectangles are the truth a label is held to
// **Before the default paper's sections, while the engine is fresh.** Run last, after three papers' worth of requests,
// Google gave this figure's labels back untranslated in 2 runs of 6 — every label equal to its source draws no overlay
// (`images idle: 5/5 … 0 failed` and nothing on the figure) — and one batch short in another; run alone, 9 of 9 drew all 43
{
  const fitted = await context.newPage()
  const said = []
  fitted.on('console', m => { const text = m.text(); if (/\[axt\] images/.test(text)) said.push(text) })
  await fitted.goto('https://arxiv.org/html/1706.03762v7#readarxiv', { waitUntil: 'domcontentloaded' })
  // Stack: the original's overlay is the one that shows
  await switchMode(fitted, '上下')
  const FITTED = () => {
    const object = document.getElementById('Sx1.F4.g1')
    const overlay = object?.nextElementSibling?.classList.contains('axt-img') ? object.nextElementSibling : null
    const svg = object?.contentDocument?.documentElement
    if (!object || !overlay || !svg || overlay.getClientRects().length === 0) return { waiting: `object ${!!object}, overlay ${!!overlay}, document ${!!svg}, showing ${!!overlay && overlay.getClientRects().length > 0}, mode ${document.documentElement.getAttribute('data-axt-mode')}, next ${object?.nextElementSibling?.className ?? 'none'}` }
    const base = object.getBoundingClientRect()
    const glyphs = Array.from(svg.querySelectorAll('use[data-text]'), use => { const r = use.getBoundingClientRect(); return { text: use.getAttribute('data-text'), x: base.x + r.x + r.width / 2, y: base.y + r.y + r.height / 2 } })
    const letters = text => Array.from(text.replace(/\s/g, '')).sort().join('')
    const labels = Array.from(overlay.children, span => {
      const r = span.getBoundingClientRect()
      const held = glyphs.filter(g => g.x >= r.left - 1 && g.x <= r.right + 1 && g.y >= r.top - 1 && g.y <= r.bottom + 1).map(g => g.text).join('')
      return { source: span.title, held, on: letters(held) === letters(span.title), blur: getComputedStyle(span).backdropFilter }
    })
    const layer = getComputedStyle(overlay, '::before')
    return { box: [base.width, base.height].map(Math.round), overlay: [overlay.getBoundingClientRect().width, overlay.getBoundingClientRect().height].map(Math.round), labels, layer: { blur: layer.backdropFilter, masked: layer.maskImage.startsWith('url("data:image/svg+xml') } }
  }
  let state = null
  let waiting = 'the page never answered'
  for (let i = 0; i < 120 && !state; i++) {
    await fitted.evaluate(() => document.getElementById('Sx1.F4.g1')?.scrollIntoView({ block: 'center' }))
    await sleep(500)
    const seen = await fitted.evaluate(FITTED)
    if (seen.waiting) waiting = seen.waiting
    else state = seen
  }
  const off = state?.labels.filter(label => !label.on) ?? []
  check('an SVG figure in a box of other proportions: the overlay takes the drawing\'s rectangle, and every label holds exactly the glyphs of its own word',
    // However many the engine gave back — a batch of a dense figure's labels fails now and then, and the rest are drawn
    // (measured: 25 of 43 in one run of four) — each of them is held to its word
    !!state && state.labels.length >= 1 && off.length === 0 && state.overlay[0] < state.box[0],
    state ? `box ${state.box.join('×')}, overlay ${state.overlay.join('×')}, ${state.labels.length} labels, off their word: ${off.length}${off.length ? ` (${off.slice(0, 4).map(label => `${label.source} holds "${label.held}"`).join('; ')})` : ''}` : `no overlay on Figure 4: ${waiting}; ${said.slice(-2).join(' | ') || 'the image run said nothing'}`)
  check('one blur a figure, cut to the labels by a mask, and none a label',
    !!state && state.layer.blur === 'blur(15px)' && state.layer.masked && state.labels.every(label => label.blur === 'none'),
    state ? JSON.stringify(state.layer) : 'no overlay')
  await fitted.close()
}

// ── stack: whole-page translation, all 6 images get overlays, the overlay coincides with the image ─────────────────────────
const page = await context.newPage()
const logs = []
page.on('console', m => { const text = m.text(); if (text.includes('[axt]')) logs.push({ t: Date.now(), text }) })
await page.goto(`https://arxiv.org/html/${PAPER}#readarxiv`, { waitUntil: 'domcontentloaded' })
// This part measures **stack**: since 2026-09-11 the default mode is side (§7.2), and without switching explicitly the figures are split in two from the start,
// the overlays counted below are “original + copy”, and every expectation after this is off
await switchMode(page, '上下')
// The image count comes from content's log, so the expectation follows when the paper changes (AXT_PAPER) (Codex on #89)
const counted = await waitForLog(logs, IMAGE_COUNTS, 20_000)
const found = counted ? IMAGE_COUNTS.exec(counted.text) : null
const N = found ? +found[1] + +found[2] : 0
check('content recognised the images on the page', N >= 1, counted?.text ?? 'no images log')
await scrollThrough(page)
const idle = await waitForLog(logs, IMAGES_IDLE, 90_000, m => +m[2] === N && +m[1] + +m[4] === N)
check(`stack: all ${N} images entered and were processed (images idle)`, !!idle, idle?.text ?? logs.filter(l => /images/.test(l.text)).map(l => l.text).join(' | '))
await sleep(500)
let probe = await page.evaluate(PROBE)
const withOverlay = probe.filter(p => p.overlay)
// Not every image gets an overlay: images with digits and single letters only, or whose translation equals the source (units, variable names), draw none. Of the default paper 2507.00150v1's 6, 5 have axis text
// The lower bound does not chase the engine's taste: Google sometimes returns short axis labels (`Epoch`, `Loss`) as they are, `sameText` then draws none for that image,
// and the same build run twice jumps between 4 and 6 (measured). This assertion guards “the whole image translation path really ran”, not translation taste
const minOverlays = PAPER === '2507.00150v1' ? 3 : 1
check(`stack: every image with translatable text has an overlay (≥ ${minOverlays}), each with at least one label`, withOverlay.length >= minOverlays && withOverlay.every(p => p.overlay.labels >= 1), probe.map(p => `${p.id}:${p.overlay?.labels ?? 0}`).join(' '))
check('stack: the overlay rectangle coincides with the image (anchor positioning)', withOverlay.every(p => p.overlay.visible && coincide(p.overlay.rect, p.imgRect)), withOverlay.map(p => `${p.id} Δ(${(p.overlay.rect.x - p.imgRect.x).toFixed(1)},${(p.overlay.rect.y - p.imgRect.y).toFixed(1)},${(p.overlay.rect.w - p.imgRect.w).toFixed(1)},${(p.overlay.rect.h - p.imgRect.h).toFixed(1)})`).join(' '))
// The font size follows the box height: on a wide flat image the labels are only three or four pixels, as small as the image's own text — no lower bound, they scale with the page when the reader zooms
check('stack: the label font size resolved in container units (> 0)', withOverlay.every(p => p.overlay.labelFont > 0), withOverlay.map(p => p.overlay.labelFont.toFixed(1)).join(' '))
await page.evaluate(() => document.querySelector('img.ltx_graphics')?.scrollIntoView({ block: 'center' }))
await sleep(200)
await page.screenshot({ path: `${SHOTS}/image-stack.png` })

// ── side: the figure split in two, the overlay visible only inside the copy and coinciding with the copy's image ────────────────
const popup = await context.newPage()
await popup.goto(`chrome-extension://${extId}/popup.html`)
await page.bringToFront()
await popup.getByRole('button', { name: '左右', exact: true }).waitFor({ timeout: 10_000 })
await popup.getByRole('button', { name: '左右', exact: true }).click()
await sleep(1500)
probe = await page.evaluate(PROBE)
const clones = probe.filter(p => p.inClone && p.overlay)
// Count only originals with an overlay: a figure whose caption has a translation is split anyway (Figure 1 has unit labels only and no overlay, but its caption translated)
const originals = probe.filter(p => p.inSplitOriginal && !p.inClone && p.overlay)
const expected = withOverlay.length
check('side: every figure with an overlay is split, and the copy holds an overlay', clones.length === expected && originals.length === expected, `copies ${clones.length}, originals ${originals.length}, expected ${expected}`)
check('side: the overlay is visible only in the copy, hidden in the original', clones.every(p => p.overlay.visible) && originals.every(p => !p.overlay?.visible), `copies visible ${clones.filter(p => p.overlay.visible).length}/${expected}, originals hidden ${originals.filter(p => !p.overlay?.visible).length}/${expected}`)
check('side: inside the copy the overlay coincides with the copy\'s image', clones.every(p => coincide(p.overlay.rect, p.imgRect)), clones.map(p => `Δ(${(p.overlay.rect.x - p.imgRect.x).toFixed(1)},${(p.overlay.rect.y - p.imgRect.y).toFixed(1)})`).join(' '))
await page.evaluate(() => document.querySelector('.axt-split img.ltx_graphics')?.scrollIntoView({ block: 'center' }))
await sleep(200)
await page.screenshot({ path: `${SHOTS}/image-side.png` })

// ── only: the copy shows, the overlay visible ─────────────────────────────────────────────
await popup.getByRole('button', { name: '仅译文', exact: true }).click()
await sleep(800)
probe = await page.evaluate(PROBE)
const visibleOnly = probe.filter(p => p.overlay?.visible)
check('only: the overlay is visible (following whichever copy shows)', visibleOnly.length === expected && visibleOnly.every(p => coincide(p.overlay.rect, p.imgRect)), `visible ${visibleOnly.length}, expected ${expected}`)

// ── Restoring the original: not one overlay or attribute left ──────────────────────────────────────────
await popup.getByRole('button', { name: '显示原文', exact: true }).click()
await sleep(800)
const after = await page.evaluate(() => ({
  overlays: document.querySelectorAll('.axt-img').length,
  injected: document.querySelectorAll('.axt-t, .axt-img').length,
  attrs: [document.documentElement, ...document.querySelectorAll('*')].reduce((n, el) => n + el.getAttributeNames().filter(a => a.startsWith('data-axt-')).length, 0),
}))
check('restoring the original: zero overlays, zero injected nodes, zero data-axt-* attributes', after.overlays === 0 && after.injected === 0 && after.attrs === 0, JSON.stringify(after))
await popup.close()

// ── The mode gate: only side ticked; under stack an image entering the viewport waits and makes no request; it translates once switched to side ───────────
await options.bringToFront()
await setImageMode(options, '上下', false)
await setImageMode(options, '仅译文', false)
const page2 = await context.newPage()
const logs2 = []
page2.on('console', m => { const text = m.text(); if (text.includes('[axt]')) logs2.push({ t: Date.now(), text }) })
await page2.goto(`https://arxiv.org/html/${PAPER}#readarxiv`, { waitUntil: 'domcontentloaded' })
await waitForLog(logs2, IMAGE_COUNTS, 20_000)
await scrollThrough(page2)
await waitForLog(logs2, IDLE, 90_000)
await sleep(1000)
const parked = await page2.evaluate(() => document.querySelectorAll('.axt-img').length)
const noImagesIdle = !logs2.some(l => IMAGES_IDLE.test(l.text))
check('the mode gate: with stack unticked an image entering the viewport makes no request and gets no overlay', parked === 0 && noImagesIdle, `overlays ${parked}, images idle log ${noImagesIdle ? 'none' : 'present'}`)
const popup2 = await context.newPage()
await popup2.goto(`chrome-extension://${extId}/popup.html`)
await page2.bringToFront()
await popup2.getByRole('button', { name: '左右', exact: true }).waitFor({ timeout: 10_000 })
await popup2.getByRole('button', { name: '左右', exact: true }).click()
const resumed = await waitForLog(logs2, IMAGES_IDLE, 90_000, m => +m[1] + +m[4] >= 1)
await sleep(1500)
const afterResume = await page2.evaluate(PROBE)
const resumedClones = afterResume.filter(p => p.inClone && p.overlay?.visible)
check('the mode gate: after switching to side the waiting images are released and translated, and overlays appear in the copy', !!resumed && resumedClones.length >= 1, `${resumed?.text ?? 'no images idle'}; copy overlays ${resumedClones.length}`)
await popup2.close()

// ── A graphic loose in the text: the teaser of 2609.20818v1 is `div.ltx_para > img`, in no <figure> ─────────────────────
// It had no root to be split by: its paragraph was mirrored as the session started, the overlay then lay on the original
// and the mirror — inert as a whole, never made again — showed the figure untranslated, in side and in only alike
{
  await options.bringToFront()
  for (const name of ['上下', '左右', '仅译文']) await setImageMode(options, name, true)
  const loose = await context.newPage()
  await loose.goto('https://arxiv.org/html/2609.20818v1#readarxiv', { waitUntil: 'domcontentloaded' })
  const LOOSE = () => {
    const shown = el => !!el && el.getClientRects().length > 0
    const of = img => { const next = img?.nextElementSibling; return img ? { shown: shown(img), overlay: next?.classList.contains('axt-img') ? shown(next) : null, labels: next?.classList.contains('axt-img') ? next.querySelectorAll('span').length : 0, x: Math.round(img.getBoundingClientRect().left), inertImage: img.inert, inertBlock: !!img.parentElement?.inert } : null }
    const teasers = [...document.querySelectorAll('img.ltx_graphics')].filter(i => i.getAttribute('src')?.includes('teaser'))
    return { mode: document.documentElement.getAttribute('data-axt-mode'), original: of(teasers.find(i => !i.closest('.axt-t'))), copy: of(teasers.find(i => i.closest('.axt-split'))), mirrors: teasers.filter(i => i.closest('.axt-mirror')).length }
  }
  const switchTo = name => switchMode(loose, name, 1500)
  await switchTo('左右')
  let state = await loose.evaluate(LOOSE)
  for (let i = 0; i < 80 && !state.copy?.overlay; i++) { await sleep(500); state = await loose.evaluate(LOOSE) }
  check('a graphic in no figure, side: its block is copied — the translation shows on the copy, in the right column, and not on the original; the mirror is gone; the copy\'s image is silenced and its block is not',
    state.mode === 'side' && state.original?.shown && state.original.overlay === false && state.copy?.shown && state.copy.overlay === true && state.copy.labels > 0 && state.copy.x > state.original.x && state.mirrors === 0 && state.copy.inertImage && !state.copy.inertBlock,
    JSON.stringify(state))
  await switchTo('仅译文')
  state = await loose.evaluate(LOOSE)
  check('a graphic in no figure, only: the copy shows with its translation, the original does not show',
    state.mode === 'only' && state.original?.shown === false && state.copy?.shown && state.copy.overlay === true,
    JSON.stringify(state))
  await switchTo('上下')
  state = await loose.evaluate(LOOSE)
  check('a graphic in no figure, stack: the original shows with its translation, the copy does not show',
    state.mode === 'stack' && state.original?.shown && state.original.overlay === true && state.copy?.shown !== true,
    JSON.stringify(state))
  await loose.close()
}

await context.close()
const pass = results.filter(r => r.ok).length
console.log(`${pass}/${results.length} passed; screenshots in ${SHOTS}`)
process.exit(pass === results.length ? 0 : 1)
