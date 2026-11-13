// chromium.mjs's types: the one place the browser checks' launch options turn Chromium's features off
export declare const PLAYWRIGHT_OFF: readonly string[]
export declare const CHROME_OFF: readonly string[]
/** a launch's options with Playwright's list and Chrome's priority policy off, its own switches after them; `partitioned`:
 *  storage partitioning left on. Throws where the options bring a --disable-features of their own */
export declare function chromiumOptions<T extends { args?: string[] }>(options?: T, o?: { partitioned?: boolean }): T & { args: string[] }
