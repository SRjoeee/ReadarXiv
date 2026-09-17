// The appearance contract (DESIGN §7.5): which attributes go on <html> and which variables the
// injected sheet writes. The rules themselves are in src/styles/presets.css.
//
// v12 replaced the 21 fixed presets by the reader's own profiles: a profile is a colour, an
// opacity, an underline, a blur flag and a block of declarations, so the sheet has three rules
// instead of twenty and every value arrives as a variable.
import type { Look } from '@/config/appearance'
import { HL_OPACITY_MAX, HL_OPACITY_MIN } from '@/config/appearance'
import { ON_ATTR, REAL_TRANSLATION } from './attrs'
import { OPACITY_MAX, OPACITY_MIN, sanitizeColor, sanitizeCustomCss } from './style-values'

export { COLOR_MAX, OPACITY_MAX, OPACITY_MIN, sanitizeColor, sanitizeCustomCss } from './style-values'

/** The line “a real translation” is REAL_TRANSLATION of attrs.ts; every copy of it in presets.css is guarded by tests/renderer/translation-boundary.test.ts */
export const TRANSLATION_SELECTOR = `html[${ON_ATTR}] ${REAL_TRANSLATION}`

/**
 * A real translation “that is no descendant of any **real** translation”. Opacity must use it, never
 * TRANSLATION_SELECTOR: side mode's `localizeNotes()` puts a footnote's translation (`.axt-note-t.axt-t`) inside a
 * paragraph's translation, and with both layers matching the opacities multiply — the floor of 0.3 renders as 0.09,
 * barely visible (Codex on #106). The inner layer uses :where() to add no specificity. A split copy itself is
 * excluded, so a real translation **inside** the copy still gets its opacity once.
 *
 * The opacity declaration itself is static, in presets.css (its copy of this selector is guarded
 * by tests/renderer/translation-boundary.test.ts); this constant remains the name of the line for the tests
 */
export const TOP_TRANSLATION_SELECTOR = `${TRANSLATION_SELECTOR}:not(:where(${REAL_TRANSLATION}) *)`

/**
 * The reader's own declarations apply to the active profile whatever else it sets: v12 made them a
 * field of every profile rather than a preset of their own, so there is no `custom` id to key on
 */
export const CUSTOM_STYLE_SELECTOR = TRANSLATION_SELECTOR


/** Assemble an injectable rule; an empty string gives an empty string (no empty rule) */
export function customStyleRule(css: string): string {
  const sanitized = sanitizeCustomCss(css)
  if (!sanitized.ok || sanitized.css === '') return ''
  return `${CUSTOM_STYLE_SELECTOR} {\n${sanitized.css}\n}\n`
}

/**
 * The look sheet's rules for one look: every value a variable, and nothing but variables. The static sheets consume
 * them — `--axt-opacity` in presets.css's baseline and blur rules, `--axt-color` in modes.css's `.axt-t { color }` and
 * the underline, the band variables in highlight.css — and set none of them, so the look sheet follows the four
 * static sheets in the document and is the only one rewritten when the reader moves a slider (before,
 * the opacity declaration itself was generated and had to precede presets.css, Codex on #106).
 *
 * The variables go on `<html>`, where they inherit; the colour on `TRANSLATION_SELECTOR`: `--axt-color` is read by
 * every `.axt-t`, and the mirrors and split copies — visual clones of the source — must not wear it.
 */
export function appearanceRule(look: Look): string {
  const color = sanitizeColor(look.style.color)
  const band = sanitizeColor(look.highlight.color)
  const opacity = look.style.opacity
  const on: string[] = []
  if (Number.isFinite(opacity) && opacity < OPACITY_MAX) on.push(`--axt-opacity: ${Math.max(OPACITY_MIN, opacity)};`)
  // The band's strength is a percentage for `color-mix`, clamped the way the schema clamps it
  const mix = Math.round(Math.min(HL_OPACITY_MAX, Math.max(HL_OPACITY_MIN, look.highlight.opacity)) * 100)
  on.push(`--axt-hl-mix: ${mix}%;`)
  if (band.ok && band.color !== '') on.push(`--axt-hl-color: ${band.color};`)
  if (look.style.underline !== 'none' && look.style.thickness === 2) on.push('--axt-deco-thickness: 2px;')
  let rule = `html[${ON_ATTR}] {\n${on.join('\n')}\n}\n`
  if (color.ok && color.color !== '') rule += `${TRANSLATION_SELECTOR} {\n--axt-color: ${color.color};\n}\n`
  return rule
}
