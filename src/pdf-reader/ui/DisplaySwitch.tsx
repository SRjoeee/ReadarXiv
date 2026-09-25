// The display switch (the reader's design, §6.2): three equal 40 px segments in a well, whatever the interface's
// language, the chosen one on a lifted thumb that slides; icons, the words in tooltips and to screen readers. A single
// choice, so a radio group: arrows move the choice (a display that cannot be had skipped). No single key chooses one
// anywhere on the page: 1, 2 and 3 did, which a stray keystroke or a spoken word could set off (WCAG 2.1.4; the
// maintainer, 2026-09-26)
import { useRef } from 'react'
import { R } from '@/ui/strings'
import type { Display } from '../controller'
import { DisplayIcon } from './icons'
import { radioKeys } from './radio'
import { useTip } from './tip'

const ORDER: readonly Display[] = ['original', 'bilingual', 'translation']

export function DisplaySwitch({ value, translatable, onChange }: { value: Display; translatable: boolean; onChange: (display: Display) => void }) {
  const can = (d: Display) => d === 'original' || translatable
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const choose = (d: Display) => {
    if (!can(d) || d === value) return
    onChange(d)
  }
  const onKey = radioKeys(ORDER, value, can, d => choose(d), i => buttons.current[i]?.focus())
  const names: Record<Display, string> = { original: R.display.original, bilingual: R.display.bilingual, translation: R.display.translation }
  return (
    <div role="radiogroup" aria-label={R.display.name} className="seg display" style={{ '--i': ORDER.indexOf(value) } as React.CSSProperties} onKeyDown={onKey}>
      <span className="thumb" aria-hidden="true" />
      {ORDER.map((d, i) => (
        <Segment key={d} display={d} name={names[d]} checked={d === value} disabled={!can(d)} onPick={() => choose(d)} buttonRef={el => { buttons.current[i] = el }} />
      ))}
    </div>
  )
}

function Segment({ display, name, checked, disabled, onPick, buttonRef }: { display: Display; name: string; checked: boolean; disabled: boolean; onPick: () => void; buttonRef: (el: HTMLButtonElement | null) => void }) {
  const { props, tip } = useTip(name)
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
