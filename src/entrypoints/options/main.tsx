import '@/styles/ui.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyLocale } from '@/ui/apply-locale'
import { O } from '@/ui/strings'
import { followTheme } from '@/ui/theme'
import { App } from './App'

// The pack first, then the first paint: see ui/apply-locale.ts
await applyLocale(brand => `${brand} · ${O.title}`)
// the extension's appearance before the first paint, then followed (the redesign's design, §3)
await followTheme(document.documentElement)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
