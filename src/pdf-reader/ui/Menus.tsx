// The toolbar's menus (the reader's design, §6.1, §6.7): zoom, the target language, the translation service, the
// download. Each is a toolbar control and its anchored popover; choosing closes it
import { ChevronDown, Download } from 'lucide'
import { browser } from 'wxt/browser'
import type { LangCode } from '@/config/languages'
import { MANAGE_SERVICES, serviceItems } from '@/ui/service-items'
import { R, S, languageName, serviceName } from '@/ui/strings'
import type { ReaderController } from '../controller'
import { Icon } from './icons'
import { languageItems } from './languages'
import { Popover, usePopover } from './Popover'
import { ReaderMenu } from './ReaderMenu'
import { ToolbarButton } from './ToolbarButton'
import { useReader } from './use-reader'

const FITS = [['page-width', () => R.zoom.width], ['page-fit', () => R.zoom.page], ['page-actual', () => R.zoom.actual]] as const
const SCALES = [0.5, 0.75, 1, 1.25, 1.5, 2]
const openOptions = (section: string) => void browser.tabs.create({ url: (browser.runtime.getURL as (p: string) => string)(`/options.html#${section}`) })
/** the popover shut, as a pick does */
const shut = (id: string) => document.getElementById(id)?.hidePopover()

export function ZoomMenu({ controller }: { controller: ReaderController }) {
  const state = useReader(controller, s => ({ zoom: s.zoom, scale: s.scale }))
  const pop = usePopover('menu')
  const items = [
    ...FITS.map(([id, name]) => ({ id, name: name(), checked: state.zoom === id })),
    ...SCALES.map((s, i) => ({ id: String(s), name: `${Math.round(s * 100)}%`, checked: state.zoom === s, separatorBefore: i === 0 })),
  ]
  return (
    <>
      <ToolbarButton label={R.zoom.value} anchor={pop.anchor} {...pop.trigger} className="zoom-value">
        <span data-zoom-value className="tabular-nums">{Math.round(state.scale * 100)}%</span>
        <Icon node={ChevronDown} size={12} className="text-ink-3" />
      </ToolbarButton>
      <Popover {...pop.popover} role="menu" label={R.zoom.value}>
        <ReaderMenu key={pop.generation} kind="radios" label={R.zoom.value} items={items} onClose={() => shut(pop.popover.id)} onPick={id => { controller.zoomTo(FITS.some(([f]) => f === id) ? (id as 'page-width') : Number(id)); shut(pop.popover.id) }} />
      </Popover>
    </>
  )
}

/** `name`: the toolbar's menu has one, so that the capsule's choose-language action can open it (usePopover) */
export function LanguageMenu({ controller, name }: { controller: ReaderController; name?: string }) {
  const current = useReader(controller, s => s.settings?.targetLanguage ?? '')
  const pop = usePopover('listbox', name)
  return (
    <>
      <ToolbarButton label={S.rows.language} anchor={pop.anchor} {...pop.trigger} className="menu-btn">
        <span>{current ? languageName(current) : ''}</span>
        <Icon node={ChevronDown} size={12} className="text-ink-3" />
      </ToolbarButton>
      <Popover {...pop.popover} role="listbox" label={S.rows.language}>
        <ReaderMenu key={pop.generation} kind="listbox" label={S.rows.language} search={S.menu.searchLanguages} noMatch={S.menu.noMatch} items={languageItems(current).map(i => ({ ...i, checked: i.selected }))} onClose={() => shut(pop.popover.id)}
          onPick={code => { controller.patchSettings(c => ({ ...c, targetLanguage: code as LangCode })); shut(pop.popover.id) }} />
      </Popover>
    </>
  )
}

export function ServiceMenu({ controller }: { controller: ReaderController }) {
  const state = useReader(controller, s => ({ settings: s.settings, pack: s.pack }))
  const pop = usePopover('listbox')
  const config = state.settings
  if (!config) return null
  const items = serviceItems(config, state.pack).map(i => ({ id: i.id, name: i.name, hint: i.hint, checked: i.selected, disabled: i.disabled && !i.action }))
  return (
    <>
      <ToolbarButton label={S.rows.service} anchor={pop.anchor} {...pop.trigger} className="menu-btn">
        <span>{serviceName(config.provider, config.services)}</span>
        <Icon node={ChevronDown} size={12} className="text-ink-3" />
      </ToolbarButton>
      <Popover {...pop.popover} role="listbox" label={S.rows.service}>
        <ReaderMenu key={pop.generation} kind="listbox" label={S.rows.service} items={items} onClose={() => shut(pop.popover.id)}
          onPick={id => {
            shut(pop.popover.id)
            // managing the services, or a pack to download: the settings page's (the reader downloads no pack itself)
            const item = serviceItems(config, state.pack).find(i => i.id === id)
            if (id === MANAGE_SERVICES || item?.action) return openOptions('services')
            controller.patchSettings(c => ({ ...c, provider: id }))
          }} />
      </Popover>
    </>
  )
}

export function DownloadMenu({ controller }: { controller: ReaderController }) {
  const state = useReader(controller, s => ({ finalReady: s.finalReady }))
  const pop = usePopover('menu')
  const items = [{ id: 'translation', name: R.download.translation, disabled: !state.finalReady }, { id: 'original', name: R.download.original }]
  return (
    <>
      <ToolbarButton label={R.download.name} anchor={pop.anchor} {...pop.trigger}>
        <Icon node={Download} />
      </ToolbarButton>
      <Popover {...pop.popover} role="menu" label={R.download.name} className="!min-w-[160px]">
        <ReaderMenu key={pop.generation} kind="items" label={R.download.name} items={items} onClose={() => shut(pop.popover.id)} onPick={which => { shut(pop.popover.id); void controller.download(which as 'translation' | 'original') }} />
      </Popover>
    </>
  )
}
