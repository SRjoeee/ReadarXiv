// face-files.mjs's types, for its test (tests/lab/face-files.test.ts)
/** a face's tables as face-tables.py writes them: its file, its SHA-256, each alphabet's letters its cmap leaves unmapped,
 *  whether its GSUB has `smcp` and the code points that feature substitutes (ranges); `missing` where the fonts folder lacks
 *  the file */
export type FaceTables = {
  file: string
  sha256?: string
  unmapped?: Readonly<Record<string, string>>
  smcp?: boolean
  smallCaps?: readonly number[]
  missing?: boolean
}
/** the check's reference (face-files.json), the blocks it reads */
export type FaceReference = {
  files: { faces: Readonly<Record<string, string>> }
  letters: { alphabets: Readonly<Record<string, string>> }
  sha256: { faces: Readonly<Record<string, string>> }
}
export declare const REFERENCE: URL
export declare function heldOf(tables: FaceTables, alphabets: Readonly<Record<string, string>>): string[]
export declare function differencesOf(
  tables: Readonly<Record<string, FaceTables>>,
  reference: FaceReference,
  lists: {
    faces: readonly string[]
    holds: Readonly<Record<string, readonly string[]>>
    smcp: readonly string[]
    smallCaps?: Readonly<Record<string, readonly number[]>> | null
  },
): string[]
export declare function smallCapsModule(tables: Readonly<Record<string, FaceTables>>, faces: readonly string[]): string
