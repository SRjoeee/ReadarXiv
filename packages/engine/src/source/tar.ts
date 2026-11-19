// An arXiv source package → its files. arXiv's /src/<id> sends a gzipped tar, or a single gzipped TeX file, or (for a
// paper without source) a PDF. Runs in Node and in the browser: DecompressionStream and Uint8Array only.
import { normalizePath } from './latex-front.ts'

const text = (b: Uint8Array, from: number, to: number): string => {
  let s = ''
  for (let i = from; i < to && b[i]; i++) s += String.fromCharCode(b[i]!)
  return s
}
const octal = (b: Uint8Array, from: number, to: number): number => parseInt(text(b, from, to).trim() || '0', 8)

/** gzip's inflate (the platform's DecompressionStream) */
async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** a tar archive → Map of path → bytes (regular files only; GNU long names and pax paths honoured), each path as TeX's
 *  file system has it (normalizePath: ./main.tex, an archive of a directory's contents, is main.tex), the one name the
 *  engine knows the file by */
export function untar(b: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>()
  let at = 0,
    longName: string | null = null,
    paxPath: string | null = null
  while (at + 512 <= b.length) {
    const header = b.subarray(at, at + 512)
    if (header.every((x) => x === 0)) break
    const size = octal(header, 124, 136),
      type = String.fromCharCode(header[156] || 48)
    const data = b.subarray(at + 512, at + 512 + size)
    at += 512 + Math.ceil(size / 512) * 512
    if (type === 'L') {
      longName = text(data, 0, data.length)
      continue
    }
    if (type === 'x') {
      const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(new TextDecoder().decode(data))
      paxPath = m ? m[1]! : null
      continue
    }
    const prefix = text(header, 345, 500),
      name = longName ?? paxPath ?? (prefix ? `${prefix}/${text(header, 0, 100)}` : text(header, 0, 100))
    longName = paxPath = null
    if (type !== '0' && type !== '\0' && type !== '7') continue
    const path = normalizePath(name)
    if (path && !name.endsWith('/')) files.set(path, data.slice())
  }
  return files
}

/** whether a body is a tar: its first header block's magic field, six bytes at offset 257 (POSIX.1's ustar format, IEEE Std
 *  1003.1: "ustar" and a NUL; GNU tar's "ustar "), read where the body holds the whole field, through byte 262; a shorter body
 *  holds no header block and is one TeX file, whatever its bytes at 257 read (packages/engine/tests/tar.test.ts) */
const isTar = (b: Uint8Array): boolean => b.length > 262 && text(b, 257, 262) === 'ustar'
const isPdf = (b: Uint8Array): boolean => text(b, 0, 5) === '%PDF-'

/** the response body of /src/<id> → { files } (a Map), or { pdf: true } when arXiv has no source for the paper */
export async function unpackSource(
  bytes: Uint8Array,
  fallbackName = 'main.tex',
): Promise<{ pdf: true } | { files: Map<string, Uint8Array> }> {
  if (isPdf(bytes)) return { pdf: true }
  const gz = bytes[0] === 0x1f && bytes[1] === 0x8b
  const raw = gz ? await gunzip(bytes) : bytes
  if (isTar(raw)) return { files: untar(raw) }
  return { files: new Map([[fallbackName, raw]]) }
}
