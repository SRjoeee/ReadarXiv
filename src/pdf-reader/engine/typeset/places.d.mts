// places.mjs's types (JavaScript until the engine's port), for the reader's tests
/** a mark: page 0-based, PDF points */
export interface Place { page: number; x: number; y: number }
/** a compile's unit marks (`<n>s`, `<n>e`) and its pages */
export interface Marks { pages: number; width: number; height: number; twoColumn: boolean; marks: Map<string, Place> }
interface Spread { values: number[]; median: number | null; within: number | null }
export declare function alignment(om: Marks, tm: Marks): { pages: number; matched: number; missing: number; drift: Spread & { p90: number | null }; size: Spread & { p10: number | null; p90: number | null } }
export declare function drifts(om: Marks, tm: Marks): Map<number, number>
/** from a PDF.js document */
export declare function marksOf(pdf: unknown): Promise<Marks>
