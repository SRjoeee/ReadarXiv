import { describe, expect, it } from 'vitest'
import {
  canonical,
  chunkDigests,
  chunkMatches,
  FormatError,
  fromUtf8,
  groupName,
  groupOf,
  type Head,
  type Part,
  type Piece,
  read,
  sha256Hex,
  type Units,
  unitId,
  utf8,
  write,
} from '../src/index.ts'

// Unit ids: the baseline's vectors (readarxiv-lab-data/refactor-2026-11/baseline, FORMAT.md §2). The first eight are units
// of the baseline's dumps whose whole content is a common word (no paper's text), each the same id in every paper of the
// corpus that holds it; the rest synthetic, their ids computed by the baseline's own tools/unit-id.mjs idOf (an independent
// implementation of the rule). The lab runner checks the rule on every unit of the 87 dumps.
const text = (s: string): Piece => ({ t: 'text', s })
const VECTORS: [string, Piece[], string][] = [
  ['heading', [text('Introduction')], '5747e9132790023b3b03bb5878510374cf60702d9b9c5586bfdbc0c933c42667'],
  ['heading', [text('Conclusion')], '06e04ac2186906b71f1da4d1a5e9d3aa26ec0995938b4b468a382ca2d5040ea3'],
  ['heading', [text('Acknowledgments')], '4a36cc73e1cbe905248758007f66f3dff010bbaa4586378dc88550258c2b6243'],
  ['heading', [text('Related Work')], 'fff50c7c776e3f5e7fd25475f0f8954ca59787490927f2a917c1cc141ea0d943'],
  ['inkcontents', [text('Introduction')], 'ef705057ddfd5b86cc7b33cbd627b1d9421c9b779e192555cac7841979606517'],
  ['inkcontents', [text('Conclusion')], 'e15822de746b390a1164f041ba2f919e43d4c97c1253797e1aaf658b1c1feacc'],
  ['inkorphan', [text('Acknowledgments')], '2ea22b5441e24eac7ad1c5f99ee27dfad1429fa719521c9477542b3b7ab19c17'],
  ['inkorphan', [text('Abstract')], '41fb0520558a7e735207e11b902aa7976a0fc7dd78eb3926e43163f6c7e14ff5'],
  [
    'para',
    [
      text('We study '),
      { t: 'el', id: '1', kind: 'math', src: '$x^2$' },
      text(' and '),
      { t: 'span', id: '3', style: 'bold', open: '\\textbf{', close: '}', content: [text('bold')] },
      text('.'),
    ],
    '127c2d03a79457e8990caf5571e663b37e428508eaba5fdfd23d2ab637c3979c',
  ],
  [
    'footnote',
    [text('Équipe — naïve café, Ελληνικά, Кириллица, 😀')],
    '2bca5685b30b8919752cd329c4eb9777f6adcdf0b542bdef2e75349f44d77bb1',
  ],
  [
    'para',
    [text('Before'), { t: 'unit', id: '1', unit: '0'.repeat(64), pre: '\\footnote{', post: '}' }, text(' after')],
    '93cd1bbc3415d3fffb9486d00e8a122cc352d4cfc3969a79817e3537be79d261',
  ],
  ['cell', [], '78e21f64314572cfdfae3d6bbec2017f10e59d6d0364f771d5a1ef5ec057fd5b'],
  // (a group the unit's edge cuts: its close with no open, its open with no close)
  [
    'cell',
    [{ t: 'span', id: '1', style: 'other', close: '}', content: [text('A')] }, text('B')],
    '00bff6d6dd220c135d7546969516f90860523e33900d503585a1a4f5549eb53c',
  ],
  [
    'cell',
    [text('A'), { t: 'span', id: '1', style: 'other', open: '\\shortstack[l]{', content: [text('B')] }],
    '11dc234cfeae5a3485631b0fa33eb5cc35808be6fcad04fe42b9f60cfcbadc9f',
  ],
  [
    'caption',
    [
      {
        t: 'span',
        id: '0',
        style: 'italic',
        open: '\\emph{',
        close: '}',
        content: [
          { t: 'span', id: '1', style: 'sc', open: '\\textsc{', close: '}', content: [text('a "quoted" \\ back')] },
        ],
      },
    ],
    '4cac76d5b8cb6648e7f04c686282f0f68ebba3f3562f9abf6503418f95d7fbda',
  ],
]

describe('unitId', () => {
  it.each(VECTORS)('%s: the baseline’s id', (kind, content, id) => {
    expect(unitId(kind, content)).toBe(id)
  })
  it('reads only what the source says: piece ids, styles, keys and must do not enter', () => {
    const a: Piece[] = [{ t: 'el', id: '1', kind: 'cite', src: '\\cite{a}', keys: ['a'] }]
    const b: Piece[] = [{ t: 'el', id: '9', kind: 'other', src: '\\cite{a}' }]
    expect(unitId('para', a)).toBe(unitId('para', b))
    expect(unitId('para', a)).not.toBe(unitId('para', [{ t: 'el', id: '1', kind: 'cite', src: '\\cite{b}' }]))
    expect(unitId('para', a)).not.toBe(unitId('caption', a))
  })
})

describe('sha256', () => {
  it('meets FIPS 180-4’s examples and a length across a block edge', () => {
    expect(sha256Hex(utf8(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex(utf8('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256Hex(utf8('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    )
    expect(sha256Hex(new Uint8Array(1_000_000).fill(0x61))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    )
  })
})

const ID = unitId('heading', [text('Introduction')])
const style = { role: 'serif', size: 10 } as const
const part = (): Part => ({
  format: 1,
  page: 2,
  paper: { faces: { fonts: [['CMR10', 120]] } },
  flows: [
    [
      {
        ord: 0,
        kind: 'heading',
        text: ID,
        lead: 12,
        style,
        align: 'l',
        lines: [[2, 0, 72, 140.5, 700, 708, 698, 72, 300, 0]],
        room: { below: 4 },
      },
    ],
  ],
})

describe('read and write', () => {
  it('write then read gives the same value, for every kind', () => {
    const units: Units = { format: 1, units: [{ id: ID, kind: 'heading', content: [text('Introduction')], depth: 1 }] }
    const head: Head = {
      format: 1,
      paper: { id: '2501.00001', version: 1, pages: 3 },
      made: 'test',
      original: { bytes: 10, sha256: '0'.repeat(64), chunk: 65536, chunks: chunkDigests(new Uint8Array(10)) },
      addOn: null,
      units: ['1'.repeat(64)],
      parts: [null, '2'.repeat(64), null],
    }
    for (const [kind, value] of [
      ['units', units],
      ['head', head],
      ['part', part()],
      ['row', { id: ID, ok: true, content: [text('Einleitung')], by: 'test' }],
    ] as const) {
      const { bytes, digest } = write(kind, value as never)
      expect(read(kind, bytes, digest)).toEqual(value)
    }
  })
  it('writes canonical bytes: keys sorted, -0 as 0, the same for the same value however built', () => {
    expect(canonical({ b: 1, a: [-0, 1.5], c: undefined })).toBe('{"a":[0,1.5],"b":1}')
    const p = part()
    const q = JSON.parse(JSON.stringify(p)) as Part
    q.flows[0]![0]!.room = { below: 4 }
    expect(write('part', p).digest).toBe(write('part', q).digest)
  })
  it('ignores a field it does not know, and does not write it', () => {
    const p = { ...part(), later: { a: 1 } }
    const { bytes } = write('part', p as Part)
    expect(fromUtf8(bytes)).not.toContain('later')
    const raw = utf8(JSON.stringify({ ...part(), later: 1 }))
    expect(read('part', raw)).toEqual(part())
  })
  it('refuses before parsing: a wrong digest, too many bytes, values or levels', () => {
    const { bytes } = write('part', part())
    expect(() => read('part', bytes, '0'.repeat(64))).toThrow(FormatError)
    const big = new Uint8Array(64 * 1024 + 1).fill(0x20)
    expect(() => read('head', big)).toThrow(/past 65536/)
    const deep = utf8(`${'['.repeat(40)}${']'.repeat(40)}`)
    expect(() => read('part', deep)).toThrow(/deeper/)
    const many = utf8(`[${Array.from({ length: 20000 }, () => '1').join(',')}]`)
    expect(() => read('head', many)).toThrow(/values/)
  })
  it('refuses what its schema does not take, and bytes that are not UTF-8', () => {
    const why = (f: () => unknown) => {
      try {
        f()
      } catch (e) {
        return e instanceof FormatError ? e.why : 'other'
      }
      return 'none'
    }
    expect(why(() => read('part', utf8('{"format":2}')))).toBe('schema')
    expect(why(() => read('part', utf8('{"format":')))).toBe('json')
    expect(why(() => read('part', Uint8Array.from([0x7b, 0xff, 0x7d])))).toBe('json')
    expect(() => write('part', { ...part(), page: 0 })).toThrow(FormatError)
  })
})

describe('names', () => {
  it('names a placement’s groups by ord, page and kind, and reads them back', () => {
    expect(groupName(12, 3, 1)).toBe('axt:12.3.t')
    expect(groupName(12, 3, 2)).toBe('axt:12.3.e')
    expect(groupName(12, 3, 4)).toBe('axt:12.3.l')
    expect(groupOf('axt:12.3.l')).toEqual({ ord: 12, page: 3, group: 4 })
    expect(groupOf('axt:u12')).toBeNull()
  })
  it('digests the original by chunks of 64 KiB, the last shorter', () => {
    const b = new Uint8Array(65536 * 2 + 7).map((_, i) => i & 255)
    const c = chunkDigests(b)
    expect(c.length).toBe(3 * 22)
    expect(chunkMatches(c, 1, b.subarray(65536, 131072))).toBe(true)
    expect(chunkMatches(c, 2, b.subarray(131072))).toBe(true)
    expect(chunkMatches(c, 2, b.subarray(131071))).toBe(false)
  })
})
