// The reader's count of the passages its typesetting left in the original (UI.md S-P-60 in the reader; the maintainer's
// ruling 6 of 2026-10-04, and the reviews' I-5, I-6 and N-5), in Chromium with the build, over three visits to one
// paper of our own: sixty plain paragraphs and one that cites with apacite's prenote, whose key the control-word guard
// cuts from its command (2610.02069's fault B), which the compile's safety net sets in the source while the rest is set
// translated. Translated by an LLM endpoint on this machine that gives every segment back marked (reader-live.mjs's
// LLM_MOCK). Each visit must count that one passage, in the capsule with no retry — nothing stopped, and the same
// translation fails the same way:
//   1. the first, which makes the copy;
//   2. again, the copy current: nothing compiled;
//   3. again with no service able to answer (one with no key, no fallback): the copy shown, not checked.
// Our TeX page and its tree (out/tex-site, node tex-page/build.mjs) and the TeX Live server on :8070; the build first
// (pnpm build). Exits non-zero on a failure. No screenshot is taken.
//   node experiments/pdf-bilingual/spikes/reader-in-source.mjs
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { copyWithGrants } from '../../../tests/e2e/ext-copy.mjs'
import { addService, openOptions, seedService, setSwitch } from '../../../tests/e2e/options-page.mjs'
import { BUILD, launchWithReader } from './extension.mjs'
import { serveSite } from './live-site.mjs'

const root = new URL('..', import.meta.url).pathname
const out = join(root, 'out/reader-in-source'), paperDir = join(out, 'paper')
const ID = '2610.99998'
// the settings page's switch for the free fallback, by its accessible name (UI.md S-O)
const FALLBACK = '\u51fa\u95ee\u9898\u65f6\u81ea\u52a8\u6539\u7528\u514d\u8d39\u670d\u52a1'
let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }

const para = k => `Paragraph ${k} of the synthetic paper describes a model of the atmosphere and the way its parts interact over a season, with words enough to make a few lines of prose.`
const cited = 'The last paragraph of the synthetic paper compares the result with earlier work \\cite<e.g.,>[p.~5]{key_one} and finds it holds.'
const SRC = `\\documentclass{article}\n\\usepackage{apacite}\n\\title{A Synthetic Paper}\\author{A. Author}\n\\begin{document}\n\\maketitle\n${[...Array.from({ length: 60 }, (_, k) => para(k)), cited].join('\n\n')}\n\\bibliographystyle{apacite}\n\\bibliography{refs}\n\\end{document}\n`
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
const extension = copyWithGrants(BUILD, join(out, 'ext'), { hostPermissions: ['http://127.0.0.1/*', 'https://example.invalid/*'] })
const { context, id, readerUrl } = await launchWithReader({ profile: 'reader-in-source', extension })
try {
  const options = await openOptions(context, id)
  await addService(options, { name: 'echo', baseURL: `http://127.0.0.1:${echo.address().port}/v1`, model: 'echo' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const siteOrigin = `http://127.0.0.1:${site.address().port}`, srcOrigin = `http://127.0.0.1:${src.address().port}`
  const url = readerUrl({ paper: ID, live: '1', mode: 'bilingual', site: siteOrigin, endpoint: 'http://localhost:8070', src: `${srcOrigin}/src/${ID}`, pdf: `${srcOrigin}/pdf/${ID}` })
  const visit = async () => {
    await page.goto(url)
    await page.waitForFunction(() => window.__reader?.live?.done, null, { timeout: 900_000, polling: 500 })
    await page.waitForTimeout(400)
    const events = await page.evaluate(() => window.__reader.live.events.map(e => ({ event: e.event, strategy: e.strategy, ok: e.ok, units: e.units, how: e.how })))
    const state = await page.evaluate(() => { const s = window.__reader.controller.getState(); return { failedUnits: s.failedUnits, failure: s.failure, phase: s.phase, shown: s.shown } })
    const capsule = await page.evaluate(() => { const c = document.querySelector('.capsule[data-kind="notice"]'); return c && { words: c.querySelector('.words')?.textContent ?? '', chip: !!c.querySelector('[data-action]'), close: !!c.querySelector('button.close') } })
    return { events, state, capsule, has: name => events.some(e => e.event === name) }
  }
  const counted = (v, name) => {
    check(`${name}: one passage counted`, v.state.failedUnits === 1, JSON.stringify(v.state))
    check(`${name}: the capsule says it, with its close and no retry`, !!v.capsule?.words && v.capsule.close && !v.capsule.chip, JSON.stringify(v.capsule))
  }

  // 1. the first visit: the cited paragraph set in the source, the rest translated, the copy written
  const first = await visit()
  for (const e of first.events.filter(x => /^(preview|measure|final|next strategy|in source|without|typeset failed|recovered|cache write|shown final)/.test(x.event))) console.log('  ', JSON.stringify(e))
  check('first: the final shown, one passage set in the source, the chain where it was', first.has('shown final') && first.events.filter(e => e.event === 'in source').flatMap(e => e.units).length === 1 && !first.has('next strategy'), JSON.stringify(first.events.map(e => e.event)))
  check('first: the copy written', first.events.some(e => e.event === 'cache write' && e.how === 'full'))
  counted(first, 'first')

  // 2. again: the copy current, nothing compiled
  const again = await visit()
  check('again: the copy current, nothing compiled', again.has('cache current') && !again.has('preview') && !again.has('final'), JSON.stringify(again.events.map(e => e.event)))
  counted(again, 'again')

  // 3. no service able to answer: one not on this machine and with no key, no fallback
  await seedService(context.serviceWorkers()[0], { id: 'svc-insrckey', name: 'keyless', baseURL: 'https://example.invalid/v1', model: 'x' })
  await setSwitch(options, FALLBACK, false)
  const unchecked = await visit()
  const status = await page.evaluate(() => window.__reader?.status ?? '')
  check('no service: the copy shown, not checked, nothing translated', unchecked.has('shown cached') && !unchecked.has('translating') && /not checked against the settings/.test(status), `${status} ${JSON.stringify(unchecked.events.map(e => e.event))}`)
  counted(unchecked, 'no service')
  if (errors.length) console.log('page errors:', errors.slice(0, 5))
} finally { await context.close(); site.close(); src.close(); echo.close() }
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
