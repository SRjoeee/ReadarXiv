// arg-roles.mjs's types (JavaScript until the engine's port)
/** a parameter: its shape (`{` a group or one token, `[` optional, `*` a star, `?` an optional `=`, `=` a literal `=`,
 *  `_` TeX's own syntax, `b` up to a brace) and its role (`t` text, `c` content, `a` untyped, `d` dimension, `k` keys,
 *  `n` name, `r` register, `x` code, `m` math, `s` literal) */
export interface Param { shape: string; role: string }
/** an argument read: its parameter's shape, role and index, and where it stands */
export interface Arg extends Param { param: number; start: number; end: number }
export declare const LATEXML_COMMIT: string
export declare const ROLES: Readonly<Record<string, string>>
/** the front matter's commands: [role, the argument it is (1-based; 0 an environment's body)] */
export declare const FRONT_ROLES: Readonly<Record<string, [string, number]>>
export declare const paramsOf: (spec: string) => readonly Param[]
/** the LaTeXML bindings a paper's files load (BINDINGS' indices) */
export declare function bindingsOf(texts: string[]): Set<number>
export declare function commandParams(name: string, bindings?: Set<number> | null): readonly Param[] | null
export declare function environmentParams(name: string, bindings?: Set<number> | null): readonly Param[] | null
export declare function groupEnd(s: string, i: number, open?: string, close?: string): number
export declare function readArgs(s: string, i: number, params: readonly Param[], to?: number): { args: Arg[]; end: number; complete: boolean }
/** a placeholder's source with every argument that is never text taken out */
export declare function textArgsOf(src: string): string
/** whether a placeholder can never be a text rendering: one command with parameters, none of them text */
export declare function textless(src: string): boolean
