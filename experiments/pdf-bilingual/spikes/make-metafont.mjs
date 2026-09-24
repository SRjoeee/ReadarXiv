// The METAFONT outputs TeX Live does not ship and its fonts need. BusyTeX cannot run METAFONT (upstream/, issue E), so
// a font TeX Live has only as METAFONT source is missing in the browser, where native TeX Live makes it on the way.
// Today that is the LH fonts' metrics — Cyrillic under pdfLaTeX (T2A, src/pdf-reader/engine/scripts.mjs): every size of every family
// the T2A font definitions name. TeX Live ships 37 of those 350, METAFONT makes 307 in 11 minutes (1.2 MB), 6 have no
// source; a heading at 14.4 pt already needs one TeX Live lacks. The outlines are cm-super's, in TeX Live. Made natively
// once, into data/metafont/tfm; copy that into the file server's tree (fonts/tfm/axt-metafont) and restart the server,
// which indexes at start. spikes/lang-gate.mjs and spikes/live-node.mjs read them from data/metafont too.
//   node spikes/make-metafont.mjs
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const OUT = join(root, 'data/metafont/tfm')
mkdirSync(OUT, { recursive: true })
const script = `
  d=$(dirname $(kpsewhich t2acmr.fd))
  for b in $(grep -h -o "{la[a-z]*}" $d/t2a*.fd | sort -u | tr -d "{}"); do
    for s in 0500 0600 0700 0800 0900 1000 1095 1200 1440 1728 2074 2488 2986 3583; do
      kpsewhich $b$s.tfm >/dev/null || mktextfm --destdir /out $b$s >/dev/null 2>&1 || echo "no source: $b$s"
    done
  done`
const said = execFileSync('docker', ['run', '--rm', '-v', `${OUT}:/out`, 'texlive/texlive:latest', 'sh', '-c', script], { encoding: 'utf8', maxBuffer: 1 << 24 })
// mktextfm leaves the bitmaps METAFONT drew beside the metrics: not wanted, since the glyphs are cm-super's outlines, and
// on the file server a bitmap would stand in for an outline wherever a map entry went missing
for (const f of readdirSync(OUT)) if (!f.endsWith('.tfm')) rmSync(join(OUT, f))
const made = readdirSync(OUT).filter(f => f.endsWith('.tfm'))
console.log(`${made.length} metrics made in ${OUT}`)
if (said.trim()) console.log(said.trim())
