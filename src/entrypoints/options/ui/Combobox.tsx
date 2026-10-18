// The model field (the redesign's design, §6.3): a combobox over the endpoint's models, searchable, a name typed when the
// list cannot be had. The list opens under the field in the form's flow (settings-2), pushing the fields below down
// rather than covering them. The field keeps the focus: the arrows move the active option (aria-activedescendant),
// Enter takes it, Escape closes; a press takes one without taking the focus. With no list yet, a press on the field —
// or the arrow down — is the gesture the form asks for the endpoint's origin on (`onOpen`)
import { type InputHTMLAttributes, type Ref, useId, useState } from 'react'
import { TextInput } from '@/ui/controls/Field'
import { useMenuNav } from '@/ui/menu-nav'

export interface ComboOption { id: string; name?: string }

export function Combobox({ value, onValue, options, busy = false, noMatch, onOpen, ref, ...input }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onValue: (text: string, option?: ComboOption) => void
  options: readonly ComboOption[] | null
  busy?: boolean
  noMatch: string
  onOpen?: () => void
  ref?: Ref<HTMLInputElement>
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const q = value.trim().toLowerCase()
  const shown = (options ?? []).filter(o => !q || `${o.id} ${o.name ?? ''}`.toLowerCase().includes(q))
  const pick = (o: ComboOption) => {
    onValue(o.id, o)
    setOpen(false)
  }
  const nav = useMenuNav({
    count: shown.length, initial: 0, isDisabled: () => false, labelOf: i => shown[i]?.id ?? '', typeahead: false,
    onPick: i => { const o = shown[i]; if (o) pick(o) }, onClose: () => setOpen(false),
  })
  const expanded = open && options !== null
  return (
    <div className="o-combo">
      <TextInput {...input} ref={ref} role="combobox" aria-expanded={expanded} aria-controls={listId} aria-autocomplete="list" aria-busy={busy || undefined}
        aria-activedescendant={expanded && shown.length ? nav.activeId : undefined} autoComplete="off" spellCheck={false} value={value}
        onChange={e => { onValue(e.target.value); setOpen(true); nav.setActive(0) }}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onPointerDown={() => { if (options === null) onOpen?.() }}
        onKeyDown={e => {
          if (options === null) { if (e.key === 'ArrowDown') { e.preventDefault(); onOpen?.() } return }
          if (!expanded) { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true) } return }
          if (e.key === 'Enter' && !shown.length) return
          nav.onKeyDown(e)
        }} />
      {expanded && (
        <div id={listId} role="listbox" className="o-combo-list">
          {shown.map((o, i) => (
            // the field's keys choose (aria-activedescendant); the option itself is never tabbed to, only pointed at
            <div key={o.id} id={nav.idOf(i)} tabIndex={-1} role="option" aria-selected={i === nav.active} data-active={i === nav.active || undefined} className="o-combo-item"
              onPointerDown={e => { e.preventDefault(); pick(o) }} onMouseEnter={() => nav.setActive(i)}>
              <span>{o.name ?? o.id}</span>
              {o.name && <small>{o.id}</small>}
            </div>
          ))}
          {!shown.length && <div role="option" tabIndex={-1} aria-selected={false} aria-disabled="true" className="o-combo-item" data-empty="">{noMatch}</div>}
        </div>
      )}
    </div>
  )
}
