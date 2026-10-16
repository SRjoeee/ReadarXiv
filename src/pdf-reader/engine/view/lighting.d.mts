// lighting.mjs's types (JavaScript until the engine's port), for the reading view
import type { PageBox, Shapes } from './reader-view.mjs'

/** a pane as the lighting keeps it: the view's own object, its shapes and starts and what is painted on it */
export interface LitSide { shapes: Shapes | null; starts: ReadonlyMap<number, Int32Array> | null; lit: Element[]; shows: { id: number; s: number } | null }
export interface Lighting {
  light(target: { id: number; s: number } | null): void
  lit(): { id: number; s: number } | null
  paint(side: object): void
  find(side: object, x: number, y: number): { id: number; s: number } | null
  setShapes(side: object, shapes: Shapes | null, starts?: ReadonlyMap<number, Int32Array> | null): void
  dispose(): void
}
export declare function createLighting(o: {
  sides: [object, object]
  box(side: object, r: PageBox): { left: number; top: number; width: number; height: number }
  scaleOf(side: object, page: number): number
  layerOf(side: object, page: number): HTMLElement | null
  pointAt(side: object, x: number, y: number): { page: number; x: number; y: number; scale: number } | null
  on(): boolean
  want(side: object, page: number): void
  again(): void
  later(cb: () => void): number
  clear(id: number): void
}): Lighting
