// places.mjs's types (JavaScript until the engine's port), for the reading view
import type { PdfJsKit, PlaceContent, PlaceView, ViewClock } from './reader-view.mjs'

export declare const NEAR: string
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
  near(n: number): boolean
  page(n: number): HTMLElement | null
  /** the focus given to place n (a keyboard's jump to it): at once where it shows a page, else once it does, within
   *  FOCUS_WAIT_MS; given up where the focus moves meanwhile */
  focus(n: number): void
  count(): number
  views(): { get(n: number): PlaceView | null; all(): PlaceView[]; count(): number }
  rename(): void
  probe(): { places: number; pageViews: number; skeletons: number; laidPlaces: number; nearPlaces: number; pageViewsMade: number }
  dispose(): void
}
/** how long after a keyboard's jump the place jumped to may still take the focus when it comes to show its page */
export declare const FOCUS_WAIT_MS: number
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
