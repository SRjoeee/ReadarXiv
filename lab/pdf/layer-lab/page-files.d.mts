// page-files.mjs's types: the files the layer lab serves at /lab/

export declare const PAGE_FILES: ReadonlySet<string>
/** the files that the served files import by a relative path (or name under /lab/) and PAGE_FILES does not serve, as "file -> import" */
export declare function unservedImports(dir: string, files?: ReadonlySet<string>): string[]
