// lab/rules/vitest.config.mts: `vitest run --config lab/rules/vitest.config.mts`: the repository's tests (every project of
// vitest.config.ts: the extension's and each package's) with the rule ledger's transform and recorder (vitest.mjs,
// vitest-setup.mjs); AXT_RULES_SITES the site map, AXT_RULES_OUT where the records go. Not shipped.
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import base from '../../vitest.config.ts'
import { rulesPlugin } from './vitest.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const sites = process.env.AXT_RULES_SITES
if (!sites) throw new Error('lab/rules: AXT_RULES_SITES (the site map) is not set')
const plugin = rulesPlugin({ sites, root })
const setup = join(root, 'lab/rules/vitest-setup.mjs')
const packages = readdirSync(join(root, 'packages')).filter(p => existsSync(join(root, 'packages', p, 'vitest.config.ts')))
const projects = await Promise.all(
  packages.map(async p => {
    const c = (await import(join(root, 'packages', p, 'vitest.config.ts'))).default
    return { ...c, root: join(root, 'packages', p), plugins: [plugin, ...(c.plugins ?? [])], test: { ...c.test, setupFiles: [...(c.test?.setupFiles ?? []), setup] } }
  }),
)
export default defineConfig({
  ...base,
  root,
  plugins: [plugin, ...(base.plugins ?? [])],
  test: { ...base.test, setupFiles: [...(base.test?.setupFiles ?? []), setup], projects: [{ extends: true, test: { name: 'extension' } }, ...projects] },
})
