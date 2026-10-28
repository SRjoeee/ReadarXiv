// lab/pdf/spikes/speed.mjs
// The prepare's speed, head against base (P2's speed check: a rule may be improved, the prepare must not get slower): for each
// paper, the page pass as production runs it (layerOfPaper over one reading of each PDF on the lite worker, our base page wrapped
// by optional content first as the maker child wraps it (layout/wrap.mjs wrapFinal, where the engine has it; no remover is given
// an older engine's pass: the text removal is gone, docs/PDF-READER.md §19.9), the verdicts on), each side in a process of its own, N times, the sides interleaved, so that a drift of the machine
// spreads over all of them. The sides:
//   base   an engine of next's (--base=<a tree of it>: `git archive <commit> | tar -x -C <dir>`, its node_modules linked): the
//          marked original read whole first (readMarked), then the pass
//   off    this engine, the same: the whole run's rules (WHOLE_RULES: next's path, the marked original read whole first)
//   on     this engine, the page stream in production (its default rules): rules 1, 3 and 4 (frame and far-push columns of
//          arXiv's text, the columns' edges of the pages before a page), the marked original read by the pass a page at a time
//   on5    `on` and rule 5 (a float's search from its last body neighbour's page on)
// Each run records, from the process's start: the source's parse, step T (arXiv's text), the marked read (base and off; the
// stream reads it inside the pass), the maker's own times (stats.layout.stats.ms: ops, carry, anchor, rows), the rest of the
// pass (the left, the cut, the verdicts: total less the others), the wrap (`wrap`, where this engine's side has a base page), the total, and the first part told (onPart): its
// wall time and the arXiv page read then (the stream's `closed`; today's path reads every page first). The peak RSS, and with
// --mem a run more a side whose live set (heap and ArrayBuffers after two gc()) is taken at the first part and at the end (gc
// perturbs the times: those runs are left out of the time table).
//   node lab/pdf/spikes/speed.mjs --base=<engine root> --papers=<dir>[,<dir>…] [--head=<engine root>] [--n=5]
//       [--sides=base,off,on] [--mem] [--out=<file.jsonl>]
// A paper's dir: meta.json ({ id, stem, source, arxiv, base? }: the source's .tar.gz, arXiv's PDF and our base page's; a dir with no
// `base` has this engine's sides reported incomparable and not run: the pass falls back with no base page of ours), P/<stem>.log (the mark probe's
// log), L/<stem>.pdf and L/<stem>.log (the marked original's compile, its passes' log), as layout-paper's harness keeps them.
// A paper needs its source and its marked compile: arXiv's PDF alone (a stand-in) gives the pass no unit. Heavy: run it on a
// quiet machine only. Prints a table a paper and a side: the medians and the spread (min to max) of the total, the first part
// and its page, the marked read, the peak RSS, and `SLOWER` where a side's median total is past base's spread. Each run's line
// in --out also holds the draw's counters (`draw`: its pages, bytes, and the items' fills told and the glyphs read for them).
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF = fileURLToPath(import.meta.url)
const REPO = resolve(SELF, '../../../..')
const argOf = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const has = name => process.argv.includes(`--${name}`)
// (the stream's sides, the marked original read by the pass; off takes the whole run's rules, next's, as base takes its own)
const RULES = { on: { frame: 'tokens', edges: 'earlier', columns: 'tokens' }, on5: { frame: 'tokens', edges: 'earlier', columns: 'tokens', floatSearch: 'forward' } }
const OFF_RULES = { frame: 'units', edges: 'all', columns: 'units', floatSearch: 'whole' }

if (has('child')) await child()
else await driver()

// ---------------------------------------------------------------- one run, in a process of its own
async function child() {
  const t0 = performance.now(), at = () => Math.round(performance.now() - t0)
  const ROOT = resolve(argOf('root')), side = argOf('side'), dir = resolve(argOf('paper')), MEM = has('mem')
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { LITE, LITE_DRAW } = await import('./lite-pdfjs.mjs')
  const PL = await import(join(REPO, 'node_modules/@cantoo/pdf-lib/cjs/index.js')).then(m => m.default ?? m)
  const { createHash } = await import('node:crypto')
  const { constants: Z, deflateSync, inflateRawSync, inflateSync } = await import('node:zlib')
  const E = join(ROOT, 'src/pdf-reader/engine'), im = f => import(join(E, f))
  const mk = await im('layout/marks.mjs'), front = await im('source/latex-front.mjs'), live = await im('pipeline/live.mjs'), tar = await im('source/tar.mjs')
  const arx = await im('layout/arxiv.mjs'), pass = await im('pipeline/page-pass.mjs'), tail = await im('layout/tail.mjs'), versions = await im('pipeline/versions.mjs')
  // (the wrap where the engine has it)
  const wrapMod = existsSync(join(E, 'layout/wrap.mjs')) ? await im('layout/wrap.mjs') : null
  const NM = join(REPO, 'node_modules/pdfjs-dist/')
  const tasks = []
  const open = (bytes, o = LITE) => { const task = getDocument({ data: bytes.slice(), ...o, cMapUrl: `${NM}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}standard_fonts/`, verbosity: 0, useSystemFonts: false }); tasks.push(task); return task.promise }
  const MiB = 2 ** 20, r1 = v => Math.round(v * 10) / 10
  const liveSet = () => { globalThis.gc?.(); globalThis.gc?.(); const m = process.memoryUsage(); return r1((m.heapUsed + m.arrayBuffers) / MiB) }
  const deflate = b => new Uint8Array(deflateSync(b))
  const inflate = (b, limit) => {
    const o = { finishFlush: Z.Z_SYNC_FLUSH, maxOutputLength: limit + 1 }
    try { return new Uint8Array(inflateSync(b, o)) } catch (e) { if (e?.code === 'ERR_BUFFER_TOO_LARGE') throw e; return new Uint8Array(inflateRawSync(b.subarray(2), o)) }
  }
  const ms = {}
  // the paper's inputs: its source parsed, its probe's answers, its PDFs' bytes
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'))
  const m = /^(.+)v(\d+)$/.exec(meta.id), paper = { id: m[1], version: Number(m[2]) }
  let t = at()
  const source = live.openPaper((await tar.unpackSource(new Uint8Array(readFileSync(meta.source)))).files)
  const plog = front.lastTexLog(readFileSync(join(dir, 'P', `${meta.stem}.log`), 'latin1')), ink = mk.readInkAnswers(plog, source.units)
  const options = { engine: source.meta.compiler, classes: mk.LAYOUT_CLASSES, switches: mk.readMarkProbe(plog, mk.probeSamples(source.units)), inkless: ink.inkless, texts: ink.texts, names: mk.readNameProbe(plog), lineskip: mk.readSkipProbe(plog) }
  const markedBytes = new Uint8Array(readFileSync(join(dir, 'L', `${meta.stem}.pdf`))), log = front.lastTexLog(readFileSync(join(dir, 'L', `${meta.stem}.log`), 'latin1'))
  const arxivBytes = new Uint8Array(readFileSync(meta.arxiv))
  ms.source = at() - t
  // step T: arXiv's text, read once for the left and the maker
  t = at()
  // (this engine's sides read arXiv's PDF as production does, its draw geometry with it: its links' overlaid text kept, its fonts'
  // maps, step T's text kept for the draw; base's engine has no draw)
  const drawn = side !== 'base'
  const arxiv = await open(arxivBytes, drawn ? LITE_DRAW : LITE)
  const text = await arx.readArxivText(arxiv, { draw: drawn })
  ms.text = at() - t
  // the marked original: read whole first (base, off), or by the pass a page at a time (on)
  const mdoc = await open(markedBytes)
  let marks = null
  if (!RULES[side]) { t = at(); marks = await mk.readMarked(mdoc, log, { ...options, units: source.units, OPS }); ms.marks = at() - t }
  const base = { bytes: arxivBytes.length, sha256: createHash('sha256').update(arxivBytes).digest('hex'), xref: tail.startxrefOf(arxivBytes) }
  // (our base page, the final pass of the marked original, where the paper dir names one (`meta.base`): this engine's sides wrap it
  // and make the layout over it; base's engine takes arXiv's PDF as before; a dir with none is not run on this engine's sides, the
  // driver's `incomparable`)
  const finalBytes = meta.base && side !== 'base' ? new Uint8Array(readFileSync(meta.base)) : null
  let oursBytes = finalBytes, wrap = null
  if (finalBytes && wrapMod) {
    t = at()
    const w = await wrapMod.wrapFinal(finalBytes, { PL, getDocument, documentOptions: { cMapUrl: `${NM}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}standard_fonts/`, verbosity: 0, useSystemFonts: false }, OPS, units: source.units, texts: marks?.marking?.texts ?? options.texts?.flat() ?? null, inkless: marks?.marking?.inkless ?? options.inkless ?? null, deflate, inflate })
    ms.wrap = at() - t
    if (!w.refused) { oursBytes = w.bytes; wrap = { stats: w.stats, unhidden: w.unhidden, labelKept: w.labelKept, pages: w.pages, figures: w.figures } }
  }
  const ours = oursBytes ? { doc: await open(oursBytes, LITE_DRAW), bytes: oursBytes.length, sha256: createHash('sha256').update(oursBytes).digest('hex'), xref: tail.startxrefOf(oursBytes), check: { marks: 0 }, ...(wrap ? { wrap } : {}) } : null
  let first = null, parts = 0
  t = at()
  const r = await pass.layerOfPaper({
    paper, source, ...(marks ? { marks, ...(side === 'off' ? { rules: OFF_RULES } : {}) } : { marked: { doc: mdoc, log, options }, rules: RULES[side] }), arxiv: { doc: arxiv, text }, ...(ours ? { ours, orig: base, tree: '2025' } : { base }), OPS, pdfjs: versions.PDFJS, image: '1',
    onHead: () => {}, onLeft: () => {},
    onPart: () => { parts++; if (!first) first = { ms: at(), ...(MEM ? { live: liveSet() } : {}) } },
  })
  ms.pass = at() - t
  const total = at()
  const maker = r.stats?.layout?.stats?.ms ?? {}
  const makerMs = ['ops', 'carry', 'anchor', 'rows'].reduce((s, k) => s + (maker[k] ?? 0), 0)
  const firstPage = r.stats?.closed?.[0]?.[2] ?? arxiv.numPages
  const out = {
    side, id: meta.id, pages: arxiv.numPages, parts, refused: r.refused ?? r.stats?.layout?.refused ?? null,
    ms: { ...ms, ops: Math.round(maker.ops ?? 0), carry: Math.round(maker.carry ?? 0), anchor: Math.round(maker.anchor ?? 0), rows: Math.round(maker.rows ?? 0), rest: Math.round(ms.pass - makerMs), draw: Math.round(r.stats?.draw?.ms ?? 0), total },
    first: { ms: first?.ms ?? null, page: firstPage, ...(MEM ? { live: first?.live ?? null } : {}) },
    // (the draw's counters, the same for the same input: its pages and bytes, and its items' fills, the glyphs they were read from)
    draw: r.stats?.draw ? { pages: r.stats.draw.pages, bytes: r.stats.draw.bytes, fills: r.stats.draw.fills ?? null } : null,
    maxRssMiB: r1(process.resourceUsage().maxRSS / 1024), ...(MEM ? { liveEnd: liveSet() } : {}),
  }
  process.stdout.write(`${JSON.stringify(out)}\n`)
  for (const task of tasks) await task.destroy()
}

// ---------------------------------------------------------------- the runs, and the table
async function driver() {
  const baseRoot = argOf('base') ? resolve(argOf('base')) : null, headRoot = resolve(argOf('head') ?? REPO)
  const papers = (argOf('papers') ?? '').split(',').filter(Boolean).map(p => resolve(p))
  const n = Number(argOf('n') ?? 5), sides = (argOf('sides') ?? 'base,off,on').split(','), outFile = argOf('out')
  if (!papers.length) throw new Error('--papers: a paper dir (meta.json, P/, L/) or several, comma-separated')
  if (sides.includes('base') && !baseRoot) throw new Error('--base: a tree of next\'s engine (git archive <commit> | tar -x -C <dir>, node_modules linked)')
  for (const s of sides) if (s !== 'base' && s !== 'off' && !RULES[s]) throw new Error(`--sides: ${s} is none of base, off, ${Object.keys(RULES).join(', ')}`)
  const tsx = join(REPO, 'node_modules/tsx/dist/loader.mjs')
  const run = (paper, side, mem) => new Promise((done, fail) => {
    const root = side === 'base' ? baseRoot : headRoot
    const args = [...(mem ? ['--expose-gc'] : []), '--import', tsx, SELF, '--child', `--root=${root}`, `--side=${side}`, `--paper=${paper}`, ...(mem ? ['--mem'] : [])]
    const p = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    p.stdout.on('data', d => { out += d })
    p.stderr.on('data', d => { err += d })
    p.on('close', code => (code === 0 ? done(JSON.parse(out.trim().split('\n').at(-1))) : fail(new Error(`${side} ${paper}: exit ${code}\n${err.slice(-2000)}`))))
  })
  const rows = []
  /** this engine's sides of a paper dir that names no base page of ours (meta.json `base`): the pass falls back (`final`, no
   *  layout, no removal), so their times are no prepare's to compare with base's, and they are not run */
  const incomparable = []
  for (const paper of papers) {
    if (!existsSync(join(paper, 'meta.json'))) throw new Error(`${paper}: no meta.json`)
    const meta = JSON.parse(readFileSync(join(paper, 'meta.json'), 'utf8'))
    const timed = sides.filter(s => s === 'base' || !!meta.base)
    for (const side of sides) if (!timed.includes(side)) incomparable.push({ id: meta.id, side })
    for (let i = 0; i < n; i++) for (const side of timed) {
      const r = await run(paper, side, false)
      rows.push(r)
      if (outFile) appendFileSync(outFile, `${JSON.stringify({ rep: i, ...r })}\n`)
      process.stderr.write(`${r.id} ${side} #${i + 1}: total ${r.ms.total} ms, first part ${r.first.ms} ms (arXiv page ${r.first.page}), RSS ${r.maxRssMiB} MiB\n`)
    }
    if (has('mem')) for (const side of timed) {
      const r = await run(paper, side, true)
      rows.push({ ...r, mem: true })
      if (outFile) appendFileSync(outFile, `${JSON.stringify({ mem: true, ...r })}\n`)
    }
  }
  const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : null }
  const spread = xs => (xs.length ? `${Math.min(...xs)}-${Math.max(...xs)}` : '-')
  console.log(['paper', 'side', 'runs', 'total ms (spread)', 'first part ms (spread)', 'first page', 'marked read ms', 'maker ops ms', 'rest ms', 'peak RSS MiB (spread)', 'live first/end MiB', 'verdict'].join(' | '))
  for (const id of [...new Set([...rows, ...incomparable].map(r => r.id))]) {
    const of = side => rows.filter(r => r.id === id && r.side === side && !r.mem)
    const baseTotals = of('base').map(r => r.ms.total)
    for (const side of sides) {
      if (incomparable.some(r => r.id === id && r.side === side)) { console.log([id, side, 0, '-', '-', '-', '-', '-', '-', '-', '-', 'INCOMPARABLE: no base page of ours (meta.json base), the pass would fall back; not run'].join(' | ')); continue }
      const rs = of(side), tot = rs.map(r => r.ms.total), fst = rs.map(r => r.first.ms ?? r.ms.total), rss = rs.map(r => r.maxRssMiB)
      const mem = rows.find(r => r.id === id && r.side === side && r.mem)
      const slower = side !== 'base' && baseTotals.length && median(tot) > Math.max(...baseTotals) ? 'SLOWER' : ''
      console.log([id, side, rs.length, `${median(tot)} (${spread(tot)})`, `${median(fst)} (${spread(fst)})`, median(rs.map(r => r.first.page)), median(rs.map(r => r.ms.marks ?? 0)), median(rs.map(r => r.ms.ops)), median(rs.map(r => r.ms.rest)), `${median(rss)} (${spread(rss)})`, mem ? `${mem.first.live}/${mem.liveEnd}` : '-', slower].join(' | '))
    }
  }
}
