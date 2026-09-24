// The viewer where the review of #297 said it goes wrong, in the browser: the Original display finishing its load, the
// reading place kept when the display goes straight between Original and Translation, and a Translation display with no
// service able to answer and no copy on this machine. Local corpus, the TeX Live file server on :8070.
//   node spikes/viewer-faults.mjs [paper]
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
const extension = join(root, 'data/ext-viewer-faults')
copyWithGrants(BUILD, extension, { hostPermissions: ['http://127.0.0.1/*', 'https://example.invalid/*'] })
const { context, id, readerUrl } = await launchWithReader({ profile: 'viewer-faults', extension })
const page = await context.newPage()
const at = `http://127.0.0.1:${corpus.address().port}`
const urlOf = mode => readerUrl({ paper, live: '1', mode, site: `http://127.0.0.1:${site.address().port}`, endpoint: 'http://localhost:8070', src: `${at}/src/${paper}`, pdf: `${at}/pdf/${paper}` })
const failures = []
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures.push(name) }
const done = () => page.waitForFunction(() => window.__reader?.live?.done, null, { timeout: 900_000, polling: 500 })
const choose = mode => page.click(`#modes button[data-mode="${mode}"]`)
/** where a side is in its document: its scroll offset over the scrollable height, 0 to 1 */
const place = side => page.evaluate(side => { const c = window.__reader.debug[side].container; return c.scrollTop / Math.max(1, c.scrollHeight - c.clientHeight) }, side)

// 1. the Original display finishes loading though nothing is translated: the reader sits in an iframe over arXiv's PDF
//    page, whose tab would otherwise show it loading while the original is read (Codex on #297)
await page.goto(urlOf('original'), { waitUntil: 'commit' })
const loaded = await page.waitForFunction(() => document.readyState === 'complete', null, { timeout: 20_000 }).then(() => true, () => false)
check('the Original display finishes loading', loaded, await page.evaluate(() => document.readyState))
const framed = await context.newPage()
// an extension page of its own, which may frame the reader as arXiv's PDF page does
await framed.goto(`chrome-extension://${id}/options.html`)
const frameLoaded = await framed.evaluate(url => new Promise(resolve => {
  const f = Object.assign(document.createElement('iframe'), { src: url })
  const timer = setTimeout(() => resolve(false), 20_000)
  f.onload = () => { clearTimeout(timer); resolve(true) }
  document.body.append(f)
}), urlOf('original'))
check('embedded in a page, its frame fires load', frameLoaded)
await framed.close()

// 2. the reading place, straight from Original to Translation and back, once both sides are anchored (Codex on #297):
//    in the body, where units are located (2608.02163's pages 9 to 19, the references and appendix, have none, and a
//    place there goes by its share of the document)
await page.goto(urlOf('bilingual'))
await done()
await choose('original')
await page.waitForTimeout(800)
await page.evaluate(() => { const c = window.__reader.debug.left.container; c.scrollTop = (c.scrollHeight - c.clientHeight) * 0.15 })
await page.waitForTimeout(800)
const left0 = await place('left')
await choose('translation')
await page.waitForTimeout(1500)
const right1 = await place('right'), by1 = await page.evaluate(() => window.__reader.place)
check('Original → Translation keeps the reading place', Math.abs(right1 - left0) < 0.1, `the original at ${left0.toFixed(2)}, the translation shown at ${right1.toFixed(2)}; by ${JSON.stringify(by1)}`)
check('… by the unit at the reading line', by1?.id != null)
await page.evaluate(() => { const c = window.__reader.debug.right.container; c.scrollTop = (c.scrollHeight - c.clientHeight) * 0.8 })
await page.waitForTimeout(800)
const right2 = await place('right')
await choose('original')
await page.waitForTimeout(1500)
const left3 = await place('left'), by3 = await page.evaluate(() => window.__reader.place)
check('Translation → Original keeps the reading place', Math.abs(left3 - right2) < 0.1, `the translation at ${right2.toFixed(2)}, the original shown at ${left3.toFixed(2)}; by ${JSON.stringify(by3)}`)
check('… by the unit at the reading line', by3?.id != null)

// 3. the Translation display with no service able to answer and no copy: the page is not blank (Codex on #297)
const options = await openOptions(context, id)
console.log('keyless service:', await addService(options, { name: 'keyless', baseURL: 'https://example.invalid/v1', model: 'x' }))
await setSwitch(options, '出问题时自动改用免费服务', false)
// no copy on this machine, where the reader keeps one
await page.evaluate(() => window.__reader.debug?.pdfCache?.clear())
await page.goto(urlOf('translation'))
await done()
const shown = await page.evaluate(() => [...document.querySelectorAll('.viewerContainer')].map(c => ({ visible: !!c.offsetParent && c.clientHeight > 0, pages: c.querySelectorAll('.page').length })))
check('Translation with no service: a document is on screen', shown.some(s => s.visible && s.pages > 0), `${JSON.stringify(shown)}; ${await page.textContent('#status')}`)

await context.close(); site.close(); corpus.close()
console.log(failures.length ? `\n${failures.length} failed: ${failures.join('; ')}` : '\nall passed')
process.exitCode = failures.length ? 1 : 0
