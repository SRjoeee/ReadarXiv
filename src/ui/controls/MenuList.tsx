// A menu's rows (the reader's design, §6.7; the redesign's design, §5.3): 30 px, an 8 px radius, the chosen one checked
// at its start, a hint at its end; the list's behaviour is the shared one (ui/menu-nav.ts). A listbox of options (a
// choice among values), or a menu of radios (the zoom) or of plain items (the download). Moved from the reader
// (pdf-reader/ui/ReaderMenu.tsx) for the extension's pages, which add these and change no row the reader draws: two
// lines, each hint under its name (the service menu); a neutral button in a row, which picking the row presses (the
// Chrome pack's download), a loader turning while it runs; a sample drawn in a style at a row's end (the style menu);
// the last row, which leads to managing the list, never chosen, a separator before it; and the language of a row's
// own words, so that a language's own name or a sample in another script is read and drawn as that language
import { Check, Loader } from 'lucide'
import { type CSSProperties, Fragment, useId, useState } from 'react'
import { useMenuNav } from '@/ui/menu-nav'
import { Icon } from './Icon'

export interface MenuListItem {
  id: string
  name: string
  hint?: string
  checked?: boolean
  disabled?: boolean
  keywords?: string
  separatorBefore?: boolean
  /** the language of the row's own words: its name, or the sample in a row with a `preview` (whose name is the interface's) */
  lang?: string
  /** a button in the row (the Chrome pack's download): picking the row presses it, disabled or not; `busy`, a loader instead, and nothing to press */
  action?: { label: string; busy?: boolean }
  /** the hint drawn as a sample in this style at the row's end (the style menu): a picture of the style, hidden from assistive technology */
  preview?: CSSProperties
  /** the last row, which leads to managing the list: never chosen, a separator before it */
  manage?: true
}

export function MenuList({ items, kind, label, layout = 'inline', search, noMatch, onPick, onAction, onClose }: {
  items: MenuListItem[]
  kind: 'listbox' | 'radios' | 'items'
  label: string
  /** `two-line`: each hint under its name, the row at least 40 px; a row with no hint keeps one line */
  layout?: 'inline' | 'two-line'
  /** a search field's placeholder, when the list has one */
  search?: string
  noMatch?: string
  onPick: (id: string) => void
  /** a row with an action picked: its button's press (never a choice); needed wherever an item has an `action` */
  onAction?: (id: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = q ? items.filter(i => `${i.name} ${i.keywords ?? ''}`.toLowerCase().includes(q)) : items
  /** a row with an action is picked for its action, disabled or not, unless the action is already running; any other
   *  row is chosen, if it can be */
  const pick = (item: MenuListItem | undefined) => {
    if (!item) return
    if (item.action) {
      if (!item.action.busy) onAction?.(item.id)
      return
    }
    if (!item.disabled) onPick(item.id)
  }
  const nav = useMenuNav({ count: shown.length, initial: shown.findIndex(i => i.checked && !i.manage), isDisabled: i => !!shown[i]?.disabled && !shown[i]?.action, labelOf: i => shown[i]?.name ?? '', onPick: i => pick(shown[i]), onClose, typeahead: !search })
  const role = kind === 'listbox' ? 'option' : kind === 'radios' ? 'menuitemradio' : 'menuitem'
  const listId = `${useId()}-list`
  // the element with the focus takes the keys and names the active item (aria-activedescendant): the search field, a
  // combobox that controls the list, when there is one; else the list itself. Only that element handles them, or a
  // key would be handled twice as it bubbles (the final review: the arrows skipped every other language)
  const keys = { 'aria-activedescendant': nav.activeId, onKeyDown: nav.onKeyDown }
  return (
    <div className="outline-none">
      {search && (
        // the search takes the focus when the menu opens (Popover's data-autofocus)
        <input data-autofocus role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" {...keys} value={query} placeholder={search} aria-label={search} onChange={e => { setQuery(e.target.value); nav.setActive(0) }} onInput={e => { setQuery((e.target as HTMLInputElement).value); nav.setActive(0) }} className="search" />
      )}
      {shown.length === 0 && noMatch && <p className="px-2.5 py-2 text-[12px] text-ink-2">{noMatch}</p>}
      {/* a listbox of options or a menu of items, named, holding its items alone: a separator is drawn, not an item */}
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: a listbox or a menu, named by its label */}
      <div id={listId} role={kind === 'listbox' ? 'listbox' : 'menu'} aria-label={label} tabIndex={search ? undefined : 0} {...(search ? {} : keys)} className="outline-none" data-autofocus={search ? undefined : ''}>
        {shown.map((item, index) => {
          const checked = !!item.checked && !item.manage
          const two = layout === 'two-line' && !!item.hint && !item.preview
          return (
            <Fragment key={item.id}>
              {(item.separatorBefore || item.manage) && <hr role="none" className="sep" />}
              {/* a row that is disabled but has an action can still be operated (its action runs): aria-disabled would
                  tell assistive technology it is not, so only a row disabled with no action carries it; the other
                  gets `unavailable` instead, greyed the same way but clicked and keyed like any row (ruling 11) */}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: the list's keys choose it (ui/menu-nav.ts) */}
              {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: an option, a menu radio or a menu item, by the list's kind */}
              {/* biome-ignore lint/a11y/noStaticElementInteractions: an option or a menu item, by the list's kind */}
              <div id={nav.idOf(index)} tabIndex={-1} role={role} aria-selected={kind === 'listbox' ? checked : undefined} aria-checked={kind === 'radios' ? checked : undefined} aria-disabled={(item.disabled && !item.action) || undefined} aria-busy={item.action?.busy || undefined}
                data-active={index === nav.active || undefined} onMouseEnter={() => nav.setActive(index)} onClick={() => pick(item)} className={`item${two ? ' two' : ''}${item.manage ? ' manage' : ''}${item.disabled && item.action ? ' unavailable' : ''}`}>
                {kind !== 'items' && <Icon node={Check} size={14} className={checked ? 'check' : 'check invisible'} />}
                {two ? (
                  <span className="t">
                    <span lang={item.lang}>{item.name}</span>
                    <span className="sub">{item.hint}</span>
                  </span>
                ) : (
                  <span className={item.preview ? 'nm' : 'min-w-0 flex-1 truncate'} lang={item.preview ? undefined : item.lang}>{item.name}</span>
                )}
                {item.preview ? <span className="preview" aria-hidden="true" lang={item.lang} style={item.preview}>{item.hint}</span> : !two && item.hint && <span className="hint">{item.hint}</span>}
                {item.action && (item.action.busy ? <Icon node={Loader} size={14} className="spin" /> : <span className="act">{item.action.label}</span>)}
              </div>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
