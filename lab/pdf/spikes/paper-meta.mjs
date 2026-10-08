// Moved to src/pdf-reader/engine/paper-meta.mjs, where the reader loads it too (one implementation for Node and the browser).
// The scripts' roots are directories: analyze takes a path here, read by node-files.mjs (Node only), which the reader's own
// modules do not import.
import { analyze as analyzeFiles } from '../../../src/pdf-reader/engine/paper-meta.mjs'
import { folder } from '../../../src/pdf-reader/engine/node-files.mjs'

export const analyze = dir => analyzeFiles(typeof dir === 'string' ? folder(dir) : dir)

// run as a script under Node: node paper-meta.mjs <dir>
if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(analyze(process.argv[2]), null, 1))
