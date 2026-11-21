// The reader's toolbar, frame by frame from its first paint: the arXiv id beside the contents' button is drawn only
// where the lead can hold it (PaperTitle measures it against the lead's width). It used to be measured in an effect, after
// the first paint, so a lead too narrow for it drew it for two frames before it went. What a frame paints of the id is its
// box as the frame's last ResizeObserver delivery gives it: a delivery comes after the frame's layout and before its paint,
// and PaperTitle decides in its own observer's first callback (the lead's), rendering the answer there, which lays the id
// out again in the same frame; an observation deeper than the lead (the id's) is delivered after it, in the same frame. An
// observer of the id, made ahead of the page's own scripts, keeps its last answer, and a requestAnimationFrame loop records
// it, for each frame from the one the id first stands in the page, at the next frame's start. The reader on a demo paper
// (spikes/reader-papers.mjs made it), at 390, 500 and 700 px.
// Build first (`pnpm build`). BUILD=<dir> another build. Exits non-zero on a FAIL.
//   node tests/e2e/probes/title-first-frame.mjs
import { BUILD, launchWithReader } from '../lib/extension.mjs'

const paper = process.env.PAPER ?? '2608.02163'
const extension = process.env.BUILD ?? BUILD
let failed = 0
const row = (ok, name, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`); if (!ok) failed++ }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const { context, readerUrl } = await launchWithReader({ profile: 'title-first-frame', demos: true, extension, viewport: { width: 1440, height: 900 } })
// the observer and the loop start with the document, before the page's modules: no frame of the page escapes them
await context.addInitScript(() => {
  const frames = []
  window.__frames = frames
  // (the id's box as the frame's last delivery saw it: drawn where it has a width; null before its first)
  let id = null, seen = null
  const ro = new ResizeObserver(entries => { for (const e of entries) seen = e.contentRect.width > 0 })
  new MutationObserver(() => {
    const now = document.querySelector('[data-arxiv]')
    if (now === id) return
    if (id) ro.unobserve(id)
    id = now
    seen = null
    if (id) ro.observe(id)
  }).observe(document, { subtree: true, childList: true })
  // (each frame's start records what the frame before painted)
  let was = null
  const tick = () => {
    if (was) frames.push({ at: performance.now(), present: true, drawn: seen === true })
    was = id?.isConnected ? id : null
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})

const FRAMES = 40 // from the first frame the id stands in the page: two thirds of a second
const results = {}
for (const width of [390, 500, 700]) {
  const page = await context.newPage()
  page.on('pageerror', e => { console.log(`FAIL no page error at ${width} px — ${e.message}`); failed++ })
  await page.setViewportSize({ width, height: 900 })
  await page.goto(readerUrl({ paper, mode: 'bilingual' }))
  await page.waitForFunction(n => window.__frames?.filter(f => f.present).length >= n, FRAMES, { timeout: 60_000, polling: 100 })
  await sleep(300)
  const frames = (await page.evaluate(() => window.__frames)).filter(f => f.present).slice(0, FRAMES)
  const drawn = frames.filter(f => f.drawn).length
  results[width] = { frames: frames.length, drawn }
  await page.close()
}
for (const width of [390, 500]) {
  const { frames, drawn } = results[width]
  row(frames === FRAMES && drawn === 0, `at ${width} px the id is never drawn in a frame before it goes`, `drawn in ${drawn} of the first ${frames} frames it stands in the page`)
}
{
  const { frames, drawn } = results[700]
  row(frames === FRAMES && drawn === frames, 'at 700 px it is drawn in every frame', `drawn in ${drawn} of the first ${frames} frames it stands in the page`)
}
await context.close()
console.log(failed ? `${failed} FAIL` : 'every row PASS')
process.exit(failed ? 1 : 0)
