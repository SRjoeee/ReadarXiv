// same-code.mjs's types, for its tests (tests/scripts/same-code.test.ts)
export interface Version { path: string; text: string; at?: string }
export interface Row {
  old: string | null
  new: string | null
  verdict: 'same code' | 'code changed' | 'code added' | 'code removed' | 'unreadable' | 'not code'
  role?: string
  facade?: string
  difference?: { at: number; old: string; new: string }
}
export declare function proofKindOf(path: string): 'code' | 'types' | 'style' | 'other'
export declare function erasedOf(text: string, path: string): string | null
export declare function mappedOf(code: string, from: string, to: string, renames?: Map<string, string>, aliases?: { from: string; to: string }[]): string
export declare function verdictOf(old: Version | null, next: Version | null, renames?: Map<string, string>): Row
export declare function facadeOf(text: string, path: string, moduleText: (path: string) => string | null): string | null
export declare function changesOf(repo: string, base: string, head?: string | null, extra?: [string, string][]): { pairs: [string, string][]; added: string[]; deleted: string[] }
export declare function compareRefs(repo: string, base: string, head?: string | null, extra?: [string, string][]): Row[]
export declare function summaryOf(rows: Row[], all?: boolean): { judged: number; same: number; changed: number; others: number; notCode: number }
