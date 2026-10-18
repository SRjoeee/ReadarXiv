// overlay.mjs's functions for TypeScript
export interface Box { left: number; top: number; width: number; height: number }
export interface PinnedStyle { left: string; top: string; width: string; height: string; transformOrigin: string; scale: string }
export function pinned(box: Box, s0: number): PinnedStyle
export interface Keeper { observe(page: Element): void; drop(el: Element): void; disconnect(): void }
export function keepOverlays(selector: string): Keeper
