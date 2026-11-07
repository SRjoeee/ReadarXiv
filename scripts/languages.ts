// Writes src/config/language-table.ts: the target languages (a product decision: which, in what order), the BCP 47 tag
// each is sent as, which are written right to left, and their names — in English for the prompt, in Simplified Chinese
// for that interface and in their own language for the menus, all from Unicode CLDR through the running Node's Intl (as
// scripts/language-names.ts reads the other interfaces' names), with ISO 639-3's reference name in English where CLDR
// has none. The codes and the two-letter codes are SIL's (scripts/data/iso-639-3.tab and its notice). Where the product's documents or tests fix a word the sources do not give, that word is the
// product's own and stands in OWN below, with the place that fixes it. A word fixed nowhere that differs from what the
// table held until it was replaced waits in PENDING for the maintainer's ruling (lane L10, 2026-11-07), and the script
// writes nothing while one waits. Run with `pnpm tsx scripts/languages.ts`; held to the old table's codes, tags, right-
// to-left set and default by tests/contract/no-gpl.test.ts, and to its names by the tests the OWN entries cite.
import { readFileSync, writeFileSync } from 'node:fs'

const OUT = 'src/config/language-table.ts'

/** The target languages in the menus' order (tests/contract/languages.json holds the same list) */
const CODES = `eng cmn cmn-Hant yue spa rus arb ben hin por ind jpn fra deu jav kor tel vie mar ita tam tur urd guj pol ukr kan
  mai mal pes mya swh sun ron pan bho amh hau fuv bos hrv nld srp tha ckb yor uzn zsm zlm ibo npi ceb skr tgl hun azj sin
  koi ell ces mag run bel plt qug mad nya zyb pbu kin zul bul swe lin som hms hnj ilo kaz heb nob nno afr sqi asm eus bre
  cat cos cym dan div epo ekk fao fij fin fry gla gle glg grn hat haw hye ido ina isl kat khm kir lao lat lvs lit ltz mkd
  mlt mon mri nso oci ori orm prs san slk slv smo sna snd sot tah tat tgk tir ton tsn tuk uig vol wol xho ydd aka bam bis
  bod che chv dzo ewe kab lug oss ssw ven war nde nbl pam hil bcl min ace bug ban bjn mak sas tet cha niu tvl gil mah pau
  wls rar hif`.split(/\s+/)

/** The language the menus open on */
const DEFAULT = 'cmn'

/**
 * The tag a translator is sent: SIL's two-letter code where the language has one, else its own code; these differ, each
 * a product decision the contract fixture holds (an individual language sent as its macrolanguage's code, Traditional
 * Chinese as Taiwan's, Jawi Malay by its script, measured against the engines: tests/config/languages.test.ts:31-46)
 */
const TAG: Record<string, string> = {
  cmn: 'zh', 'cmn-Hant': 'zh-TW', arb: 'ar', pes: 'fa', swh: 'sw', fuv: 'ff', uzn: 'uz', zsm: 'ms', zlm: 'ms-Arab', npi: 'ne',
  azj: 'az', run: 'run', ekk: 'et', lvs: 'lv', ydd: 'yi',
}

/**
 * The script a language is asked for in, where it is not its usual one: its English name says it (UI.md §6 l.529-530,
 * "parentheses naming a script stay"; tests/config/languages.test.ts:42 "Malay ... (Arabic)") and CLDR names it in it
 * (scripts/language-names.ts:11-13)
 */
const SCRIPT: Record<string, string> = { bos: 'Cyrl', srp: 'Cyrl', uzn: 'Cyrl', azj: 'Cyrl', zlm: 'Arab' }

/** ISO 639-1 codes the old table gave two languages whose tag keeps its own (tests/config/languages.test.ts:37-41) */
const ISO1_ALSO: Record<string, string> = { yue: 'zh', ckb: 'ku' }

type Table = 'en' | 'zh' | 'own'
/** The product's own words, each with where it is fixed */
const OWN: Record<Table, Record<string, [word: string, fixedBy: string]>> = {
  en: {
    cmn: ['Simplified Mandarin Chinese', 'tests/config/languages.test.ts:22, tests/ui/language-names.test.ts:24, DESIGN §8.2'],
    'cmn-Hant': ['Traditional Mandarin Chinese', 'tests/config/languages.test.ts:23'],
    arb: ['Standard Arabic', 'tests/ui/language-names.test.ts:25'],
    nso: ['Northern Sotho', 'UI.md §6 (directional words stay), tests/ui/language-names.test.ts:34'],
  },
  zh: {
    ckb: ['库尔德语（索拉尼）', 'UI.md §6 (the label 库尔德语（索拉尼、…）), tests/ui/language-names.test.ts:61'],
    zlm: ['马来语（爪夷文）', 'tests/ui/language-names.test.ts:61'],
  },
  own: {
    ind: ['Bahasa Indonesia', 'PDF-READER.md §6.7 (the reader\'s menu), tests/pdf-reader/ui/languages.test.ts:17'],
    zsm: ['Bahasa Melayu', 'PDF-READER.md §6.7, tests/pdf-reader/ui/languages.test.ts:17'],
    zlm: ['بهاس ملايو', 'tests/ui/language-names.test.ts:61'],
  },
}

/**
 * Words fixed by no document and no test that differ from the sources: the old table's word or the source's, the
 * maintainer's to rule (lane L10's record lists both for each). Empty, the script writes the table
 */
const PENDING: Record<Table, string[]> = {
  en: 'ben jav pes swh pan fuv uzn zsm zlm npi tgl azj ell plt zyb pbu mri ydd oss bcl tvl'.split(' '),
  zh: 'ind kan skr tgl koi mag run plt qug nya kin hms hnj nno ina tir aka dzo bcl bjn wls hif'.split(' '),
  own: `jav mya fuv yor ibo skr tgl azj koi mag plt qug mad nya zyb kin zul som hms ilo cos div fij grn hat hye khm lao
    lat mri san smo tah tat tuk xho bam bod chv ssw ven war nbl pam hil bcl min ace bug ban bjn mak tet cha niu tvl gil
    mah pau rar hif nde sna kat wls`.split(/\s+/),
}

const sil = new Map<string, { part1: string; name: string }>()
for (const line of readFileSync('scripts/data/iso-639-3.tab', 'utf8').split('\n').slice(1)) {
  const cells = line.split('\t')
  if (cells[0]) sil.set(cells[0], { part1: cells[3] ?? '', name: cells[6] ?? '' })
}

const base = (code: string) => code.replace(/-Hant$/, '')
const row = (code: string) => {
  const found = sil.get(base(code))
  if (!found) throw new Error(`${code}: no row in scripts/data/iso-639-3.tab`)
  return found
}
const tagOf = (code: string) => TAG[code] ?? (row(code).part1 || code)
/** The tag CLDR is asked for: Chinese by its script, a script note's language in that script */
const askOf = (code: string) => (code === 'cmn' ? 'zh-Hans' : code === 'cmn-Hant' ? 'zh-Hant' : SCRIPT[code] ? `${tagOf(code).split('-')[0]}-${SCRIPT[code]}` : tagOf(code))
/** The language alone, the name CLDR gives it whatever the script (Chinese keeps its script: two entries) */
const languageOf = (code: string) => (code.startsWith('cmn') ? askOf(code) : tagOf(code).split('-')[0]!)

const scriptNames = new Intl.DisplayNames('en', { type: 'script' })
const enNames = new Intl.DisplayNames('en', { type: 'language', fallback: 'none' })
const zhNames = new Intl.DisplayNames('zh-Hans', { type: 'language', fallback: 'none' })
const source: Record<Table, (code: string) => string | undefined> = {
  // CLDR's English name, ISO 639-3's reference name where CLDR has none; a script note after it
  en: code => {
    const name = enNames.of(languageOf(code)) ?? row(code).name
    return SCRIPT[code] ? `${name} (${scriptNames.of(SCRIPT[code])})` : name
  },
  zh: code => zhNames.of(languageOf(code)),
  // a name in a menu starts with a capital where its script has one (CLDR writes most in lower case: español)
  own: code => {
    const name = new Intl.DisplayNames(askOf(code), { type: 'language', fallback: 'none' }).of(languageOf(code))
    return name && name.charAt(0).toLocaleUpperCase(askOf(code)) + name.slice(1)
  },
}

const waiting: string[] = []
const names: Record<Table, Record<string, string>> = { en: {}, zh: {}, own: {} }
for (const table of ['en', 'zh', 'own'] as const) {
  for (const code of CODES) {
    const own = OWN[table][code]
    const word = own ? own[0] : PENDING[table].includes(code) ? undefined : source[table](code)
    if (word === undefined) { waiting.push(`${table} ${code} (source: ${source[table](code) ?? 'none'})`); continue }
    names[table][code] = word
  }
}
if (waiting.length) {
  console.error(`${waiting.length} names wait for the maintainer's ruling, nothing written:\n  ${waiting.join('\n  ')}`)
  process.exit(1)
}

const rtl = CODES.filter(code => {
  const locale = new Intl.Locale(askOf(code)) as Intl.Locale & { getTextInfo?: () => { direction: string }; textInfo?: { direction: string } }
  return (locale.getTextInfo?.() ?? locale.textInfo)?.direction === 'rtl'
})
const iso1 = Object.fromEntries([
  ...CODES.filter(code => /^[a-z]{2}(-|$)/.test(tagOf(code))).map(code => [code, tagOf(code)]),
  ...Object.entries(ISO1_ALSO),
].sort(([a], [b]) => CODES.indexOf(a!) - CODES.indexOf(b!)))

const object = (entries: Record<string, string>) => `{\n${Object.entries(entries).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n')}\n}`
const { icu, cldr } = process.versions as Record<string, string>
writeFileSync(OUT, `// Generated by scripts/languages.ts: edit the script and run it, not this file. The codes from the ISO 639-3 code set
// (source of the codes: iso639-3.sil.org; scripts/data/iso-639-3.NOTICE.txt), the names from Unicode CLDR ${cldr} (ICU
// ${icu}, Node ${process.version}; Unicode License v3), ISO 639-3's reference name in English where CLDR has none. Not
// part of the standard: the order, the tags, the script notes and the product's own words (the script's OWN table).
export const LANG_CODES = ${JSON.stringify(CODES)} as const
export type LangCode = (typeof LANG_CODES)[number]
export const DEFAULT_LANG_CODE: LangCode = ${JSON.stringify(DEFAULT)}
/** the tag each language is sent to a translator as */
export const TAGS: Record<LangCode, string> = ${object(Object.fromEntries(CODES.map(code => [code, tagOf(code)])))}
export const RTL_CODES: readonly LangCode[] = ${JSON.stringify(rtl)}
/** the tag of each language sent by its ISO 639-1 code (its macrolanguage's for an individual language), and the two whose tag keeps its own code by their ISO 639-1 code */
export const ISO_639_1: Partial<Record<LangCode, string>> = ${object(iso1)}
/** the English names (the prompt's): CLDR's, ISO 639-3's reference name where CLDR has none */
export const EN_NAMES: Record<LangCode, string> = ${object(names.en)}
export const ZH_NAMES: Record<LangCode, string> = ${object(names.zh)}
/** each language's name in itself */
export const OWN_NAMES: Record<LangCode, string> = ${object(names.own)}
`)
console.log(`wrote ${OUT}`)
