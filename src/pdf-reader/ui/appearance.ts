// The reader's appearance (the reader's design, §4.3): light, dark or the system's, and the pages dimmed in the dark
// when the reader wants them so. Applied to <html> as data-theme (absent: the system's) and data-axt-dim; a change
// after the first paint is one crossfade of the whole page, not element by element, unless motion is reduced
export type Appearance = 'light' | 'dark' | 'system'

export const themeOf = (appearance: Appearance): 'light' | 'dark' | null => (appearance === 'system' ? null : appearance)

export const dimmed = (appearance: Appearance, systemDark: boolean, dimPages: boolean): boolean =>
  dimPages && (appearance === 'dark' || (appearance === 'system' && systemDark))

export function applyAppearance(root: HTMLElement, look: { theme: 'light' | 'dark' | null; dim: boolean }, animate: boolean): void {
  const apply = () => {
    if (look.theme) root.dataset.theme = look.theme
    else delete root.dataset.theme
    root.toggleAttribute('data-axt-dim', look.dim)
  }
  type Transition = { ready?: Promise<unknown>; finished?: Promise<unknown>; updateCallbackDone?: Promise<unknown> }
  const doc = root.ownerDocument as Document & { startViewTransition?: (run: () => void) => Transition | undefined }
  if (!animate || !doc.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply()
    return
  }
  const transition = doc.startViewTransition(apply)
  // a crossfade cut short (the window resized as it ran) is no fault: the page is in its new appearance already
  for (const step of [transition?.ready, transition?.finished, transition?.updateCallbackDone]) step?.catch(() => {})
}
