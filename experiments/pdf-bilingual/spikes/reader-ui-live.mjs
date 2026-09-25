// The reader's states that only a live run reaches (the reader's design, §8), in a real browser, each with its screenshot
// in out/reader-ui/: translating (the capsule's words, the progress line growing), a target language the reader cannot typeset (the original, the
// translated displays greyed, the capsule naming the language with the way to choose another), and no service able to
// answer (the card in the translation's pane). Local corpus and TeX page; the TeX Live file server on :8070. Build first.
//   node experiments/pdf-bilingual/spikes/reader-ui-live.mjs [paper]
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { serveSite } from './live-site.mjs'
import { BUILD, launchWithReader } from './extension.mjs'
import { copyWithGrants } from '../../../tests/e2e/ext-copy.mjs'
import { addService, openOptions, setSwitch } from '../../../tests/e2e/options-page.mjs'

const root = new URL('..', import.meta.url).pathname
const out = join(root, 'out/reader-ui')
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
const extension = join(root, 'data/ext-reader-ui-live')
copyWithGrants(BUILD, extension, { hostPermissions: ['http://127.0.0.1/*', 'https://example.invalid/*'] })
const { context, id, readerUrl } = await launchWithReader({ profile: 'reader-ui-live', extension, viewport: { width: 1440, height: 900 } })
const at = `http://127.0.0.1:${corpus.address().port}`
const urlOf = mode => readerUrl({ paper, live: '1', mode, site: `http://127.0.0.1:${site.address().port}`, endpoint: 'http://localhost:8070', src: `${at}/src/${paper}`, pdf: `${at}/pdf/${paper}` })
let failed = 0
const check = (what, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${detail}` : ''}`); if (!ok) failed++ }
const state = page => page.evaluate(() => window.__reader.controller.getState())
const until = (page, test, timeout = 120_000) => page.waitForFunction(test, null, { timeout, polling: 200 }).then(() => true, () => false)
const page = await context.newPage()
page.on('pageerror', e => check('no page error', false, e.message))
const visit = async mode => { await page.goto(urlOf(mode)); await until(page, () => window.__reader?.controller?.getState().settings) }
const patch = change => page.evaluate(p => window.__reader.controller.patchSettings(c => ({ ...c, ...p })), change)

// 1. translating: no copy on this machine, the default service; the capsule says so, and the progress line along the
// toolbar's foot grows as paragraphs come back (the maintainer, 2026-09-25)
await visit('bilingual')
await page.evaluate(() => window.__reader.debug?.pdfCache?.clear())
await visit('bilingual')
const translating = await until(page, () => window.__reader.controller.getState().phase === 'translating')
check('a first translation says so in the capsule', translating && (await page.getByRole('status').textContent()).includes('正在翻译'))
// while the capsule is there: its words alone, the progress the line's
check('…the capsule has no fill of its own', await page.evaluate(() => !!document.querySelector('.capsule[data-kind="progress"]') && !document.querySelector('.capsule .fill')))
const lineAt = () => page.evaluate(() => { const l = document.querySelector('header[role="toolbar"] .progress-line'), r = l?.getBoundingClientRect(); return l && { on: l.hasAttribute('data-on'), p: Number(l.style.getPropertyValue('--p')), bottom: Math.round(r.bottom), height: Math.round(r.height) } })
const first = await lineAt()
check('…the progress line along the toolbar\'s foot, 2 px', !!first?.on && first.bottom === 44 && first.height === 2, JSON.stringify(first))
const grew = await page.waitForFunction(p => Number(document.querySelector('.progress-line')?.style.getPropertyValue('--p')) > p + 0.01, first?.p ?? 0, { timeout: 120_000, polling: 200 }).then(() => true, () => false)
check('…growing as paragraphs come back', grew, JSON.stringify({ first, now: await lineAt() }))
check('the PDF\'s download followed to its end', await page.evaluate(() => window.__reader.controller.getState().loaded === 1))
await page.waitForTimeout(1500)
await page.screenshot({ path: join(out, '25-translating.png') })

// 2. a target language the reader cannot typeset
await patch({ targetLanguage: 'arb' })
await page.waitForTimeout(800)
await visit('bilingual')
const unsupported = await until(page, () => window.__reader.controller.getState().languageSupported === false)
const s2 = await state(page)
const greyed = await page.evaluate(() => ['对照', '译文'].every(n => document.querySelector(`[role="radio"][aria-label="${n}"]`)?.getAttribute('aria-disabled') === 'true'))
check('an unsupported language: the original, the translated displays greyed', unsupported && s2.display === 'original' && greyed, JSON.stringify({ display: s2.display, greyed }))
check('…the capsule names the language and offers another', /PDF 对照暂不支持/.test(await page.getByRole('status').textContent()))
await page.getByRole('button', { name: '选择语言' }).click()
await page.waitForTimeout(400)
check('…whose action opens the language menu', await page.evaluate(() => !!document.querySelector('#pop-language:popover-open')))
await page.screenshot({ path: join(out, '25-unsupported.png') })
await page.keyboard.press('Escape')
await patch({ targetLanguage: 'cmn' })
await page.waitForTimeout(800)

// 3. no service able to answer, no copy: the card in the translation's pane
const options = await openOptions(context, id)
await addService(options, { name: 'keyless', baseURL: 'https://example.invalid/v1', model: 'x' })
await setSwitch(options, '出问题时自动改用免费服务', false)
await page.bringToFront()
await page.evaluate(() => window.__reader.debug?.pdfCache?.clear())
await visit('translation')
const failedRun = await until(page, () => window.__reader.controller.getState().phase === 'failed')
const card = await page.evaluate(() => document.querySelector('.pane[data-side="right"] .card')?.textContent ?? null)
check('nothing translated: the card in the translation\'s pane, with its reason and the way to fix it', failedRun && /尚未配置 API Key/.test(card ?? '') && /设置/.test(card ?? ''), card ?? 'no card')
await page.screenshot({ path: join(out, '25-no-service.png') })

console.log(failed ? `${failed} failed` : 'all passed')
await context.close(); site.close(); corpus.close()
process.exit(failed ? 1 : 0)
