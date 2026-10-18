// A shortcut label (the redesign's design, §5.1; Part 3's interfaces; the maintainer, 2026-09-26): 11 px, 3 by 5 px in,
// radius 5; the ink's 9 % behind ink-2, and on a brand button its chip behind white (controls.css .kbd). A visible
// hint: the control it sits in is named by its own words, so the label is hidden from assistive technology
import type { ReactNode } from 'react'

export function Kbd({ children }: { children: ReactNode }) {
  // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a kbd takes no focus; the label is a visible hint beside a control named by its own words
  return <kbd aria-hidden="true" className="kbd">{children}</kbd>
}
