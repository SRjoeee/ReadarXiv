// scripts.mjs's types (JavaScript until the engine's port), for the reader's tests
/** the languages the typesetting gate verified, as BCP 47 tags */
export declare const VERIFIED: readonly string[]
/** whether a BCP 47 tag names a language whose typesetting is verified */
export declare function verified(tag: string): boolean
