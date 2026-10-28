// gate-pack.mjs's types, for its tests (the S3 read it uses is scripts/r2-read.d.mts)
export declare const PACK_SCHEMA: 2
export declare const BUCKET: 'readarxiv-ci'
export declare const KEY_PREFIX: 'gate-pack/'
export declare const ROLE_WEIGHTS: string[]
export declare function sha256(bytes: Uint8Array | string): string
export interface PackFile { path: string; sha256: string; bytes: number }
export interface LayoutVersion { schema: number; version: string }
/** one TeX Live year's entry of lab/pdf/compile-images.json: the compile image pinned by digest, shared with the web container */
export interface CompileImage { texlive: string; base: string; node: string; aptSnapshot: string | null; texFormat: Record<string, string | number | null> & { texlive: number } }
/** lab/pdf/compile-images.json: the pins by TeX Live year ('2025'), and the year a paper is compiled on unless routed */
export interface CompileImages { default: string; images: Record<string, CompileImage> }
/** a pack's compile image: its year's pin, with the year (absent in a pack made before it was written: the default year's) */
export interface PackImage extends CompileImage { year?: string }
export interface Manifest { schema: number; pipeline: string; layout: LayoutVersion; compileImage?: PackImage; made: string; digest: string; files: PackFile[] }
export interface PackJson extends Manifest { bucket: string; files: (PackFile & { url: string })[] }
export declare function listingDigest(files: PackFile[]): string
export declare function fontFiles(faces: Record<string, { file: string }>, known: { group: string }[], used: { group: string }[]): string[]
export declare function outputsOf(dir: string): string[]
export declare function entriesOf(o: { fixtures: string; records: string; refs: string; geometry: string; fontsDir: string; fonts: string[]; patterns: Record<string, string>; texmf: string }): { path: string; from: string }[]
export declare function pipelineOf(records: string, names: string[]): string
export declare const RECORD_INPUTS: string[]
export declare function inputsOfRecord(record: unknown, o: { root: string; repo: string; flags?: Record<string, string | boolean | null | undefined>; exists?: (path: string) => boolean; home?: string }): { fixtures: string; records: string; refs: string; geometry: string }
export declare function layoutOfEngine(engine: string): Promise<LayoutVersion>
/** base.json's schema */
export declare const BASE_RECORD_SCHEMA: 1
/** a fixture's base page record (base.json), checked against base.pdf and layout.json; null where it has none */
export declare function baseRecordOf(dir: string): (
  | { schema: 1; source: 'ours'; base: { sha256: string; bytes: number; xref: number; pages: number; tree: string; check: Record<string, unknown> }; layout: { sha256: string; bytes: number } | null }
  | { schema: 1; source: 'arxiv'; why: string; detail?: string; layout: { sha256: string; bytes: number } }
) | null
/** the record base.json holds for a fixture a make of the fixtures made */
export declare function baseRecordOfMade(o: { made: { source: 'ours'; head: Record<string, unknown> } | { source: 'arxiv'; why: string; detail?: string }; layout: Uint8Array | null; image?: string | null; texts?: readonly string[] | null; inkless?: readonly string[] | null }): Record<string, unknown>
/** the layout file a fixture keeps where its base page of ours is refused: an older maker's, never the engine's own */
export declare function keptLayoutOf(bytes: Uint8Array | null, engineLayout: string): Uint8Array | null
export declare function layoutVersionOf(fixtures: string, names: string[], expected: LayoutVersion): LayoutVersion
export declare function makePack(o: { entries: { path: string; from: string }[]; out: string; pipeline: string; layout: LayoutVersion; compileImage?: PackImage | null; made?: string }): Manifest
export declare const COMPILE_IMAGES_FILE: string
export declare function compileImagesOf(file?: string): CompileImages
export declare function compileImageOf(year?: string | number | null, file?: string): CompileImage
export declare function packPathsOf(year: string | number, defaultYear: string | number): { json: string; out: string; record: string }
export declare function localImageDigests(ref: string, run?: (cmd: string, args: string[], o: object) => string): string[]
export declare function checkCompileImage(pinned: CompileImage, digests: readonly string[], env?: Record<string, string | undefined>): void
export declare function packJsonOf(manifest: Manifest, bucket?: string): PackJson
export declare function summaryOf(files: PackFile[]): { files: number; bytes: number; objects: number; objectBytes: number; kinds: { kind: string; files: number; bytes: number }[] }
export declare function objectUrl(account: string, url: string, bucket?: string): string
type Fetch = (url: string, init: { headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }>
export declare function restorePack(o: { pack: PackJson; dir: string; token: string | undefined; account: string | undefined; fetchImpl?: Fetch; retryMs?: number; now?: () => Date; log?: (line: string) => void }): Promise<{ files: number; objects: number; fetched: number; kept: number }>
export declare function verifyPack(o: { pack: PackJson | Manifest; dir: string }): string[]
export declare function objectsOf(pack: PackJson, bucket?: string): { key: string; bucket: string; sha256: string; bytes: number; path: string }[]
