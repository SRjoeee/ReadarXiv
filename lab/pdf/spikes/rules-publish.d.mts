// rules-publish.mjs's types, for its tests
type Fetch = (url: string, init: { method: string; redirect: string; headers: Record<string, string>; body: string | Uint8Array }) => Promise<{ status: number; text(): Promise<string> }>
export declare const RULES_FILE: string
export declare function originOf(text: string): string
/** the version on the ref when it is newer than the run's own, else null */
export declare function supersededBy(own: number, onNext: number | null | undefined): number | null
/** the version the set on a git ref names, or null; throws where the ref cannot be read */
export declare function versionOn(ref: string, o?: { show?: (ref: string, file: string) => string }): number | null
export declare function point(o: { url: string; schema: number; version: number; secret: string | undefined; fetchImpl?: Fetch }): Promise<string>
export declare function publish(o: { url: string; file: string; secret: string | undefined; fetchImpl?: Fetch; engine?: { readRules(bytes: Uint8Array): Promise<{ set: { schema: number; version: number }; sha256: string }> }; onNext?: number | null }): Promise<string[]>
