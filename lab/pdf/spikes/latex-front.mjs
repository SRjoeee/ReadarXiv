// Moved to packages/engine/src/source/latex-front.ts, where the reader loads it too (one implementation for Node and the browser).
// The scripts' roots are directories: loadProject takes a path here, read by node-files.mjs (Node only), which the reader's
// own modules do not import.
import { loadProject as loadFiles } from '../../../packages/engine/src/source/latex-front.ts'
import { folder } from './node-files.mjs'

export * from '../../../packages/engine/src/source/latex-front.ts'
export const loadProject = (root, main, options) => loadFiles(typeof root === 'string' ? folder(root) : root, main, options)
