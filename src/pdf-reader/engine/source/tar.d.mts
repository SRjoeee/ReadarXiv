// tar.mjs's types (JavaScript until the engine's port), for the reader's tests
/** a tar archive → its regular files, each under the name TeX's file system has it */
export declare function untar(bytes: Uint8Array): Map<string, Uint8Array>
/** gzip's inflate (the platform's DecompressionStream) */
export declare function gunzip(bytes: Uint8Array): Promise<Uint8Array>
/** the response body of a paper's source → its files, or `{ pdf: true }` when arXiv has no source for the paper */
export declare function unpackSource(bytes: Uint8Array, fallbackName?: string): Promise<{ pdf: true } | { files: Map<string, Uint8Array> }>
