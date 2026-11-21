// The floating button (DESIGN §4.0c, UI.md S-I-06…06c): one button docked to the window's edge on arXiv's abstract, PDF
// and full-text pages — the control panel above, our mark in its disc in the middle, the settings below, and beside the
// main button a close control (with its menu) and a lock. It rests whole and dim, lights at once under the pointer, opens
// the rest after a dwell, folds after a grace; a press past 6 px or held 350 ms drags it as a circle, and the release
// docks it to the nearer half of the window at a height kept as a fraction of it. Plain DOM in an open shadow root, its
// material the family's (`tokenSheet('host')`); `shared/floating.ts` gives it its life on a page. Written from the
// documents named above and the behaviour its tests and `tests/e2e/floating-button.mjs` hold.
import { Check, type IconNode, Lock, LockOpen, Settings, SlidersHorizontal, X } from 'lucide'
import { tokenSheet } from '@/shared/tokens'
import { MARK_DISC } from './mark'

/** The class of the host element the content scripts mount the button in: the one node of ours on the page */
export const FLOATING_CLASS = 'axt-floating'

export type DockSide = 'left' | 'right'
export type FloatingTheme = 'system' | 'light' | 'dark'

/** Where the button sits: the edge, the dock's top as a fraction of the window's height, and whether a drag may move it */
export interface DockPlacement {
  side: DockSide
  position: number
  locked: boolean
}

/** What the main button does: run the page's toggle (the full text), or open the control panel (abstract, PDF) */
export type MainAction = { kind: 'toggle'; run: () => void } | { kind: 'panel' }

/** Every word the button shows or names, in the interface's language (`lang`) */
export interface FloatingButtonStrings {
  lang: string
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
  /** the page's zoom, undone so the button is the same size on the screen everywhere (1: nothing to undo) */
  zoom?: number
  theme?: FloatingTheme
  placement: DockPlacement
  strings: FloatingButtonStrings
  /** the address of the extension's popup, framed as the control panel */
  panelUrl: string
  /** the panel's frame, handed to the host as it is made (to vouch for it); what it returns runs when the frame goes */
  onPanelFrame?: (frame: HTMLIFrameElement) => () => void
  /** a drag's drop or the lock: the host saves it */
  onPlacement: (placement: DockPlacement) => void
  onSettings: () => void
  /** the button has taken itself off the page: for this page (`now`) or for good (`always`) */
  onHide: (scope: 'now' | 'always') => void
}

export interface FloatingButton {
  relabel: (strings: FloatingButtonStrings) => void
  /** the page shows its translation: the tick */
  activate: (active: boolean) => void
  /** a placement saved elsewhere (another tab's drag or lock) */
  place: (placement: DockPlacement) => void
  /** open the control panel, on the host's word */
  openPanel: () => void
  rescale: (zoom: number) => void
  retheme: (theme: FloatingTheme) => void
  remove: () => void
}

/** The timings DESIGN §4.0c gives: the dwell before the rest comes out, the grace on leaving, the long press, the drag's threshold */
const DWELL_MS = 400
const GRACE_MS = 200
const LONG_PRESS_MS = 350
const DRAG_PX = 6
/** The drop's clearances: the dock's top at least 30 px from the window's top and 200 px from its bottom */
const TOP_CLEARANCE = 30
const BOTTOM_CLEARANCE = 200
/** The control panel is kept this far inside the window, above and below */
const PANEL_MARGIN = 16

/** One Lucide icon as markup: a 24 px box with round strokes, decorative (the control carries the name) */
function icon(node: IconNode, strokeWidth: number): string {
  const children = node
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([name, value]) => `${name}="${String(value)}"`).join(' ')}/>`)
    .join('')
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${children}</svg>`
}

/** The stroke widths the glyphs are drawn at: the column's buttons, the corner controls, the tick */
const BUTTON_STROKE = 2
const CONTROL_STROKE = 3
const TICK_STROKE = 3.2

/** The curves: what comes out decelerates (a 200 ms fade, a 280 ms growth), what goes accelerates over 140 ms */
const IN = 'opacity 200ms cubic-bezier(0.33, 1, 0.68, 1), transform 280ms cubic-bezier(0.22, 1, 0.36, 1), visibility 0s'
const OUT = 'opacity 140ms cubic-bezier(0.4, 0, 1, 1), transform 140ms cubic-bezier(0.4, 0, 1, 1), visibility 0s linear 140ms'

/**
 * The sheet: the host reset, the family's roles, then the button. Every colour is a role but the mark's own: the tick's
 * white ring and glyph (the disc's white) and the disc's soft shadow (the logo's export). The open state's layout is the
 * closed state's — the room for the corner controls, the bridged gaps, the tooltips' places are always there — so
 * opening moves only opacity and transform
 */
const SHEET = `:host { all: initial }
${tokenSheet('host')}
.axt-fb-dock { position: fixed; z-index: 2147483647; pointer-events: none; font-family: var(--axt-font); -webkit-font-smoothing: antialiased; }
.axt-fb-dock[data-axt-side="right"] { right: 0; }
.axt-fb-dock[data-axt-side="left"] { left: 0; }
:where(.axt-fb-dock button) { margin: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; box-sizing: border-box; }
.axt-fb-column { display: flex; flex-direction: column; gap: 8px; pointer-events: none; zoom: var(--axt-unzoom); }
.axt-fb-dock[data-axt-side="right"] .axt-fb-column { align-items: flex-end; padding-left: 24px; }
.axt-fb-dock[data-axt-side="left"] .axt-fb-column { align-items: flex-start; padding-right: 24px; }
.axt-fb-anchor { position: relative; margin: -8px 0; padding: 8px 0; pointer-events: none; }
.axt-fb-anchor::before { content: ""; position: absolute; top: 0; bottom: 0; width: 24px; pointer-events: none; }
.axt-fb-dock[data-axt-side="right"] .axt-fb-anchor::before { right: 100%; }
.axt-fb-dock[data-axt-side="left"] .axt-fb-anchor::before { left: 100%; }
.axt-fb-dock[data-axt-lit="yes"] .axt-fb-anchor, .axt-fb-dock[data-axt-lit="yes"] .axt-fb-anchor::before { pointer-events: auto; }
.axt-fb-main { position: relative; display: flex; align-items: center; justify-content: flex-start; width: 44px; height: 40px; background: var(--axt-chrome); border: 1px solid var(--axt-chrome-line); box-shadow: var(--axt-float-shadow); opacity: 0.7; transition: opacity 250ms ease-out; pointer-events: auto; user-select: none; touch-action: none; }
.axt-fb-dock[data-axt-side="right"] .axt-fb-main { border-right-width: 0; border-radius: 9999px 0 0 9999px; }
.axt-fb-dock[data-axt-side="left"] .axt-fb-main { border-left-width: 0; border-radius: 0 9999px 9999px 0; justify-content: flex-end; }
.axt-fb-dock[data-axt-lit="yes"] .axt-fb-main { opacity: 1; }
.axt-fb-disc { position: relative; display: block; width: 32px; height: 32px; border-radius: 50%; box-shadow: 0 3px 7px rgb(0 0 0 / 0.06); transition: box-shadow 250ms ease-out; pointer-events: none; }
.axt-fb-dock[data-axt-side="right"] .axt-fb-disc { margin-left: 3px; }
.axt-fb-dock[data-axt-side="left"] .axt-fb-disc { margin-right: 3px; }
.axt-fb-dock[data-axt-lit="yes"] .axt-fb-disc { box-shadow: 0 3px 8px rgb(0 0 0 / 0.16); }
.axt-fb-mark { display: block; width: 32px; height: 32px; }
.axt-fb-tick { position: absolute; top: 22px; left: 22px; display: grid; place-items: center; box-sizing: border-box; width: 13px; height: 13px; border: 1px solid #fff; border-radius: 50%; background: var(--axt-success); color: #fff; pointer-events: none; transform: scale(0); transition: transform 140ms cubic-bezier(0.4, 0, 1, 1); }
.axt-fb-tick svg { display: block; width: 8px; height: 8px; }
.axt-fb-dock[data-axt-active="yes"] .axt-fb-tick { transform: none; transition: transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1); }
.axt-fb-hidden-button { position: relative; display: flex; padding: 6px; background: var(--axt-chrome); border: 1px solid var(--axt-chrome-line); box-shadow: var(--axt-float-shadow); border-radius: 9999px; color: var(--axt-ink-2); will-change: opacity, transform; }
.axt-fb-dock[data-axt-side="right"] .axt-fb-hidden-button { margin-right: 8px; }
.axt-fb-dock[data-axt-side="left"] .axt-fb-hidden-button { margin-left: 8px; }
.axt-fb-hidden-button::before { content: ""; position: absolute; inset: 0; border-radius: 9999px; background: var(--axt-fill); opacity: 0; transition: opacity 150ms 80ms; }
.axt-fb-hidden-button:hover::before, .axt-fb-hidden-button[aria-expanded="true"]::before { opacity: 1; transition: opacity 150ms; }
.axt-fb-hidden-button svg { position: relative; display: block; width: 20px; height: 20px; }
.axt-fb-control { position: absolute; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; color: var(--axt-ink-3); will-change: opacity, transform; }
.axt-fb-dock[data-axt-side="right"] .axt-fb-control { left: -24px; transform-origin: 100% 50%; }
.axt-fb-dock[data-axt-side="left"] .axt-fb-control { right: -24px; transform-origin: 0 50%; }
.axt-fb-options { top: 4px; }
.axt-fb-lock { bottom: 4px; }
.axt-fb-control svg { display: block; width: 13px; height: 13px; transition: color 150ms 80ms, transform 150ms 80ms; }
.axt-fb-control:hover svg, .axt-fb-control[aria-expanded="true"] svg { color: var(--axt-ink); transform: scale(1.12); transition: color 150ms, transform 150ms; }
.axt-fb-hidden-button, .axt-fb-control { opacity: 0; visibility: hidden; pointer-events: none; transition: ${OUT}; }
.axt-fb-dock[data-axt-side="right"] .axt-fb-control { transform: translateX(8px) scale(0.86); }
.axt-fb-dock[data-axt-side="left"] .axt-fb-control { transform: translateX(-8px) scale(0.86); }
.axt-fb-panel { transform: translateY(8px) scale(0.86); transform-origin: 50% 100%; }
.axt-fb-settings { transform: translateY(-8px) scale(0.86); transform-origin: 50% 0; }
.axt-fb-dock[data-axt-expanded="yes"] .axt-fb-hidden-button, .axt-fb-dock[data-axt-expanded="yes"] .axt-fb-control { opacity: 1; visibility: visible; pointer-events: auto; transform: none; transition: ${IN}; }
.axt-fb-tip { position: absolute; top: 50%; box-sizing: border-box; padding: 5px 8px; border-radius: 6px; background: var(--axt-tip-bg); color: var(--axt-tip-ink); font: 12px/1.2 var(--axt-font); box-shadow: var(--axt-tip-shadow); white-space: nowrap; pointer-events: none; opacity: 0; visibility: hidden; transition: ${OUT}; }
.axt-fb-dock[data-axt-side="right"] .axt-fb-hidden-button .axt-fb-tip { right: calc(100% + 8px); transform: translate(6px, -50%); }
.axt-fb-dock[data-axt-side="left"] .axt-fb-hidden-button .axt-fb-tip { left: calc(100% + 8px); transform: translate(-6px, -50%); }
.axt-fb-main .axt-fb-tip { will-change: opacity, transform; }
.axt-fb-dock[data-axt-side="right"] .axt-fb-main .axt-fb-tip { right: calc(100% + 28px); transform: translate(8px, -50%) scale(0.96); transform-origin: 100% 50%; }
.axt-fb-dock[data-axt-side="left"] .axt-fb-main .axt-fb-tip { left: calc(100% + 28px); transform: translate(-8px, -50%) scale(0.96); transform-origin: 0 50%; }
.axt-fb-dock[data-axt-expanded="yes"] .axt-fb-tip { transition-delay: 120ms, 120ms, 260ms; }
.axt-fb-dock[data-axt-expanded="yes"] :is(.axt-fb-main, .axt-fb-hidden-button):not([aria-expanded="true"]):is(:hover, :focus-visible) > .axt-fb-tip { opacity: 1; visibility: visible; transform: translate(0, -50%); transition: ${IN}; }
.axt-fb-main:focus-visible, .axt-fb-hidden-button:focus-visible, .axt-fb-control:focus-visible { outline: 2px solid var(--axt-focus); outline-offset: 2px; }
.axt-fb-menu { position: absolute; top: 4px; z-index: 1; box-sizing: border-box; padding: 4px; border-radius: 12px; background: var(--axt-chrome); color: var(--axt-ink); box-shadow: var(--axt-pop-shadow); font-size: 13px; white-space: nowrap; pointer-events: auto; }
.axt-fb-dock[data-axt-side="right"] .axt-fb-menu { right: calc(100% + 28px); }
.axt-fb-dock[data-axt-side="left"] .axt-fb-menu { left: calc(100% + 28px); }
.axt-fb-menu:focus { outline: none; }
.axt-fb-menu button { display: flex; align-items: center; gap: 8px; width: 100%; height: 30px; padding: 0 10px; border-radius: 8px; cursor: pointer; user-select: none; text-align: start; }
.axt-fb-menu button:hover, .axt-fb-menu button:focus-visible { background: var(--axt-fill); }
.axt-fb-menu button:focus-visible { outline: 2px solid var(--axt-focus); outline-offset: -2px; }
.axt-fb-panel-box { position: fixed; z-index: 1; width: 320px; overflow: hidden; border-radius: 12px; background: var(--axt-chrome); box-shadow: var(--axt-pop-shadow); pointer-events: auto; zoom: var(--axt-unzoom); opacity: 0; transition: opacity 140ms cubic-bezier(0.4, 0, 1, 1), transform 140ms cubic-bezier(0.4, 0, 1, 1); }
.axt-fb-dock[data-axt-side="right"] .axt-fb-panel-box { right: 76px; }
.axt-fb-dock[data-axt-side="left"] .axt-fb-panel-box { left: 76px; }
.axt-fb-panel-box[data-axt-ready="yes"] { opacity: 1; transition: opacity 200ms cubic-bezier(0.33, 1, 0.68, 1), transform 280ms cubic-bezier(0.22, 1, 0.36, 1); }
.axt-fb-panel-box iframe { display: block; width: 100%; height: 100%; border: 0; color-scheme: normal; }
.axt-fb-shield { position: fixed; inset: 0; z-index: 2; pointer-events: auto; cursor: pointer; }
.axt-fb-catcher { position: fixed; inset: 0; pointer-events: auto; }
.axt-fb-dock[data-axt-dragging="yes"] .axt-fb-column { padding: 0; align-items: center; }
.axt-fb-dock[data-axt-dragging="yes"] :is(.axt-fb-hidden-button, .axt-fb-control, .axt-fb-tip, .axt-fb-menu), .axt-fb-dock[data-axt-dragging="yes"] .axt-fb-anchor::before { display: none; }
.axt-fb-dock[data-axt-dragging="yes"] .axt-fb-main { width: 40px; border-width: 1px; border-radius: 9999px; justify-content: center; opacity: 1; cursor: grabbing; }
.axt-fb-dock[data-axt-dragging="yes"] .axt-fb-disc { margin: 0; }
.axt-fb-dock[data-axt-dragging="yes"] .axt-fb-shield { cursor: grabbing; }
@media print {
  .axt-fb-dock { display: none !important; }
}
@media (prefers-reduced-motion: reduce) {
  .axt-fb-dock *, .axt-fb-dock *::before { transition-duration: 0s !important; }
}
`

/** A click the reader made — a pointer's, the keyboard's, assistive technology's — and never a page script's (DESIGN §4.0c) */
const trusted = (event: Event) => event.isTrusted

export function mountFloatingButton(doc: Document, host: HTMLElement, options: FloatingButtonOptions): FloatingButton {
  const win = doc.defaultView ?? window
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
  const hasPanelButton = options.main.kind === 'toggle'
  /** Over Chrome's PDF viewer this document hears no leave: a layer behind the lit button hears it instead */
  const onPdf = doc.contentType === 'application/pdf'
  root.innerHTML = `<style>${SHEET}</style><div class="axt-fb-dock">${onPdf ? '<div class="axt-fb-catcher" hidden></div>' : ''}<div class="axt-fb-column">${
    hasPanelButton ? `<button class="axt-fb-hidden-button axt-fb-panel" type="button" aria-haspopup="dialog" aria-label="" aria-expanded="false">${icon(SlidersHorizontal, BUTTON_STROKE)}<span class="axt-fb-tip" aria-hidden="true"></span></button>` : ''
  }<div class="axt-fb-anchor"><button class="axt-fb-main" type="button" draggable="false" aria-label=""><span class="axt-fb-disc">${MARK_DISC}<span class="axt-fb-tick">${icon(Check, TICK_STROKE)}</span></span><span class="axt-fb-tip" aria-hidden="true"></span></button><button class="axt-fb-control axt-fb-options" type="button" aria-haspopup="menu" aria-label="" aria-expanded="false">${icon(X, CONTROL_STROKE)}</button><button class="axt-fb-control axt-fb-lock" type="button"></button><div class="axt-fb-menu" role="menu" tabindex="-1" hidden><button class="axt-fb-hide-now" type="button" role="menuitem" tabindex="-1"></button><button class="axt-fb-hide-always" type="button" role="menuitem" tabindex="-1"></button></div></div><button class="axt-fb-hidden-button axt-fb-settings" type="button">${icon(Settings, BUTTON_STROKE)}<span class="axt-fb-tip" aria-hidden="true"></span></button></div><div class="axt-fb-panel-box" hidden></div><div class="axt-fb-shield" hidden></div></div>`

  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector(selector) as T
  const dock = q('.axt-fb-dock')
  const column = q('.axt-fb-column')
  const main = q<HTMLButtonElement>('.axt-fb-main')
  const panelButton = root.querySelector<HTMLButtonElement>('.axt-fb-panel')
  const settingsButton = q<HTMLButtonElement>('.axt-fb-settings')
  const optionsButton = q<HTMLButtonElement>('.axt-fb-options')
  const lockButton = q<HTMLButtonElement>('.axt-fb-lock')
  const menu = q('.axt-fb-menu')
  const items = [q<HTMLButtonElement>('.axt-fb-hide-now'), q<HTMLButtonElement>('.axt-fb-hide-always')]
  const panelBox = q('.axt-fb-panel-box')
  const shield = q('.axt-fb-shield')
  const catcher = root.querySelector<HTMLElement>('.axt-fb-catcher')
  /** The control the panel is opened from: the column's panel button, or the main button where there is none */
  const panelOpener = panelButton ?? main
  if (!hasPanelButton) {
    main.setAttribute('aria-haspopup', 'dialog')
    main.setAttribute('aria-expanded', 'false')
  }

  let strings = options.strings
  let placement: DockPlacement = { ...options.placement }
  let zoom = 1
  let lit = false
  let expanded = false
  /** the pointer is over the button's parts (not the PDF's catcher) */
  let inside = false
  let dwell: ReturnType<typeof setTimeout> | null = null
  let grace: ReturnType<typeof setTimeout> | null = null
  /** the panel's frame while it is open, what to run when it goes, and the height its page last said */
  let frame: HTMLIFrameElement | null = null
  let releaseFrame: (() => void) | null = null
  let panelHeight = 0

  const mark = (name: 'axtLit' | 'axtExpanded' | 'axtDragging' | 'axtActive', on: boolean) => { dock.dataset[name] = on ? 'yes' : 'no' }
  const menuOpen = () => !menu.hidden
  const panelOpen = () => frame !== null
  const clearDwell = () => { if (dwell !== null) clearTimeout(dwell); dwell = null }
  const clearGrace = () => { if (grace !== null) clearTimeout(grace); grace = null }

  // ————— words —————
  const lockIcon = () => { lockButton.innerHTML = icon(placement.locked ? Lock : LockOpen, CONTROL_STROKE) }
  const label = () => {
    dock.lang = strings.lang
    const name = (button: HTMLElement, words: string) => {
      button.setAttribute('aria-label', words)
      const tip = [...button.children].find(child => child.classList.contains('axt-fb-tip'))
      if (tip) tip.textContent = words
    }
    name(main, strings.main)
    if (panelButton) name(panelButton, strings.panel)
    name(settingsButton, strings.settings)
    name(optionsButton, strings.options)
    lockButton.setAttribute('aria-label', placement.locked ? strings.unlock : strings.lock)
    items[0]!.textContent = strings.hideForNow
    items[1]!.textContent = strings.hideAlways
    if (frame) frame.title = strings.panel
  }

  // ————— the place down the edge —————
  /** The dock's top in the window: the fraction of its height, within the clearances, on a whole pixel of the screen */
  const placeTop = () => {
    const height = win.innerHeight
    const top = Math.max(TOP_CLEARANCE, Math.min(placement.position * height, height - BOTTOM_CLEARANCE))
    const ratio = win.devicePixelRatio || 1
    dock.style.top = `${Math.round(top * ratio) / ratio}px`
  }
  const place = (next: DockPlacement) => {
    placement = { ...next }
    dock.dataset.axtSide = placement.side
    placeTop()
    lockIcon()
    label()
  }

  // ————— rest, lit, open —————
  /** the last input was the keyboard's (a key since the last press of a pointer): focus then is the reader's place */
  let viaKeyboard = false
  const keyboardInside = () => {
    // a button no longer on the page holds no focus (and its document may be gone: nothing of it is asked)
    if (!viaKeyboard || !host.isConnected) return false
    const focused = root.activeElement
    return focused !== null && dock.contains(focused)
  }
  const expand = () => {
    clearDwell()
    expanded = true
    mark('axtExpanded', true)
  }
  const light = () => {
    if (catcher) catcher.hidden = false
    if (lit) return
    lit = true
    mark('axtLit', true)
  }
  const fold = () => {
    clearDwell()
    clearGrace()
    // open while a menu or the panel is up, or while the keyboard is on one of its controls (#614)
    if (menuOpen() || panelOpen() || keyboardInside()) return
    lit = false
    expanded = false
    mark('axtLit', false)
    mark('axtExpanded', false)
    if (catcher) catcher.hidden = true
  }
  /** The pointer has left: the grace, then folded, unless a menu or the panel holds the dock open */
  const leave = () => {
    inside = false
    clearDwell()
    clearGrace()
    grace = setTimeout(fold, GRACE_MS)
  }
  /** The pointer is back on a part within the grace: still lit, and the dwell resumes if it had not opened yet */
  const back = () => {
    inside = true
    clearGrace()
    if (!lit) return
    if (!expanded && dwell === null && !dragging()) dwell = setTimeout(expand, DWELL_MS)
  }
  const enter = () => {
    inside = true
    clearGrace()
    if (dragging()) return
    if (!lit) {
      light()
      clearDwell()
      dwell = setTimeout(expand, DWELL_MS)
    } else if (!expanded && dwell === null) dwell = setTimeout(expand, DWELL_MS)
  }

  // ————— the close menu —————
  const closeMenu = (focusBack = false) => {
    if (!menuOpen()) return
    menu.hidden = true
    optionsButton.setAttribute('aria-expanded', 'false')
    if (focusBack) optionsButton.focus()
    if (!inside) leave()
  }
  const openMenu = (fromKeyboard: boolean) => {
    closePanel()
    light()
    expand()
    menu.hidden = false
    optionsButton.setAttribute('aria-expanded', 'true')
    if (fromKeyboard) items[0]!.focus()
  }

  // ————— the control panel —————
  const placePanel = () => {
    if (!frame || panelHeight <= 0) return
    const unzoom = 1 / zoom
    const room = win.innerHeight - 2 * PANEL_MARGIN
    const height = Math.min(panelHeight * unzoom, room)
    const box = main.getBoundingClientRect()
    const centre = box.top + box.height / 2
    const top = Math.min(Math.max(centre - height / 2, PANEL_MARGIN), win.innerHeight - PANEL_MARGIN - height)
    panelBox.style.height = `${height / unzoom}px`
    panelBox.style.top = `${top / unzoom}px`
    panelBox.dataset.axtReady = 'yes'
  }
  const openPanel = () => {
    if (panelOpen()) return
    closeMenu()
    light()
    expand()
    const next = doc.createElement('iframe')
    next.src = options.panelUrl
    next.title = strings.panel
    panelBox.dataset.axtReady = 'no'
    panelBox.append(next)
    panelBox.hidden = false
    frame = next
    panelHeight = 0
    panelOpener.setAttribute('aria-expanded', 'true')
    releaseFrame = options.onPanelFrame?.(next) ?? null
  }
  function closePanel(focusBack = false) {
    if (!frame) return
    releaseFrame?.()
    releaseFrame = null
    frame.remove()
    frame = null
    panelBox.hidden = true
    panelOpener.setAttribute('aria-expanded', 'false')
    if (focusBack) panelOpener.focus()
    if (!inside) leave()
  }
  const togglePanel = () => (panelOpen() ? closePanel() : openPanel())

  // ————— press and drag —————
  interface Press { id: number; x: number; y: number; dx: number; dy: number; above: number; width: number; moved: boolean }
  let press: Press | null = null
  let lastX = 0
  let lastY = 0
  let longPress: ReturnType<typeof setTimeout> | null = null
  /** the click that follows the release of a drag is not a click */
  let swallowClick = false
  /** the page's own cursor and selection, put back when a drag ends */
  let bodyStyle: { cursor: string; userSelect: string } | null = null
  function dragging() { return press?.moved === true }
  const clearLongPress = () => { if (longPress !== null) clearTimeout(longPress); longPress = null }
  const follow = (x: number, y: number) => {
    if (!press) return
    dock.style.left = `${x - press.dx}px`
    dock.style.right = 'auto'
    dock.style.top = `${y - press.dy}px`
  }
  const startDrag = () => {
    if (!press || press.moved) return
    clearLongPress()
    clearDwell()
    closeMenu()
    closePanel()
    press.moved = true
    lit = true
    mark('axtLit', true)
    expanded = false
    mark('axtExpanded', false)
    mark('axtDragging', true)
    const body = doc.body
    bodyStyle = { cursor: body.style.cursor, userSelect: body.style.userSelect }
    body.style.cursor = 'grabbing'
    body.style.userSelect = 'none'
    follow(lastX, lastY)
  }
  /** The press is over: the drag, if there was one, docks at the last place the pointer was (`drop`), or is undone */
  const endPress = (drop: boolean) => {
    const was = press
    press = null
    clearLongPress()
    shield.hidden = true
    if (!was?.moved) return
    mark('axtDragging', false)
    if (bodyStyle) {
      doc.body.style.cursor = bodyStyle.cursor
      doc.body.style.userSelect = bodyStyle.userSelect
      bodyStyle = null
    }
    dock.style.left = ''
    dock.style.right = ''
    if (drop) {
      const left = lastX - was.dx
      const height = win.innerHeight
      const top = lastY - was.dy - was.above
      const side: DockSide = left + was.width / 2 < win.innerWidth / 2 ? 'left' : 'right'
      placement = { side, position: Math.max(TOP_CLEARANCE, Math.min(top, height - BOTTOM_CLEARANCE)) / height, locked: placement.locked }
      dock.dataset.axtSide = side
      options.onPlacement({ ...placement })
    }
    placeTop()
    if (!inside) leave()
  }

  // ————— listeners —————
  main.addEventListener('mouseenter', enter)
  dock.addEventListener('mouseover', event => {
    if (catcher && event.target === catcher) leave()
    else back()
  })
  dock.addEventListener('mouseleave', leave)
  dock.addEventListener('focusin', event => {
    // keyboard focus opens it at once, as a pointer's dwell does
    let visible = viaKeyboard
    try { visible ||= (event.target as Element).matches(':focus-visible') } catch { /* a browser without the pseudo-class: the key decides */ }
    if (!visible) return
    clearGrace()
    light()
    expand()
  })
  dock.addEventListener('focusout', event => {
    const next = event.relatedTarget as Node | null
    if (next && root.contains(next)) return
    if (!inside) leave()
  })

  main.addEventListener('pointerdown', event => {
    swallowClick = false
    if (event.button !== 0 || placement.locked) return
    const box = main.getBoundingClientRect()
    const dockBox = dock.getBoundingClientRect()
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: event.clientX - box.left, dy: event.clientY - box.top, above: box.top - dockBox.top, width: box.width, moved: false }
    lastX = event.clientX
    lastY = event.clientY
    shield.hidden = false
    try { main.setPointerCapture(event.pointerId) } catch { /* a pointer the browser no longer knows: the shield still holds the moves */ }
    clearLongPress()
    longPress = setTimeout(startDrag, LONG_PRESS_MS)
  })
  dock.addEventListener('pointermove', event => {
    if (!press || event.pointerId !== press.id) return
    lastX = event.clientX
    lastY = event.clientY
    if (!press.moved && Math.hypot(lastX - press.x, lastY - press.y) > DRAG_PX) startDrag()
    if (press?.moved) follow(lastX, lastY)
  })
  dock.addEventListener('pointerup', event => {
    if (!press || event.pointerId !== press.id) return
    lastX = event.clientX
    lastY = event.clientY
    if (press.moved) swallowClick = true
    endPress(true)
  })
  dock.addEventListener('pointercancel', event => {
    if (!press || event.pointerId !== press.id) return
    endPress(true)
  })

  main.addEventListener('click', event => {
    if (!trusted(event)) return
    // a click ends a press that never became a drag (the release that should have ended it may not have come)
    if (press && !press.moved) endPress(false)
    if (swallowClick) {
      swallowClick = false
      event.preventDefault()
      return
    }
    if (options.main.kind === 'toggle') options.main.run()
    else togglePanel()
  })
  panelButton?.addEventListener('click', event => { if (trusted(event)) togglePanel() })
  settingsButton.addEventListener('click', event => { if (trusted(event)) options.onSettings() })
  optionsButton.addEventListener('click', event => {
    if (!trusted(event)) return
    if (menuOpen()) closeMenu()
    else openMenu((event as MouseEvent).detail === 0)
  })
  lockButton.addEventListener('click', event => {
    if (!trusted(event)) return
    placement = { ...placement, locked: !placement.locked }
    lockIcon()
    label()
    options.onPlacement({ ...placement })
  })
  const hide = (scope: 'now' | 'always') => {
    api.remove()
    options.onHide(scope)
  }
  items[0]!.addEventListener('click', event => { if (trusted(event)) hide('now') })
  items[1]!.addEventListener('click', event => { if (trusted(event)) hide('always') })
  // focus leaving the close menu (Tab out of an item) closes it (#614)
  menu.addEventListener('focusout', event => {
    const next = (event as FocusEvent).relatedTarget as Node | null
    if (!next || !menu.contains(next)) closeMenu()
  })
  menu.addEventListener('keydown', event => {
    viaKeyboard = true
    const at = items.indexOf(root.activeElement as HTMLButtonElement)
    const step = (by: number) => items[(at + by + items.length) % items.length]!.focus()
    if (event.key === 'ArrowDown') step(1)
    else if (event.key === 'ArrowUp') step(at < 0 ? 0 : -1)
    else if (event.key === 'Home') items[0]!.focus()
    else if (event.key === 'End') items[items.length - 1]!.focus()
    else if (event.key === 'Escape') closeMenu(true)
    else return
    event.preventDefault()
    event.stopPropagation()
  })

  const onKey = (event: KeyboardEvent) => {
    viaKeyboard = true
    if (event.key !== 'Escape') return
    if (menuOpen()) closeMenu(true)
    else if (panelOpen()) closePanel(true)
  }
  /** A press anywhere but on the button's column or its panel closes the menu and the panel */
  const onPress = (event: Event) => {
    viaKeyboard = false
    const path = event.composedPath()
    if (path.includes(column) || path.includes(panelBox)) return
    closeMenu()
    closePanel()
  }
  const onFullscreen = () => {
    const full = doc.fullscreenElement != null
    dock.hidden = full
    if (full && press) endPress(false)
  }
  const onMessage = (event: MessageEvent) => {
    if (!frame || event.source !== frame.contentWindow) return
    const data = event.data as { type?: unknown; height?: unknown } | null
    if (data?.type === 'axt:panel-size' && typeof data.height === 'number' && data.height > 0) {
      panelHeight = data.height
      placePanel()
    // closed from inside (Escape in the frame): the focus goes back to the control that opened it, as on Escape outside (#614)
    } else if (data?.type === 'axt:panel-close') closePanel(true)
  }
  const onResize = () => {
    if (!dragging()) placeTop()
    placePanel()
  }
  doc.addEventListener('keydown', onKey)
  doc.addEventListener('pointerdown', onPress)
  doc.addEventListener('fullscreenchange', onFullscreen)
  win.addEventListener('message', onMessage)
  win.addEventListener('resize', onResize)

  const api: FloatingButton = {
    relabel: next => { strings = next; label() },
    activate: active => mark('axtActive', active),
    place: next => { if (!press) place(next) },
    openPanel,
    rescale: next => {
      if (!Number.isFinite(next) || next <= 0) return
      zoom = next
      dock.style.setProperty('--axt-unzoom', String(1 / next))
      placePanel()
    },
    retheme: theme => {
      if (theme === 'light' || theme === 'dark') dock.dataset.axtTheme = theme
      else delete dock.dataset.axtTheme
    },
    remove: () => {
      closePanel()
      if (press) endPress(false)
      clearDwell()
      clearGrace()
      doc.removeEventListener('keydown', onKey)
      doc.removeEventListener('pointerdown', onPress)
      doc.removeEventListener('fullscreenchange', onFullscreen)
      win.removeEventListener('message', onMessage)
      win.removeEventListener('resize', onResize)
      host.remove()
    },
  }

  // the dock's marks in the order the page has always seen them: theme, language, side, then the states
  api.retheme(options.theme ?? 'system')
  dock.lang = strings.lang
  dock.dataset.axtSide = placement.side
  mark('axtLit', false)
  mark('axtExpanded', false)
  mark('axtDragging', false)
  mark('axtActive', false)
  api.rescale(1)
  api.rescale(options.zoom ?? 1)
  place(placement)
  return api
}
