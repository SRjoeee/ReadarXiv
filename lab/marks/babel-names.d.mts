// babel-names.mjs's types, for its tests (tests/lab/babel-names.test.ts)
export declare const MACRO_RULE: string
export declare function captionsOf(ini: string): Map<string, string>
export declare function differencesOf(
  files: { ini: string; sty: string },
  lists: {
    keys: readonly string[]
    english: Readonly<Record<string, string>>
    macros: Readonly<Record<string, string>>
  },
): string[]
