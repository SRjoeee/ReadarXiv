// places.mjs's types (JavaScript until the engine's port), for the reading view
import type { DrawnCanvas, PdfJsKit, PlaceContent, PlaceView, ViewClock } from './reader-view.mjs'

export declare const NEAR: string
/** the most a place near the view but not in it waits to draw the original's page (ms), from the places' making */
export declare const AHEAD_HOLD_MS: number
/** the left's page view as a place reads it: its page box (its style is the place's), its viewport and page */
export interface OriginalPage { div: HTMLElement; viewport: PlaceView['viewport']; pdfPage: { view: number[] } | null }
export interface Places {
  lay(count: number): void
  size(n?: number): void
  scale(scaleFactor: string, scale: number, drawingDelay?: number): void
  setDocument(doc: { getPage(n: number): Promise<unknown> } | null): void
  swap(n: number, content: HTMLElement): boolean
  restore(n: number): void
  contentOf(n: number): PlaceContent
  /** the canvas of place n's own page view where PDF.js drew it whole, with the scale it drew it at; null else */
  canvas(n: number): DrawnCanvas | null
  /** place n's box in CSS px as PDF.js sizes the left's page n; null with no viewport */
  box(n: number): { width: number; height: number } | null
  near(n: number): boolean
  page(n: number): HTMLElement | null
  /** the focus given to place n (a keyboard's jump to it): at once where it shows a page, else once it does, within
   *  FOCUS_WAIT_MS; given up where the focus moves meanwhile */
  focus(n: number): void
  count(): number
  /** the places near the view but not in it drawn from now on (the layer's first page there, or none to wait for) */
  letAheadGo(): void
  /** whether they still wait */
  aheadHeld(): boolean
  views(): { get(n: number): PlaceView | null; all(): PlaceView[]; count(): number }
  rename(): void
  probe(): { places: number; pageViews: number; skeletons: number; laidPlaces: number; nearPlaces: number; pageViewsMade: number; aheadHeld: boolean }
  dispose(): void
}
/** how long after a keyboard's jump the place jumped to may still take the focus when it comes to show its page */
export declare const FOCUS_WAIT_MS: number
/** how long the laid pages' text layers stay out of style and layout after a zoom's steps are drawn again (ms) */
export declare const TEXT_BACK_MS: number
export declare function createPlaces(o: {
  stack: HTMLElement
  root: HTMLElement
  kit: PdfJsKit
  clock: ViewClock
  signal: AbortSignal
  eventBus: unknown
  original(n: number): OriginalPage | null
  scale(): number
  layers(): Record<string, unknown>
  l10n(): unknown
  name(n: number): string
  near(n: number, on: boolean): void
  warn(what: string, e: unknown): void
}): Places
