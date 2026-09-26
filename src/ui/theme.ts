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

/** The stored theme applied now, then followed; the returned function stops following */
export async function followTheme(root: HTMLElement): Promise<() => void> {
  applyTheme(root, (await getConfig()).theme)
  return watchConfig(config => applyTheme(root, config.theme))
}
