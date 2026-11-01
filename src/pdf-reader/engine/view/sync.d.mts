// sync.mjs's types (JavaScript until the engine's port): the map between two layouts, and the identity follower
/** a line of a unit on one side: its top and bottom in that side's scroll coordinates, the band of the page it is in
 *  ('full', or a column's), its page */
export interface SyncLine { top: number; bot: number; band: string; page: number }
/** a unit on one side: its place in the text layer's reading order and its lines */
export interface SyncSide { stream: number; lines: SyncLine[] }
/** a unit as both sides locate it, in source order */
export interface SyncUnit { id: number; L: SyncSide; R: SyncSide }
/** a line in λ order: the λ range it covers and the unit's index in the chain */
export interface TableLine extends SyncLine { lam0: number; lam1: number; k: number }
/** the units the two sides are read by, in the order both read them: the heaviest run whose stream index rises on both sides */
export declare function flowChain(units: readonly SyncUnit[]): SyncUnit[]
/** one side's lines of the chain in λ order */
export declare function lineTable(chain: readonly SyncUnit[], side: 'L' | 'R'): TableLine[]
/** a side's height at λ: down its line in proportion */
export declare function posAt(table: readonly TableLine[], lam: number): number
/** the knots (pairs of heights, left and right) of the map between the two sides, rising on both, between the documents' ends */
export declare function knots(chain: readonly SyncUnit[], L: readonly TableLine[], R: readonly TableLine[], ends: { endL: number; endR: number }): [number, number][]
/** a map through knots, both ways, as a monotone C¹ curve */
export declare function makeMap(points: readonly (readonly [number, number])[]): { ltr(y: number): number; rtl(y: number): number }

// ---------------------------------------------------------------- the identity follower
/** a pane as the follower moves it: its scroller, its page stack (what a transform moves), its pages drawn where they now
 *  show, and PDF.js told it shows `shift()` px below its scrollTop (null to stop) */
export interface FollowPane { container: HTMLElement; stack: HTMLElement; redraw(): void; lend(shift: (() => number) | null): void }
export interface Follower<P extends FollowPane = FollowPane> {
  input(side: P, type: string): void
  hover(side: P): void
  scrolled(side: P): boolean
  ended(side: P): void
  touches(fingers: number): void
  level(from: P, y: number, there: number): number
  zoomed(): void
  zooming(side: P | null): void
  take(side: P): void
  put(container: HTMLElement, top: number): void
  bake(): void
  invalidate(): void
  reset(): void
  shift(pane: P): number
  shownAt(pane: P): number
  levelError(side: P): number | null
  driver(): P | null
  motion(): 'scroll' | 'glide' | 'spring' | null
  compositing(): boolean
  stop(): void
}
export declare function createFollower<P extends FollowPane>(o: {
  panes: { left: P; right: P }
  active(): boolean
  target(from: P): number | null
  clock: { now(): number; frame(cb: () => void): number; cancel(id: number): void; later(cb: () => void, ms: number): number; clear(id: number): void }
  timer: boolean
  compositor: (new (o: { source: Element; axis: string }) => unknown) | null
  reduced(): boolean
  laidOut(el: Element): Promise<void>
  window: EventTarget
  signal: AbortSignal
}): Follower<P>
