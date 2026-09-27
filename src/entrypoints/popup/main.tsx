import '@/styles/ui.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { prepareFirstPaint } from '@/ui/first-paint'
import { trackModality } from '@/ui/controls/modality'
import { rejectedServices } from '@/shared/service-health'
import { App } from './App'
import { reportToOwner } from './embedded'

// The pack and the extension's appearance before the first paint, from one read of the settings: see ui/first-paint.ts.
// Beside it, not after it, the record of refused keys: the first render counts a refused service as one that cannot
// run, rather than drawing it runnable and flipping (the branch's final review). Unreadable, it holds nothing
const refused = rejectedServices().catch(() => new Set<string>())
await prepareFirstPaint(document.documentElement, brand => brand)
const rejected = [...(await refused)]
// the pointer's turn and the keyboard's, from the first paint (the pages' base, Part 3): the new controls' text fields
// are ringed for the keyboard alone
trackModality()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App rejected={rejected} />
  </StrictMode>,
)
// Framed as the floating button's control panel, the page reports its height and hands over Escape (embedded.ts)
reportToOwner()
