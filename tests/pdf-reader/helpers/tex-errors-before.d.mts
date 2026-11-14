// tex-errors-before.mjs's types: a compile's TeX errors and their units as they were at 4ad80aac5, the reference its code change
// of the typing lane T6 is held to (tests/pdf-reader/tex-errors-bounds.test.ts)
export interface TexError { message: string; line: number; before: string; after: string; char?: number }
export declare function texErrors(log: string | null | undefined): TexError[]
export declare function unitsAtErrors<U>(errors: readonly TexError[], files: ReadonlyMap<string, Uint8Array>, lines: readonly { file: string; unit: U; first: number; last: number; from?: number; to?: number; post?: number }[]): U[]
