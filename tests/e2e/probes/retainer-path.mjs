// Probe: who keeps the translations alive after a restore (retained-nodes.mjs says how many). Takes a heap snapshot
// after the restore and walks strong references backwards from detached translation elements to a GC root, printing
// the shortest paths. Needs an unminified build for the names to mean anything.
// Usage: AXT_EXT_DIR=.output/chrome-mv3-profile node tests/e2e/probes/retainer-path.mjs [paper]
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = resolve(process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url)))
const PAPER = process.argv[2] ?? '2410.00260'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const context = await chromium.launchPersistentContext(`${E2E}.profile-hl`, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`], viewport: { width: 1440, height: 900 } })
let [worker] = context.serviceWorkers()
if (!worker) worker = await context.waitForEvent('serviceworker')
const toTab = message => worker.evaluate(async m => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); return chrome.tabs.sendMessage(tab.id, m) }, message)
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await page.goto(`https://arxiv.org/html/${PAPER}`, { waitUntil: 'load' })
await page.bringToFront()
await sleep(3500)
await toTab({ type: 'axt:translate-page' })
await sleep(2000)
await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 1200) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)) } window.scrollTo(0, 0) })
await sleep(5000)
await toTab({ type: 'axt:restore-page' })
await sleep(2000)
await cdp.send('HeapProfiler.collectGarbage')
await cdp.send('HeapProfiler.collectGarbage')

const chunks = []
cdp.on('HeapProfiler.addHeapSnapshotChunk', e => chunks.push(e.chunk))
await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
await context.close()
const snap = JSON.parse(chunks.join(''))
const { node_fields: NF, edge_fields: EF, node_types: NT, edge_types: ET } = snap.snapshot.meta
const N = NF.length, E = EF.length
const nodes = snap.nodes, edges = snap.edges, strings = snap.strings
const iType = NF.indexOf('type'), iName = NF.indexOf('name'), iEdgeCount = NF.indexOf('edge_count'), iDetached = NF.indexOf('detachedness')
const eType = EF.indexOf('type'), eName = EF.indexOf('name_or_index'), eTo = EF.indexOf('to_node')
const nodeCount = nodes.length / N
// reverse edges, strong ones only
const firstEdge = new Uint32Array(nodeCount + 1)
for (let i = 0, e = 0; i < nodeCount; i++) { firstEdge[i] = e; e += nodes[i * N + iEdgeCount] } firstEdge[nodeCount] = edges.length / E
const retainers = Array.from({ length: nodeCount }, () => [])
for (let i = 0; i < nodeCount; i++) for (let e = firstEdge[i]; e < firstEdge[i + 1]; e++) {
  const type = ET[0][edges[e * E + eType]]
  if (type === 'weak' || type === 'shortcut') continue
  const to = edges[e * E + eTo] / N
  const label = type === 'element' || type === 'hidden' ? `[${edges[e * E + eName]}]` : strings[edges[e * E + eName]]
  retainers[to].push({ from: i, label, type })
}
const nameOf = i => `${strings[nodes[i * N + iName]].slice(0, 70)}${iDetached >= 0 && nodes[i * N + iDetached] === 2 ? ' ⟂detached' : ''} (${NT[0][nodes[i * N + iType]]})`
{
  // What the snapshot calls a detached node, before anything is assumed about it
  const tally = new Map()
  for (let i = 0; i < nodeCount; i++) {
    const name = strings[nodes[i * N + iName]]
    const d = iDetached >= 0 ? nodes[i * N + iDetached] : -1
    if (d === 2 || /^Detached /.test(name)) tally.set(name.slice(0, 60), (tally.get(name.slice(0, 60)) ?? 0) + 1)
  }
  console.log('detached by name:', JSON.stringify([...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)))
}
const targets = []
for (let i = 0; i < nodeCount; i++) if ((iDetached < 0 || nodes[i * N + iDetached] === 2 || /^Detached /.test(strings[nodes[i * N + iName]])) && /<p |<table |HTMLParagraphElement|HTMLTableElement/.test(strings[nodes[i * N + iName]])) targets.push(i)
console.log(`${nodeCount} heap nodes; ${targets.length} detached <p>/<table> elements`)
// shortest strong path to the root (node 0), breadth first, from a few of them
const seen = new Map()
for (const start of targets.slice(0, 400)) {
  const prev = new Map([[start, null]])
  let queue = [start], found = null
  while (queue.length && found === null) {
    const next = []
    for (const at of queue) {
      if (at === 0 || NT[0][nodes[at * N + iType]] === 'synthetic') { found = at; break }
      for (const r of retainers[at]) if (!prev.has(r.from)) { prev.set(r.from, { at, label: r.label }); next.push(r.from) }
    }
    queue = next
    if (prev.size > 200000) break
  }
  if (found === null) continue
  const path = []
  for (let at = found; prev.get(at); at = prev.get(at).at) path.push(`${nameOf(at)} --${prev.get(at).label}-->`)
  path.push(nameOf(start))
  const key = path.slice(0, -1).map(s => s.replace(/@\d+|\[\d+\]/g, '')).join(' ')
  seen.set(key, { count: (seen.get(key)?.count ?? 0) + 1, path })
}
for (const { count, path } of [...seen.values()].sort((a, b) => b.count - a.count).slice(0, 4)) console.log(`\n×${count}\n  ${path.join('\n  ')}`)
