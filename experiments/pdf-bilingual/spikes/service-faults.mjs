// A translation service that fails, then comes back, with the reader in a real browser (the reader's design, §8, §10.3).
// A local OpenAI-compatible endpoint echoes each segment with a mark, and can be taken down: its socket destroyed, a
// network failure. Local corpus, the TeX Live file server on :8070. Build first.
//   node experiments/pdf-bilingual/spikes/service-faults.mjs [paper]      AXT_CASES=0,1,2,3 picks the cases
// Cases:
//   0. a service chosen while a run is under way, both ways (Microsoft's markers → the echo's tags, and back): what the
//      new service is sent and what comes back
//   1. down from the start: the card with the network's reason once the first batch has failed, no compile, no page error
//   2. back up, the card's retry pressed twice: one run, in place (the page not loaded again), a preview shown
//   3. down after the first requests: the run stops, what there is is compiled, the notice counts the rest — one count,
//      the run's own, never a passing one; back up and the browser online again: the translation goes on by itself, a
//      retry pressed meanwhile starting no second run, and only the missing paragraphs reach the endpoint
//   4. retry while the service is still down: the same card again, no second compiler, nothing compiled
//   5. the network back while the stopped run still compiles its final: the translation goes on once that run ends
//   6. a service that cannot run at the start: the card; another chosen: the translation runs again, in place, with
//      the paper's title and abstract for the figures' text (Part 4's final review)
//   7. a TeX page on which every compile fails: the capsule that says the paper cannot be had as a bilingual PDF, with
//      its HTML version, the translated displays greyed; a second visit asks the service and the TeX page for nothing.
//      A paper with no source, served its PDF for a source: the same capsule (the maintainer, 2026-09-26)
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
const CASES = new Set((process.env.AXT_CASES ?? '0,1,2,3,4,5,6,7').split(',').map(Number))
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
const urlOf = (mode, over = {}) => readerUrl({ paper, live: '1', mode, site: `http://127.0.0.1:${site.address().port}`, endpoint: 'http://localhost:8070', src: `${at}/src/${paper}`, pdf: `${at}/pdf/${paper}`, ...over })
const failures = []
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures.push(name) }
const events = () => page.evaluate(() => window.__reader.live?.events ?? [])
const state = () => page.evaluate(() => window.__reader.controller.getState())
const until = (test, arg, timeout = 900_000) => page.waitForFunction(test, arg, { timeout, polling: 250 }).then(() => true, () => false)
/** a change of the settings, waited for until the reader shows it landed: patchSettings returns before the write, and a
 *  visit that leaves the page at once would lose it (the next case then ran on the last case's service) */
const patch = async change => {
  await page.evaluate(p => window.__reader.controller.patchSettings(c => ({ ...c, ...p })), change)
  await page.waitForFunction(p => Object.entries(p).every(([k, v]) => JSON.stringify(window.__reader.controller.getState().settings?.[k]) === JSON.stringify(v)), change, { timeout: 30_000, polling: 100 })
}
/** a visit with no copy on this machine: the store of copies (src/cache/pdf-store.ts, 'axt-pdf') deleted first, from
 *  the extension's settings page, the reader closed so that nothing holds it open */
async function freshVisit(over) {
  await page.goto(`chrome-extension://${id}/options.html`)
  await page.evaluate(() => new Promise(resolve => { const r = indexedDB.deleteDatabase('axt-pdf'); r.onsuccess = r.onerror = r.onblocked = () => resolve(null) }))
  await page.goto(urlOf('translation', over))
  await until(() => window.__reader?.controller?.getState().settings, null, 60_000)
}
/** the echo under another model name: the background's cache of translations keys by the model, so a case's texts are
 *  not answered from another case's */
const useModel = async model => {
  await page.evaluate(([id, m]) => window.__reader.controller.patchSettings(c => ({ ...c, provider: id, services: c.services.map(s => (s.id === id ? { ...s, model: m } : s)) })), [echoId, model])
  await page.waitForFunction(([id, m]) => { const s = window.__reader.controller.getState().settings; return s?.provider === id && s.services.find(x => x.id === id)?.model === m }, [echoId, model], { timeout: 30_000, polling: 100 })
}

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
  // every count the notice could show while reading: one, the run's own (the stop's reason is told once the run ends)
  await page.evaluate(() => { window.__counts = new Set(); window.__reader.controller.subscribe(() => { const st = window.__reader.controller.getState(); if (st.phase === 'ready' && st.failedUnits > 0) window.__counts.add(st.failedUnits) }) })
  await until(() => window.__reader.live?.done)
  const s = await state()
  const counts = await page.evaluate(() => [...window.__counts])
  check('…the notice shows one count, the run\'s own', counts.length === 1 && counts[0] === s.failedUnits, JSON.stringify(counts))
  check('down midway: the run ends, the notice counting the paragraphs left in English', s.phase === 'ready' && s.failedUnits > 0 && !!(await page.$('.capsule[data-kind="notice"]')), JSON.stringify({ phase: s.phase, failedUnits: s.failedUnits }))
  const answeredBefore = new Set(endpoint.answered)
  const sentBefore = endpoint.received.length
  endpoint.upTo = Number.POSITIVE_INFINITY
  await context.setOffline(true)
  await page.waitForTimeout(300)
  await context.setOffline(false)
  const ran = await until(() => window.__reader.controller.getState().phase === 'translating', null, 30_000)
  check('…the browser online again: the translation goes on by itself', ran)
  // a retry pressed while that run is under way starts no second one
  await page.evaluate(() => { window.__runs3 = 0; let was = window.__reader.controller.getState().phase; window.__reader.controller.subscribe(() => { const now = window.__reader.controller.getState().phase; if (now !== was && now === 'translating') window.__runs3++; was = now }); window.__reader.controller.retry() })
  await until(() => window.__reader.live?.done && window.__reader.controller.getState().phase === 'ready')
  const after = await state()
  check('…and ends with nothing missing', after.failedUnits === 0, JSON.stringify({ failedUnits: after.failedUnits }))
  const resent = endpoint.received.slice(sentBefore).filter(t => answeredBefore.has(t))
  check('…only the missing paragraphs reach the endpoint again', resent.length === 0, `${endpoint.received.length - sentBefore} sent, ${resent.length} already answered`)
  check('…a retry pressed during that run starts no second one', (await page.evaluate(() => window.__runs3)) === 0)
}

if (CASES.has(4)) {
  // 4. retry while the service is still down: the same card, one compiler, nothing compiled
  endpoint.down = true
  endpoint.upTo = Number.POSITIVE_INFINITY
  await useModel('echo-4')
  await freshVisit()
  await until(() => window.__reader.controller.getState().phase === 'failed')
  const before = (await events()).length
  await page.locator('.card[data-card] button').click()
  await until(() => window.__reader.controller.getState().phase === 'translating', null, 30_000)
  const again = await until(() => window.__reader.controller.getState().phase === 'failed')
  const after = (await events()).slice(before)
  const frames = await page.evaluate(() => document.querySelectorAll('iframe[src$="/tex.html"]').length)
  check('retry while still down: the same card again', again && (await state()).failure === 'network')
  check('…nothing compiled, and one compiler', !after.some(e => e.event === 'preview' || e.event === 'final') && frames === 1, JSON.stringify({ events: after.map(e => e.event), frames }))
  endpoint.down = false
}

if (CASES.has(5)) {
  // 5. the network back while the stopped run compiles its final: the translation goes on once that run ends
  endpoint.down = false
  endpoint.requests = 0
  endpoint.upTo = 3
  await useModel('echo-5')
  await freshVisit()
  await until(() => (window.__reader.live?.events ?? []).some(e => e.event === 'stopped'))
  const compiling = await page.evaluate(() => !window.__reader.live.done)
  // every phase from here on, as the controller tells it: a poll can miss a run again's first moments
  await page.evaluate(() => { window.__phases5 = []; window.__reader.controller.subscribe(() => { const p = window.__reader.controller.getState().phase; if (window.__phases5.at(-1) !== p) window.__phases5.push(p) }) })
  endpoint.upTo = Number.POSITIVE_INFINITY
  await context.setOffline(true)
  await page.waitForTimeout(300)
  await context.setOffline(false)
  // the stopped run's end and the run again's, two 'done's: the run again begins in the tick the first ends, and sets
  // live.done back at once, so a poll of live.done never sees the first
  const twice = await until(() => (window.__reader.live?.events ?? []).filter(e => e.event === 'done').length >= 2 && window.__reader.controller.getState().phase === 'ready', null, 240_000)
  const phases = await page.evaluate(() => window.__phases5)
  const readyAt = phases.indexOf('ready')
  const resumed = twice && readyAt >= 0 && phases.indexOf('translating', readyAt) > readyAt
  check('the network back while the stopped run still ran: the translation goes on once it ends', compiling && resumed && (await state()).failedUnits === 0, JSON.stringify({ compiling, resumed, phases, failedUnits: (await state()).failedUnits }))
}

if (CASES.has(6)) {
  // 6. a service that cannot run at the start (not on this machine, no key): the card; the echo chosen instead: the
  // translation runs again in place, with the paper's title and abstract for the figures' text. A local endpoint needs
  // no key, so the echo itself cannot stand for the first
  endpoint.down = false
  await page.evaluate(([id]) => window.__reader.controller.patchSettings(c => {
    const echo = c.services.find(s => s.id === id)
    return { ...c, provider: 'svc-keyless0', services: [...c.services.filter(s => s.id !== 'svc-keyless0'), { ...echo, id: 'svc-keyless0', name: 'Keyless', baseURL: 'https://example.invalid/v1', apiKey: '', model: 'echo-6' }] }
  }), [echoId])
  await page.waitForFunction(() => window.__reader.controller.getState().settings?.provider === 'svc-keyless0', null, { timeout: 30_000, polling: 100 })
  await freshVisit()
  const card = await until(() => window.__reader.controller.getState().phase === 'failed')
  check('a service that cannot run at the start: the card', card, JSON.stringify({ failure: (await state()).failure }))
  await useModel('echo-6')
  const ran = await until(() => window.__reader.controller.getState().phase === 'translating', null, 30_000)
  const ctx = ran ? await page.waitForFunction(() => window.__reader.debug?.paperContext?.(), null, { timeout: 120_000 }).then(h => h.jsonValue(), () => null) : null
  check('…another service chosen: the translation runs again in place, the figures\' text with the paper\'s title', ran && !!ctx?.paperTitle, JSON.stringify({ ran, title: ctx?.paperTitle?.slice(0, 40) ?? null }))
  await until(() => window.__reader.live?.done)
}

if (CASES.has(7)) {
  // 7. a TeX page that answers, and on which every compile stops at a TeX error; its loads counted
  const refusing = { loads: 0 }
  const tex = await serve((req, res) => {
    refusing.loads++
    res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><script>
addEventListener('message', e => {
  const m = e.data, reply = d => e.source.postMessage(d, e.origin)
  if (m?.type === 'init') reply({ type: 'init-done', ms: 0 })
  if (m?.type === 'compile') reply({ type: 'compiled', id: m.id, ok: false, error: 'exit 1', log: '! LaTeX Error: this page sets nothing.', ms: 1 })
})
parent.postMessage({ type: 'ready' }, '*')
</script>`)
  })
  const refusingSite = { site: `http://127.0.0.1:${tex.address().port}` }
  const html = `https://arxiv.org/html/${paper}#readarxiv`
  // arXiv's HTML version, answered here: the reader's HEAD, and the tab its link opens
  await context.route('https://arxiv.org/html/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>html</title>' }))
  endpoint.down = false
  await useModel('echo-7')
  const capsule = () => page.evaluate(() => { const c = document.querySelector('.capsule'), a = c?.querySelector('a[data-action]'); return c && { kind: c.getAttribute('data-kind'), words: c.querySelector('.words')?.textContent, href: a?.getAttribute('href') ?? null, target: a?.target ?? null, close: !!c.querySelector('.close'), greyed: [...document.querySelectorAll('.seg.display [role="radio"]')].map(b => b.getAttribute('aria-disabled') === 'true') } })
  // the run ended, then the capsule drawn (React renders after the controller's state)
  const settledHeld = async () => (await until(() => window.__reader?.live?.done)) && until(() => window.__reader.controller.getState().available === false && !!document.querySelector('.capsule[data-kind="unavailable"]'), null, 5000)
  await freshVisit(refusingSite)
  const held = await settledHeld()
  const first = await capsule(), firstState = await state(), evs = (await events()).map(e => e.event)
  check('every compile failing: the capsule says the paper cannot be had, its HTML version offered, no close', held && first?.words === '这篇论文暂不支持 PDF 翻译' && first.href === html && first.target === '_blank' && !first.close, JSON.stringify({ held, first, events: evs.filter(e => /strategy|final|cannot|done/.test(e)) }))
  check('…the original shown, the two translated displays greyed', firstState.display === 'original' && JSON.stringify(first?.greyed) === JSON.stringify([false, true, true]), JSON.stringify({ display: firstState.display, greyed: first?.greyed }))
  const opened = first?.href ? context.waitForEvent('page', { timeout: 10_000 }).catch(() => null) : null
  if (first?.href) await page.click('.capsule a[data-action]')
  const tab = await opened
  check('…its link opens the HTML version, translating, in a new tab', tab?.url() === html, tab?.url() ?? 'no tab')
  await tab?.close()
  // the visit again, this machine's record kept: no service asked, no TeX page loaded
  const [requests, loads] = [endpoint.requests, refusing.loads]
  await page.goto(urlOf('translation', refusingSite))
  const again = await settledHeld()
  const evs2 = (await events()).map(e => e.event)
  check('…a second visit: the same capsule, the service and the TeX page asked for nothing', again && endpoint.requests === requests && refusing.loads === loads && !evs2.includes('translated'), JSON.stringify({ again, requests: endpoint.requests - requests, loads: refusing.loads - loads, capsule: await capsule() }))
  // a paper with no source: its PDF served for its source (arXiv's answer for a PDF-only submission)
  await freshVisit({ src: `${at}/pdf/${paper}` })
  const noSource = await settledHeld()
  check('a paper with no source: the same capsule, with its HTML version', noSource && (await capsule())?.href === html, JSON.stringify(await capsule()))
  await context.unroute('https://arxiv.org/html/**')
  tex.close()
}

check('no page error', errors.length === 0, errors.join('; '))
console.log(failures.length ? `\n${failures.length} failed: ${failures.join('; ')}` : '\nall passed')
await context.close()
process.exit(failures.length ? 1 : 0)
