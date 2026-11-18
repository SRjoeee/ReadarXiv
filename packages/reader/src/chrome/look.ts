// The reader's look, read from its preferences (the reader's design, §4.3): the theme set on <html> (`data-theme`; none for
// the system's) and whether the pages are dimmed (`data-axt-dim`). The chrome applies them (appearance.ts, App.tsx
// useAppearance); they import nothing, so that a host's page can set the same marks before the reader's code has loaded
// (`@readarxiv/reader/early`) and its first paint is the look chosen.

export type Appearance = 'light' | 'dark' | 'system'

/** the `data-theme` an appearance sets on <html>; null for the system's, which sets none */
export const themeOf = (appearance: Appearance): 'light' | 'dark' | null =>
  appearance === 'system' ? null : appearance

/** whether the pages are dimmed: the preference, in a dark look (the one chosen, or the system's) */
export const dimmed = (appearance: Appearance, systemDark: boolean, dimPages: boolean): boolean =>
  dimPages && (appearance === 'dark' || (appearance === 'system' && systemDark))
