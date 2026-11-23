// lab/pdf/spikes/files-under.mjs
// The files a directory holds, each its path from the directory, in the order the file system lists them, depth first: what a
// compile's folder holds (its request's files, the files a pass wrote), as the stage-1a runner (lab/pdf/prepare-back/run.mjs)
// and the TeX fixtures' maker (scripts/make-tex-fixture.mjs) read it. Imports nothing but Node's.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

/** every file under `d` (`rel` the folder below it to start from), its path from `d` */
export const filesUnder = (d, rel = '') => readdirSync(join(d, rel), { withFileTypes: true }).flatMap(x => (x.isDirectory() ? filesUnder(d, join(rel, x.name)) : [join(rel, x.name)]))
