// A menu the popup holds (the redesign's design, §5.3). One that opens downward makes the popup tall enough to hold it:
// the root's min-height, set as it opens and cleared as it closes, so that the window — the toolbar's popup, or the
// floating button's panel, which measures the body (embedded.ts) — measures itself anew each time (round 4's lesson: a
// height kept across a flip of theme cut the English service menu short). One that opens upward, the style menu over the
// foot, is held to the room above its button. The rects are read first and written after: nothing reads what it wrote

/** Under its row, and above the style button (round 4) */
export const MENU_GAP = { down: 4, up: 6 }
/** From the popup's edges */
export const MENU_EDGE = 8

/** Fit an open menu; returns what gives the room back */
export function fitMenu(root: HTMLElement, trigger: HTMLElement, menu: HTMLElement, up: boolean): () => void {
  const top = root.getBoundingClientRect().top
  const row = trigger.getBoundingClientRect()
  if (up) {
    menu.style.maxHeight = `${Math.max(0, Math.floor(row.top - top - MENU_GAP.up - MENU_EDGE))}px`
    return () => { menu.style.maxHeight = '' }
  }
  // what the menu will draw: its rows, up to its cap (popup.css), past which it scrolls
  const tall = Math.min(menu.scrollHeight, Number.parseFloat(getComputedStyle(menu).maxHeight) || Number.POSITIVE_INFINITY)
  root.style.minHeight = `${Math.ceil(row.bottom - top + MENU_GAP.down + tall + MENU_EDGE)}px`
  return () => { root.style.minHeight = '' }
}
