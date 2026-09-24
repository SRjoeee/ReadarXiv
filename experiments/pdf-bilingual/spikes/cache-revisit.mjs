// The PDF reader's cache of compiled translations in a real browser (REPORT, eighteenth addendum), on one paper and one
// browser profile. The visits:
//   1. first: a record written;
//   2. again: shown from it with nothing compiled, within 1 s of the left side, its figures' labels translated;
//   3. the left side's first page as quick as without a copy (the digest and the decryption come after it);
//   4. in the Original display, nothing looked up until a translation is asked for;
//   5. two tabs at once, both translating: one record, and it decrypts;
//   6. offline: the copy still opens, its figures translated;
//   7. no service able to answer (a service with no key, no fallback): the copy opens, and says it could not be checked
//      against the settings;
//   8. with another service (an LLM endpoint on this machine): the copy shown at once, no paragraph it had translated
//      shown in English by any preview, the record replaced with the new service's.
// Local corpus (served with the caching headers arXiv's own responses allow), the TeX Live file server on :8070.
//   node spikes/cache-revisit.mjs [id]
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { serveSite } from './live-site.mjs'
import { BUILD, launchWithReader } from './extension.mjs'
import { copyWithGrants } from '../../../tests/e2e/ext-copy.mjs'
import { addService, openOptions, setSwitch } from '../../../tests/e2e/options-page.mjs'

const root = new URL('..', import.meta.url).pathname
const paper = process.argv[2] ?? '2608.02163'
const serve = handler => new Promise(r => { const s = createServer(handler).listen(0, '127.0.0.1', () => r(s)) })
const site = await serveSite()
// the paper as arXiv serves it, with a validator and a lifetime, so that the browser's cache holds it as it holds arXiv's
const corpus = await serve((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const [, kind, id] = decodeURIComponent(req.url.split('?')[0]).match(/^\/(src|pdf)\/(.+)$/) ?? []
  try {
    const body = readFileSync(join(root, 'data/corpus', id, kind === 'src' ? 'source.gz' : 'arxiv.pdf'))
    res.setHeader('ETag', `"sha256:${createHash('sha256').update(body).digest('hex')}"`)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.end(body)
  } catch { res.statusCode = 404; res.end() }
})
// an LLM that gives every segment back marked, as spikes/reader-live.mjs's does
const MARK = 'LLMECHO '
const marked = text => { let done = false; return text.split(/(<[^>]*>)/).map(part => (done || part.startsWith('<') || !/\p{L}/u.test(part) ? part : ((done = true), part.replace(/\p{L}/u, l => MARK + l)))).join('') }
const llm = await serve((req, res) => {
  let body = ''
  req.on('data', c => { body += c })
  req.on('end', () => {
    const user = [...(JSON.parse(body || '{}').messages ?? [])].reverse().find(m => m.role === 'user')?.content ?? ''
    const at = user.indexOf('[{"id":')
    let segments = null
    for (let end = user.lastIndexOf(']'); at >= 0 && end > at && !segments; end = user.lastIndexOf(']', end - 1)) { try { segments = JSON.parse(user.slice(at, end + 1)) } catch {} }
    if (!Array.isArray(segments)) { res.writeHead(400).end(); return }
    const content = JSON.stringify({ segments: segments.map(s => ({ id: s.id, text: marked(s.text) })) })
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: 'echo', object: 'chat.completion', created: 0, model: 'echo', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }))
  })
})
// the settings page asks for an endpoint's origin when it is saved: granted in a copy's manifest, as the e2e does
const extension = join(root, 'data/ext-cache-revisit')
copyWithGrants(BUILD, extension, { hostPermissions: ['http://127.0.0.1/*', 'https://example.invalid/*'] })
const { context, id, readerUrl } = await launchWithReader({ profile: 'cache-revisit', extension })
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))

const at = `http://127.0.0.1:${corpus.address().port}`
const urlOf = mode => readerUrl({ paper, live: '1', mode, site: `http://127.0.0.1:${site.address().port}`, endpoint: 'http://localhost:8070', src: `${at}/src/${paper}`, pdf: `${at}/pdf/${paper}` })
const failures = []
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures.push(name) }
const events = (p = page) => p.evaluate(() => window.__reader.live?.events ?? [])
const has = (evs, name) => evs.some(e => e.event === name)
const tOf = (evs, name) => evs.find(e => e.event === name)?.t
async function visit(mode = 'bilingual', p = page) {
  await p.goto(urlOf(mode))
  await p.waitForFunction(() => window.__reader?.live?.done, null, { timeout: 900_000, polling: 500 })
  return events(p)
}
/** the right side's figure labels: [shown, source] */
const labels = () => page.evaluate(() => [...window.__reader.debug.right.container.querySelectorAll('.axt-img span')].map(s => [s.textContent, s.title]))
/**
 * The right side scrolled to its first page whose figures have labels, drawn there: that page, 0 with none. A figure's
 * text is translated when its page is drawn, so a record holds the figures of the pages a visit saw
 */
const toFigurePage = known => page.evaluate(async known => {
  const r = window.__reader.debug.right
  const drawn = async (p, tries) => {
    r.viewer.scrollPageIntoView({ pageNumber: p })
    for (let i = 0; i < tries; i++) {
      await new Promise(done => setTimeout(done, 200))
      if (r.container.querySelector(`.page[data-page-number="${p}"] .axt-img span`)) return true
    }
    return false
  }
  // a page found once is gone back to, waited on as long as a first recognition takes (the recogniser starts cold)
  if (known) return (await drawn(known, 75)) ? known : 0
  for (let p = 1; p <= r.doc.numPages; p++) if (await drawn(p, p === 1 ? 75 : 10)) return p
  return 0
}, known)
let figPage = 0
/** on the page with figures' labels: how many entries the page holds, and how many labels on the right are translated */
const figures = async () => {
  const at = await toFigurePage(figPage)
  figPage ||= at
  await page.waitForTimeout(2000)
  const all = await labels()
  return { page: at, entries: await page.evaluate(() => window.__reader.debug.figureEntries().size), labels: all.length, translated: all.filter(([shown, source]) => shown && source && shown !== source).length }
}
const store = fn => page.evaluate(fn)

// 1. the first visit
let evs = await visit()
const firstPage1 = await page.evaluate(() => window.__reader.timing.leftFirstPage)
check('first visit: the record is written', evs.some(e => e.event === 'cache write' && e.written), JSON.stringify(evs.find(e => e.event === 'cache write') ?? {}))
check('first visit: one record', (await store(() => window.__reader.debug.pdfCache.usage())).count === 1)
// the figures of a page with labels translated, and kept in the record (saved a few seconds after they come)
const seen = await figures()
await page.waitForTimeout(3000)
console.log('first visit\'s figures:', JSON.stringify(seen))

// 2. again
evs = await visit()
const shownIn = tOf(evs, 'shown cached') - tOf(evs, 'opened')
check('again: shown from the copy', has(evs, 'shown cached') && has(evs, 'cache current'))
check('again: nothing compiled', !has(evs, 'compiler') && !has(evs, 'preview') && !has(evs, 'final'), evs.map(e => e.event).join(', '))
check('again: within 1 s of the left side', shownIn <= 1000, `${shownIn} ms (opened → cache hit ${tOf(evs, 'cache hit') - tOf(evs, 'opened')} ms)`)
let f = await figures()
check('again: its figures\' labels translated', f.entries > 0 && f.translated > 0, JSON.stringify(f))

// 3. the left side's first page, with and without a copy
const firstPage2 = await page.evaluate(() => window.__reader.timing.leftFirstPage)
check('the left side\'s first page no later with a copy', firstPage2 <= firstPage1 * 1.2 + 100, `${Math.round(firstPage1)} ms first visit, ${Math.round(firstPage2)} ms again`)

// 4. the Original display
await page.goto(urlOf('original'))
await page.waitForTimeout(3000)
evs = await events()
check('Original: nothing looked up before a translation is asked for', !has(evs, 'cache hit') && !has(evs, 'engine'), evs.map(e => e.event).join(', '))
await page.evaluate(() => window.__reader.controller.setDisplay('bilingual'))
await page.waitForFunction(() => window.__reader.live?.events.some(e => e.event === 'shown cached'), null, { timeout: 30_000 })
check('Original: the copy comes once Side by side is chosen', true)
await page.waitForFunction(() => window.__reader.live?.done, null, { timeout: 60_000 })

// 5. two tabs at once, both translating, on the default service: the copy cleared first
await store(() => window.__reader.debug.pdfCache.clear())
const second = await context.newPage()
const [evA, evB] = await Promise.all([visit('bilingual', page), visit('bilingual', second)])
const ends = evs2 => evs2.filter(e => /^(final|cache write|failed|done)$/.test(e.event)).map(e => `${e.event}${e.event === 'final' ? `(ok ${e.ok}${e.error ? `: ${e.error}` : ''})` : e.event === 'cache write' ? `(${e.how}, ${e.written})` : ''}`).join(' ')
const both = await store(async () => { const k = window.__reader.debug.cacheKey(); const r = await window.__reader.debug.pdfCache.get(k.digest, k.lang); return { usage: await window.__reader.debug.pdfCache.usage(), pdf: r?.pdf?.byteLength ?? 0 } })
check('two tabs: one record, and it decrypts', both.usage.count === 1 && both.pdf > 0, `${JSON.stringify(both)}; tab A: ${ends(evA)}; tab B: ${ends(evB)}`)
await second.close()

// the figures of a page with labels seen again, since the copy was cleared: a record holds the figures of the pages seen
console.log('two tabs\' figures:', JSON.stringify(await figures()))
await page.waitForTimeout(3000)
const options = await openOptions(context, id)

// 6. offline, on the default service's copy
await context.setOffline(true)
evs = await visit()
check('offline: the copy opens', has(evs, 'shown cached') && tOf(evs, 'shown cached') - tOf(evs, 'opened') <= 1000, `${tOf(evs, 'shown cached') - tOf(evs, 'opened')} ms; ${await page.evaluate(() => window.__reader?.status ?? '')}`)
f = await figures()
check('offline: its figures\' labels translated', f.entries > 0 && f.translated > 0, JSON.stringify(f))
await context.setOffline(false)

// 7. no service able to answer: one that is not on this machine and has no key, and no fallback; the default service's copy
console.log('keyless service:', await addService(options, { name: 'keyless', baseURL: 'https://example.invalid/v1', model: 'x' }))
await setSwitch(options, '出问题时自动改用免费服务', false)
evs = await visit()
const status = await page.evaluate(() => window.__reader?.status ?? '')
check('no service: the copy opens, and says it was not checked', has(evs, 'shown cached') && /not checked against the settings/.test(status ?? ''), status ?? '')
f = await figures()
check('no service: its figures\' labels translated', f.entries > 0 && f.translated > 0, JSON.stringify(f))

// 8. another service, last: the LLM on this machine gives a figure's block back with its first box alone changed, so the
// figures' checks above are made on a real translation
console.log('LLM service:', await addService(options, { name: 'echo', baseURL: `http://127.0.0.1:${llm.address().port}/v1`, model: 'echo' }))
evs = await visit()
const old = await store(() => window.__reader.debug.cached()?.units ?? [])
const shown = await store(() => window.__reader.shownTexts ?? [])
const regressed = shown.filter(s => !s.final).map(s => s.texts.filter(t => old[t.id]?.tr && t.text === old[t.id].src).length)
check('another service: the copy shown before any preview', has(evs, 'shown cached') && (!has(evs, 'shown preview') || evs.findIndex(e => e.event === 'shown cached') < evs.findIndex(e => e.event === 'shown preview')))
check('another service: no preview shows a translated paragraph in English', regressed.every(n => n === 0), `${regressed.length} previews, paragraphs in English: ${regressed.join(' ') || 'none'}`)
check('another service: the record written again', evs.some(e => e.event === 'cache write' && e.written), JSON.stringify(evs.find(e => e.event === 'cache write') ?? {}))
const echoId = await store(() => window.__reader.debug.identityNow())
const units = await store(async () => { const k = window.__reader.debug.cacheKey(); return (await window.__reader.debug.pdfCache.get(k.digest, k.lang))?.units ?? [] })
// the figures of a page with labels, under the new service: a record holds the figures of the pages a visit saw
console.log('another service\'s figures:', JSON.stringify(await figures()))
await page.waitForTimeout(3000)
check('another service: the record is the new service\'s', units.length > 0 && units.every(u => u.state === 'kept' || u.by === echoId || u.tried === echoId), `${units.filter(u => u.state !== 'kept' && u.by !== echoId).length} units by another identity`)

console.log('page errors:', errors.length, errors.slice(0, 3))
await context.close(); site.close(); corpus.close(); llm.close()
console.log(failures.length ? `\n${failures.length} failed: ${failures.join('; ')}` : '\nall passed')
process.exitCode = failures.length ? 1 : 0
