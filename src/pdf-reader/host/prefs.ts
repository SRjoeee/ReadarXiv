// The reader's one preference model (packages/reader prefs.ts) over the extension's saved configuration, whose schema does
// not change (hard rule 7: nothing to migrate): every field is read from today's key and a patch is written back to it.
//   display      mode + pdfReader.original (settings.ts displayOf / withDisplay: the popup's mode row governs the reader too)
//   target       targetLanguage (ISO 639-3) as BCP 47 (toBcp47), and back by the code whose tag it is
//   sync         pdfReader.sync              classes   pdfReader.classes
//   theme        theme                       swapped   pdfReader.swapped        dim   pdfReader.dimPages
//   highlight    reading.sentenceHighlight, appearance.activeHighlight
//   ui           uiLanguage ('auto': the browser's languages, as the pages pick their pack)
//   bands        appearance.highlights, each its colour and opacity (a built-in band under its shipped name: null, the reader names it)
//   links        reading.openIn              translator   the chain's revision (config/revision.ts), opaque
import type { Prefs, PrefsPatch, UiLanguage } from '@readarxiv/reader'
import { pickLocale } from '@readarxiv/ui'
import { BUILT_IN_HIGHLIGHTS } from '@/config/appearance'
import { LANG_CODES, type LangCode, toBcp47 } from '@/config/languages'
import type { Config } from '@/config/schema'
import { displayOf, withDisplay } from '../settings'

/** a target's code for its tag: the configuration's own where it already names that tag, else the first code whose tag it
 *  is, else the tag itself (a setting of another version's, kept as it came) */
export function codeOf(tag: string, current?: string): string {
  if (current && toBcp47(current) === tag) return current
  return LANG_CODES.find(c => toBcp47(c) === tag) ?? tag
}

export function prefsOf(config: Config, o: { revision?: string | null; languages?: readonly string[] } = {}): Prefs {
  const shipped = new Map(BUILT_IN_HIGHLIGHTS.map(h => [h.id, h.name]))
  return {
    display: displayOf(config),
    target: toBcp47(config.targetLanguage),
    sync: config.pdfReader.sync,
    classes: { ...config.pdfReader.classes },
    theme: config.theme,
    swapped: config.pdfReader.swapped,
    dim: config.pdfReader.dimPages,
    highlight: { on: config.reading.sentenceHighlight, band: config.appearance.activeHighlight },
    ui: pickLocale(config.uiLanguage, o.languages ?? globalThis.navigator?.languages ?? []) as UiLanguage,
    bands: config.appearance.highlights.map(h => ({ id: h.id, colour: h.color, opacity: h.opacity, name: shipped.get(h.id) === h.name ? null : h.name })),
    links: config.reading.openIn,
    translator: o.revision ?? null,
  }
}

/** the configuration a patch of the reader's writes, on top of `config` (the latest stored, when its turn comes) */
export function withPrefs(config: Config, patch: PrefsPatch): Config {
  let c = config
  if (patch.display !== undefined) c = withDisplay(c, patch.display)
  if (patch.target !== undefined) c = { ...c, targetLanguage: codeOf(patch.target, c.targetLanguage) as LangCode }
  if (patch.theme !== undefined) c = { ...c, theme: patch.theme }
  if (patch.ui !== undefined) c = { ...c, uiLanguage: patch.ui }
  const reader = { ...c.pdfReader }
  if (patch.sync !== undefined) reader.sync = patch.sync
  if (patch.swapped !== undefined) reader.swapped = patch.swapped
  if (patch.dim !== undefined) reader.dimPages = patch.dim
  if (patch.classes !== undefined) reader.classes = { ...reader.classes, ...patch.classes }
  if (patch.sync !== undefined || patch.swapped !== undefined || patch.dim !== undefined || patch.classes !== undefined) c = { ...c, pdfReader: reader }
  const { on, band } = patch.highlight ?? {}
  if (on !== undefined) c = { ...c, reading: { ...c.reading, sentenceHighlight: on } }
  if (band !== undefined) c = { ...c, appearance: { ...c.appearance, activeHighlight: band } }
  return c
}
