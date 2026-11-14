// pattern.mjs's types
export interface PatternWord { word: string; at: number; look: 'pos' | 'neg' | null; repeated: boolean }
export declare function wordOf(text: string): string | null
export declare function entriesOf(pattern: string, flags?: string): { words: PatternWord[]; shadow: string | null; marks: [number, number][]; why: string | null }
