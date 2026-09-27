// Deleting is undone, not confirmed (the redesign's design, §6.2): the row gives way to O.undo's line and button for 5 s,
// coming in with §8's row motion. It takes the focus when the deletion was the keyboard's, so that Enter undoes it; the
// owner decides where the focus goes when it expires
import { useEffect, useRef } from 'react'
import { Button } from '@/ui/controls/Button'
import { O } from '@/ui/strings'

export const UNDO_MS = 5000

export function UndoRow({ name, onUndo, onExpire, level = 0, focus = false }: { name: string; onUndo: () => void; onExpire: () => void; level?: 0 | 1; focus?: boolean }) {
  const button = useRef<HTMLButtonElement>(null)
  // the latest owner's callback, read when the timer fires: the timer itself starts once
  const expire = useRef(onExpire)
  expire.current = onExpire
  useEffect(() => {
    if (focus) button.current?.focus()
    const timer = setTimeout(() => expire.current(), UNDO_MS)
    return () => clearTimeout(timer)
  }, [focus])
  return (
    <div className="o-row" data-srow="" data-undo="" data-arriving="" data-level={level || undefined} role="status">
      <span data-part="words" className="o-words"><span className="o-label">{O.undo.deleted(name)}</span></span>
      <span data-part="trail" className="o-trail">
        <Button type="button" kind="neutral" size="sm" ref={button} onClick={onUndo}>{O.undo.undo}</Button>
      </span>
    </div>
  )
}
