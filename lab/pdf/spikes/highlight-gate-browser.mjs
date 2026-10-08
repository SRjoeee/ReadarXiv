// The highlight's gate in a real browser (plans/2026-10-01-pdf-highlight.md, B1; the Node half is highlight-gate.mjs):
// the extension's build, the reader on demo papers, the real pointer.
//  checks (exit non-zero on a failure), on the build under test:
//  - no hole: for units lit on both sides, points on a grid inside each band painted, and 1 px inside each of its edges
//    and corners (the pads): the pointer there finds a unit — its own, or a smaller one painted over it (a heading run
//    into its paragraph's first line); 1.5 px outside its sides it does not find the unit. At the load, and again with
//    the contents panel open, zoomed, the right side replaced (a new compile) and the translation alone
//  - a miss is held: the pointer moved off every unit keeps what is lit 50 ms, not 250 ms
//  - both sides painted; the tasks that write the highlight force no layout (a Chrome trace: no Layout inside them)
//  - where the pointer's path keeps each pane and page (debug.pointAt) is where the layout has them, at 60 points a
//    pane, after everything that moves a pane or draws it moving: the load, the contents panel opened and closed, a
//    zoom and back, the panes swapped and back, one pane shown (the translation, the original) and two again, the
//    pages dimmed and not, the right side replaced (a new compile), the fonts loaded
//  - a wheel turned under a still pointer (no move sent): what is lit after is what a move there would light, and is
//    some unit — turned on a little more, still without a move, where the wheel left the pointer over none (the final
//    review, M1: on 346c26fc both papers' wheels ended over nothing, and null equal to null passed)
//  - the pointer on a unit's words the moment the reader is ready (its sides' layouts, made in the idle time after, not
//    yet there most times): no layout made in an animation frame; the unit lit once they come, the pointer still
//  - the demo's sentences are those of the sentence file they were taken from, which the Node gate makes again by the
//    reader's path from the Microsoft answers kept (B3's review, I2)
//  - a pointer resting from the first moment on a unit of more than one sentence lights its sentence, never the paragraph
//    first (B3's re-review: made to fail on 61619404, the paragraph first in 4 of 6 opens)
//  - the pointer moving over the left pane from the first moment of the load: every side's sentences found, as with the
//    pointer still (B3's review, C1: made to fail on af6fce33, 06701 0 lit by sentence against 41)
//  - a pointer resting on a sentence of a unit over two pages, on each pane, through the right side replaced (at once,
//    and after 800 ms in which idle periods come) and through the left anchored again (our marked original's marks):
//    400 ms after, what is lit is what a move there lights, painted under the pointer (the final review, I1: made to
//    fail on 346c26fc, the right pane lit nothing until the pointer moved, 2608.02459 and 2608.06701); and every frame
//    from the event on paints, per side, the sentence, never the paragraph (I2: on 346c26fc with the harness's hooks,
//    10 of 12 fail — the paragraph painted on one side or both, for 19–178 ms) and never nothing (the re-review: on
//    2ae0d235 the new side at a swap was blank for 40–200 ms until its fit was worked out)
//  - the same pointer, resting, through what resizes the pages or the panes with no move sent: a zoom, the zoom back to
//    the width (a fit), the contents opened (the panes narrowed, the width fitted again) and closed: 400 ms after, what
//    is lit is what a move there lights, painted under the pointer (Codex on #308: the pointer looked again on the
//    scroll's frame, before the new sizes were measured, and not after; made to fail on 7ae01b8f, three runs: 2608.02459's
//    right pane lit nothing through the zoom and the zoom back where a move lights unit 23)
//  - each side's tokens let go once its layout is made: on 2608.02459, both layouts and sentences made and the garbage
//    collected, the tokens the reader holds weakly are gone (the final review, I3: made to fail on 346c26fc with the
//    weak hold added, both sides' kept, the heap 31.8 MB; 10.5 MB with the fix)
//  - sentences (B3): where a unit lights by sentence on both sides, what it paints is its sentences' shapes (the first,
//    a middle and the last, debug.litRects), and the grid and the pads above are the pointer's sentence's
//    (debug.pointerSentence), 1.5 px past a shape's sides not; round 1's measure of their boundaries on the page's own
//    canvas — the 1-px column at each boundary between two sentences sharing a row, across the row's band, holding ink
//    (darker than 150 of 255) or not — no more than round 1's share, 3 of 72 edges
//  Each made to fail once (B1's first round of review): the kept places, the first moment and the wheel on 133ae1d1
//  (113 of 113 points off after the contents panel opened; a layout made in the pointer's frame; the unit the wheel
//  left behind still lit); the pads on a build whose pointer takes no pad (104 of 156 pad points lit nothing); the
//  holes and the miss hold on BASE 5957a4be (46 of 672 points; the wash gone at 50 ms). B3's: the ink on 225856ac,
//  before ink edges took a proportional face's widths (2608.06701's left 7 of 17 boundaries, 2608.02459's 3 of 9); the
//  sentences' grid with the harness painting a caption by sentence, which the pointer lights whole (168 points another
//  sentence); the pads with what each shape draws read unscaled while a zoom was drawn (2 pads read as the next sentence)
//  costs, the build against BASE_BUILD, interleaved (both browsers open, runs alternating):
//  - a sweep of real pointer moves (220 down each pane, zig-zagging, one a frame) over a spread of formulas, of aligned
//    displays, and a two-column page: per light — a move that changed what is lit — the script of the task that
//    painted (the mousemove handler, or the animation frame) and the style and layout of the frame that follows,
//    p50 / p95 / max; layouts forced inside those tasks; long tasks
//  - opening the heaviest paper and a two-column one: the time to ready (text and anchors), the side's layouts
//    (timing.leftLayout / rightLayout), the long tasks until ready plus 3 s
//  - a fast scroll (120 wheel steps of 600 px, 16 ms apart) with a unit lit: long tasks
//  and, against BASE_BUILD, the limits (exit non-zero past one; the rounds pooled): per light, the script's and the
//  following style and layout's p50 within 0.1 ms of BASE's and p95 within 0.25 ms; no layout forced; the sweeps' long
//  tasks no more than BASE's and one a round; the fast scroll's long tasks' total within 15 % and 50 ms a round of
//  BASE's; the open's time to ready and its anchoring, p50, within 3 % and 10 ms of BASE's. Made to fail once (B1's
//  first round of review): a build whose pointer frame waits 1 ms (script p50 over the limit)
// The demo papers (made on this machine, never in the repository: arXiv's papers may not be redistributed) are staged
// into a copy of each build, as extension.mjs does with poc-reader/papers; their units carry the sentences
// spikes/highlight-sentences.mjs made (`sentences` beside `src` and `tr`): spikes/highlight-papers.mjs makes them, into
// out/highlight/papers.
//   node lab/pdf/spikes/highlight-gate-browser.mjs [checks|costs|all|floats|resting|tokens]   (the last
//   three: those checks alone)
//   BUILD=<dir> the build under test (default .output/chrome-mv3), LABEL its name in the output; BASE_BUILD=<dir> the one
//   to compare with (costs);
//   PAPERS=<dir> the demo papers (default out/highlight/papers); CHECK=<ids> the papers checked (default 2608.02459, the
//   heaviest, whose layouts are not made yet when the reader is ready, and 2608.06701, two columns);
//   SWEEP=<id:unit,…> the sweeps' papers and the unit each starts at; OPEN=<ids> the papers opened (either `none`);
//   ROUNDS=<n>
//   → out/highlight-gate-browser.json
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO = new URL('../../../', import.meta.url).pathname
const root = new URL('..', import.meta.url).pathname
const { chromium } = createRequire(REPO)('playwright')
const what = process.argv[2] ?? 'all'
const BUILD = process.env.BUILD ?? join(REPO, '.output/chrome-mv3'), BASE = process.env.BASE_BUILD
const PAPERS = process.env.PAPERS ?? join(root, 'out/highlight/papers')
const CHECK = (process.env.CHECK ?? '2608.02459,2608.06701').split(',')
const list = (v, d) => (v === 'none' ? [] : (v ?? d).split(','))
const SWEEP = list(process.env.SWEEP, '2608.08350:139,2608.29181:30,2608.06701:17').map(s => s.split(':')).map(([id, unit]) => [id, Number(unit)])
const OPEN = list(process.env.OPEN, '2608.02459,2608.04322')
const ROUNDS = Number(process.env.ROUNDS ?? 3)
/** the papers whose floats are checked (B4), and the floats each must have on both sides at least, per kind (the demo
 *  papers: 2608.06701 two columns, tables, figures, an algorithm; 2608.12502 two columns, grids of images; 2608.02163
 *  tables with their cells located, a long table) — as the Node gate finds them */
const FLOAT_CHECK = list(process.env.FLOAT_CHECK, '2608.06701,2608.12502,2608.02163')
const FLOATS_AT_LEAST = { '2608.06701': { figure: 11, table: 9 }, '2608.12502': { figure: 6, table: 12 }, '2608.02163': { figure: 6, table: 11 } }
const result = {}
let failed = 0
const check = (what, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${detail}` : ''}`); if (!ok) failed++ }
const q = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(3) }
const stats = xs => ({ n: xs.length, p50: q(xs, 0.5), p95: q(xs, 0.95), max: q(xs, 1) })

/** a build with the demo papers, in Playwright's Chromium; its temporary copies go when it closes */
async function launch(build, label) {
  if (!existsSync(join(build, 'pdf-reader.html'))) throw new Error(`no reader in ${build}`)
  const copy = mkdtempSync(join(tmpdir(), `hl-gate-${label}-`)), profile = mkdtempSync(join(tmpdir(), `hl-gate-profile-${label}-`))
  cpSync(build, copy, { recursive: true })
  cpSync(PAPERS, join(copy, 'pdf-reader/papers'), { recursive: true })
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width: 1600, height: 1000 }, args: [`--disable-extensions-except=${copy}`, `--load-extension=${copy}`] })
  const close = context.close.bind(context)
  context.close = async () => { try { await close() } finally { for (const d of [copy, profile]) rmSync(d, { recursive: true, force: true, maxRetries: 3 }) } }
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const id = new URL(worker.url()).host
  return { label, context, url: q => `chrome-extension://${id}/pdf-reader.html?${new URLSearchParams(q)}` }
}
async function open(b, paper, extra = {}) {
  const page = await b.context.newPage()
  page.on('pageerror', e => check(`${b.label} ${paper}: no page error`, false, e.message))
  await page.goto(b.url({ paper, mode: 'bilingual', ...extra }))
  await page.waitForFunction(() => window.__reader?.ready && window.__reader.debug, null, { timeout: 240_000, polling: 200 })
  await page.waitForTimeout(1500)
  return page
}
/** both sides scrolled so that a unit's first line stands 150 px down, its pages drawn */
const at = (page, id) => page.evaluate(async id => { const d = window.__reader.debug; for (const s of [d.left, d.right]) { const top = d.unitDocTop(s, id); if (top != null) s.container.scrollTop = top - 150 } await new Promise(r => setTimeout(r, 2000)) }, id)
const frames = (page, n = 2) => page.evaluate(n => new Promise(r => { const f = k => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n) }), n)

async function trace(page, fn) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReturnAsStream' })
  await fn()
  const done = new Promise(r => cdp.once('Tracing.tracingComplete', r))
  await cdp.send('Tracing.end')
  const { stream } = await done
  let text = ''
  for (;;) { const { data, eof, base64Encoded } = await cdp.send('IO.read', { handle: stream, size: 1 << 22 }); text += base64Encoded ? Buffer.from(data, 'base64').toString() : data; if (eof) break }
  await cdp.send('IO.close', { handle: stream })
  const json = JSON.parse(text)
  return Array.isArray(json) ? json : json.traceEvents
}

// ---------------------------------------------------------------- checks
const patch = (page, change) => page.evaluate(p => window.__reader.controller.patchSettings(c => {
  const next = { ...c }
  for (const [k, v] of Object.entries(p)) next[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...c[k], ...v } : v
  return next
}), change)
/** what moves a pane or draws it moving, each with the time it takes to end (the contents panel slides 200 ms, PDF.js
 *  draws a zoom's pages, a view transition crossfades the dimmed pages) */
const MOVES = [
  ['the load', async () => {}],
  ['the contents opened', page => page.locator('button[aria-controls="axt-contents"]').click()],
  ['the contents closed', page => page.locator('button[aria-controls="axt-contents"]').click()],
  ['a zoom', page => page.evaluate(() => window.__reader.controller.zoomBy(1.1))],
  ['the zoom back', page => page.evaluate(() => window.__reader.controller.zoomTo('page-width'))],
  ['the panes swapped', page => patch(page, { pdfReader: { swapped: true } })],
  ['the panes back', page => patch(page, { pdfReader: { swapped: false } })],
  ['the translation alone', page => page.evaluate(() => window.__reader.controller.setDisplay('translation'))],
  ['the original alone', page => page.evaluate(() => window.__reader.controller.setDisplay('original'))],
  ['both again', page => page.evaluate(() => window.__reader.controller.setDisplay('bilingual'))],
  ['the pages dimmed', page => patch(page, { theme: 'dark', pdfReader: { dimPages: true } })],
  ['the pages not dimmed', page => patch(page, { theme: 'light' })],
  ['the right side replaced', page => page.evaluate(() => window.__reader.debug.swapRight())],
  ['the fonts loaded', page => page.evaluate(() => document.fonts.ready.then(() => {}))],
]
/** debug.pointAt against the layout read now (the page under the point, its box), at 60 seeded points a pane shown:
 *  the points where they differ by more than half a unit, out of those on a page, and those where it finds a page the
 *  layout has none. A point in a page's margin that the page's text layer overflows into is no page's for the pointer
 *  and is left out */
const places = page => page.evaluate(() => {
  let seed = 7
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const d = window.__reader.debug, out = { n: 0, bad: 0, worst: [] }
  for (const s of [d.left, d.right]) {
    const c = s.container.getBoundingClientRect()
    if (!c.width) continue
    for (let i = 0; i < 60; i++) {
      const x = c.left + 10 + rand() * (c.width - 20), y = c.top + 10 + rand() * (c.height - 20)
      // under whatever floats over the pane there (its page pill, its scroll indicator)
      const el = document.elementsFromPoint(x, y).map(e => e.closest('.page')).find(e => e && s.container.contains(e))
      const a = d.pointAt(s, x, y)
      const b = el?.getBoundingClientRect()
      if (!el || x < b.left + el.clientLeft || x > b.right - el.clientLeft || y < b.top + el.clientTop || y > b.bottom - el.clientTop) {
        // pointAt finding a page the layout has none at: off unless on the page box's very edge, which hit testing
        // leaves out at the far sides and pointOn takes in
        const pb = a && d.pageView(s, a.page).div.getBoundingClientRect()
        if (!el && a && Math.min(Math.abs(x - pb.left), Math.abs(x - pb.right), Math.abs(y - pb.top), Math.abs(y - pb.bottom)) > 0.5) {
          out.n++; out.bad++
          if (out.worst.length < 3) out.worst.push({ side: s === d.left ? 'L' : 'R', noPage: [+x.toFixed(1), +y.toFixed(1)], found: a.page, box: [+pb.left.toFixed(1), +pb.top.toFixed(1), +pb.right.toFixed(1), +pb.bottom.toFixed(1)] })
        }
        continue
      }
      const n = Number(el.dataset.pageNumber), pv = d.pageView(s, n)
      const [px, py] = pv.viewport.convertToPdfPoint(x - b.left - el.clientLeft, y - b.top - el.clientTop)
      out.n++
      const e = !a || a.page !== n ? Infinity : Math.hypot(a.x - px, a.y - py)
      if (e > 0.5) { out.bad++; if (out.worst.length < 3) out.worst.push({ side: s === d.left ? 'L' : 'R', off: a ? +((a.x - px) * pv.viewport.scale).toFixed(1) : null }) }
    }
  }
  return out
})
/** the pointer on the words of a unit on page 1 the moment the reader is ready; the frames in which a side's layout came
 *  into being counted (requestAnimationFrame wrapped before the reader's scripts take it) */
async function early(b, paper) {
  const page = await b.context.newPage()
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window)
    window.__madeInFrame = 0
    window.requestAnimationFrame = cb => raf(t => {
      const d = window.__reader?.debug, before = d ? [!!d.left.geo, !!d.right.geo] : null
      cb(t)
      if (before && (!before[0] && d.left.geo || !before[1] && d.right.geo)) window.__madeInFrame++
    })
  })
  await page.goto(b.url({ paper, mode: 'bilingual' }))
  await page.waitForFunction(() => window.__reader?.ready && window.__reader.debug?.left.anchors.size && window.__reader.debug.right.anchors.size, null, { timeout: 240_000, polling: 10 })
  const target = await page.evaluate(() => {
    const d = window.__reader.debug, s = d.left
    const id = [...s.anchors.keys()].find(i => { const a = s.anchors.get(i); return a && a.rects[0].page === 1 && a.rects.length >= 2 && a.rects[0].x1 - a.rects[0].x0 > 100 })
    const r = s.anchors.get(id).rects[0], box = d.toPageBox(s, r), pr = d.pageView(s, 1).div.getBoundingClientRect()
    return { id, x: pr.left + box.left + box.width / 2, y: pr.top + box.top + box.height / 2, geo: [!!d.left.geo, !!d.right.geo] }
  })
  await page.mouse.move(target.x, target.y)
  await page.waitForTimeout(800)
  const after = await page.evaluate(() => ({ madeInFrame: window.__madeInFrame, lit: window.__reader.debug.lit, hit: window.__reader.debug.pointerHit, geo: [!!window.__reader.debug.left.geo, !!window.__reader.debug.right.geo] }))
  await page.close()
  return { id: target.id, geoAtHover: target.geo, ...after }
}
/** the pointer resting from the reader's first moment on a unit of more than one sentence on page 1 (its second line):
 *  what it lights, in order, for 3 s (the re-review of B3: the sentences found one idle period after the layout, the
 *  paragraph was lit first, then the sentence — 4 of 6 opens of 02459 and 06701 on 61619404) */
async function firstLight(b, paper) {
  const page = await b.context.newPage()
  await page.goto(b.url({ paper, mode: 'bilingual' }))
  await page.waitForFunction(() => window.__reader?.ready && window.__reader.debug?.left.anchors.size && window.__reader.debug.right.anchors.size, null, { timeout: 240_000, polling: 10 })
  const target = await page.evaluate(() => {
    const d = window.__reader.debug, s = d.left
    const id = [...s.anchors.keys()].find(i => { const a = s.anchors.get(i); return a?.rects.length >= 3 && a.rects[1].page === 1 && d.right.units.get(i)?.sentences?.src.length > 0 })
    if (id === undefined) return null
    const r = s.anchors.get(id).rects[1], box = d.toPageBox(s, r), pr = d.pageView(s, 1).div.getBoundingClientRect()
    window.__lights = []
    let last = ''
    const tick = () => { const k = `${d.lit}/${d.litSentence}`; if (k !== last) { last = k; window.__lights.push([d.lit, d.litSentence]) } if (window.__lights.length < 40) requestAnimationFrame(tick) }
    tick()
    return { id, x: pr.left + box.left + box.width / 2, y: pr.top + box.top + box.height / 2 }
  })
  if (target) await page.mouse.move(target.x, target.y)
  await page.waitForTimeout(3000)
  const lights = await page.evaluate(() => window.__lights ?? [])
  await page.close()
  return { id: target?.id ?? null, lights }
}
/** the pointer moving over the left pane from the first moment of the load (a reader's hand on the mouse), or still,
 *  until ready, then 3 s: the units each side found the sentences of, and those lit by sentence (the review of B3, C1:
 *  the left's layout asked for by the pointer while the right was reading its text found no sentence) */
async function sentencesAtLoad(b, paper, moving) {
  const page = await b.context.newPage()
  page.on('pageerror', e => check(`${b.label} ${paper}: no page error`, false, e.message))
  await page.goto(b.url({ paper, mode: 'bilingual' }))
  for (let n = 0; !(await page.evaluate(() => !!window.__reader?.ready).catch(() => false)); n++) {
    if (moving) await page.mouse.move(200 + ((n * 37) % 500), 200 + ((n * 53) % 600))
    await page.waitForTimeout(moving ? 8 : 50)
  }
  await page.waitForTimeout(3000)
  const got = await page.evaluate(() => { const d = window.__reader.debug; return { left: d.left.starts?.size ?? 0, right: d.right.starts?.size ?? 0, lit: [...(d.right.starts?.keys() ?? [])].filter(id => d.sentenced(id)).length } })
  await page.close()
  return got
}
/**
 * A pointer resting on a sentence through what the highlight is drawn by being made again, on each pane (the final
 * review of the highlight): the right side replaced (a new compile, replaceRight: at once, and held a while as a swap
 * waiting for its figures is, the idle periods coming before it), and the left anchored again (our marked original's
 * marks arriving, onOriginal). The unit runs over two pages on both sides, the panes scrolled to its later page (the
 * sync off) and the pointer on its last line there; the earlier page is above the view, so a new side has not drawn
 * it, and the sentences' fit waits for that page's geometry. What is lit and what each side paints, every frame from
 * the event to 1.5 s after it is done (`frames`: a change each, the area painted per side); what is lit 400 ms after — past the
 * miss's hold, no move — (`after`) and what a move there lights (`moved`); the sentence's paint and the whole unit's,
 * lit by the harness at the end (`refs`). `event` runs in the page; `pick` where the pointer rests (in the page, given
 * the pane and `at`)
 */
async function resting(page, pane, event, pick = OVER_TWO_PAGES, at = 0) {
  const target = await page.evaluate(pick, { pane, at })
  if (!target) return { target }
  await page.mouse.move(target.x, target.y)
  await page.waitForTimeout(1200)
  const state = () => page.evaluate(({ x, y }) => {
    const d = window.__reader.debug, rects = d.litRects()
    const under = rects.map(rs => rs.some(r => x >= r.x0 - 1 && x <= r.x1 + 1 && y >= r.y0 - 1 && y <= r.y1 + 1))
    return { lit: d.lit, s: d.litSentence, under, area: rects.map(rs => Math.round(rs.reduce((a, r) => a + (r.x1 - r.x0) * (r.y1 - r.y0), 0))) }
  }, target)
  const before = await state()
  // every frame from the event on, what is lit and painted where it changes
  await page.evaluate(() => {
    const d = window.__reader.debug, t0 = performance.now(), out = (window.__frames = [])
    let last = ''
    window.__stop = false
    const tick = () => {
      const area = d.litRects().map(rs => Math.round(rs.reduce((a, r) => a + (r.x1 - r.x0) * (r.y1 - r.y0), 0)))
      const k = `${d.lit}/${d.litSentence} ${area}`
      if (k !== last) { last = k; out.push({ t: Math.round(performance.now() - t0), lit: d.lit, s: d.litSentence, area }) }
      if (!window.__stop) requestAnimationFrame(tick)
    }
    tick()
  })
  await page.evaluate(event)
  await page.waitForTimeout(400)
  const after = await state()
  await page.waitForTimeout(1100)
  const seen = await page.evaluate(() => { window.__stop = true; return window.__frames })
  // what a move there lights
  await page.mouse.move(target.x + 1, target.y)
  await frames(page)
  const moved = await page.evaluate(() => ({ id: window.__reader.debug.pointerHit, s: window.__reader.debug.pointerSentence }))
  // the sentence's paint and the whole unit's, as the harness lights them
  const refs = await page.evaluate(({ id, s }) => {
    const d = window.__reader.debug, area = () => d.litRects().map(rs => Math.round(rs.reduce((a, r) => a + (r.x1 - r.x0) * (r.y1 - r.y0), 0)))
    d.light(null); d.light(id, s); const sentence = area()
    d.light(null); d.light(id, -1); const whole = area()
    d.light(null)
    return { sentence, whole }
  }, { id: target.id, s: before.s })
  await page.mouse.move(5, 5)
  await page.waitForTimeout(300)
  return { id: target.id, before, after, moved, frames: seen, refs }
}
/** whether a resting pointer's frames (resting) painted its sentence on each side throughout: every frame lights the
 *  unit by sentence and paints, per side, the sentence as it was before or is after (to 2 %) — never its paragraph,
 *  and never nothing (a blank frame: the new side at a swap showed nothing for 25–217 ms until its fit was worked out
 *  in a task of its own, the re-review of the final review); the last frame lights the sentence again on both sides */
function restingPainted(r) {
  const near = (a, b) => Math.abs(a - b) <= Math.max(4, 0.02 * b)
  const bad = []
  for (const f of r.frames ?? []) {
    if (f.lit !== r.id) bad.push({ ...f, why: f.lit === null ? 'nothing lit' : 'another unit' })
    else if (f.s >= 0) f.area.forEach((a, k) => { if (!a) bad.push({ ...f, why: 'blank' }); else if (!near(a, r.before.area[k]) && !near(a, r.refs.sentence[k])) bad.push({ ...f, why: near(a, r.refs.whole[k]) ? 'the paragraph' : 'neither' }) })
    else bad.push({ ...f, why: 'lit whole' })
  }
  const end = r.frames?.at(-1)
  const ok = !!end && end.lit === r.id && end.s === r.before.s && end.area.every((a, k) => a > 0 && near(a, r.refs.sentence[k]))
  return { ok: ok && bad.length === 0, bad: bad.slice(0, 4), end }
}
/** the pointer on the last line, on the later page, of a unit lit by sentence over two pages on both sides; both panes
 *  at that page */
const OVER_TWO_PAGES = async ({ pane }) => {
  const d = window.__reader.debug, sides = { L: d.left, R: d.right }
  const pagesOf = (s, id) => [...new Set(s.anchors.get(id)?.rects.map(r => r.page) ?? [])]
  for (const [id, a] of d.left.anchors) {
    if (!a || !d.sentenced(id) || pagesOf(d.left, id).length !== 2 || pagesOf(d.right, id).length !== 2) continue
    const later = s => pagesOf(s, id)[1]
    if ([d.left, d.right].some(s => s.anchors.get(id).rects.filter(r => r.page === later(s)).length < 2)) continue
    for (const s of [d.left, d.right]) s.container.scrollTop = d.pageTop(s, later(s)) + 30
    await new Promise(r => setTimeout(r, 1500))
    const s = sides[pane], r = s.anchors.get(id).rects.filter(q => q.page === later(s)).at(-1)
    const box = d.toPageBox(s, r), pr = d.pageView(s, r.page).div.getBoundingClientRect(), cr = s.container.getBoundingClientRect()
    const y = pr.top + d.pageView(s, r.page).div.clientTop + box.top + box.height / 2
    if (y < cr.top + 40 || y > cr.bottom - 40) continue
    return { id, x: pr.left + d.pageView(s, r.page).div.clientLeft + box.left + Math.min(box.width / 2, 40), y }
  }
  return null
}
/** the pointer on the middle line of a unit lit by sentence, a dozen lines or more on one page of the pane's side, that
 *  line a third of the way down the pane, at `at` of the line's width: what resizes the pages, keeping the view's top
 *  left (PDF.js), moves what is under the pointer by a few lines, so that a unit is under it after (a pointer left over
 *  nothing, null equal to null, would tell nothing) */
const MID_UNIT = async ({ pane, at }) => {
  const d = window.__reader.debug, s = pane === 'L' ? d.left : d.right
  for (const [id, a] of s.anchors) {
    if (!a || !d.sentenced(id) || !d.left.anchors.get(id) || !d.right.anchors.get(id)) continue
    const lines = a.rects.filter(r => r.page === a.rects[0].page)
    if (lines.length < 12) continue
    const r = lines[lines.length >> 1], pv = d.pageView(s, r.page)
    s.container.scrollTop = d.pageTop(s, r.page) + d.toPageBox(s, r).top - s.container.clientHeight / 3
    await new Promise(r => setTimeout(r, 1500))
    const box = d.toPageBox(s, r), pr = pv.div.getBoundingClientRect()
    return { id, x: pr.left + pv.div.clientLeft + box.left + box.width * at, y: pr.top + pv.div.clientTop + box.top + box.height / 2 }
  }
  return null
}
const SWAP = () => window.__reader.debug.swapRight()
const SWAP_HELD = () => window.__reader.debug.swapRight(800)
const REANCHOR = () => window.__reader.debug.reanchorLeft()
/** what resizes the pages or the panes, and where on a line the pointer rests through it on each pane (MID_UNIT): the
 *  contents panel moves the left pane's pages to the right by its width as it opens and back as it closes, the right
 *  pane's by half that, the pages narrowed or widened — the pointer stands where the line is still under it after.
 *  The contents button clicked where the pointer is not: a click by the mouse would move it off the pane */
const RESIZES = [
  ['a zoom', () => window.__reader.controller.zoomBy(1.1), { L: 0.5, R: 0.5 }],
  ['the zoom back to the width', () => window.__reader.controller.zoomTo('page-width'), { L: 0.5, R: 0.5 }],
  ['the contents opened', () => document.querySelector('button[aria-controls="axt-contents"]').click(), { L: 0.8, R: 0.5 }],
  ['the contents closed', () => document.querySelector('button[aria-controls="axt-contents"]').click(), { L: 0.25, R: 0.5 }],
]
/** what is painted for a unit, as the pointer lights it: its sentences' shapes where it lights by sentence (B3: the
 *  first, a middle one and the last), else its blocks — each a list of rectangles in the window by side, lit by the
 *  harness and let go */
const shapesOf = (page, id) => page.evaluate(id => {
  const d = window.__reader.debug, starts = d.sentenced(id), n = starts ? starts.length + 1 : 0
  const out = []
  for (const s of n ? [...new Set([0, n >> 1, n - 1])] : [-1]) {
    d.light(id, s)
    d.litRects().forEach((rs, k) => { for (const r of rs) if (r.x1 - r.x0 > 0) out.push({ s, side: k ? 'R' : 'L', x: r.x0, y: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0 }) })
  }
  d.light(null)
  return out
}, id)
/** for each unit: both sides scrolled to it and what it paints (shapesOf); the real pointer on a 6 × 4 grid inside each
 *  rectangle shown, 1 px inside its four sides' middles and two of its corners (the pads), and 1.5 px outside its left
 *  and right sides; what the pointer's frame found there (debug.pointerHit and pointerSentence: a miss is held, so what
 *  is lit does not tell) — its unit and, by sentence, its sentence; a smaller unit painted over it counted apart */
async function painted(page, ids) {
  const r = { points: 0, holes: 0, other: 0, otherSentence: 0, sentences: 0, pads: 0, padHoles: 0, outside: 0, outsideOwn: 0, bothSides: 0, bad: [] }
  const hitAt = async (x, y) => { await page.mouse.move(x, y); await frames(page); return page.evaluate(() => ({ id: window.__reader.debug.pointerHit, s: window.__reader.debug.pointerSentence })) }
  for (const id of ids) {
    await at(page, id)
    const bands = await shapesOf(page, id)
    if (new Set(bands.map(x => x.side)).size === 2) r.bothSides++
    r.sentences += new Set(bands.filter(b => b.s >= 0).map(b => b.s)).size
    const own = (hit, s) => hit.id === id && (s < 0 || hit.s === s)
    for (const band of bands) {
      if (band.y < 60 || band.y + band.h > 985) continue
      for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
        const hit = await hitAt(band.x + 1 + ((band.w - 2) * (i + 0.5)) / 6, band.y + 1 + ((band.h - 2) * (j + 0.5)) / 4)
        r.points++
        if (hit.id === null) r.holes++
        else if (hit.id !== id) r.other++
        else if (!own(hit, band.s)) { r.otherSentence++; if (r.bad.length < 8) r.bad.push({ id, s: band.s, side: band.side, lit: hit.s }) }
      }
      // a sentence's side may meet the next sentence's, where a point a pixel inside it reads the neighbour as soon as
      // the pointer's kept places are half a unit off (the places' own check allows that: 0.7 px zoomed): 1.5 px inside
      // a sentence's, as 1.5 px outside below (2608.06701 zoomed, one run in three: a corner read as the sentence above)
      const { x, y, w, h } = band, e = band.s >= 0 ? 1.5 : 1
      for (const [px, py] of [[x + e, y + h / 2], [x + w - e, y + h / 2], [x + w / 2, y + e], [x + w / 2, y + h - e], [x + e, y + e], [x + w - e, y + h - e]]) {
        const hit = await hitAt(px, py)
        r.pads++
        if (hit.id === null || (hit.id === id && !own(hit, band.s))) { r.padHoles++; r.bad.push({ id, s: band.s, side: band.side, at: [+(px - x).toFixed(1), +(py - y).toFixed(1)], band: [+w.toFixed(1), +h.toFixed(1)], lit: hit }) }
      }
      for (const px of [x - 1.5, x + w + 1.5]) {
        r.outside++
        if (own(await hitAt(px, y + h / 2), band.s)) r.outsideOwn++
      }
    }
  }
  return r
}
/**
 * Round 1's measure of a sentence's edges (B3), on the page's own canvas, where the text is alone (the wash is a layer
 * of its own): for each pair of sentences of a unit that share a row, on each side, the boundary between them — the one's
 * end and the next one's start, at one x — and whether the 1-px column there, across the row's band less a pixel at its
 * top and foot, holds ink (a pixel darker than 150 of 255). Counted per side
 */
async function inkCuts(page, ids) {
  const r = { L: { edges: 0, ink: 0 }, R: { edges: 0, ink: 0 }, bad: [] }
  for (const id of ids) {
    await at(page, id)
    const cuts = await page.evaluate(id => {
      const d = window.__reader.debug, starts = d.sentenced(id)
      if (!starts) return []
      const shapes = []
      for (let s = 0; s <= starts.length; s++) { d.light(id, s); shapes.push(d.litRects()) }
      d.light(null)
      const out = []
      for (let s = 0; s < starts.length; s++) for (const k of [0, 1]) {
        const a = shapes[s][k], b = shapes[s + 1][k]
        for (const p of a) for (const q of b) {
          if (Math.abs(p.y0 - q.y0) > 0.5 || Math.abs(p.y1 - q.y1) > 0.5 || Math.abs(p.x1 - q.x0) > 0.5) continue
          // the canvas under the boundary's middle: its pixel column there
          const x = p.x1, ym = (p.y0 + p.y1) / 2
          const canvas = document.elementsFromPoint(x, ym).map(e => e.closest?.('.page')?.querySelector('canvas')).find(Boolean)
          if (!canvas) continue
          const cb = canvas.getBoundingClientRect(), sx = canvas.width / cb.width, sy = canvas.height / cb.height
          const cx = Math.floor((x - cb.left) * sx), c0 = Math.ceil((p.y0 + 1 - cb.top) * sy), c1 = Math.floor((p.y1 - 1 - cb.top) * sy)
          if (cx < 0 || cx >= canvas.width || c1 <= c0) continue
          const px = canvas.getContext('2d').getImageData(cx, c0, 1, c1 - c0).data
          let ink = false
          for (let i = 0; i < px.length; i += 4) if (px[i] < 150 && px[i + 1] < 150 && px[i + 2] < 150 && px[i + 3] > 0) { ink = true; break }
          out.push({ side: k ? 'R' : 'L', s, ink, x: Math.round(x), y: Math.round(ym) })
        }
      }
      return out
    }, id)
    for (const c of cuts) { r[c.side].edges++; if (c.ink) { r[c.side].ink++; if (r.bad.length < 10) r.bad.push({ id, ...c }) } }
  }
  return r
}
/** a demo paper's units' sentences against the sentence file they were taken from, which the Node gate makes again by
 *  the reader's path from the Microsoft answers kept (highlight-gate.mjs, sentences-path.mjs; the review of B3, I2):
 *  units whose sentences differ, and those the file has that the demo leaves out (its source text not the file's) */
function demoSentences(paper) {
  const file = [join(root, 'data/runs/highlight-ten/sentences', `${paper}.json`), join(root, 'data/runs/highlight-gt/sentences', `${paper}.json`)].find(existsSync)
  if (!file) return { file: null }
  const want = JSON.parse(readFileSync(file, 'utf8')), demo = JSON.parse(readFileSync(join(PAPERS, paper, 'units.json'), 'utf8'))
  const r = { file: file.split('/').slice(-3).join('/'), units: 0, differ: 0, left: 0, first: [] }
  for (const u of demo) {
    if (u.sentences) r.units++
    if (u.sentences ? JSON.stringify(u.sentences) !== JSON.stringify(want[u.i]) : want[u.i]) { if (u.sentences) { r.differ++; if (r.first.length < 5) r.first.push(u.i) } else r.left++ }
  }
  return r
}
/** each side's tokens let go once its layout is made (the final review, I3: an arrow the layout keeps kept the scope of
 *  the anchoring that made it, and the side's tokens with it — 2608.02459's heap 31.7 MB against 10.5): both layouts
 *  and both sides' sentences made, the garbage collected twice, each side's tokens — which the reader holds weakly for
 *  this check (anchorOne) — gone; the heap after it reported */
async function tokensLetGo(b, paper) {
  const page = await open(b, paper)
  await page.waitForFunction(() => { const d = window.__reader.debug; return d.left.geo && d.right.geo && d.left.starts && d.right.starts }, null, { timeout: 30_000, polling: 100 })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('HeapProfiler.enable')
  for (let i = 0; i < 2; i++) await cdp.send('HeapProfiler.collectGarbage')
  const { usedSize } = await cdp.send('Runtime.getHeapUsage')
  const kept = await page.evaluate(() => [window.__reader.debug.left, window.__reader.debug.right].map(s => (s.tokens ? s.tokens.deref() !== undefined : null)))
  await page.close()
  const r = { kept, heapMB: +(usedSize / 1048576).toFixed(1) }
  check(`${b.label} ${paper}: each side's tokens let go once its layout is made`, kept.every(k => k === false), JSON.stringify(r))
  ;((result.checks ??= {})[`${b.label} ${paper}`] ??= {}).tokens = r
}
/** a pointer resting on each pane through the right side replaced and the left anchored again, and through what resizes
 *  the pages or the panes (resting) */
async function restingChecks(b) {
  const EVENTS = [['the right side replaced', SWAP], ['the right side replaced after a wait', SWAP_HELD], ['the left anchored again', REANCHOR]]
  const litAfter = (r, k) => !!r.id && r.before.lit === r.id && r.before.s >= 0 && r.after.lit != null && r.after.lit === r.moved.id && r.after.s === r.moved.s && r.after.under[k]
  for (const paper of CHECK) {
    const page = await open(b, paper, { sync: 'off' })
    for (const pane of ['L', 'R']) for (const [what, event] of EVENTS) {
      const r = await resting(page, pane, event)
      const k = pane === 'L' ? 0 : 1, on = `a pointer resting on the ${pane === 'L' ? 'left' : 'right'} pane through ${what}`
      check(`${b.label} ${paper}: ${on}: what is lit after is what a move there lights, painted under it`, litAfter(r, k), JSON.stringify({ ...r, frames: r.frames?.length }))
      const p = restingPainted(r)
      check(`${b.label} ${paper}: ${on}: every frame paints its sentence on both sides, never the paragraph, never nothing`, !!r.id && p.ok, JSON.stringify({ id: r.id, s: r.before?.s, before: r.before?.area, refs: r.refs, ...p }))
      ;((result.resting ??= {})[`${b.label} ${paper} ${pane} ${what}`] = r)
    }
    // a resize brings another unit under the pointer, or the same one elsewhere: what is lit after is what is under it
    for (const pane of ['L', 'R']) for (const [what, event, at] of RESIZES) {
      const r = await resting(page, pane, event, MID_UNIT, at[pane])
      const k = pane === 'L' ? 0 : 1
      check(`${b.label} ${paper}: a pointer resting on the ${pane === 'L' ? 'left' : 'right'} pane through ${what}: what is lit after is what a move there lights, painted under it`, litAfter(r, k), JSON.stringify({ id: r.id, before: r.before, after: r.after, moved: r.moved }))
      ;((result.resting ??= {})[`${b.label} ${paper} ${pane} ${what}`] = r)
    }
    await page.close()
  }
}
async function checks(b) {
  await tokensLetGo(b, CHECK[0])
  await restingChecks(b)
  for (const paper of CHECK) {
    const ds = demoSentences(paper)
    check(`${b.label} ${paper}: the demo's sentences are the file's the Node gate makes again by the reader's path`, ds.file && ds.units > 0 && ds.differ === 0, JSON.stringify(ds))
    const atRest = await sentencesAtLoad(b, paper, false), moving = await sentencesAtLoad(b, paper, true)
    check(`${b.label} ${paper}: the pointer moving from the first moment of the load: every side's sentences found, as with it still`, atRest.lit > 0 && JSON.stringify(atRest) === JSON.stringify(moving), JSON.stringify({ still: atRest, moving }))
    const firsts = []
    for (let r = 0; r < 3; r++) firsts.push(await firstLight(b, paper))
    const whole = firsts.filter(f => f.lights.some(([i, s]) => i === f.id && s === -1)), bySentence = firsts.filter(f => (f.lights.at(-1)?.[1] ?? -1) >= 0)
    check(`${b.label} ${paper}: a pointer resting from the first moment lights the sentence, never the paragraph first (3 opens)`, whole.length === 0 && bySentence.length === firsts.length, JSON.stringify(firsts))
    const e = await early(b, paper)
    check(`${b.label} ${paper}: the pointer at the reader's first moment makes no layout in a frame, and lights once they come`, e.madeInFrame === 0 && e.geo.every(Boolean) && e.hit != null && e.lit != null, JSON.stringify(e))
    const page = await open(b, paper)
    // units lit on both sides whose first lines are on the first two pages of each side, a dozen; the bands they paint
    // and the pads, after what moves the panes or redraws them
    const ids = await page.evaluate(() => {
      const d = window.__reader.debug
      return [...d.left.anchors.keys()].filter(id => { const a = d.left.anchors.get(id), c = d.right.anchors.get(id); return a && c && a.rects[0].page <= 2 && c.rects[0].page <= 2 }).slice(0, 12)
    })
    const STATES = [
      ['at the load', ids, async () => {}],
      ['with the contents open', ids.slice(0, 6), () => page.locator('button[aria-controls="axt-contents"]').click()],
      ['zoomed', ids.slice(0, 6), async () => { await page.locator('button[aria-controls="axt-contents"]').click(); await page.evaluate(() => window.__reader.controller.zoomBy(1.1)) }],
      ['with the right side replaced', ids.slice(0, 6), async () => { await page.evaluate(() => window.__reader.controller.zoomTo('page-width')); await page.evaluate(() => window.__reader.debug.swapRight()) }],
      ['with the translation alone', ids.slice(0, 6), () => page.evaluate(() => window.__reader.controller.setDisplay('translation'))],
    ]
    const placesAfterMoves = async () => {
      for (const [what, move] of MOVES) {
        await move(page)
        await page.waitForTimeout(900)
        const p = await places(page)
        check(`${b.label} ${paper}: the kept places are the layout's after ${what}`, p.n > 0 && p.bad === 0, `${p.bad} of ${p.n} points off${p.worst.length ? ` ${JSON.stringify(p.worst)}` : ''}`)
      }
    }
    for (const [state, which, enter] of STATES) {
      // after the load's: where the pointer's path keeps the panes and pages, after each of what moves them
      if (state === 'with the contents open') await placesAfterMoves()
      await enter()
      await page.waitForTimeout(900)
      const r = await painted(page, which)
      check(`${b.label} ${paper}: no hole inside what is painted, ${state}`, r.holes === 0 && r.otherSentence === 0 && r.points > 0, `${r.holes} of ${r.points} points on ${which.length} units' shapes (${r.sentences} sentences) lit nothing, ${r.otherSentence} another sentence of the unit; ${r.other} lit a smaller unit painted over them`)
      check(`${b.label} ${paper}: the pads light their unit, and 1.5 px past its sides does not, ${state}`, r.padHoles === 0 && r.outsideOwn === 0 && r.pads > 0, JSON.stringify({ pads: r.pads, padHoles: r.padHoles, outside: r.outside, outsideOwn: r.outsideOwn, first: r.bad[0] }))
      if (state === 'at the load') {
        check(`${b.label} ${paper}: both sides painted`, r.bothSides === which.length, `${r.bothSides} of ${which.length}`)
        // the units lit by sentence among them, and their boundaries on the canvas: round 1 measured 3 of 72 edges
        // through ink (two edges a boundary: the one's end and the next one's start)
        const lit = await page.evaluate(ids => ids.filter(id => window.__reader.debug.sentenced(id)), ids)
        const k = await inkCuts(page, lit)
        const edges = k.L.edges + k.R.edges, ink = k.L.ink + k.R.ink
        check(`${b.label} ${paper}: units lit by sentence among those checked`, lit.length > 0, `${lit.length} of ${ids.length}`)
        check(`${b.label} ${paper}: sentences' boundaries through ink no more than round 1's share (3 of 72 edges)`, edges > 0 && (2 * ink) / (2 * edges) <= 3 / 72, JSON.stringify({ L: k.L, R: k.R, first: k.bad.slice(0, 4) }))
        ;((result.checks ??= {})[`${b.label} ${paper}`] ??= {}).inkCuts = k
      }
      ;((result.checks ??= {})[`${b.label} ${paper}`] ??= {})[state] = { units: which.length, ...r, bad: r.bad.slice(0, 5) }
    }
    await page.evaluate(() => window.__reader.controller.setDisplay('bilingual'))
    await page.waitForTimeout(900)
    // a miss held: on a unit, then off every unit (the page's margin, a few px in from its edge)
    const off = await page.evaluate(id => { const d = window.__reader.debug, s = d.left, a = s.anchors.get(id), pv = d.pageView(s, a.rects[0].page), pr = pv.div.getBoundingClientRect(); return { x: pr.left + 4, y: pr.top + pr.height / 2 } }, ids[0])
    await at(page, ids[0])
    const band = await page.evaluate(id => { const d = window.__reader.debug; d.light(id); const r = document.querySelector('#left .axt-hl').getBoundingClientRect(); d.light(null); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, ids[0])
    await page.mouse.move(band.x, band.y)
    await frames(page)
    await page.mouse.move(off.x, off.y)
    await frames(page, 1)
    const t0 = Date.now()
    await page.waitForTimeout(50)
    const at50 = await page.evaluate(() => document.querySelectorAll('.axt-hl').length)
    await page.waitForTimeout(200)
    const at250 = await page.evaluate(() => document.querySelectorAll('.axt-hl').length)
    check(`${b.label} ${paper}: a miss keeps the wash 50 ms and lets it go by 250 ms`, at50 > 0 && at250 === 0, JSON.stringify({ at50, at250, waited: Date.now() - t0 }))
    // a wheel under a still pointer: what is lit is what is under it, as a move there finds — something, not nothing:
    // where the wheel leaves the pointer over no unit (a gap, a margin; on both papers before the final review, M1, which
    // let null equal null pass), it turns on a little, still without a move, until a unit other than the first is lit
    await at(page, ids[0])
    await page.mouse.move(band.x, band.y)
    await frames(page)
    const before = await page.evaluate(() => window.__reader.debug.lit)
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(40) }
    await page.waitForTimeout(800)
    let still = await page.evaluate(() => window.__reader.debug.lit), turns = 0
    for (; (still == null || still === before) && turns < 20; turns++) {
      await page.mouse.wheel(0, 60)
      await page.waitForTimeout(400)
      still = await page.evaluate(() => window.__reader.debug.lit)
    }
    await page.mouse.move(band.x + 1, band.y)
    await frames(page)
    const moved = await page.evaluate(() => window.__reader.debug.pointerHit)
    check(`${b.label} ${paper}: a wheel under a still pointer lights what comes under it`, still != null && still === moved && still !== before, JSON.stringify({ before, still, moved, turns }))
    // the pointer's frames read no layout: a sweep over the first unit's pages
    await at(page, ids[0])
    const s = await sweep(page)
    check(`${b.label} ${paper}: no layout forced where the highlight is written`, s.lights > 0 && s.forcedLayouts === 0, JSON.stringify({ lights: s.lights, forced: s.forcedLayouts, forcedMs: s.forcedMs }))
    result.checks[`${b.label} ${paper}`].sweep = s
    await page.close()
  }
}

// ---------------------------------------------------------------- floats (B4)
// The floats (B4: tables, algorithms and figures lit whole with their captions), checked by `checks` (or alone,
// `floats`) on FLOAT_CHECK's papers (`none`: none), the sync off; FLOATS_N the floats the pointer goes over in each:
//  - every page with a caption has its floats once drawn (all pages of both sides brought into view)
//  - the floats on both sides, per kind, no fewer than the Node gate finds (FLOATS_AT_LEAST)
//  - the real pointer on a grid inside each element a float paints (a dozen floats) lights the float (or a smaller unit
//    painted there); both sides paint it, a figure with its outline and its caption washed on both
//  - a table's cell (one the side located) lights its table, cells being found to try
//  - a page whose drawing failed has its floats from the list the worker is asked for, not from the one it was drawn
//    by (stopped short where its stream failed); drawn without a fault, from the drawn one, the worker not asked
//  - a page's floats' cost on the main thread at its first drawing (timing.floats: paths read, floats made), reported
//  Each made to fail once (B4, a build each): the pointer's frame without floatHitOf (147 of 240 points lit nothing, the
//  cell lit itself); no floats made (20 pages without, none on both sides); figures washed, not outlined (0 of 4
//  outlined); after the review of B4: figures' captions not washed (a build), no cell to try (FLOATS_N=0), the floats'
//  failure left the page asked (ad6036f7's build, the figures' stand-in throwing)
/** every page of both sides brought into view, until each page with a caption has its floats (the reader makes them on a
 *  page's first drawing); the pages that got none in 4 s */
const drawAll = page => page.evaluate(async () => {
  const d = window.__reader.debug, missing = []
  const wants = (s, p) => (s.geo.unitsOn[p] ?? []).some(id => d.unitKind.get(id) === 'caption')
  for (const s of [d.left, d.right]) for (let p = 1; p <= s.doc.numPages; p++) {
    s.viewer.currentPageNumber = p
    const t0 = performance.now()
    while (performance.now() - t0 < 4000 && (d.pageView(s, p).renderingState !== 3 || (wants(s, p) && !d.floatsOn(s, p)))) await new Promise(r => setTimeout(r, 30))
    if (wants(s, p) && !d.floatsOn(s, p)) missing.push([s === d.left ? 'L' : 'R', p])
  }
  return missing
})
/** the floats each side has, by caption: { L: { id: { page, kind, members } }, R } */
const floatsOf = page => page.evaluate(() => {
  const d = window.__reader.debug, out = {}
  for (const [k, s] of [['L', d.left], ['R', d.right]]) {
    out[k] = {}
    for (let p = 1; p <= s.doc.numPages; p++) for (const f of d.floatsOn(s, p) ?? []) out[k][f.id] = { page: p, kind: f.kind, members: [...f.members].filter(id => d.unitKind.get(id) === 'cell') }
  }
  return out
})
/** a page whose floats fail at its first drawing — what they are given there making their code throw (a drawing
 *  cancelled rejects its list, the same way out) — gets them at its next drawing (a zoom): the page is not left marked
 *  as asked (the review of B4). The figures the floats read come from the side's draft frames where it has them: a
 *  stand-in there that is no list of figures makes their code throw once */
async function floatRetry(b, paper) {
  const page = await open(b, paper, { sync: 'off' })
  const r = await page.evaluate(async () => {
    const d = window.__reader.debug, s = d.left
    const wants = p => (s.geo.unitsOn[p] ?? []).some(id => d.unitKind.get(id) === 'caption')
    let p = 0
    for (let n = 1; n <= s.doc.numPages && !p; n++) if (wants(n) && d.pageView(s, n).renderingState === 0 && !d.floatsOn(s, n)) p = n
    if (!p) return { p }
    let spoiled = 0
    s.frames = Promise.resolve({ get: n => { if (n === p) spoiled++; return {} } })
    const wait = async ok => { for (let t = 0; t < 120 && !ok(); t++) await new Promise(r => setTimeout(r, 50)) }
    s.viewer.currentPageNumber = p
    await wait(() => d.pageView(s, p).renderingState === 3)
    await new Promise(r => setTimeout(r, 500))
    const first = !!d.floatsOn(s, p)
    s.frames = null
    window.__reader.controller.zoomBy(1.1)
    await wait(() => d.floatsOn(s, p))
    return { p, spoiled, first, after: !!d.floatsOn(s, p) }
  })
  check(`${b.label} ${paper}: a page whose floats failed at its first drawing gets them at its next`, r.p > 0 && r.spoiled > 0 && !r.first && r.after, JSON.stringify(r))
  await page.close()
}
/** a page drawn with an error (pagerendered's `error`): the list it was drawn by may have stopped short — PDF.js marks a
 *  list whose stream failed complete — so its floats come from the list the worker is asked for (the review of B4's
 *  fix round, minor 7a). The page's first drawing held back from the floats, its drawn list cut to its first operation
 *  and the page's drawing reported failed: the worker is asked, and the floats are those of the page drawn again
 *  without a fault, which read the drawn list and ask nothing */
async function floatDrawError(b, paper) {
  const page = await open(b, paper, { sync: 'off' })
  const r = await page.evaluate(async () => {
    const d = window.__reader.debug, s = d.left
    const wants = p => (s.geo.unitsOn[p] ?? []).some(id => d.unitKind.get(id) === 'caption')
    let p = 0
    for (let n = 1; n <= s.doc.numPages && !p; n++) if (wants(n) && d.pageView(s, n).renderingState === 0 && !d.floatsOn(s, n)) p = n
    if (!p) return { p }
    const wait = async ok => { for (let t = 0; t < 120 && !ok(); t++) await new Promise(r => setTimeout(r, 50)) }
    const asked = (s.geo.floatsAsked ??= new Set())
    asked.add(p)
    s.viewer.currentPageNumber = p
    await wait(() => d.pageView(s, p).renderingState === 3)
    await new Promise(r => setTimeout(r, 300))
    const pv = d.pageView(s, p), pg = pv.pdfPage
    let st = null
    for (const x of pg._intentStates.values()) if (x.displayReadyCapability && x.operatorList?.lastChunk) st = x
    if (!st) return { p, held: false }
    let calls = 0
    const getOperatorList = pg.getOperatorList
    pg.getOperatorList = function (...a) { calls++; return getOperatorList.apply(this, a) }
    const show = fs => JSON.stringify((fs ?? []).map(f => [f.id, f.kind, ...['x0', 'y0', 'x1', 'y1'].map(k => Math.round(f.region[k] * 10) / 10)]))
    const full = st.operatorList
    st.operatorList = { ...full, fnArray: full.fnArray.slice(0, 1), argsArray: full.argsArray.slice(0, 1), lastChunk: true }
    asked.delete(p)
    s.eventBus.dispatch('pagerendered', { source: pv, pageNumber: p, cssTransform: false, timestamp: performance.now(), error: new Error('the operator list\'s stream failed') })
    st.operatorList = full
    await wait(() => d.floatsOn(s, p))
    const got = show(d.floatsOn(s, p)), askedOnError = calls
    calls = 0
    s.geo.floats.delete(p)
    asked.delete(p)
    s.eventBus.dispatch('pagerendered', { source: pv, pageNumber: p, cssTransform: false, timestamp: performance.now() })
    await wait(() => d.floatsOn(s, p))
    const want = show(d.floatsOn(s, p))
    pg.getOperatorList = getOperatorList
    return { p, held: true, askedOnError, askedDrawn: calls, got, want }
  })
  check(`${b.label} ${paper}: a page whose drawing failed has its floats from the worker's list, a page drawn whole from its drawn one`, r.held && r.askedOnError > 0 && r.askedDrawn === 0 && r.got === r.want && r.want !== '[]', JSON.stringify(r))
  await page.close()
}
async function floatChecks(b) {
  if (FLOAT_CHECK.length) await floatRetry(b, FLOAT_CHECK[0])
  if (FLOAT_CHECK.length) await floatDrawError(b, FLOAT_CHECK[0])
  for (const paper of FLOAT_CHECK) {
    // the sync off: each side stands where it is put (a settle's glide moved the pane under the pointer's grid)
    const page = await open(b, paper, { sync: 'off' })
    const missing = await drawAll(page)
    check(`${b.label} ${paper}: every page with a caption has its floats once drawn`, missing.length === 0, JSON.stringify(missing))
    const fl = await floatsOf(page)
    const both = Object.keys(fl.L).filter(id => fl.R[id])
    const kinds = {}
    for (const id of both) kinds[fl.L[id].kind] = (kinds[fl.L[id].kind] ?? 0) + 1
    const want = FLOATS_AT_LEAST[paper] ?? {}
    check(`${b.label} ${paper}: floats on both sides, per kind, no fewer than ${JSON.stringify(want)}`, Object.entries(want).every(([k, n]) => (kinds[k] ?? 0) >= n), JSON.stringify(kinds))
    // the real pointer: a grid inside each element a float paints lights the float (or a smaller unit painted there);
    // a held cell's middle lights its float; both sides paint it, a figure with its outline
    const r = { floats: 0, points: 0, holes: 0, other: 0, others: [], bothSides: 0, frames: 0, washed: 0, figures: 0, cells: 0, cellsOff: [], bad: [] }
    const hitAt = async (x, y) => { await page.mouse.move(x, y); await frames(page); return page.evaluate(() => window.__reader.debug.pointerHit) }
    for (const id of both.slice(0, Number(process.env.FLOATS_N ?? 12)).map(Number)) {
      await page.evaluate(async ({ id, pl, pr }) => {
        const d = window.__reader.debug
        for (const [s, p] of [[d.left, pl], [d.right, pr]]) { s.container.scrollTop = d.pageTop(s, p) - 20; await new Promise(r => setTimeout(r, 400)) }
        for (const [s, p] of [[d.left, pl], [d.right, pr]]) for (let t = 0; t < 80 && !d.floatsOn(s, p); t++) await new Promise(r => setTimeout(r, 50))
        void id
      }, { id, pl: fl.L[id].page, pr: fl.R[id].page })
      const bands = await page.evaluate(id => {
        const d = window.__reader.debug
        d.light(id)
        const out = [...document.querySelectorAll('.axt-hl')].map(e => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, frame: e.classList.contains('axt-hl-frame'), side: e.closest('#left') ? 'L' : 'R' } }).filter(b => b.w > 0)
        d.light(null)
        return out
      }, id)
      r.floats++
      if (new Set(bands.map(x => x.side)).size === 2) r.bothSides++
      if (fl.L[id].kind === 'figure') {
        r.figures++
        if (bands.some(x => x.frame && x.side === 'L') && bands.some(x => x.frame && x.side === 'R')) r.frames++
        // its caption washed on both sides
        if (bands.some(x => !x.frame && x.side === 'L') && bands.some(x => !x.frame && x.side === 'R')) r.washed++
      }
      for (const band of bands) {
        if (band.y < 60 || band.y + band.h > 985) continue
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
          const hit = await hitAt(band.x + 2 + ((band.w - 4) * (i + 0.5)) / 4, band.y + 2 + ((band.h - 4) * (j + 0.5)) / 3)
          r.points++
          if (hit === null) { r.holes++; if (r.bad.length < 3) r.bad.push({ id, side: band.side }) } else if (hit !== id) { r.other++; if (r.others.length < 3) r.others.push({ id, hit, side: band.side }) }
        }
      }
      for (const cell of fl.L[id].members.slice(0, 2)) {
        const at = await page.evaluate(cell => { const d = window.__reader.debug, s = d.left, a = s.anchors.get(cell), q = a.rects[0], pv = d.pageView(s, q.page), pr = pv.div.getBoundingClientRect(), [x, y] = pv.viewport.convertToViewportPoint((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2); return { x: pr.left + pv.div.clientLeft + x, y: pr.top + pv.div.clientTop + y } }, cell)
        if (at.y < 60 || at.y > 985) continue
        r.cells++
        const hit = await hitAt(at.x, at.y)
        if (hit !== id) r.cellsOff.push({ cell, hit, float: id })
      }
    }
    check(`${b.label} ${paper}: the pointer anywhere a float paints lights it, both sides painted, a figure outlined and its caption washed on both`, r.points > 0 && r.holes === 0 && r.bothSides === r.floats && r.frames === r.figures && r.washed === r.figures, JSON.stringify({ ...r, cellsOff: undefined }))
    check(`${b.label} ${paper}: a table's cell lights its table`, r.cells > 0 && r.cellsOff.length === 0, JSON.stringify({ cells: r.cells, off: r.cellsOff.slice(0, 3) }))
    // what a page's floats cost the main thread at its first drawing (paths read, floats made)
    const ms = (await page.evaluate(() => window.__reader.timing.floats ?? [])).map(x => x.paths + x.floats)
    ;((result.floats ??= {})[`${b.label} ${paper}`] = { kinds, both: both.length, L: Object.keys(fl.L).length, R: Object.keys(fl.R).length, ...r, pageMs: stats(ms) })
    console.log(`  ${paper}: floats L ${Object.keys(fl.L).length}, R ${Object.keys(fl.R).length}, both ${both.length} ${JSON.stringify(kinds)}; a page's floats, ms ${JSON.stringify(stats(ms))}`)
    await page.close()
  }
}

// ---------------------------------------------------------------- costs
/** the sweep's path: 220 points down a pane's whole height, zig-zagging across it every 20 points */
const path = (page, side) => page.evaluate(side => {
  const d = window.__reader.debug, c = (side === 'L' ? d.left : d.right).container.getBoundingClientRect(), pts = []
  for (let i = 0; i < 220; i++) { const t = (i % 40) / 20, tri = t <= 1 ? t : 2 - t; pts.push({ x: c.left + 30 + (c.width - 60) * tri, y: c.top + 30 + ((c.height - 60) * i) / 220 }) }
  return pts
}, side)
async function sweep(page) {
  await page.evaluate(() => {
    window.__lt = []; window.__mut = []
    new PerformanceObserver(l => window.__lt.push(...l.getEntries().map(e => e.duration))).observe({ type: 'longtask' })
    // when the highlight is written: a band added or removed
    const mo = new MutationObserver(rs => { if (rs.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.classList?.contains('axt-hl')))) window.__mut.push(performance.now()) })
    for (const c of document.querySelectorAll('.viewerContainer')) mo.observe(c, { subtree: true, childList: true })
  })
  const pts = [...(await path(page, 'L')), ...(await path(page, 'R'))]
  const events = await trace(page, async () => {
    await page.evaluate(() => { console.timeStamp('hl-gate'); window.__sync = performance.now() })
    for (const p of pts) { await page.mouse.move(p.x, p.y); await page.waitForTimeout(12) }
    await page.waitForTimeout(400)
  })
  const got = await page.evaluate(() => ({ mut: window.__mut, lt: window.__lt, sync: window.__sync }))
  const stamp = events.find(e => e.name === 'TimeStamp' && e.args?.data?.message === 'hl-gate')
  const offset = stamp.ts / 1000 - got.sync, main = events.filter(e => e.tid === stamp.tid && e.pid === stamp.pid && e.ph === 'X')
  const sl = main.filter(e => e.name === 'UpdateLayoutTree' || e.name === 'Layout').sort((a, b) => a.ts - b.ts)
  const tasks = main.filter(e => e.name === 'FireAnimationFrame' || (e.name === 'EventDispatch' && e.args?.data?.type === 'mousemove')).sort((a, b) => a.ts - b.ts)
  const paints = main.filter(e => e.name === 'Paint' || e.name === 'PrePaint' || e.name === 'UpdateLayerTree').map(e => e.ts).sort((a, b) => a - b)
  // a light: the task in which a band was written (its mutation record comes at its end, a microtask)
  const script = [], after = [], forced = []
  for (const t of got.mut.map(m => (m + offset) * 1000)) {
    const task = tasks.filter(e => e.ts <= t && e.ts + e.dur >= t - 2000).at(-1)
    if (!task) continue
    const end = task.ts + task.dur
    script.push(task.dur / 1000)
    const inside = sl.filter(y => y.ts >= task.ts && y.ts < end)
    if (inside.length) forced.push(inside.reduce((a, y) => a + y.dur, 0) / 1000)
    const next = paints.find(x => x >= end) ?? end + 16700
    after.push(sl.filter(y => y.ts >= end && y.ts < next).reduce((a, y) => a + y.dur, 0) / 1000)
  }
  return { moves: pts.length, lights: script.length, script: stats(script), styleLayout: stats(after), forcedLayouts: forced.length, forcedMs: stats(forced), longTasks: { n: got.lt.length, total: +got.lt.reduce((a, b) => a + b, 0).toFixed(1) }, raw: { script, after } }
}
async function scroll(page, id) {
  await at(page, id)
  await page.evaluate(id => { window.__reader.debug.light(id); window.__lt = []; new PerformanceObserver(l => window.__lt.push(...l.getEntries().map(e => e.duration))).observe({ type: 'longtask' }) }, id)
  const c = await page.evaluate(() => { const r = window.__reader.debug.left.container.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await page.mouse.move(c.x, c.y)
  for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 600); await page.waitForTimeout(16) }
  for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, -600); await page.waitForTimeout(16) }
  await page.waitForTimeout(1500)
  const lt = await page.evaluate(() => window.__lt)
  return { n: lt.length, total: +lt.reduce((a, b) => a + b, 0).toFixed(1), max: q(lt, 1) }
}
async function opening(b, paper) {
  const page = await b.context.newPage()
  await page.addInitScript(() => { window.__lt = []; new PerformanceObserver(l => window.__lt.push(...l.getEntries().map(e => ({ at: e.startTime, ms: e.duration })))).observe({ type: 'longtask', buffered: true }) })
  await page.goto(b.url({ paper, mode: 'bilingual' }))
  await page.waitForFunction(() => window.__reader?.ready, null, { timeout: 240_000, polling: 50 })
  const ready = await page.evaluate(() => performance.now())
  await page.waitForTimeout(3000)
  const r = await page.evaluate(ready => { const t = window.__reader.timing; return { ready, opened: t.opened, anchors: t.anchors, leftLayout: t.leftLayout ?? null, rightLayout: t.rightLayout ?? null, leftSentences: t.leftSentences ?? null, rightSentences: t.rightSentences ?? null, longTasks: window.__lt.filter(x => x.at < ready + 3000) } }, ready)
  await page.close()
  return { ...r, longTasks: { n: r.longTasks.length, total: +r.longTasks.reduce((a, x) => a + x.ms, 0).toFixed(1) } }
}
async function costs(builds) {
  for (let round = 0; round < ROUNDS; round++) for (const b of round % 2 ? [...builds].reverse() : builds) {
    for (const [paper, unit] of SWEEP) {
      const page = await open(b, paper)
      await at(page, unit)
      const s = await sweep(page)
      const f = await scroll(page, unit)
      await page.close()
      ;((result.sweep ??= {})[`${paper} ${b.label}`] ??= []).push({ ...s, fastScroll: f })
      console.log(round, b.label, paper, 'sweep', JSON.stringify({ ...s, raw: undefined }), 'fast scroll', JSON.stringify(f))
    }
    for (const paper of OPEN) {
      const o = await opening(b, paper)
      ;((result.open ??= {})[`${paper} ${b.label}`] ??= []).push(o)
      console.log(round, b.label, paper, 'open', JSON.stringify(o))
    }
  }
  // per build and paper, the rounds pooled
  result.summary = {}
  for (const [key, runs] of Object.entries(result.sweep ?? {})) {
    result.summary[`sweep ${key}`] = { lights: runs.map(r => r.lights), script: stats(runs.flatMap(r => r.raw.script)), styleLayout: stats(runs.flatMap(r => r.raw.after)), forced: runs.map(r => r.forcedLayouts), longTasks: runs.map(r => r.longTasks), fastScroll: runs.map(r => r.fastScroll) }
    for (const r of runs) delete r.raw
  }
  for (const [key, runs] of Object.entries(result.open ?? {})) result.summary[`open ${key}`] = { readyMs: stats(runs.map(r => r.ready)), anchorsMs: stats(runs.map(r => r.anchors)), layoutMs: stats(runs.flatMap(r => [r.leftLayout, r.rightLayout].filter(x => x != null))), sentencesMs: stats(runs.flatMap(r => [r.leftSentences, r.rightSentences].filter(x => x != null))), longTasks: runs.map(r => r.longTasks) }
  for (const [key, v] of Object.entries(result.summary)) console.log(key, JSON.stringify(v))
  if (builds.length < 2) return
  // the limits against BASE
  const [b, h] = [builds.find(x => x.label === 'base').label, builds.find(x => x.label !== 'base').label]
  const sum = xs => xs.reduce((a, x) => a + x, 0)
  const within = (what, head, base, add, times = 1) => check(`${h} against BASE: ${what}`, head != null && base != null && head <= base * times + add, `${head} against ${base} (limit ${base == null ? '?' : +(base * times + add).toFixed(2)})`)
  for (const [paper] of SWEEP) {
    const H = result.summary[`sweep ${paper} ${h}`], B = result.summary[`sweep ${paper} ${b}`]
    for (const f of ['script', 'styleLayout']) { within(`${paper} per light, ${f} p50`, H[f].p50, B[f].p50, 0.1); within(`${paper} per light, ${f} p95`, H[f].p95, B[f].p95, 0.25) }
    check(`${h} against BASE: ${paper} no layout forced where the highlight is written`, sum(H.forced) === 0, JSON.stringify(H.forced))
    within(`${paper} the sweeps' long tasks`, sum(H.longTasks.map(x => x.n)), sum(B.longTasks.map(x => x.n)), ROUNDS)
    within(`${paper} the fast scroll's long tasks, ms`, +sum(H.fastScroll.map(x => x.total)).toFixed(1), +sum(B.fastScroll.map(x => x.total)).toFixed(1), 50 * ROUNDS, 1.15)
  }
  for (const paper of OPEN) {
    const H = result.summary[`open ${paper} ${h}`], B = result.summary[`open ${paper} ${b}`]
    within(`${paper} the open, ready p50 ms`, H.readyMs.p50, B.readyMs.p50, 10, 1.03)
    within(`${paper} the open, anchoring p50 ms`, H.anchorsMs.p50, B.anchorsMs.p50, 10, 1.03)
  }
}

const head = await launch(BUILD, process.env.LABEL ?? 'head')
const base = BASE && (what === 'costs' || what === 'all') ? await launch(BASE, 'base') : null
try {
  if (what === 'checks' || what === 'all') await checks(head)
  if (what === 'resting') await restingChecks(head)
  if (what === 'tokens') await tokensLetGo(head, CHECK[0])
  if (what === 'checks' || what === 'all' || what === 'floats') await floatChecks(head)
  if (what === 'costs' || what === 'all') await costs(base ? [base, head] : [head])
} finally {
  await head.context.close()
  await base?.context.close()
}
mkdirSync(join(root, 'out'), { recursive: true })
writeFileSync(join(root, 'out/highlight-gate-browser.json'), JSON.stringify(result, null, 1))
console.log(failed ? `${failed} failed` : 'all passed')
process.exitCode = failed ? 1 : 0
