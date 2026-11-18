// frozen.mjs's types, for its tests (tests/lab/parity-frozen.test.ts)
export declare const FROZEN_FORMAT: string
export declare function encode(v: unknown): unknown
export declare function decode(v: unknown): unknown
export declare function recordFile(dir: string, toggles: string, pair: string): string
export declare function putShot(dir: string, b64: string): string
export declare function getShot(dir: string, digest: string): string
export interface Inputs { desc: unknown; rows: string; pdf: string }
export interface FrozenPage { page: number; error?: string; [k: string]: unknown }
export interface FrozenRecord { format: string; pair: string; toggles: string; inputs: Inputs; opened: unknown; errors: string[]; pages: FrozenPage[]; [k: string]: unknown }
export declare function readRecord(dir: string, toggles: string, pair: string): FrozenRecord | null
export declare function writeRecord(dir: string, toggles: string, pair: string, record: Omit<FrozenRecord, 'format'>): void
export declare function inputsOf(desc: unknown, rowsBytes: Uint8Array, pdfBytes: Uint8Array): Inputs
export declare function staleOf(record: FrozenRecord, toggles: string, inputs: Inputs): string | null
export declare function pageOf(record: FrozenRecord, n: number): FrozenPage
