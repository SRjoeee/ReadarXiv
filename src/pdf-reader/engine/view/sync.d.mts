// sync.mjs's types (JavaScript until the engine's port): the identity follower
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
