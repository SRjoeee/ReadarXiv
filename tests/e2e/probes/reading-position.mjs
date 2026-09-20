// Probe: does the reader keep their place (DESIGN §10, core/renderer/place.ts)? Before each action the paragraph on
// the reader's line — a quarter of the way down the viewport, where the extension takes the reader to be — is noted,
// and after it the same paragraph is found again: how far it moved on screen, whether it is still on screen, and how
// many paragraphs away the one now on that line is. Every painted frame of the wait is sampled too: the largest
// distance the paragraph was ever shown from its place is what the reader saw, a flash included. The actions are the
// reader's own, each a relayout of the whole page: starting a translation, switching to stacked, to translation
// only, back to side by side, and restoring the original.
//
// Before the keeper: 2 000–7 800 px on every action, the paragraph off screen each time. The design was decided by
// trying it from inside the page first (2026-09-20): one correction at the action left 96 px where the tidy layer's
// full pass followed; a correction at each relayout the extension itself performs left 0–1 px, never painted further.
// AXT_TIMELINE=1 prints when what was shown changed, beside the extension's own lines.
// AXT_NUDGE=px scrolls that much further before every action but the first: under stacked the translation is below
// its original, and a nudge of a paragraph's height puts the reader's line on the translation — what a reader reads.
// Usage: pnpm build && node tests/e2e/probes/reading-position.mjs [paper] [fraction of the way down, 0–1]
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { chooseBuiltIn, openOptions, setSwitch } from '../options-page.mjs'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const PROFILE = `${E2E}.profile-position`
const PAPER = process.argv[2] ?? '2410.00260'
const DOWN = Number(process.argv[3] ?? 0.45)
/** The reader's line, as the extension takes it: a quarter of the way down a 900 px viewport */
const LINE = Number(process.env.AXT_LINE ?? 225)
const NUDGE = Number(process.env.AXT_NUDGE ?? 0)
const sleep = ms => new Promise(r => setTimeout(r, ms))

rmSync(PROFILE, { recursive: true, force: true })
const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: !process.env.AXT_HEADED,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1440, height: 900 },
})
context.setDefaultNavigationTimeout(90_000)
let [worker] = context.serviceWorkers()
if (!worker) worker = await context.waitForEvent('serviceworker')
const extId = worker.url().split('/')[2]

const options = await openOptions(context, extId)
await chooseBuiltIn(options, 'Google 翻译')
await setSwitch(options, '图片翻译', false)
await options.close()

const page = await context.newPage()
// The extension's own lines, stamped with the page's clock, to set beside the timeline of what the reader was shown
const lines = []
page.on('console', async message => {
  const text = message.text()
  if (!/\[axt\] (side prep|margin notes|start:|session idle)/.test(text)) return
  lines.push({ at: await page.evaluate(() => performance.now()).catch(() => 0), text: text.replace('[axt] ', '').slice(0, 150) })
})
await page.goto(`https://arxiv.org/html/${PAPER}`, { waitUntil: 'load' })
const popup = await context.newPage()
await popup.goto(`chrome-extension://${extId}/popup.html`)
await page.bringToFront()
await sleep(3000)

await page.evaluate(({ down, line }) => {
  // The paper's own paragraphs, in order; ours (translations, copies) are not the reader's place
  const own = () => [...document.querySelectorAll('article p.ltx_p')].filter(p => !p.closest('.axt-t'))
  // What stands for a paragraph on screen: itself, or under "translation only" the translation beside it
  const shown = p => (p.getClientRects().length ? p : p.nextElementSibling?.classList.contains('axt-t') ? p.nextElementSibling : null)
  const wordTop = (node, offset) => {
    if (!node.isConnected) return Number.NaN
    const range = document.createRange()
    range.setStart(node, Math.min(offset, node.length))
    range.setEnd(node, Math.min(offset + 1, node.length))
    const box = range.getClientRects()[0]
    return box ? box.top : Number.NaN
  }
  window.__place = {
    note() {
      const list = own()
      let best = null
      for (const [index, p] of list.entries()) {
        const el = shown(p)
        if (!el) continue
        const top = el.getBoundingClientRect().top
        if (best === null || Math.abs(top - line) < Math.abs(best.top - line)) best = { index, top, p }
      }
      window.__place.anchor = best.p
      // The word on the reader's line — the text node and the offset the browser's caret lands on there — is the
      // measure that owes nothing to how the extension keeps the place: a paragraph's top moves when the paragraph
      // changes height, though the sentence being read stays put. Taken in the text column, as the extension does
      const article = document.querySelector('article').getBoundingClientRect()
      const caret = document.caretRangeFromPoint(article.left + article.width * 0.25, line)
      window.__place.word = caret && caret.startContainer.nodeType === 3 ? { node: caret.startContainer, offset: caret.startOffset, top: wordTop(caret.startContainer, caret.startOffset) } : null
      // Every painted frame from here on is compared with this place
      window.__place.was = best.top
      window.__place.worst = 0
      window.__place.t0 = performance.now()
      window.__place.timeline = []
      window.__place.last = 0
      return { index: best.index, top: Math.round(best.top), words: best.p.textContent.trim().slice(0, 48) }
    },
    find() {
      const el = shown(window.__place.anchor)
      const top = el ? el.getBoundingClientRect().top : Number.NaN
      const word = window.__place.word
      const wordNow = word ? wordTop(word.node, word.offset) : Number.NaN
      return { word: word && !Number.isNaN(wordNow) ? Math.round(wordNow - word.top) : null, in: word ? (word.node.parentElement?.closest('.axt-t') ? 'a translation' : 'the original') : null, top: Math.round(top), onScreen: top > -40 && top < innerHeight - 40, scrollY: Math.round(scrollY), height: document.documentElement.scrollHeight, worst: Math.round(window.__place.worst), timeline: window.__place.timeline, t0: window.__place.t0 }
    },
  }
  // What the reader was shown: after each paint, how far the noted paragraph stands from where it was
  const channel = new MessageChannel()
  channel.port1.onmessage = () => {
    const el = window.__place.anchor && shown(window.__place.anchor)
    if (el && window.__place.was !== undefined) {
      const off = Math.round(el.getBoundingClientRect().top - window.__place.was)
      window.__place.worst = Math.max(window.__place.worst, Math.abs(off))
      // When what the reader is shown changes, and by how much: AXT_TIMELINE prints it beside the extension's own lines
      if (Math.abs(off - window.__place.last) >= 2) { window.__place.timeline.push([Math.round(performance.now() - window.__place.t0), off]); window.__place.last = off }
    }
    requestAnimationFrame(() => channel.port2.postMessage(0))
  }
  requestAnimationFrame(() => channel.port2.postMessage(0))

  const list = own()
  const target = list[Math.floor(list.length * down)]
  window.scrollTo(0, target.getBoundingClientRect().top + scrollY - line)
}, { down: DOWN, line: LINE })
await sleep(800)

const main = await page.evaluate(() => { const r = document.querySelector('.axt-floating').shadowRoot.querySelector('.axt-fb-main').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
const mode = name => async () => { await popup.getByRole('button', { name, exact: true }).click() }
const steps = [
  ['translate (side by side)', () => page.mouse.click(main.x, main.y), 6000],
  ['→ stacked', mode('上下'), 2500],
  ['→ translation only', mode('仅译文'), 2500],
  ['→ side by side', mode('左右'), 3500],
  ['restore the original', () => page.mouse.click(main.x, main.y), 3000],
]

console.log(`\n=== ${PAPER}, ${Math.round(DOWN * 100)}% of the way down, viewport 1440×900, the reader's line ${LINE} px from the top`)
for (const [index, [name, act, wait]] of steps.entries()) {
  if (NUDGE && index > 0) { await page.evaluate(px => window.scrollBy(0, px), NUDGE); await sleep(400) }
  const before = await page.evaluate(() => window.__place.note())
  await act()
  await sleep(wait)
  const after = await page.evaluate(() => window.__place.find())
  const now = await page.evaluate(() => window.__place.note())
  const moved = after.top - before.top
  if (process.env.AXT_TIMELINE) {
    console.log(`  -- ${name}: what the reader was shown (ms after the action: px from the place) ${after.timeline.map(([t, off]) => `${t}:${off}`).join('  ') || 'never moved'}`)
    for (const line of lines.splice(0)) console.log(`     ${Math.round(line.at - after.t0)} ms (when the line was read, a little after it was written): ${line.text}`)
  }
  console.log(`${name.padEnd(26)} paragraph #${before.index} “${before.words}…”: ${before.top} px → ${Number.isNaN(after.top) ? 'gone' : `${after.top} px`} `
    + `(${moved > 0 ? '+' : ''}${moved} px, ${after.onScreen ? 'still on screen' : 'OFF SCREEN'}); the word on the line, in ${after.in ?? 'no text'}: ${after.word === null ? 'gone or hidden' : `${after.word > 0 ? '+' : ''}${after.word} px`}; worst shown ${after.worst} px; on the reader's line now: #${now.index} (${now.index - before.index >= 0 ? '+' : ''}${now.index - before.index})`)
}
await context.close()
