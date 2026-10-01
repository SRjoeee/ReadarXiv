// addresses.mjs's types (JavaScript until the engine's port), for the reader's tests
/** the TeX page the build typesets with: our site's in production, this machine's in development */
export declare const TEX_PAGE: string
export declare function readerAddresses(params: URLSearchParams, paper: string, texPage?: string): { site: string; endpoint: string; src: string; pdf: string }
