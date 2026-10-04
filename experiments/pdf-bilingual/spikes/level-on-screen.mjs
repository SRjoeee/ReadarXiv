// What the session calls level, against what the screen shows (the pin's defect found in the website's wave 1: pageTop
// read a page's offsetTop, which leaves out the .pdfViewer's own place once the follower's stack carries the compositor's
// transform, because the stack is then its pages' offsetParent). The reader on a demo paper, the left side scrolled by
// the wheel, the follower by script and on the compositor. Each path, three times over: a sample while the wheel is still
// turning, and one once the reader has rested; the three runs begin near the top, a fifth and four fifths of the way down.
//  - the session's own figure is `debug.levelOf(left)`: how far the follower stands from level with the driver at the
//    paragraph or heading the reader is taken to be at, in px, down positive;
//  - the screen's figure is made apart from it, from nothing but each page's box on the screen (getBoundingClientRect,
//    transforms and all) and PDF.js's own viewports: the same unit and the same place in it, on each side, one taken
//    from the other.
// A row passes when, moving, the session's figure is within 0.5 px of the screen's; at rest, the screen's is within 2 px
// of level (the sync's own tolerance) and the session's within 0.5 px of the screen's. A compositor row also needs the
// follower's stack to carry its animation at that instant, and a script row not: else the path is not the one named.
// Build first (`pnpm build`); the demo papers made (spikes/reader-papers.mjs). Exits non-zero on a FAIL.
//   node experiments/pdf-bilingual/spikes/level-on-screen.mjs      BUILD=<dir> another build; PAPER=<id> another demo paper
import { launchWithReader, BUILD } from './extension.mjs'

const paper = process.env.PAPER ?? '2608.02163'
const extension = process.env.BUILD ?? BUILD
let failed = 0
const row = (ok, name, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`); if (!ok) failed++ }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const { context, readerUrl } = await launchWithReader({ profile: 'level-on-screen', demos: true, extension, viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
page.on('pageerror', e => { console.log(`FAIL no page error — ${e.message}`); failed++ })
await page.goto(readerUrl({ paper, mode: 'bilingual' }))
await page.waitForFunction(() => { const r = window.__reader; return r?.ready && r.controller?.getState().settings && r.debug?.left.anchors.size && r.debug.right.anchors.size }, null, { timeout: 90_000, polling: 250 })
await sleep(800)

/** one sample, in one task: the session's figure, the screen's, and what stands on the follower's stack */
const sample = () => page.evaluate(() => {
  const d = window.__reader.debug, { left, right } = d
  const own = d.levelOf(left)
  if (!own) return null
  /** the place `at` of unit `id` as the screen shows it on a side: its page's box, then PDF.js's own viewport */
  const onScreen = side => {
    const a = side.anchors.get(own.id)
    if (!a) return null
    const n = a.rects.length, pos = Math.min(1, Math.max(0, own.at)) * n, j = Math.min(n - 1, Math.floor(pos)), r = a.rects[j]
    const box = d.toPageBox(side, r), div = d.pageView(side, r.page).div
    return div.getBoundingClientRect().top + div.clientTop + box.top + (pos - j) * box.height
  }
  const a = onScreen(left), b = onScreen(right)
  return {
    id: own.id, at: own.at, session: own.error, screen: a == null || b == null ? null : b - a,
    top: left.container.scrollTop, animated: right.viewer.viewer.getAnimations().length > 0,
  }
})

/**
 * A run of the wheel over the left side, `steps` of 120 px 40 ms apart. A sample is taken from step `from` on, at the first
 * step the session has a unit to level by (a page of one figure has none), while the wheel is still turning
 */
async function turn(box, steps, from) {
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4)
  const start = await page.evaluate(() => window.__reader.debug.left.container.scrollTop)
  let moving = null
  for (let i = 1; i <= steps; i++) {
    await page.mouse.wheel(0, 120)
    await sleep(40)
    if (i >= from && !moving) {
      moving = await sample()
      if (moving) moving.step = moving.top - start
    }
  }
  return moving
}
/** the left side put at a share of the paper and the pair brought level by one turn of the wheel and a rest: the first
 *  share from `from` on where there is a unit to level by, and the pair level, is the run's beginning */
async function begin(box, from) {
  for (let share = from; share < 0.9; share += 0.03) {
    await page.evaluate(share => { const c = window.__reader.debug.left.container; c.scrollTop = share * (c.scrollHeight - c.clientHeight) }, share)
    await sleep(300)
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4)
    await page.mouse.wheel(0, 120)
    await sleep(1800)
    const there = await sample()
    if (there && there.screen != null && Math.abs(there.screen) <= 2) return share
  }
  return null
}

const box = await page.locator('#left').boundingBox()
const near = (x, y, limit) => Math.abs(x - y) <= limit
const describe = m => `session ${m.session.toFixed(2)} px, screen ${m.screen?.toFixed(2)} px (unit ${m.id} at ${m.at.toFixed(2)}), the follower's stack ${m.animated ? 'carries' : 'carries no'} an animation`
for (const [path, compositor] of [['script', false], ['compositor', true]]) {
  await page.evaluate(on => { window.__reader.session.setSyncMode('same'); window.__reader.session.setCompositor(on) }, compositor)
  for (let n = 1; n <= 3; n++) {
    // the three runs begin in three places: from the top, a fifth of the way down the paper and four fifths (the demo
    // paper's middle is tables and figures, where the session has no unit to level by)
    const share = await begin(box, [0.02, 0.2, 0.8][n - 1])
    if (share == null) { row(false, `${path} run ${n}`, 'no place of the paper has a unit to level by with the pair level'); continue }
    const m = await turn(box, 14, 5)
    const okMoving = !!m && m.screen != null && near(m.session, m.screen, 0.5) && m.animated === compositor && m.step !== 0
    row(okMoving, `${path} moving ${n}: the session's own figure within 0.5 px of the screen's`, m ? `${describe(m)}, the driver moved ${Math.round(m.step ?? 0)} px, from ${Math.round(share * 100)} % of the paper` : 'no unit to level by')
    await sleep(1800)
    const r = await sample()
    const okRest = !!r && r.screen != null && near(r.screen, 0, 2) && near(r.session, r.screen, 0.5) && r.animated === compositor
    row(okRest, `${path} rest ${n}: within 2 px of level, and the session's own figure within 0.5 px of it`, r ? describe(r) : 'no unit to level by')
  }
}
await context.close()
console.log(failed ? `${failed} FAIL` : 'every row PASS')
process.exit(failed ? 1 : 0)
