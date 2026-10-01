// Brotli copies (quality 11) of the TeX page's files, made once and kept by content in out/tex-br: what a file costs
// on the wire. Shared by build.mjs (the site's copies) and derive.mjs (the sizes the fetch-ahead rule weighs).
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { brotliCompress, constants } from 'node:zlib'

const BR = new URL('../out/tex-br', import.meta.url).pathname
const brotli = promisify(brotliCompress)
const known = new Map()

/** the brotli copy of `file` (made when missing) → its path in the cache */
export async function brotliCopy(file) {
  const bytes = readFileSync(file)
  const copy = join(BR, `${createHash('sha256').update(bytes).digest('hex')}.br`)
  if (!existsSync(copy)) {
    mkdirSync(BR, { recursive: true })
    writeFileSync(copy, await brotli(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length } }))
  }
  return copy
}
/** a brotli copy of `file` at `to` */
export async function brotliTo(file, to) {
  const copy = await brotliCopy(file)
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(copy, to)
}
/** `file`'s size on the wire, with brotli */
export async function brotliSize(file) {
  if (!known.has(file)) known.set(file, statSync(await brotliCopy(file)).size)
  return known.get(file)
}
/** files' sizes on the wire, four at a time → Map file → bytes */
export async function brotliSizes(files) {
  const out = new Map()
  const list = [...new Set(files)]
  for (let i = 0; i < list.length; i += 4) await Promise.all(list.slice(i, i + 4).map(async f => out.set(f, await brotliSize(f))))
  return out
}
