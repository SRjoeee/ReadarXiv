// lab/pdf/spikes/layer-gate/door-jump.mjs
// The layer gate's page for the jump (--door-jump; the 1b-D design §6, items 4 and 6, X1 and J): a page asked for FIRST and
// ALONE in a page load of its own (a fresh open of the reader's door, layer-gate/door-common.mjs openDoor: BUNDLE 3's open,
// the rows taken at once and ended), the answer compared by the driver with the page the same door gives asked in order
// (door-order.mjs `ref`; the copy drawn over the reference's PNG of the page, served at /door/<name>/s<p>.png). J, what the
// ask cost before the page was ready: the pages of the paper PDF.js was asked for (the layer's, not this page's own),
// the removed pages beyond them, the units laid and drawn, and with `perf` the time (the open, then the ask) and the longest
// task the browser reports (50 ms or more) while the page was laid. Today the engine lays in order, so J is the prefix up to
// the page; the engine's closure (Need(p), 1b-D1) is compared with it where the engine exposes one (`closureOf` of
// layer-proto/need.mjs): until then `closure` is null and the driver prints 'closure: n/a'; where it is exposed the report says
// so, and D1 adds the comparison (it needs the run's K entries, which the engine does not give a host yet)
import { answerOf, bytes, lastRun, openDoor, recsOf } from '/gate/door-common.mjs'

window.doorJump = {
  async ask({ name, target, rules, page, perf = false }) {
    const longTasks = []
    let observer = null
    const t0 = performance.now()
    const d = await openDoor({ name, target, rules })
    const t1 = performance.now()
    if (perf && typeof PerformanceObserver === 'function') {
      observer = new PerformanceObserver(list => { for (const e of list.getEntries()) longTasks.push(e.duration) })
      observer.observe({ type: 'longtask' })
    }
    const got = await d.layer.pageOf(page, { lang: target })
    const t2 = performance.now()
    // (what the ask drew and laid, read at once: the harness asks PDF.js for nothing before this)
    const j = { drawn: [...d.drawn].sort((a, b) => a - b), extra: d.extra.size, units: d.layer.stats().drawn }
    const answer = await answerOf(d.layer, page, got, await bytes(`/door/${name}/s${page}.png`))
    answer.recs = await recsOf(lastRun(), page)
    if (observer) { await new Promise(ok => setTimeout(ok, 0)); observer.takeRecords().forEach(e => longTasks.push(e.duration)); observer.disconnect() }
    // (an engine from before need.mjs has no closure either: null, never a failed ask)
    const need = await import('/engine/layer-proto/need.mjs').catch(() => null)
    await d.done()
    return {
      ...answer, j, completes: d.completes, closure: typeof need?.closureOf === 'function' ? 'exposed' : null,
      ...(perf ? { ms: { open: Math.round(t1 - t0), ask: Math.round(t2 - t1) }, longest: longTasks.length ? Math.round(Math.max(...longTasks)) : 0 } : {}),
    }
  },
}
window.gateReady = true
