// online.mjs's types: the e2e scripts that go online, run only when asked, under the project's User-Agent, never against production
export declare const ONLINE: string
export declare const PROJECT_UA: string
export declare const PRODUCTION_HOSTS: readonly string[]
export declare const PRODUCTION_API: string
export declare const STAGING_API: string
/** `url`, where it is not our production server; throws where it is */
export declare function refuseProduction(url: string): string
/** the reader's server the build at `build` talks to; null where there is no build there */
export declare function readerServerOf(build: string): string | null
/** an online script's first call: without the opt-in it says how on one line and exits (2) before any browser starts */
export declare function goOnline(name: string, o?: { env?: Record<string, string | undefined>; exit?: (code: number) => unknown; log?: (line: string) => void }): unknown
/** a context's launch options for an online run, with the project's User-Agent on its pages and on the browser's own requests;
 *  throws where an extension it loads talks to our production server */
export declare function online<T extends { args?: string[] }>(options?: T): T & { userAgent: string; args: string[] }
