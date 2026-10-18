// The capsule's motion, frame by frame (M5; the web's round 4, its tools/capsule-frames.mjs and motion.mjs ported): the
// capsule's dev page (src/entrypoints/capsule, a dev page) plays a whole run at real speed — queued → preparing →
// translating, its count in bursts → a digit gained → making the pages — and every animation frame is measured: the
// words' ink against the border (only ink over 2 % opaque, within 0.5 px), the height (34 px) and the lines (one), each
// change moving the width one way, the width still between changes while the count changes in place, the counts shown
// at least 300 ms apart, and the frame intervals (none over 25 ms). At round 4's six settings, then four changes 80 ms
// apart, the window narrowed mid-run, a sentence too long for the window, an action that comes kept out of reach until it
// shows (Chromium's own accessibility tree, over CDP; focus in every engine), and reduced motion (only opacity and filter
// move, the spinner stands). The page is served over http from the development build, so that each engine opens it:
//   pnpm exec wxt build --mode development && node tests/e2e/probes/capsule.mjs [--engine chromium,firefox,webkit]
// The interval limit blocks in Chromium; headless Firefox and WebKit pace their frames unevenly, so there the intervals
// are recorded and the other limits block. A setting whose intervals run over is run once more before it counts: one
// slow frame can be the machine's load. Exits 1 on a failure or a page error
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, firefox, webkit } from 'playwright'

const OUT = fileURLToPath(new URL('../../../.output/chrome-mv3-dev', import.meta.url))
const PAGE = join(OUT, 'capsule.html')
// a dev server's build loads its scripts from localhost, and is no use without the server
if (!existsSync(PAGE) || readFileSync(PAGE, 'utf8').includes('localhost')) throw new Error('no capsule page: pnpm exec wxt build --mode development first')
const ENGINES = { chromium, firefox, webkit }
const arg = process.argv.find(a => a.startsWith('--engine'))
const engines = (arg?.includes('=') ? arg.split('=')[1] : arg ? process.argv[process.argv.indexOf(arg) + 1] : 'chromium').split(',')

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.wasm': 'application/wasm' }
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://local').pathname))
  const file = join(OUT, path)
  if (!file.startsWith(OUT + sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404)
    res.end()
    return
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const BASE = `http://127.0.0.1:${server.address().port}/capsule.html`

let failed = 0
const check = (what, ok, detail = '') => {
  console.log(ok ? `ok   ${what}${detail ? ` — ${detail}` : ''}` : `FAIL ${what} — ${detail}`)
  if (!ok) failed++
}
const note = (what, detail) => console.log(`note ${what} — ${detail}`)

/** every animation frame's capsule, and when each change of the count drawn was made (in the page) */
const RECORD = () => {
  window.__cf = []
  window.__shown = []
  // a count shown: digits put in a line already drawn (not a new line's own, which is built before it is placed), stamped
  // as they are put there, once a task — a MutationObserver's callback comes after the change's own work, which under
  // load read a count several ms late
  let stamped = false
  for (const name of ['append', 'prepend']) {
    const put = Element.prototype[name]
    Element.prototype[name] = function (...nodes) {
      if (!stamped && this.isConnected && this.matches('.dg, .num') && !this.closest('.line[data-state]') && nodes.some(n => n instanceof Element && n.matches('.d, .dg'))) {
        stamped = true
        window.__shown.push(performance.now())
        queueMicrotask(() => { stamped = false })
      }
      return put.apply(this, nodes)
    }
  }
  const opacity = (e, cap) => { let o = 1; for (let x = e; x && x !== cap; x = x.parentElement) o *= Number(getComputedStyle(x).opacity); return o }
  const loop = t => {
    const cap = document.querySelector('.capsule:not([data-out])')
    if (cap) {
      const r = cap.getBoundingClientRect()
      const lines = [...cap.querySelectorAll('.words > .line')]
      const live = lines.filter(l => !l.dataset.state).at(-1)
      // the ink of every part that shows (over 2 % opaque): its text's own boxes against the border
      let past = Number.NEGATIVE_INFINITY, pastOut = Number.NEGATIVE_INFINITY
      for (const e of [...lines, ...cap.querySelectorAll(':scope > .after')]) {
        if (opacity(e, cap) <= 0.02) continue
        const range = document.createRange()
        range.selectNodeContents(e)
        let p = Number.NEGATIVE_INFINITY
        for (const q of range.getClientRects()) if (q.width > 0) p = Math.max(p, q.right - r.right, r.left - q.left)
        if (e.dataset.state === 'out') pastOut = Math.max(pastOut, p)
        else past = Math.max(past, p)
      }
      window.__cf.push({
        t, h: r.height, w: r.width, past, pastOut,
        entering: cap.getAnimations().some(a => a.animationName === 'capsule-in'),
        lines: Math.max(0, ...lines.map(l => Math.round(l.getBoundingClientRect().height / 17))),
        // a change: other words (their digits aside), what follows them, or the count's number of digits
        words: live ? live.textContent.replace(/\d/g, '') : '', chip: !!cap.querySelector(':scope > .after:not([data-state])'),
        digits: live ? live.querySelectorAll('.num > .dg:not([data-close])').length : 0,
        wrap: cap.hasAttribute('data-wrap'),
      })
    } else window.__cf.push({ t })
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

/** the page's clock step: Firefox and WebKit give performance.now() in whole milliseconds, Chromium in tenths. Read
 *  once the frames are recorded: the busy wait it takes held up the frame after it */
const TICK = () => {
  let tick = Number.POSITIVE_INFINITY
  for (let last = performance.now(), end = last + 20; last < end;) {
    const n = performance.now()
    if (n > last) tick = Math.min(tick, n - last)
    last = n
  }
  return tick
}

/** the run's frames measured against M5; `tick`, the page's clock step */
function measure(frames, shown, tick = 0) {
  const f = frames.filter(x => x.h !== undefined)
  const gaps = frames.slice(1).map((x, i) => x.t - frames[i].t)
  const steady = f.filter(x => !x.entering)
  const H = steady.map(x => x.h)
  const inks = f.filter(x => Number.isFinite(x.past) || Number.isFinite(x.pastOut)).map(x => Math.max(x.past, x.pastOut))
  // the changes: where the words, what follows them or the count's digits change
  const key = x => `${x.words}|${x.chip}|${x.digits}`
  const changes = []
  for (let i = 1; i < f.length; i++) if (key(f[i]) !== key(f[i - 1])) changes.push(i)
  const rows = [], windows = []
  for (const i of changes) {
    // the change's frames: up to its last width step within a second, before the next change
    const next = changes.find(c => c > i) ?? f.length
    let j = i
    for (let k = i + 1; k < Math.min(next, i + 60); k++) if (Math.abs(f[k].w - f[k - 1].w) > 0.01) j = k
    const end = Math.min(f.length - 1, j + 1)
    const seg = f.slice(i - 1, end + 1)
    windows.push([i - 1, end])
    let step = 0, back = false, dir = 0
    for (let k = 1; k < seg.length; k++) {
      const d = seg[k].w - seg[k - 1].w
      step = Math.max(step, Math.abs(d))
      if (Math.abs(d) > 0.01) {
        const s = Math.sign(d)
        if (dir && s !== dir) back = true
        dir = s
      }
    }
    rows.push({ from: `${f[i - 1].words.trim()}${f[i - 1].chip ? ' +chip' : ''} (${f[i - 1].digits})`, to: `${f[i].words.trim()}${f[i].chip ? ' +chip' : ''} (${f[i].digits})`, w: [seg[0].w, seg.at(-1).w], step, back, ms: f[end].t - f[i - 1].t })
  }
  // the width between changes: still, as the count changes in place
  let between = 0
  for (let k = 1; k < f.length; k++) {
    if (windows.some(([a, b]) => k > a && k <= b + 1) || f[k].entering || f[k - 1].entering) continue
    between = Math.max(between, Math.abs(f[k].w - f[k - 1].w))
  }
  const shownGaps = shown.slice(1).map((t, i) => t - shown[i])
  return {
    frames: f.length, height: [Math.min(...H), Math.max(...H)], lines: Math.max(...f.map(x => x.lines)), ink: Math.max(...inks), inkFrames: inks.filter(x => x > 0.5).length,
    longest: Math.max(...gaps), over: gaps.filter(g => g > 25).length, rows, between, shown: shown.length, minGap: shownGaps.length ? Math.min(...shownGaps) : Number.POSITIVE_INFINITY, tick,
  }
}

/** one of round 4's settings: the whole run played and measured */
async function record(browser, { width, scheme, lang, chip, motion = 'no-preference' }) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 780 : 900 }, colorScheme: scheme, reducedMotion: motion })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${BASE}?lang=${lang}${chip ? '&chip=1' : ''}`)
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(RECORD)
  // the run's first change must not fall on the record's first frame
  await page.waitForTimeout(300)
  const ms = await page.evaluate(() => window.__capsule.play())
  await page.waitForTimeout(ms + 500)
  const out = await page.evaluate(() => ({ frames: window.__cf, shown: window.__shown }))
  out.tick = await page.evaluate(TICK)
  await context.close()
  return { ...measure(out.frames, out.shown, out.tick), errors }
}

const SETTINGS = [
  { width: 1440, scheme: 'light', lang: 'zh-CN', chip: false },
  { width: 1440, scheme: 'dark', lang: 'en', chip: false },
  { width: 390, scheme: 'light', lang: 'en', chip: false },
  { width: 390, scheme: 'dark', lang: 'zh-CN', chip: true },
  { width: 320, scheme: 'light', lang: 'en', chip: false },
  { width: 320, scheme: 'dark', lang: 'en', chip: true },
]
const nameOf = s => `${s.width} ${s.scheme} ${s.lang}${s.chip ? ' with its chip' : ''}`

for (const engine of engines) {
  const browser = await ENGINES[engine].launch()
  const blocks = engine === 'chromium'
  console.log(`\n# ${engine}`)
  // the first run's first frame is otherwise slow: a page opened, its fonts loaded and a capsule drawn, first
  {
    const page = await browser.newPage()
    await page.goto(`${BASE}?lang=zh-CN`)
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => window.__capsule.set({ stage: 'translating', n: 9, total: 86, pages: 0 }))
    await page.waitForTimeout(400)
    await page.close()
  }
  for (const setting of SETTINGS) {
    let m = await record(browser, setting)
    if (m.longest > 25) {
      note(`${engine} ${nameOf(setting)}: intervals over 25 ms, run once more`, `longest ${m.longest.toFixed(1)} ms, ${m.over} over`)
      m = await record(browser, setting)
    }
    const at = `${engine} ${nameOf(setting)}`
    check(`${at}: no page error`, m.errors.length === 0, m.errors.join('; '))
    check(`${at}: the words' ink never past the border`, m.inkFrames === 0, `at most ${m.ink.toFixed(2)} px past it (negative: inside), ${m.inkFrames} frames over 0.5 px`)
    check(`${at}: 34 px high and one line in every frame`, Math.abs(m.height[0] - 34) <= 0.05 && Math.abs(m.height[1] - 34) <= 0.05 && m.lines === 1, `${m.height.map(h => h.toFixed(2)).join('–')} px, ${m.lines} line(s), ${m.frames} frames`)
    const intervals = `longest ${m.longest.toFixed(1)} ms, ${m.over} over 25 ms`
    if (blocks) check(`${at}: no frame interval over 25 ms`, m.over === 0, intervals)
    else note(`${at}: frame intervals (recorded)`, intervals)
    const want = setting.chip ? 5 : 4
    check(`${at}: each of ${m.rows.length} changes moves its width one way`, m.rows.length >= want && m.rows.every(r => !r.back), m.rows.map(r => `${r.from} → ${r.to}: ${r.w.map(w => w.toFixed(1)).join(' → ')} px, step ${r.step.toFixed(2)}, ${r.back ? 'turns back' : 'one way'}, ${Math.round(r.ms)} ms`).join('; '))
    check(`${at}: the width still between changes, the count moving in place`, m.between <= 0.01, `largest step ${m.between.toFixed(3)} px`)
    // read on the page's own clock, which the engine keeps time by too: one step of it is the reading's own error
    check(`${at}: two shown counts at least 300 ms apart`, m.shown > 5 && m.minGap >= 300 - m.tick - 1e-6, `${m.shown} counts shown, ${m.minGap.toFixed(1)} ms apart at the least (the page's clock in steps of ${m.tick.toFixed(1)} ms)`)
  }

  // four changes 80 ms apart, each landing mid-way through the last one's motion
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    await page.goto(`${BASE}?lang=en`)
    await page.evaluate(() => window.__capsule.set({ stage: 'queued', n: 0, total: 86, pages: 0 }))
    await page.waitForTimeout(600)
    await page.evaluate(RECORD)
    await page.evaluate(() => new Promise(done => {
      const steps = [{ stage: 'preparing', n: 0 }, { stage: 'translating', n: 3 }, { stage: 'typesetting', n: 86 }, { stage: 'translating', n: 40 }]
      steps.forEach((s, i) => { setTimeout(() => { window.__capsule.set({ total: 86, pages: 0, ...s }); if (i === steps.length - 1) setTimeout(done, 700) }, 80 * (i + 1)) })
    }))
    const m = measure(await page.evaluate(() => window.__cf), [])
    check(`${engine} interrupted, four changes 80 ms apart: the ink inside, 34 px, one line`, m.inkFrames === 0 && Math.abs(m.height[0] - 34) <= 0.05 && Math.abs(m.height[1] - 34) <= 0.05 && m.lines === 1, `ink at most ${m.ink.toFixed(2)} px, ${m.height.map(h => h.toFixed(2)).join('–')} px, ${m.lines} line(s)`)
    await context.close()
  }

  // the window narrowed mid-run: the words held to one line where they fit, the ink inside
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    await page.goto(`${BASE}?lang=en`)
    await page.evaluate(() => window.__capsule.set({ stage: 'translating', n: 12, total: 86, pages: 0 }))
    await page.waitForTimeout(500)
    await page.evaluate(RECORD)
    await page.setViewportSize({ width: 390, height: 780 })
    await page.evaluate(() => window.__capsule.set({ stage: 'translating', n: 18, total: 86, pages: 0 }))
    await page.waitForTimeout(500)
    await page.setViewportSize({ width: 320, height: 780 })
    await page.waitForTimeout(500)
    const m = measure(await page.evaluate(() => window.__cf), [])
    check(`${engine} the window narrowed mid-run: one line, 34 px, the ink inside`, m.inkFrames === 0 && m.lines === 1 && Math.abs(m.height[1] - 34) <= 0.05, `ink at most ${m.ink.toFixed(2)} px, ${m.height.map(h => h.toFixed(2)).join('–')} px, ${m.lines} line(s)`)
    await context.close()
  }

  // a sentence too long for one line at the window's width: wrapped and balanced, inside the window, its words inside it
  {
    const context = await browser.newContext({ viewport: { width: 320, height: 780 } })
    const page = await context.newPage()
    await page.goto(`${BASE}?lang=en`)
    await page.evaluate(() => window.__capsule.set({ stage: null, n: 0, total: 0, pages: 0, text: 'Preparing' }))
    await page.waitForTimeout(400)
    await page.evaluate(() => window.__capsule.set({ stage: null, n: 0, total: 0, pages: 0, text: "A bilingual PDF isn't available in Bahasa Indonesia yet, so the original is shown" }))
    await page.waitForTimeout(500)
    const w = await page.evaluate(() => {
      const c = document.querySelector('.capsule'), r = c.getBoundingClientRect(), line = c.querySelector('.words > .line:not([data-state])')
      const range = document.createRange()
      range.selectNodeContents(line)
      const q = [...range.getClientRects()].filter(x => x.width > 0)
      return { wrap: c.hasAttribute('data-wrap'), box: [r.left, r.right], vw: innerWidth, ink: [Math.min(...q.map(x => x.left)), Math.max(...q.map(x => x.right))], lines: Math.round(line.getBoundingClientRect().height / 17), balance: getComputedStyle(line).textWrap }
    })
    check(`${engine} a sentence too long for one line: wrapped and balanced, inside the window, its words inside the capsule`, w.wrap && w.lines >= 2 && /balance/.test(w.balance ?? 'balance') && w.box[0] >= 0 && w.box[1] <= w.vw && w.ink[0] >= w.box[0] && w.ink[1] <= w.box[1], JSON.stringify(w))
    await context.close()
  }

  // an action that comes while the box opens for it (Codex on #317): unseen, it is inert — it cannot be focused and is not
  // in the accessibility tree — until its entrance begins; then it can be, with the keyboard's ring; under reduced motion
  // at once
  for (const motion of ['no-preference', 'reduce']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 780 }, reducedMotion: motion })
    const page = await context.newPage()
    await page.goto(`${BASE}?lang=zh-CN&chip=1`)
    await page.evaluate(() => window.__capsule.set({ stage: 'translating', n: 25, total: 86, pages: 0 }))
    await page.waitForTimeout(500)
    const reach = () => page.evaluate(() => {
      const chip = document.querySelector('.capsule .after:not([data-state]) .chip')
      if (!chip) return null
      chip.focus()
      const focused = document.activeElement === chip
      chip.blur()
      return { focused, inert: !!chip.closest('[inert]') }
    })
    // the chip in the browser's own accessibility tree, by its words: Chromium's, over CDP (Playwright's role reading
    // counts what is inert; Firefox's and WebKit's trees are not reachable, and there the engine's inert holds it out)
    const cdp = engine === 'chromium' ? await context.newCDPSession(page) : null
    const told = async () => {
      if (!cdp) return null
      const name = await page.locator('.capsule .after .chip').first().textContent()
      const { nodes } = await cdp.send('Accessibility.getFullAXTree')
      return nodes.filter(n => !n.ignored && n.role?.value === 'button' && n.name?.value === name).length
    }
    await page.evaluate(() => window.__capsule.set({ stage: 'translating', n: 25, total: 86, pages: 2 }))
    await page.waitForTimeout(60)
    const waiting = { ...(await reach()), told: await told() }
    await page.waitForTimeout(500)
    const shown = { ...(await reach()), told: await told() }
    // the keyboard's way to it, and its ring: Tab from the top of the page
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    let ring = null
    for (let i = 0; i < 4 && !ring; i++) {
      await page.keyboard.press(engine === 'webkit' ? 'Alt+Tab' : 'Tab')
      ring = await page.evaluate(() => { const a = document.activeElement; return a?.matches('.capsule .chip') ? getComputedStyle(a).outline : null })
    }
    if (motion === 'reduce') check(`${engine} reduced motion: an action that comes can be focused at once`, waiting.focused && !waiting.inert && waiting.told !== 0, JSON.stringify(waiting))
    else check(`${engine} an action that comes is inert while the box opens for it: not focusable, not in the accessibility tree`, waiting.focused === false && waiting.inert && !waiting.told, JSON.stringify(waiting))
    check(`${engine}${motion === 'reduce' ? ' reduced motion:' : ''} once shown, the action can be focused, by the keyboard too, with its ring`, shown.focused && !shown.inert && shown.told !== 0 && /2px/.test(ring ?? ''), JSON.stringify({ shown, ring }))
    await context.close()
  }

  // reduced motion: gentler, not none — opacity with the 2 px blur; nothing slides, the width snaps, the spinner stands
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto(`${BASE}?lang=en`)
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(RECORD)
    await page.waitForTimeout(300)
    const ms = await page.evaluate(() => window.__capsule.play())
    const seen = new Set(), spins = new Set()
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      const sample = await page.evaluate(() => {
        const cap = document.querySelector('.capsule')
        if (!cap) return { moved: [], spin: null }
        // every animation on the capsule but its entrance and exit; a 0 s one (the width's late snap) changes nothing
        // over time
        const moved = cap.getAnimations({ subtree: true }).filter(a => !['capsule-in', 'capsule-out'].includes(a.animationName) && (a.effect?.getTiming().duration ?? 1) > 0)
          .flatMap(a => (a.animationName ? [`animation ${a.animationName}`] : a.transitionProperty ? [a.transitionProperty] : a.effect.getKeyframes().flatMap(k => Object.keys(k).filter(x => !['offset', 'easing', 'composite', 'computedOffset'].includes(x)))))
        const spin = cap.querySelector(':scope > .spin')
        return { moved, spin: spin && getComputedStyle(spin).animationName }
      })
      for (const p of sample.moved) seen.add(p)
      if (sample.spin) spins.add(sample.spin)
      await page.waitForTimeout(47)
    }
    await page.waitForTimeout(500)
    const spin = [...spins].join(', ')
    const m = measure(await page.evaluate(() => window.__cf), [])
    const moved = [...seen].map(p => p.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`))
    check(`${engine} reduced motion: only opacity and filter move, the spinner stands`, moved.length > 0 && moved.every(p => p === 'opacity' || p === 'filter') && spin === 'none', `animated: ${moved.join(', ') || 'none'}; the spinner's animation: ${spin || 'no spinner seen'}`)
    check(`${engine} reduced motion: the words' ink never past the border`, m.inkFrames === 0, `at most ${m.ink.toFixed(2)} px past it, ${m.frames} frames`)
    await context.close()
  }
  await browser.close()
}
server.close()
console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
