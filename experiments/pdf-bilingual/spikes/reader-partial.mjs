// The reader when only part of a translation can be shown (S-R-19; plans/2026-10-04-compile-resilience.md, Task 5), in
// Chromium with the build: a synthetic paper of our own whose first paragraphs set and whose last ones break every
// strategy's compile \u2014 each an apacite citation with a note before it, whose key the control-word guard cuts from its
// command (2610.02069's fault B), more of them than the safety net may set in the source \u2014, translated by an LLM
// endpoint on this machine that gives every segment back marked (reader-live.mjs's LLM_MOCK). The first previews are
// shown; every compile with the last paragraphs fails, the chain runs out, and the capsule must say the translation is
// shown in part: the preview kept, the translated displays not greyed, its close working. Our TeX page and its tree
// (out/tex-site, node tex-page/build.mjs) and the TeX Live server on :8070; the build first (pnpm build). Exits non-zero
// on a failure. Screenshots are the maintainer's: none is taken here.
//   node experiments/pdf-bilingual/spikes/reader-partial.mjs
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { copyWithGrants } from '../../../tests/e2e/ext-copy.mjs'
import { addService, openOptions } from '../../../tests/e2e/options-page.mjs'
import { BUILD, launchWithReader } from './extension.mjs'
import { serveSite } from './live-site.mjs'

const root = new URL('..', import.meta.url).pathname
const out = join(root, 'out/reader-partial'), paperDir = join(out, 'paper')
const ID = '2610.99999'
let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }

// the paper: sixty plain paragraphs, more than the first two batches a reader at its start is sent, then ten that cite
// with apacite's prenote; its bibliography made natively, shipped as arXiv ships a .bbl, and its PDF the left side
const para = k => `Paragraph ${k} of the synthetic paper describes a model of the atmosphere and the way its parts interact over a season, with words enough to make a few lines of prose.`
const cited = k => `Paragraph ${k} of the synthetic paper compares the result with earlier work \\cite<e.g.,>[p.~${k}]{key_one} and finds it holds.`
const SRC = `\\documentclass{article}\n\\usepackage{apacite}\n\\title{A Synthetic Paper}\\author{A. Author}\n\\begin{document}\n\\maketitle\n${[...Array.from({ length: 60 }, (_, k) => para(k)), ...Array.from({ length: 10 }, (_, k) => cited(60 + k))].join('\n\n')}\n\\bibliographystyle{apacite}\n\\bibliography{refs}\n\\end{document}\n`
rmSync(out, { recursive: true, force: true })
mkdirSync(paperDir, { recursive: true })
writeFileSync(join(paperDir, 'main.tex'), SRC)
writeFileSync(join(paperDir, 'refs.bib'), '@article{key_one, author={One, A. and Two, B.}, title={An earlier work}, journal={J}, year={2001}}\n')
execFileSync('docker', ['run', '--rm', '--init', '--network', 'none', '-v', `${paperDir}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '300', 'latexmk', '-pdf', '-interaction=nonstopmode', 'main.tex'], { stdio: 'ignore' })
execFileSync('tar', ['czf', join(out, 'source.gz'), '-C', paperDir, 'main.tex', 'main.bbl'])

const serve = handler => new Promise(r => { const s = createServer(handler).listen(0, '127.0.0.1', () => r(s)) })
const site = await serveSite()
const src = await serve((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const kind = req.url.startsWith('/src/') ? 'src' : req.url.startsWith('/pdf/') ? 'pdf' : null
  if (!kind) { res.statusCode = 404; res.end(); return }
  res.end(readFileSync(kind === 'src' ? join(out, 'source.gz') : join(paperDir, 'main.pdf')))
})
// the LLM: every segment back with a mark before its first letter, placeholders untouched (reader-live.mjs)
const marked = text => { let done = false; return text.split(/(<[^>]*>)/).map(part => (done || part.startsWith('<') || !/\p{L}/u.test(part) ? part : ((done = true), part.replace(/\p{L}/u, l => `LLMECHO ${l}`)))).join('') }
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
const extension = copyWithGrants(BUILD, join(out, 'ext'), { hostPermissions: ['http://127.0.0.1/*'] })
const { context, id, readerUrl } = await launchWithReader({ profile: 'reader-partial', extension })
try {
  const options = await openOptions(context, id)
  await addService(options, { name: 'echo', baseURL: `http://127.0.0.1:${echo.address().port}/v1`, model: 'echo' })
  await options.close()
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const siteOrigin = `http://127.0.0.1:${site.address().port}`, srcOrigin = `http://127.0.0.1:${src.address().port}`
  await page.goto(readerUrl({ paper: ID, live: '1', mode: 'bilingual', site: siteOrigin, endpoint: 'http://localhost:8070', src: `${srcOrigin}/src/${ID}`, pdf: `${srcOrigin}/pdf/${ID}` }))
  await page.waitForFunction(() => window.__reader?.live?.done, null, { timeout: 900_000, polling: 500 })
  const events = await page.evaluate(() => window.__reader.live.events.map(e => ({ event: e.event, strategy: e.strategy, ok: e.ok, units: e.units })))
  for (const e of events.filter(x => /^(preview|final|measure|next strategy|in source|without|typeset failed|shown|done)/.test(x.event))) console.log('  ', JSON.stringify(e))
  const state = await page.evaluate(() => { const s = window.__reader.controller.getState(); return { partial: s.partial, available: s.available, shown: s.shown, phase: s.phase, display: s.display } })
  const capsule = await page.evaluate(() => { const c = document.querySelector('.capsule[data-kind="partial"]'); return c && { words: c.querySelector('.words')?.textContent ?? '', close: !!c.querySelector('button.close'), link: c.querySelector('a[data-action]')?.getAttribute('href') ?? null } })
  const greyed = await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].filter(r => r.getAttribute('aria-disabled') === 'true').length)
  check('previews were shown, and no final', events.some(e => e.event === 'shown preview') && !events.some(e => e.event === 'shown final'), JSON.stringify(events.map(e => e.event)))
  check('every way of setting the whole failed: the chain moved on and ran out', events.some(e => e.event === 'next strategy') && events.filter(e => e.event === 'final').every(e => !e.ok))
  check('the run said the translation is shown in part: the preview kept, the displays as they were', state.partial && state.available && state.shown === 'preview' && state.display === 'bilingual', JSON.stringify(state))
  check('the capsule says so, with its close', !!capsule?.words && capsule.close, JSON.stringify(capsule))
  check('no translated display greyed', greyed === 0, `${greyed} greyed`)
  await page.locator('.capsule[data-kind="partial"] button.close').click()
  await page.waitForTimeout(400)
  check('its close takes it away, and it stays away', await page.evaluate(() => !document.querySelector('.capsule')))
  if (errors.length) console.log('page errors:', errors.slice(0, 5))
} finally { await context.close(); site.close(); src.close(); echo.close() }
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
