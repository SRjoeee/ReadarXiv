// lab/rules/vitest.mjs: the rule ledger's transform under vitest (vitest.config.mts): a vite plugin run before any other,
// so that it reads each module's text as it is on disk, wrapping the sites the site map names (transform.mjs). Not shipped.
import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'
import { instrument } from './transform.mjs'

export function rulesPlugin({ sites, root }) {
  const map = JSON.parse(readFileSync(sites, 'utf8'))
  return {
    name: 'axt-rules',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]
      if (!file.startsWith(root)) return null
      const out = instrument(map, relative(root, file).split(sep).join('/'), code)
      return out == null ? null : { code: out, map: null }
    },
  }
}
