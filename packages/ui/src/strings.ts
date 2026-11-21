// The reader-visible strings of the extension's pages, in whichever language the interface is set to
// (docs/UI.md §3 and §6). The words themselves live in `./locales/*`; this module is what picks a
// pack and what everything else imports.
//
// **`S`, `O` and `R` are live bindings, not constants.** `setLocale` swaps them, and an importer sees the
// swap because ES modules bind by reference. What does *not* see it is a value computed at module
// load: `const NAMES = { side: S.mode.side }` at the top of a file freezes the pack that happened to
// be current when that file was imported. Build such tables inside the component instead.
//
// The pack is chosen once, before anything renders (the extension's `applyLocale`), so nothing on screen is ever
// half translated.
import { FALLBACK_LOCALE, LOCALES, type Locale, type LocaleCode } from './locales/index.ts'

let currentCode: LocaleCode = FALLBACK_LOCALE
let current: Locale = LOCALES[FALLBACK_LOCALE]

/** The popup's words (docs/UI.md §3.1) */
export let S: Locale['S'] = current.S
/** The settings page's words (docs/UI.md §3.2) */
export let O: Locale['O'] = current.O
/** The PDF reader's words (the reader's design §15) */
export let R: Locale['R'] = current.R

/** Who is told of a switch, in the order they asked */
const listeners = new Set<(code: LocaleCode) => void>()

/** Swap the pack, then tell every listener. Everything already rendered has to be rendered again; see the note above */
export function setLocale(code: LocaleCode): void {
  currentCode = code
  current = LOCALES[code]
  S = current.S
  O = current.O
  R = current.R
  for (const listener of listeners) listener(code)
}

/** Which pack is in use; the settings page marks it in its menu */
export function localeInUse(): LocaleCode {
  return currentCode
}

/** `listener` called after every `setLocale`, the new pack in place (the extension hands the core its sentences so);
 *  the function returned stops it */
export function onLocale(listener: (code: LocaleCode) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
