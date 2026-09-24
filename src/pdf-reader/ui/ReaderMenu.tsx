// The reader's menu rows (the reader's design, §6.7): 30 px, an 8 px radius, the chosen one checked at its start, a hint
// at its end; the list's behaviour is the shared one (ui/menu-nav.ts). A listbox of options (a choice among values), or a
// menu of radios (the zoom) or of plain items (the download)
import { Check } from 'lucide'
import { Fragment, useState } from 'react'
import { useMenuNav } from '@/ui/menu-nav'
import { Icon } from './icons'

export interface ReaderItem { id: string; name: string; hint?: string; checked?: boolean; disabled?: boolean; keywords?: string; separatorBefore?: boolean }

export function ReaderMenu({ items, kind, label, search, noMatch, onPick, onClose }: {
  items: ReaderItem[]
  kind: 'listbox' | 'radios' | 'items'
  label: string
  /** a search field's placeholder, when the list has one */
  search?: string
  noMatch?: string
  onPick: (id: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = q ? items.filter(i => `${i.name} ${i.keywords ?? ''}`.toLowerCase().includes(q)) : items
  const nav = useMenuNav({ count: shown.length, initial: shown.findIndex(i => i.checked), isDisabled: i => !!shown[i]?.disabled, labelOf: i => shown[i]?.name ?? '', onPick: i => { const it = shown[i]; if (it && !it.disabled) onPick(it.id) }, onClose, typeahead: !search })
  const role = kind === 'listbox' ? 'option' : kind === 'radios' ? 'menuitemradio' : 'menuitem'
  return (
    // the role is the kind's, a listbox or a menu, each named; the list has the focus and takes the keys, naming the
    // active item (aria-activedescendant)
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: a listbox or a menu, named by its label
    // biome-ignore lint/a11y/noStaticElementInteractions: a listbox or a menu, whose keys these are
    <div role={kind === 'listbox' ? 'listbox' : 'menu'} aria-label={label} aria-activedescendant={nav.activeId} tabIndex={search ? -1 : 0} onKeyDown={nav.onKeyDown} className="outline-none" data-autofocus={search ? undefined : ''}>
      {search && (
        // the search takes the focus when the menu opens (Popover's data-autofocus)
        <input data-autofocus value={query} placeholder={search} aria-label={search} onKeyDown={nav.onKeyDown} onChange={e => { setQuery(e.target.value); nav.setActive(0) }} onInput={e => { setQuery((e.target as HTMLInputElement).value); nav.setActive(0) }} className="search" />
      )}
      {shown.length === 0 && noMatch && <p className="px-2.5 py-2 text-[12px] text-ink-2">{noMatch}</p>}
      {shown.map((item, index) => (
        <Fragment key={item.id}>
          {item.separatorBefore && <hr className="sep" />}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: the list's keys choose it (ui/menu-nav.ts) */}
          {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: an option, a menu radio or a menu item, by the list's kind */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: an option or a menu item, by the list's kind */}
          <div id={nav.idOf(index)} tabIndex={-1} role={role} aria-selected={kind === 'listbox' ? !!item.checked : undefined} aria-checked={kind === 'radios' ? !!item.checked : undefined} aria-disabled={item.disabled || undefined}
            data-active={index === nav.active || undefined} onMouseEnter={() => nav.setActive(index)} onClick={() => { if (!item.disabled) onPick(item.id) }} className="item">
            {kind !== 'items' && <Icon node={Check} size={14} className={item.checked ? 'check' : 'check invisible'} />}
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            {item.hint && <span className="hint">{item.hint}</span>}
          </div>
        </Fragment>
      ))}
    </div>
  )
}
