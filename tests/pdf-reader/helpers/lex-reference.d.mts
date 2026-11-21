// lex-reference.mjs's types: the remover's lexer as it was at 42bf0cf7, the reference the lexer is held to
/** a content stream's operators (those of `keep`, null: every one), holding at most `limit` bytes by COST (past it LexLimit) */
export declare function lexReference(bytes: Uint8Array, limit?: number, keep?: ReadonlySet<string> | null): { op: string; args: unknown[]; s: number; e: number }[] & { bytes: number }
