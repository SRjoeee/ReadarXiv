// Moved to src/pdf-reader/engine/source/latex-front.mjs, where the reader loads it too (one implementation for Node and the browser).
// The scripts' roots are directories: loadProject takes a path here, read by node-files.mjs (Node only), which the reader's
// own modules do not import.
import { loadProject as loadFiles } from '../../../src/pdf-reader/engine/source/latex-front.mjs'
import { folder } from '../../../src/pdf-reader/engine/source/node-files.mjs'

export * from '../../../src/pdf-reader/engine/source/latex-front.mjs'
export const loadProject = (root, main, options) => loadFiles(typeof root === 'string' ? folder(root) : root, main, options)
