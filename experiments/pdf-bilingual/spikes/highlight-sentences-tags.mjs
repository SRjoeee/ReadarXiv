// The highlight's sentences on the tags path (B3b: Google, an LLM), measured as the reader gets them: each unit's tags
// wire (mt.mjs serializeTags) with a marker at each of its sentence cuts (mt.mjs cutsOf; sentence-markers.ts
// markSentences, as the service inserts them), sent through the extension's own background in a real browser — its
// provider, queues and cache, an LLM's key never leaving the extension — and read back as the service reads it
// (unmarkSentences, verifyAlignment) and as the reader cuts it (mt.mjs rehydrateTags, sentencesOf).
// The units: investigator B's sample (85 units of more than one sentence on five papers, report-B §2(b), from
// out/highlight/B/exp-survival-zh.json) and, FULL=1, every unit of the four papers of the ground truth; the cuts as the
// reader sends them (none for a unit lit whole: a heading, a caption, a cell). Per paper:
//  - units of more than one sentence (by our cuts); markers sent, back exactly once, in the order sent; units with every
//    marker back in order; and those without, by what happened: a marker lost (the engine merged two sentences), one
//    back twice (it split one), all back but out of order — each such unit falls back to its paragraph
//  - units aligned: the alignment verified and the sentences read (sentencesOf), of those of more than one sentence
//  - on the sample (B's measure of Microsoft): the unit sent again without markers, the translation the same but for
//    white space, or how far (an edit distance over its length); and once more as the reader sends it, its cuts
//    beside it, the background marking them: aligned there too. The pairs (with and without markers) go to
//    out/highlight/B3b/<engine>-pairs-<lang>.json for reading
// No paper text is printed. Requests: the background batches and paces them as the reader's; its cache answers a
// rerun in the same profile.
//   pnpm build, then:
//   ENGINE=google pnpm exec tsx experiments/pdf-bilingual/spikes/highlight-sentences-tags.mjs   (Google chosen in a profile
//     of its own, out/highlight/B3b/profile-google, kept for its cache)
//   ENGINE=llm AXT_PROFILE=<dir> pnpm exec tsx experiments/pdf-bilingual/spikes/highlight-sentences-tags.mjs   (a profile
//     where the reader's LLM service is set up and chosen on the settings page of this build; the script changes
//     nothing in it, and the key stays in the extension's storage)
//   BUILD=<dir> another build; FULL=1 the four full papers too; LIMIT=<n> at most n units a paper (a first look)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { verifyAlignment } from '../../../src/providers/alignment'
import { markSentences, unmarkSentences } from '../../../src/providers/sentence-markers'
import { TAG_RE } from '../../../src/core/protector/tokens'
import { openPaper } from '../../../src/pdf-reader/engine/live.mjs'
import { bySentence } from '../../../src/pdf-reader/engine/highlight.mjs'
import { cutsOf, rehydrateTags, sentencesOf, serializeTags } from '../../../src/pdf-reader/engine/mt.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'
import { chooseBuiltIn, openOptions } from '../../../tests/e2e/options-page.mjs'

const REPO = new URL('../../../', import.meta.url).pathname, root = new URL('..', import.meta.url).pathname
const { chromium } = createRequire(REPO)('playwright')
const ENGINE = process.env.ENGINE ?? 'google', BUILD = process.env.BUILD ?? join(REPO, '.output/chrome-mv3'), LIMIT = Number(process.env.LIMIT ?? Infinity)
const OUT = join(root, 'out/highlight/B3b')
mkdirSync(OUT, { recursive: true })
const PROFILE = process.env.AXT_PROFILE ?? (ENGINE === 'google' ? join(OUT, 'profile-google') : null)
if (!PROFILE) { console.log('ENGINE=llm needs AXT_PROFILE: a profile of this build with the LLM service chosen'); process.exit(1) }
const GT = ['2608.02785', '2608.04322', '2608.02163', '2608.02459']

// the units: B's sample, and the full papers asked for
const sample = JSON.parse(readFileSync(join(root, 'out/highlight/B/exp-survival-zh.json'), 'utf8')).rows.map(r => ({ id: r.id, i: r.i }))
const papers = new Map()
const unitsOf = async id => {
  if (!papers.has(id)) { const { files } = await unpackSource(new Uint8Array(readFileSync(join(root, 'data/corpus', id, 'source.gz')))); papers.set(id, openPaper(files)) }
  return papers.get(id)
}
const sets = { sample: [] }
for (const { id, i } of sample) sets.sample.push({ id, i, u: (await unitsOf(id)).units[i] })
if (process.env.FULL) {
  sets.full = []
  for (const id of GT) { const p = await unitsOf(id); p.units.forEach((u, i) => { if (!p.kept.has(u)) sets.full.push({ id, i, u }) }) }
}
for (const [k, list] of Object.entries(sets)) {
  const per = new Map()
  sets[k] = list.filter(x => { const n = per.get(x.id) ?? 0; per.set(x.id, n + 1); return n < LIMIT })
}

// the extension, its background asked as the reader's engine asks it (engine.mjs: a status that binds a scope, then
// translate calls in the chain's batches)
const launch = async () => {
  const context = await chromium.launchPersistentContext(PROFILE, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${BUILD}`, `--load-extension=${BUILD}`] })
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  return { context, extId: new URL(worker.url()).host }
}
// A kept profile (AXT_PROFILE) runs the service worker it registered, not the build now on disk, until the extension is
// reloaded: on 2026-10-02 a rebuilt background went unrun, and the LLM's units over its batch cap were measured on the
// old code (0 of 10 aligned, the cache bypassed; 9 of 10 once reloaded). Reloaded from its settings page, the browser
// closed and opened again — its pages do not open in the session that reloaded it; its storage untouched
if (process.env.AXT_PROFILE) {
  const first = await launch()
  await (await openOptions(first.context, first.extId)).evaluate(() => chrome.runtime.reload()).catch(() => {})
  await new Promise(r => setTimeout(r, 2000))
  await first.context.close()
}
const { context, extId } = await launch()
const page = await openOptions(context, extId)
if (ENGINE === 'google' && !process.env.AXT_PROFILE) { await chooseBuiltIn(page, 'Google 翻译'); await page.reload() }
const scope = `axt-b3b-${Date.now()}`
const status = await page.evaluate(scope => chrome.runtime.sendMessage({ type: 'axt:provider-status', scope, fresh: true }), scope)
console.log('engine', status.available ? status.providerId : `${status.fallback?.id} (fallback)`, 'render path', status.renderPath, 'target', status.targetLanguage)
if (status.renderPath !== 'tags') { console.log('the chosen engine is not on the tags path'); await context.close(); process.exit(1) }
/** texts (with their cuts, where given) → { text, alignment? } or null, in the chain's batches, two at a time */
async function ask(items) {
  const out = new Array(items.length).fill(null), batches = []
  let cur = [], n = 0
  items.forEach((it, k) => { if (cur.length && (n + it.text.length > status.maxBatchChars || cur.length >= status.maxBatchItems)) { batches.push(cur); cur = []; n = 0 } cur.push(k); n += it.text.length })
  if (cur.length) batches.push(cur)
  let next = 0
  await Promise.all([0, 1].map(async () => {
    while (next < batches.length) {
      const b = batches[next++]
      const request = { segments: b.map(k => ({ id: String(k), text: items[k].text, ...(items[k].cuts ? { cuts: items[k].cuts } : {}) })), source: 'en', target: status.targetLanguage }
      const res = await page.evaluate(m => chrome.runtime.sendMessage(m), { type: 'axt:translate', request, cache: { paper: 'b3b-probe', renderPath: 'tags' }, scope })
      for (const s of res?.ok ? res.result.segments : (res?.partial ?? [])) out[Number(s.id)] = { text: s.text, alignment: s.alignment }
      if (!res?.ok) console.error('batch failed:', res?.error?.kind, res?.error?.message?.slice(0, 120))
    }
  }))
  return out
}

const lev = (a, b) => { const m = a.length, n = b.length; if (!m || !n) return Math.max(m, n); let prev = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur } return prev[n] }
const norm = t => t.replace(/\s+/g, '')
/** where each of the markers came back in a reply: their ids in order */
const markersIn = (text, ids) => { const want = new Set(ids), got = []; for (const m of text.matchAll(new RegExp(TAG_RE.source, 'g'))) { const id = Number(m[1] ?? m[2] ?? m[3]); if (want.has(id)) got.push(id) } return got }
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : null }

const report = {}
for (const [set, list] of Object.entries(sets)) {
  // the cuts as the reader sends them: none for a unit lit whole (mt.mjs translateUnits)
  const units = list.map(x => { const ser = serializeTags(x.u), cuts = bySentence(x.u.kind) ? cutsOf(x.u, ser) : []; return { ...x, ser, cuts, mark: cuts.length ? markSentences(ser.wire, cuts) : null } })
  const multi = units.filter(x => x.mark)
  const B = await ask(multi.map(x => ({ text: x.mark.text })))
  const A = set === 'sample' ? await ask(multi.map(x => ({ text: x.ser.wire }))) : []
  const C = set === 'sample' ? await ask(multi.map(x => ({ text: x.ser.wire, cuts: x.cuts }))) : []
  const per = {}, pairs = []
  multi.forEach((x, k) => {
    const r = (per[x.id] ??= { multi: 0, answered: 0, markersSent: 0, backOnce: 0, allInOrder: 0, lost: 0, doubled: 0, reordered: 0, unreadable: 0, aligned: 0, sentences: 0, compared: 0, sameText: 0, edit: [], viaCuts: 0, viaCutsAligned: 0 })
    r.multi++
    const b = B[k]
    if (!b) return
    r.answered++
    const ids = x.mark.ids, got = markersIn(b.text, ids), count = new Map()
    for (const id of got) count.set(id, (count.get(id) ?? 0) + 1)
    r.markersSent += ids.length
    r.backOnce += ids.filter(id => count.get(id) === 1).length
    const back = unmarkSentences(b.text, ids)
    if (back) r.allInOrder++
    else if (ids.some(id => !count.get(id))) r.lost++
    else if (ids.some(id => count.get(id) > 1)) r.doubled++
    else r.reordered++
    const text = back?.text ?? b.text
    if (back) {
      const alignment = verifyAlignment({ source: x.mark.source, target: back.target }, x.ser.wire, back.text), read = rehydrateTags(back.text, x.ser)
      if (read.error) r.unreadable++
      const s = alignment && !read.error ? sentencesOf(x.u, x.ser, back.text, alignment, read.pieces, false, 'tags') : null
      if (s) { r.aligned++; r.sentences += s.src.length + 1 }
    }
    // the same unit without markers: the wording the markers may have changed
    const a = A[k]
    if (a) {
      r.compared++
      const plainB = text.replace(new RegExp(TAG_RE.source, 'g'), m => (ids.includes(Number(/\d+/.exec(m)?.[0])) ? '' : m))
      if (norm(plainB) === norm(a.text)) r.sameText++
      else r.edit.push(lev(norm(plainB), norm(a.text)) / Math.max(1, norm(a.text).length))
      pairs.push({ id: x.id, i: x.i, sentences: x.cuts.length + 1, source: x.ser.wire, plain: a.text, marked: b.text })
    }
    // as the reader sends it: the cuts beside the text, the background marking them
    const c = C[k]
    if (c) {
      r.viaCuts++
      const read = rehydrateTags(c.text, x.ser), s = c.alignment && !read.error ? sentencesOf(x.u, x.ser, c.text, c.alignment, read.pieces, false, 'tags') : null
      if (s) r.viaCutsAligned++
    }
  })
  const all = { multi: 0, answered: 0, markersSent: 0, backOnce: 0, allInOrder: 0, lost: 0, doubled: 0, reordered: 0, unreadable: 0, aligned: 0, sentences: 0, compared: 0, sameText: 0, edit: [], viaCuts: 0, viaCutsAligned: 0 }
  for (const r of Object.values(per)) for (const [f, v] of Object.entries(r)) all[f] = Array.isArray(v) ? [...all[f], ...v] : all[f] + v
  per.all = all
  for (const r of Object.values(per)) { r.editMedian = r.edit.length ? +median(r.edit).toFixed(3) : null; r.editMax = r.edit.length ? +Math.max(...r.edit).toFixed(3) : null; delete r.edit }
  report[set] = { units: units.length, single: units.length - multi.length, per }
  console.log(`\n${set}: ${units.length} units, ${multi.length} of more than one sentence (our cuts)`)
  console.log(['paper'.padEnd(12), 'multi', 'answered', 'markers', 'back once', 'all in order', 'lost', 'doubled', 'reordered', 'unreadable', 'aligned', 'sentences', ...(set === 'sample' ? ['compared', 'same text', 'edit p50', 'edit max', 'via cuts', 'aligned'] : [])].join('\t'))
  for (const [id, r] of Object.entries(per)) console.log([id.padEnd(12), r.multi, r.answered, r.markersSent, r.backOnce, r.allInOrder, r.lost, r.doubled, r.reordered, r.unreadable, r.aligned, r.sentences, ...(set === 'sample' ? [r.compared, r.sameText, r.editMedian, r.editMax, r.viaCuts, r.viaCutsAligned] : [])].join('\t'))
  if (pairs.length) writeFileSync(join(OUT, `${ENGINE}-pairs-${status.targetLanguage}.json`), JSON.stringify(pairs, null, 1))
}
await page.evaluate(scope => chrome.runtime.sendMessage({ type: 'axt:cancel-scope', scope }), scope)
writeFileSync(join(OUT, `${ENGINE}-${status.targetLanguage}.json`), JSON.stringify({ engine: status.providerId, target: status.targetLanguage, report }, null, 1))
await context.close()
