// experiments/pdf-bilingual/spikes/visual-eval-view-cases.mjs
// The evaluation page in a real browser over made-up data: languages, papers, the whole-paper rows (a failed column,
// columns of different lengths), the page view (keys, a missing page, a hidden column), numbers with no units, the
// untranslated count, and a flag exported. Exits non-zero on a failure.
//   node experiments/pdf-bilingual/spikes/visual-eval-view-cases.mjs
import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { catalogEntry, COLUMNS } from './visual-eval-lib.mjs'

const root = new URL('..', import.meta.url).pathname
let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }

// Existing indexes retain retired outputs: they must not affect the active columns, metrics or page navigation.
const data = mkdtempSync(join(tmpdir(), 'eval-view-')), dir = join(data, 'zh', 'p1')
for (const sub of ['pages', 'thumbs']) mkdirSync(join(dir, sub), { recursive: true })
execFileSync('pdftoppm', ['-jpeg', '-r', '24', '-f', '1', '-l', '1', '-singlefile', join(root, 'data/corpus/2608.15016/arxiv.pdf'), join(data, 'one')])
for (const [key, n] of [['original', 2], ['fit', 3], ['today', 9], ['before', 9]]) for (let p = 1; p <= n; p++) for (const sub of ['pages', 'thumbs']) copyFileSync(join(data, 'one.jpg'), join(dir, sub, `${key}-${p}.jpg`))
const index = { lang: 'zh', paper: 'p1', cls: 'article', columns: [{ key: 'original', label: 'Original', pages: 2 }, { key: 'today', label: 'Today', pages: 9 }, { key: 'locked', label: 'Locked', pages: null }, { key: 'fit', label: 'Fit', pages: 3 }, { key: 'lockh', label: "Locked, H's rules", pages: null }, { key: 'before', label: 'Today before', pages: 9 }], numbers: { fit: { pages: 3, units: 0, samePage: 0, captions: 0, captionsSamePage: 0 } }, failed: { locked: '! retired error', lockh: '! Undefined control sequence.' }, flags: [], translation: { units: 10, untranslated: 2 }, suspicious: [{ page: 2, kind: 'large gap', detail: '30 pt inserted' }], lostExtra: ['retired character'], overfull: 99 }
writeFileSync(join(dir, 'index.json'), JSON.stringify(index))
writeFileSync(join(data, 'index.json'), JSON.stringify({ columns: COLUMNS, langs: { zh: [catalogEntry(index)] } }))

const server = spawn('node', [join(root, 'spikes/serve-eval.mjs'), '--port=8099', `--data=${data}`], { stdio: 'ignore' })
for (let i = 0; i < 50; i++) { try { await fetch('http://localhost:8099/'); break } catch { await new Promise(r => setTimeout(r, 100)) } }
const browser = await chromium.launch()
try {
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage()
  await page.goto('http://localhost:8099/')
  check('language tab', (await page.locator('#langs button').allTextContents()).join() === 'zh')
  const item = page.locator('#papers .paper', { hasText: 'p1' })
  check('paper listed', (await item.count()) === 1)
  check('no NaN for a column without units', !(await item.textContent()).includes('NaN') && (await item.textContent()).includes('—'))
  await item.click()
  await page.locator('.row').first().waitFor() // the paper's index is fetched, then drawn
  check('untranslated shown', (await page.locator('#view').textContent()).includes('2 units untranslated'))
  check('rows run to their own length', (await page.locator('.row[data-key="fit"] img').count()) === 3 && (await page.locator('.row[data-key="original"] img').count()) === 2)
  check('failed column says why', (await page.locator('.row[data-key="lockh"]').textContent()).includes('Undefined control sequence'))
  check('retired diagnostics hidden', await page.locator('.suspicious a').count() === 0 && !(await page.locator('.head').textContent()).includes('99 overfull'))
  check('active labels only', (await page.locator('.row .label').allTextContents()).join('|') === 'Original|FIT|Locked (H rules)')
  check('retired metrics hidden', !(await item.textContent()).includes('today') && !(await item.textContent()).includes('Today'))
  await page.locator('.row[data-key="original"] img').first().click()
  const srcs = async () => page.locator('.col img').evaluateAll(els => els.map(e => e.getAttribute('src')))
  check('page view at page 1', (await srcs()).some(s => s.endsWith('original-1.jpg')) && (await srcs()).some(s => s.endsWith('fit-1.jpg')))
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight')
  check('page 3: FIT shown, original missing', (await srcs()).some(s => s.endsWith('fit-3.jpg')) && (await page.locator('.col[data-key="original"]').textContent()).includes('no page 3'))
  await page.keyboard.press('ArrowRight')
  check('retired long output does not extend navigation', (await page.locator('.head').nth(1).textContent()).includes('page 3') && !(await page.locator('.head').nth(1).textContent()).includes('page 4'))
  await page.keyboard.press('2')
  check('column hidden by its number', (await page.locator('.col[data-key="fit"]').isHidden()))
  await page.locator('#flag').click()
  await page.locator('#flag-note').fill('a test note')
  await page.locator('#flag-save').click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()])
  const flags = JSON.parse(readFileSync(await download.path(), 'utf8'))
  check('flag exported', flags.length === 1 && flags[0].page === 3 && flags[0].note === 'a test note' && flags[0].paper === 'p1', JSON.stringify(flags))
  // cleared on a second click only, and then the next flag is exported alone
  await page.locator('#clear').click()
  check('one click does not clear', (await page.locator('#flags-count').textContent()) === '1 flagged' && /Click again/.test(await page.locator('#clear').textContent()))
  await page.locator('#clear').click()
  check('the second click clears', (await page.locator('#flags-count').textContent()) === '0 flagged' && (await page.locator('#clear').isDisabled()))
} finally { await browser.close(); server.kill() }
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
