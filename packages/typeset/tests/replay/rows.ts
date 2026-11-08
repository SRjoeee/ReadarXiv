// The translations the baseline's reader laid (baseline/tools/reader.mjs rowsOf): a pair's door rows, by today's unit ord. A
// staging pair's are the release's stored rows (the sweep cache's `papers/<paper>-<target>/open.json` manifest, its row
// objects in order, a later row of an id replacing an earlier); a pack pair's the gate pack's carried rows
// (baseline/pack-rows/<paper>-<target>.rows.json). A door row is today's: [ord, pieces (a string a translated text, a number
// k the source's own piece k), state ('whole' | 'partial' | 'kept' | 'none' | …), by, sentences, …].
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LAB } from './tap.ts'
import { CACHE, paperOf } from './today.ts'

export type DoorRow = [ord: number, pieces: (string | number)[], state: string, by: string, ...more: unknown[]]

const cache = new Map<string, Map<number, DoorRow> | null>()

/** a pair's door rows by ord, or null where neither the cache nor the pack holds them */
export function doorRows(pair: string): Map<number, DoorRow> | null {
  if (cache.has(pair)) return cache.get(pair)!
  let out: Map<number, DoorRow> | null = null
  const paper = paperOf(pair)
  const target = /-([a-z]{2,3})(\.pack)?$/.exec(pair)?.[1]
  if (pair.endsWith('.pack')) {
    const f = join(LAB, 'refactor-2026-11', 'baseline', 'pack-rows', `${paper}-${target}.rows.json`)
    if (existsSync(f)) out = new Map((JSON.parse(readFileSync(f, 'utf8')).rows as DoorRow[]).map((r) => [r[0], r]))
  } else {
    const o = join(CACHE, 'papers', `${paper}-${target}`, 'open.json')
    if (existsSync(o)) {
      out = new Map()
      const refs = (JSON.parse(readFileSync(o, 'utf8')).body?.manifest?.rows ?? []) as { sha256: string }[]
      for (const ref of refs) {
        const v = JSON.parse(readFileSync(join(CACHE, 'objects', ref.sha256), 'utf8')) as { rows: DoorRow[] }
        for (const r of v.rows) out.set(r[0], r)
      }
    }
  }
  cache.set(pair, out)
  return out
}

/** a source piece as a door row's numbers name it (today's flat pieces, read.ts sourcePieces) */
type FlatPiece = { t: string; s?: string }
/**
 * A door row's sentences (`row[4]`, today's mt.mjs sentencesOf: each sentence's first word as an offset in today's plainSource
 * and plainTranslated, every piece that is no text a space, white space one, trimmed) in a v2 row's terms (format's
 * Row.sentences: offsets in the unit's projection and in its translation's, text as written, each element one character, a
 * group's edges none), so that the parity lays v2 over the sentences today laid. `source` the unit's flat pieces (the row's
 * numbers name them), the source's text as v2's unit holds it (Unicode: today's plainSource read today's bytes as UTF-8). None
 * where today's has none, or an offset lands on no word in either text (the two units' texts differ there)
 */
export function doorSentences(row: DoorRow, source: readonly FlatPiece[]): { src: number[]; tr: number[] } | undefined {
  const s = row[4] as { src?: unknown; tr?: unknown } | null | undefined
  if (!s || !Array.isArray(s.src) || !Array.isArray(s.tr) || !s.src.length || s.src.length !== s.tr.length)
    return undefined
  // (each text's characters with their projection offsets, every piece that is no text a space of none, then collapsed)
  const plainOf = (atoms: [string, number][]) => {
    const out: number[] = []
    let text = ''
    for (const [ch, at] of atoms) {
      if (/\s/.test(ch)) {
        if (text && !text.endsWith(' ')) {
          text += ' '
          out.push(-1)
        }
        continue
      }
      text += ch
      out.push(at)
    }
    if (text.endsWith(' ')) {
      text = text.slice(0, -1)
      out.pop()
    }
    return { text, out }
  }
  const pieceAtoms = (p: FlatPiece, at: number, tr: boolean): { atoms: [string, number][]; len: number } => {
    if (p.t !== 'text') return { atoms: [[' ', -1]], len: p.t === 'ph' || p.t === 'nested' ? 1 : 0 }
    const raw = p.s ?? ''
    if (!tr) return { atoms: [...raw].map((c, i): [string, number] => [c, at + i]), len: raw.length }
    // (a translation's TeX escapes undone, each one character at the escape's offset: today's shown)
    const atoms: [string, number][] = []
    const re = /\\(?:(textbackslash|textasciitilde|textasciicircum)\{\}|([#$%&_{}]))|[\s\S]/g
    for (const m of raw.matchAll(re)) atoms.push([m[1] ? ' ' : (m[2] ?? m[0]), at + m.index])
    return { atoms, len: raw.length }
  }
  const walk = (pieces: readonly (FlatPiece & { tr?: boolean })[]) => {
    const atoms: [string, number][] = []
    let at = 0
    for (const p of pieces) {
      const x = pieceAtoms(p, at, !!p.tr)
      atoms.push(...x.atoms)
      at += x.len
    }
    return plainOf(atoms)
  }
  const src = walk(source)
  const tr = walk(
    row[1].map((q) => (typeof q === 'string' ? { t: 'text', s: q, tr: true } : (source[q] ?? { t: 'none' }))),
  )
  const map = (xs: unknown[], side: { text: string; out: number[] }) => {
    const out: number[] = []
    for (const o of xs) {
      if (!Number.isInteger(o) || !/[\p{L}\p{N}]/u.test(side.text[o as number] ?? '')) return null
      const at = side.out[o as number] ?? -1
      if (at < 0 || (out.length && at <= out.at(-1)!)) return null
      out.push(at)
    }
    return out
  }
  const a = map(s.src, src),
    b = map(s.tr, tr)
  return a && b ? { src: a, tr: b } : undefined
}
