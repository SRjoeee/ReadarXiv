// The toolbar (the reader's design, §5, §6.1): 44 px, three zones — the lead (the contents, the title, the id), the
// centre (the display switch), the trail (the side-by-side pair, zoom, the translation's menus and the reading options,
// the download, the settings, the way back), a hairline divider between the trail's groups. The page's banner, not an
// ARIA toolbar: each control is a stop of its own, which a toolbar's arrow keys would not be (the interface review).
// What leaves it in a narrow window is marked (`data-wide`, `data-side-by-side`; reader.css). Everything here goes
// through the controller; nothing reads the viewers
import { ArrowLeftRight, Link2, LogOut, Minus, PanelLeft, Plus, Settings } from 'lucide'
import { R, S } from '@/ui/strings'
import type { ReaderController } from '../controller'
import { DisplaySwitch } from './DisplaySwitch'
import { Icon } from './icons'
import { leaveReader, settingsUrl } from './links'
import { DownloadMenu, LanguageMenu, ServiceMenu, ZoomMenu } from './Menus'
import { PaperTitle } from './PaperTitle'
import { ProgressLine } from './ProgressLine'
import { ReadingOptions } from './ReadingOptions'
import { ToolbarButton } from './ToolbarButton'
import { useReader } from './use-reader'

/** ⌘ on a Mac, Ctrl elsewhere, as the zoom's shortcuts show them, and as assistive technology names the key */
const MAC = /Mac/.test(navigator.platform)
const MOD = MAC ? '⌘' : 'Ctrl'
const MOD_KEY = MAC ? 'Meta' : 'Control'

export function Toolbar({ controller, embedded, contents, onContents }: { controller: ReaderController; embedded: boolean; contents: boolean; onContents: () => void }) {
  const state = useReader(controller, s => ({ swapped: s.settings?.pdfReader.swapped ?? false, display: s.display, narrow: s.narrow, paper: s.paper, available: s.available, languageSupported: s.languageSupported, sync: s.sync }))
  const sideBySide = state.display === 'bilingual' && !state.narrow
  return (
    <header className="chrome bar">
      <div data-zone="lead" className="flex min-w-0 items-center gap-1">
        <ToolbarButton label={R.contents} aria-expanded={contents} aria-controls="axt-contents" onClick={onContents}>
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
          <ToolbarButton label={R.zoom.out} hint={`${MOD} −`} keys={`${MOD_KEY}+-`} onClick={() => controller.zoomBy(1 / 1.1)} className="!w-[26px] !min-w-[26px]">
            <Icon node={Minus} />
          </ToolbarButton>
          <ZoomMenu controller={controller} />
          <ToolbarButton label={R.zoom.in} hint={`${MOD} +`} keys={`${MOD_KEY}+=`} onClick={() => controller.zoomBy(1.1)} className="!w-[26px] !min-w-[26px]">
            <Icon node={Plus} />
          </ToolbarButton>
        </div>
        <span className="divider" />
        <LanguageMenu controller={controller} name="language" />
        <ServiceMenu controller={controller} />
        <ReadingOptions controller={controller} embedded={embedded} />
        {/* below 500 px these are the reading options' first rows (§5) */}
        <span className="divider" data-wide />
        <DownloadMenu controller={controller} wide />
        <ToolbarButton label={S.settings} href={settingsUrl()} data-wide>
          <Icon node={Settings} />
        </ToolbarButton>
        {embedded && (
          <ToolbarButton label={R.leave} data-leave data-wide onClick={leaveReader}>
            <Icon node={LogOut} />
          </ToolbarButton>
        )}
      </div>
      <ProgressLine controller={controller} />
    </header>
  )
}
