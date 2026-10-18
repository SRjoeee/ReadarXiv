// Stage 3 (S3a, fix round 1): the upload list of a built site — every object the bucket must hold for this build, the
// local file to put there and the headers to store it with — for whoever uploads it (rclone over R2's S3 API sets
// each object's headers from its row), and for verify.mjs, which checks the bucket against it through the CDN.
//   b/, c/, e/          the site's files; t/<tid>/index-<iid>.txt the index: brotli copies (build.mjs makes them)
//   t/<tid>/<path>      every file of the tree (<path> relative to texmf-dist): its brotli copy (quality 11, kept by
//                       content in out/tex-br, made here when missing: the first time, the whole tree)
//   tex.html            the entry: as it is, never cached without asking (no-cache); upload it last
// A brotli copy is stored, with Content-Encoding: br, where it is at least 5 % smaller than the file; the file
// otherwise. Content-Type by the key's extension (an extension not known fails the build: a type the browser refuses,
// a wasm not served as application/wasm, breaks the page for every reader); the tree's files are
// application/octet-stream. The versioned objects are immutable for a year.
//   → out/tex-upload/<cv>.tsv: key, file, content-type, content-encoding, cache-control, bytes (stored), sha256 (of
//     the file, decoded), one object a line after a header line. build.mjs writes it.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { brotliCopy } from './sizes.mjs'

export const IMMUTABLE = 'public, max-age=31536000, immutable'
export const ENTRY = 'no-cache'
/** the site's Content-Types, by extension ('' a file without one: TeX Live's LICENSE.TL and LICENSE.CTAN) */
export const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.data': 'application/octet-stream', '.bin': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8', '.diff': 'text/plain; charset=utf-8', '.tl': 'text/plain; charset=utf-8', '.ctan': 'text/plain; charset=utf-8',
}
/** an object's Content-Type and Cache-Control by its key: a tree file's octet-stream, the rest by extension */
export function headersOf(key, tid) {
  if (key === 'tex.html') return { type: TYPES['.html'], cache: ENTRY }
  if (key.startsWith(`t/${tid}/`) && !/^t\/[^/]+\/index-[0-9a-f]{12}\.txt$/.test(key)) return { type: 'application/octet-stream', cache: IMMUTABLE }
  const type = TYPES[extname(key).toLowerCase()]
  if (!type) throw new Error(`${key}: no Content-Type for its extension`)
  return { type, cache: IMMUTABLE }
}
/** whether the brotli copy is the one to store: at least 5 % smaller than the file */
export const brotliWorth = (raw, br) => raw > 0 && br <= raw * 0.95

/** the list's text: a header line, then a row per object */
export const COLUMNS = ['key', 'file', 'content-type', 'content-encoding', 'cache-control', 'bytes', 'sha256']
export const listText = rows => `${[COLUMNS, ...rows.map(r => [r.key, r.file, r.type, r.encoding, r.cache, r.bytes, r.sha256])].map(r => r.join('\t')).join('\n')}\n`
export function parseList(text) {
  const [head, ...lines] = text.trim().split('\n')
  if (head !== COLUMNS.join('\t')) throw new Error('not an upload list')
  return lines.map(l => { const [key, file, type, encoding, cache, bytes, sha256] = l.split('\t'); return { key, file, type, encoding, cache, bytes: Number(bytes), sha256 } })
}

const sha = bytes => createHash('sha256').update(bytes).digest('hex')

/**
 * The upload list of the site in `site` (out/tex-site) and the tree in `tree` (`hashes`: path → SHA-256, build.mjs's
 * hashTree) → rows, written to `out` (a file). Tree files lacking a brotli copy are compressed, `parallel` at a time
 */
export async function writeUploadList({ site, tree, tid, hashes, out, parallel = 4, say = () => {} }) {
  const rows = []
  const row = (key, file, sha256, brFile) => {
    const { type, cache } = headersOf(key, tid)
    const raw = statSync(file).size
    const br = brFile && existsSync(brFile) ? statSync(brFile).size : Infinity
    const encoding = brotliWorth(raw, br) ? 'br' : ''
    rows.push({ key, file: encoding ? brFile : realpathSync(file), type, encoding, cache, bytes: encoding ? br : raw, sha256 })
  }
  // the site's files, the index among them (symbolic links followed: the engine's large files are BusyTeX's own)
  const walkSite = dir => readdirSync(join(site, dir), { withFileTypes: true }).flatMap(e => {
    const rel = `${dir}/${e.name}`
    if (statSync(join(site, rel)).isDirectory()) return walkSite(rel)
    return e.name.endsWith('.br') ? [] : [rel]
  })
  for (const top of ['b', 'c', 'e', 't']) if (existsSync(join(site, top))) for (const key of walkSite(top).sort()) row(key, join(site, key), sha(readFileSync(join(site, key))), join(site, `${key}.br`))
  // the tree's files: their brotli copies made by `parallel` workers taking the next file as each is done
  const paths = [...hashes.keys()].sort()
  const copyOf = p => join(new URL('../out/tex-br', import.meta.url).pathname, `${hashes.get(p)}.br`)
  const todo = paths.filter(p => !existsSync(copyOf(p)))
  let made = 0
  await Promise.all(Array.from({ length: parallel }, async () => {
    while (todo.length) {
      await brotliCopy(join(tree, todo.pop()))
      if (++made % 10000 === 0) say(`upload list: ${made} of ${made + todo.length} tree files compressed`)
    }
  }))
  for (const p of paths) row(`t/${tid}/${p}`, join(tree, p), hashes.get(p), copyOf(p))
  row('tex.html', join(site, 'tex.html'), sha(readFileSync(join(site, 'tex.html'))), null)
  mkdirSync(join(out, '..'), { recursive: true })
  writeFileSync(out, listText(rows))
  return rows
}
