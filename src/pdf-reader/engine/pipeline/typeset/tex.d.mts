// tex.mjs's types (JavaScript until the engine's port), for the reader's tests

/** once the last page is out, AXT-END in the log (completeLog): every compile carries it */
export declare const END_TEX: string
export declare const LINES_TEX: string
/** whether a compile's last pass reached the document's end (END_TEX's AXT-END) */
export declare const completeLog: (log: string | null | undefined) => boolean
export declare const readLines: (log: string | null | undefined) => Map<number, { lines: number; bs: number; size?: number }>
