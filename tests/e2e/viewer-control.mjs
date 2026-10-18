// The figure viewer's control under a header the page pins (issue #303, DESIGN §15.7). On arXiv's full text the header is
// sticky; a tall figure scrolled until its top is under it had its control under it too — nothing showed where the
// reader hovered, and a click there reached the header's own link ("Back to Abstract") and left the page. The control now
// stays within the visible part of its figure (core/viewer/index.ts).
//
// Offline, like the accessibility audit (a11y.mjs): the paper is a fixture served from 127.0.0.1 under arXiv's vendored
// style sheets — which is what makes the header sticky — and the extension is a copy of the build that also matches
// 127.0.0.1. No translation is needed, the control is there on an untranslated page.
//
// Usage: pnpm build && pnpm e2e:viewer
// Environment: AXT_PAPER picks the paper (a fixture with a tall figure; the default's is 438 × 560 px); AXT_HEADED=1
//   watches it run; AXT_CHROME=<binary> runs it on another Chrome (the manifest's floor is 131: Chrome for Testing,
//   `npx @puppeteer/browsers install chrome@131`; a branded Chrome from 137 ignores --load-extension).
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { copyWithGrants } from './ext-copy.mjs'
import { serveOffline } from './lib/offline-arxiv.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const SRC = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../.output/chrome-mv3', import.meta.url))
const EXT = `${HERE}.ext-viewer`
const PROFILE = `${HERE}.profile-viewer`
const SHOTS = `${HERE}.shots`
const PAPER = process.env.AXT_PAPER ?? '2609.03768'
const FIGURES = 'img.ltx_graphics, object.ltx_graphics[type="image/svg+xml"], svg.ltx_picture'

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`)
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const round = n => Math.round(n * 10) / 10

rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(SHOTS, { recursive: true })
const site = await serveOffline()
copyWithGrants(SRC, EXT, { contentMatches: { 'https://arxiv.org/html/*': ['http://127.0.0.1/html/*'] } })
const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: !process.env.AXT_HEADED,
  viewport: { width: 1280, height: 860 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
})
await context.route('**/*', route => {
  const { protocol, hostname } = new URL(route.request().url())
  return hostname === '127.0.0.1' || !/^https?:$/.test(protocol) ? route.continue() : route.abort()
})
const page = await context.newPage()
const url = `${site.origin}/html/${PAPER}`
await page.goto(url, { waitUntil: 'load' })
await page.waitForSelector('.axt-viewer-spot', { state: 'attached', timeout: 20_000 })
console.log(await page.evaluate(() => navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0]))

/** The tallest figure the viewer can open, and the header the page pins (arXiv's: `header.arxiv-html-header`) */
const target = await page.evaluate(selector => {
  const figure = [...document.querySelectorAll(selector)].map(el => ({ el, box: el.getBoundingClientRect() }))
    .filter(({ box }) => box.width >= 160 && box.height >= 100).sort((a, b) => b.box.height - a.box.height)[0]
  if (!figure) return null
  figure.el.setAttribute('data-probe-figure', '')
  const header = document.querySelector('header.arxiv-html-header')
  return { height: Math.round(figure.box.height), width: Math.round(figure.box.width), pinned: header ? getComputedStyle(header).position : null }
}, FIGURES)
check('the page has a tall figure and a header it pins', target !== null && target.height >= 300 && target.pinned === 'sticky', JSON.stringify(target))

/** Scroll until the figure's top stands `above` px above the pinned header's bottom (negative: below it) */
async function place(above) {
  await page.evaluate(async above => {
    const figure = document.querySelector('[data-probe-figure]')
    const header = document.querySelector('header.arxiv-html-header')
    window.scrollTo(0, window.scrollY + figure.getBoundingClientRect().top - (header.getBoundingClientRect().bottom - above))
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  }, above)
}
/** Where everything stands now: the figure, the header, the control (null while it is hidden) */
const stand = () => page.evaluate(() => {
  const box = el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height } }
  const control = document.querySelector('.axt-viewer-spot')?.shadowRoot?.querySelector('.axt-viewer-open')
  const shown = !!control?.hasAttribute('data-axt-shown')
  const at = shown ? control.getBoundingClientRect() : null
  const hit = at ? document.elementFromPoint(at.left + at.width / 2, at.top + at.height / 2) : null
  return {
    figure: box(document.querySelector('[data-probe-figure]')),
    header: box(document.querySelector('header.arxiv-html-header')),
    control: at ? box(control) : null,
    reached: hit ? !!hit.closest('.axt-viewer-spot') : false,
    hitTag: hit ? `${hit.tagName.toLowerCase()}${hit.className ? `.${String(hit.className).split(' ')[0]}` : ''}` : null,
    scrollY: window.scrollY,
  }
})

/** The pointer on the visible part of the figure, below the header, so the figure is what it meets */
async function hover() {
  const now = await stand()
  const x = now.figure.left + now.figure.width / 2
  const y = Math.min(now.figure.bottom - 20, Math.max(now.figure.top, now.header.bottom) + 120)
  await page.mouse.move(x - 40, y - 20)
  await page.mouse.move(x, y, { steps: 3 })
  await page.waitForFunction(() => document.querySelector('.axt-viewer-spot')?.shadowRoot?.querySelector('.axt-viewer-open')?.hasAttribute('data-axt-shown'), null, { timeout: 5_000 }).catch(() => undefined)
  await sleep(250)
}

// The figure's top at three heights: clear of the header, level with it, and well under it (the reported case is the last two)
for (const [above, label] of [[-80, 'clear of the header'], [0, 'level with the header\'s bottom'], [60, 'a little under the header'], [260, 'far under the header']]) {
  await page.mouse.move(5, 400)
  await sleep(300)
  await place(above)
  await hover()
  const s = await stand()
  const c = s.control
  const visibleTop = Math.max(s.figure.top, s.header.bottom)
  const shown = c !== null
  check(`${label}: the control shows`, shown, shown ? `at y ${round(c.top)}–${round(c.bottom)}, the figure ${round(s.figure.top)}–${round(s.figure.bottom)}, the header's bottom ${round(s.header.bottom)}` : 'hidden')
  if (!shown) continue
  check(`${label}: it stands in the visible part of its figure, not under the header`, c.top >= visibleTop - 0.5 && c.bottom <= s.figure.bottom + 0.5 && c.right <= s.figure.right + 0.5,
    `control top ${round(c.top)} against the visible part's top ${round(visibleTop)}; right ${round(c.right)} of ${round(s.figure.right)}`)
  check(`${label}: what is at the control's centre is the control`, s.reached, `the hit is ${s.hitTag}`)
  if (above <= 0) {
    // Not covered: the control is where it always was, 8 px in from the figure's top right, and scrolls with the figure
    check(`${label}: at the figure's corner, 8 px in from its top and right`, Math.abs(c.top - s.figure.top - 8) < 1 && Math.abs(s.figure.right - c.right - 8) < 1,
      `${round(c.top - s.figure.top)} px from the top, ${round(s.figure.right - c.right)} px from the right`)
    // Scrolled up, so the figure's top stays clear of the header: the control goes with it, 8 px from it still
    await page.mouse.wheel(0, -40)
    await sleep(150)
    const after = await stand()
    check(`${label}: it scrolls with the figure, no script behind it`, after.control !== null && Math.abs(after.figure.top - s.figure.top - 40) < 1 && Math.abs((after.control.top - after.figure.top) - (c.top - s.figure.top)) < 1,
      `the figure ${round(after.figure.top - s.figure.top)} px lower, the control ${after.control ? round(after.control.top - after.figure.top) : 'hidden'} px from its top`)
  } else {
    // Covered: it holds just under the header's edge while the figure's top is above it, and follows the figure when scrolled further up
    check(`${label}: it holds 8 px under the header's edge`, Math.abs(c.top - s.header.bottom - 8) < 1, `${round(c.top - s.header.bottom)} px under`)
  }
  await page.screenshot({ path: `${SHOTS}/viewer-control-${above}.png` })
}

// A press on it opens the viewer — and does not reach the header's link behind where it used to hide
await page.mouse.move(5, 400)
await sleep(300)
await place(200)
await hover()
const before = await stand()
if (before.control) {
  await page.mouse.click(before.control.left + before.control.width / 2, before.control.top + before.control.height / 2)
  await sleep(500)
  const opened = await page.evaluate(() => !!document.querySelector('.axt-viewer')?.shadowRoot?.querySelector('dialog[open]'))
  check('a press on the control opens the viewer, and the page has not left', opened && page.url() === url, `dialog open ${opened}, url ${page.url() === url ? 'unchanged' : page.url()}`)
  await page.keyboard.press('Escape')
} else check('a press on the control opens the viewer, and the page has not left', false, 'the control did not show')

await context.close()
await site.close()
rmSync(EXT, { recursive: true, force: true })
const pass = results.filter(r => r.ok).length
console.log(`\n${pass}/${results.length} passed; screenshots in ${SHOTS}`)
process.exit(pass === results.length ? 0 : 1)
