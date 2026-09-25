// A pane's page pill (the reader's design, §6.4): at the pane's bottom centre, ‹ · the page (an input, all of it
// selected on focus) · / total · ›. Shown while its pane scrolls and 2.5 s after, and while hovered or focused
// (reader.css); the page is PDF.js's as it reports it, never read ahead of it
import { ChevronLeft, ChevronRight } from 'lucide'
import { forwardRef, useState } from 'react'
import { R } from '@/ui/strings'
import type { ReaderController, Side } from '../controller'
import { Icon } from './icons'
import { useReader } from './use-reader'

export const PagePill = forwardRef<HTMLDivElement, { controller: ReaderController; side: Side }>(function PagePill({ controller, side }, ref) {
  const { page, pages } = useReader(controller, s => s.sides[side])
  const [draft, setDraft] = useState<string | null>(null)
  const go = (n: number) => { if (Number.isInteger(n) && n >= 1 && n <= pages) controller.goToPage(side, n) }
  return (
    <div ref={ref} className="chrome pill">
      <button type="button" aria-label={R.pill.previous} onClick={() => go(page - 1)}>
        <Icon node={ChevronLeft} size={14} />
      </button>
      <input inputMode="numeric" aria-label={side === 'left' ? R.pill.original : R.pill.translation} value={draft ?? String(page)} onFocus={e => e.currentTarget.select()} onBlur={() => setDraft(null)}
        onChange={e => setDraft(e.target.value)} onInput={e => setDraft((e.target as HTMLInputElement).value)}
        // the field's own value: the draft's state may not have landed when Enter follows the typing at once
        onKeyDown={e => { if (e.key === 'Enter') { go(Number(e.currentTarget.value)); setDraft(null) } else if (e.key === 'Escape') setDraft(null) }} />
      <span className="of">/ {pages}</span>
      <button type="button" aria-label={R.pill.next} onClick={() => go(page + 1)}>
        <Icon node={ChevronRight} size={14} />
      </button>
    </div>
  )
})
