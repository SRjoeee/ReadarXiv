// lab/rules/vitest-setup.mjs: the recorder in a vitest worker (vitest.config.mts adds it to every project's setup files):
// each test named as the context of the cases it takes, each test file's record written when its tests end. A test file
// that reads the lab's data (a file under the lab's data folder or its archive, read while the file runs) says so in its
// record: merge.mjs counts it as the corpus, not as a case someone wrote (design-reduction §8.9). Not shipped.
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { homedir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, expect } from 'vitest'
import { install } from './recorder.mjs'

// (the input named here, not in the environment, which a test's child processes would inherit)
const rec = install({ input: 'tests' })
const fileOf = () => relative(process.cwd(), expect.getState().testPath ?? '')

/** the lab's data: its folder, its archive on the external disks, the corpus folders of lab/pdf/data */
const LAB_ROOTS = [process.env.AXT_LAB_DATA ?? join(homedir(), 'Developer', 'readarxiv-lab-data'), '/Volumes/SanDisk_Dev/readarxiv-lab-archive', '/Volumes/readarxiv-archive', resolve('lab/pdf/data')].map(p => `${resolve(p)}/`)
let labRead = false
const isLab = p => {
  try {
    const s = typeof p === 'string' ? p : p instanceof URL ? p.pathname : Buffer.isBuffer(p) ? p.toString() : null
    return s != null && LAB_ROOTS.some(r => `${resolve(s)}/`.startsWith(r))
  } catch {
    return false
  }
}
for (const [obj, names] of [
  [fs, ['readFileSync', 'readdirSync', 'openSync', 'createReadStream', 'readFile', 'readdir', 'open']],
  [fs.promises, ['readFile', 'readdir', 'open']],
]) {
  for (const name of names) {
    const orig = obj[name]
    if (typeof orig !== 'function') continue
    obj[name] = function (p, ...rest) {
      if (!labRead && isLab(p)) labRead = true
      return orig.call(this, p, ...rest)
    }
  }
}
syncBuiltinESMExports()

beforeAll(() => {
  labRead = false
  rec.context({ file: fileOf() })
})
beforeEach(() => {
  rec.context({ test: `${fileOf()} > ${expect.getState().currentTestName ?? ''}` })
})
afterAll(() => {
  rec.context({ test: null })
  rec.flush(`vitest-${fileOf().replace(/[/\\]/g, '_')}`, { labRead })
})
