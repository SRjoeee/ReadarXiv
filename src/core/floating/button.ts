// The floating button on every arXiv page the extension knows — abstract, PDF, HTML full text (issue #169, DESIGN
// §4.0c): our mark in a circle docked to the window's edge, with the control panel above it and the settings below.
//
// Ported from reference/read-frog/src/entrypoints/side.content/components/floating-button/index.tsx@9b44f82, with its
// components/hidden-button.tsx and components/floating-button-tooltip.tsx (GPL-3.0), 2026-09-18, modified. **Read
// Frog's is the frame** (the maintainer, 2026-09-18): the column around a main button, the corner controls, the
// tooltips, the sizes and surfaces, and the whole drag — the long press, the threshold, docking to the nearer edge,
// the height kept as a fraction with its clearances, the lock, cancelling on fullscreen.
//
// **How it rests and opens follows Immersive Translate** (the maintainer, same day; measured on its 1.33.1 in
// Chromium 153, none of its code is used): the whole circle shows at rest, at 70 % opacity; the pointer lights it to
// 100 % in 250 ms at once, the other buttons follow only after the pointer has stayed (theirs wait about 500 ms and
// fade in over 110 ms), and leaving is forgiven for 200 ms. Its mark of a translated page is a small green tick at the
// circle's lower right, and so is ours.
//
// What else differs from Read Frog's, and why:
// - **No React, jotai, Tailwind or Base UI.** This runs on every arXiv page a reader opens, where those would be four
//   dependencies and a React root for one button (the reason DESIGN §7.6 gives for the failure widget). Their utility
//   classes are written out below as the CSS Tailwind v4 generates for them, their state as a few variables.
// - **Three buttons, ours**: the control panel (the extension's popup), the main button (translate this page, or open
//   the paper's bilingual version), the settings. Their feedback button is gone. The icons are drawn here, in the
//   style of the popup's own (a 24 px box, 1.8 px round strokes).
// - **A press covers the window with a transparent shield** until it is released. On a PDF the page under the button is
//   Chrome's viewer, another process's frame, and the moves and the release of a press went there rather than to the
//   captured button (measured 2026-09-18, Chromium 153: pointer capture granted, not one pointermove or pointerup
//   after it). With the shield, what lies under the pointer is this document's all through the press.
// - **On a PDF, a second transparent layer lies behind the lit button** and says when the pointer has left it: once
//   the pointer is over the viewer this document hears nothing more — no `mouseleave`, and `:hover` stays true
//   (measured the same day) — so without it the button, once opened, would never fold, nor its menu close.
// - **The lock stops the drag**: theirs keeps the button out of the edge, which ours always is.
// - **Keyboard focus opens it as the pointer does**, and the main button can be reached with Tab: theirs is a `div`.

/** A press this long turns into a drag without moving (Read Frog) */
const LONG_PRESS_MS = 350
/** …and so does a movement this far, without waiting (Read Frog) */
const DRAG_START_PX = 6
/** Where the dock may come to rest: never above this, nor lower than the window's height less the second (Read Frog) */
const TOP_CLEARANCE_PX = 30
const BOTTOM_CLEARANCE_PX = 200
/**
 * How long the pointer stays on the main button before the other buttons come out. Immersive Translate waits about
 * 500 ms (measured); a little sooner here, right after the 250 ms the light-up takes, so the two read as one motion
 */
const OPEN_DWELL_MS = 400
/** How long after the pointer leaves before it folds again (Immersive Translate, measured) */
const LEAVE_GRACE_MS = 200

/** The class of the host element the button's shadow root hangs on; the one node of ours outside a translation */
export const FLOATING_CLASS = 'axt-floating'

export type DockSide = 'left' | 'right'
export interface DockPlacement {
  side: DockSide
  /** Where the dock's top sits, as a fraction of the window's height */
  position: number
  locked: boolean
}

/** What the main button does on this page */
export type MainAction =
  /** Abstract and PDF pages: a real link to the HTML full text, so a middle click or "copy link" work as on any link */
  | { kind: 'link'; href: string }
  /** The HTML full text: translate, or show the original again */
  | { kind: 'toggle'; run: () => void }
  /** The paper has no HTML version: the button is there, disabled, and its tooltip says why */
  | { kind: 'none' }

/** Every word the button shows or announces, in the reader's interface language */
export interface FloatingButtonStrings {
  /** The main button's name and tooltip: what a click does now, or why it can do nothing */
  main: string
  panel: string
  settings: string
  options: string
  lock: string
  unlock: string
  hideForNow: string
  hideAlways: string
}

export interface FloatingButtonOptions {
  main: MainAction
  /** A link opens in a new tab unless the reader chose otherwise; ignored by the other kinds */
  newTab: boolean
  iconUrl: string
  placement: DockPlacement
  strings: FloatingButtonStrings
  /** A drag that ended, or the lock toggled: the host saves it */
  onPlacement: (placement: DockPlacement) => void
  onPanel: () => void
  onSettings: () => void
  /** Hidden from the close menu, after the button has taken itself off the page */
  onHide: (scope: 'now' | 'always') => void
}

export interface FloatingButton {
  relabel: (strings: FloatingButtonStrings) => void
  retarget: (newTab: boolean) => void
  /** The page shows its translation (the tick), or does not */
  activate: (active: boolean) => void
  /** A placement saved elsewhere (another tab's drag): taken unless a drag is under way here */
  place: (placement: DockPlacement) => void
  remove: () => void
}

/** Our own glyphs, in the popup's style: a 24 px box, round strokes */
const ICONS = {
  /** Two sliders in the rounded frame of the popup's mode marks */
  panel: '<rect x="3.5" y="4.5" width="17" height="15" rx="3.5"/><path d="M7.5 9.5h2.2M14.3 9.5h2.2M7.5 14.5h5.2"/><circle cx="12" cy="9.5" r="1.9"/><circle cx="15" cy="14.5" r="1.9"/>',
  /** An eight-toothed cog: root arcs of radius 7.1, tooth tops of 9.4, generated rather than traced */
  settings: '<path d="M10.16 5.14 10.45 2.73A9.4 9.4 0 0 1 13.55 2.73L13.84 5.14A7.1 7.1 0 0 1 15.55 5.85L17.46 4.35A9.4 9.4 0 0 1 19.65 6.54L18.15 8.45A7.1 7.1 0 0 1 18.86 10.16L21.27 10.45A9.4 9.4 0 0 1 21.27 13.55L18.86 13.84A7.1 7.1 0 0 1 18.15 15.55L19.65 17.46A9.4 9.4 0 0 1 17.46 19.65L15.55 18.15A7.1 7.1 0 0 1 13.84 18.86L13.55 21.27A9.4 9.4 0 0 1 10.45 21.27L10.16 18.86A7.1 7.1 0 0 1 8.45 18.15L6.54 19.65A9.4 9.4 0 0 1 4.35 17.46L5.85 15.55A7.1 7.1 0 0 1 5.14 13.84L2.73 13.55A9.4 9.4 0 0 1 2.73 10.45L5.14 10.16A7.1 7.1 0 0 1 5.85 8.45L4.35 6.54A9.4 9.4 0 0 1 6.54 4.35L8.45 5.85A7.1 7.1 0 0 1 10.16 5.14Z"/><circle cx="12" cy="12" r="2.8"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  lockOpen: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 7.7-1.5"/>',
  tick: '<path d="M2.5 6.3l2.3 2.3 4.7-5"/>',
} as const

/** One icon, sized by the style sheet; the two small corner controls are drawn heavier, as Read Frog's are */
const svg = (shapes: string, stroke = 1.8, box = 24) =>
  `<svg viewBox="0 0 ${box} ${box}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes}</svg>`

// Read Frog's Tailwind classes as the CSS Tailwind v4 generates for them (their theme's `--rf-*` colours and
// Tailwind's neutral scale, light and dark); the circle, the tick and the timing of rest and hover are ours, the
// latter after Immersive Translate. `--brand` is the crimson of our mark
const STYLE = `
:host { all: initial }
.dock {
  --border: oklch(0.92 0.004 286.32); --surface: #fff; --hidden-fg: oklch(0.439 0 0); --hidden-hover: oklch(0.97 0 0);
  --control: oklch(0.87 0 0); --control-hover: oklch(0.556 0 0);
  --tip-bg: oklch(0.141 0.005 285.823); --tip-fg: #fff;
  --popover: #fff; --popover-fg: oklch(0.141 0.005 285.823); --accent: oklch(0.967 0.001 286.375); --accent-fg: oklch(0.21 0.006 285.885);
  --brand: #aa142d; --active: #2fa84f;
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --ease: cubic-bezier(0.4, 0, 0.2, 1);
  position: fixed; z-index: 2147483647; display: flex; flex-direction: column; gap: 8px;
  font-family: ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased;
  /* The column's box is mostly empty — the folded buttons, the gaps — and must not take the page's clicks: only
     what is drawn answers the pointer (Immersive Translate's container does the same) */
  pointer-events: none;
}
.main, .hidden-button, .menu, .shield { pointer-events: auto }
@media (prefers-color-scheme: dark) {
  .dock {
    --border: oklch(1 0 0 / 10%); --surface: oklch(0.205 0 0); --hidden-fg: oklch(0.708 0 0); --hidden-hover: oklch(0.269 0 0);
    --control: oklch(0.371 0 0); --tip-bg: oklch(0.985 0 0); --tip-fg: oklch(0.141 0.005 285.823);
    --popover: oklch(0.21 0.006 285.885); --popover-fg: oklch(0.985 0 0); --accent: oklch(0.274 0.006 286.033); --accent-fg: oklch(0.985 0 0);
    --brand: #d2364e;
  }
}
@media print { .dock { display: none } }
.dock[hidden] { display: none }
.dock[data-side="right"] { right: 0; align-items: flex-end }
.dock[data-side="left"] { left: 0; align-items: flex-start }
.dock[data-dragging="yes"] { align-items: center }
/* pl-6 / pr-6 while open: the two small controls stand out from the main button, and the pointer may cross to them */
.dock[data-expanded="yes"][data-side="right"] { padding-left: 24px }
.dock[data-expanded="yes"][data-side="left"] { padding-right: 24px }

button { margin: 0; padding: 0; border: 0; background: none; font: inherit; color: inherit }
a { color: inherit; text-decoration: none }
svg { display: block }

/* HiddenButton: out of sight and out of reach until the dock opens, then a short fade and slide from the edge */
.hidden-button {
  position: relative; display: flex; box-sizing: border-box; padding: 6px; cursor: pointer;
  border: 1px solid var(--border); border-radius: 9999px; background: var(--surface); color: var(--hidden-fg);
  box-shadow: var(--shadow-lg);
  transition: opacity 110ms ease-out, translate 160ms var(--ease), visibility 110ms;
}
.hidden-button:hover { background: var(--hidden-hover) }
.hidden-button > svg { width: 20px; height: 20px }
.dock[data-side="right"] .hidden-button { margin-right: 8px }
.dock[data-side="left"] .hidden-button { margin-left: 8px }
.dock[data-expanded="no"] .hidden-button { opacity: 0; visibility: hidden; pointer-events: none }
.dock[data-expanded="no"][data-side="right"] .hidden-button { translate: 8px 0 }
.dock[data-expanded="no"][data-side="left"] .hidden-button { translate: -8px 0 }

/* FloatingButtonTooltip: beside the button, on the side away from the edge, 8px off; Base UI's enter and exit */
.tip {
  position: absolute; top: 50%; pointer-events: none; white-space: nowrap; max-width: 320px; box-sizing: border-box;
  padding: 6px 12px; border-radius: 8px; background: var(--tip-bg); color: var(--tip-fg); font-size: 12px; line-height: 16px;
  font-weight: 400; opacity: 0; visibility: hidden; scale: 0.95;
  transition: opacity 150ms ease, scale 150ms ease, translate 150ms ease, visibility 150ms;
}
.dock[data-side="right"] .tip { right: calc(100% + 8px); translate: 8px -50% }
.dock[data-side="left"] .tip { left: calc(100% + 8px); translate: -8px -50% }
.hidden-button:hover .tip, .hidden-button:focus-visible .tip, .main:hover .tip, .main:focus-visible .tip { opacity: 1; visibility: visible; scale: 1; translate: 0 -50% }
/* Once the two corner controls are out, the main button's tooltip stands clear of them */
.dock[data-expanded="yes"] .main .tip { right: calc(100% + 28px) }
.dock[data-expanded="yes"][data-side="left"] .main .tip { right: auto; left: calc(100% + 28px) }

/* The main button: a tab against the edge holding the circle, whole at rest and lit by the pointer */
.anchor { position: relative }
/* Open, the anchor reaches across the two gaps to its neighbours, so a pointer travelling from the main button to
   the panel or the settings never leaves the dock on the way, however slowly it goes */
.dock[data-expanded="yes"] .anchor { pointer-events: auto; margin-block: -8px; padding-block: 8px }
.dock[data-expanded="yes"] .control.options { top: 4px }
.dock[data-expanded="yes"] .control.lock { bottom: 4px }
.dock[data-expanded="yes"] .menu { top: 4px }
.main {
  position: relative; display: flex; align-items: center; box-sizing: border-box; height: 40px; width: 44px;
  border: 1px solid var(--border); background: var(--surface); box-shadow: var(--shadow-lg); cursor: pointer;
  touch-action: none; -webkit-user-drag: none; user-select: none; opacity: 0.7;
  transition: opacity 250ms ease-out;
}
.dock[data-lit="yes"] .main { opacity: 1 }
.dock[data-side="right"] .main { justify-content: flex-start; border-right: 0; border-radius: 9999px 0 0 9999px }
.dock[data-side="left"] .main { justify-content: flex-end; border-left: 0; border-radius: 0 9999px 9999px 0 }
/* Our mark is a book, not a disc: it sits in a white circle with a ring of its own crimson */
.disc {
  position: relative; display: grid; place-items: center; box-sizing: border-box; width: 32px; height: 32px;
  border-radius: 50%; border: 1.5px solid var(--brand); background: #fff; pointer-events: none;
  transition: box-shadow 250ms ease-out;
}
.dock[data-side="right"] .disc { margin-left: 4px }
.dock[data-side="left"] .disc { margin-right: 4px }
.dock[data-lit="yes"] .disc { box-shadow: 0 0 0 3px color-mix(in oklab, var(--brand) 16%, transparent) }
.disc img { display: block; width: 22px; height: auto }
/* The page shows its translation: Immersive Translate's tick, at the circle's lower right */
.tick {
  position: absolute; right: -3px; bottom: -3px; display: grid; place-items: center; box-sizing: border-box;
  width: 13px; height: 13px; border-radius: 50%; border: 1.5px solid #fff; background: var(--active); color: #fff;
  scale: 0; transition: scale 180ms var(--ease);
}
.tick svg { width: 8px; height: 8px }
.dock[data-active="yes"] .tick { scale: 1 }
/* Nothing to open: the circle greys, and the tooltip says why */
.main[aria-disabled="true"] { cursor: default }
.main[aria-disabled="true"] .disc { border-color: var(--control); }
.main[aria-disabled="true"] .disc img { filter: grayscale(1); opacity: 0.45 }
.dock[data-dragging="yes"] .main {
  width: 40px; justify-content: center; border: 1px solid var(--border); border-radius: 9999px;
  opacity: 1; cursor: grabbing;
}
.dock[data-dragging="yes"] .disc { margin: 0 }
.dock[data-dragging="yes"] .tip { display: none }
.main:focus-visible, .hidden-button:focus-visible, .control:focus-visible { outline: 2px solid oklch(0.705 0.015 286.067); outline-offset: 2px }

/* The close trigger above the main button's outer corner and the lock below it: unseen until the dock opens */
.control {
  position: absolute; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px;
  cursor: pointer; color: var(--control); visibility: hidden; pointer-events: none;
  transition: color 300ms var(--ease), left 300ms var(--ease), right 300ms var(--ease), transform 300ms var(--ease);
}
.control > svg { width: 12px; height: 12px }
.control:hover, .control:active { color: var(--control-hover) }
.control:hover { scale: 1.1 }
.control:active { scale: 0.9 }
.control.options { top: -4px }
.control.lock { bottom: -4px }
.dock[data-side="right"] .control { left: 0 }
.dock[data-side="left"] .control { right: 0 }
.dock[data-expanded="yes"][data-side="right"] .control { left: -24px }
.dock[data-expanded="yes"][data-side="left"] .control { right: -24px }
.dock[data-expanded="yes"] .control { visibility: visible; pointer-events: auto }

/* DropdownMenuContent, opened from the close trigger: beside it, away from the edge, aligned to its top */
.menu {
  position: absolute; top: -4px; z-index: 1; box-sizing: border-box; padding: 4px; min-width: 0; white-space: nowrap;
  border-radius: 10px; background: var(--popover); color: var(--popover-fg);
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1), 0 0 0 1px color-mix(in oklab, var(--popover-fg) 10%, transparent);
  animation: axt-menu-in 100ms ease;
}
.menu[hidden] { display: none }
.dock[data-side="right"] .menu { right: calc(100% + 28px); transform-origin: right top }
.dock[data-side="left"] .menu { left: calc(100% + 28px); transform-origin: left top }
.menu button {
  display: flex; align-items: center; gap: 6px; width: 100%; box-sizing: border-box; padding: 4px 6px;
  border-radius: 8px; font-size: 14px; line-height: 20px; cursor: default; user-select: none; outline: none; text-align: start;
}
.menu button:hover, .menu button:focus-visible { background: var(--accent); color: var(--accent-fg) }
@keyframes axt-menu-in { from { opacity: 0; scale: 0.95 } }
.dock[data-dragging="yes"] .hidden-button, .dock[data-dragging="yes"] .control, .dock[data-dragging="yes"] .menu { display: none }
/* Over the whole window for as long as a press lasts, inside the dock so the pointer never leaves it (see the header) */
.shield { position: fixed; inset: 0; z-index: 2; cursor: pointer }
.shield[hidden] { display: none }
/* Behind the buttons and over the whole window while the button is lit on a PDF: where the pointer goes when it leaves */
.catcher { position: fixed; inset: 0; z-index: -1; pointer-events: auto }
.catcher[hidden] { display: none }
.dock[data-dragging="yes"] .shield { cursor: grabbing }
@media (prefers-reduced-motion: reduce) { .dock *, .dock { transition: none !important; animation: none !important } }
`

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)

/** A press on the main button, from pointerdown until it is released or turns into a drag (Read Frog's `PendingDragState`) */
interface Press {
  pointerId: number
  startX: number
  startY: number
  x: number
  y: number
  offsetX: number
  offsetY: number
  /** How far the main button sits below the dock's top: the drop keeps the button, not the dock, where it was let go */
  mainOffsetY: number
  width: number
  height: number
  active: boolean
  timer: ReturnType<typeof setTimeout>
}

/**
 * Draw the button into `host` (a shadow root of its own) and answer the reader.
 *
 * The drag is Read Frog's: a press of `LONG_PRESS_MS` or a movement past `DRAG_START_PX` starts one, the pointer is
 * captured so a fast drag cannot escape the button, the button follows the pointer as a circle, and on release the
 * side is whichever half of the window its centre ended in and the dock's top is kept as a fraction of the window's
 * height, held away from both edges. A press that never became a drag is a click.
 */
export function mountFloatingButton(doc: Document, host: HTMLElement, options: FloatingButtonOptions): FloatingButton {
  const view = doc.defaultView ?? window
  const root = host.attachShadow({ mode: 'open' })
  const action = options.main
  let strings = options.strings
  let placement: DockPlacement = { ...options.placement }

  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, html = '') => {
    const element = doc.createElement(tag)
    element.className = className
    element.innerHTML = html
    return element
  }
  const style = make('style', '')
  style.textContent = STYLE
  const dock = make('div', 'dock')
  /** Every button carries its name as `aria-label`; the tooltip is the same words for the eye */
  const tip = () => {
    const element = make('span', 'tip')
    element.setAttribute('aria-hidden', 'true')
    return element
  }

  const panel = make('button', 'hidden-button panel', svg(ICONS.panel))
  panel.type = 'button'
  const panelTip = tip()
  panel.append(panelTip)

  const anchor = make('div', 'anchor')
  // A link where there is somewhere to go, a button where there is something to do; one type for the listeners below
  const main: HTMLElement = action.kind === 'link' ? make('a', 'main') : make('button', 'main')
  if (main instanceof HTMLButtonElement) main.type = 'button'
  if (action.kind === 'none') main.setAttribute('aria-disabled', 'true')
  main.draggable = false
  const disc = make('span', 'disc')
  const mark = make('img', '')
  mark.src = options.iconUrl
  mark.alt = ''
  mark.draggable = false
  disc.append(mark, make('span', 'tick', svg(ICONS.tick, 2.2, 12)))
  const mainTip = tip()
  main.append(disc, mainTip)
  const optionsButton = make('button', 'control options', svg(ICONS.close, 3))
  optionsButton.type = 'button'
  optionsButton.setAttribute('aria-haspopup', 'menu')
  const lock = make('button', 'control lock')
  lock.type = 'button'
  const menu = make('div', 'menu')
  menu.setAttribute('role', 'menu')
  menu.tabIndex = -1
  menu.hidden = true
  const hideNow = make('button', 'hide-now')
  const hideAlways = make('button', 'hide-always')
  for (const item of [hideNow, hideAlways]) {
    item.type = 'button'
    item.setAttribute('role', 'menuitem')
    item.tabIndex = -1
  }
  menu.append(hideNow, hideAlways)
  anchor.append(main, optionsButton, lock, menu)

  const settings = make('button', 'hidden-button settings', svg(ICONS.settings))
  settings.type = 'button'
  const settingsTip = tip()
  settings.append(settingsTip)
  const shield = make('div', 'shield')
  shield.hidden = true
  /** Only where the page under the button is another process's frame: Chrome's PDF viewer (see the header) */
  const catcher = doc.contentType === 'application/pdf' ? make('div', 'catcher') : null
  if (catcher) catcher.hidden = true
  dock.append(panel, anchor, settings, shield, ...(catcher ? [catcher] : []))
  root.append(style, dock)

  /** The pointer is over the dock: the circle is lit at once, the rest waits for `OPEN_DWELL_MS` */
  let lit = false
  let hovered = false
  /** Keyboard focus inside the dock opens it too, at once; a mouse click that leaves focus on a control does not */
  let focused = false
  let menuOpen = false
  let active = false
  let press: Press | null = null
  let dragging = false
  let preview: { x: number; y: number } | null = null
  /** The click that follows a drag's release must not act */
  let swallowClick = false
  let fullscreen = doc.fullscreenElement != null
  /** The page's own cursor and selection, put back when a drag ends (Read Frog) */
  let bodyBefore: { userSelect: string; cursor: string } | null = null
  /** The lock state the glyph was last drawn for: `draw` runs on every pointermove of a drag */
  let lockDrawn: boolean | null = null
  let openTimer: ReturnType<typeof setTimeout> | null = null
  let leaveTimer: ReturnType<typeof setTimeout> | null = null
  const clearTimers = () => {
    if (openTimer !== null) clearTimeout(openTimer)
    if (leaveTimer !== null) clearTimeout(leaveTimer)
    openTimer = leaveTimer = null
  }

  const expanded = () => !dragging && (hovered || focused || menuOpen)

  const draw = () => {
    const open = expanded()
    dock.dataset.side = placement.side
    dock.dataset.lit = lit || open || dragging ? 'yes' : 'no'
    dock.dataset.expanded = open ? 'yes' : 'no'
    dock.dataset.dragging = dragging ? 'yes' : 'no'
    dock.dataset.active = active ? 'yes' : 'no'
    dock.hidden = fullscreen
    if (catcher) catcher.hidden = dragging || !(lit || open)
    if (dragging && preview) {
      dock.style.left = `${preview.x}px`
      dock.style.right = 'auto'
      dock.style.top = `${preview.y}px`
    } else {
      dock.style.left = ''
      dock.style.right = ''
      dock.style.top = `${clamp(placement.position, 0, 1) * 100}vh`
    }
    lock.setAttribute('aria-label', placement.locked ? strings.unlock : strings.lock)
    if (lockDrawn !== placement.locked) {
      lockDrawn = placement.locked
      lock.innerHTML = svg(placement.locked ? ICONS.lock : ICONS.lockOpen, 3)
    }
    menu.hidden = !menuOpen
    optionsButton.setAttribute('aria-expanded', menuOpen ? 'true' : 'false')
  }

  const label = () => {
    main.setAttribute('aria-label', strings.main)
    mainTip.textContent = strings.main
    panel.setAttribute('aria-label', strings.panel)
    panelTip.textContent = strings.panel
    settings.setAttribute('aria-label', strings.settings)
    settingsTip.textContent = strings.settings
    optionsButton.setAttribute('aria-label', strings.options)
    hideNow.textContent = strings.hideForNow
    hideAlways.textContent = strings.hideAlways
  }

  const retarget = (newTab: boolean) => {
    if (action.kind !== 'link' || !(main instanceof HTMLAnchorElement)) return
    main.href = action.href
    if (newTab) {
      main.target = '_blank'
      main.rel = 'noopener'
    } else {
      main.removeAttribute('target')
      main.removeAttribute('rel')
    }
  }

  // Lighting and opening. The pointer lights the circle the moment it arrives; the other buttons come out once it
  // has stayed, so a pointer crossing the button on its way elsewhere opens nothing (Immersive Translate)
  main.addEventListener('mouseenter', () => {
    if (dragging) return
    lit = true
    draw()
    if (openTimer === null && !hovered) {
      openTimer = setTimeout(() => {
        openTimer = null
        hovered = true
        draw()
      }, OPEN_DWELL_MS)
    }
  })
  /** The pointer is off the buttons: fold after the grace, unless it comes back. The menu holds the dock open */
  const left = () => {
    if (menuOpen || dragging || leaveTimer !== null) return
    if (openTimer !== null) clearTimeout(openTimer)
    openTimer = null
    leaveTimer = setTimeout(() => {
      leaveTimer = null
      lit = false
      hovered = false
      draw()
    }, LEAVE_GRACE_MS)
  }
  // `mouseover` rather than `mouseenter` on the dock: on a PDF the catcher is inside the dock, so the pointer goes
  // from a button to the catcher and back without ever entering or leaving the dock itself
  dock.addEventListener('mouseover', event => {
    if (event.target === catcher) return left()
    if (leaveTimer !== null) clearTimeout(leaveTimer)
    leaveTimer = null
  })
  dock.addEventListener('mouseleave', left)
  dock.addEventListener('focusin', event => {
    focused = (event.target as Element).matches(':focus-visible')
    draw()
  })
  dock.addEventListener('focusout', event => {
    if (dock.contains(event.relatedTarget as Node | null)) return
    focused = false
    draw()
  })

  const items = [hideNow, hideAlways]
  const setMenu = (open: boolean, focusFirst = false) => {
    menuOpen = open
    // Closed, the dock stays open only while the pointer is still over it (Read Frog's keeps it open until the next
    // leave, which never comes when the pointer left while the menu was up)
    if (!open) lit = hovered = dock.matches(':hover')
    draw()
    if (open) (focusFirst ? items[0]! : menu).focus()
  }
  optionsButton.addEventListener('click', event => {
    // `detail` is 0 for a click made with the keyboard: then the first item takes focus, as a menu button's should
    setMenu(!menuOpen, event.detail === 0)
  })
  menu.addEventListener('keydown', event => {
    const at = items.indexOf(root.activeElement as HTMLButtonElement)
    const move = (to: number) => {
      event.preventDefault()
      items[(to + items.length) % items.length]!.focus()
    }
    if (event.key === 'ArrowDown') move(at + 1)
    else if (event.key === 'ArrowUp') move(at < 0 ? items.length - 1 : at - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(items.length - 1)
    else if (event.key === 'Escape') {
      event.preventDefault()
      setMenu(false)
      optionsButton.focus()
    } else if (event.key === 'Tab') setMenu(false)
  })
  const onOutside = (event: Event) => {
    if (!menuOpen) return
    const path = event.composedPath()
    if (!path.includes(menu) && !path.includes(optionsButton)) setMenu(false)
  }
  doc.addEventListener('pointerdown', onOutside, true)
  const hide = (scope: 'now' | 'always') => {
    button.remove()
    options.onHide(scope)
  }
  hideNow.addEventListener('click', () => hide('now'))
  hideAlways.addEventListener('click', () => hide('always'))

  lock.addEventListener('click', () => {
    placement = { ...placement, locked: !placement.locked }
    draw()
    options.onPlacement(placement)
  })
  panel.addEventListener('click', () => options.onPanel())
  settings.addEventListener('click', () => options.onSettings())

  // The drag (Read Frog's `handlePointerDown` / `handlePointerMove` / `finishPointerInteraction`)
  const previewOf = (p: Press) => ({
    x: clamp(p.x - p.offsetX, 0, Math.max(0, view.innerWidth - p.width)),
    y: clamp(p.y - p.offsetY, 0, Math.max(0, view.innerHeight - p.height)),
  })
  const restoreBody = () => {
    if (bodyBefore === null) return
    doc.body.style.userSelect = bodyBefore.userSelect
    doc.body.style.cursor = bodyBefore.cursor
    bodyBefore = null
  }
  const startDrag = () => {
    if (press === null || press.active) return
    press.active = true
    preview = previewOf(press)
    clearTimers()
    hovered = false
    menuOpen = false
    dragging = true
    // The page must not select text under a drag, and the cursor says what is happening (Read Frog)
    bodyBefore = { userSelect: doc.body.style.userSelect, cursor: doc.body.style.cursor }
    doc.body.style.userSelect = 'none'
    doc.body.style.cursor = 'grabbing'
    draw()
  }

  main.addEventListener('pointerdown', event => {
    swallowClick = false
    if (event.pointerType === 'mouse' && event.button !== 0) return
    // Locked, it stays where it is: the press is an ordinary click
    if (placement.locked) return
    const mainBox = main.getBoundingClientRect()
    const dockBox = dock.getBoundingClientRect()
    event.preventDefault()
    main.setPointerCapture?.(event.pointerId)
    shield.hidden = false
    press = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - mainBox.left,
      offsetY: event.clientY - mainBox.top,
      mainOffsetY: mainBox.top - dockBox.top,
      width: mainBox.width || 40,
      height: mainBox.height || 40,
      active: false,
      timer: setTimeout(startDrag, LONG_PRESS_MS),
    }
  })

  main.addEventListener('pointermove', event => {
    if (press === null || press.pointerId !== event.pointerId) return
    press.x = event.clientX
    press.y = event.clientY
    if (!press.active && Math.hypot(press.x - press.startX, press.y - press.startY) > DRAG_START_PX) startDrag()
    if (!press.active) return
    preview = previewOf(press)
    draw()
  })

  const finish = (event: PointerEvent) => {
    if (press === null || press.pointerId !== event.pointerId) return
    clearTimeout(press.timer)
    const ended = press
    press = null
    shield.hidden = true
    main.releasePointerCapture?.(event.pointerId)
    if (!ended.active) return
    const last = preview ?? previewOf(ended)
    // The nearer half of the window decides the side; the dock's top is kept as a fraction of the window's height,
    // held away from both edges, so a window of another size still shows it (Read Frog's `getNormalizedFloatingContainerTop`)
    const height = Math.max(1, view.innerHeight)
    const highest = Math.max(TOP_CLEARANCE_PX, height - BOTTOM_CLEARANCE_PX)
    placement = {
      ...placement,
      side: last.x + ended.width / 2 < view.innerWidth / 2 ? 'left' : 'right',
      position: clamp(last.y - ended.mainOffsetY, TOP_CLEARANCE_PX, highest) / height,
    }
    preview = null
    dragging = false
    swallowClick = true
    lit = false
    restoreBody()
    draw()
    options.onPlacement(placement)
  }
  main.addEventListener('pointerup', finish)
  main.addEventListener('pointercancel', finish)
  main.addEventListener('click', event => {
    // The press that became a drag is not a click: nothing opens because the reader moved the button
    if (swallowClick) {
      swallowClick = false
      event.preventDefault()
      return
    }
    if (action.kind === 'toggle') action.run()
  })

  // Fullscreen hides the button, and a drag it interrupts never sees its release: cancel it here, or the page keeps
  // the grabbing cursor and the selection lock after fullscreen ends (Read Frog)
  const onFullscreen = () => {
    fullscreen = doc.fullscreenElement != null
    if (fullscreen) {
      if (press !== null) clearTimeout(press.timer)
      press = null
      shield.hidden = true
      preview = null
      dragging = false
      clearTimers()
      lit = false
      hovered = false
      menuOpen = false
      restoreBody()
    }
    draw()
  }
  doc.addEventListener('fullscreenchange', onFullscreen)

  label()
  retarget(options.newTab)
  draw()

  const button: FloatingButton = {
    relabel: next => {
      strings = next
      label()
      draw()
    },
    retarget,
    activate: next => {
      active = next
      draw()
    },
    place: next => {
      if (dragging) return
      placement = { ...next }
      draw()
    },
    remove: () => {
      if (press !== null) clearTimeout(press.timer)
      press = null
      clearTimers()
      restoreBody()
      doc.removeEventListener('fullscreenchange', onFullscreen)
      doc.removeEventListener('pointerdown', onOutside, true)
      host.remove()
    },
  }
  return button
}
