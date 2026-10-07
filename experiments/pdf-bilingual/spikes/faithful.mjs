// TeX run natively the way the browser's BusyTeX can run it: no METAFONT, so no font is made on the way (natively,
// mktextfm made the Cyrillic metrics TeX Live does not ship, and a gate passed what the browser failed), and the
// METAFONT outputs the file server adds to TeX Live (spikes/make-metafont.mjs) on the font path. Docker arguments.
import { existsSync, mkdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

export function faithfulDockerArgs(root) {
  const made = join(root, 'data/metafont')
  mkdirSync(made, { recursive: true })
  return ['-e', 'MKTEXTFM=0', '-e', 'MKTEXPK=0', '-e', 'MKTEXMF=0', '-v', `${made}:/axt-metafont:ro`, '-e', 'TFMFONTS=/axt-metafont//:']
}

/**
 * The faces the TeX path names that TeX Live does not ship — Source Han Serif SC, TC and K, URW's base 35 Nimbus Roman
 * and Sans (font-roles.mjs FACES, source `hosted`) — on XeTeX's OpenType path before TeX Live's own, as the TeX page's
 * tree serves them beside it (records/fonts-upload-list.md). From a fonts folder, the experiment's data/fonts (git-ignored;
 * scripts/font-roles.py's header says how it is gathered), whose copies of TeX Live's faces are the image's own bytes
 * (records/fonts-move.md). Docker arguments; none, and a warning, where the folder is not there: the CJK and Cyrillic
 * strategies then fail on a face TeX cannot find
 */
export function hostedFontsDockerArgs(fonts) {
  if (!existsSync(fonts)) { console.warn(`no ${fonts}: the hosted faces are not mounted`); return [] }
  return ['-v', `${realpathSync(fonts)}:/fonts:ro`, '-e', 'OPENTYPEFONTS=/fonts//:']
}
