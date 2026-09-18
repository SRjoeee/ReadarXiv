// The floating entry on arXiv's PDF page (issue #169): Read Frog's floating button, carrying our mark and opening the
// paper's bilingual version.
//
// Ported from reference/read-frog/src/entrypoints/side.content/components/floating-button/index.tsx@9b44f82, with its
// components/hidden-button.tsx and components/floating-button-tooltip.tsx (GPL-3.0), 2026-09-18, modified. At the
// maintainer's request (2026-09-18) the shape, the sizes, the colours, the motion and the interaction are theirs, to
// be adjusted to our style afterwards. What changed:
// - **No React, jotai, Tailwind or Base UI.** This runs on every arXiv PDF a reader opens, where those would be four
//   dependencies and a React root for one button (the reason DESIGN §7.6 gives for the failure widget). Their utility
//   classes are written out below as the CSS Tailwind v4 generates for them, their state as a few variables.
// - **Their mascot is our mark**, and the buttons do our things: the main button and the one above it open the
//   bilingual version (Read Frog's default `clickAction` is `translate`, so theirs do one thing too), the close menu
//   hides the entry for now or for good, feedback goes to our issue tracker and carries nothing about the page.
// - **The lock also stops the drag.** Theirs is labelled "Lock position" and keeps the button out of the edge, yet a
//   drag still moves it; here a locked button cannot be dragged away.
// - **Keyboard focus opens it as hovering does**, and the main button is a link, reachable with Tab: theirs is a
//   `div` a keyboard cannot reach.
// - **A press covers the window with a transparent shield** until it is released. On a PDF the page under the button is
//   Chrome's viewer, another process's frame, and the moves and the release of a press went there rather than to the
//   captured button (measured 2026-09-18, Chromium 153: pointer capture granted, not one pointermove or pointerup
//   after it). With the shield, what lies under the pointer is this document's all through the press.
// - **Their icons are Tabler's** (MIT, notice below), all but the translate glyph, which is Remix Icon's in theirs;
//   since remixicon 4.9 that licence adds restrictions GPL-3.0 does not allow, so Tabler's `language` stands in.

/** A press this long turns into a drag without moving (reference) */
const LONG_PRESS_MS = 350
/** …and so does a movement this far, without waiting (reference) */
const DRAG_START_PX = 6
/** Where the dock may come to rest: never above this, nor lower than the window's height less the second (reference) */
const TOP_CLEARANCE_PX = 30
const BOTTOM_CLEARANCE_PX = 200

export type DockSide = 'left' | 'right'
export interface DockPlacement {
  side: DockSide
  /** Where the dock's top sits, as a fraction of the window's height */
  position: number
  locked: boolean
}

/** Every word the entry shows or announces, in the reader's interface language */
export interface FloatingEntryStrings {
  /** What the main button and the one above it open: their accessible name, and the tooltip of the one above */
  open: string
  options: string
  lock: string
  unlock: string
  settings: string
  feedback: string
  hideForNow: string
  hideAlways: string
}

export interface FloatingEntryOptions {
  href: string
  newTab: boolean
  iconUrl: string
  feedbackUrl: string
  placement: DockPlacement
  strings: FloatingEntryStrings
  /** A drag that ended, or the lock toggled: the host saves it */
  onPlacement: (placement: DockPlacement) => void
  onSettings: () => void
  /** Hidden from the close menu, after the entry has taken itself off the page */
  onHide: (scope: 'now' | 'always') => void
}

export interface FloatingEntry {
  relabel: (strings: FloatingEntryStrings) => void
  retarget: (newTab: boolean) => void
  /** A placement saved elsewhere (another tab's drag): taken unless a drag is under way here */
  place: (placement: DockPlacement) => void
  remove: () => void
}

/**
 * Tabler Icons 3.46.0 (https://tabler.io/icons, MIT, Copyright (c) 2020-2026 Paweł Kuna): x, lock, lock-open, settings,
 * message-circle, language. The minifier drops comments, so the licence ships as its own file in the package:
 * `public/licenses/tabler-icons.txt`
 */
const ICONS = {
  x: ['M18 6l-12 12', 'M6 6l12 12'],
  lock: ['M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6', 'M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0', 'M8 11v-4a4 4 0 1 1 8 0v4'],
  lockOpen: ['M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2l0 -6', 'M11 16a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M8 11v-5a4 4 0 0 1 8 0'],
  settings: ['M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065', 'M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0'],
  feedback: ['M3 20l1.3 -3.9c-2.324 -3.437 -1.426 -7.872 2.1 -10.374c3.526 -2.501 8.59 -2.296 11.845 .48c3.255 2.777 3.695 7.266 1.029 10.501c-2.666 3.235 -7.615 4.215 -11.574 2.293l-4.7 1'],
  translate: ['M9 6.371c0 4.418 -2.239 6.629 -5 6.629', 'M4 6.371h7', 'M5 9c0 2.144 2.252 3.908 6 4', 'M12 20l4 -9l4 9', 'M19.1 18h-6.2', 'M6.694 3l.793 .582'],
} as const

/** One icon, sized by the style sheet; the stroke width is the reference's (3 on the two small controls, else 2) */
const svg = (paths: readonly string[], stroke = 2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths.map(d => `<path d="${d}"/>`).join('')}</svg>`

// The reference's Tailwind classes as the CSS Tailwind v4 generates for them; the class each rule stands for is named
// where it is not obvious. Their theme's colours (theme.css `--rf-*`) and Tailwind's neutral scale, light and dark
const STYLE = `
:host { all: initial }
.dock {
  --border: oklch(0.92 0.004 286.32); --surface: #fff; --hidden-fg: oklch(0.439 0 0); --hidden-hover: oklch(0.97 0 0);
  --control: oklch(0.87 0 0); --control-hover: oklch(0.556 0 0);
  --tip-bg: oklch(0.141 0.005 285.823); --tip-fg: #fff;
  --popover: #fff; --popover-fg: oklch(0.141 0.005 285.823); --accent: oklch(0.967 0.001 286.375); --accent-fg: oklch(0.21 0.006 285.885);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --ease: cubic-bezier(0.4, 0, 0.2, 1);
  position: fixed; z-index: 2147483647; display: flex; flex-direction: column; gap: 8px;
  font-family: ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  .dock {
    --border: oklch(1 0 0 / 10%); --surface: oklch(0.205 0 0); --hidden-fg: oklch(0.708 0 0); --hidden-hover: oklch(0.269 0 0);
    --control: oklch(0.371 0 0); --tip-bg: oklch(0.985 0 0); --tip-fg: oklch(0.141 0.005 285.823);
    --popover: oklch(0.21 0.006 285.885); --popover-fg: oklch(0.985 0 0); --accent: oklch(0.274 0.006 286.033); --accent-fg: oklch(0.985 0 0);
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

/* HiddenButton */
.hidden-button {
  position: relative; display: flex; box-sizing: border-box; padding: 6px; cursor: pointer;
  border: 1px solid var(--border); border-radius: 9999px; background: var(--surface); color: var(--hidden-fg);
  box-shadow: var(--shadow-lg);
  transition: transform 300ms var(--ease), translate 300ms var(--ease), scale 300ms var(--ease), rotate 300ms var(--ease);
}
.hidden-button:hover { background: var(--hidden-hover) }
.hidden-button > svg { width: 20px; height: 20px }
.dock[data-side="right"] .hidden-button { margin-right: 8px }
.dock[data-side="left"] .hidden-button { margin-left: 8px }
.dock[data-expanded="no"][data-side="right"] .hidden-button { translate: 48px 0 }
.dock[data-expanded="no"][data-side="left"] .hidden-button { translate: -48px 0 }

/* FloatingButtonTooltip: beside the button, on the side away from the edge, 8px off; Base UI's enter and exit */
.tip {
  position: absolute; top: 50%; pointer-events: none; white-space: nowrap; max-width: 320px; box-sizing: border-box;
  padding: 6px 12px; border-radius: 8px; background: var(--tip-bg); color: var(--tip-fg); font-size: 12px; line-height: 16px;
  opacity: 0; visibility: hidden; scale: 0.95;
  transition: opacity 150ms ease, scale 150ms ease, translate 150ms ease, visibility 150ms;
}
.dock[data-side="right"] .tip { right: calc(100% + 8px); translate: 8px -50% }
.dock[data-side="left"] .tip { left: calc(100% + 8px); translate: -8px -50% }
.hidden-button:hover .tip, .hidden-button:focus-visible .tip { opacity: 1; visibility: visible; scale: 1; translate: 0 -50% }

/* The main button: a tab against the edge, pushed 24px out of view and faded until the reader comes near */
.anchor { position: relative }
.main {
  position: relative; display: flex; align-items: center; box-sizing: border-box; height: 40px; width: 44px;
  border: 1px solid var(--border); background: var(--surface); box-shadow: var(--shadow-lg); cursor: pointer;
  touch-action: none; -webkit-user-drag: none; user-select: none;
  transition: transform 300ms var(--ease), translate 300ms var(--ease), scale 300ms var(--ease), rotate 300ms var(--ease);
}
.main img { display: block; width: 32px; height: 32px; object-fit: contain; pointer-events: none }
.dock[data-side="right"] .main { justify-content: flex-start; border-right: 0; border-radius: 9999px 0 0 9999px }
.dock[data-side="right"] .main img { margin-left: 4px }
.dock[data-side="left"] .main { justify-content: flex-end; border-left: 0; border-radius: 0 9999px 9999px 0 }
.dock[data-side="left"] .main img { margin-right: 4px }
.dock[data-attached="no"][data-side="right"] .main { translate: 24px 0 }
.dock[data-attached="no"][data-side="left"] .main { translate: -24px 0 }
.dock[data-expanded="no"] .main { opacity: 0.6 }
.dock[data-dragging="yes"] .main {
  width: 40px; justify-content: center; border: 1px solid var(--border); border-radius: 9999px;
  opacity: 1; translate: none; cursor: grabbing;
}
.dock[data-dragging="yes"] .main img { margin: 0 }
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
.dock[data-attached="yes"][data-side="right"] .control { left: -24px }
.dock[data-attached="yes"][data-side="left"] .control { right: -24px }
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
.dock[data-dragging="yes"] .shield { cursor: grabbing }
@media (prefers-reduced-motion: reduce) { .dock *, .dock { transition: none !important; animation: none !important } }
`

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)

/** A press on the main button, from pointerdown until it is released or turns into a drag (reference `PendingDragState`) */
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
 * Draw the entry into `host` (a shadow root of its own) and answer the reader.
 *
 * The drag is the reference's: a press of `LONG_PRESS_MS` or a movement past `DRAG_START_PX` starts one, the pointer
 * is captured so a fast drag cannot escape the button, the button follows the pointer as a circle, and on release the
 * side is whichever half of the window its centre ended in and the dock's top is kept as a fraction of the window's
 * height, held away from both edges. A press that never became a drag is a click, and the link opens.
 */
export function mountFloatingEntry(doc: Document, host: HTMLElement, options: FloatingEntryOptions): FloatingEntry {
  const view = doc.defaultView ?? window
  const root = host.attachShadow({ mode: 'open' })
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
  const tip = () => make('span', 'tip')

  const translate = make('a', 'hidden-button translate', svg(ICONS.translate))
  const translateTip = tip()
  translate.append(translateTip)
  const anchor = make('div', 'anchor')
  const main = make('a', 'main')
  main.draggable = false
  const mark = make('img', '')
  mark.src = options.iconUrl
  mark.alt = ''
  mark.draggable = false
  main.append(mark)
  const optionsButton = make('button', 'control options', svg(ICONS.x, 3))
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
  const feedback = make('a', 'hidden-button feedback', svg(ICONS.feedback))
  feedback.href = options.feedbackUrl
  feedback.target = '_blank'
  feedback.rel = 'noopener noreferrer'
  const feedbackTip = tip()
  feedback.append(feedbackTip)
  const shield = make('div', 'shield')
  shield.hidden = true
  dock.append(translate, anchor, settings, feedback, shield)
  root.append(style, dock)

  // The reference's state: the pointer over the dock (`isHitAreaExpanded`), the close menu, the drag
  let hovered = false
  /** Keyboard focus inside the dock opens it too; a mouse click that leaves focus on a control does not */
  let focused = false
  let menuOpen = false
  let press: Press | null = null
  let dragging = false
  let preview: { x: number; y: number } | null = null
  /** The click that follows a drag's release must not open the link */
  let swallowClick = false
  let fullscreen = doc.fullscreenElement != null
  /** The page's own cursor and selection, put back when a drag ends (reference) */
  let bodyBefore: { userSelect: string; cursor: string } | null = null

  /** The lock state the glyph was last drawn for: `draw` runs on every pointermove of a drag */
  let lockDrawn: boolean | null = null

  const expanded = () => !dragging && (hovered || focused || menuOpen)

  const draw = () => {
    const open = expanded()
    dock.dataset.side = placement.side
    dock.dataset.expanded = open ? 'yes' : 'no'
    // Out of the edge when open or locked (reference `isMainButtonAttached`)
    dock.dataset.attached = placement.locked || open ? 'yes' : 'no'
    dock.dataset.dragging = dragging ? 'yes' : 'no'
    dock.hidden = fullscreen
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
    for (const link of [main, translate]) link.setAttribute('aria-label', strings.open)
    translateTip.textContent = strings.open
    optionsButton.setAttribute('aria-label', strings.options)
    settings.setAttribute('aria-label', strings.settings)
    settingsTip.textContent = strings.settings
    feedback.setAttribute('aria-label', strings.feedback)
    feedbackTip.textContent = strings.feedback
    hideNow.textContent = strings.hideForNow
    hideAlways.textContent = strings.hideAlways
  }

  const retarget = (newTab: boolean) => {
    for (const link of [main, translate]) {
      link.href = options.href
      if (newTab) {
        link.target = '_blank'
        link.rel = 'noopener'
      } else {
        link.removeAttribute('target')
        link.removeAttribute('rel')
      }
    }
  }

  // Opening and closing (reference: `onMouseEnter` on the main button, `onMouseLeave` on the whole dock)
  main.addEventListener('mouseenter', () => {
    if (dragging) return
    hovered = true
    draw()
  })
  dock.addEventListener('mouseleave', () => {
    if (menuOpen || dragging) return
    hovered = false
    draw()
  })
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
    // Closed, the dock stays open only while the pointer is still over it (the reference keeps it open until the next
    // leave, which never comes when the pointer left while the menu was up)
    if (!open) hovered = dock.matches(':hover')
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
    entry.remove()
    options.onHide(scope)
  }
  hideNow.addEventListener('click', () => hide('now'))
  hideAlways.addEventListener('click', () => hide('always'))

  lock.addEventListener('click', () => {
    placement = { ...placement, locked: !placement.locked }
    draw()
    options.onPlacement(placement)
  })
  settings.addEventListener('click', () => options.onSettings())

  // The drag (reference `handlePointerDown` / `handlePointerMove` / `finishPointerInteraction`)
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
    hovered = false
    menuOpen = false
    dragging = true
    // The page must not select text under a drag, and the cursor says what is happening (reference)
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
    // held away from both edges, so a window of another size still shows it (reference `getNormalizedFloatingContainerTop`)
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
    restoreBody()
    draw()
    options.onPlacement(placement)
  }
  main.addEventListener('pointerup', finish)
  main.addEventListener('pointercancel', finish)
  // The press that became a drag is not a click: the link must not open because the reader moved it
  main.addEventListener('click', event => {
    if (!swallowClick) return
    swallowClick = false
    event.preventDefault()
  })

  // Fullscreen hides the entry, and a drag it interrupts never sees its release: cancel it here, or the page keeps the
  // grabbing cursor and the selection lock after fullscreen ends (reference)
  const onFullscreen = () => {
    fullscreen = doc.fullscreenElement != null
    if (fullscreen) {
      if (press !== null) clearTimeout(press.timer)
      press = null
      shield.hidden = true
      preview = null
      dragging = false
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

  const entry: FloatingEntry = {
    relabel: next => {
      strings = next
      label()
      draw()
    },
    retarget,
    place: next => {
      if (dragging) return
      placement = { ...next }
      draw()
    },
    remove: () => {
      if (press !== null) clearTimeout(press.timer)
      press = null
      restoreBody()
      doc.removeEventListener('fullscreenchange', onFullscreen)
      doc.removeEventListener('pointerdown', onOutside, true)
      host.remove()
    },
  }
  return entry
}
