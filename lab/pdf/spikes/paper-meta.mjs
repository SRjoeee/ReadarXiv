// Moved to packages/engine/src/source/paper-meta.ts, where the reader loads it too (one implementation for Node and the browser).
// The scripts' roots are directories: analyze takes a path here, read by node-files.mjs (Node only), which the reader's own
// modules do not import.
import { analyze as analyzeFiles } from '../../../packages/engine/src/source/paper-meta.ts'
import { pathToFileURL } from 'node:url'
import { folder } from './node-files.mjs'

export const analyze = dir => analyzeFiles(typeof dir === 'string' ? folder(dir) : dir)

// run as a script under Node: node paper-meta.mjs <dir>
if (typeof process !== 'undefined' && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(analyze(process.argv[2]), null, 1))
