// The pages' names in the reader with both panes (docs/UI.md S-R-11a). PDF.js names every page region "Page N", in
// English, in both panes: the same name twice over (axe's landmark-unique, moderate, on every page number a pane holds)
// and a language that is not the interface's (an English name under lang="zh-CN", its number between two isolates). Each
// page is named by its side and its number, in the interface's language: 原文 · 第 1 页 and 译文 · 第 1 页, Original · Page 1
// and Translation · Page 1. The names below are typed here, not taken from the packs. The reader on a demo paper
// (spikes/reader-papers.mjs made it) at 1440 px, in each language the interface has, the language set in the extension's
// settings before the page opens.
//  - axe: no landmark-unique, anywhere on the page;
//  - every page region of each pane named by its side and number, the pane's pages numbered 1 to its last;
//  - each region under an element of the interface's language, the name without PDF.js's isolates;
//  - the viewer a new translation brings in to replace the right pane's named as the one it replaces;
//  - PDF.js's other words unchanged: an element asking its translator for a word of its own is still given it.
// Build first (`pnpm build`). BUILD=<dir> another build; PAPER=<id> another demo paper. Exits non-zero on a FAIL.
//   node tests/e2e/probes/page-names.mjs
import AxeBuilder from '@axe-core/playwright'
import { BUILD, launchWithReader } from '../../../experiments/pdf-bilingual/spikes/extension.mjs'

const paper = process.env.PAPER ?? '2608.02163'
const extension = process.env.BUILD ?? BUILD
let failed = 0
const row = (ok, name, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`); if (!ok) failed++ }

const LANGUAGES = [
  { code: 'zh-CN', original: n => `原文 · 第 ${n} 页`, translation: n => `译文 · 第 ${n} 页` },
  { code: 'en', original: n => `Original · Page ${n}`, translation: n => `Translation · Page ${n}` },
]

const { context, worker, readerUrl } = await launchWithReader({ profile: 'page-names', demos: true, extension, viewport: { width: 1440, height: 900 } })
/** a patch on the configuration the extension wrote at install */
const patch = change => worker.evaluate(async change => {
  for (let i = 0; i < 100 && !(await chrome.storage.local.get('config')).config; i++) await new Promise(r => setTimeout(r, 100))
  const { config } = await chrome.storage.local.get('config')
  await chrome.storage.local.set({ config: { ...config, ...change } })
}, change)
const page = await context.newPage()
/** Leaving one of the extension's own pages for another has aborted with net::ERR_ABORTED — a stray navigation from the
 * page just left races the new one (tests/e2e/probes/pages-a11y.mjs): retried once */
const goto = async url => {
  try {
    await page.goto(url)
  } catch {
    await page.waitForTimeout(300)
    await page.goto(url)
  }
}
page.on('pageerror', e => { console.log(`FAIL no page error — ${e.message}`); failed++ })

for (const { code, original, translation } of LANGUAGES) {
  await patch({ uiLanguage: code })
  await goto(readerUrl({ paper, mode: 'bilingual' }))
  await page.waitForFunction(() => { const r = window.__reader; return r?.ready && r.controller?.getState().settings && r.debug?.left.anchors.size && r.debug.right.anchors.size }, null, { timeout: 90_000, polling: 250 })
  await page.waitForTimeout(1500)
  const tag = await page.evaluate(() => document.documentElement.lang)
  row(tag === code, `${code}: the page is in the interface's language`, `<html lang="${tag}">`)

  const { violations } = await new AxeBuilder({ page }).withRules(['landmark-unique']).analyze()
  row(violations.length === 0, `${code} axe: no landmark-unique`, violations.length ? violations.map(v => `${v.impact}: ${v.nodes.length} regions, e.g. ${v.nodes[0].html.slice(0, 90)}`).join('; ') : 'no violation')

  /** the page regions of a pane (the right is whichever viewer the reader holds there: a new translation replaces it) */
  const regionsOf = side => page.evaluate(side => [...window.__reader.debug[side].container.querySelectorAll('.page')].map(p => ({
    n: Number(p.getAttribute('data-page-number')), role: p.getAttribute('role'), name: p.getAttribute('aria-label'), lang: p.closest('[lang]')?.getAttribute('lang') ?? null,
  })), side)
  const panes = { left: await regionsOf('left'), right: await regionsOf('right') }
  for (const [id, side, name] of [['left', 'original', original], ['right', 'translation', translation]]) {
    const regions = panes[id], wrong = regions.filter((r, i) => r.n !== i + 1 || r.role !== 'region' || r.name !== name(i + 1))
    row(regions.length > 1 && wrong.length === 0, `${code}: the ${side}'s pages are named by their side`, `${regions.length} regions, first "${regions[0]?.name}", last "${regions.at(-1)?.name}"${wrong.length ? `; ${wrong.length} wrong, e.g. "${wrong[0].name}" for page ${wrong[0].n}` : ''}`)
  }
  const all = [...panes.left, ...panes.right], elsewhere = all.filter(r => r.lang !== code), isolated = all.filter(r => /[\u2066-\u2069]/.test(r.name ?? ''))
  row(all.length > 2 && elsewhere.length === 0 && isolated.length === 0, `${code}: each page's name is in the interface's language (the region's lang)`, `${all.length} regions; ${elsewhere.length} under another lang than "${code}"${elsewhere.length ? ` (e.g. "${elsewhere[0].lang}")` : ''}, ${isolated.length} with PDF.js's isolates round the number`)

  // a new translation replaces the right pane's viewer (a compile's result): the viewer that comes in is named as the one it replaces was
  await page.evaluate(() => window.__reader.debug.swapRight())
  await page.waitForTimeout(800)
  const replaced = await regionsOf('right'), wrong = replaced.filter((r, i) => r.n !== i + 1 || r.role !== 'region' || r.name !== translation(i + 1))
  const again = await new AxeBuilder({ page }).withRules(['landmark-unique']).analyze()
  row(replaced.length > 1 && wrong.length === 0 && again.violations.length === 0, `${code}: the translation that replaces the right pane is named too, and the names stay unique`, `${replaced.length} regions, first "${replaced[0]?.name}", last "${replaced.at(-1)?.name}"${wrong.length ? `; ${wrong.length} wrong, e.g. "${wrong[0].name}" for page ${wrong[0].n}` : ''}; ${again.violations.length} landmark-unique violations`)
}

// PDF.js's own translator is still at work for any other word: an element asking for the zoom's "page width" is given it
await page.evaluate(() => {
  const asking = Object.assign(document.createElement('span'), { id: 'asks-pdfjs' })
  asking.setAttribute('data-l10n-id', 'pdfjs-page-scale-width')
  window.__reader.debug.left.container.append(asking)
})
const given = await page.waitForFunction(() => document.getElementById('asks-pdfjs')?.textContent || false, null, { timeout: 5000 }).then(h => h.jsonValue(), () => '')
row(given === 'Page Width', "PDF.js's other words unchanged", `an element asking for pdfjs-page-scale-width is given "${given}"`)

await context.close()
console.log(failed ? `${failed} FAIL` : 'every row PASS')
process.exit(failed ? 1 : 0)
