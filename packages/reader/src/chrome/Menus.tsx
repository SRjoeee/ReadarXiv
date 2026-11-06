// The toolbar's menus (the reader's design, §6.1, §6.7): zoom and the target language (the translation service and the
// download are a host's: its slots, parts.tsx). Each is a toolbar control and its anchored popover; choosing closes it
import { ChevronDown } from 'lucide'
import { Icon, MenuList, Popover, R, S, shut, usePopover } from '@readarxiv/ui'
import type { ReaderController } from './model.ts'
import { useParts } from './parts.tsx'
import { useSettingsLock } from './settings-lock.ts'
import { ToolbarButton } from './ToolbarButton.tsx'
import { useReader } from './use-reader.ts'

const FITS = [
  ['page-width', () => R.zoom.width],
  ['page-fit', () => R.zoom.page],
  ['page-actual', () => R.zoom.actual],
] as const
const SCALES = [0.5, 0.75, 1, 1.25, 1.5, 2]

export function ZoomMenu({ controller }: { controller: ReaderController }) {
  const state = useReader(controller, (s) => ({ zoom: s.zoom, scale: s.scale }))
  const pop = usePopover('menu')
  const items = [
    ...FITS.map(([id, name]) => ({ id, name: name(), checked: state.zoom === id })),
    ...SCALES.map((s, i) => ({
      id: String(s),
      name: `${Math.round(s * 100)}%`,
      checked: state.zoom === s,
      separatorBefore: i === 0,
    })),
  ]
  return (
    <>
      <ToolbarButton
        label={R.zoom.value}
        value={`${Math.round(state.scale * 100)}%`}
        valueClassName="tabular-nums"
        valueWidest="000%"
        anchor={pop.anchor}
        {...pop.trigger}
        className="zoom-value"
      >
        <Icon node={ChevronDown} size={12} className="text-ink-3" />
      </ToolbarButton>
      <Popover {...pop.popover} role="menu" label={R.zoom.value}>
        <MenuList
          key={pop.generation}
          kind="radios"
          label={R.zoom.value}
          items={items}
          onClose={() => shut(pop.popover.id)}
          onPick={(id) => {
            controller.zoomTo(FITS.some(([f]) => f === id) ? (id as 'page-width') : Number(id))
            shut(pop.popover.id)
          }}
        />
      </Popover>
    </>
  )
}

/** `name`: the toolbar's menu and the reading options' each have one, so that the capsule's choose-language action can
 *  open either (usePopover, App.tsx). The button names the target as the menu's rows do, by its own name, whatever the
 *  interface's language: Japanese in Japanese, never in English (the maintainer, 2026-10-04). The name and the rows carry
 *  the language they are written in (`lang`) */
export function LanguageMenu({ controller, name }: { controller: ReaderController; name?: string }) {
  // before the settings land the defaults stand in the button's place, greyed, so that the bar does not reflow (S-R-21)
  const { languages, defaults } = useParts()
  const current = useReader(controller, (s) => (s.prefs ?? defaults).target)
  const lock = useSettingsLock(controller)
  const pop = usePopover('listbox', name)
  return (
    <>
      <ToolbarButton
        label={S.rows.language}
        value={current ? languages.name(current) : ''}
        valueLang={current ? languages.tag(current) : undefined}
        anchor={pop.anchor}
        disabled={lock.locked}
        why={lock.why}
        {...(lock.locked ? {} : pop.trigger)}
        className="menu-btn"
      >
        <Icon node={ChevronDown} size={12} className="text-ink-3" />
      </ToolbarButton>
      {!lock.locked && (
        <Popover {...pop.popover} role="listbox" label={S.rows.language}>
          <MenuList
            key={pop.generation}
            kind="listbox"
            label={S.rows.language}
            search={S.menu.searchLanguages}
            noMatch={S.menu.noMatch}
            items={languages.items(current).map((i) => ({ ...i, checked: i.selected, lang: languages.tag(i.id) }))}
            onClose={() => shut(pop.popover.id)}
            onPick={(code) => {
              controller.setPrefs({ target: code })
              shut(pop.popover.id)
            }}
          />
        </Popover>
      )}
    </>
  )
}
