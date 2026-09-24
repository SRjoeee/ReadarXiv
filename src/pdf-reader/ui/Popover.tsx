// The reader's popovers (the reader's design, §6.7): anchored under their button, 6 px below it, kept within the window
// (position-try); they grow from the button. The browser's own light-dismiss popover: its button opens and closes it
// (popovertarget), Escape and a press outside close it; the focus comes back to the button when it closes with the
// focus inside. Its contents are drawn from the start, so that it never shows empty for a frame and a key pressed as it
// opens is not lost; opening puts the focus on its [data-autofocus] element, and a menu's contents start afresh after each
// close (their key, `generation`)
import { type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

/** `name`: a fixed id for a popover another part of the page opens (the capsule's choose-language action); one per page */
export function usePopover(kind: 'menu' | 'listbox' | 'dialog', name?: string) {
  const auto = useId()
  const raw = name ?? auto.replace(/[^\w-]/g, '')
  const id = `pop-${raw}`, anchor = `--pop-${raw}`
  const [open, setOpen] = useState(false)
  /** counts the closes: a key for contents that start afresh each time (a search, the active item) */
  const [generation, setGeneration] = useState(0)
  const onOpenChange = useCallback((now: boolean) => {
    setOpen(now)
    if (!now) setGeneration(g => g + 1)
  }, [])
  return {
    open,
    anchor,
    generation,
    trigger: { popoverTarget: id, 'aria-haspopup': kind, 'aria-expanded': open } as const,
    popover: { id, anchor, onOpenChange },
  }
}

export function Popover({ id, anchor, onOpenChange, role, label, onClosed, className = '', children }: {
  id: string
  anchor: string
  onOpenChange: (open: boolean) => void
  role: 'menu' | 'listbox' | 'dialog'
  label: string
  onClosed?: () => void
  className?: string
  children?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  // the element to focus carries the HTML autofocus attribute, which the browser's popover honours as it shows, in the
  // same step: a key pressed at once goes to it (React's autoFocus writes no attribute). Set again as contents start afresh
  useLayoutEffect(() => {
    for (const el of ref.current?.querySelectorAll('[data-autofocus]:not([autofocus])') ?? []) el.setAttribute('autofocus', '')
  })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onToggle = (e: Event) => {
      const now = (e as Event & { newState?: string }).newState === 'open'
      onOpenChange(now)
      if (now) {
        // where the browser did not already (a popover shown by script in a test page)
        const target = el.querySelector<HTMLElement>('[data-autofocus]')
        if (target && document.activeElement !== target) target.focus()
        return
      }
      if (el.contains(document.activeElement) || document.activeElement === document.body) document.querySelector<HTMLElement>(`[popovertarget="${id}"]`)?.focus()
      onClosed?.()
    }
    el.addEventListener('toggle', onToggle)
    return () => el.removeEventListener('toggle', onToggle)
  }, [id, onOpenChange, onClosed])
  // a dialog is the popover itself; a menu or a list is the element inside it, which carries the role and the name, so
  // that there is one menu and not a menu in a menu (the final review)
  const dialog = role === 'dialog'
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: a dialog, named by its label; nothing for a menu or a list
    <div ref={ref} id={id} popover="auto" role={dialog ? 'dialog' : undefined} aria-label={dialog ? label : undefined} className={`pop chrome ${className}`} style={{ positionAnchor: anchor } as React.CSSProperties}>
      {children}
    </div>
  )
}
