// tree.mjs's types, for the tests
export declare const OS_METADATA: RegExp
export declare function walk(root: string): string[]
export declare function chooseIndex(paths: string[], preferred?: (path: string) => boolean): string[]
export declare function versionOf(...parts: (string | Uint8Array)[]): string
export declare function treeVersion(files: [path: string, hash: string][]): string
export declare function indexName(text: string): string
export declare function hashTree(root: string, paths: string[], cache: string): Map<string, string>
