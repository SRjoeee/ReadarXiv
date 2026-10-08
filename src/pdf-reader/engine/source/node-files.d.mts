// node-files.mjs's types: a directory under Node as a project's file system (Node only)
import type { inMemory } from './latex-front.mjs'

/** a directory under Node, as a project's file system: { list(): relative paths, read(path): bytes or null } */
export declare function folder(dir: string): ReturnType<typeof inMemory>
