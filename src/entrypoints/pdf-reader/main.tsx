import 'pdfjs-dist/web/pdf_viewer.css'
import '@/styles/image.css'
import '@/pdf-reader/engine/view/engine.css'
import './reader.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createController } from '@/pdf-reader/controller'
import type { SessionHost } from '@/pdf-reader/session/events'
import { trackModality } from '@/ui/controls/modality'
import { readConfig } from '@/config/storage'
import { applyPageLocale } from '@/ui/apply-locale'
import { answeredBy, firstReadTime } from '@/ui/first-read'
import { frameOwner } from '@/shared/frame-owner'
import { App } from './App'

// The settings once, before the first paint, for the language and for the chrome (ui/first-read.ts): the page gives the
// read 1,500 ms and paints the defaults, said to be unreadable, if it has not answered (S-R-21). The session, a heavy
// module (the reading view, the engine's layer, PDF.js), starts on that reading and follows the settings from there.
// Beside it, whom the page acts for (shared/frame-owner.ts): framed by a page that is none of ours, the reader draws
// nothing and does nothing — no paper fetched, no run, no setting written, whatever its address asks (PDF-READER §11.1)
const owner = frameOwner()
const reading = (await answeredBy(readConfig(), firstReadTime())) ?? null
if ((await owner) !== null) {
  applyPageLocale(reading?.config.uiLanguage)
  const params = new URLSearchParams(location.search)
  // the session opens once the panes are there (App.tsx attach): the reading view over arXiv's PDF and the paper's layer
  const open = async (host: SessionHost) => (await import('@/pdf-reader/session/host')).openReader(host)
  const controller = createController({ open, params, reading })
  // the focus rings are the keyboard's (modality.ts)
  trackModality()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App controller={controller} embedded={params.get('embedded') === '1'} />
    </StrictMode>,
  )
}
