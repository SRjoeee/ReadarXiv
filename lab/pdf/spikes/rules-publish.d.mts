// rules-publish.mjs's types, for its tests
type Fetch = (url: string, init: { method: string; redirect: string; headers: Record<string, string>; body: string | Uint8Array }) => Promise<{ status: number; text(): Promise<string> }>
export declare function originOf(text: string): string
export declare function point(o: { url: string; schema: number; version: number; secret: string | undefined; fetchImpl?: Fetch }): Promise<string>
export declare function publish(o: { url: string; file: string; secret: string | undefined; fetchImpl?: Fetch; engine?: { readRules(bytes: Uint8Array): Promise<{ set: { schema: number; version: number }; sha256: string }> } }): Promise<string[]>
