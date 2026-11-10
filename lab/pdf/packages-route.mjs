// The workspace packages (packages/*) for a plain page of the lab: an engine module that imports `@readarxiv/engine` loads in a
// page by its import map (PACKAGES_IMPORTS), and the package's TypeScript is served as JavaScript by Node's own type stripping
// (node:module stripTypeScriptTypes: erasable syntax, which is all the packages hold), its JavaScript as it is.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { join, relative, resolve } from 'node:path'

/** the import map's entries a page that loads the engine adds */
export const PACKAGES_IMPORTS = Object.freeze({
  '@readarxiv/engine': '/packages/engine/src/index.ts',
  '@readarxiv/format': '/packages/format/src/index.ts',
  '@readarxiv/text': '/packages/text/src/index.ts',
  zod: '/zod/index.js',
})
/** zod's files a page may ask for: its entry and the modules under it */
export const ZOD_PATH = /^\/zod\/(?:index\.js|(?:mini|v4)\/[\w./-]+\.js)$/

/** `/packages/<name>/src/<file>` of the tree at `root` as { body, type }, or null for any other path or no such file */
export function packageFile(root, path) {
  const m = /^\/packages\/([a-z]+)\/src\/([\w./-]+\.(?:ts|mjs|js))$/.exec(path)
  if (!m) return null
  const base = resolve(root, 'packages', m[1], 'src'), file = resolve(base, m[2])
  if (relative(base, file).startsWith('..') || !existsSync(file) || !statSync(file).isFile()) return null
  const code = readFileSync(file, 'utf8')
  return { body: file.endsWith('.ts') ? stripTypeScriptTypes(code, { mode: 'strip' }) : code, type: 'text/javascript; charset=utf-8' }
}
export const packagesRoot = root => join(root, 'packages')
