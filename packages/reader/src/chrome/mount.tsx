// The chrome mounted in a host's page: its React root, StrictMode as the extension's pages have it. The host keeps the root
// for as long as the page lives (a reader's page is one reader)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import type { ReaderController } from './model.ts'
import type { Parts } from './parts.tsx'

export function mountChrome(root: HTMLElement, o: { controller: ReaderController; parts: Parts }): () => void {
  const r = createRoot(root)
  r.render(
    <StrictMode>
      <App controller={o.controller} parts={o.parts} />
    </StrictMode>,
  )
  return () => r.unmount()
}
