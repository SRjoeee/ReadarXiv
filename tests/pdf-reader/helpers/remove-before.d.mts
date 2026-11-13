// remove-before.mjs's types: the remover as it was at d42fb8bca, the reference its stated bounds are held to
/** a content stream's operators (those of `keep`, null: every one), holding at most `limit` bytes by COST (past it LexLimit) */
export declare function lex(
  bytes: Uint8Array,
  limit?: number,
  keep?: ReadonlySet<string> | null,
): { op: string; args: unknown[]; s: number; e: number }[] & { bytes: number }
/** the remover over one document, as the test reads it: its pages walked, a stream decoded */
export declare function openRemover(
  bytes: Uint8Array,
  o: { PL: unknown; inflate?: ((bytes: Uint8Array, limit: number) => Uint8Array) | null },
): Promise<{ numPages: number; walkPage(pageIndex: number): unknown; decode(st: unknown, limit?: number): Uint8Array; ctx: { lookup(v: unknown): unknown } }>
/** a page's alignment facts from PDF.js's operator list, and the same as a reader of the list in pieces */
export declare function alignOf(
  OPS: Record<string, number>,
  opList: { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> },
): { codes: (number | null)[][]; paths: number; images: number }
export declare function alignReader(OPS: Record<string, number>): {
  read(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>): void
  end(): { codes: (number | null)[][]; paths: number; images: number }
}
