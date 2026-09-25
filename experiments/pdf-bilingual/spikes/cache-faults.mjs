// The PDF reader's cache where it can go wrong (the final review of its branch): the digest's time on the largest
// paper, the status line after a translation made again changed nothing, and a copy that cannot be shown. Local corpus,
// the TeX Live file server on :8070.
//   node spikes/cache-faults.mjs
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { serveSite } from './live-site.mjs'
import { BUILD, launchWithReader } from './extension.mjs'
import { copyWithGrants } from '../../../tests/e2e/ext-copy.mjs'
import { addService, chooseBuiltIn, openOptions, setSwitch } from '../../../tests/e2e/options-page.mjs'

const root = new URL('..', import.meta.url).pathname
const serve = handler => new Promise(r => { const s = createServer(handler).listen(0, '127.0.0.1', () => r(s)) })
const site = await serveSite()
const corpus = await serve((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const [, kind, id] = decodeURIComponent(req.url.split('?')[0]).match(/^\/(src|pdf)\/(.+)$/) ?? []
  try { res.setHeader('Cache-Control', 'public, max-age=86400'); res.end(readFileSync(join(root, 'data/corpus', id, kind === 'src' ? 'source.gz' : 'arxiv.pdf'))) } catch { res.statusCode = 404; res.end() }
})
const extension = join(root, 'data/ext-cache-faults')
copyWithGrants(BUILD, extension, { hostPermissions: ['http://127.0.0.1/*'] })
const { context, id, readerUrl } = await launchWithReader({ profile: 'cache-faults', extension })
const page = await context.newPage()
const at = `http://127.0.0.1:${corpus.address().port}`
const urlOf = (paper, mode = 'bilingual') => readerUrl({ paper, live: '1', mode, site: `http://127.0.0.1:${site.address().port}`, endpoint: 'http://localhost:8070', src: `${at}/src/${paper}`, pdf: `${at}/pdf/${paper}` })
const failures = []
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures.push(name) }
const events = () => page.evaluate(() => window.__reader.live?.events ?? [])
const done = (ms = 900_000) => page.waitForFunction(() => window.__reader?.live?.done, null, { timeout: ms, polling: 500 }).then(() => true, () => false)

// 1. the digest on the largest paper: none in the Original display; after the left side's first page otherwise
const big = '2608.16117'
await page.goto(urlOf(big, 'original'))
await page.waitForTimeout(8000)
check('the Original display computes no digest', !(await events()).some(e => e.event === 'digest'), (await events()).map(e => e.event).join(', '))
const firstOriginal = await page.evaluate(() => window.__reader.timing.leftFirstPage)
await page.goto(urlOf(big))
await page.waitForFunction(() => window.__reader?.live?.events.some(e => e.event === 'digest'), null, { timeout: 120_000 })
const digest = (await events()).find(e => e.event === 'digest'), firstBilingual = await page.evaluate(() => window.__reader.timing.leftFirstPage)
check('the digest starts after the left side\'s first page', digest.startedAt >= firstBilingual, `started at ${digest.startedAt} ms, took ${digest.ms} ms; first page at ${Math.round(firstBilingual)} ms (${Math.round(firstOriginal)} ms with no digest)`)

// 2. a translation made again that changed nothing: a service on this machine that does not answer, all lost
const paper = '2608.02163'
await page.goto(urlOf(paper))
await done()
const options = await openOptions(context, id)
console.log('unanswering service:', await addService(options, { name: 'silent', baseURL: 'http://127.0.0.1:9/v1', model: 'x' }))
// no fallback, so that every batch is lost rather than translated by a free engine
await setSwitch(options, '出问题时自动改用免费服务', false)
await page.goto(urlOf(paper))
await done()
const status = await page.evaluate(() => window.__reader?.status ?? '')
check('a copy on screen is not called the original', !/still shows the original/.test(status ?? ''), status ?? '')

// 3. a copy that cannot be shown: its PDF replaced by bytes that are none, then a visit, on a service that answers
await chooseBuiltIn(options, 'Google 翻译')
await setSwitch(options, '出问题时自动改用免费服务', true)
await page.evaluate(async () => {
  const d = window.__reader.debug, k = d.cacheKey(), r = await d.pdfCache.get(k.digest, k.lang)
  const { pdf, createdAt, openedAt, ...body } = r
  await d.pdfCache.delete(k.digest, k.lang)
  await d.pdfCache.put({ ...body, pdf: new TextEncoder().encode('not a PDF at all') }, { identity: '', pipeline: body.pipeline })
})
await page.goto(urlOf(paper))
const ended = await done(600_000)
const evs = await events()
check('a copy that cannot be shown is a miss: the visit ends', ended && evs.some(e => e.event === 'cache unusable'), evs.map(e => e.event).filter(e => /cache|shown|engine|done/.test(e)).join(', ') || 'no events')
const left = ended && (await page.evaluate(async () => { const k = window.__reader.debug.cacheKey(), r = await window.__reader.debug.pdfCache.get(k.digest, k.lang); return r ? new TextDecoder().decode(r.pdf.slice(0, 5)) : 'none' }))
check('and the record that could not be shown is gone', ended && left !== 'not a', `the stored PDF now starts: ${left}`)

await context.close(); site.close(); corpus.close()
console.log(failures.length ? `\n${failures.length} failed: ${failures.join('; ')}` : '\nall passed')
process.exitCode = failures.length ? 1 : 0
