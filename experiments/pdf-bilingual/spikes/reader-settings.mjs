// The reader and the extension's settings (the reader's design, §3, §9.1), on a demo paper: the display the settings ask
// for is the one it opens in; a display chosen in the reader is written back, stacked kept; another tab's change is
// followed and not written back; the highlight and figure text follow their switches; a probe's address holds.
// Exits non-zero on a failure. Build first; the demo papers made (spikes/reader-papers.mjs).
//   node spikes/reader-settings.mjs
import { launchWithReader } from './extension.mjs'

const paper = '2608.02163'
const { context, readerUrl } = await launchWithReader({ profile: 'reader-settings', demos: true, viewport: { width: 1440, height: 900 } })
let failed = 0
const check = (what, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${detail}` : ''}`); if (!ok) failed++ }
const open = async (query = {}) => {
  const page = await context.newPage()
  await page.goto(readerUrl({ paper, ...query }))
  await page.waitForFunction(() => window.__reader?.ready && window.__reader?.controller?.getState().settings, null, { timeout: 90000 })
  return page
}
const state = page => page.evaluate(() => window.__reader.controller.getState())
/**
 * A change of the settings, as a plain object merged in the page one group deep: the extension's policy has no
 * 'unsafe-eval', so no function can be sent (final review)
 */
const patch = (page, change) => page.evaluate(p => window.__reader.controller.patchSettings(c => {
  const out = { ...c }
  for (const [k, v] of Object.entries(p)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...c[k], ...v } : v
  return out
}), change)
const settle = page => page.waitForTimeout(700)

// the display the settings ask for
const a = await open()
await patch(a, { mode: 'only', pdfReader: { original: false } })
await settle(a)
check('a change of the settings moves the display', (await state(a)).display === 'translation', (await state(a)).display)
const b = await open()
check('a reader opens in the display the settings ask for', (await state(b)).display === 'translation', (await state(b)).display)

// a display chosen in the reader is written back; the other tab follows and writes nothing
await b.evaluate(() => window.__reader.controller.setDisplay('bilingual'))
await settle(b)
const written = (await state(b)).settings
check('choosing side by side writes the side mode', written.mode === 'side' && written.pdfReader.original === false, `${written.mode}, original ${written.pdfReader.original}`)
await settle(a)
check('another reader follows it', (await state(a)).display === 'bilingual', (await state(a)).display)
await b.evaluate(() => window.__reader.controller.setDisplay('original'))
await settle(b)
const orig = (await state(b)).settings
check('choosing the original marks it and keeps the mode', orig.pdfReader.original === true && orig.mode === 'side', `${orig.mode}, original ${orig.pdfReader.original}`)
await patch(b, { mode: 'stack', pdfReader: { original: false } })
await settle(b)
check('stacked shows side by side', (await state(b)).display === 'bilingual', (await state(b)).display)
await patch(b, { mode: 'stack', pdfReader: { original: true } })
await settle(b)
await b.evaluate(() => window.__reader.controller.setDisplay('bilingual'))
await settle(b)
const kept = (await state(b)).settings
check('side by side chosen with stacked stored keeps stacked', kept.mode === 'stack' && !kept.pdfReader.original, `${kept.mode}, original ${kept.pdfReader.original}`)

// the sync follows its setting, and the reader's switch writes it
await patch(b, { pdfReader: { sync: false } })
await settle(b)
check('the sync goes off with its setting', (await b.evaluate(() => window.__reader.debug.syncMode)) === 'off')
await b.evaluate(() => window.__reader.controller.setSync(true))
await settle(b)
check('the reader\'s switch writes it back', (await state(b)).settings.pdfReader.sync === true && (await b.evaluate(() => window.__reader.debug.syncMode)) === 'same')

// the highlight and figure text follow their switches
await patch(b, { reading: { sentenceHighlight: false }, image: { enabled: false } })
await settle(b)
const leftBox = await b.locator('#left').boundingBox()
await b.mouse.move(leftBox.x + leftBox.width * 0.3, leftBox.y + leftBox.height * 0.5)
await b.waitForTimeout(300)
check('no band with the highlight off', (await b.evaluate(() => document.querySelectorAll('.axt-hl').length)) === 0)
await b.waitForTimeout(800)
check('no figure text with the image switch off', (await b.evaluate(() => document.querySelectorAll('.axt-fig').length)) === 0)
await patch(b, { reading: { sentenceHighlight: true }, image: { enabled: true } })
await settle(b)

// an address that names a display writes nothing, and holds it whatever the settings say
const stored = (await state(b)).settings.pdfReader.original
const c = await open({ mode: 'original' })
await settle(c)
check('an address that names a display writes nothing', (await state(c)).settings.pdfReader.original === stored, `stored ${stored}, now ${(await state(c)).settings.pdfReader.original}`)
await patch(c, { mode: 'only', pdfReader: { original: false } })
await settle(c)
check('and holds it whatever the settings say', (await state(c)).display === 'original', (await state(c)).display)

// a change of something the reader does not show leaves the display and the sync as they are
await b.evaluate(() => window.__reader.controller.setDisplay('translation'))
await settle(b)
await patch(a, { reading: { openIn: 'same-tab' } })
await settle(b)
check('a change of nothing it shows leaves the display', (await state(b)).display === 'translation', (await state(b)).display)

// settings the extension cannot read. A value written elsewhere that cannot be read is not followed (config/storage.ts
// watchConfig passes valid values alone): the reader learns of it when its own write is refused. The display chosen
// then holds on screen, though the defaults refused into effect ask for another; the write is dropped, nothing thrown
const stored0 = await b.evaluate(() => chrome.storage.local.get('config').then(r => r.config))
const errors = []
b.on('pageerror', e => errors.push(e.message))
await b.evaluate(c => chrome.storage.local.set({ config: { ...c, mode: 'nonsense' } }), stored0)
await settle(b)
await b.evaluate(() => window.__reader.controller.setDisplay('original'))
await settle(b)
check('unreadable settings: a refused write says so', (await state(b)).settingsUnreadable === true)
check('unreadable settings: the display chosen holds', (await state(b)).display === 'original', (await state(b)).display)
check('unreadable settings: nothing thrown', errors.length === 0, errors.join('; '))
const d = await open()
check('unreadable settings: a reader opened on them knows at once', (await state(d)).settingsUnreadable === true)
await d.close()
await b.evaluate(c => chrome.storage.local.set({ config: c }), stored0)
await settle(b)
check('repaired settings are known', (await state(b)).settingsUnreadable === false)

// asked to translate (#readarxiv on the PDF address, passed as ask=translate; the reader's design, §2): the original
// left on is let go, and the reader opens in the translated display the mode names
await patch(b, { mode: 'only', pdfReader: { original: true } })
await settle(b)
const e = await open({ ask: 'translate' })
await settle(e)
const asked = await state(e)
check('asked to translate: the translated display the mode names, the original let go', asked.display === 'translation' && asked.settings.pdfReader.original === false, `${asked.display}, original ${asked.settings.pdfReader.original}`)
await e.close()

console.log(failed ? `${failed} failed` : 'all passed')
await context.close()
process.exit(failed ? 1 : 0)
