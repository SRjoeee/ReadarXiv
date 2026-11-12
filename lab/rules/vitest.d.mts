// vitest.mjs's types
export declare function rulesPlugin(options: { sites: string; root: string }): { name: string; enforce: 'pre'; transform(code: string, id: string): { code: string; map: null } | null }
