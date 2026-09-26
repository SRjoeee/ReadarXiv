// The extension's appearance on its own pages (the redesign's design, §3): `data-theme` on the root, absent for the
// system's, set before the first paint and again as the setting changes, every colour transition held off for the flip
// (better-ui). The reader applies it its own way (pdf-reader/ui/appearance.ts): it crossfades and dims its pages
import type { Config } from '@/config/schema'
import { getConfig, watchConfig } from '@/config/storage'
import { withoutTransitions } from './controls/transitions'

export function applyTheme(root: HTMLElement, theme: Config['theme']): void {
  if ((root.dataset.theme ?? 'system') === theme) return
  withoutTransitions(root.ownerDocument, () => {
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
  })
}

/**
 * The stored theme applied now, then followed; the returned function stops following. Both `main.tsx` entries
 * await this right before their first render, so a rejected read (an invalidated extension context, same as
 * `resolveLocale` in apply-locale.ts) must not leave the page blank: it paints 'system' and still returns the watcher
 */
export async function followTheme(root: HTMLElement): Promise<() => void> {
  let theme: Config['theme'] = 'system'
  try {
    theme = (await getConfig()).theme
  } catch {
    // Unreadable settings must not leave the page blank: fall back to the system's, as resolveLocale does
  }
  applyTheme(root, theme)
  return watchConfig(config => applyTheme(root, config.theme))
}
