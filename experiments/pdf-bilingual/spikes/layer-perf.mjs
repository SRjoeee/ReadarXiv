// experiments/pdf-bilingual/spikes/layer-perf.mjs
// The instant layer's cost budget (the maintainer's rule, 2026-10-07): exp/layer may cost no more than the shipping path
// (the hybrid at f267adb9, drawing the old way), beyond noise; a cost that buys a fidelity gain is named, and small.
// From several runs of each (layer-gate.mjs --perf, one pass a run, run alternately so that the machine's load falls on
// both alike), the medians:
//   - browser, per page: the first drawing (v0's page step: the original drawn, the units laid and painted, and over the
//     text-removed PDF its ink read and its removed pages drawn), the drawing again at twice the resolution (the original
//     drawn there, then drawCopy), the canvases held and the JS heap live (after a collection) at their peak; and where
//     the new path's time goes
//     (its own split: render, text, ink, removed pages, lay, operations, compose, SVG);
//   - server, per paper: the layout maker (its operator lists within it, which the remover shares), the remover beyond
//     them;
//   - reader download, per paper: the layout file (gzipped), the add-on (deflated already) and its manifest (gzipped).
// The rule: a time may be at most 10 % above the old path's median; a byte count, a canvas count and the heap at most
// what the old path's is (the heap 10 %: Chromium's count moves by itself). Each line that fails is listed.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/layer-perf.mjs --old=<run.json>,… --new=<run.json>,… [--record] [--label=<new's name>]
//   --record  records/layer-perf.json and layer-perf.md (this repository's), the budget table with the runs it was made of
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { shownPath } from './layer-gate/ref.mjs'

const arg = name => { const a = process.argv.find(x => x === `--${name}` || x.startsWith(`--${name}=`)); return a === undefined ? null : a.includes('=') ? a.slice(name.length + 3) : true }
const files = k => String(arg(k) ?? '').split(',').filter(Boolean).map(f => resolve(f))
const OLD = files('old').map(f => JSON.parse(readFileSync(f, 'utf8'))), NEW = files('new').map(f => JSON.parse(readFileSync(f, 'utf8')))
if (!OLD.length || !NEW.length) throw new Error('--old=<run.json>,… --new=<run.json>,…: runs of layer-gate.mjs --perf')
for (const r of [...OLD, ...NEW]) if (!r.perf) throw new Error(`${r.made}: not a --perf run`)
const TIME_TOLERANCE = 0.1, HEAP_TOLERANCE = 0.1
/** a run's engine as the record keeps it: its checkout's path with no user's name in it (layer-gate/ref.mjs shownPath) */
const REPO = resolve(new URL('../../..', import.meta.url).pathname)
const engineOf = r => ({ ...r.engine, root: shownPath(r.engine?.root, REPO) })

const median = xs => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : null }
const r1 = v => (v === null || v === undefined ? null : Math.round(v * 10) / 10)

/** per fixture and page, each value's median over the runs; then the fixture's: the median over its pages (times), the
 *  peak (memory); and the pooled pages' */
function browser(runs) {
  const byPage = new Map()
  for (const run of runs) for (const [name, f] of Object.entries(run.fixtures)) for (const e of f.pages) {
    if (!e.perf) continue
    const key = `${name}|${e.p}`
    if (!byPage.has(key)) byPage.set(key, { name, p: e.p, list: [] })
    byPage.get(key).list.push(e.perf)
  }
  const pages = [...byPage.values()].map(({ name, p, list }) => {
    const m = f => median(list.map(f))
    const split = {}
    for (const k of ['render', 'text', 'ink', 'rp', 'lay', 'ops', 'compose', 'svg']) split[k] = m(x => x.times?.[k])
    return { name, p, firstDraw: m(x => x.firstDraw), zoom: m(x => x.zoomRender + x.zoomCopy), zoomRender: m(x => x.zoomRender), zoomCopy: m(x => x.zoomCopy), canvasBytes: m(x => x.canvasBytes), jsHeap: m(x => x.jsHeap), split }
  })
  const fixtures = {}
  for (const pg of pages) (fixtures[pg.name] ??= []).push(pg)
  const sum = list => {
    const split = {}
    for (const k of ['render', 'text', 'ink', 'rp', 'lay', 'ops', 'compose', 'svg']) split[k] = r1(median(list.map(x => x.split[k])))
    return { pages: list.length, firstDraw: r1(median(list.map(x => x.firstDraw))), zoom: r1(median(list.map(x => x.zoom))), zoomRender: r1(median(list.map(x => x.zoomRender))), zoomCopy: r1(median(list.map(x => x.zoomCopy))), canvasPeak: Math.max(...list.map(x => x.canvasBytes ?? 0)), heapPeak: Math.max(...list.map(x => x.jsHeap ?? 0)), split }
  }
  return { fixtures: Object.fromEntries(Object.entries(fixtures).map(([n, l]) => [n, sum(l)])), all: sum(pages) }
}
/** per paper, the server's costs' medians over the runs */
function server(runs) {
  const out = {}
  for (const paper of Object.keys(runs[0].perf.server)) {
    const list = runs.map(r => r.perf.server[paper]).filter(Boolean)
    const m = f => median(list.map(f))
    const rem = list.some(x => x.remover) ? { parse: m(x => x.remover?.parse), ink: m(x => x.remover?.ink), plan: m(x => x.remover?.plan), make: m(x => x.remover?.make), ops: m(x => x.remover?.ops) } : null
    out[paper] = { makerMs: m(x => x.maker?.ms), makerOpsMs: m(x => x.maker?.opsMs), removerMs: rem ? rem.parse + rem.ink + rem.plan + rem.make : 0, remover: rem, layoutBytes: list[0].layoutBytes, layoutGzip: list[0].layoutGzip, addonBytes: list[0].addonBytes, manifestGzip: list[0].manifestGzip, download: list[0].download }
  }
  return out
}

const old = { browser: browser(OLD), server: server(OLD) }, now = { browser: browser(NEW), server: server(NEW) }
const fails = []
const check = (what, a, b, kind) => {
  if (a === null || b === null || a === undefined || b === undefined) return ''
  const limit = kind === 'time' ? a * (1 + TIME_TOLERANCE) : kind === 'heap' ? a * (1 + HEAP_TOLERANCE) : a
  const ok = b <= limit + 1e-9
  if (!ok) fails.push(`${what}: ${a} -> ${b}`)
  return ok ? 'ok' : '**over**'
}
const L = []
const label = typeof arg('label') === 'string' ? arg('label') : 'exp/layer'
L.push('# The instant layer\'s cost budget', '')
L.push(`Written by \`spikes/layer-perf.mjs\` from ${OLD.length} runs of the old path (the engine at \`${OLD[0].engine.commit?.slice(0, 8)}\`) and ${NEW.length} of ${label} (\`${NEW[0].engine.commit?.slice(0, 8)}\`), each \`layer-gate.mjs --perf\` (one worker, the model tier), alternately. Each value is the median over the runs; a fixture's time is its pages' median, its memory their peak. The rule: a time at most ${100 * TIME_TOLERANCE} % over the old path's, a byte or canvas count at most the old path's, the JS heap at most ${100 * HEAP_TOLERANCE} % over it.`, '')
L.push('## Browser, per page (all fixtures pooled)', '')
L.push('| item | old path | ' + label + ' | rule |', '|---|---|---|---|')
const A = old.browser.all, B = now.browser.all
L.push(`| first drawing, ms (median page) | ${A.firstDraw} | ${B.firstDraw} | ${check('first drawing (all)', A.firstDraw, B.firstDraw, 'time')} |`)
L.push(`| drawing again at 2× (original + copy), ms | ${A.zoom} (${A.zoomRender} + ${A.zoomCopy}) | ${B.zoom} (${B.zoomRender} + ${B.zoomCopy}) | ${check('zoom (all)', A.zoom, B.zoom, 'time')} |`)
L.push(`| canvases held at the peak, MB | ${r1(A.canvasPeak / 2 ** 20)} | ${r1(B.canvasPeak / 2 ** 20)} | ${check('canvas peak (all)', A.canvasPeak, B.canvasPeak, 'bytes')} |`)
L.push(`| JS heap at the peak, MB | ${r1(A.heapPeak / 2 ** 20)} | ${r1(B.heapPeak / 2 ** 20)} | ${check('heap peak (all)', A.heapPeak, B.heapPeak, 'heap')} |`)
L.push('', `Where ${label}'s first drawing goes (median page, ms): ${Object.entries(B.split).map(([k, v]) => `${k} ${v}`).join(', ')}.${Object.values(A.split).some(v => v !== null) ? ` The old path's: ${Object.entries(A.split).map(([k, v]) => `${k} ${v}`).join(', ')}.` : ' The old path gives no split (its engine has none).'}`, '')
L.push('## Browser, per fixture', '')
L.push(`| fixture | first drawing, old / new | at 2×, old / new | canvases MB, old / new | rule |`, '|---|---|---|---|---|')
for (const n of Object.keys(now.browser.fixtures).sort()) {
  const a = old.browser.fixtures[n], b = now.browser.fixtures[n]
  if (!a) continue
  const marks = [check(`${n} first drawing`, a.firstDraw, b.firstDraw, 'time'), check(`${n} zoom`, a.zoom, b.zoom, 'time'), check(`${n} canvas peak`, a.canvasPeak, b.canvasPeak, 'bytes')]
  L.push(`| ${n} | ${a.firstDraw} / ${b.firstDraw} | ${a.zoom} / ${b.zoom} | ${r1(a.canvasPeak / 2 ** 20)} / ${r1(b.canvasPeak / 2 ** 20)} | ${marks.every(x => x === 'ok') ? 'ok' : '**over**'} |`)
}
L.push('', '## Server, per paper', '')
L.push('| paper | maker ms, old / new (its operator lists) | remover ms beyond them, new (parse + ink + plan + make) |', '|---|---|---|')
for (const p of Object.keys(now.server).sort()) {
  const a = old.server[p], b = now.server[p]
  check(`${p} maker`, a?.makerMs, b.makerMs, 'time')
  L.push(`| ${p} | ${a?.makerMs ?? '-'} (${a?.makerOpsMs ?? '-'}) / ${b.makerMs} (${b.makerOpsMs}) | ${b.removerMs}${b.remover ? ` (${b.remover.parse} + ${b.remover.ink} + ${b.remover.plan} + ${b.remover.make})` : ''} |`)
}
L.push('', '## Reader download, per paper (bytes)', '')
L.push('| paper | layout file gz, old / new | add-on, new | manifest gz, new | in all, old / new |', '|---|---|---|---|---|')
for (const p of Object.keys(now.server).sort()) {
  const a = old.server[p], b = now.server[p]
  L.push(`| ${p} | ${a?.layoutGzip ?? '-'} / ${b.layoutGzip} | ${b.addonBytes} | ${b.manifestGzip} | ${a?.download ?? '-'} / ${b.download} |`)
}
L.push('', fails.length ? `## Over the budget (${fails.length})\n\n${fails.map(f => `- ${f}`).join('\n')}` : '## Over the budget\n\nNothing.', '')
console.log(L.join('\n'))
if (arg('record')) {
  const dir = join(new URL('..', import.meta.url).pathname, 'records')
  writeFileSync(join(dir, 'layer-perf.json'), `${JSON.stringify({ schema: 1, what: 'the instant layer\'s cost budget (spikes/layer-perf.mjs)', made: new Date().toISOString(), old: { runs: OLD.map(r => ({ made: r.made, engine: engineOf(r) })), ...old }, new: { label, runs: NEW.map(r => ({ made: r.made, engine: engineOf(r) })), ...now }, over: fails }, null, 1)}\n`)
  writeFileSync(join(dir, 'layer-perf.md'), `${L.join('\n')}\n`)
  console.log(`recorded: ${join(dir, 'layer-perf.json')}, layer-perf.md`)
}
process.exitCode = fails.length ? 1 : 0
