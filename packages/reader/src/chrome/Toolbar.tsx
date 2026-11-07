// The toolbar (the reader's design, §5, §6.1): 44 px, three zones — the lead (a host's own first, the contents, the title, the
// id, a host's own after it), the
// centre (the display switch), the trail (the side-by-side pair, zoom, the translation's menus and the reading options,
// the download, the settings, the way back), a hairline divider between the trail's groups. The page's banner, not an
// ARIA toolbar: each control is a stop of its own, which a toolbar's arrow keys would not be (the interface review).
// What leaves it in a narrow window is marked (`data-wide`, `data-side-by-side`; reader.css). Everything here goes
// through the controller; nothing reads the viewers
import { ArrowLeftRight, Link2, Minus, PanelLeft, Plus } from 'lucide'
import { Icon, R } from '@readarxiv/ui'
import type { ReaderController } from './model.ts'
import { DisplaySwitch } from './DisplaySwitch.tsx'
import { LanguageMenu, ZoomMenu } from './Menus.tsx'
import { PaperTitle } from './PaperTitle.tsx'
import { useParts } from './parts.tsx'
import { ProgressLine } from './ProgressLine.tsx'
import { ReadingOptions } from './ReadingOptions.tsx'
import { useSettingsLock } from './settings-lock.ts'
import { ToolbarButton } from './ToolbarButton.tsx'
import { useReader } from './use-reader.ts'

/** ⌘ on a Mac, Ctrl elsewhere, as the zoom's shortcuts show them, and as assistive technology names the key */
const MAC = /Mac/.test(navigator.platform)
const MOD = MAC ? '⌘' : 'Ctrl'
const MOD_KEY = MAC ? 'Meta' : 'Control'

export function Toolbar({
  controller,
  contents,
  onContents,
}: {
  controller: ReaderController
  contents: boolean
  onContents: () => void
}) {
  const { slots, narrow: narrowRule } = useParts()
  const state = useReader(controller, (s) => ({
    swapped: s.prefs?.swapped ?? false,
    display: s.display,
    narrow: s.narrow,
    paper: s.paper,
    available: s.available,
    languageSupported: s.languageSupported,
    sync: s.sync,
  }))
  const sideBySide = state.display === 'bilingual' && !state.narrow
  const shownAlone = narrowRule === 'shown' && state.narrow && state.display === 'bilingual'
  const lock = useSettingsLock(controller)
  return (
    <header className="chrome bar">
      <div data-zone="lead" className="flex min-w-0 items-center gap-1">
        {/* the host's own first (the website's way home), and after the title (its short link to arXiv, where the lead cannot
            hold the id): each a child of the lead itself, so that a host's sheet places it by its siblings */}
        {slots.lead}
        <ToolbarButton label={R.contents} aria-expanded={contents} aria-controls="axt-contents" onClick={onContents}>
          <Icon node={PanelLeft} />
        </ToolbarButton>
        <PaperTitle id={state.paper.id} title={state.paper.title} />
        {slots.afterTitle}
      </div>
      <div data-zone="centre" className="flex items-center">
        {/* a narrow window shows the translation alone in side by side: the host's rule says whether the switch shows it so,
            the translation chosen and side by side greyed (the website's), or keeps side by side chosen and the capsule says it
            (the extension's) */}
        <DisplaySwitch
          value={shownAlone ? 'translation' : state.display}
          translatable={state.available && state.languageSupported}
          {...(narrowRule === 'shown' && state.narrow ? { off: ['bilingual'] as const } : {})}
          onChange={controller.setDisplay}
        />
      </div>
      <div data-zone="trail" className="flex items-center gap-1 justify-self-end">
        <ToolbarButton
          label={R.swap}
          pressed={state.swapped}
          disabled={!sideBySide || lock.locked}
          why={sideBySide ? lock.why : undefined}
          data-side-by-side
          onClick={() => controller.setPrefs({ swapped: !state.swapped })}
        >
          <Icon node={ArrowLeftRight} />
        </ToolbarButton>
        {/* the sync the reader applies, not the stored setting a refused write or an address may leave behind (Part 2's final review) */}
        <ToolbarButton
          label={R.sync}
          pressed={state.sync}
          disabled={!sideBySide}
          data-side-by-side
          onClick={() => controller.setSync(!state.sync)}
        >
          <Icon node={Link2} />
        </ToolbarButton>
        <span className="divider" data-side-by-side />
        <div className="flex items-center" data-zoom>
          <ToolbarButton
            label={R.zoom.out}
            hint={`${MOD} −`}
            keys={`${MOD_KEY}+-`}
            onClick={() => controller.zoomBy(1 / 1.1)}
            className="!w-[26px] !min-w-[26px]"
          >
            <Icon node={Minus} />
          </ToolbarButton>
          <ZoomMenu controller={controller} />
          <ToolbarButton
            label={R.zoom.in}
            hint={`${MOD} +`}
            keys={`${MOD_KEY}+=`}
            onClick={() => controller.zoomBy(1.1)}
            className="!w-[26px] !min-w-[26px]"
          >
            <Icon node={Plus} />
          </ToolbarButton>
        </div>
        <span className="divider" />
        <LanguageMenu controller={controller} name="language" />
        {/* the host's own before the reading options (the extension's service), and after them (its download, settings and
            way back, which below 500 px are the reading options' first rows, §5) */}
        {slots.beforeOptions?.('bar')}
        <ReadingOptions controller={controller} />
        {slots.afterOptions?.('bar')}
      </div>
      <ProgressLine controller={controller} />
    </header>
  )
}
