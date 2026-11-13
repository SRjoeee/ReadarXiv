// The prepare's one entry (src/prepare.ts `prepare`) and its front half (src/front.ts): what arXiv's PDF says read once; the
// tree decided once, before anything is compiled; the source's units handed out before any compile of the marks, as the bundle
// states them; a stored instrument taken only for the original it was made with, its plan handing instrumentOf every option the
// marked compile gave and the .bbl it was opened with; the frames: what the front half is handed and makes beside the
// instrument is let go before the back half begins; and the back half given the front half's own classesOf. The marked compile
// and instrumentOf are spies here: no TeX runs. Every paper and PDF is made here.
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { deflateSync, inflateSync } from 'node:zlib'
import * as PL from '@cantoo/pdf-lib'
import { BOUNDS, read, type Unit, unitId } from '@readarxiv/format'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, test, vi } from 'vitest'
import {
  type FrontHalf,
  type FrontInput,
  type OriginalFacts,
  originalFactsOf,
  type PreparePdfJs,
  prepareFront,
  sourceUnitsOf,
  type StoredInstrument,
  treeOf,
  unitsObjects,
} from '../src/front.ts'
import { classesOf, instrumentOf, markedOfPaper, openPaper } from '../src/front.types.ts'
import { type Instrument, ownersOf, ROLE } from '../src/instrument.ts'
import { type PrepareHost, prepare } from '../src/prepare.ts'
import { readPdf } from '../src/read.ts'

const OPTIONS = vi.hoisted(() => ({
  engine: 'pdflatex',
  texts: new Map([['\\hlg', 'All good.']]),
  inkless: new Set(['\\noink']),
  lineskip: [1, 0],
  decorated: [['\\hlg', 'All good.']],
  switches: {},
}))
/** the .bbl the bibliography's spy makes: every byte value, a length that leaves base64 a pad */
const BBL = vi.hoisted(() => ({ path: 'main.bbl', bytes: Uint8Array.from({ length: 257 }, (_, i) => i % 256) }))
vi.mock('../src/front.types.ts', async (real) => {
  const m = await real<typeof import('../src/front.types.ts')>()
  return {
    ...m,
    // (a paper whose .bbl TeX must make: the job's, made by the spy)
    bibliographyKept: vi.fn(() => null),
    madeBibliography: vi.fn(async (paper: unknown) => ({ paper, made: BBL, ms: 1 })),
    markedOfPaper: vi.fn(async () => ({
      pdf: new Uint8Array([1]),
      log: 'the marked log',
      options: structuredClone(OPTIONS),
      ms: { probe: 0, compile: 0 },
      base: { pdf: new Uint8Array([37, 80, 68, 70]), log: '' },
    })),
    instrumentOf: vi.fn(async () => ({ instrument: {}, today: null })),
  }
})

/** what locate is given by the back half (its options), each call's, read as it passes */
const located = vi.hoisted(() => ({ options: [] as Record<string, unknown>[] }))
vi.mock('../src/locate/locate.ts', async (real) => {
  const m = await real<typeof import('../src/locate/locate.ts')>()
  return {
    ...m,
    locate: (...args: Parameters<typeof m.locate>) => {
      located.options.push(args[3] as unknown as Record<string, unknown>)
      return m.locate(...args)
    },
  }
})

const enc = new TextEncoder()
const files = (o: Record<string, string>) => new Map(Object.entries(o).map(([k, v]) => [k, enc.encode(v)]))
const PAPER =
  '\\documentclass{article}\n\\begin{document}\n\\section{Introduction}\nThe first paragraph has a few words in it.\n\n' +
  'The second paragraph has a footnote.\\footnote{A note.}\n\\end{document}\n'
const pdfjs = { getDocument, OPS } as unknown as PreparePdfJs
const BANNER = 'This is pdfTeX, Version 3.141592653-2.6-1.40.26 (TeX Live 2024) kpathsea version 6.4.0'
const DAY = Date.UTC(2026, 0, 2, 3, 4, 5) / 1000

/** a PDF of `pages` pages, made on DAY, its Info dictionary naming pdfTeX's banner where `banner` */
async function pdfOf(pages: number, banner: string | null): Promise<Uint8Array> {
  const doc = await PL.PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage([612, 792])
  doc.setCreationDate(new Date(DAY * 1000))
  // (the Info dictionary setCreationDate made, its custom key as pdfTeX writes it)
  const info = doc.context.trailerInfo.Info
  if (banner && info)
    doc.context.lookup(info, PL.PDFDict).set(PL.PDFName.of('PTEX.Fullbanner'), PL.PDFString.of(banner))
  return doc.save({ useObjectStreams: false })
}

describe("what arXiv's PDF says, read once", () => {
  test('its page count, its day and the TeX Live year its banner names; a PDF that names none, no year', async () => {
    expect(await originalFactsOf(await pdfOf(2, BANNER), { pdfjs, documentOptions: {} })).toEqual({
      pages: 2,
      day: DAY,
      banner: '2024',
    })
    expect((await originalFactsOf(await pdfOf(1, null), { pdfjs, documentOptions: {} })).banner).toBe(null)
  })
})

describe('the tree, once', () => {
  const served = ['2023', '2025']
  const readme = (v: unknown) =>
    files({
      'main.tex': PAPER,
      '00README.json': JSON.stringify({ sources: [{ filename: 'main.tex', usage: 'toplevel' }], texlive_version: v }),
    })
  test("the paper's own declaration where it is served; else the banner's year where the paper declares none; else the default", () => {
    expect(treeOf({ files: readme(2023), banner: '2025', served, fallback: '2025' })).toEqual({
      tree: '2023',
      why: 'readme',
      declared: '2023',
    })
    expect(treeOf({ files: files({ 'main.tex': PAPER }), banner: '2023', served, fallback: '2025' })).toEqual({
      tree: '2023',
      why: 'banner',
      declared: null,
    })
    expect(treeOf({ files: files({ 'main.tex': PAPER }), banner: null, served, fallback: '2025' })).toEqual({
      tree: '2025',
      why: 'default',
      declared: null,
    })
    // (a declared year no host serves is not overridden by the banner: the default stands for it; a banner of a tree no host
    // serves names none)
    expect(treeOf({ files: readme(2020), banner: '2023', served, fallback: '2025' })).toEqual({
      tree: '2025',
      why: 'default',
      declared: '2020',
    })
    expect(treeOf({ files: files({ 'main.tex': PAPER }), banner: '2021', served, fallback: '2025' }).tree).toBe('2025')
  })
})

describe("the source's units, before any compile", () => {
  test("each unit once, its id format's unitId of its kind and content, in Units objects format reads", () => {
    const units = sourceUnitsOf(openPaper(files({ 'main.tex': PAPER })))
    expect(units.map((u) => u.kind)).toEqual(expect.arrayContaining(['heading', 'para', 'footnote']))
    expect(new Set(units.map((u) => u.id)).size).toBe(units.length)
    const objects = unitsObjects(units)
    expect(objects).toHaveLength(1)
    expect(read('units', objects[0] as Uint8Array).units).toEqual(units)
  })
  test('a unit lit by sentence says so, as the bundle states it: running text, never a heading', () => {
    const units = sourceUnitsOf(openPaper(files({ 'main.tex': PAPER })))
    const by = (kind: string) => units.filter((u) => u.kind === kind).map((u) => u.sentences)
    expect(by('para')).toEqual([true, true])
    expect(by('footnote')).toEqual([true])
    expect(by('heading')).toEqual([undefined])
  })
  test("an element's kind as the bundle's units state it: a tie a space, a forced break a break", () => {
    const tex =
      '\\documentclass{article}\n\\begin{document}\nSee Section~2 for the rest.\\\\\nAnd a second line here.\n\\end{document}\n'
    const [para] = sourceUnitsOf(openPaper(files({ 'main.tex': tex }))).filter((u) => u.kind === 'para')
    const kinds = (para?.content ?? []).flatMap((p) => (p.t === 'el' ? [[p.src, p.kind]] : []))
    expect(kinds).toEqual(
      expect.arrayContaining([
        ['~', 'space'],
        [expect.stringMatching(/^\\\\/), 'break'],
      ]),
    )
  })
  test('cut into windows under the Units bound, every unit once and in order', () => {
    const big = (i: number): Unit => ({
      id: i.toString(16).padStart(64, '0'),
      kind: 'para',
      content: [{ t: 'text', s: 'x'.repeat(100_000) }],
    })
    const units = Array.from({ length: 9 }, (_, i) => big(i))
    const objects = unitsObjects(units)
    expect(objects.length).toBeGreaterThan(1)
    for (const o of objects) expect(o.byteLength).toBeLessThanOrEqual(BOUNDS.units.bytes)
    expect(objects.flatMap((o) => read('units', o).units)).toEqual(units)
  })
})

describe('a stored instrument is taken only for the original it was made with, and makes the same instrument', () => {
  const ORIGINAL: OriginalFacts = { pages: 1, day: 1_700_000_000, banner: '2025' }
  async function run(stored: StoredInstrument | null, original = ORIGINAL) {
    let compiles = 0
    const notes: [string, unknown][] = []
    const marked = vi.mocked(markedOfPaper).mock.calls.length
    const input: FrontInput = {
      files: files({
        'main.tex':
          '\\documentclass{article}\n\\begin{document}\nA paragraph with \\hlg{All good.} in it.\n\\end{document}\n',
      }),
      tree: '2025',
      original,
      stored,
      compile: async () => {
        compiles++
        return { ok: false }
      },
      units: async () => {},
      stage: () => {},
      note: (n, d) => notes.push([n, d]),
      engines: ['pdflatex'],
      pdfjs,
      documentOptions: {},
    }
    const r = await prepareFront(input)
    const given = vi.mocked(instrumentOf).mock.calls.at(-1)?.[0] as {
      options: Record<string, unknown>
      paper: ReturnType<typeof openPaper>
    }
    return { r, compiles, marked: vi.mocked(markedOfPaper).mock.calls.length - marked, notes, given }
  }
  test('texts, inkless, lineskip and decorated come back from the plan as the marked compile gave them, Maps and Sets as such, with no compile', async () => {
    const fresh = await run(null)
    if (!fresh.r.ok || !fresh.r.made) throw new Error('the fresh run kept no plan')
    const plan = JSON.parse(new TextDecoder().decode(fresh.r.made.plan)) as Record<string, unknown>
    expect(Object.keys(plan).sort()).toEqual([
      'bbl',
      'decorated',
      'facts',
      'front',
      'inkless',
      'lineskip',
      'texts',
      'v',
    ])
    expect(plan.facts).toEqual(ORIGINAL)
    expect(new TextDecoder().decode(fresh.r.made.log)).toBe('the marked log')
    const retry = await run(fresh.r.made)
    expect([retry.compiles, retry.marked]).toEqual([0, 0])
    expect(retry.r.ok && retry.r.made).toBe(null)
    for (const k of ['texts', 'inkless', 'lineskip', 'decorated'] as const)
      expect(retry.given.options[k], k).toStrictEqual(fresh.given.options[k])
    expect(retry.given.options.texts).toStrictEqual(OPTIONS.texts)
  })
  test('.bbl kept as the plan has always stored it (base64, padded), and the paper opened again with it on a retry', async () => {
    const fresh = await run(null)
    if (!fresh.r.ok || !fresh.r.made) throw new Error('the fresh run kept no plan')
    const plan = JSON.parse(new TextDecoder().decode(fresh.r.made.plan)) as { bbl: { path: string; bytes: string } }
    expect(plan.bbl).toEqual({ path: BBL.path, bytes: Buffer.from(BBL.bytes).toString('base64') })
    const retry = await run(fresh.r.made)
    expect(retry.given.paper.fsys.read(BBL.path)).toEqual(BBL.bytes)
  })
  test('another page count, another day or an unreadable plan: compiled anew, and said so', async () => {
    const fresh = await run(null)
    if (!fresh.r.ok || !fresh.r.made) throw new Error('the fresh run kept no plan')
    for (const original of [
      { ...ORIGINAL, pages: 2 },
      { ...ORIGINAL, day: (ORIGINAL.day ?? 0) + 86_400 },
    ]) {
      const again = await run(fresh.r.made, original)
      expect(again.marked).toBe(1)
      expect(again.notes).toContainEqual(['front', { stored: 'made with another original: compiled anew' }])
    }
    const unreadable = await run({ ...fresh.r.made, plan: enc.encode('{"front":"today","v":1}') })
    expect(unreadable.marked).toBe(1)
    expect(unreadable.notes).toContainEqual(['front', { stored: 'unreadable: compiled anew' }])
  })
})

describe('the prepare: the tree before any compile, refusals as reasons, and the frames', () => {
  setFlagsFromString('--expose_gc')
  const gc = runInNewContext('gc') as () => void
  const SIZE = 8 * 2 ** 20
  /** a host that compiles nothing, `stage` and `note` its own */
  const host = (o: Partial<PrepareHost> = {}): PrepareHost => ({
    paper: { id: '2612.99990', version: 1 },
    made: 'test',
    tree: { year: '2025', served: ['2023', '2025'], fallback: '2025' },
    engines: ['pdflatex'],
    pdfjs,
    documentOptions: {},
    PL: PL as never,
    deflate: (b) => b,
    inflate: (b) => b,
    compile: async () => {
      throw new Error('no compile')
    },
    stage: () => {},
    units: async () => {},
    instrument: async () => {},
    object: async () => {},
    note: () => {},
    now: () => performance.now(),
    ...o,
  })
  const never: FrontHalf = async () => {
    throw new Error('the front half ran')
  }
  test("a paper of another tree is answered with it before the front half runs; the source's own refusal and an unreadable A are reasons", async () => {
    const A = await pdfOf(1, null)
    const notes: [string, unknown][] = []
    const other = host({
      tree: { year: '2023', served: ['2023', '2025'], fallback: '2025' },
      note: (n, d) => notes.push([n, d]),
    })
    expect(
      await prepare(() => ({ files: files({ 'main.tex': PAPER }), original: A, stored: null }), other, never),
    ).toEqual({ wrongTree: '2025' })
    expect(notes).toEqual([['tree', { tree: '2025', why: 'default', declared: null }]])
    expect(await prepare(() => ({ why: 'no-source', detail: 'a PDF for its source' }), host(), never)).toEqual({
      ok: false,
      why: 'no-source',
      detail: 'a PDF for its source',
    })
    const corrupt = await prepare(
      () => ({ files: files({ 'main.tex': PAPER }), original: enc.encode('not a PDF'), stored: null }),
      host(),
      never,
    )
    expect(corrupt).toMatchObject({ ok: false, why: 'corrupt' })
  })
  /** which of the files the front half was handed and the objects it made beside the instrument are still reached as the
   *  back half begins, after a full collection; `keep` holds the named ones on purpose (the control) */
  async function reachedAtBack(keep: ReadonlySet<'files' | 'made'> = new Set()): Promise<string[]> {
    const A = await pdfOf(1, null)
    const watched: Record<'files' | 'made', WeakRef<object>[]> = { files: [], made: [] }
    const kept: unknown[] = []
    let reached: string[] | null = null
    const front: FrontHalf = async (input) => {
      await input.units([new Uint8Array(8)])
      const made = {
        'b.pdf': new Uint8Array(SIZE),
        log: new Uint8Array(8),
        plan: new Uint8Array(8),
        definitions: new Uint8Array(8),
      }
      watched.files = [new WeakRef(input.files), ...[...input.files.values()].map((b) => new WeakRef(b.buffer))]
      watched.made = [new WeakRef(made), new WeakRef(made['b.pdf'].buffer)]
      if (keep.has('files')) kept.push(input.files)
      if (keep.has('made')) kept.push(made)
      // (a turn of the event loop: the job that made the references ends, and with it the hold it keeps on their targets)
      await new Promise((r) => setTimeout(r, 0))
      return { ok: true, instrument: {} as Instrument, made }
    }
    const stage = (s: string) => {
      if (s !== 'laying-out') return
      gc()
      reached = (['files', 'made'] as const).filter((k) => watched[k].some((w) => w.deref() !== undefined))
    }
    // (the back half then refuses the empty instrument: what is reached as it begins is what is read)
    await prepare(
      () => ({
        files: new Map([
          ['main.tex', enc.encode(PAPER)],
          ['data.bin', new Uint8Array(SIZE)],
        ]),
        original: A,
        stored: null,
      }),
      host({ stage }),
      front,
    ).catch(() => null)
    if (reached === null) throw new Error('the back half did not begin')
    expect(kept.length).toBe(keep.size)
    return reached
  }
  test("as the back half begins, the source's files and the front half's instrument objects are let go", async () => {
    expect(await reachedAtBack()).toEqual([])
  }, 60_000)
  test('the reading tells what is held from what is let go: held on purpose, both are reached', async () => {
    expect(await reachedAtBack(new Set(['files', 'made']))).toEqual(['files', 'made'])
  }, 60_000)
  test("the back half is given the front half's own reading of an element's class (instrument.mjs classesOf), the host never names it", async () => {
    // (a page of three Helvetica lines, B and A alike: its first two lines one paragraph's, its third another's)
    const doc = await PL.PDFDocument.create()
    const page = doc.addPage([612, 792])
    const font = await doc.embedFont(PL.StandardFonts.Helvetica)
    page.node.setFontDictionary(PL.PDFName.of('F1'), font.ref)
    const lines = ['The first line of a unit', 'and its second line', 'Another unit stands here']
    const content = lines.map((l, i) => `BT /F1 10 Tf 72 ${700 - 14 * i} Td (${l}) Tj ET`).join('\n')
    page.node.set(PL.PDFName.of('Contents'), doc.context.register(doc.context.stream(content)))
    const A = await doc.save({ useObjectStreams: false })
    const B = (await readPdf(pdfjs, A, { options: {}, turned: true })).doc
    const text = (s: string) => [{ t: 'text' as const, s }]
    const units = [text(`${lines[0]} ${lines[1]}`), text(lines[2] ?? '')].map((c) => ({
      id: unitId('para', c),
      kind: 'para',
      content: c,
    }))
    const instrument: Instrument = {
      ink: B,
      units,
      glyphs: B.pages.map((pg) => {
        const O = ownersOf(pg.glyphs.length)
        pg.glyphs.forEach((g, j) => {
          O.unit[j] = g.n < 2 ? 0 : 1
          O.role[j] = ROLE.text
        })
        return O
      }),
      boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
      tex: {},
      made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
    }
    const front: FrontHalf = async (input) => {
      await input.units([])
      return { ok: true, instrument, made: null }
    }
    const objects: string[] = []
    located.options.length = 0
    const end = await prepare(
      () => ({ files: files({ 'main.tex': PAPER }), original: A, stored: null }),
      host({
        deflate: (b) => new Uint8Array(deflateSync(b)),
        inflate: (b, limit) => new Uint8Array(inflateSync(b, { maxOutputLength: limit + 1 })),
        object: async (x) => {
          objects.push(x.kind)
        },
      }),
      front,
    )
    expect('ok' in end && end.ok).toBe(true)
    expect(objects).toContain('head')
    expect(located.options).toHaveLength(1)
    expect(located.options[0]?.classesOf).toBe(classesOf)
  }, 60_000)
})
