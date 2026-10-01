// pointer.mjs's types (JavaScript until the engine's port), for the reader's tests

/** the parts of an element measurePane reads */
export interface Box {
  getBoundingClientRect(): { left: number; top: number }
  readonly clientLeft: number
  readonly clientTop: number
  readonly offsetLeft: number
  readonly offsetTop: number
  readonly offsetParent: Box | null
  readonly scrollLeft: number
  readonly scrollTop: number
}
/** a page view's viewport, as pointOn uses it */
export interface Viewport { width: number; height: number; scale: number; convertToPdfPoint(x: number, y: number): number[] }
/** where a pane and its pages are (measurePane) */
export interface PaneAt { left: number; top: number; tops: Float64Array; lefts: Float64Array }

export declare function measurePane(container: Box, stack: Box, pages: { div: Box }[]): PaneAt
export declare function pointOn(at: PaneAt | null | undefined, pages: { viewport: Viewport }[], scrollX: number, scrollY: number, clientX: number, clientY: number): { page: number; x: number; y: number; scale: number } | null

export interface Pointer<W> { where: W; x: number; y: number }
export interface PointerPath<W> {
  moved(where: W, x: number, y: number): void
  again(where: W): void
  left(where: W): void
  readonly hit: number | null
}
export declare function pointerPath<W>(o: {
  find: (pointer: Pointer<W>) => number | null
  light: (id: number | null) => void
  lit: () => boolean
  hold: number
  frame: (step: () => void) => number
  later: (run: () => void, ms: number) => number
  cancel: (timer: number) => void
}): PointerPath<W>
