import '@/styles/ui.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { prepareFirstPaint } from '@/ui/first-paint'
import { O } from '@/ui/strings'
import { App } from './App'

// The pack and the extension's appearance before the first paint, from one read of the settings: see ui/first-paint.ts
await prepareFirstPaint(document.documentElement, brand => `${brand} · ${O.title}`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
