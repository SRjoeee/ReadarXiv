// The display switch (the reader's design, §6.2): three equal 40 px segments in a well, whatever the interface's
// language, the chosen one on a lifted thumb that slides; icons, the words in tooltips and to screen readers. A single
// choice, so a radio group: arrows move the choice (a display that cannot be had skipped), and 1, 2, 3 choose anywhere on
// the page outside a text field
import { useEffect, useRef } from 'react'
import { R } from '@/ui/strings'
import type { Display } from '../controller'
import { DisplayIcon } from './icons'
import { radioKeys } from './radio'
import { useTip } from './tip'

const ORDER: readonly Display[] = ['original', 'bilingual', 'translation']
/** a key typed where text goes is the text's, and one in a menu or a dialog is theirs (a menu goes to the item a digit
 *  begins: the zoom's 100 %) */
const theirs = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || !!t.closest('[role="menu"], [role="listbox"], [role="dialog"]'))

export function DisplaySwitch({ value, translatable, onChange }: { value: Display; translatable: boolean; onChange: (display: Display) => void }) {
  const can = (d: Display) => d === 'original' || translatable
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const choose = (d: Display) => {
    if (!can(d) || d === value) return
    onChange(d)
  }
  const onKey = radioKeys(ORDER, value, can, d => choose(d), i => buttons.current[i]?.focus())
  // 1, 2, 3 anywhere on the page, outside a text field, a menu or a dialog, without a modifier (⌘1 is the browser's),
  // and when nothing took the key before
  const latest = useRef(choose)
  latest.current = choose
  useEffect(() => {
    const onDoc = (e: globalThis.KeyboardEvent) => {
      const n = ['1', '2', '3'].indexOf(e.key)
      if (n < 0 || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || theirs(e.target)) return
      latest.current(ORDER[n]!)
    }
    document.addEventListener('keydown', onDoc)
    return () => document.removeEventListener('keydown', onDoc)
  }, [])
  const names: Record<Display, string> = { original: R.display.original, bilingual: R.display.bilingual, translation: R.display.translation }
  return (
    <div role="radiogroup" aria-label={R.display.name} className="seg display" style={{ '--i': ORDER.indexOf(value) } as React.CSSProperties} onKeyDown={onKey}>
      <span className="thumb" aria-hidden="true" />
      {ORDER.map((d, i) => (
        <Segment key={d} display={d} name={names[d]} hint={String(i + 1)} checked={d === value} disabled={!can(d)} onPick={() => choose(d)} buttonRef={el => { buttons.current[i] = el }} />
      ))}
    </div>
  )
}

function Segment({ display, name, hint, checked, disabled, onPick, buttonRef }: { display: Display; name: string; hint: string; checked: boolean; disabled: boolean; onPick: () => void; buttonRef: (el: HTMLButtonElement | null) => void }) {
  const { props, tip } = useTip(name, hint)
  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: an ARIA radio drawn as a segment with an icon (the design, §6.2); its keys are the group's, above */}
      <button ref={buttonRef} type="button" role="radio" aria-checked={checked} aria-disabled={disabled || undefined} aria-label={name} tabIndex={checked ? 0 : -1} onClick={onPick} {...props}>
        <DisplayIcon display={display} />
      </button>
      {tip}
    </>
  )
}
