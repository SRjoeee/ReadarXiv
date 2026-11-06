// The harness page: the reader's parts, driven by the checks (run.mjs) through `window.__h`. Nothing here reaches the network
// but the page's own origin and the stand-in of arXiv's server, which the route table answers.
import { rangeSource } from '../../src/bytes/source.ts'
import { openRanged } from '../../src/bytes/ranged.ts'
import { chunkStore } from '../../src/bytes/store.ts'
import { createPanes, type Panes } from '../../src/panes/panes.ts'
import { loadKit } from '../../src/pdfjs/kit.ts'
import { ownedClock } from '../../src/stack/clock.ts'
import { createScheduler } from '../../src/stack/scheduler.ts'
import { addSheets } from '../../src/styles.ts'

const root = document.getElementById('root') as HTMLElement
const h = {
  panes: null as Panes | null,
  t0: 0,
  marks: [] as { what: string; at: number; [k: string]: unknown }[],
  /** the panes over the original at `url` (a path of our server's, else arXiv's absolute URL) */
  async open(url: string) {
    h.t0 = performance.now()
    const kit = await loadKit()
    root.className = 'axt-reader'
    addSheets(root, kit.sheet)
    const left = document.createElement('div'),
      right = document.createElement('div')
    left.className = 'axt-pane left'
    right.className = 'axt-pane right'
    root.append(left, right)
    const clock = ownedClock()
    const scheduler = createScheduler({ warn: (w, e) => console.warn(w, e) })
    const panes = createPanes({
      root,
      left,
      right,
      kit,
      scheduler,
      clock,
      pageName: (s, n) => `${s} page ${n}`,
      openExternal: (u) => h.marks.push({ what: 'external', at: 0, url: u }),
      warn: (w, e) => console.warn(w, e),
    })
    h.panes = panes
    panes.on('drawn', (e) =>
      h.marks.push({
        what: 'drawn',
        at: performance.now() - h.t0,
        side: e.side,
        page: e.page,
        scale: e.scale,
        key: e.key,
      }),
    )
    panes.on('scale', (e) => h.marks.push({ what: 'scale', at: performance.now() - h.t0, scale: e.scale }))
    const own = url.startsWith('/')
    const source = rangeSource({ fetch: (u, i) => fetch(u, i), url, own, store: chunkStore() })
    const task = openRanged(kit.lib as never, source, { options: kit.options('original') })
    const doc = await task.promise
    panes.right.contentOf = () => ({ key: 'original', doc, config: null, own: true, over: null })
    const r = await panes.open(doc)
    h.marks.push({ what: 'opened', at: performance.now() - h.t0, r })
    return { pages: doc.numPages, asks: source.counts.asks, bytes: source.counts.bytes }
  },
  /** each page's box on both panes: [width, height, top in the pane's scroll] */
  boxes() {
    const p = h.panes as Panes
    const out: { n: number; left: number[] | null; right: number[] | null }[] = []
    for (let n = 1; n <= p.right.pages; n++) {
      const of = (side: 'left' | 'right') => {
        const d = p.pageElement(side, n)
        if (!d) return null
        const r = d.getBoundingClientRect()
        // (its top in the pane's scroll, whatever the follower's transform: the stack is then its offsetParent)
        const stack = d.parentElement as HTMLElement
        const top = d.offsetTop + (d.offsetParent === stack ? stack.offsetTop : 0)
        return [Math.round(r.width * 100) / 100, Math.round(r.height * 100) / 100, top]
      }
      out.push({ n, left: of('left'), right: of('right') })
    }
    return out
  },
  probe: () => h.panes?.probe() ?? null,
}
;(globalThis as { __h?: typeof h }).__h = h
