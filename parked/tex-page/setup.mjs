// Everything the experiment uses but does not keep in the repository, put in place: BusyTeX for the TeX page, the
// published assets with our patches (busytex/research.diff) in data/busytex-patched. The reader's page is the
// extension's own now (src/entrypoints/pdf-reader), built with the extension, and needs nothing from here.
// Before: `npm install` here. BUSYTEX_FROM=<dir holding busytex/> reuses a local copy of the published assets instead of
// downloading them (about 300 MB).
//   node setup.mjs
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

const here = new URL('.', import.meta.url).pathname

// BusyTeX: the published assets of the texlyre-busytex version installed here, then our patches
const site = join(here, 'data/busytex-site'), patched = join(here, 'data/busytex-patched/busytex')
if (process.env.BUSYTEX_FROM) cpSync(join(process.env.BUSYTEX_FROM, 'busytex'), join(site, 'busytex'), { recursive: true, verbatimSymlinks: false })
else if (!existsSync(join(site, 'busytex'))) execFileSync(process.execPath, [join(here, 'node_modules/texlyre-busytex/scripts/download-assets.cjs'), site], { stdio: 'inherit' })
rmSync(patched, { recursive: true, force: true })
mkdirSync(patched, { recursive: true })
for (const f of readdirSync(join(site, 'busytex'))) {
  if (f === 'busytex_pipeline.js' || f === 'busytex_biber.js') cpSync(join(site, 'busytex', f), join(patched, f))
  else symlinkSync(join(site, 'busytex', f), join(patched, f))
}
execFileSync('patch', ['-s', '-p0', '-d', patched, '-i', join(here, 'busytex/research.diff')], { stdio: 'inherit' })
console.log('ready: data/busytex-patched')
