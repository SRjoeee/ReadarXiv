// The toolbar (the reader's design, §5, §6.1): 44 px, three zones — the lead (the contents, the title, the id), the
// centre (the display switch), the trail (the side-by-side pair, zoom, the translation's menus and the reading options,
// the download, the settings, the way back), a hairline divider between the trail's groups. Everything here goes
// through the controller; nothing reads the viewers
import { ArrowLeftRight, Link2, LogOut, Minus, PanelLeft, Plus, Settings } from 'lucide'
import { browser } from 'wxt/browser'
import { R, S } from '@/ui/strings'
import type { ReaderController } from '../controller'
import { DisplaySwitch } from './DisplaySwitch'
import { Icon } from './icons'
import { DownloadMenu, LanguageMenu, ServiceMenu, ZoomMenu } from './Menus'
import { PaperTitle } from './PaperTitle'
import { ProgressLine } from './ProgressLine'
import { ReadingOptions } from './ReadingOptions'
import { ToolbarButton } from './ToolbarButton'
import { useReader } from './use-reader'

/** ⌘ on a Mac, Ctrl elsewhere, as the zoom's shortcuts show them */
const MOD = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'
const openSettings = () => void browser.tabs.create({ url: (browser.runtime.getURL as (p: string) => string)('/options.html#pdf-reader') })

export function Toolbar({ controller, embedded, contents, onContents }: { controller: ReaderController; embedded: boolean; contents: boolean; onContents: () => void }) {
  const state = useReader(controller, s => ({ swapped: s.settings?.pdfReader.swapped ?? false, display: s.display, narrow: s.narrow, paper: s.paper, available: s.available, languageSupported: s.languageSupported, sync: s.sync }))
  const sideBySide = state.display === 'bilingual' && !state.narrow
  return (
    <header role="toolbar" aria-label={R.bar} className="chrome">
      <div data-zone="lead" className="flex min-w-0 items-center gap-1">
        <ToolbarButton label={R.contents} pressed={contents} onClick={onContents}>
          <Icon node={PanelLeft} />
        </ToolbarButton>
        <PaperTitle id={state.paper.id} title={state.paper.title} />
      </div>
      <div data-zone="centre" className="flex items-center">
        <DisplaySwitch value={state.display} translatable={state.available && state.languageSupported} onChange={controller.setDisplay} />
      </div>
      <div data-zone="trail" className="flex items-center gap-1 justify-self-end">
        <ToolbarButton label={R.swap} pressed={state.swapped} disabled={!sideBySide} data-side-by-side onClick={() => controller.patchSettings(c => ({ ...c, pdfReader: { ...c.pdfReader, swapped: !c.pdfReader.swapped } }))}>
          <Icon node={ArrowLeftRight} />
        </ToolbarButton>
        {/* the sync the reader applies, not the stored setting a refused write or an address may leave behind (Part 2's final review) */}
        <ToolbarButton label={R.sync} pressed={state.sync} disabled={!sideBySide} data-side-by-side onClick={() => controller.setSync(!state.sync)}>
          <Icon node={Link2} />
        </ToolbarButton>
        <span className="divider" data-side-by-side />
        <div className="flex items-center" data-zoom>
          <ToolbarButton label={R.zoom.out} hint={`${MOD} −`} onClick={() => controller.zoomBy(1 / 1.1)} className="!w-[26px] !min-w-[26px]">
            <Icon node={Minus} />
          </ToolbarButton>
          <ZoomMenu controller={controller} />
          <ToolbarButton label={R.zoom.in} hint={`${MOD} +`} onClick={() => controller.zoomBy(1.1)} className="!w-[26px] !min-w-[26px]">
            <Icon node={Plus} />
          </ToolbarButton>
        </div>
        <span className="divider" />
        <LanguageMenu controller={controller} name="language" />
        <ServiceMenu controller={controller} />
        <ReadingOptions controller={controller} />
        <span className="divider" />
        <DownloadMenu controller={controller} />
        <ToolbarButton label={S.settings} onClick={openSettings}>
          <Icon node={Settings} />
        </ToolbarButton>
        {embedded && (
          <ToolbarButton label={R.leave} data-leave onClick={() => parent.postMessage({ type: 'axt-pdf-reader-close' }, 'https://arxiv.org')}>
            <Icon node={LogOut} />
          </ToolbarButton>
        )}
      </div>
      <ProgressLine controller={controller} />
    </header>
  )
}
