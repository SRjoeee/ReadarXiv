// PDF documents of our own for the export's tests: objects by number (a dictionary's text, or a stream's dictionary and
// content), one classic cross-reference table; and an incremental section over a document (the add-on's shape: objects
// written again under their numbers, a table with /Prev).

export type Obj = string | { dict: string; data: string | Uint8Array }

const enc = (s: string) => {
  const b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255
  return b
}
const cat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
const body = (n: number, o: Obj) =>
  typeof o === 'string'
    ? enc(`${n} 0 obj\n${o}\nendobj\n`)
    : (() => {
        const data = typeof o.data === 'string' ? enc(o.data) : o.data
        return cat([
          enc(`${n} 0 obj\n<< ${o.dict} /Length ${data.length} >>\nstream\n`),
          data,
          enc('\nendstream\nendobj\n'),
        ])
      })()

function table(objs: [number, number][], size: number, extra: string, at: number): Uint8Array {
  const rows = [...objs].sort((a, b) => a[0] - b[0])
  let x = 'xref\n'
  if (extra.includes('/Prev')) for (const [n, o] of rows) x += `${n} 1\n${String(o).padStart(10, '0')} 00000 n\r\n`
  else {
    x += `0 ${size}\n0000000000 65535 f\r\n`
    for (const [, o] of rows) x += `${String(o).padStart(10, '0')} 00000 n\r\n`
  }
  return enc(`${x}trailer\n<< /Size ${size} /Root 1 0 R ${extra} >>\nstartxref\n${at}\n%%EOF\n`)
}

/** a document of `objects` (1 the catalog, numbered from 1 with no gap) */
export function pdf(objects: Obj[]): Uint8Array {
  const parts: Uint8Array[] = [enc('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')]
  let at = parts[0]!.length
  const offs: [number, number][] = []
  objects.forEach((o, k) => {
    const b = body(k + 1, o)
    offs.push([k + 1, at])
    parts.push(b)
    at += b.length
  })
  parts.push(table(offs, objects.length + 1, '', at))
  return cat(parts)
}

/** `doc` with a section after it writing `objects` (number -> object), the document's size `size` after it */
export function update(doc: Uint8Array, objects: Record<number, Obj>, size: number): Uint8Array {
  const text = new TextDecoder('latin1').decode(doc.subarray(Math.max(0, doc.length - 64)))
  const prev = Number(/startxref\s+(\d+)/.exec(text)?.[1])
  const parts: Uint8Array[] = [doc, enc('\n')]
  let at = doc.length + 1
  const offs: [number, number][] = []
  for (const [n, o] of Object.entries(objects)) {
    const b = body(Number(n), o)
    offs.push([Number(n), at])
    parts.push(b)
    at += b.length
  }
  parts.push(table(offs, size, `/Prev ${prev}`, at))
  return cat(parts)
}

export const latin1 = (b: Uint8Array) => new TextDecoder('latin1').decode(b)
