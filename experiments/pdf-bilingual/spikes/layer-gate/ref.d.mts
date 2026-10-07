// ref.mjs's types, for the tests: what they read of it
/** a local path as a record keeps it, with no user's name or machine's directory in it */
export declare function shownPath<T>(p: T, base?: string | null): T extends string ? string : T
