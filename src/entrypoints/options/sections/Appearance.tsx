// The appearance section (the redesign's design, §6.4): the extension's appearance (§3) with the dark pages' dimming under it, the
// translation styles (Task 56), and the hover highlight with its colour. Every control writes at once
import { Monitor, Moon, Sun } from 'lucide'
import { BUILT_IN_HIGHLIGHTS, type HighlightProfile } from '@/config/appearance'
import type { Config } from '@/config/schema'
import { Icon } from '@/ui/controls/Icon'
import { Reveal } from '@/ui/controls/Reveal'
import { Segmented } from '@/ui/controls/Segmented'
import { Switch } from '@/ui/controls/Switch'
import { O, S, profileName } from '@/ui/strings'
import type { OptionsData } from '../data'
import { Card } from '../ui/Card'
import { ColourPick } from '../ui/ColourPick'
import { Row } from '../ui/Row'

/** the system's first (the maintainer, 2026-09-26), as in the reader's own options */
const THEMES = ['system', 'light', 'dark'] as const
const GLYPHS = { system: Monitor, light: Sun, dark: Moon }

/** The reader's colour of their own for the highlight (§6.4): one profile, added the first time and changed after */
export const OWN_HIGHLIGHT_ID = 'hl-own'
/** its band's strength: the built-ins' middle (soft-green 0.22, sky 0.25, sand 0.3) */
const OWN_STRENGTH = 0.25

/** a band's swatch as the band reads on a page: its colour at its strength over the ground */
const band = (h: HighlightProfile) => `color-mix(in oklab, ${h.color || BUILT_IN_HIGHLIGHTS[0]!.color} ${Math.round(h.opacity * 100)}%, var(--chrome))`

export function Appearance({ data }: { data: OptionsData }) {
  const { config, patch } = data
  if (!config) return null
  const k = O.search.keywords
  return (
    <>
      <Card>
        <Row row="appearance/theme" words={k['appearance/theme']} label={O.appearance.theme}
          trailing={<Segmented label={O.appearance.theme} value={config.theme} options={THEMES.map(t => ({ value: t, label: O.appearance.themes[t], icon: <Icon node={GLYPHS[t]} size={14} /> }))}
            onChange={theme => void patch(latest => ({ ...latest, theme }))} />} />
        <Reveal open={config.theme !== 'light'}>
          <Row level={1} toggles row="appearance/dim" label={O.appearance.dim} description={O.appearance.dimHint}
            trailing={<Switch label={O.appearance.dim} checked={config.pdfReader.dimPages} onChange={on => void patch(latest => ({ ...latest, pdfReader: { ...latest.pdfReader, dimPages: on } }))} />} />
        </Reveal>
      </Card>
      <Card gap row="appearance/highlight">
        <Row toggles words={k['appearance/highlight']} label={S.rows.highlight} description={O.appearance.highlightHint}
          trailing={<Switch label={S.rows.highlight} checked={config.reading.sentenceHighlight} onChange={on => void patch(latest => ({ ...latest, reading: { ...latest.reading, sentenceHighlight: on } }))} />} />
        <Reveal open={config.reading.sentenceHighlight}>
          <Row level={1} label={O.appearance.colour} trailing={<HighlightSwatches config={config} patch={patch} />} />
        </Reveal>
      </Card>
    </>
  )
}

/** The highlight's colours (§6.4): its profiles as swatches, as the reader's reading options show them, and one of one's own */
function HighlightSwatches({ config, patch }: { config: Config; patch: OptionsData['patch'] }) {
  const a = config.appearance
  const choose = (id: string) => void patch(latest => ({ ...latest, appearance: { ...latest.appearance, activeHighlight: id } }))
  const setOwn = (color: string) => void patch(latest => {
    const list = latest.appearance.highlights
    const highlights = list.some(h => h.id === OWN_HIGHLIGHT_ID)
      ? list.map(h => (h.id === OWN_HIGHLIGHT_ID ? { ...h, color } : h))
      : [...list, { id: OWN_HIGHLIGHT_ID, name: O.appearance.pickColour, color, opacity: OWN_STRENGTH }]
    return { ...latest, appearance: { ...latest.appearance, highlights, activeHighlight: OWN_HIGHLIGHT_ID } }
  })
  const own = a.highlights.find(h => h.id === OWN_HIGHLIGHT_ID)
  return (
    <span className="o-swatches">
      {a.highlights.filter(h => h.id !== OWN_HIGHLIGHT_ID).map(h => (
        <button key={h.id} type="button" className="swatch o-swatch" aria-label={profileName(h, 'highlights')} title={profileName(h, 'highlights')}
          aria-pressed={h.id === a.activeHighlight} style={{ background: band(h) }} onClick={() => choose(h.id)} />
      ))}
      <ColourPick label={O.appearance.pickColour} value={own?.color} pressed={a.activeHighlight === OWN_HIGHLIGHT_ID} onPick={setOwn} />
    </span>
  )
}
