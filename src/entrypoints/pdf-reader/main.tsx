import 'pdfjs-dist/web/pdf_viewer.css'
import '@/styles/image.css'
import '@/pdf-reader/engine/view/engine.css'
import './reader.css'
import { createController, mountChrome } from '@readarxiv/reader'
import { trackModality } from '@readarxiv/ui'
import { browser } from 'wxt/browser'
import { readConfig } from '@/config/storage'
import { LOOPBACK_ALLOWED, paperOf } from '@/pdf-reader/addresses'
import { DEFAULT_PREFS, extensionParts, firstOf } from '@/pdf-reader/host/parts'
import { configStore, todayOpen } from '@/pdf-reader/host/today'
import { frameOwner } from '@/shared/frame-owner'
import { applyPageLocale } from '@/ui/apply-locale'
import { answeredBy, firstReadTime } from '@/ui/first-read'

/**
 * The manifest key that lets a reader that is no frame act: only the harness's copy of a release build carries it
 * (tests/e2e/lib/extension.mjs), and scripts/check-output.mjs holds that a build never does
 */
export const TOP_LEVEL_READER_KEY = 'axt_top_level_reader'

declare const __AXT_READER__: 'today' | 'v2' | undefined
/** which reader the page runs: today's session under the package's chrome (the default), or the reader package whole
 *  (wxt.config.ts AXT_READER) */
const READER = typeof __AXT_READER__ === 'string' ? __AXT_READER__ : 'today'

// The settings once, before the first paint, for the language and for the chrome (ui/first-read.ts): the page gives the
// read 1,500 ms and paints the defaults, said to be unreadable, if it has not answered (S-R-21). The session, a heavy
// module (the reading view, the engine's layer, PDF.js), starts on that reading and follows the settings from there.
// Beside it, whom the page acts for (shared/frame-owner.ts): framed by a page that is none of ours, the reader draws
// nothing and does nothing — no paper fetched, no run, no setting written, whatever its address asks (PDF-READER §11.1).
// Nor, in a release build, does a reader that is no frame: the PDF page only ever frames it (pdf.content.ts), while a page
// of arXiv's that learnt the address could send its own tab there, and the settings alone would start a run. A development
// build, and the harness's copy of a release build (TOP_LEVEL_READER_KEY), open one as its address says
const owner = frameOwner()
const reading = (await answeredBy(readConfig(), firstReadTime())) ?? null
const topLevel = LOOPBACK_ALLOWED || (browser.runtime.getManifest() as Record<string, unknown>)[TOP_LEVEL_READER_KEY] === true
const vouched = await owner
if (vouched !== null && (vouched.framed || topLevel)) {
  applyPageLocale(reading?.config.uiLanguage)
  const params = new URLSearchParams(location.search)
  // the chrome over today's session (host/today.ts: the reading view over arXiv's PDF and the paper's layer), or over the
  // reader package (host/v2.ts), opened once the panes are there (the chrome's App attach); the extension's configuration as
  // the one preference model
  const paper = paperOf(params)
  const today = READER === 'today' ? configStore(reading?.config ?? null) : null
  const v2 = READER === 'v2' ? await (await import('@/pdf-reader/host/v2')).startV2({ params, paper }) : null
  const store = today ?? v2!.store
  const controller = createController({ open: today ? todayOpen({ params, reading, store: today }) : v2!.open, paper, first: firstOf(reading), defaults: DEFAULT_PREFS() })
  // the focus rings are the keyboard's (modality.ts)
  trackModality()
  const probes = window as unknown as { __reader?: object }
  probes.__reader ??= {}
  mountChrome(document.getElementById('root')!, {
    controller,
    parts: extensionParts({ controller, store, embedded: params.get('embedded') === '1', probe: hook => Object.assign(probes.__reader ?? {}, hook) }),
  })
}
