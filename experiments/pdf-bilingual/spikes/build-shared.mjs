// The reader prototype's shared modules, compiled from the extension's source — no copies: the HTML mode's figure
// boxes and overlay (src/core/image/boxes.ts, src/core/renderer/image.ts, src/styles/image.css), its bitmap
// recogniser (src/core/ocr), and the message transport to the background's translation chain (src/shared/transport.ts)
// with the language table's BCP 47 tags. Run again after the extension's source changes.
//   node spikes/build-shared.mjs
import { copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
// the extension is this repository: its source, and the build tools its own install brings
const EXTENSION = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '')
// esbuild as the extension's own toolchain has it: not a direct dependency, so found through the bundler that brings it
const along = chain => { let req = createRequire(`${EXTENSION}/`); for (const name of chain.slice(0, -1)) req = createRequire(req.resolve(name)); return req.resolve(chain.at(-1)) }
const through = [['esbuild'], ['vite', 'esbuild'], ['wxt', 'vite', 'esbuild']].map(chain => { try { return along(chain) } catch { return null } }).find(Boolean)
if (!through) throw new Error('esbuild not found: run `pnpm install` at the repository root')
const { build } = createRequire(`${EXTENSION}/`)(through)
const root = new URL('..', import.meta.url).pathname
const out = join(root, 'poc-reader/lib/axt')
for (const [entry, file] of [['figures-entry.ts', 'figures.mjs'], ['ocr-entry.ts', 'ocr-core.mjs'], ['translate-entry.ts', 'translate.mjs']]) {
  await build({ entryPoints: [join(root, 'shared', entry)], outfile: join(out, file), bundle: true, format: 'esm', platform: 'browser', target: 'chrome131', alias: { '@': `${EXTENSION}/src` }, nodePaths: [`${EXTENSION}/node_modules`], logLevel: 'warning', legalComments: 'inline' })
}
copyFileSync(`${EXTENSION}/src/styles/image.css`, join(out, 'image.css'))
console.log('built', out)
