// gate-pack.mjs's types, for its tests
export declare const PACK_SCHEMA: 1
export declare const BUCKET: 'readarxiv-ci'
export declare const KEY_PREFIX: 'gate-pack/'
export declare const ROLE_WEIGHTS: string[]
export declare function sha256(bytes: Uint8Array | string): string
export interface PackFile { path: string; sha256: string; bytes: number }
export interface Manifest { schema: number; pipeline: string; made: string; digest: string; files: PackFile[] }
export interface PackJson extends Manifest { bucket: string; files: (PackFile & { url: string })[] }
export declare function listingDigest(files: PackFile[]): string
export declare function fontFiles(faces: Record<string, { file: string }>, known: { group: string; kai: string | null }[], used: { group: string; kai: string | null }[]): string[]
export declare function outputsOf(dir: string): string[]
export declare function entriesOf(o: { fixtures: string; records: string; refs: string; geometry: string; fontsDir: string; fonts: string[]; patterns: Record<string, string>; texmf: string }): { path: string; from: string }[]
export declare function pipelineOf(records: string, names: string[]): string
export declare function makePack(o: { entries: { path: string; from: string }[]; out: string; pipeline: string; made?: string }): Manifest
export declare function packJsonOf(manifest: Manifest, bucket?: string): PackJson
export declare function summaryOf(files: PackFile[]): { files: number; bytes: number; objects: number; objectBytes: number; kinds: { kind: string; files: number; bytes: number }[] }
export declare function objectUrl(account: string, url: string, bucket?: string): string
export declare function restorePack(o: { pack: PackJson; dir: string; token: string | undefined; account: string | undefined; fetchImpl?: (url: string, init: { headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>; retryMs?: number; log?: (line: string) => void }): Promise<{ files: number; objects: number; fetched: number; kept: number }>
export declare function verifyPack(o: { pack: PackJson | Manifest; dir: string }): string[]
export declare function objectsOf(pack: PackJson, bucket?: string): { key: string; bucket: string; sha256: string; bytes: number; path: string }[]
