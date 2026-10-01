// The live reader of today (protocol 1) against the new TeX page, end to end, in Chromium with the extension's build:
// a German translation and a Chinese one, each to its final. The reader is pointed at the page by its `site`
// address (addresses.mjs takes a server on this machine), as in development; the paper comes from the local corpus;
// the translation from an LLM service on this machine that gives every segment back marked (reader-live.mjs's
// LLM_MOCK), so that no outside service is asked. Prints the reader's timeline and the page's requests.
//   pnpm build && node experiments/pdf-bilingual/tex-page/build.mjs
//   node experiments/pdf-bilingual/tex-page/reader-check.mjs [--de=2608.02163] [--zh=2608.18090]
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { copyWithGrants } from '../../../tests/e2e/ext-copy.mjs'
import { addService, openOptions } from '../../../tests/e2e/options-page.mjs'
import { BUILD, launchWithReader } from '../spikes/extension.mjs'
import { serveTexSite } from './serve.mjs'

const EXP = new URL('..', import.meta.url).pathname
const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const RUNS = [['deu', arg('de', '2608.02163')], ['cmn', arg('zh', '2608.18090')]]
const serve = handler => new Promise(r => { const s = createServer(handler).listen(0, '127.0.0.1', () => r(s)) })

const requests = []
const site = await serveTexSite({ log: row => requests.push(row) })
const corpus = await serve((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const [, kind, id] = decodeURIComponent(req.url.split('?')[0]).match(/^\/(src|pdf)\/(.+)$/) ?? []
  try { res.end(readFileSync(join(EXP, 'data/corpus', id, kind === 'src' ? 'source.gz' : 'arxiv.pdf'))) } catch { res.statusCode = 404; res.end() }
})
// the LLM: every segment back with a mark before its first letter, placeholders untouched (reader-live.mjs)
const MARK = 'LLMECHO '
const marked = text => { let done = false; return text.split(/(<[^>]*>)/).map(part => (done || part.startsWith('<') || !/\p{L}/u.test(part) ? part : ((done = true), part.replace(/\p{L}/u, l => MARK + l)))).join('') }
const echo = await serve((req, res) => {
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
const extension = join(EXP, 'out/ext-tex-page-check')
copyWithGrants(BUILD, extension, { hostPermissions: ['http://127.0.0.1/*'] })
const { context, id, readerUrl } = await launchWithReader({ profile: 'tex-page-check', extension })
const options = await openOptions(context, id)
console.log('LLM service:', await addService(options, { name: 'echo', baseURL: `http://127.0.0.1:${echo.address().port}/v1`, model: 'echo' }))
await options.close()

const siteUrl = `http://127.0.0.1:${site.address().port}`, src = `http://127.0.0.1:${corpus.address().port}`
let failed = 0
for (const [lang, paper] of RUNS) {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const url = readerUrl({ paper, live: '1', mode: 'bilingual', site: siteUrl, src: `${src}/src/${paper}`, pdf: `${src}/pdf/${paper}` })
  await page.goto(url)
  await page.waitForFunction(() => window.__reader?.controller?.getState().settings, null, { timeout: 60_000 })
  await page.evaluate(l => window.__reader.controller.patchSettings(c => ({ ...c, targetLanguage: l })), lang)
  await page.evaluate(() => window.__reader.debug?.pdfCache?.clear())
  requests.length = 0
  await page.goto(url)
  await page.waitForFunction(() => window.__reader?.live?.done, null, { timeout: 900_000, polling: 500 })
  const live = await page.evaluate(() => ({ events: window.__reader.live.events, failed: window.__reader.live.failed ?? null }))
  console.log(`\n${paper} into ${lang}${live.failed ? ` — FAILED: ${live.failed}` : ''}`)
  for (const e of live.events) { const { t, event, ...rest } = e; if (/compiler|fonts|preview|final|original|strategy|done|engine/.test(event)) console.log(`  ${(t / 1000).toFixed(1).padStart(6)} s  ${event.padEnd(14)} ${JSON.stringify(rest).slice(0, 220)}`) }
  const finals = live.events.filter(e => e.event === 'final')
  const ok = !live.failed && finals.at(-1)?.ok === true && !live.events.some(e => e.event === 'next strategy')
  // the entry is never cached; the rest of the page may come from the browser's cache on the second run
  const framed = requests.some(r => r.path === '/tex.html')
  console.log(`  the new page: ${framed ? 'framed' : 'NOT framed'}; ${requests.length} requests, ${(requests.reduce((n, r) => n + r.bytes, 0) / 1e6).toFixed(1)} MB${errors.length ? `; page errors: ${errors.slice(0, 3)}` : ''}`)
  console.log(`  ${ok && framed ? 'ok' : 'FAIL'}`)
  if (!ok || !framed) failed++
  await page.close()
}
await context.close()
for (const s of [site, corpus, echo]) s.close()
console.log(failed ? `${failed} FAILED` : 'PASS')
process.exit(failed ? 1 : 0)
