// addresses.mjs's types (JavaScript until the engine's port), for the reader's tests
/** the TeX page the build typesets with: our site's in production, this machine's in development */
export declare const TEX_PAGE: string
/** the TeX Live file server a protocol-1 page reads: this machine's in development, none in production */
export declare const FILE_SERVER: string | null
export declare function readerAddresses(params: URLSearchParams, paper: string, texPage?: string, fileServer?: string | null): { site: string; endpoint: string | null; src: string; pdf: string }
