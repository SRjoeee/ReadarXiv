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
