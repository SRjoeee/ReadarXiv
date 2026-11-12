// The types of sync.mjs (the identity follower, carried as it is from src/pdf-reader/engine/view/sync.mjs at baf2083e0, byte
// for byte, as the contract asks: "scroll sync carried as it is"), what its declarations stated, the value re-exported typed.
// @ts-ignore: JavaScript carried as it is, typed by this file alone (a package holds no declaration file)
import * as sync from './sync.mjs'

/** a pane as the follower moves it: its scroller, its page stack (what a transform moves), its pages drawn where they now
 *  show, and its renderer told it shows `shift()` px below its scrollTop (null to stop) */
export interface FollowPane {
  container: HTMLElement
  stack: HTMLElement
  redraw(): void
  lend(shift: (() => number) | null): void
}
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
  /** `top(p)`: a pane's scrollTop as its scroll events gave it, read in its place (none: read off the pane) */
  shownAt(pane: P, top?: (p: P) => number): number
  levelError(side: P): number | null
  driver(): P | null
  motion(): 'scroll' | 'glide' | 'spring' | null
  compositing(): boolean
  stop(): void
}
export interface FollowerOptions<P extends FollowPane> {
  panes: { left: P; right: P }
  active(): boolean
  target(from: P): number | null
  clock: {
    now(): number
    frame(cb: () => void): number
    cancel(id: number): void
    later(cb: () => void, ms: number): number
    clear(id: number): void
  }
  timer: boolean
  compositor: (new (o: { source: Element; axis: string }) => unknown) | null
  reduced(): boolean
  laidOut(el: Element): Promise<void>
  window: EventTarget
  signal: AbortSignal
}
export const createFollower: <P extends FollowPane>(o: FollowerOptions<P>) => Follower<P> = sync.createFollower
