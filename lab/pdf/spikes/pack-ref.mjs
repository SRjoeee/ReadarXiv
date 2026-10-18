// lab/pdf/spikes/pack-ref.mjs
// The frozen reference of a new output (layer-gate/ref.mjs refBytesOf): ref.json made from <fixtures>/<name>/layout.json and the geometry
// folder, written beside a copy of that layout in <out>/<name>/ (the pack's refs/<name>/).
//   node lab/pdf/spikes/pack-ref.mjs <fixtures folder> <name> <geometry folder> <out folder>
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { refBytesOf } from './layer-gate/ref.mjs'
const [fxDir, name, geomDir, outDir] = process.argv.slice(2)
mkdirSync(join(outDir, name), { recursive: true })
writeFileSync(join(outDir, name, 'ref.json'), refBytesOf(join(fxDir, name), name, geomDir, []))
copyFileSync(join(fxDir, name, 'layout.json'), join(outDir, name, 'layout.json'))
console.log('ref', name)
