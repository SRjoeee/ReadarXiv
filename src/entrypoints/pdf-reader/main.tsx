import 'pdfjs-dist/web/pdf_viewer.css'
import '@/styles/image.css'
import '@/pdf-reader/engine/view/engine.css'
import './reader.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createController, type Session } from '@/pdf-reader/controller'
import { setHost } from '@/pdf-reader/session/host.mjs'
import { trackModality } from '@/ui/controls/modality'
import { readConfig } from '@/config/storage'
import { applyPageLocale } from '@/ui/apply-locale'
import { answeredBy, firstReadTime } from '@/ui/first-read'
import { App } from './App'

// The settings once, before the first paint, for the language and for the chrome (ui/first-read.ts): the page gives the
// read 1,500 ms and paints the defaults, said to be unreadable, if it has not answered (S-R-21). The session, a heavy
// module, reads them again as it loads
const reading = (await answeredBy(readConfig(), firstReadTime())) ?? null
applyPageLocale(reading?.config.uiLanguage)
const params = new URLSearchParams(location.search)
// the session runs once, at load: it is loaded only when the panes are there and the host is set (host.mjs)
const open = async (host: Parameters<typeof setHost>[0]): Promise<Session> => {
  setHost(host)
  return import('@/pdf-reader/session/session.mjs')
}
const controller = createController({ open, params, reading })
// the focus rings are the keyboard's (modality.ts)
trackModality()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App controller={controller} embedded={params.get('embedded') === '1'} />
  </StrictMode>,
)
