// The reader's live mode (#292) in Chromium, end to end: our "site" (the TeX page and BusyTeX) on one origin, the
// paper's source (standing in for arXiv's /src/) on another, TeX Live's files from the local package server, the
// translation through the extension's background (spikes/extension.mjs), by its default service unless LLM_MOCK. Twice
// in one profile: a first visit and a returning one (the compiler's files and the translations then come from the
// caches). Prints the timeline; screenshots at the first preview and the final.
//   node spikes/reader-live.mjs id [start: 0–1, where the reader stands when the translation starts]
//   ONLINE=1 node spikes/reader-live.mjs id   — the paper fetched from arXiv itself, as a reader's would be
//   LLM_MOCK=1 node spikes/reader-live.mjs id — through an LLM service: an OpenAI-compatible endpoint on this machine
//     that gives every segment back with a mark (as tests/e2e/local-endpoint.mjs's does), added on the settings page:
//     the tags wire, the LLM provider and its structured output, end to end
// The language is the build's setting, the default one.
import { createServer } from 'node:http'
import { serveSite } from './live-site.mjs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { copyWithGrants } from '../../../tests/e2e/ext-copy.mjs'
import { addService, openOptions } from '../../../tests/e2e/options-page.mjs'
import { BUILD, launchWithReader } from './extension.mjs'
const root = new URL('..', import.meta.url).pathname
const [paper = '2608.04322', start = '0'] = process.argv.slice(2)
const serve = handler => new Promise(r => { const s = createServer(handler).listen(0, '127.0.0.1', () => r(s)) })

const site = await serveSite()
// arXiv's two paths: /src/<id> (the source package) and /pdf/<id> (its PDF)
const src = await serve((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const [, kind, id] = decodeURIComponent(req.url.split('?')[0]).match(/^\/(src|pdf)\/(.+)$/) ?? []
  try { res.end(readFileSync(join(root, 'data/corpus', id, kind === 'src' ? 'source.gz' : 'arxiv.pdf'))) } catch { res.statusCode = 404; res.end() }
})
const siteOrigin = `http://127.0.0.1:${site.address().port}`, srcOrigin = `http://127.0.0.1:${src.address().port}`

// the LLM: segments come in as JSON in the user message (src/providers/prompt.ts) and go back with the mark before their
// first letter, placeholders untouched: a mark before a leading placeholder puts text before a table's \toprule, as no
// translation does, and breaks the table
const MARK = 'LLMECHO '
const marked = text => { let done = false; return text.split(/(<[^>]*>)/).map(part => (done || part.startsWith('<') || !/\p{L}/u.test(part) ? part : ((done = true), part.replace(/\p{L}/u, l => MARK + l)))).join('') }
const llm = { requests: 0, segments: 0 }
const echo = process.env.LLM_MOCK && await serve((req, res) => {
  let body = ''
  req.on('data', c => { body += c })
  req.on('end', () => {
    llm.requests++
    const user = [...(JSON.parse(body || '{}').messages ?? [])].reverse().find(m => m.role === 'user')?.content ?? ''
    const at = user.indexOf('[{"id":')
    let segments = null
    for (let end = user.lastIndexOf(']'); at >= 0 && end > at && !segments; end = user.lastIndexOf(']', end - 1)) { try { segments = JSON.parse(user.slice(at, end + 1)) } catch {} }
    if (!Array.isArray(segments)) { res.writeHead(400).end(); return }
    llm.segments += segments.length
    const content = JSON.stringify({ segments: segments.map(s => ({ id: s.id, text: marked(s.text) })) })
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: 'echo', object: 'chat.completion', created: 0, model: 'echo', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }))
  })
})
// the settings page asks for an endpoint's origin when it is saved, a prompt Playwright cannot answer: granted in a copy's manifest, as the e2e does
const extension = echo ? join(root, 'data/ext-llm-echo') : BUILD
if (echo) copyWithGrants(BUILD, extension, { hostPermissions: ['http://127.0.0.1/*'] })
const { context, id, readerUrl } = await launchWithReader({ profile: 'reader-live', extension })
if (echo) {
  const options = await openOptions(context, id)
  console.log('LLM service:', await addService(options, { name: 'echo', baseURL: `http://127.0.0.1:${echo.address().port}/v1`, model: 'echo' }))
  await options.close()
}

for (const visit of ['first visit', 'returning visit']) {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => { errors.push(e.message); console.error('pageerror', e.stack ?? e.message) }); page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.error('console', m.text().slice(0, 300)) } })
  await page.goto(readerUrl({ paper, live: '1', mode: 'bilingual', site: siteOrigin, endpoint: 'http://localhost:8070', ...(process.env.ONLINE ? {} : { src: `${srcOrigin}/src/${paper}`, pdf: `${srcOrigin}/pdf/${paper}` }) }))
  await page.waitForFunction(() => window.__reader?.ready || window.__reader?.live?.done, null, { timeout: Number(process.env.WAIT ?? 120000) }).catch(async e => { console.error('not ready:', JSON.stringify(await page.evaluate(() => ({ status: document.getElementById('status')?.textContent, live: window.__reader?.live })))); throw e })
  if (await page.evaluate(() => window.__reader.live?.failed)) { console.log(`\n${paper} — ${visit}: ${await page.evaluate(() => window.__reader.live.failed)}`); await page.close(); break }
  // the reader already somewhere in the paper when the translation starts: it is translated from there outwards
  await page.mouse.move(300, 500)
  await page.evaluate(f => { const { left, setDriver } = window.__reader.debug; setDriver(left); left.container.scrollTop = (left.container.scrollHeight - left.container.clientHeight) * f }, Number(start))
  let shotFirst = false
  for (;;) {
    const s = await page.evaluate(() => ({ done: !!window.__reader.live?.done, previews: window.__reader.live?.events.filter(e => e.event === 'shown preview').length ?? 0 }))
    if (s.previews && !shotFirst) { shotFirst = true; await page.screenshot({ path: join(root, `out/live-${paper}-first.png`) }) }
    if (s.done) break
    await page.waitForTimeout(100)
    if (Date.now() - (context.t0 ??= Date.now()) > 600000) break
  }
  await page.screenshot({ path: join(root, `out/live-${paper}-final.png`) })
  const events = await page.evaluate(() => window.__reader.live.events)
  // the final state as a reader gets it: paragraphs linked on both sides, and how level they stand once scrolling stops
  const settled = await page.evaluate(async () => {
    // the reading line the reader keeps now (it follows the reader's clicks); READING_LINE, a constant once, is gone
    const { left, right, unitDocTop, pageView, setDriver, readingLine } = window.__reader.debug
    const ids = [...left.anchors].filter(([id, a]) => a && right.anchors.get(id)).map(([id]) => id)
    const errs = []
    for (const id of ids.filter((_, n) => n % Math.max(1, Math.floor(ids.length / 25)) === 0)) {
      const r = left.anchors.get(id).rects[0], top = unitDocTop(left, id), want = top + 2 - left.container.clientHeight * readingLine
      if (want < 0 || want > left.container.scrollHeight - left.container.clientHeight) continue
      setDriver(left)
      const pv = pageView(left, r.page), [cx] = pv.viewport.convertToViewportPoint((r.x0 + r.x1) / 2, r.y0)
      left.container.dispatchEvent(new PointerEvent('pointermove', { clientX: pv.div.getBoundingClientRect().left + pv.div.clientLeft + cx, bubbles: true }))
      left.container.scrollTop = want
      await new Promise(res => setTimeout(res, 800))
      errs.push(Math.abs(Math.round(unitDocTop(right, id) - right.container.scrollTop - (top - left.container.scrollTop))))
    }
    errs.sort((a, b) => a - b)
    return { linked: ids.length, units: left.anchors.size, sampled: errs.length, within4px: errs.filter(e => e <= 4).length, max: errs.at(-1) }
  })
  console.log(`\n${paper} — ${visit}`)
  for (const e of events) { const { t, event, ...rest } = e; console.log(`  ${(t / 1000).toFixed(1).padStart(6)} s  ${event.padEnd(14)} ${JSON.stringify(rest)}`) }
  // figure text on the translation's pages in view at the end
  const figures = await page.evaluate(async n => {
    const { right, setDriver } = window.__reader.debug
    if (n) { setDriver(right); right.container.scrollTop = right.viewer.getPageView(n - 1).div.offsetTop - 10 }
    await new Promise(r => setTimeout(r, 6000))
    return document.querySelectorAll('.axt-img > span').length
  }, Number(process.env.FIGURE_PAGE ?? 0))
  if (process.env.FIGURE_PAGE) await page.screenshot({ path: join(root, `out/live-${paper}-figure.png`) })
  console.log('  final state:', JSON.stringify({ ...settled, figureLabelsInView: figures }))
  if (errors.length) console.log('  errors:', errors.slice(0, 5))
  await page.close()
  context.t0 = undefined
}
if (echo) { console.log('LLM endpoint:', JSON.stringify(llm)); echo.close() }
await context.close(); site.close(); src.close()
