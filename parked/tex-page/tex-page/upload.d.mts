// upload.mjs's types, for the tests
export type Row = { key: string; file: string; type: string; encoding: string; cache: string; bytes: number; sha256: string }
export declare const IMMUTABLE: string
export declare const ENTRY: string
export declare const TYPES: Record<string, string>
export declare function headersOf(key: string, tid: string): { type: string; cache: string }
export declare function brotliWorth(raw: number, br: number): boolean
export declare const COLUMNS: string[]
export declare function listText(rows: Row[]): string
export declare function parseList(text: string): Row[]
export declare function writeUploadList(options: { site: string; tree: string; tid: string; hashes: Map<string, string>; out: string; parallel?: number; say?: (line: string) => void }): Promise<Row[]>
