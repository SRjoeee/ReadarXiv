// experiments/pdf-bilingual/spikes/reader-typeset.mjs
// The typesetting rule through the reader's own path (F2's acceptance, 2026-10-02): for each <lang>/<id>, the reader in
// Chromium with the extension's build, live against its TeX page (a production build's is our site's,
// https://tex.readarxiv.org; SITE=<a page on this machine>, with ENDPOINT its TeX Live files for one of protocol 1),
// the paper from the local corpus — or, EMBEDDED=1, the reader laid over arXiv's own PDF page (arxiv.org/pdf/<id>), the
// paper from arXiv, as a reader opens it —, and either
//   - the translation the rule's gate measured (MOCK=1: AXT_DATA/runs/visual-eval/<lang>/<id>/translation.json, given
//     back unit by unit, as the reader sends each on the tags wire, by an LLM endpoint on this machine), so that the
//     final can be held against the gate's record for the same translation (records/typeset-gate.json `papers`), or
//   - the extension's default service, Microsoft (no MOCK), for the times a reader meets.
// Per paper, in a fresh profile (a first visit: the TeX page's engine and files fetched too): when the first preview
// and the final were on screen (from the decision to translate), the compiles in order, the browser's peak memory, the
// final's pages and start and end drift against the original — compiled natively in full with its line
// probes and marks, as the gate compiles it — and the final's own text page by page: the share of each page's letters
// in the target's script (for German, its function words against English ones), so that a page left in English shows.
// Papers stay on this machine: nothing is written but out/reader-typeset/<build>-<lang>-<id>.json and the final's PDF.
//   AXT_DATA=<data> MOCK=1 pnpm exec tsx experiments/pdf-bilingual/spikes/reader-typeset.mjs zh/2608.02163 ja/2608.18090 …
//   BUILD=<another build> TAG=<name> … — another build (today's: one of the commit before the rule), its results named
// The TeX page's warm-up (2026-10-02): TEX_HOST=<host:port> TEX_SPKI=<its key's SHA-256, base64> — the build's own page
// (tex.readarxiv.org) served on this machine, by that name, its certificate trusted by its key; LOCALE=<tag> — the
// browser's language (its accept-languages), which the extension's first target follows at install; WARM=1 — the paper opened once the
// install's warm-up is done (its record reported), else at once, while a build that has one runs it; REVISIT=<id> —
// another paper opened in the same profile once the first visit is done (the same paper would be this machine's copy,
// which asks nothing of the TeX page), its times reported.
import { execFile, execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { keptFor, openPaper, originalFiles } from '../../../src/pdf-reader/engine/live.mjs'
import { serializeTags, WIRE } from '../../../src/pdf-reader/engine/mt.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'
import { alignment, marksOf } from '../../../src/pdf-reader/engine/typeset/places.mjs'
import { copyWithGrants } from '../../../tests/e2e/ext-copy.mjs'
import { openOptions, seedService } from '../../../tests/e2e/options-page.mjs'
import { BUILD, launchWithReader } from '../../../tests/e2e/lib/extension.mjs'

const run = promisify(execFile)
const root = new URL('..', import.meta.url).pathname
const DATA = process.env.AXT_DATA ?? join(root, 'data'), MOCK = !!process.env.MOCK
const SITE = process.env.SITE ?? null, ENDPOINT = process.env.ENDPOINT ?? 'http://localhost:8070', EMBEDDED = !!process.env.EMBEDDED
const TAG = process.env.TAG ?? 'rule', OUT = join(root, 'out/reader-typeset')
const WARM = !!process.env.WARM, REVISIT = process.env.REVISIT ?? null
const BROWSER_ARGS = [
  ...(process.env.TEX_HOST ? [`--host-resolver-rules=MAP tex.readarxiv.org ${process.env.TEX_HOST}`] : []),
  ...(process.env.TEX_SPKI ? [`--ignore-certificate-errors-spki-list=${process.env.TEX_SPKI}`] : []),
]
const PDFJS = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
const pdfOf = bytes => getDocument({ data: new Uint8Array(bytes), verbosity: 0, cMapUrl: join(PDFJS, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(PDFJS, 'standard_fonts/') }).promise
/** the extension's target language codes (config/languages.ts, ISO 639-3) */
const CODE = { zh: 'cmn', ja: 'jpn', ko: 'kor', de: 'deu', ru: 'rus' }
const SCRIPT = { zh: /\p{Script=Han}/gu, ja: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu, ko: /\p{Script=Hangul}/gu, ru: /\p{Script=Cyrillic}/gu }

// ---- the gate's translation as the reader would get it back: each unit's pieces on the tags wire
const unitKey = u => `${u.kind}\u0000${JSON.stringify(u.pieces.map(p => [p.t, p.s ?? p.src ?? `${p.pre}\u0001${p.post}`]))}`
const rebind = (u, pieces) => { const own = u.pieces.filter(p => p.t === 'nested'); return pieces.map(p => (p.t === 'nested' ? own.find(q => q.pre === p.pre && q.post === p.post) ?? p : p)) }
/** a translated text piece as the engine wrote it: TeX's escapes taken off again (mt.mjs texEscape) */
const untex = s => s.replace(/\\textbackslash\{\}|\\textasciitilde\{\}|\\textasciicircum\{\}|\\([#$%&_{}])/g, (m, c) => c ?? { '\\textbackslash{}': '\\', '\\textasciitilde{}': '~', '\\textasciicircum{}': '^' }[m])
const sameVoid = (a, b) => a.t === b.t && (a.src ?? '') === (b.src ?? '') && a.pre === b.pre && a.post === b.post
/** a unit's translated pieces → the reply on its tags wire (serializeTags' slots, by the pieces they stand for), or null */
function replyOf(u, pieces) {
  const { slots } = serializeTags(u), used = new Set()
  const ends = new Set([pieces[0], pieces.at(-1)].filter(p => p?.t === 'text' && !p.tr))
  let out = ''
  for (const p of pieces) {
    if (p.t === 'text') { if (!ends.has(p)) out += WIRE.tags.run(untex(p.s)); continue }
    if (p.t === 'close') { out += '</t>'; continue }
    const n = slots.findIndex((s, k) => !used.has(k) && (p.t === 'open' ? s.open?.src === p.src : s.void && sameVoid(s.void, p)))
    if (n < 0) return null
    used.add(n)
    out += p.t === 'open' ? `<t id="${n + 1}">` : `<x id="${n + 1}"/>`
  }
  return out
}
function repliesFor(lang, id, paper) {
  const byKey = new Map((JSON.parse(readFileSync(join(DATA, 'runs/visual-eval', lang, id, 'translation.json'), 'utf8')).entries ?? []).map(e => [e.key, e.pieces]))
  const kept = keptFor(paper, lang), replies = new Map()
  let missing = 0
  for (const u of paper.units) {
    if (kept.has(u)) continue
    const hit = byKey.get(unitKey(u)), reply = hit && replyOf(u, rebind(u, hit))
    if (reply == null) { missing++; continue }
    replies.set(serializeTags(u).wire, reply)
  }
  return { replies, missing }
}

// ---- the original as the gate compiles it: natively, in full, with its line probes and marks
async function originalMarks(id, files, paper) {
  const hash = createHash('sha256')
  for (const [p, b] of [...originalFiles(paper, { lines: true })].sort(([a], [b]) => a.localeCompare(b))) hash.update(p).update(b)
  const keep = join(OUT, 'originals', `${id}-${hash.digest('hex').slice(0, 16)}.pdf`)
  if (!existsSync(keep)) {
    const dir = join(tmpdir(), `reader-typeset-${id}`)
    rmSync(dir, { recursive: true, force: true })
    for (const [p, b] of [...files, ...originalFiles(paper, { lines: true })]) { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
    const metafont = join(DATA, 'metafont'), tex = existsSync(metafont) ? ['-e', 'MKTEXTFM=0', '-e', 'MKTEXPK=0', '-e', 'MKTEXMF=0', '-v', `${metafont}:/axt-metafont:ro`, '-e', 'TFMFONTS=/axt-metafont//:'] : []
    await run('docker', ['run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', ...tex, '-v', `${dir}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '300', 'latexmk', { xelatex: '-xelatex' }[paper.meta.compiler] ?? '-pdf', ...(paper.meta.bbl ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-f', paper.project.main], { maxBuffer: 1 << 26 }).catch(() => null)
    const pdf = join(dir, `${paper.project.main.split('/').pop().replace(/\.[^./]+$/, '')}.pdf`)
    if (!existsSync(pdf)) throw new Error(`${id}: the original did not compile natively`)
    mkdirSync(dirname(keep), { recursive: true })
    writeFileSync(keep, readFileSync(pdf))
    rmSync(dir, { recursive: true, force: true })
  }
  return { pdf: keep, marks: await marksOf(await pdfOf(readFileSync(keep))) }
}

/** each page's text, the share of its letters in the target's script (German: its function words against English's) */
async function scriptByPage(bytes, lang) {
  const doc = await pdfOf(bytes), out = []
  for (let p = 1; p <= doc.numPages; p++) {
    const t = (await (await doc.getPage(p)).getTextContent()).items.map(i => i.str).join(' ')
    const letters = (t.match(/\p{L}/gu) ?? []).length
    if (!SCRIPT[lang]) { const own = (t.match(/\b(?:der|die|und|das|ist|nicht|mit|für|wird|werden|eine|einer|auf|wir)\b/gi) ?? []).length, en = (t.match(/\b(?:the|and|is|of|with|for|are|that|this|we)\b/gi) ?? []).length; out.push(own + en ? Math.round((100 * own) / (own + en)) : null) }
    else out.push(letters ? Math.round((100 * (t.match(SCRIPT[lang]) ?? []).length) / letters) : null)
  }
  return out
}

// ---- the reader
const serve = handler => new Promise(r => { const s = createServer(handler).listen(0, '127.0.0.1', () => r(s)) })
const corpus = await serve((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const [, kind, id] = decodeURIComponent(req.url.split('?')[0]).match(/^\/(src|pdf)\/(.+)$/) ?? []
  try { res.end(readFileSync(join(DATA, 'corpus', id, kind === 'src' ? 'source.gz' : 'arxiv.pdf'))) } catch { res.statusCode = 404; res.end() }
})
let replies = new Map()
const llm = { segments: 0, misses: 0, missed: [] }
/** a segment's reply: the service puts a sentence marker, <x id="N"/> above every id of the unit's own, at each cut
 *  (src/providers/sentence-markers.ts): the unit's wire is the text with the markers above some id taken out, and the
 *  reply gives them back in order at its end — the sentences are not what is measured here */
function answer(text) {
  const ids = [...text.matchAll(/<x id="(\d+)"\/>/g)].map(m => Number(m[1])), top = Math.max(0, ...ids)
  for (let t = top; t >= 0; t--) {
    const markers = ids.filter(n => n > t)
    const reply = replies.get(text.replace(/<x id="(\d+)"\/>/g, (m, n) => (Number(n) > t ? '' : m)))
    if (reply != null) return reply + markers.map(n => `<x id="${n}"/>`).join('')
  }
  return null
}
const mock = await serve((req, res) => {
  let body = ''
  req.on('data', c => { body += c })
  req.on('end', () => {
    const user = [...(JSON.parse(body || '{}').messages ?? [])].reverse().find(m => m.role === 'user')?.content ?? ''
    const at = user.indexOf('[{"id":')
    let segments = null
    for (let end = user.lastIndexOf(']'); at >= 0 && end > at && !segments; end = user.lastIndexOf(']', end - 1)) { try { segments = JSON.parse(user.slice(at, end + 1)) } catch {} }
    if (!Array.isArray(segments)) { res.writeHead(400).end(); return }
    llm.segments += segments.length
    const content = JSON.stringify({ segments: segments.map(s => { const r = answer(s.text); if (r == null) { llm.misses++; if (llm.missed.length < 5) llm.missed.push(s.text.slice(0, 160)) } return { id: s.id, text: r ?? s.text } }) })
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: 'mock', object: 'chat.completion', created: 0, model: 'mock', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }))
  })
})
const build = process.env.BUILD ?? BUILD
const extension = join(tmpdir(), `reader-typeset-ext-${TAG}`)
copyWithGrants(build, extension, { hostPermissions: ['http://127.0.0.1/*'] })
const record = JSON.parse(readFileSync(join(root, 'records/typeset-gate.json'), 'utf8'))
/** the resident memory of this run's browser, every process of it (MB), by its profile's directory name */
const rssOf = prefix => { try { return Math.round(Number(execSync(`ps -ax -o rss=,command= | grep -F -- "${prefix}" | grep -v grep | awk '{s+=$1} END {print s+0}'`).toString().trim()) / 1024) } catch { return null } }
mkdirSync(OUT, { recursive: true })

for (const spec of process.argv.slice(2)) {
  const [lang, id] = spec.split('/')
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(DATA, 'corpus', id, 'source.gz'))))
  const paper = openPaper(files)
  const r = MOCK ? repliesFor(lang, id, paper) : { replies: new Map(), missing: null }
  replies = r.replies
  llm.segments = 0; llm.misses = 0; llm.missed = []
  const om = await originalMarks(id, files, paper)
  // a fresh profile for every paper: no copy on this machine, nothing in the background's cache
  const launched = Date.now()
  const { context, worker, id: extId, readerUrl } = await launchWithReader({ profile: `reader-typeset-${TAG}`, extension, args: BROWSER_ARGS, languages: process.env.LOCALE ? `${process.env.LOCALE},${process.env.LOCALE.split('-')[0]}` : null })
  // the settings are written once a page of the extension has read them: its settings page, opened and closed
  await (await openOptions(context, extId)).close()
  if (MOCK) await seedService(worker, { id: 'svc-typeset1', name: 'the gate\'s translation', baseURL: `http://127.0.0.1:${mock.address().port}/v1`, model: 'mock' })
  await worker.evaluate(async code => { const { config } = await chrome.storage.local.get('config'); await chrome.storage.local.set({ config: { ...config, targetLanguage: code, fallback: { enabled: false } } }) }, CODE[lang])
  await new Promise(res => setTimeout(res, 500))
  // the install's warm-up, waited for: its record once done (the background's, warmup.ts)
  let warm = null
  if (WARM) {
    for (;;) {
      const w = await worker.evaluate(() => chrome.storage.local.get('axt-tex-warm').then(o => o['axt-tex-warm'] ?? null)).catch(() => null)
      if (w?.at) { warm = { ...w, sinceLaunchMs: Date.now() - launched }; break }
      if (Date.now() - launched > 900000) { warm = { timedOut: true, record: w }; break }
      await new Promise(res => setTimeout(res, 500))
    }
    console.log(`${spec} [${TAG}] warm-up: ${JSON.stringify(warm)}`)
  }
  const src = `http://127.0.0.1:${corpus.address().port}`, at = SITE ? { site: SITE, endpoint: ENDPOINT } : {}
  const memory = []
  const sampling = setInterval(() => { const mb = rssOf(`reader-typeset-${TAG}-`); if (mb) memory.push(mb) }, 1000)
  /** one visit to a paper: its events, the final's bytes (base64) and the page's errors */
  const visit = async id => {
    const page = await context.newPage(), errors = []
    page.on('pageerror', e => errors.push(e.message))
    let reader = page
    if (EMBEDDED) {
      // arXiv's PDF page, which the extension lays the reader over; bilingual chosen there, as a reader chooses it
      await page.goto(`https://arxiv.org/pdf/${id}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      reader = await (await page.waitForSelector('iframe[data-axt-pdf-reader]', { timeout: 60000 })).contentFrame()
      await reader.waitForFunction(() => window.__reader?.controller, null, { timeout: 60000 })
      await reader.evaluate(() => window.__reader.controller.setDisplay('bilingual'))
    } else await page.goto(readerUrl({ paper: id, live: '1', mode: 'bilingual', ...at, src: `${src}/src/${id}`, pdf: `${src}/pdf/${id}` }))
    await reader.waitForFunction(() => window.__reader?.live?.done, null, { timeout: 900000, polling: 500 }).catch(() => {})
    const live = await reader.evaluate(() => ({ events: window.__reader.live.events, failed: window.__reader.live.failed ?? null }))
    const bytes = await reader.evaluate(async () => { const d = await window.__reader.debug?.right?.doc?.getData(); return d ? btoa(Array.from(d, c => String.fromCharCode(c)).join('')) : null })
    await page.close()
    return { live, bytes, errors }
  }
  /** a visit's times: the first preview and the final from the decision to translate, the TeX page's start (its
   *  init-done's ms, and when it came) */
  const timesOf = live => {
    const when = name => live.events.find(e => e.event === name)?.t ?? null, from = when('translating')
    const compiler = live.events.find(e => e.event === 'compiler')
    return { firstPreview: when('shown preview') != null && from != null ? when('shown preview') - from : null, final: when('shown final') != null && from != null ? when('shown final') - from : null, texStart: compiler ? { ms: compiler.ms, at: compiler.t - (from ?? 0) } : null, cacheCurrent: live.events.some(e => e.event === 'cache current') }
  }
  const { live, bytes, errors } = await visit(id)
  let again = null
  if (REVISIT) {
    const other = openPaper((await unpackSource(new Uint8Array(readFileSync(join(DATA, 'corpus', REVISIT, 'source.gz'))))).files)
    replies = MOCK ? repliesFor(lang, REVISIT, other).replies : new Map()
    again = await visit(REVISIT)
  }
  clearInterval(sampling)
  await context.close()
  const out = { spec, build: TAG, mock: MOCK, embedded: EMBEDDED, missing: r.missing, llm: { ...llm }, failed: live.failed, errors: errors.slice(0, 5),
    ...timesOf(live), warm, revisit: again ? { paper: REVISIT, ...timesOf(again.live), failed: again.live.failed, errors: again.errors.slice(0, 5) } : null,
    peakMB: memory.length ? Math.max(...memory) : null,
    compiles: live.events.filter(e => ['compiler', 'fonts', 'preview', 'original', 'measure', 'final', 'typeset', 'typeset failed', 'next strategy', 'compile again', 'compiler down'].includes(e.event)).map(({ t, event, ok, ms, typeset, missing, measured, strategy, error, own }) => ({ t, event, ok, ms, typeset, missing, measured, strategy, error, own })) }
  if (bytes) {
    const pdf = Buffer.from(bytes, 'base64')
    writeFileSync(join(OUT, `${TAG}-${lang}-${id}.pdf`), pdf)
    const tm = await marksOf(await pdfOf(pdf)), a = alignment(om.marks, tm)
    out.result = { pages: a.pages, origPages: om.marks.pages, start: a.drift.median, end: a.end.median, within: a.drift.within, script: await scriptByPage(pdf, lang), originalScript: await scriptByPage(readFileSync(om.pdf), lang) }
    const was = record.papers?.[spec]
    if (was) out.gate = { pages: was.pages, start: was.start, end: was.end, today: was.today }
  }
  writeFileSync(join(OUT, `${TAG}-${lang}-${id}.json`), JSON.stringify(out, null, 1))
  const f = x => (x == null ? '-' : x.toFixed(3))
  console.log(`${spec} [${TAG}] ${out.failed ? `FAILED ${out.failed}` : ''} TeX page start ${out.texStart?.ms ?? '-'} ms, first preview ${out.firstPreview} ms, final ${out.final} ms, peak ${out.peakMB} MB;${out.revisit ? ` then ${out.revisit.paper}: TeX page start ${out.revisit.texStart?.ms ?? '-'} ms, first preview ${out.revisit.firstPreview} ms${out.revisit.failed ? ` FAILED ${out.revisit.failed}` : ''};` : ''} ${out.result ? `pages ${out.result.pages} (of ${out.result.origPages}) start ${f(out.result.start)} end ${f(out.result.end)}` : 'no final'}${out.gate ? `; gate pages ${out.gate.pages} start ${f(out.gate.start)}` : ''}${MOCK ? `; replies missing ${r.missing}, misses ${llm.misses} of ${llm.segments}` : ''}`)
  if (out.result) console.log(`  target script per page: ${out.result.script.join(' ')}\n  (the original's:        ${out.result.originalScript.join(' ')})`)
  console.log(`  compiles: ${out.compiles.map(c => `${c.event}${c.own ? '(own)' : ''}${c.ok === false ? '!' : ''}${c.typeset ? '+rule' : ''}${c.measured ? `(${c.measured})` : ''}${c.missing ? `(${c.missing})` : ''}@${c.t}${c.ms != null ? `/${c.ms}` : ''}`).join(' → ')}`)
  for (const c of out.compiles.filter(c => c.ok === false)) console.log(`  ${c.event} failed under ${c.strategy}: ${c.error}`)
  if (llm.missed.length) console.log(`  not the gate's (given back as sent): ${llm.missed.map(t => JSON.stringify(t.slice(0, 80))).join(' | ')}`)
}
corpus.close(); mock.close()
