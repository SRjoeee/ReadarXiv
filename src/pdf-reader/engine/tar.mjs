// An arXiv source package → its files. arXiv's /src/<id> sends a gzipped tar, or a single gzipped TeX file, or (for a
// paper without source) a PDF. Runs in Node and in the browser: DecompressionStream and Uint8Array only.

const text = (b, from, to) => { let s = ''; for (let i = from; i < to && b[i]; i++) s += String.fromCharCode(b[i]); return s }
const octal = (b, from, to) => parseInt(text(b, from, to).trim() || '0', 8)

export async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** a tar archive → Map of path → bytes (regular files only; GNU long names and pax paths honoured) */
export function untar(b) {
  const files = new Map()
  let at = 0, longName = null, paxPath = null
  while (at + 512 <= b.length) {
    const header = b.subarray(at, at + 512)
    if (header.every(x => x === 0)) break
    const size = octal(header, 124, 136), type = String.fromCharCode(header[156] || 48)
    const data = b.subarray(at + 512, at + 512 + size)
    at += 512 + Math.ceil(size / 512) * 512
    if (type === 'L') { longName = text(data, 0, data.length); continue }
    if (type === 'x') { const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(new TextDecoder().decode(data)); paxPath = m ? m[1] : null; continue }
    const prefix = text(header, 345, 500), name = longName ?? paxPath ?? (prefix ? `${prefix}/${text(header, 0, 100)}` : text(header, 0, 100))
    longName = paxPath = null
    if (type !== '0' && type !== '\0' && type !== '7') continue
    const path = name.replace(/^(\.\/)+/, '')
    if (path && !path.endsWith('/')) files.set(path, data.slice())
  }
  return files
}

const isTar = b => b.length > 262 && text(b, 257, 262) === 'ustar'
const isPdf = b => text(b, 0, 5) === '%PDF-'

/** the response body of /src/<id> → { files } (a Map), or { pdf: true } when arXiv has no source for the paper */
export async function unpackSource(bytes, fallbackName = 'main.tex') {
  if (isPdf(bytes)) return { pdf: true }
  const gz = bytes[0] === 0x1f && bytes[1] === 0x8b
  const raw = gz ? await gunzip(bytes) : bytes
  if (isTar(raw)) return { files: untar(raw) }
  return { files: new Map([[fallbackName, raw]]) }
}
