// The reading options (the reader's design, §6.1): the highlight and its colour, what to translate, the appearance and the
// dark pages — all settings, the same values the popup and the settings page change, each written at once. In a narrow
// window they hold what leaves the bar too, first (§5): below 900 px the language and the service, below 500 px the
// download, the settings and the way back
import { type IconNode, LogOut, Monitor, Moon, Settings, SlidersHorizontal, Sun } from 'lucide'
import { useId, useRef } from 'react'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import { R, S, profileName } from '@/ui/strings'
import type { ReaderController } from '../controller'
import { CLASS_ROWS } from '../settings'
import { Icon } from '@/ui/controls/Icon'
import { leaveReader, settingsUrl } from './links'
import { DownloadMenu, LanguageMenu, ServiceMenu } from './Menus'
import { Popover, usePopover } from '@/ui/controls/Popover'
import { radioKeys } from '@/ui/controls/radio'
import { Switch } from '@/ui/controls/Switch'
import { useSettingsLock } from './settings-lock'
import { ToolbarButton } from './ToolbarButton'
import { useReader } from './use-reader'
import { useTip } from '@/ui/controls/tip'

/** the system's first (the maintainer, 2026-09-26); as icons, equal whatever the interface's language, as the display
 *  switch's are, their words in tooltips and to screen readers: a word per third ran off its thumb in English */
const APPEARANCES = ['system', 'light', 'dark'] as const
const GLYPHS: Record<(typeof APPEARANCES)[number], IconNode> = { system: Monitor, light: Sun, dark: Moon }

export function ReadingOptions({ controller, embedded = false }: { controller: ReaderController; embedded?: boolean }) {
  // before the settings land the defaults stand in their places, greyed (S-R-21), so that the button that opens this holds
  // its place, and the narrow window's download and way back in it are reachable at once
  const config = useReader(controller, s => s.settings) ?? DEFAULT_CONFIG
  const lock = useSettingsLock(controller)
  const pop = usePopover('dialog', 'options')
  const radios = useRef<(HTMLButtonElement | null)[]>([])
  const names = { light: R.options.light, dark: R.options.dark, system: R.options.system }
  // the extension's appearance (the redesign's design, §3): chosen here, the popup and the settings page follow
  const appearance = config.theme
  const setAppearance = (a: (typeof APPEARANCES)[number]) => { if (!lock.locked) controller.patchSettings(c => ({ ...c, theme: a })) }
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
        {/* a switch's row is a label, its words a target too, as the popup's are (the interface review) */}
        {/* biome-ignore lint/a11y/noLabelWithoutControl: the control is the switch button inside it, which the rule cannot see through */}
        <label className="row">
          {S.rows.highlight}
          <Switch label={S.rows.highlight} checked={config.reading.sentenceHighlight} disabled={lock.locked} why={lock.why} onChange={on => controller.patchSettings(c => ({ ...c, reading: { ...c.reading, sentenceHighlight: on } }))} />
        </label>
        <div className="row">
          {R.options.color}
          <span className="flex gap-2">
            {config.appearance.highlights.map(h => (
              <Swatch key={h.id} name={profileName(h, 'highlights')} color={h.color || 'var(--axt-green)'} chosen={h.id === config.appearance.activeHighlight} locked={lock.locked} why={lock.why}
                onPick={() => controller.patchSettings(c => ({ ...c, appearance: { ...c.appearance, activeHighlight: h.id } }))} />
            ))}
          </span>
        </div>
        <div className="sep" />
        <ClassToggles controller={controller} config={config} lock={lock} />
        <div className="sep" />
        <div className="row">
          {R.options.appearance}
          <div role="radiogroup" aria-label={R.options.appearance} className="seg small icons" style={{ '--i': APPEARANCES.indexOf(appearance) } as React.CSSProperties}
            onKeyDown={radioKeys(APPEARANCES, appearance, () => true, setAppearance, i => radios.current[i]?.focus())}>
            <span className="thumb" aria-hidden="true" />
            {APPEARANCES.map((a, i) => (
              <AppearanceSegment key={a} name={names[a]} glyph={GLYPHS[a]} checked={a === appearance} locked={lock.locked} why={lock.why} onPick={() => setAppearance(a)} buttonRef={el => { radios.current[i] = el }} />
            ))}
          </div>
        </div>
        {/* biome-ignore lint/a11y/noLabelWithoutControl: the control is the switch button inside it, which the rule cannot see through */}
        <label className="row">
          {R.options.dim}
          <Switch label={R.options.dim} checked={config.pdfReader.dimPages} disabled={lock.locked} why={lock.why} onChange={on => controller.patchSettings(c => ({ ...c, pdfReader: { ...c.pdfReader, dimPages: on } }))} />
        </label>
      </Popover>
    </>
  )
}

/**
 * What to translate (S-R-27; docs/PDF-READER.md §9.1, docs/route/orphan-text.md §8.7): the parts of a paper beside its body a
 * reader shows translated or as the original — the text in figures and in tables, the running heads and feet, the references,
 * the author block under the title (its names, affiliations and e-mail line) —, each translated once whatever they are, so that a toggle shows or hides what was made
 * and never translates again (the layer opened again over the same documents and rows: session/host.ts follows the setting as
 * it lands, from here or the settings page). The website's group, in the same words and order: its heading a row of the panel
 * in the second ink, naming the rows under it, each a switch's row in the panel's own pattern
 */
function ClassToggles({ controller, config, lock }: { controller: ReaderController; config: Config; lock: ReturnType<typeof useSettingsLock> }) {
  const head = useId()
  return (
    // biome-ignore lint/a11y/useSemanticElements: the popover's rows named by the heading row above them; a fieldset's legend lays out as no row of the panel
    <div role="group" aria-labelledby={head} data-axt-classes="">
      <div id={head} className="row text-ink-2">{R.classes.name}</div>
      {CLASS_ROWS.map(t => (
        // biome-ignore lint/a11y/noLabelWithoutControl: the control is the switch button inside it, which the rule cannot see through
        <label key={t} className="row" data-axt-class={t}>
          {R.classes[t]}
          <Switch label={R.classes[t]} checked={config.pdfReader.classes[t]} disabled={lock.locked} why={lock.why}
            onChange={on => controller.patchSettings(c => ({ ...c, pdfReader: { ...c.pdfReader, classes: { ...c.pdfReader.classes, [t]: on } } }))} />
        </label>
      ))}
    </div>
  )
}

function AppearanceSegment({ name, glyph, checked, locked, why, onPick, buttonRef }: { name: string; glyph: IconNode; checked: boolean; locked: boolean; why: string | undefined; onPick: () => void; buttonRef: (el: HTMLButtonElement | null) => void }) {
  const { props, tip } = useTip(name, why)
  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: an ARIA radio drawn as a segment (the design, §6.1), as the display switch's; its keys are the group's */}
      <button ref={buttonRef} type="button" role="radio" aria-checked={checked} aria-disabled={locked || undefined} aria-label={name} aria-description={why} tabIndex={checked ? 0 : -1} onClick={locked ? undefined : onPick} {...props}>
        <Icon node={glyph} />
      </button>
      {tip}
    </>
  )
}

/** a highlight colour: greyed out of reach, with the reason in its tooltip beside its name (S-R-21) */
function Swatch({ name, color, chosen, locked, why, onPick }: { name: string; color: string; chosen: boolean; locked: boolean; why: string | undefined; onPick: () => void }) {
  const { props, tip } = useTip(name, why)
  return (
    <>
      <button type="button" data-swatch aria-label={name} aria-description={why} aria-pressed={chosen} aria-disabled={locked || undefined} className="swatch" style={{ background: color }} onClick={locked ? undefined : onPick} {...(why ? { ...props, style: { background: color, ...props.style } } : {})} />
      {why && tip}
    </>
  )
}
