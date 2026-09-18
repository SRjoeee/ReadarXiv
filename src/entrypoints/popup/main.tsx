import '@/styles/ui.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyLocale } from '@/ui/apply-locale'
import { App } from './App'
import { reportToOwner } from './embedded'

// The pack first, then the first paint: see ui/apply-locale.ts
await applyLocale(brand => brand)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
// Framed as the floating button's control panel, the page reports its height and hands over Escape (embedded.ts)
reportToOwner()
