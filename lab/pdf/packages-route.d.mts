// packages-route.mjs's types, for the tests
/** the import map's entries a page that loads the engine adds */
export declare const PACKAGES_IMPORTS: Readonly<Record<string, string>>
/** zod's files a page may ask for: its entry and the modules under it */
export declare const ZOD_PATH: RegExp
/** `/packages/<name>/src/<file>` of the tree at `root` as { body, type }, or null for any other path or no such file */
export declare function packageFile(root: string, path: string): { body: string; type: string } | null
export declare const packagesRoot: (root: string) => string
