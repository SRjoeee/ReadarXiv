// A translation service that fails, then comes back, with the reader in a real browser (the reader's design, §8, §10.3).
// A local OpenAI-compatible endpoint echoes each segment with a mark, and can be taken down: its socket destroyed, a
// network failure. Local corpus, the TeX Live file server on :8070. Build first.
//   node experiments/pdf-bilingual/spikes/service-faults.mjs [paper]      AXT_CASES=0,1,2,3 picks the cases
// Cases:
//   0. a service chosen while a run is under way, both ways (Microsoft's markers → the echo's tags, and back): what the
//      new service is sent and what comes back
//   1. down from the start: the card with the network's reason once the first batch has failed, no compile, no page error
//   2. back up, the card's retry pressed twice: one run, in place (the page not loaded again), a preview shown
//   3. down after the first requests: the run stops, what there is is compiled, the notice counts the rest; back up and
//      the browser online again: the translation goes on by itself, and only the missing paragraphs reach the endpoint
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
const CASES = new Set((process.env.AXT_CASES ?? '0,1,2,3').split(',').map(Number))
const serve = handler => new Promise(r => { const s = createServer(handler).listen(0, '127.0.0.1', () => r(s)) })
const site = await serveSite()
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

// the endpoint: every segment echoed with a mark; down, its socket destroyed; `upTo`, down after that many requests.
// Every text it is sent, and every one it answers, recorded
const MARK = 'ECHO '
const endpoint = { down: false, upTo: Number.POSITIVE_INFINITY, requests: 0, received: [], answered: new Set() }
const llm = await serve((req, res) => {
  let body = ''
  req.on('data', c => { body += c })
  req.on('end', () => {
    endpoint.requests++
    if (endpoint.down || endpoint.requests > endpoint.upTo) { req.socket.destroy(); return }
    const user = [...(JSON.parse(body || '{}').messages ?? [])].reverse().find(m => m.role === 'user')?.content ?? ''
    const at = user.indexOf('[{"id":')
    let segments = null
    for (let end = user.lastIndexOf(']'); at >= 0 && end > at && !segments; end = user.lastIndexOf(']', end - 1)) { try { segments = JSON.parse(user.slice(at, end + 1)) } catch {} }
    if (!Array.isArray(segments)) { res.writeHead(400).end(); return }
    for (const s of segments) endpoint.received.push(s.text)
    for (const s of segments) endpoint.answered.add(s.text)
    const content = JSON.stringify({ segments: segments.map(s => ({ id: s.id, text: `${MARK}${s.text}` })) })
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: 'echo', object: 'chat.completion', created: 0, model: 'echo', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }))
  })
})

const extension = join(root, 'data/ext-service-faults')
copyWithGrants(BUILD, extension, { hostPermissions: ['http://127.0.0.1/*'] })
const { context, id, readerUrl } = await launchWithReader({ profile: 'service-faults', extension })
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
const at = `http://127.0.0.1:${corpus.address().port}`
const urlOf = mode => readerUrl({ paper, live: '1', mode, site: `http://127.0.0.1:${site.address().port}`, endpoint: 'http://localhost:8070', src: `${at}/src/${paper}`, pdf: `${at}/pdf/${paper}` })
const failures = []
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures.push(name) }
const events = () => page.evaluate(() => window.__reader.live?.events ?? [])
const state = () => page.evaluate(() => window.__reader.controller.getState())
const until = (test, arg, timeout = 900_000) => page.waitForFunction(test, arg, { timeout, polling: 250 }).then(() => true, () => false)
const patch = change => page.evaluate(p => window.__reader.controller.patchSettings(c => ({ ...c, ...p })), change)
/** a visit with no copy on this machine: the copy of the paper cleared first, once the page's store is reachable */
async function freshVisit() {
  await page.goto(urlOf('translation'))
  await until(() => window.__reader?.debug?.pdfCache, null, 120_000)
  await page.evaluate(() => window.__reader.debug.pdfCache.clear())
  await page.goto(urlOf('translation'))
  await until(() => window.__reader?.controller?.getState().settings, null, 60_000)
}
/** the echo under another model name: the background's cache of translations keys by the model, so a case's texts are
 *  not answered from another case's */
const useModel = model => page.evaluate(([id, m]) => window.__reader.controller.patchSettings(c => ({ ...c, provider: id, services: c.services.map(s => (s.id === id ? { ...s, model: m } : s)) })), [echoId, model])

// the echo service, added while it answers (the drawer connects to it), and no hand-over to the free service on failure
const options = await openOptions(context, id)
console.log('echo service:', await addService(options, { name: 'Echo', baseURL: `http://127.0.0.1:${llm.address().port}/v1`, model: 'echo', apiKey: 'sk-echo' }))
await setSwitch(options, '出问题时自动改用免费服务', false)
await options.close()
await page.goto(urlOf('translation'))
await until(() => window.__reader?.controller?.getState().settings, null, 60_000)
const echoId = await page.evaluate(() => window.__reader.controller.getState().settings.services.find(s => s.name === 'Echo')?.id)

if (CASES.has(0)) {
  // 0. a service chosen while a run is under way. The markers of a free engine are `@a#`; an LLM's tags `<x id="…">`
  const hows = evs => evs.filter(e => e.event === 'translated').map(e => e.how)
  for (const [from, to] of [['microsoft', echoId], [echoId, 'microsoft']]) {
    await patch({ provider: from })
    await freshVisit()
    await until(() => (window.__reader.live?.events ?? []).some(e => e.event === 'translated'))
    const before = hows(await events()).length
    const sent = endpoint.received.length
    await patch({ provider: to })
    await until(() => window.__reader.live?.done)
    const all = hows(await events()), after = all.slice(before)
    const toEcho = endpoint.received.slice(sent)
    console.log(`case 0, ${from === echoId ? 'echo' : from} → ${to === echoId ? 'echo' : to}: before ${JSON.stringify(all.slice(0, before))}; after ${JSON.stringify(after)}; the echo was sent ${toEcho.length} texts after the switch, ${toEcho.filter(t => /@[a-z0-9]+#/i.test(t)).length} with markers, ${toEcho.filter(t => /<x id=/.test(t)).length} with tags; state ${JSON.stringify((({ phase, shown, failedUnits }) => ({ phase, shown, failedUnits }))(await state()))}`)
  }
  await patch({ provider: echoId })
}

if (CASES.has(1)) {
  // 1. down from the start: the card with the network's reason once the first batch has failed; nothing compiled
  endpoint.down = true
  await useModel('echo-1')
  await freshVisit()
  const t0 = Date.now()
  const card = await until(() => window.__reader.controller.getState().phase === 'failed')
  const evs = await events(), s = await state()
  check('down from the start: the card, with the network\'s reason', card && s.failure === 'network' && !!(await page.$('.card[data-card]')), JSON.stringify({ phase: s.phase, failure: s.failure }))
  check('…nothing compiled', !evs.some(e => e.event === 'preview' || e.event === 'final'), JSON.stringify(evs.map(e => e.event)))
  const first = evs.find(e => e.event === 'translated')?.t, failed = evs.find(e => e.event === 'failed')?.t
  check('…once the first batch has failed, not after every batch', first != null && failed != null && failed - first < 5_000 && Date.now() - t0 < 180_000, JSON.stringify({ firstBatchAt: first, failedAt: failed, seconds: Math.round((Date.now() - t0) / 1000) }))
}

if (CASES.has(2)) {
  // 2. back up, the card's retry pressed twice: one run, in place; a preview shown
  endpoint.down = false
  await page.evaluate(() => {
    window.__stay = 1
    window.__runs = 0
    let was = window.__reader.controller.getState().phase
    window.__reader.controller.subscribe(() => { const now = window.__reader.controller.getState().phase; if (now !== was && (now === 'translating' || now === 'retranslating')) window.__runs++; was = now })
  })
  const retry = page.locator('.card[data-card] button')
  await retry.click()
  await page.waitForTimeout(50)
  await retry.click().catch(() => {})
  const preview = await until(() => (window.__reader.live?.events ?? []).some(e => e.event === 'shown preview' || e.event === 'shown final'))
  const r = await page.evaluate(() => ({ stay: window.__stay, runs: window.__runs, frames: document.querySelectorAll('iframe[src$="/tex.html"]').length, spoken: document.querySelector('[role="status"]')?.textContent ?? '' }))
  check('retry: in place, the page not loaded again', r.stay === 1, JSON.stringify(r))
  check('…one run for two presses', r.runs === 1, JSON.stringify(r))
  check('…one compiler frame', r.frames === 1, JSON.stringify(r))
  check('…a translation shown', preview)
  await until(() => window.__reader.live?.done)
}

if (CASES.has(3)) {
  // 3. down after the first requests: the run stops, the notice counts the rest; back online, it goes on by itself
  endpoint.down = false
  endpoint.requests = 0
  endpoint.upTo = 3
  endpoint.answered.clear()
  await useModel('echo-3')
  await freshVisit()
  await until(() => window.__reader.live?.done)
  const s = await state()
  check('down midway: the run ends, the notice counting the paragraphs left in English', s.phase === 'ready' && s.failedUnits > 0 && !!(await page.$('.capsule[data-kind="notice"]')), JSON.stringify({ phase: s.phase, failedUnits: s.failedUnits }))
  const answeredBefore = new Set(endpoint.answered)
  const sentBefore = endpoint.received.length
  endpoint.upTo = Number.POSITIVE_INFINITY
  await context.setOffline(true)
  await page.waitForTimeout(300)
  await context.setOffline(false)
  const ran = await until(() => window.__reader.controller.getState().phase === 'translating', null, 30_000)
  check('…the browser online again: the translation goes on by itself', ran)
  await until(() => window.__reader.live?.done && window.__reader.controller.getState().phase === 'ready')
  const after = await state()
  check('…and ends with nothing missing', after.failedUnits === 0, JSON.stringify({ failedUnits: after.failedUnits }))
  const resent = endpoint.received.slice(sentBefore).filter(t => answeredBefore.has(t))
  check('…only the missing paragraphs reach the endpoint again', resent.length === 0, `${endpoint.received.length - sentBefore} sent, ${resent.length} already answered`)
}

check('no page error', errors.length === 0, errors.join('; '))
console.log(failures.length ? `\n${failures.length} failed: ${failures.join('; ')}` : '\nall passed')
await context.close()
process.exit(failures.length ? 1 : 0)
