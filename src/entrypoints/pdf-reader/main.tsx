import 'pdfjs-dist/web/pdf_viewer.css'
import '@/styles/image.css'
import '@/pdf-reader/engine/view/engine.css'
import './reader.css'
import { createController, mountChrome } from '@readarxiv/reader'
import { trackModality } from '@readarxiv/ui'
import { browser } from 'wxt/browser'
import { DEFAULT_CONFIG } from '@/config/schema'
import { readConfig } from '@/config/storage'
import { LOOPBACK_ALLOWED, paperOf } from '@/pdf-reader/addresses'
import { chromeLanguages } from '@/pdf-reader/host/languages'
import { settingsUrl } from '@/pdf-reader/host/links'
import { prefsOf } from '@/pdf-reader/host/prefs'
import { extensionSlots } from '@/pdf-reader/host/slots'
import { configStore, todayOpen } from '@/pdf-reader/host/today'
import { frameOwner } from '@/shared/frame-owner'
import { applyPageLocale } from '@/ui/apply-locale'
import { answeredBy, firstReadTime } from '@/ui/first-read'
import { reasonText } from '@/ui/strings'

/**
 * The manifest key that lets a reader that is no frame act: only the harness's copy of a release build carries it
 * (tests/e2e/lib/extension.mjs), and scripts/check-output.mjs holds that a build never does
 */
export const TOP_LEVEL_READER_KEY = 'axt_top_level_reader'

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
  // the chrome over today's session (host/today.ts): the reading view over arXiv's PDF and the paper's layer, opened once
  // the panes are there (the chrome's App attach), the extension's configuration as the one preference model
  const store = configStore(reading?.config ?? null)
  const defaults = prefsOf(DEFAULT_CONFIG)
  const controller = createController({
    open: todayOpen({ params, reading, store }),
    paper: paperOf(params),
    first: { prefs: reading ? prefsOf(reading.config) : null, unreadable: !reading || reading.fallbackReason !== null },
    defaults,
  })
  // the focus rings are the keyboard's (modality.ts)
  trackModality()
  mountChrome(document.getElementById('root')!, {
    controller,
    parts: {
      slots: extensionSlots({ controller, store, embedded: params.get('embedded') === '1' }),
      languages: chromeLanguages(),
      // a key's reason is the key's only where the service chosen carries one (#88 E5)
      reason: kind => reasonText(kind, store.state().config?.provider),
      settingsHref: settingsUrl(),
      defaults,
    },
  })
}
