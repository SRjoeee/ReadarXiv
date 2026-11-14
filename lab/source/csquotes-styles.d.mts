// csquotes-styles.mjs's types, for its tests (tests/lab/csquotes-styles.test.ts)
export declare function symbolsOf(tuenc: string): Map<string, string>
export declare function englishOf(def: string): { styles: Map<string, string[]>; names: Map<string, string> }
export declare function differencesOf(
  files: { def: string; tuenc: string },
  table: {
    english: Readonly<Record<string, readonly (readonly [string, string])[]>>
    names: Readonly<Record<string, string>>
    fallback: string
  },
): string[]
