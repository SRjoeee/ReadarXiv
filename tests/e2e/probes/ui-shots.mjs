// Every surface in each interface language, for a reviewer's eye (the interface languages of 2026-11-04): the PDF reader
// (the toolbar over the pages, the reading options, the language menu, the contents, a capsule's state), the settings page
// (each section, and the interface language's menu) at 1440 px and at 320, the narrowest each holds, light. The popup is
// 320 px wide at every width and every state of it is the gallery's: popup-align.mjs shoots those, and its shots are
// gathered here when they are there. Offline, as e2e:reader runs: the repository's sample paper answered for arXiv, the
// stand-in of the layer API, a local echo endpoint for the translation, one route table refusing any other request.
// Each shot is searched for what its box cuts: a line of words wider than the element that clips it, a field's placeholder
// wider than its field, an element past the window. What it finds is listed beside the shot in the index, and printed.
//   pnpm build && node tests/e2e/probes/ui-shots.mjs [--out <dir>] [--langs zh-TW,ja,ko]
// Exits 1 on a page error; a cut is for the reader of the index to judge (a paper's title truncates by design).
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FACES } from '../../../src/pdf-reader/engine/rules/font-roles.mjs'
import { copyWithGrants } from '../ext-copy.mjs'
import { startEchoEndpoint } from '../lib/echo-endpoint.mjs'
import { launchWithReader } from '../lib/extension.mjs'
import { cutSample, sampleFiles } from '../lib/layer-cut.mjs'
import { layerApi, serves } from '../lib/layer-api.mjs'
import { RESOLVER_WALL, routeTable } from '../lib/route-table.mjs'
import { seedService } from '../options-page.mjs'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined }
const OUT = arg('--out') ?? join(ROOT, 'lab/pdf/out/ui-shots')
const LANGS = (arg('--langs') ?? 'zh-TW,ja,ko').split(',')
const BUILD = process.env.AXT_EXT_DIR ?? join(ROOT, '.output/chrome-mv3')
const EXT = join(ROOT, 'tests/e2e/.ext-ui-shots')
const POPUP_SHOTS = join(ROOT, 'lab/pdf/out/popup')
const WIDTHS = [1440, 320]
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// the packs' words, to find the controls by their names in each language (a probe runs on node, the packs are TypeScript)
const LOCALES = JSON.parse(execFileSync('pnpm', ['-s', 'tsx', '-e', "import { LOCALES } from './src/locales'; console.log(JSON.stringify(LOCALES))"], { cwd: ROOT, encoding: 'utf8' }))

// ---- the paper and the network, as e2e:reader has them
const sampleCut = await cutSample(sampleFiles())
const LATIN_FACE = readFileSync(join(ROOT, 'node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf'))
const api = layerApi({ layer4: sampleCut, faces: { ids: Object.keys(FACES), ranges: [32, 126, 160, 255, 0x2010, 0x2027], bytes: new Uint8Array(LATIN_FACE) } })
const { sample } = api
const PAPER = sample.id
const ABSTRACT_PAGE = `<!doctype html><title>stand-in abstract</title><meta name="citation_title" content="Counting Lattice Paths Around Blocked Cells"><div class="submission-history"><strong>[v${sample.version}]</strong></div>`
const manifest = readFileSync(join(BUILD, 'manifest.json'), 'utf8')
const LAYER_HOSTS = ['https://readarxiv.com', ...['https://app-staging.readarxiv.org'].filter(host => manifest.includes(host))]
const arxiv = (route, url) => {
  const m = /^\/(pdf|abs|html|src)\/([^/]+)$/.exec(url.pathname)
  if (!m || m[2].replace(/v\d+$/, '') !== PAPER) return false
  if (m[1] === 'abs') return route.fulfill({ status: 200, contentType: 'text/html', body: ABSTRACT_PAGE })
  if (m[1] !== 'pdf') return route.fulfill({ status: 404, contentType: 'text/plain', body: 'none' })
  const r = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers().range ?? '')
  if (!r) return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from(sample.pdf) })
  const begin = Number(r[1]), end = Math.min(Number(r[2]) + 1, sample.pdf.length)
  return route.fulfill({ status: 206, contentType: 'application/pdf', headers: { 'content-range': `bytes ${begin}-${end - 1}/${sample.pdf.length}`, 'accept-ranges': 'bytes' }, body: Buffer.from(sample.pdf.subarray(begin, end)) })
}

const echo = await startEchoEndpoint()
copyWithGrants(BUILD, EXT, { hostPermissions: ['http://127.0.0.1/*', ...LAYER_HOSTS.map(host => `${host}/*`)] })
const { context, worker, id, readerUrl } = await launchWithReader({ profile: 'ui-shots', extension: EXT, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, args: [RESOLVER_WALL] })
await routeTable(context, [
  ['https://arxiv.org', arxiv],
  ['https://tex.readarxiv.org', route => route.fulfill({ status: 503, contentType: 'text/plain', body: 'none' })],
  [echo.origin, route => route.continue()],
  ...LAYER_HOSTS.map(host => [host, (route, url) => (serves(url.pathname) ? api.route(route) : false)]),
])
for (let tries = 0; tries < 50 && !(await worker.evaluate(() => chrome.storage.local.get('config').then(r => !!r.config)).catch(() => false)); tries++) await sleep(200)
await seedService(worker, { id: 'svc-uishots0', name: 'echo', baseURL: echo.baseURL, model: 'local-echo' })
const patch = change => worker.evaluate(async change => {
  const { config } = await chrome.storage.local.get('config')
  await chrome.storage.local.set({ config: { ...config, ...change } })
}, change)

const errors = []
/** what the page's boxes cut, in the interface (`.ui`, `.chrome`): words wider than the element clipping them, a
 *  placeholder wider than its field, a box past the window */
const cuts = page => page.evaluate(() => {
  const out = []
  const canvas = document.createElement('canvas').getContext('2d')
  const seen = new Set()
  for (const el of document.querySelectorAll('.ui *, .chrome *')) {
    if (!(el instanceof HTMLElement)) continue
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height || el.closest('[hidden], [inert], [aria-hidden="true"]:not(.preview)')) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden') continue
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)
    // (a box of a pixel or two is a screen reader's copy, hidden from the eye by design)
    if (own && el.clientWidth > 2 && cs.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1) out.push(`cut: “${text}” needs ${el.scrollWidth} px in ${el.clientWidth}`)
    // words past the box they are drawn on: a card, a popover, the bar
    const box = own && el.closest('.o-card, .pop, .capsule, .bar, .popup, .toc, .pill')
    if (box && box !== el) {
      const b = box.getBoundingClientRect()
      if (r.right > b.right + 0.5 || r.left < b.left - 0.5) out.push(`past its ${box.classList[0]}: “${text}” (${r.left.toFixed(0)}–${r.right.toFixed(0)} in ${b.left.toFixed(0)}–${b.right.toFixed(0)})`)
    }
    if (el instanceof HTMLInputElement && el.placeholder) {
      canvas.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const need = canvas.measureText(el.placeholder).width
      if (need > room + 1) out.push(`placeholder cut: “${el.placeholder}” needs ${need.toFixed(0)} px in ${room.toFixed(0)}`)
    }
    if (own && (r.right > innerWidth + 0.5 || r.left < -0.5) && !seen.has(text)) { seen.add(text); out.push(`past the window: “${text}” (${r.left.toFixed(0)}–${r.right.toFixed(0)} of ${innerWidth})`) }
  }
  return [...new Set(out)]
})

const shots = []
async function shoot(page, lang, surface, width, what) {
  await sleep(350)
  const file = `${lang}/${surface}-${width}.png`
  await page.screenshot({ path: join(OUT, file), animations: 'disabled', caret: 'hide' })
  const found = await cuts(page)
  shots.push({ lang, surface, width, what, file, cuts: found })
  console.log(`${found.length ? 'CUT ' : 'ok  '} ${lang} ${surface} ${width}${found.length ? `\n       ${found.join('\n       ')}` : ''}`)
}

for (const lang of LANGS) {
  const { S, R, O } = LOCALES[lang]
  mkdirSync(join(OUT, lang), { recursive: true })
  // ---- the reader: the target German, whose text the stand-in's one Latin face holds
  await patch({ uiLanguage: lang, theme: 'light', targetLanguage: 'deu' })
  for (const width of WIDTHS) {
    const page = await context.newPage()
    page.on('pageerror', e => errors.push(`${lang} reader ${width}: ${e.message}`))
    await page.setViewportSize({ width, height: 900 })
    await page.goto(readerUrl({ live: '1', paper: PAPER, mode: 'bilingual' }))
    await page.waitForFunction(() => { const l = document.querySelector('#right .axt-place[data-page-number="1"] .axt-layer'); return l?.querySelector('canvas.axt-layer-copy')?.width > 0 }, null, { timeout: 60_000 }).catch(() => undefined)
    await sleep(1200)
    await shoot(page, lang, 'reader', width, width > 500 ? 'the toolbar over the two panes' : 'the toolbar and the narrow window\'s capsule (the translation alone)')
    const open = async (name, surface, what) => {
      const button = page.getByRole('button', { name }).filter({ visible: true }).first()
      if (!(await button.isVisible().catch(() => false))) { console.log(`skip ${lang} ${surface} ${width}: no button named ${name}`); return }
      await button.click()
      await page.waitForSelector('.pop:popover-open, #axt-contents:not([inert])', { timeout: 5000 }).catch(() => undefined)
      await shoot(page, lang, surface, width, what)
      await page.keyboard.press('Escape')
      await sleep(250)
    }
    await open(R.options.name, 'reader-options', 'the reading options')
    await open(new RegExp(S.rows.language), 'reader-language', 'the language menu')
    await page.getByRole('button', { name: R.contents }).filter({ visible: true }).first().click().catch(() => undefined)
    await shoot(page, lang, 'reader-contents', width, 'the contents')
    await page.close()
  }
  // a capsule's state: a language the reader does not set (S-R-13), its own name in the sentence, with its action
  await patch({ targetLanguage: 'arb' })
  {
    const page = await context.newPage()
    page.on('pageerror', e => errors.push(`${lang} reader unsupported: ${e.message}`))
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(readerUrl({ live: '1', paper: PAPER, mode: 'bilingual' }))
    await page.waitForSelector('.capsule:not([data-out])', { timeout: 30_000 }).catch(() => undefined)
    await shoot(page, lang, 'reader-capsule-unsupported', 1440, 'a capsule: a target the reader does not set (S-R-13)')
    await page.setViewportSize({ width: 320, height: 900 })
    await shoot(page, lang, 'reader-capsule-unsupported', 320, 'the same capsule at 320 px')
    await page.close()
  }
  await patch({ targetLanguage: 'deu' })
  // ---- the settings page: each section, and the interface language's menu
  for (const width of WIDTHS) {
    const page = await context.newPage()
    page.on('pageerror', e => errors.push(`${lang} settings ${width}: ${e.message}`))
    await page.setViewportSize({ width, height: 900 })
    for (const section of ['translate', 'appearance', 'reading', 'data']) {
      await page.goto(`chrome-extension://${id}/options.html#${section}`)
      await page.waitForSelector('.o-frame', { timeout: 10_000 })
      await sleep(600)
      await shoot(page, lang, `settings-${section}`, width, `settings: ${O.sections[section]}`)
    }
    const control = page.locator('button.o-lang').first()
    if (await control.isVisible().catch(() => false)) {
      await control.click()
      await shoot(page, lang, 'settings-interface-language', width, 'settings: the interface language\'s menu')
      await page.keyboard.press('Escape')
    }
    await page.close()
  }
  // ---- the popup: the gallery's shots (popup-align.mjs), its states at 320 px
  for (const state of ['P0', 'P1', 'P1-languages', 'P1-services', 'P1-styles', 'P3', 'P6', 'P15-prompts', 'PE']) {
    const from = join(POPUP_SHOTS, `${lang}-${state}.png`)
    if (!existsSync(from)) continue
    cpSync(from, join(OUT, lang, `popup-${state}.png`))
    shots.push({ lang, surface: `popup-${state}`, width: 320, what: `the popup, the gallery's ${state} (light and dark)`, file: `${lang}/popup-${state}.png`, cuts: null })
  }
}
await context.close()
await echo.close?.()

// ---- the index
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const NAMES = { 'zh-TW': '繁體中文', ja: '日本語', ko: '한국어', 'zh-CN': '简体中文', en: 'English' }
const body = LANGS.map(lang => `<section><h2 lang="${lang}">${NAMES[lang] ?? lang} <small>${lang}</small></h2><div class="grid">${shots.filter(s => s.lang === lang).map(s => `
<figure><a href="${esc(s.file)}"><img src="${esc(s.file)}" alt="${esc(s.what)}" loading="lazy"></a><figcaption><b>${esc(s.surface)}</b> · ${s.width} px — ${esc(s.what)}${s.cuts === null ? '<br><i>cuts measured by popup-align.mjs</i>' : s.cuts.length ? `<ul>${s.cuts.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : '<br>nothing cut'}</figcaption></figure>`).join('')}</div></section>`).join('\n')
writeFileSync(join(OUT, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Interface shots</title>
<style>:root{color-scheme:light;font:14px/1.5 -apple-system,system-ui,sans-serif}body{margin:0 auto;max-width:1600px;padding:16px;background:#f6f6f7;color:#222}
h1{font-size:20px}h2{font-size:17px;margin-top:32px}small{color:#777;font-weight:400}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
figure{margin:0;background:#fff;border-radius:8px;padding:8px;box-shadow:0 0 0 .5px #0002}img{width:100%;height:auto;display:block;border-radius:4px;background:#eee}
figcaption{font-size:12.5px;margin-top:6px}ul{margin:4px 0 0;padding-left:18px;color:#a11}</style>
<h1>Interface shots: ${LANGS.join(', ')}</h1><p>Generated by tests/e2e/probes/ui-shots.mjs on ${new Date().toISOString().slice(0, 16)}Z from the build at ${esc(BUILD)}, light, at 2×. Each shot lists what its boxes cut (a line wider than the element clipping it, a placeholder wider than its field, an element past the window); a paper's title truncates by design.</p>
${body}</html>\n`)
console.log(`\n${shots.length} shots, index at ${join(OUT, 'index.html')}`)
if (errors.length) { console.log(`page errors:\n  ${errors.join('\n  ')}`); process.exit(1) }
