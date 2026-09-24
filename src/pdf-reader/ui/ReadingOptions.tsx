// The reading options (the reader's design, §6.1): the highlight and its colour, figure text, the appearance and the
// dark pages — all settings, the same values the popup and the settings page change, each written at once
import { SlidersHorizontal } from 'lucide'
import { R, S, profileName } from '@/ui/strings'
import type { ReaderController } from '../controller'
import { Icon } from './icons'
import { LanguageMenu, ServiceMenu } from './Menus'
import { Popover, usePopover } from './Popover'
import { Switch } from './Switch'
import { ToolbarButton } from './ToolbarButton'
import { useReader } from './use-reader'

const APPEARANCES = ['light', 'dark', 'system'] as const

export function ReadingOptions({ controller }: { controller: ReaderController }) {
  const state = useReader(controller)
  const pop = usePopover('dialog')
  const config = state.settings
  if (!config) return null
  const names = { light: R.options.light, dark: R.options.dark, system: R.options.system }
  const appearance = config.pdfReader.appearance
  return (
    <>
      <ToolbarButton label={R.options.name} anchor={pop.anchor} {...pop.trigger}>
        <Icon node={SlidersHorizontal} />
      </ToolbarButton>
      <Popover {...pop.popover} role="dialog" label={R.options.name}>
        {/* below 900 px the toolbar's language and service menus live here, first (the design, §5) */}
        <div className="row narrow-only">
          {S.rows.language}
          <LanguageMenu controller={controller} />
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
          <div role="radiogroup" aria-label={R.options.appearance} className="seg small w-[180px]" style={{ '--i': APPEARANCES.indexOf(appearance) } as React.CSSProperties}>
            <span className="thumb" aria-hidden="true" />
            {APPEARANCES.map(a => (
              // biome-ignore lint/a11y/useSemanticElements: an ARIA radio drawn as a segment (the design, §6.1), as the display switch's
              <button key={a} type="button" role="radio" aria-checked={a === appearance} tabIndex={a === appearance ? 0 : -1} onClick={() => controller.patchSettings(c => ({ ...c, pdfReader: { ...c.pdfReader, appearance: a } }))}>
                {names[a]}
              </button>
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
