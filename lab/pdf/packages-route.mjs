// The workspace packages (packages/*) for a plain page of the lab: an engine module that imports `@readarxiv/engine` loads in a
// page by its import map (PACKAGES_IMPORTS), and the package's TypeScript is served as JavaScript by Node's own type stripping
// (node:module stripTypeScriptTypes: erasable syntax, which is all the packages hold), its JavaScript as it is, and a data file
// a moved module imports (`with { type: 'json' }`) as JSON.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { join, relative, resolve } from 'node:path'

/** the import map's entries a page that loads the engine adds */
export const PACKAGES_IMPORTS = Object.freeze({
  '@readarxiv/engine': '/packages/engine/src/index.ts',
  // (the transition paths of the front half moved into the engine package: an old path re-exports its module through one,
  // `@readarxiv/engine/today/<folder>/<file>`, a folder of the package's src/ each; deleted at the cut-over)
  '@readarxiv/engine/today/source/': '/packages/engine/src/source/',
  '@readarxiv/engine/today/marks/': '/packages/engine/src/marks/',
  '@readarxiv/engine/today/own/': '/packages/engine/src/own/',
  '@readarxiv/engine/today/instrument/': '/packages/engine/src/instrument/',
  '@readarxiv/format': '/packages/format/src/index.ts',
  '@readarxiv/text': '/packages/text/src/index.ts',
  zod: '/zod/index.js',
})
/** zod's files a page may ask for: its entry and the modules under it */
export const ZOD_PATH = /^\/zod\/(?:index\.js|(?:mini|v4)\/[\w./-]+\.js)$/

/** `/packages/<name>/src/<file>` of the tree at `root` as { body, type } (TypeScript stripped, JavaScript and JSON as they are),
 *  or null for any other path or no such file */
export function packageFile(root, path) {
  const m = /^\/packages\/([a-z]+)\/src\/([\w./-]+\.(?:ts|mjs|js|json))$/.exec(path)
  if (!m) return null
  const base = resolve(root, 'packages', m[1], 'src'), file = resolve(base, m[2])
  if (relative(base, file).startsWith('..') || !existsSync(file) || !statSync(file).isFile()) return null
  const code = readFileSync(file, 'utf8')
  if (file.endsWith('.json')) return { body: code, type: 'application/json; charset=utf-8' }
  return { body: file.endsWith('.ts') ? stripTypeScriptTypes(code, { mode: 'strip' }) : code, type: 'text/javascript; charset=utf-8' }
}
export const packagesRoot = root => join(root, 'packages')
