// no-start.mjs's types (JavaScript until the engine's port)
/** the code points UAX 14 does not let a line start with (CL, CP, IS, EX, NS), as [first, last] ranges */
export declare const NO_START: readonly [number, number][]
/** whether a character (its first code point) is one UAX 14 does not let a line start with */
export declare function noStart(ch: string | null | undefined): boolean
/** whether no line may break between one text's last character and the next's first: UAX 14's B2 × B2 and IN × IN */
export declare function keptPair(a: string | null | undefined, b: string | null | undefined): boolean
