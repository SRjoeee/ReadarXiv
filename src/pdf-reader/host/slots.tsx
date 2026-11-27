// The extension's own controls in the reader's chrome, in their approved places (packages/reader chrome/parts.tsx Slots; the
// reader's design §5, §6.1): before the reading options the translation service, after them the download, the settings and
// the way back (in the bar, and below 500 px as the reading options' first rows), and under a failure's card the settings
// where a key is the remedy. They read the reader by its hooks, and the extension's configuration by its own store.
import { ChevronDown, Download, LogOut, Settings } from 'lucide'
import { browser } from 'wxt/browser'
import { type ReaderController, ToolbarButton, useReader, useSettingsLock } from '@readarxiv/reader'
import { Icon, MenuList, Popover, R, S, shut, usePopover } from '@readarxiv/ui'
import { DEFAULT_CONFIG, type Config } from '@/config/schema'
import { isBuiltInService } from '@/config/services'
import type { PackState } from '@/shared/pack'
import { MANAGE_SERVICES, serviceItems } from '@/ui/service-items'
import { serviceName } from '@/ui/strings'
import { useRejected } from '@/ui/use-rejected'
import { useSyncExternalStore } from 'react'
import { leaveReader, settingsUrl } from './links'

/** the extension's configuration as the slots read it, and the change a pick writes (on the latest stored, in its turn) */
export interface ConfigStore {
  state(): { config: Config | null; pack: PackState | null }
  subscribe(listener: () => void): () => void
  patch(change: (latest: Config) => Config): void
  /** the translator the reader's own calls ask first, which the service menu names and checks (UI.md S-P-46): each reader's
   *  host says it beside the chain its calls go to */
  askedFirst(config: Config): string
}

const openOptions = (section: string) => void browser.tabs.create({ url: (browser.runtime.getURL as (p: string) => string)(`/options.html#${section}`) })

export function ServiceMenu({ controller, store }: { controller: ReaderController; store: ConfigStore }) {
  const state = useSyncExternalStore(store.subscribe, store.state)
  // a refused key says so in the list, as in the popup (the redesign's design, §5.2; the controller's ruling 22)
  const rejected = useRejected()
  const lock = useSettingsLock(controller)
  const pop = usePopover('listbox')
  // before the settings land the defaults stand in the button's place, greyed, so that the bar does not reflow (S-R-21)
  const config = state.config ?? DEFAULT_CONFIG
  // the translator asked first, named and checked: the stored one may be another (the install's Microsoft, nobody's pick)
  const asked = store.askedFirst(config)
  const items = lock.locked ? [] : serviceItems(config, state.pack, rejected).map(i => ({ id: i.id, name: i.name, hint: i.hint, checked: i.id === asked, disabled: i.disabled && !i.action }))
  return (
    <>
      <ToolbarButton label={S.rows.service} value={serviceName(asked, config.services)} anchor={pop.anchor} disabled={lock.locked} why={lock.why} {...(lock.locked ? {} : pop.trigger)} className="menu-btn">
        <Icon node={ChevronDown} size={12} className="text-ink-3" />
      </ToolbarButton>
      {!lock.locked && (
        <Popover {...pop.popover} role="listbox" label={S.rows.service}>
          <MenuList key={pop.generation} kind="listbox" label={S.rows.service} items={items} onClose={() => shut(pop.popover.id)}
            onPick={id => {
              shut(pop.popover.id)
              // managing the services, or a pack to download: the settings page's (the reader downloads no pack itself)
              const item = serviceItems(config, state.pack, rejected).find(i => i.id === id)
              if (id === MANAGE_SERVICES || item?.action) return openOptions('translate/services')
              // a service another tab deleted meanwhile is not written: the chain would take an unknown id for Microsoft
              // while the bar showed the raw id (the popup's rule)
              // (a pick, recorded: the PDF reader follows it, v22)
              store.patch(c => (isBuiltInService(id) || c.services.some(s => s.id === id) ? { ...c, provider: id, providerChosen: true } : c))
            }} />
        </Popover>
      )}
    </>
  )
}

/** `wide`: the bar's, which leaves it in a narrow window for the reading options' own (reader.css data-wide) */
export function DownloadMenu({ controller, wide = false }: { controller: ReaderController; wide?: boolean }) {
  // the original only once its document is open: loading, or after a fetch that failed, there are no bytes to give
  // the translation once there is one to give (the layer exported, Task 20); until then the original alone
  const state = useReader(controller, s => ({ translation: s.download === 'translation', original: s.sides.left.pages > 0 }))
  const pop = usePopover('menu')
  // (the translation's file and the side-by-side's, made in the page: greyed until the final translation is on screen, and
  // while one is made, one at a time; S-R-09)
  const exporting = useReader(controller, s => s.exporting)
  const making = exporting?.form ?? null
  const made = (id: 'translation' | 'side-by-side') => ({ disabled: !state.translation || (making !== null && making !== id), ...(making === id ? { hint: `${exporting?.percent ?? 0}%`, action: { label: '', busy: true } } : {}) })
  const items = [
    { id: 'translation', name: R.download.translation, ...made('translation') },
    { id: 'side-by-side', name: R.download.sideBySide, ...made('side-by-side') },
    { id: 'original', name: R.download.original, disabled: !state.original },
  ]
  return (
    <>
      <ToolbarButton label={R.download.name} anchor={pop.anchor} {...pop.trigger} data-wide={wide || undefined}>
        <Icon node={Download} />
      </ToolbarButton>
      <Popover {...pop.popover} role="menu" label={R.download.name} className="!min-w-[160px]">
        <MenuList key={pop.generation} kind="items" label={R.download.name} items={items} onClose={() => shut(pop.popover.id)} onAction={() => {}} onPick={which => { if (making && which !== 'original') return; shut(pop.popover.id); void controller.download(which as 'translation' | 'side-by-side' | 'original') }} />
      </Popover>
    </>
  )
}

/** the slots of the extension's reader: `embedded`, framed over arXiv's PDF page, which the way back returns to */
export function extensionSlots(o: { controller: ReaderController; store: ConfigStore; embedded: boolean }) {
  const { controller, store, embedded } = o
  return {
    beforeOptions: (at: 'bar' | 'options') =>
      at === 'bar' ? (
        <ServiceMenu controller={controller} store={store} />
      ) : (
        <div className="row narrow-only">
          {S.rows.service}
          <ServiceMenu controller={controller} store={store} />
        </div>
      ),
    afterOptions: (at: 'bar' | 'options') =>
      at === 'bar' ? (
        <>
          {/* below 500 px these are the reading options' first rows (§5) */}
          <span className="divider" data-wide />
          <DownloadMenu controller={controller} wide />
          <ToolbarButton label={S.settings} href={settingsUrl()} data-wide>
            <Icon node={Settings} />
          </ToolbarButton>
          {embedded && (
            <ToolbarButton label={R.leave} data-leave data-wide onClick={() => void leaveReader()}>
              <Icon node={LogOut} />
            </ToolbarButton>
          )}
        </>
      ) : (
        <>
          <div className="row narrowest-only">
            {R.download.name}
            <DownloadMenu controller={controller} />
          </div>
          <div className="row narrowest-only">
            {S.settings}
            <ToolbarButton label={S.settings} href={settingsUrl()}>
              <Icon node={Settings} />
            </ToolbarButton>
          </div>
          {embedded && (
            <div className="row narrowest-only">
              {R.leave}
              <ToolbarButton label={R.leave} onClick={() => void leaveReader()}>
                <Icon node={LogOut} />
              </ToolbarButton>
            </div>
          )}
          <div className="sep narrowest-only" />
        </>
      ),
    card: () => (
      <button type="button" onClick={() => void browser.tabs.create({ url: (browser.runtime.getURL as (p: string) => string)('/options.html#translate/services') })}>
        {S.settings}
      </button>
    ),
  }
}
