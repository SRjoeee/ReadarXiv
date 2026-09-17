// The document's translation state (DESIGN §7; DESIGN §7.1): the attributes on <html>, the injected
// style sheet, the mode, and the restore that undoes all of it. Global state lives on <html> only (§7.1).
import type { Look } from '@/config/appearance'
import { isRtlTag } from '@/config/languages'
import { AXT_ATTR_PREFIX, INJECTED_SELECTOR } from '@/core/marks'
import highlightCss from '@/styles/highlight.css?inline'
import imageCss from '@/styles/image.css?inline'
import modesCss from '@/styles/modes.css?inline'
import presetsCss from '@/styles/presets.css?inline'
import { BLUR_ATTR, DIR_ATTR, LANG_ATTR, MODE_ATTR, type Mode, ON_ATTR, STYLE_ATTR, UNDERLINE_ATTR } from './attrs'
import { clearSentenceHighlights } from './highlight'
import { cancelSkeletonsIn } from './skeleton'
import { appearanceRule, customStyleRule } from './style-preset'

/** The two injected sheets, told apart by `STYLE_ATTR`; `restore` removes whatever carries the attribute */
const STATIC_MARK = 'modes'
const LOOK_MARK = 'look'

/** What the look sheet needs: the reader's active style and band profiles (§7.5). `Look` lives with the profiles */
export type { Look }

/**
 * The static sheet: the four style files, the same for every look, written once at the first `enable` and never
 * again (a colour change used to rewrite all 900 lines of it). The order is the cascade order:
 * modes (layout; `.axt-t { color: var(--axt-color) }`), presets (underline, the baseline opacity, blur — consuming
 * the look's variables), image, highlight
 */
const STATIC_SHEET = `${modesCss}\n${presetsCss}\n${imageCss}\n${highlightCss}`

/**
 * The look sheet: the reader's values as variables (`appearanceRule`) and the advanced declarations
 * (`customStyleRule`), in that order. It follows the static sheet in the document, so the declarations — the escape
 * hatch — have the final word by cascade order; the variables are set nowhere else. Small, and the only sheet a look
 * change rewrites
 */
function lookSheet(look: Look): string {
  return appearanceRule(look) + customStyleRule(look.style.css)
}

/** Rewrite the look sheet when the look changed; says whether it did. Written only when it differs, to spare a needless style recalculation */
function writeLook(sheet: Element, look: Look): boolean {
  const css = lookSheet(look)
  if (sheet.textContent === css) return false
  sheet.textContent = css
  return true
}

function sheetElement(doc: Document, mark: string, css: string): HTMLStyleElement {
  const el = doc.createElement('style')
  el.setAttribute(STYLE_ATTR, mark)
  el.textContent = css
  return el
}

const findSheet = (doc: Document, mark: string) => doc.querySelector(`style[${STYLE_ATTR}="${mark}"]`)

/** The same sheets the page gets, as one, for the settings preview to put in its iframe */
export const appearanceSheet = (look: Look): string => `${STATIC_SHEET}\n${lookSheet(look)}`

/**
 * Appearance only, no translation node touched (#47): write the profile's switches and rewrite the
 * look sheet. This is the path a colour change in the settings page takes, and it **does not
 * re-request anything** (§8.5's `chainConfigChanged` ignores `style` already). With translation off
 * there is no injected sheet and nothing to do — the next `enable` carries the new values.
 */
export function applyStyle(doc: Document, look: Look): boolean {
  const sheet = findSheet(doc, LOOK_MARK)
  if (!sheet) return false
  setAppearanceAttrs(doc, look)
  // Font size, leading and weight can all change here (the advanced declarations), and then the line is no longer
  // where the bands were traced. They are absolute boxes in document coordinates and cannot follow a reflow, so
  // drop them; the next pointer move repaints against the new layout (Codex on #138).
  if (writeLook(sheet, look)) clearSentenceHighlights(doc)
  return true
}

/**
 * Enter the translated state: the state attribute on <html>, the mode and the appearance injected (idempotent).
 * Appearance, like the mode, is only attributes on <html> and variables in the look sheet (§7.5); a configuration
 * change touches no DOM. Without a look, an existing look sheet is left as it is — a mode switch must not touch the appearance
 */
export function enable(doc: Document, mode: Mode, look?: Look, lang?: string): void {
  doc.documentElement.setAttribute(ON_ATTR, '')
  doc.documentElement.setAttribute(MODE_ATTR, mode)
  // The translation's language is recorded on <html> (§7.1: global state lives there only); renderText writes it onto
  // every translation node's lang. Not by changing <html lang>: that would label the original as Chinese as well
  if (lang) {
    doc.documentElement.setAttribute(LANG_ATTR, lang)
    if (isRtlTag(lang)) doc.documentElement.setAttribute(DIR_ATTR, 'rtl')
    else doc.documentElement.removeAttribute(DIR_ATTR)
  }
  if (look) setAppearanceAttrs(doc, look)
  const fixed = findSheet(doc, STATIC_MARK) ?? doc.head.appendChild(sheetElement(doc, STATIC_MARK, STATIC_SHEET))
  const existing = findSheet(doc, LOOK_MARK)
  // The custom CSS may have changed (edited in settings, then translated again)
  if (existing && look) writeLook(existing, look)
  const sheet = existing ?? sheetElement(doc, LOOK_MARK, look ? lookSheet(look) : '')
  // Right after the static sheet, on every enable — whatever else the head holds, and whichever of the two a page
  // script's rewrite of the head left standing: the look sheet wins by order, not by specificity (the local
  // adversarial review of T5 reversed the two by removing the static sheet between two enables)
  if (fixed.nextElementSibling !== sheet) fixed.after(sheet)
}

/**
 * The two switches of the active style, as attributes on `<html>` (§7.5). Everything else the
 * profile carries arrives as a variable, so this is all that changes when the reader picks another
 */
function setAppearanceAttrs(doc: Document, look: Look): void {
  const html = doc.documentElement
  if (look.style.underline === 'none') html.removeAttribute(UNDERLINE_ATTR)
  else html.setAttribute(UNDERLINE_ATTR, look.style.underline)
  if (look.style.blur) html.setAttribute(BLUR_ATTR, '')
  else html.removeAttribute(BLUR_ATTR)
}

/** A mode switch changes one attribute and goes through no translation flow (§4 step 9) */
export function setMode(doc: Document, mode: Mode): void {
  // `only` hides the source column outright and `side` re-lays it out, so whatever was tinted is
  // about to be somewhere else or nowhere. The next pointer move repaints it in place.
  clearSentenceHighlights(doc)
  doc.documentElement.setAttribute(MODE_ATTR, mode)
}

/** Restore the original: remove every injected node (translations and image overlays, §7.1 item 4), strip every data-axt-* attribute, remove the injected styles (#axt-debug's included) */
export function restore(doc: Document): { removedNodes: number; strippedAttrs: number } {
  // The controller drops what it painted before its targets go: the bands and the panel point at
  // translation nodes about to be removed (§7.7). Its layer and panel nodes leave with the sweep below
  clearSentenceHighlights(doc)
  let removedNodes = 0
  let strippedAttrs = 0
  for (const node of Array.from(doc.querySelectorAll(INJECTED_SELECTOR))) {
    cancelSkeletonsIn(node)
    node.remove()
    removedNodes++
  }
  // Styles first, attributes after: the style mark is itself a data-axt-* attribute, and once stripped it cannot be found
  for (const style of Array.from(doc.querySelectorAll(`style[${STYLE_ATTR}]`))) style.remove()
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith(AXT_ATTR_PREFIX)) {
        el.removeAttribute(attr.name)
        strippedAttrs++
      }
    }
  }
  return { removedNodes, strippedAttrs }
}
