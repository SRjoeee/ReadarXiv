// The served faces as the engine asks for them (session/faces.ts; eb-report G1): a face's slices from our site's static table,
// read once a visit, a group's table the first time one of its faces is asked, each within its bounds; a face the index does
// not serve has none; a table not to be had rejects, and is asked again later
import { describe, expect, it, vi } from 'vitest'
import { servedFaces } from '@/pdf-reader/session/faces'

const API = 'https://readarxiv.com'
const INDEX = { schema: 1, fonts: '4', groups: ['lm-roman', 'shs-sc'], faces: { 'lm-roman-regular': { group: 'lm-roman', sha256: 'x' }, 'shs-sc-regular': { group: 'shs-sc', sha256: 'y' } }, sources: {} }
const file = (h: string) => ({ path: `static-fonts/${h.repeat(16).slice(0, 16)}.woff2`, sha256: 'z', bytes: 9 })
const LM = { schema: 1, group: 'lm-roman', plan: 'latin', slices: [[32, 126], [160, 383]], faces: { 'lm-roman-regular': [file('a'), null] }, shared: 0 }
const SC = { schema: 1, group: 'shs-sc', plan: 'cjk', slices: [[0x4e00, 0x4fff], [0x5000, 0x5fff]], faces: { 'shs-sc-regular': [file('b'), file('c')] }, shared: null }
function served(over: Record<string, unknown> = {}) {
  const calls: string[] = []
  const tables: Record<string, unknown> = { 'index.json': INDEX, 'lm-roman.json': LM, 'shs-sc.json': SC, ...over }
  const f = vi.fn(async (url: string) => {
    calls.push(url)
    const name = url.slice(`${API}/static-fonts/`.length)
    const t = tables[name]
    if (t instanceof Error) throw t
    return t === undefined ? new Response('', { status: 404 }) : new Response(typeof t === 'string' ? t : JSON.stringify(t))
  })
  return { f: f as unknown as typeof fetch, calls, tables }
}

describe('the served faces', () => {
  it('a face\'s slices, each its file on our site and its code points, in the slices\' order; a slice the face has no file for left out', async () => {
    const s = served()
    const faces = servedFaces(API, s.f)
    expect(await faces('lm-roman-regular')).toEqual([{ url: `${API}/static-fonts/aaaaaaaaaaaaaaaa.woff2`, ranges: [32, 126] }])
    expect(await faces('shs-sc-regular')).toEqual([{ url: `${API}/static-fonts/bbbbbbbbbbbbbbbb.woff2`, ranges: [0x4e00, 0x4fff] }, { url: `${API}/static-fonts/cccccccccccccccc.woff2`, ranges: [0x5000, 0x5fff] }])
    expect(await faces('lm-roman-regular')).toHaveLength(1)
    // the index once, each group's table once
    expect(s.calls).toEqual([`${API}/static-fonts/index.json`, `${API}/static-fonts/lm-roman.json`, `${API}/static-fonts/shs-sc.json`])
  })

  it('a face the index does not serve has none, with no table read for it', async () => {
    const s = served()
    expect(await servedFaces(API, s.f)('fandolkai')).toBeNull()
    expect(s.calls).toEqual([`${API}/static-fonts/index.json`])
  })

  it('a table not to be had, or of another shape, rejects, and is asked again on the next ask', async () => {
    const s = served({ 'index.json': new TypeError('offline') })
    const faces = servedFaces(API, s.f)
    await expect(faces('lm-roman-regular')).rejects.toThrow(/offline/)
    s.tables['index.json'] = INDEX
    expect(await faces('lm-roman-regular')).toHaveLength(1)
    for (const bad of [{ ...LM, schema: 2 }, { ...LM, group: 'other' }, { ...LM, slices: [[1]] }, { ...LM, slices: [[5, 1]] }, '<html>']) {
      const t = served({ 'lm-roman.json': bad })
      await expect(servedFaces(API, t.f)('lm-roman-regular'), JSON.stringify(bad)).rejects.toThrow()
    }
  })

  it('a file whose path is not one of the static fonts\' is no source: the site\'s files alone', async () => {
    const s = served({ 'lm-roman.json': { ...LM, faces: { 'lm-roman-regular': [{ path: 'https://evil.example/x.woff2' }, { path: 'static-fonts/../x.woff2' }] } } })
    expect(await servedFaces(API, s.f)('lm-roman-regular')).toEqual([])
  })
})
