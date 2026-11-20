// chromium.mjs's types: the one place the browser checks' launch options turn Chromium's features off
export declare const PLAYWRIGHT_OFF: readonly string[]
export declare const CHROME_OFF: readonly string[]
/** a launch's options with Playwright's list and Chrome's priority policy off, its own switches after them; `partitioned`:
 *  storage partitioning left on; `language`: the interface language stated (Playwright's locale, Chromium's --lang, and on
 *  Linux the browser's LANGUAGE, LC_MESSAGES and LANG); `platform`: the system's (process.platform). Throws where the options
 *  bring a --disable-features of their own, or a locale or a --lang beside a language */
export declare function chromiumOptions<T extends { args?: string[]; locale?: string; env?: Record<string, string | undefined> }>(options?: T, o?: { partitioned?: boolean; language?: string | null; platform?: string }): T & { args: string[]; locale?: string; env?: Record<string, string | undefined> }
