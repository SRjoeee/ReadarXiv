// Clearing what cannot be undone is confirmed in place (the redesign's design, §6.6): a neutral button (O.data.clear)
// turns into its confirmation (O.data.clearConfirm) with a trash icon, its words in danger on the destructive button's ground (4.83:1 light, 5.01:1 dark);
// untouched for 3 s it turns back — not while the pointer rests on it or the keyboard is on it — and Escape turns it back
// at once, wherever the focus is (R82). Done, the owner's words stand in its place with the success icon arriving
import { CircleCheck, Trash2 } from 'lucide'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/ui/controls/Button'
import { Icon } from '@/ui/controls/Icon'

export const DISARM_MS = 3000

export function ConfirmButton({ label, confirmLabel, doneLabel, done = false, onConfirm }: { label: string; confirmLabel: string; doneLabel?: string; done?: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false)
  /** the pointer rests on it, or the keyboard's focus is on it: it waits */
  const held = useRef({ pointer: false, keyboard: false })
  const timer = useRef(0)
  const wait = () => {
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      if (held.current.pointer || held.current.keyboard) wait()
      else setArmed(false)
    }, DISARM_MS)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  // Escape is the way out of a question that has been asked: heard on the document while one is, so that it works with
  // the pointer resting on the button as with the keyboard on it
  useEffect(() => {
    if (!armed) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      clearTimeout(timer.current)
      setArmed(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [armed])
  if (done && doneLabel) {
    return <span className="o-status" data-tone="ok"><Icon node={CircleCheck} size={14} className="o-arrive" />{doneLabel}</span>
  }
  return (
    <Button type="button" kind="neutral" size="sm" className="o-confirm" data-armed={armed ? '' : undefined} icon={armed ? Trash2 : undefined}
      onPointerOver={() => { held.current.pointer = true }} onPointerOut={() => { held.current.pointer = false }}
      // the pointer's focus does not hold it (trackModality marks the pointer's turn): a click leaves the focus here
      onFocus={() => { held.current.keyboard = !document.documentElement.hasAttribute('data-axt-pointer') }}
      onBlur={() => { held.current.keyboard = false }}
      onClick={() => {
        if (!armed) {
          setArmed(true)
          wait()
          return
        }
        clearTimeout(timer.current)
        setArmed(false)
        onConfirm()
      }}>
      {armed ? confirmLabel : label}
    </Button>
  )
}
