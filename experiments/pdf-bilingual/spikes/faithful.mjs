// TeX run natively the way the browser's BusyTeX can run it: no METAFONT, so no font is made on the way (natively,
// mktextfm made the Cyrillic metrics TeX Live does not ship, and a gate passed what the browser failed), and the
// METAFONT outputs the file server adds to TeX Live (spikes/make-metafont.mjs) on the font path. Docker arguments.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export function faithfulDockerArgs(root) {
  const made = join(root, 'data/metafont')
  mkdirSync(made, { recursive: true })
  return ['-e', 'MKTEXTFM=0', '-e', 'MKTEXPK=0', '-e', 'MKTEXMF=0', '-v', `${made}:/axt-metafont:ro`, '-e', 'TFMFONTS=/axt-metafont//:']
}
