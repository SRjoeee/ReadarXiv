// lab/pdf/spikes/layer-gate/door-order.mjs
// The layer gate's page for the order of the asks (--door-order; the 1b-D design §6, item 3, X2): ONE open of the reader's door
// a mode (layer-gate/door-common.mjs openDoor: BUNDLE 3's open, the rows taken at once and ended), whose pages are asked for
// in an order of the mode's, and each compared with the page the same door gives asked in order, 1 to N, in a page load of
// its own (`ref`: its PDF.js drawing of each page kept as PNG, which every run's copyOf is drawn over, as door-parts.mjs).
//   reverse      the pages N to 1, each awaited
//   seed:<s>     the pages in an order drawn from <s>, each awaited
//   burst:<s>    the pages in an order drawn from <s>, in bursts of 1 to 4 asks made at once, a second ask for a page of the
//                burst now and then (a re-ask: its answer must equal the first's), an ask of the burst aborted by its signal
//                (at once, or a macrotask or two later; one that lost the race to its page being ready resolves, which is
//                not a failure), the pages whose ask was aborted asked for again in a later burst
// Each page's answer: its SVG's markup, its word table's digest (words.mjs), copyOf's pixels over the reference's PNG of the
// page and the digest of the records of the units on it (the run is reached through the driver's stand-in of run.mjs). Once
// the pages are asked: every page's state and the units left and why. Today the engine lays in order whatever is asked, so
// every mode must equal the reference; the modes exist to fail on the day it does not
import { answerOf, base64, bytes, K, lastRun, macrotask, openDoor, pngOf, recsOf, rngOf, shuffled, skippedOf, statesOf, wordsDigest } from '/gate/door-common.mjs'

/** what a door holds once its pages are asked: every page's state, the units left and why (sorted), the units drawn */
const heldOf = (layer, N) => ({ states: statesOf(layer, N), skipped: skippedOf(lastRun()), drawn: layer.stats().drawn })
const isAbort = e => e?.name === 'AbortError'

window.doorOrder = {
  /** the reference: the pages asked in order, 1 to `pages`, each awaited; each page's PDF.js drawing at K kept as PNG */
  async ref({ name, target, rules, pages }) {
    const d = await openDoor({ name, target, rules })
    const out = []
    for (let p = 1; p <= Math.min(pages, d.N); p++) {
      const got = await d.layer.pageOf(p, { lang: target })
      const page = await d.doc.getPage(p)
      const viewport = page.getViewport({ scale: K })
      // (sized as v0 sizes its own original, which it is compared with: drawCopy's pages of its own round up)
      const drawn = document.createElement('canvas')
      drawn.width = Math.floor(viewport.width)
      drawn.height = Math.floor(viewport.height)
      await page.render({ canvas: drawn, canvasContext: drawn.getContext('2d'), viewport }).promise
      const png = await pngOf(drawn)
      drawn.width = 0
      drawn.height = 0
      out.push({ ...(await answerOf(d.layer, p, got, png)), png: base64(png) })
    }
    for (const e of out) e.recs = await recsOf(lastRun(), e.p)
    const held = heldOf(d.layer, d.N)
    await d.done()
    return { pages: out, ...held }
  },

  /** one open, the pages asked in `mode`'s order over the reference's PNGs (served at /door/<name>/s<p>.png) */
  async order({ name, target, rules, pages, mode }) {
    const d = await openDoor({ name, target, rules })
    const n = Math.min(pages, d.N), all = Array.from({ length: n }, (_, i) => i + 1)
    const [kind, seedText] = mode.split(':'), rnd = rngOf(Number(seedText ?? 0))
    const answers = new Map(), repeats = [], errors = []
    const stat = { asks: 0, aborted: 0, abortLost: 0, reasks: 0, bursts: 0, order: [] }
    /** a resolved ask of page p: the first answer is kept, each later one must be equal to it (a re-ask, or an ask of an aborted page that lost the race) */
    const settle = async (p, got) => {
      if (!answers.has(p)) {
        answers.set(p, answerOf(d.layer, p, got, await bytes(`/door/${name}/s${p}.png`)))
        await answers.get(p)
        return
      }
      const first = await answers.get(p)
      const markup = got.svg.cloneNode(true)
      markup.removeAttribute('lang')
      if (markup.outerHTML !== first.svg || (await wordsDigest(got.words)) !== first.words) repeats.push(p)
    }
    const ask = async (p, o = {}) => {
      stat.asks++
      stat.order.push(p)
      try { await settle(p, await d.layer.pageOf(p, { lang: target, ...o })); return 'resolved' } catch (e) {
        if (isAbort(e)) return 'aborted'
        errors.push(`page ${p}: ${String(e?.message ?? e).slice(0, 160)}`)
        return 'failed'
      }
    }
    if (kind === 'reverse') for (const p of all.slice().reverse()) await ask(p)
    else if (kind === 'seed') for (const p of shuffled(all, rnd)) await ask(p)
    else if (kind === 'burst') {
      const queue = shuffled(all, rnd), tried = new Set()
      while (queue.length) {
        const burst = queue.splice(0, 1 + Math.floor(rnd() * 4))
        stat.bursts++
        const asks = burst.map(p => {
          // (only a page's first ask is aborted, so that the run ends: the page is asked again in a later burst)
          const first = !tried.has(p)
          tried.add(p)
          const ctl = new AbortController()
          const abort = first && rnd() < 1 / 3 ? Math.floor(rnd() * 3) : -1
          return { p, done: ask(p, { signal: ctl.signal }), abort, ctl }
        })
        // a second ask of the first page at once, with no signal
        if (rnd() < 0.3) { stat.reasks++; asks.push({ p: burst[0], done: ask(burst[0]), abort: -1, ctl: null }) }
        for (const a of asks) if (a.abort >= 0) (async () => { for (let i = 0; i < a.abort; i++) await macrotask(); a.ctl.abort() })()
        for (const a of asks) {
          const r = await a.done
          if (r === 'aborted') { stat.aborted++; queue.push(a.p) } else if (r === 'resolved' && a.abort >= 0) stat.abortLost++
        }
      }
    } else throw new Error(`--door-order=${mode}: reverse, seed:<s> or burst:<s>`)
    const out = []
    for (const p of all) {
      const a = answers.has(p) ? await answers.get(p) : null
      if (a) a.recs = await recsOf(lastRun(), p)
      out.push(a ?? { p, missing: true })
    }
    const held = heldOf(d.layer, d.N)
    await d.done()
    return { pages: out, ...held, repeats, errors, stat: { ...stat, order: stat.order.slice(0, 64) } }
  },
}
window.gateReady = true
