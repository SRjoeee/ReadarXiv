// Tooltips (the reader's design, §6.1, §13): one line always; after 500 ms of hover, at once on keyboard focus, never on a
// press; a shortcut or a second thought in a lighter span. A hint popover (it closes no menu) anchored to its control by
// CSS anchor positioning, below it and kept inside the window by position-try (reader.css .tip), so nothing is measured.
// Its words are the control's name already, so the tip is hidden from assistive technology
import { type CSSProperties, type FocusEvent, type ReactNode, useId, useRef } from 'react'

export interface Tip {
  props: { style: CSSProperties; onPointerEnter(): void; onPointerLeave(): void; onPointerDown(): void; onFocus(e: FocusEvent): void; onBlur(): void }
  tip: ReactNode
}

export function useTip(label: string, hint?: string, { side = 'bottom' }: { side?: 'bottom' | 'right' } = {}): Tip {
  const name = `--tip-${useId().replace(/[^\w-]/g, '')}`
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef(0)
  /** the pointer pressed the control: the focus that follows is not the keyboard's */
  const pressed = useRef(false)
  const open = useRef(false)
  const show = () => {
    // no tip over an open menu or popover — but one inside it, as the appearance's icons in the reading options, shows
    const over = [...document.querySelectorAll('.pop[data-open], .pop:popover-open')].some(p => !p.contains(ref.current))
    if (open.current || over) return
    // a tip never breaks the page: shown while another popover is being shown, the browser refuses it, and it is not shown
    try {
      ref.current?.showPopover()
      open.current = true
    } catch {}
  }
  const hide = () => {
    clearTimeout(timer.current)
    try {
      if (open.current) ref.current?.hidePopover()
    } catch {}
    open.current = false
  }
  return {
    props: {
      style: { anchorName: name } as CSSProperties,
      onPointerEnter: () => { clearTimeout(timer.current); timer.current = window.setTimeout(show, 500) },
      onPointerLeave: hide,
      onPointerDown: () => { pressed.current = true; hide() },
      // the keyboard's focus alone: the focus a closing menu gives back to its button after a click is no reason for a tip
      onFocus: e => { if (!pressed.current && (e.currentTarget as HTMLElement).matches(':focus-visible')) show() },
      onBlur: () => { pressed.current = false; hide() },
    },
    tip: (
      <div ref={ref} popover="hint" aria-hidden="true" className="tip" data-side={side} style={{ positionAnchor: name } as CSSProperties}>
        <span>{label}</span>
        {hint && <kbd>{hint}</kbd>}
      </div>
    ),
  }
}
