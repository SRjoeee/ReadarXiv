// The popup's menus (the redesign's design, §5.3): the shared popover and menu list, opened by a row of the group or by
// the style button of the foot. The browser's popover opens and shuts them, gives the focus back and dismisses them on a
// press elsewhere; the view model says which is open (the popup's state), so that a pick, the gallery and the tests can
// open or shut one too, and the two are kept in step here. A menu below its row makes the popup tall enough to hold it,
// the style menu opens above the foot (menu-fit.ts); the rows inside are drawn from the frame after the first
import { ChevronDown } from 'lucide'
import { type CSSProperties, useCallback, useEffect, useRef } from 'react'
import { Icon } from '@/ui/controls/Icon'
import { MenuList } from '@/ui/controls/MenuList'
import { Popover, usePopover } from '@/ui/controls/Popover'
import { useTip } from '@/ui/controls/tip'
import { S } from '@/ui/strings'
import type { PopupActions } from '../data'
import type { MenuKind, MenuView, Row } from '../view-model'
import { fitMenu } from './menu-fit'
import { usePainted } from './painted'

type MenuActions = Pick<PopupActions, 'openMenu' | 'closeMenu'>

/** Two anchor names on one element take one declaration: a second would replace the first (its menu's and its tooltip's) */
export const anchors = (...names: string[]): CSSProperties => ({ anchorName: names.join(', ') }) as CSSProperties
const tipAnchor = (tip: ReturnType<typeof useTip>) => String((tip.props.style as { anchorName?: string }).anchorName)

function useMenu(kind: MenuKind, open: boolean, actions: MenuActions, up: boolean) {
  const pop = usePopover('listbox')
  const trigger = useRef<HTMLButtonElement>(null)
  /** whether the browser has it open, as its last toggle said */
  const shown = useRef(false)
  const unfit = useRef<(() => void) | null>(null)
  const painted = usePainted()
  const { id, onOpenChange: own } = pop.popover
  const onOpenChange = useCallback((now: boolean) => {
    own(now)
    shown.current = now
    unfit.current?.()
    unfit.current = null
    const menu = document.getElementById(id)
    const button = trigger.current
    const root = button?.closest<HTMLElement>('.popup')
    if (now && menu && button && root) unfit.current = fitMenu(root, button, menu, up)
    if (now) actions.openMenu(kind)
    else actions.closeMenu(kind)
  }, [own, id, up, kind, actions])
  // the view model's word, as it changes: a pick shuts the menu, a fixture opens one. A press, Escape and a light dismiss
  // are the browser's, and reach the view model through onOpenChange, after which there is nothing here to do
  useEffect(() => {
    if (!painted || open === shown.current) return
    const menu = document.getElementById(id)
    try {
      if (open) menu?.showPopover()
      else menu?.hidePopover()
    } catch {} // shown or hidden already, its toggle not yet heard
  }, [open, painted, id])
  return { pop: { ...pop, popover: { ...pop.popover, onOpenChange } }, trigger, painted }
}

function MenuPopover({ kind, menu, up, pop, painted, onPick, onAction, onClose }: {
  kind: MenuKind
  menu: MenuView
  up: boolean
  pop: ReturnType<typeof useMenu>['pop']
  painted: boolean
  onPick: (id: string) => void
  onAction?: (id: string) => void
  onClose: () => void
}) {
  return (
    <Popover {...pop.popover} role="listbox" label={menu.label} className={['menu', up && 'up', menu.search && 'searching'].filter(Boolean).join(' ')}>
      {painted && (
        <MenuList
          key={pop.generation}
          kind="listbox"
          label={menu.label}
          items={menu.items}
          // the services: a name over its hint (§5.3)
          layout={kind === 'service' ? 'two-line' : 'inline'}
          search={menu.search ? S.menu.searchLanguages : undefined}
          noMatch={menu.search ? S.menu.noMatch : undefined}
          onPick={onPick}
          onAction={onAction}
          onClose={onClose}
        />
      )}
    </Popover>
  )
}

/** A row of the group (§5.1): its label leading, its value trailing with a chevron; a value cut short shows whole in its tooltip */
export function MenuRow({ kind, label, row, menu, open, actions, onPick, onAction }: {
  kind: MenuKind
  label: string
  row: Row
  /** null before the settings are read: a row with nothing to open */
  menu: MenuView | null
  open: boolean
  actions: MenuActions
  onPick: (id: string) => void
  onAction?: (id: string) => void
}) {
  const { pop, trigger, painted } = useMenu(kind, open, actions, false)
  const tip = useTip(row.replaced ? `${row.value} · ${row.replaced}` : row.value)
  const value = useRef<HTMLSpanElement>(null)
  /** the value cut short: its tooltip only then, or it would repeat what shows */
  const cut = () => { const el = value.current; return el !== null && el.scrollWidth > el.clientWidth }
  const words = (
    <>
      <span className="k">{label}</span>
      <span className="v">
        <span ref={value}>{row.value}{row.replaced && <> <s>{row.replaced}</s></>}</span>
        <Icon node={ChevronDown} size={14} />
      </span>
    </>
  )
  if (!menu) return <div className="group-row">{words}</div>
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="group-row"
        {...pop.trigger}
        style={anchors(pop.anchor, tipAnchor(tip))}
        onPointerEnter={() => { if (cut()) tip.props.onPointerEnter() }}
        onPointerLeave={tip.props.onPointerLeave}
        onPointerDown={tip.props.onPointerDown}
        onFocus={e => { if (cut()) tip.props.onFocus(e) }}
        onBlur={tip.props.onBlur}
      >
        {words}
      </button>
      {tip.tip}
      <MenuPopover kind={kind} menu={menu} up={false} pop={pop} painted={painted} onPick={onPick} onAction={onAction} onClose={() => actions.closeMenu(kind)} />
    </>
  )
}

/** The foot's way to the styles (§5.1): its words and a chevron, the chosen style in its tooltip; its menu opens upward */
export function StyleButton({ value, menu, open, actions, onPick }: { value: string; menu: MenuView; open: boolean; actions: MenuActions; onPick: (id: string) => void }) {
  const { pop, trigger, painted } = useMenu('style', open, actions, true)
  const tip = useTip(value)
  return (
    <>
      <button ref={trigger} type="button" className="tbtn style-btn" {...pop.trigger} {...tip.props} style={anchors(pop.anchor, tipAnchor(tip))}>
        {S.rows.style}
        <Icon node={ChevronDown} size={14} />
      </button>
      {tip.tip}
      <MenuPopover kind="style" menu={menu} up pop={pop} painted={painted} onPick={onPick} onClose={() => actions.closeMenu('style')} />
    </>
  )
}
