// settles.mjs's types: a browser check's own steps bounded, and what the browser says while one stands
/** `step()`'s value (or its own error); past `ms` (30 s), an Error naming `what` with what `tell()` says then (bounded by
 *  `tellMs`, 15 s) */
export declare function settles<T>(what: string, step: () => T | Promise<T>, o?: { ms?: number; tell?: (() => string | Promise<string>) | null; tellMs?: number }): Promise<T>
/** one line: each page's answer or silence in `answerMs` (3 s), each tab's flags as the extension's worker reads them, each
 *  of the browser's processes' share of a core over a second where Playwright gives a session on the browser */
export declare function stallReport(
  t: { context: { pages(): { url(): string; evaluate(fn: () => unknown): Promise<unknown> }[]; browser?(): unknown }; worker: { evaluate(fn: () => unknown): Promise<unknown> } },
  o?: { answerMs?: number },
): Promise<string>
/** DevTools' call frames as a paused page gives them */
export interface CallFrame { functionName: string; url: string; location: { scriptId?: string; lineNumber: number; columnNumber?: number } }
/** a paused page's top `n` (12) frames, one line each: function, file (the extension's origin less), line:column (1-based) */
export declare function framesOf(callFrames: readonly CallFrame[], n?: number): string[]
/** `width` (200) characters of a source around a 0-based line and column */
export declare function excerpt(source: string, lineNumber: number, columnNumber?: number, width?: number): string
/** a trace's account of the main thread of the renderer hosting `origin`'s pages (its samples over the last `recentMs`, 5 s);
 *  null where the trace names none */
export declare function traceStall(events: readonly Record<string, unknown>[], o: { origin: string; longMs?: number; last?: number; recentMs?: number }): string | null
/** the watch over a section whose readers may stick (see settles.mjs) */
export declare function stallWatch(o: { context: unknown; worker: unknown; extensionDir: string; origin: string }): Promise<{
  watch(page: unknown): Promise<void>
  report(named: Record<string, unknown>, known: () => string, print: (line: string) => void, step?: { what: string; at: number } | null): Promise<string>
  end(): Promise<void>
}>
