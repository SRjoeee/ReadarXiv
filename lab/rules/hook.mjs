// lab/rules/hook.mjs: the rule ledger's load hook (register.mjs registers it): a module the site map names is handed on
// with its sites wrapped (transform.mjs), whatever loader comes after (tsx, Node's own type stripping). Not shipped.
import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { instrument } from './transform.mjs'

let map = null
let root = null
export function initialize(data) {
  map = JSON.parse(readFileSync(data.sites, 'utf8'))
  root = data.root
}
export async function load(url, context, nextLoad) {
  const res = await nextLoad(url, context)
  if (!url.startsWith('file:') || res.source == null) return res
  const path = relative(root, fileURLToPath(url)).split(sep).join('/')
  if (!map.files[path]) return res
  const text = typeof res.source === 'string' ? res.source : Buffer.from(res.source).toString('utf8')
  const out = instrument(map, path, text)
  return out == null ? res : { ...res, source: out }
}
