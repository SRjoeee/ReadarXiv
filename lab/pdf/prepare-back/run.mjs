// lab/pdf/prepare-back/run.mjs: one paper through the rebuild's back half (stage 1a), from the lab's cached compiles. Not shipped.
// Today's front end as the box runs it (the tree, the job's BibTeX make, the units, the marked original and our final pass:
// the baseline's tools/prepare.mjs, whose compile-cache key this keeps so that the same cached compiles are hit), then the
// adapter (src/pdf-reader/engine/pipeline/instrument.mjs) and the package's prepareBack over arXiv's PDF. Writes:
//   <out>/bundles/<id>/<digest>.<kind> each object, and head.json (the head, as written);
//   <out>/prepare/<id>.prepare.json the prepare dump in the baseline's format (readarxiv-lab-data/refactor-2026-11/baseline/
//   FORMAT.md §3), for its tools/diff.mjs;
//   <out>/located/<id>.json what the gate reads beside the dump: each unit's place, cause, member ords; the wrap's pages; parts;
//   the float lines (`floatLines`: Located.floatLines, a paper's words: lab data alone; float-lines.mjs reports them);
//   stdout one summary line. Exit 3: a compile no cache holds (the paper missing). Exit 4: a paragraph TeX opened where a group
//   the instrument wrote as its content stood (Located.stats.opensLost: the gate of pipeline/instrument.mjs passThroughOf), outputs written.
//   node --max-old-space-size=6144 --import tsx lab/pdf/prepare-back/run.mjs --dir=<paper dir> --id=<id> --out=<dir> --caches=<dir>:<dir>…
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { constants as Z, deflateSync, inflateRawSync, inflateSync } from 'node:zlib'
import * as PL from '@cantoo/pdf-lib'
import { isMemoryError, prepareBack, readArxiv, stateOf } from '@readarxiv/engine'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { classesOf, instrumentOf } from '../../../src/pdf-reader/engine/pipeline/instrument.mjs'
import { keptWhyOf, statedOf, trailsOf } from './stated.mjs'

const argOf = n => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null
const id = argOf('id'), OUT = argOf('out'), DIR = argOf('dir')
// (--baseline=<dir>: the baseline's prepare dumps, read for the units of today's the candidate makes otherwise: `if (BASELINE)`)
const BASELINE = argOf('baseline')
const CACHES = (argOf('caches') ?? '').split(':').filter(Boolean)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const PINS = JSON.parse(readFileSync(join(ROOT, 'lab/pdf/compile-images.json'), 'utf8'))
const E = join(ROOT, 'src/pdf-reader/engine'), im = f => import(pathToFileURL(join(E, f)).href)
const { LITE } = await import(pathToFileURL(join(ROOT, 'lab/pdf/spikes/lite-pdfjs.mjs')).href)
// (layer2.mjs makes a measuring canvas at its load: a stub, nothing here measures)
globalThis.OffscreenCanvas ??= class { getContext() { return { measureText: () => ({ width: 0 }), font: '' } } }
const live = await im('pipeline/live.mjs'), tar = await im('source/tar.mjs'), paperM = await im('layout/paper.mjs')
const guard = await im('layout/guard.mjs'), baseM = await im('layout/base.mjs')
const NM = join(ROOT, 'node_modules/pdfjs-dist/')
// (--warnings: PDF.js's warnings, the channel its recover branches tell on (a page's list ended early, a font read as none, …),
// kept by the step whose documents were being read: arXiv's PDF for the front half (`front`), the compiles' PDFs the front half
// reads (`compiles`), our final pass (`B`), arXiv's PDF for the back half (`A`); in <out>/warnings/<id>.json. Nothing else moves)
const WARNINGS = process.argv.includes('--warnings')
const warned = [], step = { now: 'front' }
if (WARNINGS) {
  const warn = console.warn
  console.warn = (...a) => {
    const s = a.map(String).join(' ')
    if (s.startsWith('Warning: ')) warned.push([step.now, s.slice(9)])
    else warn(...a)
  }
}
const docOpts = { cMapUrl: `${NM}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}standard_fonts/`, verbosity: WARNINGS ? 1 : 0, useSystemFonts: false }
const tasks = []
const open = (bytes, o = LITE) => { const t = getDocument({ data: bytes.slice(), ...o, ...docOpts }); tasks.push(t); return t.promise }
const sha = b => createHash('sha256').update(b).digest('hex')
const t0 = performance.now()

const m = /^(.+)v(\d+)$/.exec(id), paperRef = { id: m[1], version: Number(m[2]) }
const sourceBytes = readFileSync(join(DIR, 'source.gz')), arxivBytes = new Uint8Array(readFileSync(join(DIR, 'arxiv.pdf')))
const { files: source } = await tar.unpackSource(new Uint8Array(sourceBytes))
let paper = live.openPaper(source)
const arxivDoc0 = await open(arxivBytes)
// ---- the tree, as the box decides it (the baseline's prepare.mjs, dump.mjs's)
const SERVED = Object.keys(PINS.images)
const declared = paper.meta.tlVersion == null ? null : String(paper.meta.tlVersion)
let year = declared && SERVED.includes(declared) ? declared : null
const banner = await guard.texLiveOfPdf(arxivDoc0).catch(() => null)
if (!year && declared === null && banner && SERVED.includes(String(banner))) year = String(banner)
year ??= PINS.default
const IMAGE = PINS.images[year].texlive
// ---- compiles: only read, by the cache key every lane computes (the image, the request's shape and every file)
const filesUnder = (d, rel = '') => readdirSync(join(d, rel), { withFileTypes: true }).flatMap(x => (x.isDirectory() ? filesUnder(d, join(rel, x.name)) : [join(rel, x.name)]))
async function compile(req) {
  const all = new Map(source)
  for (const [p, b] of req.overrides ?? []) all.set(p, b)
  const h = createHash('sha256').update(IMAGE).update(JSON.stringify({ main: req.main, engine: req.engine, rerun: !!req.rerun, bibtex: req.bibtex ?? null, draft: !!req.draft, files: !!req.files, date: req.sourceDate ?? null, paper: req.paper ?? null }))
  for (const [p, b] of [...all].sort((a, b) => (a[0] < b[0] ? -1 : 1))) h.update(p).update(b)
  const key = h.digest('hex').slice(0, 20)
  const dir = CACHES.map(c => join(c, id, key)).find(d => existsSync(join(d, 'done')))
  if (!dir) { console.log('NEEDS_COMPILE', key); process.exit(3) }
  if (!existsSync(join(dir, 'out.log'))) return { ok: false, error: 'no log' }
  const pdf = existsSync(join(dir, 'out.pdf')) ? new Uint8Array(readFileSync(join(dir, 'out.pdf'))) : null
  const files = req.files && existsSync(join(dir, 'files')) ? new Map(filesUnder(join(dir, 'files')).map(p => [p.split(sep).join('/'), new Uint8Array(readFileSync(join(dir, 'files', p)))])) : undefined
  return { ok: req.draft ? true : !!pdf?.length, pdf, log: readFileSync(join(dir, 'out.log'), 'latin1'), ...(files ? { files } : {}) }
}
const HOST_ENGINES = ['pdflatex', 'xelatex', 'lualatex', 'latex']
if (typeof paperM.bibliographyKept === 'function' && paperM.bibliographyKept(paper) === null) {
  const r = await paperM.madeBibliography(paper, { compile, engines: HOST_ENGINES })
  if ('paper' in r) paper = r.paper
}
const day = await baseM.creationEpochOf(arxivDoc0)
const textOf = async pdf => { const was = step.now; step.now = 'compiles'; try { const d = await open(pdf); return await baseM.textOfPdf(d) } finally { step.now = was } }
const made = await paperM.markedOfPaper(paper, { compile, compileBudgetMs: null, engines: HOST_ENGINES, pages: async () => arxivDoc0.numPages, ...(day ? { sourceDate: day } : {}), textOf })
const tFront = performance.now()
const meta = await arxivDoc0.getMetadata().catch(() => null)
const info = meta?.info ?? {}
const paperOut = {
  id: paperRef.id, version: paperRef.version, pages: arxivDoc0.numPages,
  arxivPdf: { sha256: sha(arxivBytes), bytes: arxivBytes.length, pdfVersion: info.PDFFormatVersion ?? null, producer: info.Producer ?? null, creator: info.Creator ?? null },
  source: { sha256: sha(sourceBytes), bytes: sourceBytes.length },
  tex: { tree: year, declared, banner: banner == null ? null : String(banner), image: IMAGE, compiler: paper.meta.compiler ?? 'pdflatex' },
}
const finalPdf = made.base?.pdf instanceof Uint8Array ? made.base.pdf : null
const refusal = made.refused ? `marked: ${made.refused}` : !finalPdf ? `final: ${made.base?.refused ? `refused: ${made.base.why ?? ''}`.slice(0, 200) : 'none'}` : null
const deflate = b => new Uint8Array(deflateSync(b))
// (the bounded inflate's refusal and a failed allocation thrown as they came: only a stream zlib refuses is read again raw. A
// failed allocation read again raw came back as a data error the wrap took for its page's: memory.mjs)
const inflate = (b, limit) => { const o = { finishFlush: Z.Z_SYNC_FLUSH, maxOutputLength: limit + 1 }; try { return new Uint8Array(inflateSync(b, o)) } catch (e) { if (e?.code === 'ERR_BUFFER_TOO_LARGE' || isMemoryError(e)) throw e; return new Uint8Array(inflateRawSync(b.subarray(2), o)) } }

// ---- the back half
const bundleDir = join(OUT, 'bundles', id)
mkdirSync(bundleDir, { recursive: true })
let ins = null, tally = null, head = null
const parts = []
let unitsBytes = 0
const tIns0 = performance.now()
if (!refusal) {
  step.now = 'B'
  const fi = (await (await open(finalPdf)).getMetadata().catch(() => null))?.info ?? {}
  paperOut.ours = { producer: fi.Producer ?? null, creator: fi.Creator ?? null }
  if (process.argv.includes('--keep-b')) writeFileSync(join(bundleDir, 'B.pdf'), finalPdf)
  const r = await instrumentOf({ paper, finalPdf, options: made.options ?? {}, log: made.log ?? '', pdfjs: { getDocument, OPS }, documentOptions: { ...docOpts, ...LITE }, made: { compiler: paperOut.tex.compiler, tree: year, front: 'today' } })
  ins = r.instrument
  if (process.env.DEBUG_B) console.error('B', ins.ink.pages.slice(0, 3).map(pg => [pg.glyphs.length, pg.glyphs.filter(g => g.form).length, pg.unread]))
}
const tIns = performance.now()
if (ins) {
  const madeId = sha(Buffer.concat([Buffer.from(sha(sourceBytes)), Buffer.from(sha(arxivBytes)), Buffer.from(IMAGE)]))
  // (the box's way, what is read let go once located, but where a step after reads the instrument's ink and A's pages: the claims
  // and the review; the proofs read A's pages again, as the back half read them)
  const keep = process.argv.includes('--claims') || process.argv.includes('--review') || process.argv.includes('--hidden')
  step.now = 'A'
  for await (const x of prepareBack(ins, arxivBytes, { pdfjs: { getDocument, OPS }, pdfOptions: { ...docOpts, ...LITE }, PL, deflate, inflate, paper: paperRef, made: madeId, now: () => performance.now(), classesOf, keep })) {
    if (x.kind === 'tally') { tally = x; continue }
    writeFileSync(join(bundleDir, `${x.digest}.${x.kind}`), x.bytes)
    if (x.kind === 'part') parts.push({ page: x.page, digest: x.digest, bytes: x.bytes.length, flows: x.flows, members: x.members })
    if (x.kind === 'units') unitsBytes += x.bytes.length
    if (x.kind === 'head') { head = x.head; writeFileSync(join(bundleDir, 'head.json'), `${JSON.stringify(head)}\n`) }
  }
}
const tBack = performance.now()
step.now = 'after'
if (WARNINGS) { mkdirSync(join(OUT, 'warnings'), { recursive: true }); writeFileSync(join(OUT, 'warnings', `${id}.json`), `${JSON.stringify(warned)}\n`) }
// ---- (--claims) the A glyphs a unit holds with no partner on B, classed (claims.mjs)
if (tally && process.argv.includes('--claims')) {
  const { claimsOf } = await import('./claims.mjs')
  mkdirSync(join(OUT, 'claims'), { recursive: true })
  writeFileSync(join(OUT, 'claims', `${id}.json`), `${JSON.stringify(claimsOf(ins, tally))}\n`)
}
// ---- (--review) the corpus counts of pull request #605's review findings (review.mjs)
if (tally && process.argv.includes('--review')) {
  const { reviewOf } = await import('./review.mjs')
  mkdirSync(join(OUT, 'review'), { recursive: true })
  writeFileSync(join(OUT, 'review', `${id}.json`), `${JSON.stringify(reviewOf(ins, tally))}\n`)
}
// ---- (--hidden) the members whose every glyph arXiv's own page paints over (hidden.mjs)
if (tally && process.argv.includes('--hidden')) {
  const { hiddenOf } = await import('./hidden.mjs')
  mkdirSync(join(OUT, 'hidden'), { recursive: true })
  writeFileSync(join(OUT, 'hidden', `${id}.json`), `${JSON.stringify(hiddenOf(tally))}\n`)
}
// (A's pages as the back half read them, where it kept them; else read again once, as it reads them (rebuild/mem-back lets them
// go once located): the proofs and the --baseline statement read them)
let pagesAOnce = null
const pagesAOf = async () => (pagesAOnce ??= tally?.pagesA ?? (await readArxiv({ getDocument, OPS }, arxivBytes, { ...docOpts, ...LITE })).pages)
// ---- the add-on's proofs (--prove: PDF.js's, nothing moved and each group enclosing exactly its ink; --pixels: poppler's (with
// --cairo its OFF renders by the Cairo backend, prove.mjs), all
// ON is A and each kind OFF changes A only inside its ink)
let proofs = null
if (tally && !('refused' in tally.addOn) && (process.argv.includes('--prove') || process.argv.includes('--pixels'))) {
  const { proveGlyphs, provePixels } = await import('./prove.mjs')
  const W = new Uint8Array(arxivBytes.length + tally.addOn.bytes.length)
  W.set(arxivBytes)
  W.set(tally.addOn.bytes, arxivBytes.length)
  const tp = performance.now()
  const pagesA = await pagesAOf()
  proofs = { glyphs: await proveGlyphs({ W, pagesA, located: tally.locatedAll, addOn: tally.addOn, pdfjs: { getDocument, OPS }, options: { ...docOpts, ...LITE } }) }
  proofs.glyphs.ms = Math.round(performance.now() - tp)
  if (process.argv.includes('--pixels')) {
    const tq = performance.now()
    proofs.pixels = await provePixels({ W, original: arxivBytes, pagesA, located: tally.locatedAll, addOn: tally.addOn, scratch: join(OUT, 'scratch', `${id}-${process.pid}`), PL, off: process.argv.includes('--cairo') ? 'cairo' : 'splash' })
    proofs.pixels.ms = Math.round(performance.now() - tq)
  }
}

// ---- the prepare dump (FORMAT.md §3)
const located = tally?.locatedAll ?? null
const addOn = tally?.addOn ?? null
const r2 = v => Math.round(v * 100) / 100
const OBJ = '￼'
/** a unit's pieces as FORMAT.md's flat list (§2): text, ph, open, close, nested; k their place in today's order */
function flat(content, out = []) {
  for (const p of content) {
    if (p.t === 'text') out.push({ k: out.length, kind: 'text', s: p.s })
    else if (p.t === 'el') out.push({ k: out.length, kind: 'ph', src: p.src })
    else if (p.t === 'unit') out.push({ k: out.length, kind: 'nested', pre: p.pre, unit: p.unit, post: p.post })
    else { if (p.open !== undefined) out.push({ k: out.length, kind: 'open', src: p.open }); flat(p.content, out); if (p.close !== undefined) out.push({ k: out.length, kind: 'close', src: p.close }) }
  }
  return out
}
const textOfPieces = ps => ps.map(p => (p.kind === 'text' ? p.s : p.kind === 'ph' || p.kind === 'nested' ? OBJ : '')).join('')
const LABEL_KIND = { float: 'caption', head: 'number', number: 'number', mark: 'footnote' }
const units = []
const memberOf = new Map()
if (located) for (const mem of located.members) if (mem.unit >= 0 && mem.name === undefined) memberOf.set(mem.unit, mem)
// (the units the members are of: the instrument's, then those locate made on arXiv's page, its ink units, kept blocks and
// figure texts, in today's bundle's order)
const allUnits = located?.units ?? ins?.units ?? []
let ord = 0
const dumpOrds = [] // [the dump's ord, the member's ord]: what the comparison with the tap joins by
const states = { drawn: 0, laid: 0, unlaid: 0 }
// (the dump's order: the instrument's, but a figure unit the bundle does not lay after every one it lays, as today's page pass
// leaves such a unit out of its bundle and the baseline lists it after the bundle's: its ord-join pairs equal texts so)
const laysFigure = i => { const mem = memberOf.get(i); return !!mem?.located && stateOf(mem, addOn).drawn }
const order = allUnits.map((_, i) => i)
const figs = order.filter(i => allUnits[i].kind === 'inkfigures')
const figsSorted = [...figs].sort((a, b) => (laysFigure(a) ? 0 : 1) - (laysFigure(b) ? 0 : 1) || a - b)
figs.forEach((at, q) => { order[at] = figsSorted[q] })
order.map(i => [allUnits[i], i]).forEach(([u, i]) => {
  if (u.name !== undefined) return
  const pieces = flat(u.content)
  const mem = memberOf.get(i)
  if (mem) dumpOrds.push([ord, mem.ord])
  // (a unit kept for its text set wholly in a face of one pitch, the engine's `pitch`: `keptBy: 'pitch'`; a kept block of e-mail
  // addresses alone, the engine's `address`: `keptBy: 'address'`; a figure text kept for an identifier it holds, the engine's
  // `figure: identifier` (locate/ink.ts: figure texts hold no element): `keptBy: 'identifier'`; the parity reads all three,
  // join.mjs candidateKept. Never two: `pitch` marks source units and figure texts set at one pitch, `address` kept blocks,
  // `identifier` the other figure texts; a figure's line no word of which stands outside its formulas, kept whole, the engine's
  // `formula` (F1, rebuild/fig-text): `keptBy: 'formula'`; a figure text drawn twice, the engine's `double` (F3): `keptBy: 'double'`; one the engine cannot draw as it was set, its
  // `script` (F3): `keptBy: 'script'`; a figure text or a cell held whole for a decorated word it holds, the engine's `decorated`
  // (§18.61): `keptBy: 'decorated'`. And every other keep by the mark of the rule that made it (lane gate-finds, the coordinator's
  // ruling of 2026-11-12: each kept unit states its reason, the lab's alone): a figure text kept as crowded, the engine's
  // `crowded`: 'crowded'; a line of an algorithm float's body, `pseudocode`: 'pseudocode'; a cell or a figure text of names or
  // markup tokens alone, `nameCell`: 'name'; any other kept block of rule 10, `block`: 'block'. The order is the rules' own: a
  // unit two marks state is kept by the first)
  const keptBy = u.pitch ? 'pitch' : u.address ? 'address' : u.formula ? 'formula' : u.double ? 'double' : u.script ? 'script' : u.decorated ? 'decorated' : u.why === 'figure: identifier' ? 'identifier' : u.crowded ? 'crowded' : u.pseudocode ? 'pseudocode' : u.nameCell ? 'name' : u.block ? 'block' : null
  // (and a unit held for a decorated word, whether it holds the word (`token`) or stands in its label (`label`): `decorated`)
  const base = { id: u.id, ord: ord++, kind: u.kind, ...(u.kept ? { kept: true } : {}), ...(keptBy ? { keptBy } : {}), ...(u.decorated ? { decorated: u.decorated } : {}), text: textOfPieces(pieces), pieces }
  if (u.kind === 'name') { units.push({ ...base, state: 'unlaid', why: 'name: drawn by its own group, never laid as a unit' }); states.unlaid++; return }
  if (!mem || !mem.located) { units.push({ ...base, state: 'unlaid', why: mem?.cause?.startsWith('content difference') ? mem.cause : `unlocated: ${mem?.cause ?? u.why ?? 'no ink'}` }); states.unlaid++; return }
  const st = stateOf(mem, addOn)
  const state = st.drawn ? 'drawn' : 'laid'
  states[state]++
  const lines = mem.lines.map(l => ({ page: l[0], x0: l[2], x1: l[3], baseline: l[4], top: l[5], bottom: l[6], size: mem.style.size }))
  // (a figure text's element kept as the original's ink, the engine's `keptEls` (a run of one pitch, F0's; a stretch its decoration
  // holds): `keptBy`, which the parity reads, join.mjs candidatePitch)
  const keptEl = new Map(u.keptEls ?? [])
  const elements = mem.elements.filter(([, el]) => el.ink.length).map(([k, el]) => ({ k: Number(k), kind: el.kind, flags: el.keep ? ['KEPT'] : [], ...(keptEl.has(k) ? { keptBy: keptEl.get(k) } : {}), segs: el.ink.map(x => ({ page: x[0], x0: x[1], x1: x[3], baseline: x[5], top: x[4], bottom: x[2] })) }))
  const label = mem.labelAt ? [{ kind: LABEL_KIND[mem.labelAt.kind] ?? 'number', page: mem.labelAt.ink[0], x0: mem.labelAt.ink[1], x1: mem.labelAt.ink[3], baseline: mem.labelAt.ink[5], top: mem.labelAt.ink[4], bottom: mem.labelAt.ink[2] }] : null
  // (a unit kept for its text set wholly in a face of one pitch, or for an identifier, states (k), the differential's cause,
  // before the bundle's why)
  const why = keptWhyOf(base) ?? st.why
  // (a figure's paragraph, F3: `para`, the evidence its lines are joined by ('strong'): stage 1a and the parity read it)
  units.push({ ...base, state, ...(u.figure?.para ? { para: u.figure.para } : {}), ...(why ? { why } : {}), ...(lines.length ? { lines } : {}), ...(elements.length ? { elements } : {}), ...(label ? { label } : {}) })
})
if (located) for (const [o, b] of located.born) {
  const mem = located.members[o]
  const st = stateOf(mem, addOn)
  const pieces = flat(b.content)
  states[st.drawn ? 'drawn' : 'laid']++
  dumpOrds.push([ord, mem.ord])
  units.push({ id: mem.id, ord: ord++, kind: b.kind, text: textOfPieces(pieces), pieces, state: st.drawn ? 'drawn' : 'laid', why: 'born on arXiv\'s page', lines: mem.lines.map(l => ({ page: l[0], x0: l[2], x1: l[3], baseline: l[4], top: l[5], bottom: l[6], size: mem.style.size })) })
}
// (--baseline: each unit of the baseline's the candidate does not make, stated as the candidate's, with how a unit made on
// arXiv's page that stands for it reads there: stated.mjs, the cause the differential's acceptance list reads)
// A paper the baseline holds no dump of (one the corpus gained after it, as 2402.10294v1: today's prepare cannot be run for
// it offline) has none of its units to state: its dump is the candidate's alone, which the differential lists so.
if (BASELINE && existsSync(join(BASELINE, `${id}.prepare.json`))) {
  const base = JSON.parse(readFileSync(join(BASELINE, `${id}.prepare.json`), 'utf8')).units
  const trails = located ? trailsOf(located.members.flatMap((m) => m.elements ?? [])) : []
  // (the number each unit's label states, Label.num, by its ord in the dump)
  const labels = new Map(dumpOrds.map(([o, m]) => [o, located?.members[m]?.labelAt?.num?.[0]]).filter(([, n]) => n))
  // (arXiv's glyphs on each page, as the back half read A: (f') reads a line's glyphs of ink)
  const pagesA = ins ? await pagesAOf() : null
  const glyphs = (p) => pagesA?.[p - 1]?.page?.glyphs ?? null
  // (each statement's cause, today's ord and the candidate's unit holding it whole: what the parity joins by, join.mjs heldJoin)
  // (a statement of a unit the candidate makes, (i): on that unit, its own reason kept in `stated.was`)
  for (const { u, why, cause, holder, own, keptBy } of statedOf(base, units, { trails, labels, glyphs, displays: located?.displays ?? [] })) {
    if (own) { own.stated = { ord: u.ord, cause, ...(holder ? { holder } : {}), was: own.why }; own.why = why; continue }
    units.push({ id: u.id, ord: ord++, kind: u.kind, ...(keptBy ? { keptBy } : {}), text: u.text, pieces: u.pieces, state: 'unlaid', why, replaced: true, stated: { ord: u.ord, cause, ...(holder ? { holder } : {}) } })
    states.unlaid++
  }
}
const N = paperOut.pages
const pages = []
for (let p = 1; p <= N; p++) {
  const part = head?.parts?.[p - 1] ?? null
  const w = addOn && !('refused' in addOn) ? addOn.pages.get(p) : null
  const why = refusal ?? (addOn && 'refused' in addOn ? `wrap: ${addOn.refused}` : !part ? 'no part' : w && !w.ok ? `not wrapped: ${w.why}` : null)
  pages.push({ page: p, drawn: why === null, ...(why ? { why } : {}) })
}
// (paragraphs TeX opened where a group the instrument wrote as its content stood: none stated, and none may be: the gate below)
const opensLost = tally?.located?.opensLost ?? 0
// (paragraph ends of B inside a unit that state no point (facts-pass.ts): where an open or an element stands where the next
// paragraph begins in the source (anchored) and where plain text does (plain))
const opensUnstated = tally?.located?.opensUnstated ?? null
const counts = { units: units.length, ...states, byKind: {}, pages: N, pagesDrawn: pages.filter(p => p.drawn).length, ...(opensLost ? { opensLost } : {}), ...(opensUnstated ? { opensUnstated } : {}) }
for (const u of units) { const k = (counts.byKind[u.kind] ??= { drawn: 0, laid: 0, unlaid: 0 }); k[u.state]++ }
mkdirSync(join(OUT, 'prepare'), { recursive: true })
// (the lines the candidate reads as a display's formula, locate's `displays`, which restate.mjs states a unit by as run.mjs does)
writeFileSync(join(OUT, 'prepare', `${id}.prepare.json`), `${JSON.stringify({ format: 'readarxiv-baseline/prepare 1', engine: 'rebuild/prepare (stage 1a)', paper: paperOut, refused: refusal, pages, counts, units, ...(located?.displays?.length ? { displays: located.displays.map((d) => d.map(r2)) } : {}) })}\n`)
// what the gate reads beside the dump
const placeOf = {}
if (located) for (const mem of located.members) if (mem.unit >= 0 && mem.name === undefined) placeOf[allUnits[mem.unit].id] = (placeOf[allUnits[mem.unit].id] ?? []).concat([[mem.ord, mem.located ? mem.place : null, mem.cause ?? null, mem.lines.length]])
mkdirSync(join(OUT, 'located'), { recursive: true })
writeFileSync(join(OUT, 'located', `${id}.json`), `${JSON.stringify({
  id, refused: refusal, stats: tally?.located ?? null, wrap: tally?.wrap ?? null, ms: { front: Math.round(tFront - t0), instrument: Math.round(tIns - tIns0), back: Math.round(tBack - tIns), ...(tally ? Object.fromEntries(Object.entries(tally.ms).map(([k, v]) => [k, Math.round(v)])) : {}) },
  bytes: { arxiv: arxivBytes.length, addOn: addOn && !('refused' in addOn) ? addOn.bytes.length : 0, units: unitsBytes, parts: parts.reduce((n, p) => n + p.bytes, 0), head: head ? Buffer.byteLength(JSON.stringify(head)) : 0 },
  parts, places: placeOf, dumpOrds, proofs,
  wrapPages: addOn && !('refused' in addOn) ? [...addOn.pages].map(([p, x]) => [p, x.ok, x.why ?? null, !!x.merged]) : null,
  moves: tally?.mapping.moves.length ?? 0, stretches: tally?.mapping.stretches ?? [],
  identical: tally?.mapping.identical.filter(Boolean).length ?? 0,
  floatLines: located?.floatLines ?? null,
  peakRss: process.resourceUsage().maxRSS,
})}\n`)
console.log(JSON.stringify({ id, refused: refusal, units: units.length, ...states, located: tally?.located.located ?? 0, unlocated: tally?.located.unlocated ?? {}, born: tally?.located.born ?? 0, made: tally?.located.made ?? null, wrap: tally?.wrap ?? null, ...(proofs ? { proofs: { a: proofs.glyphs.a.failed, c: proofs.glyphs.c.failed, ...(proofs.pixels ? { on: proofs.pixels.onFailed?.length, offOutside: proofs.pixels.offOutside ? Object.fromEntries(Object.entries(proofs.pixels.offOutside).map(([k, v]) => [k, v.length])) : proofs.pixels.refused } : {}) } } : {}), ms: Math.round(performance.now() - t0) }))
for (const t of tasks) await t.destroy().catch(() => {})
// (the gate of a group written as its content (pipeline/instrument.mjs passThroughOf, decided before TeX's paragraph ends are read):
// a paragraph TeX opened at one has nothing to state it on, so the paper fails, exit 4, its outputs written)
if (opensLost) { console.error(`${id}: ${opensLost} paragraph(s) TeX opened where a group the instrument wrote as its content stood`); process.exit(4) }
process.exit(0)
