// A pane's page pill (the reader's design, §6.4): at the pane's bottom centre, ‹ · the page (an input, all of it
// selected on focus) · / total · ›. Shown while its pane scrolls and 2.5 s after, and while hovered or focused
// (reader.css); the page is PDF.js's as it reports it, never read ahead of it. A page typed is one of the reader's jumps (its
// way back, the back capsule, UI.md S-R-29); the arrows turn a page as a scroll does and are none (link previews' §3.7)
import { ChevronLeft, ChevronRight } from 'lucide'
import { forwardRef, useState } from 'react'
import { R, Icon } from '@readarxiv/ui'
import { BackButton, onePane } from './BackCapsule.tsx'
import type { ReaderController, Side } from './model.ts'
import { TippedButton } from './TippedButton.tsx'
import { useReader } from './use-reader.ts'

export const PagePill = forwardRef<HTMLDivElement, { controller: ReaderController; side: Side }>(function PagePill(
  { controller, side },
  ref,
) {
  const { page, pages } = useReader(controller, (s) => s.sides[side])
  // (one pane shown: the way back is this pill's first segment, the pill held shown while it is: BackCapsule.tsx)
  const joined = useReader(controller, (s) => s.back && onePane(s) === side)
  const [draft, setDraft] = useState<string | null>(null)
  const go = (n: number, jump = false) => {
    if (!Number.isInteger(n) || n < 1 || n > pages) return
    if (jump) controller.goToPage(side, n, { jump: true })
    else controller.goToPage(side, n)
  }
  return (
    <div ref={ref} className="chrome pill" data-held={joined || undefined}>
      {joined && (
        <>
          <BackButton controller={controller} />
          <span className="sep" aria-hidden="true" />
        </>
      )}
      {/* the arrows' tooltips stand above: the pill is at the pane's foot (P3-M11) */}
      <TippedButton label={R.pill.previous} side="top" onClick={() => go(page - 1)}>
        <Icon node={ChevronLeft} size={14} />
      </TippedButton>
      <input
        inputMode="numeric"
        aria-label={side === 'left' ? R.pill.original : R.pill.translation}
        value={draft ?? String(page)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => setDraft(null)}
        onChange={(e) => setDraft(e.target.value)}
        onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
        // the field's own value: the draft's state may not have landed when Enter follows the typing at once. An Enter that
        // confirms an input method's text is the IME's, not the field's (isComposing, or the keyCode 229 a browser gives a key
        // the IME takes; Modern Web Guidance's ime-safe-enter-submit): a Japanese IME confirming full-width digits went to the
        // page and reset the field
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            go(Number(e.currentTarget.value), true)
            setDraft(null)
          } else if (e.key === 'Escape') setDraft(null)
        }}
      />
      <span className="of">/ {pages}</span>
      <TippedButton label={R.pill.next} side="top" onClick={() => go(page + 1)}>
        <Icon node={ChevronRight} size={14} />
      </TippedButton>
    </div>
  )
})
