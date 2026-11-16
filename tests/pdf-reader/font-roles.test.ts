// The font role table (font-roles.mjs) and its generated coverage (font-coverage.mjs): a PDF font's class from its
// PostScript name, a paper's English family from the TeX path's probe or the layout file's fonts (one table of names behind
// both), the faces each target draws in under the maintainer's rulings of 2026-10-06 (spec §1.3, §4.4) and of 2026-10-29 (a
// CJK target's Regular and Bold beside every English family), and whether a text is drawable from the served faces alone.
// No face is the reader's own: one rendering on every device
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { COVERAGE, COVERAGE_SOURCE, METRICS } from '../../packages/engine/src/fonts/font-coverage.ts'
import { classifyFont, FACES, type FontClass, familyOfFonts, familyOfProbe } from '../../packages/engine/src/fonts/font-roles.ts'

const cls = (name: string) => { const c = classifyFont(name); return { cls: c.cls, bold: c.bold, italic: c.italic, caps: c.caps, design: c.design, known: c.known } }
const probe = (rm: string) => ({ rm, sf: 'cmss', tt: 'cmtt', body: rm })

describe('classifyFont', () => {
  it('each name\'s class', () => {
    const rows: [string, Partial<FontClass>][] = [
      ['ABCDEF+NimbusRomNo9L-Medi', { cls: 'serif', bold: true, italic: false, design: 'times', known: true }],
      ['NimbusRomNo9L-ReguItal', { cls: 'serif', bold: false, italic: true, design: 'times' }],
      ['CMTI10', { cls: 'serif', bold: false, italic: true, design: 'cm', known: true }],
      ['SFBX1200', { cls: 'serif', bold: true, italic: false, design: 'cm' }],
      ['LMRoman10-Bold', { cls: 'serif', bold: true, italic: false, design: 'cm' }],
      ['CMMI10', { cls: 'math' }],
      ['CMSY10', { cls: 'math' }],
      ['CMTT10', { cls: 'mono', design: 'cmtt', bold: false }],
      ['NimbusMonL-Regu', { cls: 'mono', design: 'courier', bold: false, italic: false }],
      ['CMSS10', { cls: 'sans', design: 'cmss' }],
      ['NimbusSanL-Regu', { cls: 'sans', design: 'helvetica', bold: false }],
      ['CMCSC10', { cls: 'serif', caps: true, design: 'cm', bold: false }],
      ['LinLibertineTB', { cls: 'serif', bold: true, italic: false, design: 'libertine' }],
      ['LinLibertineT', { cls: 'serif', bold: false, italic: false, design: 'libertine' }],
      ['URWPalladioL-Roma', { cls: 'serif', bold: false, italic: false, design: 'palatino' }],
      ['XCharter-Roman', { cls: 'serif', bold: false, italic: false, design: 'charter' }],
      ['T3Font_0', { known: false }],
    ]
    for (const [name, want] of rows) expect(cls(name), name).toMatchObject(want)
  })

  it('a name it cannot place is unknown, never a crash, whatever its length', () => {
    expect(classifyFont('').known).toBe(false)
    expect(classifyFont('ABCDEF+').known).toBe(false)
    const long = 'X'.repeat(10_000)
    expect(classifyFont(long)).toMatchObject({ known: false, design: 'other' })
    expect(classifyFont(`CMR10${long}`).known).toBe(false)
  })
})

describe('the family of a paper', () => {
  it('by probe and by fonts', () => {
    const rows: [string, string][] = [
      ['cmr', 'cm'], ['ptm', 'times'], ['txr', 'times'], ['ntxtlf', 'times'], ['LinuxLibertineT-TLF', 'libertine'],
      ['ppl', 'palatino'], ['zpl', 'palatino'], ['bch', 'charter'], ['XCharter-TLF', 'charter'], ['put', 'utopia'],
      ['Erewhon-TLF', 'utopia'], ['ebg', 'garamond'], ['EBGaramond-TLF', 'garamond'], ['foo', 'other'],
    ]
    for (const [rm, family] of rows) expect(familyOfProbe(probe(rm)), rm).toBe(family)
    expect(familyOfProbe(null)).toBe('other')
    expect(familyOfFonts(['CMR10', 'NimbusRomNo9L-Regu'], [10, 90])).toBe('times')
    expect(familyOfFonts(['CMR10', 'NimbusRomNo9L-Regu'], [90, 10])).toBe('cm')
  })

  it('weighs only the text faces, and any input it is given', () => {
    // the math and the code are not the body: a CM-math Times paper is a Times paper
    expect(familyOfFonts(['CMMI10', 'CMSY10', 'CMTT10', 'NimbusRomNo9L-Regu'], [500, 500, 500, 1])).toBe('times')
    expect(familyOfFonts([], [])).toBe('other')
    expect(familyOfFonts(['CMR10'], [])).toBe('other')
    expect(familyOfFonts(['CMR10', 'NimbusRomNo9L-Regu'], [Number.NaN, 1])).toBe('times')
    expect(familyOfFonts(['CMR10', 'NimbusRomNo9L-Regu'], [-100, 1])).toBe('times')
    expect(familyOfFonts(['CMR10', 'NimbusRomNo9L-Regu'], [Number.POSITIVE_INFINITY, 1])).toBe('times')
  })
})

describe('the faces', () => {
  it('no face is the system\'s', () => {
    const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|math|emoji|fangsong|-apple-system|BlinkMacSystemFont)$/i
    const SYSTEM = /^(Times|Arial|Helvetica|Courier|Georgia|Verdana|Palatino|Cambria|Calibri|SimSun|SimHei|KaiTi|FangSong|PingFang|Hiragino|Songti|STSong|STKaiti|Yu ?Mincho|YuGothic|MS ?Mincho|MS ?Gothic|Meiryo|Batang|Gulim|Malgun|AppleMyungjo|Apple ?SD|Noto Serif CJK|Microsoft)/i
    for (const [id, face] of Object.entries(FACES)) {
      expect(face.id, id).toBe(id)
      expect(face.family, id).toMatch(/^axt-[a-z0-9-]+$/)
      expect(face.family, id).not.toMatch(GENERIC)
      expect(face.file, id).not.toMatch(SYSTEM)
      expect(face.file, id).toMatch(/^[A-Za-z0-9_-]+\.(otf|ttf)$/)
      expect(['texlive', 'hosted'], id).toContain(face.source)
      // what is hosted is Source Han Serif's regional OTFs and URW's base 35 release, and only they
      expect(face.source === 'hosted', id).toBe(/^(SourceHanSerif(SC|TC|K)|NimbusRoman|NimbusSans|NimbusMonoPS)-/.test(face.file))
      expect([300, 400, 500, 600, 700], id).toContain(face.weight)
      expect(['normal', 'italic'], id).toContain(face.style)
    }
    // one face a file, one family-weight-style a face
    const files = Object.values(FACES).map(f => f.file)
    expect(new Set(files).size).toBe(files.length)
    const keys = Object.values(FACES).map(f => `${f.family}|${f.weight}|${f.style}`)
    expect(new Set(keys).size).toBe(keys.length)
    for (const file of ['packages/engine/src/fonts/font-roles.ts', 'packages/engine/src/fonts/font-coverage.ts']) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/local\(/)
    }
  })

  it('no family carries a name its face\'s licence reserves (OFL §3: a modified subset may not)', () => {
    // the family is the name inside every served subset (the web's subsetter writes it as name IDs 1, 3, 4 and 6 and the CFF
    // names), so it holds none of the names its face's licence reserves, compared as the licences do in effect: without
    // case, spaces or punctuation. The names are the faces' own notices' (the web's credits); every face is in one row, so a
    // face the table gains is a decision
    const RESERVED: [RegExp, string[]][] = [
      [/^shs-(sc|tc|k)-/, ['Source']],
      [/^haranoaji-/, ['Harano Aji', 'Source']],
      [/^(libertine|biolinum)-/, ['Linux Libertine', 'Biolinum']],
      [/^erewhon-/, ['Heuristica', 'Erewhon']],
      [/^cmun-/, ['Computer Modern Unicode fonts']],
      [/^pt-mono-/, ['PT Sans', 'PT Serif', 'PT Mono']],
      [/^dejavu-mono-/, ['Bitstream', 'Vera']],
      [/^(fandolkai|bkai00mp|lm-|nimbus-|freemono-|xcharter-|ebgaramond-|domitian-|inconsolata-)/, []],
    ]
    const flat = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
    const rowsOf = (id: string) => RESERVED.filter(([ids]) => ids.test(id))
    const held = (family: string, id: string) => rowsOf(id).flatMap(([, names]) => names).filter(name => flat(family).includes(flat(name)))
    for (const [id, face] of Object.entries(FACES)) {
      expect(rowsOf(id), id).toHaveLength(1)
      expect(held(face.family, id), id).toEqual([])
    }
    // a family that spelled its face's name would be found: Source Han Serif's, which its group's own name does not hold
    expect(held('axt-source-han-serif-sc', 'shs-sc-regular')).toEqual(['Source'])
    expect(held('axt-haranoaji', 'haranoaji-regular')).toEqual(['Harano Aji'])
    // the four groups whose own names hold one are declared under neutral names; the face ids and files stay
    expect(Object.values(FACES).filter(f => /^(haranoaji|biolinum|erewhon|pt-mono)-/.test(f.id))).toHaveLength(13)
    expect(new Set(Object.values(FACES).filter(f => /^haranoaji-/.test(f.id)).map(f => f.family))).toEqual(new Set(['axt-mincho']))
    expect(new Set(Object.values(FACES).filter(f => /^biolinum-/.test(f.id)).map(f => f.family))).toEqual(new Set(['axt-humanist-sans']))
    expect(new Set(Object.values(FACES).filter(f => /^erewhon-/.test(f.id)).map(f => f.family))).toEqual(new Set(['axt-transitional']))
    expect(new Set(Object.values(FACES).filter(f => /^pt-mono-/.test(f.id)).map(f => f.family))).toEqual(new Set(['axt-slab-mono']))
  })

  it('the table\'s faces are the plan\'s', () => {
    // (a CJK group's Regular and Bold, which the roles draw, and its Medium, which none does; its Light and SemiBold gone with the
    // ruling of 2026-10-29)
    const cjk = ['regular', 'medium', 'bold']
    const four = ['regular', 'bold', 'italic', 'bolditalic']
    const want = [
      ...['shs-sc', 'shs-tc', 'shs-k', 'haranoaji'].flatMap(g => cjk.map(w => `${g}-${w}`)),
      'fandolkai', 'bkai00mp',
      ...['lm-roman', 'lm-sans', 'nimbus-roman', 'nimbus-sans', 'freemono', 'libertine', 'biolinum', 'xcharter', 'ebgaramond', 'erewhon', 'cmun-serif', 'cmun-sans', 'cmun-mono', 'domitian', 'dejavu-mono'].flatMap(g => four.map(s => `${g}-${s}`)),
      'lm-roman-caps', 'lm-roman-caps-italic', 'lm-mono-regular', 'lm-mono-italic', 'lm-math',
      'inconsolata-regular', 'inconsolata-bold', 'pt-mono-regular', 'pt-mono-bold',
    ]
    expect(Object.keys(FACES).sort()).toEqual(want.sort())
    expect(FACES['shs-sc-regular']).toMatchObject({ file: 'SourceHanSerifSC-Regular.otf', family: 'axt-shs-sc', weight: 400, style: 'normal', source: 'hosted' })
    expect(FACES['haranoaji-bold']).toMatchObject({ file: 'HaranoAjiMincho-Bold.otf', family: 'axt-mincho', weight: 700, source: 'texlive' })
    expect(FACES['lm-sans-bolditalic']).toMatchObject({ file: 'lmsans10-boldoblique.otf', family: 'axt-lm-sans', weight: 700, style: 'italic' })
    expect(FACES['lm-roman-caps-italic']).toMatchObject({ file: 'lmromancaps10-oblique.otf', family: 'axt-lm-roman-caps', weight: 400, style: 'italic' })
    expect(FACES['cmun-mono-bolditalic']).toMatchObject({ file: 'cmuntx.otf', family: 'axt-cmun-mono', weight: 700, style: 'italic' })
    expect(FACES['dejavu-mono-italic']).toMatchObject({ file: 'DejaVuSansMono-Oblique.ttf', family: 'axt-dejavu-mono', weight: 400, style: 'italic' })
    expect(FACES['biolinum-bolditalic']).toMatchObject({ file: 'LinBiolinum_RBO.otf', family: 'axt-humanist-sans', weight: 700, style: 'italic' })
    expect(FACES['lm-sans-italic']).toMatchObject({ file: 'lmsans10-oblique.otf', family: 'axt-lm-sans', weight: 400, style: 'italic' })
    expect(FACES['nimbus-roman-bolditalic']).toMatchObject({ file: 'NimbusRoman-BoldItalic.otf', family: 'axt-nimbus-roman', weight: 700, style: 'italic', source: 'hosted' })
    expect(FACES['lm-roman-caps']).toMatchObject({ file: 'lmromancaps10-regular.otf', family: 'axt-lm-roman-caps' })
  })

  it('every face has its coverage, metrics and licence', () => {
    expect(Object.keys(COVERAGE).sort()).toEqual(Object.keys(FACES).sort())
    expect(Object.keys(METRICS).sort()).toEqual(Object.keys(FACES).sort())
    for (const id of Object.keys(FACES)) {
      const r = COVERAGE[id] ?? []
      expect(r.length % 2, id).toBe(0)
      expect(r.length, id).toBeGreaterThan(0)
      for (let i = 0; i + 1 < r.length; i += 2) {
        const start = r[i]!, end = r[i + 1]!
        expect(Number.isInteger(start) && Number.isInteger(end), id).toBe(true)
        expect(start >= 0 && start <= end && end <= 0x10ffff, `${id} range ${i / 2}`).toBe(true)
        // sorted and disjoint, and two ranges that touch are one
        if (i > 0) expect(start > r[i - 1]! + 1, `${id} range ${i / 2}`).toBe(true)
      }
      const m = METRICS[id]!
      expect(m.unitsPerEm, id).toBeGreaterThanOrEqual(16)
      expect(m.ascent, id).toBeGreaterThan(0)
      expect(m.descent, id).toBeGreaterThanOrEqual(0)
      expect(typeof m.smcp, id).toBe('boolean')
      expect(m.sha256, id).toMatch(/^[0-9a-f]{64}$/)
    }
    // the same file, the same digest
    const digest = new Map<string, string>()
    for (const [id, f] of Object.entries(FACES)) {
      const sha = METRICS[id]?.sha256 ?? ''
      const seen = digest.get(sha)
      expect(seen === undefined || seen === f.file, id).toBe(true)
      digest.set(sha, f.file)
    }
    expect(COVERAGE_SOURCE.release['source-han-serif']).toMatch(/^\d+\.\d+R?$/)
    expect(COVERAGE_SOURCE.release.texlive).toMatch(/^texlive\/texlive@sha256:[0-9a-f]{64}$/)
    expect(COVERAGE_SOURCE.release['urw-base35-fonts']).toBe('20200910')

    const web = (re: RegExp) => Object.values(FACES).filter(f => re.test(f.id)).map(f => f.web)
    for (const f of Object.values(FACES)) {
      // an SPDX identifier, an identifier WITH an exception, or a LicenseRef-
      expect(f.licence, f.id).toMatch(/^(LicenseRef-[A-Za-z0-9.-]+|[A-Za-z0-9.+-]+(?: WITH [A-Za-z0-9.+-]+)?)$/)
      expect(['ofl', 'gfl', 'notice', 'gpl', 'review'], f.id).toContain(f.web)
      // an OFL face is served as one, and only an OFL face
      expect(f.licence === 'OFL-1.1', f.id).toBe(f.web === 'ofl')
    }
    // nothing is left for review: URW's own release carries its embedding exception (the maintainer, 2026-10-06)
    expect(Object.values(FACES).filter(f => f.web === 'review')).toEqual([])
    expect(new Set(web(/^lm-/))).toEqual(new Set(['gfl']))
    expect(new Set(web(/^(bkai00mp|xcharter-|dejavu-mono-)/))).toEqual(new Set(['notice']))
    expect(Object.values(FACES).filter(f => f.web === 'gpl').map(f => f.id).sort())
      .toEqual(['fandolkai', ...['nimbus-roman', 'nimbus-sans', 'freemono'].flatMap(g => ['regular', 'bold', 'italic', 'bolditalic'].map(s => `${g}-${s}`))].sort())
    expect(new Set(web(/^(shs-|haranoaji-|cmun-|domitian-|erewhon-|ebgaramond-|libertine-|biolinum-)/))).toEqual(new Set(['ofl']))
  })

})

// Task 7's fix round 1 (task-7-review.md): each row failed before its fix
describe('the fixes of the review', () => {

  it('M6 (with M1 and M2): every face\'s licence identifier, as its name table or licence file states it', () => {
    const GUST = 'LicenseRef-GUST-Font-License', URW = 'AGPL-3.0-only WITH PS-or-PDF-font-exception-20170817'
    const BY_GROUP: Record<string, string> = {
      'shs-sc': 'OFL-1.1', 'shs-tc': 'OFL-1.1', 'shs-k': 'OFL-1.1', mincho: 'OFL-1.1',
      fandolkai: 'GPL-3.0-or-later WITH Font-exception-2.0', bkai00mp: 'Arphic-1999',
      'lm-roman': GUST, 'lm-roman-caps': GUST, 'lm-sans': GUST, 'lm-mono': GUST, 'lm-math': GUST, freemono: 'GPL-3.0-or-later WITH Font-exception-2.0',
      libertine: 'OFL-1.1', 'humanist-sans': 'OFL-1.1', xcharter: 'Bitstream-Charter', ebgaramond: 'OFL-1.1', transitional: 'OFL-1.1',
      'cmun-serif': 'OFL-1.1', 'cmun-sans': 'OFL-1.1', 'cmun-mono': 'OFL-1.1', domitian: 'OFL-1.1',
      'nimbus-roman': URW, 'nimbus-sans': URW,
      'dejavu-mono': 'Bitstream-Vera', 'slab-mono': 'ParaType-Free-Font-1.3',
    }
    const BY_FACE: Record<string, string> = { 'inconsolata-regular': 'OFL-1.1', 'inconsolata-bold': 'Apache-2.0' }
    for (const f of Object.values(FACES)) expect(f.licence, f.id).toBe(BY_FACE[f.id] ?? BY_GROUP[f.family.slice('axt-'.length)])
  })

})

