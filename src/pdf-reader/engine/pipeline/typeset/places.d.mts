// places.mjs's types (JavaScript until the engine's port), for the reader's tests
/** a mark: page 0-based, PDF points */
export interface Place { page: number; x: number; y: number }
/** a compile's unit marks (`<n>s`, `<n>e`), its pages, and each page's columns as its compile set it (1, 2; 0 unread) */
export interface Marks { pages: number; width: number; height: number; columns: number[]; marks: Map<string, Place> }
interface Spread { values: number[]; median: number | null; within: number | null }
export declare function alignment(om: Marks, tm: Marks): { pages: number; matched: number; missing: number; drift: Spread & { p90: number | null }; end: Spread & { p90: number | null }; size: Spread & { p10: number | null; p90: number | null } }
export declare function drifts(om: Marks, tm: Marks): Map<number, number>
/** the column a place in either document is in on its page, on the original's (`om`) columns: 1 for the right one of a
 *  page the original set in two columns */
export declare function columnOf(om: Marks, at: Place): 0 | 1
/** from a PDF.js document */
export declare function marksOf(pdf: unknown): Promise<Marks>
