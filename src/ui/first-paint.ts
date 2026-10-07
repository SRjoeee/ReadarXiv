// What the popup and the settings page set before their first paint: the interface's language (UI.md §6) and the
// extension's appearance (the redesign's design, §3), from **one** read of the settings. The paint waits on this, and
// reading once for each put two storage reads in series in front of it.
import type { Config } from '@/config/schema'
import { getConfig } from '@/config/storage'
import { applyPageLocale } from './apply-locale'
import { followTheme } from './theme'

/**
 * Applies both, and follows the theme from then on; the returned function stops following. A read that fails (an
 * invalidated extension context) must not leave the page blank: the browser's language and the system's appearance
 * apply, and the theme is still followed
 */
export async function prepareFirstPaint(root: HTMLElement, title?: (brand: string) => string): Promise<() => void> {
  let config: Config | undefined
  try {
    config = await getConfig()
  } catch {
    // each falls back on its own below
  }
  applyPageLocale(config?.uiLanguage, title)
  return followTheme(root, config?.theme ?? 'system')
}
