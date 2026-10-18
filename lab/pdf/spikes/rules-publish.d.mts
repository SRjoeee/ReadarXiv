// rules-publish.mjs's types, for its tests
type Fetch = (url: string, init: { method: string; redirect: string; headers: Record<string, string>; body: string | Uint8Array }) => Promise<{ status: number; text(): Promise<string> }>
export declare const RULES_FILE: string
export declare function originOf(text: string): string
type SetOn = { version: number | null; sha256: string }
/** why the run stands down (a newer version on next, or other bytes under its own), else null */
export declare function supersededBy(own: { version: number; sha256: string }, onNext: SetOn | null | undefined): string | null
/** the set on a git ref: its version (or null) and the sha256 of its bytes; throws where the ref cannot be read */
export declare function setOn(ref: string, o?: { show?: (ref: string, file: string) => string | Uint8Array }): SetOn
export declare function point(o: { url: string; schema: number; version: number; secret: string | undefined; fetchImpl?: Fetch }): Promise<string>
export declare function publish(o: { url: string; file: string; secret: string | undefined; fetchImpl?: Fetch; engine?: { readRules(bytes: Uint8Array): Promise<{ set: { schema: number; version: number }; sha256: string }> }; onNext?: SetOn | null }): Promise<string[]>
