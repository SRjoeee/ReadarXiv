import 'pdfjs-dist/web/pdf_viewer.css'
import '@/styles/image.css'
import '@/pdf-reader/engine/engine.css'
import './reader.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createController, type Session } from '@/pdf-reader/controller'
import { setHost } from '@/pdf-reader/engine/host.mjs'
import { trackModality } from '@/pdf-reader/ui/modality'
import { applyLocale } from '@/ui/apply-locale'
import { App } from './App'

// The pack first, then the first paint: see ui/apply-locale.ts
await applyLocale()
const params = new URLSearchParams(location.search)
// the session runs once, at load: it is loaded only when the panes are there and the host is set (host.mjs)
const open = async (host: Parameters<typeof setHost>[0]): Promise<Session> => {
  setHost(host)
  return import('@/pdf-reader/engine/session.mjs')
}
const controller = createController({ open, params })
// the focus rings are the keyboard's (modality.ts)
trackModality()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App controller={controller} embedded={params.get('embedded') === '1'} />
  </StrictMode>,
)
