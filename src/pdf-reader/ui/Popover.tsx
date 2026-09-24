// The reader's popovers (the reader's design, §6.7): anchored under their button, 6 px below it, kept within the window
// (position-try); they grow from the button. The browser's own light-dismiss popover: its button opens and closes it
// (popovertarget), Escape and a press outside close it; the focus comes back to the button when it closes with the
// focus inside. Its contents are drawn only while it is open
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'

export function usePopover(kind: 'menu' | 'listbox' | 'dialog') {
  const raw = useId().replace(/[^\w-]/g, '')
  const id = `pop-${raw}`, anchor = `--pop-${raw}`
  const [open, setOpen] = useState(false)
  return {
    open,
    anchor,
    trigger: { popoverTarget: id, 'aria-haspopup': kind, 'aria-expanded': open } as const,
    popover: { id, anchor, open, onOpenChange: setOpen },
  }
}

export function Popover({ id, anchor, open, onOpenChange, role, label, onClosed, className = '', children }: {
  id: string
  anchor: string
  open: boolean
  onOpenChange: (open: boolean) => void
  role: 'menu' | 'listbox' | 'dialog'
  label: string
  onClosed?: () => void
  className?: string
  children?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onToggle = (e: Event) => {
      const now = (e as Event & { newState?: string }).newState === 'open'
      onOpenChange(now)
      if (now) return
      if (el.contains(document.activeElement) || document.activeElement === document.body) document.querySelector<HTMLElement>(`[popovertarget="${id}"]`)?.focus()
      onClosed?.()
    }
    el.addEventListener('toggle', onToggle)
    return () => el.removeEventListener('toggle', onToggle)
  }, [id, onOpenChange, onClosed])
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role is the caller's, a menu, a listbox or a dialog, each named by its label
    <div ref={ref} id={id} popover="auto" role={role} aria-label={label} className={`pop chrome ${className}`} style={{ positionAnchor: anchor } as React.CSSProperties}>
      {open && children}
    </div>
  )
}
