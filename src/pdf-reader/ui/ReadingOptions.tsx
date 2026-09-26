// The reading options (the reader's design, §6.1): the highlight and its colour, figure text, the appearance and the
// dark pages — all settings, the same values the popup and the settings page change, each written at once. In a narrow
// window they hold what leaves the bar too, first (§5): below 900 px the language and the service, below 500 px the
// download, the settings and the way back
import { type IconNode, LogOut, Monitor, Moon, Settings, SlidersHorizontal, Sun } from 'lucide'
import { useRef } from 'react'
import { R, S, profileName } from '@/ui/strings'
import type { ReaderController } from '../controller'
import { Icon } from './icons'
import { leaveReader, settingsUrl } from './links'
import { DownloadMenu, LanguageMenu, ServiceMenu } from './Menus'
import { Popover, usePopover } from './Popover'
import { radioKeys } from './radio'
import { Switch } from './Switch'
import { ToolbarButton } from './ToolbarButton'
import { useReader } from './use-reader'
import { useTip } from './tip'

/** the system's first (the maintainer, 2026-09-26); as icons, equal whatever the interface's language, as the display
 *  switch's are, their words in tooltips and to screen readers: a word per third ran off its thumb in English */
const APPEARANCES = ['system', 'light', 'dark'] as const
const GLYPHS: Record<(typeof APPEARANCES)[number], IconNode> = { system: Monitor, light: Sun, dark: Moon }

export function ReadingOptions({ controller, embedded = false }: { controller: ReaderController; embedded?: boolean }) {
  const config = useReader(controller, s => s.settings)
  const pop = usePopover('dialog', 'options')
  const radios = useRef<(HTMLButtonElement | null)[]>([])
  if (!config) return null
  const names = { light: R.options.light, dark: R.options.dark, system: R.options.system }
  const appearance = config.pdfReader.appearance
  const setAppearance = (a: (typeof APPEARANCES)[number]) => controller.patchSettings(c => ({ ...c, pdfReader: { ...c.pdfReader, appearance: a } }))
  return (
    <>
      <ToolbarButton label={R.options.name} anchor={pop.anchor} {...pop.trigger}>
        <Icon node={SlidersHorizontal} />
      </ToolbarButton>
      <Popover {...pop.popover} role="dialog" label={R.options.name}>
        {/* below 500 px the bar's download, settings and way back live here, before all (§5; the maintainer, 2026-09-26) */}
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
            <ToolbarButton label={R.leave} onClick={leaveReader}>
              <Icon node={LogOut} />
            </ToolbarButton>
          </div>
        )}
        <div className="sep narrowest-only" />
        {/* below 900 px the toolbar's language and service menus live here, first (the design, §5) */}
        <div className="row narrow-only">
          {S.rows.language}
          <LanguageMenu controller={controller} name="options-language" />
        </div>
        <div className="row narrow-only">
          {S.rows.service}
          <ServiceMenu controller={controller} />
        </div>
        <div className="sep narrow-only" />
        <div className="row">
          {S.rows.highlight}
          <Switch label={S.rows.highlight} checked={config.reading.sentenceHighlight} onChange={on => controller.patchSettings(c => ({ ...c, reading: { ...c.reading, sentenceHighlight: on } }))} />
        </div>
        <div className="row">
          {R.options.color}
          <span className="flex gap-2">
            {config.appearance.highlights.map(h => (
              <button key={h.id} type="button" data-swatch aria-label={profileName(h, 'highlights')} aria-pressed={h.id === config.appearance.activeHighlight} className="swatch" style={{ background: h.color || 'var(--axt-green)' }}
                onClick={() => controller.patchSettings(c => ({ ...c, appearance: { ...c.appearance, activeHighlight: h.id } }))} />
            ))}
          </span>
        </div>
        <div className="sep" />
        <div className="row">
          {S.rows.images}
          <Switch label={S.rows.images} checked={config.image.enabled} onChange={on => controller.patchSettings(c => ({ ...c, image: { ...c.image, enabled: on } }))} />
        </div>
        <div className="sep" />
        <div className="row">
          {R.options.appearance}
          <div role="radiogroup" aria-label={R.options.appearance} className="seg small icons" style={{ '--i': APPEARANCES.indexOf(appearance) } as React.CSSProperties}
            onKeyDown={radioKeys(APPEARANCES, appearance, () => true, setAppearance, i => radios.current[i]?.focus())}>
            <span className="thumb" aria-hidden="true" />
            {APPEARANCES.map((a, i) => (
              <AppearanceSegment key={a} name={names[a]} glyph={GLYPHS[a]} checked={a === appearance} onPick={() => setAppearance(a)} buttonRef={el => { radios.current[i] = el }} />
            ))}
          </div>
        </div>
        <div className="row">
          {R.options.dim}
          <Switch label={R.options.dim} checked={config.pdfReader.dimPages} onChange={on => controller.patchSettings(c => ({ ...c, pdfReader: { ...c.pdfReader, dimPages: on } }))} />
        </div>
      </Popover>
    </>
  )
}

function AppearanceSegment({ name, glyph, checked, onPick, buttonRef }: { name: string; glyph: IconNode; checked: boolean; onPick: () => void; buttonRef: (el: HTMLButtonElement | null) => void }) {
  const { props, tip } = useTip(name)
  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: an ARIA radio drawn as a segment (the design, §6.1), as the display switch's; its keys are the group's */}
      <button ref={buttonRef} type="button" role="radio" aria-checked={checked} aria-label={name} tabIndex={checked ? 0 : -1} onClick={onPick} {...props}>
        <Icon node={glyph} />
      </button>
      {tip}
    </>
  )
}
