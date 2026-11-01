// paper-names.mjs's types: the structural names a paper's TeX prints that no package names in every target
/** the names a paper's units may hold at most */
export declare const NAMES_MAX: number
/** the paper's structural names (`texts`, its files' TeX in the order they are read), each once, in the order first written:
 *  its theorem-like environments' printed names, the reference names it gives cleveref, thmtools and \autoref, and, where it
 *  calls cleveref or \autoref, the words no package names in some target */
export declare function paperNames(texts: readonly string[]): string[]
/** the printed names of the paper's theorem-like environments alone, each once, in the order first written: the names a head's
 *  label may hold (layout/own.mjs) */
export declare function theoremNames(texts: readonly string[]): string[]
