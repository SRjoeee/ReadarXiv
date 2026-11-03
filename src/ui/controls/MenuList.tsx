// A menu's rows (the reader's design, §6.7; the redesign's design, §5.3; UI.md §4): 30 px, an 8 px radius, the name at
// the row's start, a hint after it and the chosen one's check at the row's very end, in a slot every row of a choice
// keeps, so that a new choice moves nothing else (the maintainer, 2026-10-25); the list's behaviour is the shared one
// (ui/menu-nav.ts). A listbox of options (a choice among values), or a menu of radios (the zoom) or of plain items (the
// download). Moved from the reader
// (pdf-reader/ui/ReaderMenu.tsx) for the extension's pages, which add these and change no row the reader draws: two
// lines, each hint under its name (the service menu); a neutral button in a row, which picking the row presses (the
// Chrome pack's download), a loader turning while it runs; a sample drawn in a style at a row's end (the style menu);
// the last row, which leads to managing the list, never chosen, a separator before it; and the language of a row's
// own words, so that a language's own name or a sample in another script is read and drawn as that language. The active
// row stays in view as it moves and as the list opens (the retired popup menu did; Part 7's final review). A search
// field takes the focus as its menu opens, but not under a finger, where it would raise the on-screen keyboard over the
// list (`touchFirst`)
import { Check, Loader } from 'lucide'
import { type CSSProperties, Fragment, type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useMenuNav } from '@/ui/menu-nav'
import { Icon } from './Icon'

/**
 * A row brought into view inside the scroll boxes between it and `stop` (its popover): the list under a search field,
 * capped at five rows and a half on the popup and the settings page (ui.css), the popover itself past its height (the
 * reader's lists, and any other). `scrollIntoView`'s "nearest" — a row already in view stays where
 * it is, one out of view comes to the nearer edge — confined to those boxes: `scrollIntoView` also scrolls every ancestor
 * (the settings page, the popup's body), and its `container` option is newer than Chrome 131, the floor.
 *
 * The distances are read off the drawing and counted in the layout: a rect carries every scroll between the row and the
 * box, but also the popover's scale while it grows in (pop-in, from 0.97), which `scrollTop` does not count — read as
 * they were, the scroll as a list opened fell short and left its chosen row below the box (Task 110c). So each is
 * divided by the box's drawn height over its layout height, 1 once the popover is still. Offsets would ignore the scale,
 * but Chrome's `offsetTop` ignores every scroll too, so the popover's distance to a row in the scrolled list would have
 * to be rebuilt from each scroller between them
 */
function reveal(row: Element | null | undefined, stop: Element) {
  if (!row) return
  for (let box = row.parentElement; box; box = box.parentElement) {
    if (box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY)) {
      const r = row.getBoundingClientRect()
      const b = box.getBoundingClientRect()
      /** drawn pixels to a layout pixel */
      const k = b.height > 0 && box.offsetHeight > 0 ? b.height / box.offsetHeight : 1
      const top = b.top + box.clientTop * k
      const bottom = top + box.clientHeight * k
      if (r.top < top) box.scrollTop -= (top - r.top) / k
      else if (r.bottom > bottom) box.scrollTop += Math.min(r.bottom - bottom, r.top - top) / k
    }
    if (box === stop) return
  }
}

/**
 * Whether the primary pointer is a finger (a phone, a tablet), followed as it changes: there a search field that takes the
 * focus as the menu opens raises the on-screen keyboard over half the list, so the list takes it instead, as a menu
 * with no search does, and the field waits for a tap (the owner, 2026-11-03: the search stays, no keyboard on opening).
 * The primary pointer, `(pointer: coarse)`, and not `(any-hover: none)` or `(any-pointer: coarse)`: those answer for
 * every input the device has, so a phone with a stylus that hovers (an S Pen) or a paired mouse reads as able to hover
 * and would get the keyboard, and a laptop with a touch screen, whose keyboard is in front of it, would lose the focus
 * its typing needs. Nor `(hover: none)` with it: it adds nothing to the question of a keyboard, and lets through a phone
 * that reports a hover it does not have. Followed, not read once: a tablet given a trackpad, or a laptop folded into a
 * tablet, answers at the next opening
 */
const COARSE = '(pointer: coarse)'
const touchFirst = () => globalThis.matchMedia?.(COARSE).matches ?? false
const onPointerChange = (changed: () => void) => {
  const query = globalThis.matchMedia?.(COARSE)
  query?.addEventListener('change', changed)
  return () => query?.removeEventListener('change', changed)
}

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
  /** the list holds the focus as the menu opens: always without a search field, and with one under a finger */
  const listFocus = useSyncExternalStore(onPointerChange, touchFirst, () => false) || !search
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
  const root = useRef<HTMLDivElement>(null)
  // the active row in view as it moves, and as a search makes the first row active; a list drawn while its popover is
  // hidden has no layout to scroll, so the row is brought into view again as the popover opens
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new active row or a new query is what asks for the scroll
  useLayoutEffect(() => {
    const el = root.current
    if (el) reveal(el.querySelector('[data-active]'), el.closest('[popover]') ?? el)
  }, [nav.active, q])
  // the browser focuses what carries `autofocus` as the popover shows, which Popover writes once on what carries
  // data-autofocus: moved here with it when the pointer changes while the menu stays drawn, so that one element holds it
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new holder of the focus, which the markup says, is what asks for the move
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    for (const target of el.querySelectorAll('[autofocus]:not([data-autofocus])')) target.removeAttribute('autofocus')
    for (const target of el.querySelectorAll('[data-autofocus]:not([autofocus])')) target.setAttribute('autofocus', '')
  }, [listFocus])
  useEffect(() => {
    const el = root.current
    const popover = el?.closest('[popover]')
    if (!el || !popover) return
    const onToggle = (e: Event) => { if ((e as Event & { newState?: string }).newState === 'open') reveal(el.querySelector('[data-active]'), popover) }
    popover.addEventListener('toggle', onToggle)
    return () => popover.removeEventListener('toggle', onToggle)
  }, [])
  // the element with the focus takes the keys and names the active item (aria-activedescendant): the search field, a
  // combobox that controls the list, when there is one; the list itself when there is none, or when it takes the
  // focus as the menu opens under a finger. Only those elements handle them, neither inside the other, or a key would
  // be handled twice as it bubbles (the final review: the arrows skipped every other language)
  const keys = { 'aria-activedescendant': nav.activeId, onKeyDown: nav.onKeyDown }
  // the list holding the focus over a search field (under a finger, with a keyboard attached): a letter typed there is
  // the search's, so it moves into the field and goes on the end of the query, as the field would have taken it had it
  // had the focus (a query typed before the list took the focus back is kept, never replaced)
  const field = useRef<HTMLInputElement>(null)
  const listKeys = !search ? keys : {
    ...keys,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key.length === 1 && e.key !== ' ' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        const typed = e.key
        setQuery(q => q + typed)
        nav.setActive(0)
        field.current?.focus()
        return
      }
      nav.onKeyDown(e)
    },
  }
  return (
    <div ref={root} className="outline-none">
      {search && (
        // the search takes the focus when the menu opens (Popover's data-autofocus), unless the list does
        <input ref={field} data-autofocus={listFocus ? undefined : ''} role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" {...keys} value={query} placeholder={search} aria-label={search} onChange={e => { setQuery(e.target.value); nav.setActive(0) }} onInput={e => { setQuery((e.target as HTMLInputElement).value); nav.setActive(0) }} className="search" />
      )}
      {shown.length === 0 && noMatch && <p className="px-2.5 py-2 text-[12px] text-ink-2">{noMatch}</p>}
      {/* a listbox of options or a menu of items, named, holding its items alone: a separator is drawn, not an item */}
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: a listbox or a menu, named by its label */}
      <div id={listId} role={kind === 'listbox' ? 'listbox' : 'menu'} aria-label={label} tabIndex={listFocus ? 0 : undefined} {...(listFocus ? listKeys : {})} className="outline-none" data-autofocus={listFocus ? '' : undefined}>
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
                {/* the check's slot, last: after the hint, the sample and the action, which a chosen row can hold too (the Chrome
                    row, chosen while its pack downloads, P10); drawn unseen on every other row of a choice */}
                {kind !== 'items' && <Icon node={Check} size={14} className={checked ? 'check' : 'check invisible'} />}
              </div>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
