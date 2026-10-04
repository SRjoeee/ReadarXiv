// tex-errors.mjs's types (JavaScript until the engine's port), for the reader's tests
/** a TeX error as its log writes it: its message, the line of input TeX was reading and the text around its place, and
 *  the code point of a letter lost */
export interface TexError { message: string; line: number; before: string; after: string; char?: number }
/** TeX's errors in a compile's last pass that a line of input places */
export declare function texErrors(log: string | null | undefined): TexError[]
/** a unit's lines and bytes in a file a compile was given (live.mjs translationFiles' spans) */
export interface UnitLines<U> { file: string; unit: U; first: number; last: number; from?: number; to?: number }
/** the units whose lines hold the errors */
export declare function unitsAtErrors<U>(errors: TexError[], files: Map<string, Uint8Array>, lines: UnitLines<U>[]): U[]
