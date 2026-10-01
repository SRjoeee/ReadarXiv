// tree.mjs's types, for the tests
export declare const OS_METADATA: RegExp
export declare function walk(root: string): string[]
export declare function indexText(paths: string[], searchPaths: Record<string | number, Record<string, string[]>>, dependent?: string[]): string
export declare function programDependent(index: import('../poc-site/tex-tree.mjs').Index, programs: string[]): string[]
export declare function versionOf(...parts: (string | Uint8Array)[]): string
export declare function treeVersion(files: [path: string, hash: string][]): string
export declare function indexName(text: string): string
export declare function hashTree(root: string, paths: string[], cache: string): Map<string, string>
export declare function treeIndex(root: string, cnf: string): { paths: string[]; text: string }
