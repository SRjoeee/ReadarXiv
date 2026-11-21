// Writes src/config/language-table.ts under the naming policy of UI.md §6 ("Language names: one policy"): the target
// languages (which, in what order: a product decision), the BCP 47 tag each is sent as, which are written right to left,
// and their names — in English (the menu's and the prompt's, one word), in Simplified Chinese, and in the language's own
// (the native column). Names are Unicode CLDR's, read through the running Node's Intl; where CLDR has none or its word is
// not the common form, the override table OWN gives the word with its public source. The codes and two-letter codes are
// SIL's ISO 639-3 table (scripts/data/iso-639-3.tab and its notice). Run with `pnpm tsx scripts/languages.ts` and review
// the diff; tests/contract/no-gpl.test.ts holds the codes, tags, right-to-left set and default to what they were.
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
/**
 * The override table: a word the policy takes from elsewhere than CLDR's plain word, each with its source. English:
 * CLDR has no name for three (ISO 639-3's reference name) and Jawi Malay is named by its script's own name. Chinese:
 * Jawi Malay likewise. Own names: where CLDR has no autonym (44 languages, and Dari, which CLDR files under Persian), the
 * native name of the language's English Wikipedia article (fetched 2026-11-07), its spelling kept; three product words
 * the reader's menu has always shown, sourced the same way. Spellings are the sources'; the first letter's capital is
 * the menu's (ownCase below)
 */
const OWN: Record<Table, Record<string, [word: string, source: string]>> = {
  en: {
    zlm: ['Malay (Jawi)', 'UI.md §6 (a script note names the writing; Jawi is Malay\'s name for its Arabic script), tests/ui/language-names.test.ts:36'],
    skr: ['Saraiki', 'ISO 639-3 reference name (scripts/data/iso-639-3.tab); CLDR has no English name'],
    hms: ['Southern Qiandong Miao', 'ISO 639-3 reference name (scripts/data/iso-639-3.tab); CLDR has no English name'],
    wls: ['Wallisian', 'ISO 639-3 reference name (scripts/data/iso-639-3.tab); CLDR has no English name'],
  },
  zh: {
    zlm: ['马来语（爪夷文）', 'UI.md §6 (the script note), tests/ui/language-names.test.ts:71'],
  },
  own: {
    ind: ['bahasa Indonesia', 'https://en.wikipedia.org/wiki/Indonesian_language — its infobox\'s native name; CLDR\'s "Indonesia" names the country out of context (PDF-READER.md §6.7, tests/pdf-reader/ui/languages.test.ts:17)'],
    zsm: ['bahasa Melayu', 'https://en.wikipedia.org/wiki/Malaysian_Malay — "Bahasa Melayu Malaysia", the name without the country, as the reader\'s menu has it (PDF-READER.md §6.7, tests/pdf-reader/ui/languages.test.ts:17)'],
    zlm: ['بهاس ملايو', 'https://en.wikipedia.org/wiki/Malaysian_Malay — the same name in Jawi, "بهاس ملايو مليسيا" without the country (tests/ui/language-names.test.ts:63); CLDR has Malay only in Latin letters'],
    prs: ['دری', "https://en.wikipedia.org/wiki/Dari — Dari is not Persian: CLDR's fa-AF names it فارسی"],
    skr: ['سرائیکی', 'https://en.wikipedia.org/wiki/Saraiki_language'],
    koi: ['перем коми кыв', "https://en.wikipedia.org/wiki/Komi-Permyak_language — the second of its two names, the one the language's own use gives (perem komi kyv)"],
    mag: ['मगही', 'https://en.wikipedia.org/wiki/Magahi_language'],
    hnj: ['lug Moob', 'https://en.wikipedia.org/wiki/Hmong_language — the Hmong Njua name ({{lang|hnj|…}}) of the article on Hmong'],
    div: ['ދިވެހި', 'https://en.wikipedia.org/wiki/Maldivian_language'],
    hif: ['फ़िजी हिंदी', 'https://en.wikipedia.org/wiki/Fiji_Hindi'],
    qug: ['Quichua', 'https://en.wikipedia.org/wiki/Chimborazo_Highland_Quichua'],
    mad: ['Bhâsa Madhurâ', 'https://en.wikipedia.org/wiki/Madurese_language'],
    nya: ['Chicheŵa', 'https://en.wikipedia.org/wiki/Chewa_language'],
    hms: ['hveb Hmub', 'https://en.wikipedia.org/wiki/Hmu_language'],
    ilo: ['Ilóko', 'https://en.wikipedia.org/wiki/Ilocano_language'],
    cos: ['corsu', 'https://en.wikipedia.org/wiki/Corsican_language'],
    fij: ['Vosa Vaka-Viti', 'https://en.wikipedia.org/wiki/Fijian_language'],
    grn: ['avañeʼẽ', "https://en.wikipedia.org/wiki/Guarani_language — the article on (Paraguayan) Guarani: the macrolanguage's article names a family; its apostrophe is the puso, U+02BC"],
    hat: ['kreyòl ayisyen', 'https://en.wikipedia.org/wiki/Haitian_Creole'],
    ido: ['Ido', 'https://en.wikipedia.org/wiki/Ido'],
    lat: ['lingua Latina', 'https://en.wikipedia.org/wiki/Latin'],
    smo: ['Gagana faʻa Sāmoa', 'https://en.wikipedia.org/wiki/Samoan_language'],
    tah: ['reo Tahiti', 'https://en.wikipedia.org/wiki/Tahitian_language'],
    vol: ['Volapük', 'https://en.wikipedia.org/wiki/Volapük'],
    bis: ['Bislama', 'https://en.wikipedia.org/wiki/Bislama'],
    ssw: ['siSwati', 'https://en.wikipedia.org/wiki/Swazi_language'],
    ven: ['Tshivenḓa', 'https://en.wikipedia.org/wiki/Venda_language'],
    war: ['Winaray', 'https://en.wikipedia.org/wiki/Waray_language'],
    nbl: ['isiNdebele seSewula', 'https://en.wikipedia.org/wiki/Southern_Ndebele_language'],
    pam: ['Amánung Kapangpángan', 'https://en.wikipedia.org/wiki/Kapampangan_language'],
    hil: ['Hiniligaynon', 'https://en.wikipedia.org/wiki/Hiligaynon_language'],
    bcl: ['Bikol Sentral', 'https://en.wikipedia.org/wiki/Central_Bikol'],
    min: ['Bahaso Minangkabau', 'https://en.wikipedia.org/wiki/Minangkabau_language'],
    ace: ['Bahsa Acèh', 'https://en.wikipedia.org/wiki/Acehnese_language'],
    bug: ['Basa Ugi', 'https://en.wikipedia.org/wiki/Buginese_language'],
    ban: ['Basa Bali', 'https://en.wikipedia.org/wiki/Balinese_language'],
    bjn: ['Basa Banjar', 'https://en.wikipedia.org/wiki/Banjarese_language'],
    mak: ['Basa Mangkasaraʼ', 'https://en.wikipedia.org/wiki/Makassarese_language'],
    sas: ['Base Sasaq', 'https://en.wikipedia.org/wiki/Sasak_language'],
    tet: ['Tetun', 'https://en.wikipedia.org/wiki/Tetun_language'],
    cha: ['Finuʼ Chamorro', 'https://en.wikipedia.org/wiki/Chamorro_language'],
    niu: ['vagahau Niuē', 'https://en.wikipedia.org/wiki/Niuean_language — "ko e vagahau Niuē", the name without its article'],
    tvl: ['Te Ggana Tuuvalu', 'https://en.wikipedia.org/wiki/Tuvaluan_language'],
    gil: ['Taetae ni Kiribati', 'https://en.wikipedia.org/wiki/Kiribati_language'],
    mah: ['Kajin Ṃajeḷ', 'https://en.wikipedia.org/wiki/Marshallese_language'],
    pau: ['a tekoi er a Belau', 'https://en.wikipedia.org/wiki/Palauan_language'],
    wls: ['Fakaʻuvea', 'https://en.wikipedia.org/wiki/Wallisian_language'],
    rar: ['Māori Kūki ʻĀirani', 'https://en.wikipedia.org/wiki/Cook_Islands_Māori'],
  },
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
/** The entry as CLDR is asked for it: Chinese by its script, an entry with a script note in that script */
const askOf = (code: string) => (code === 'cmn' ? 'zh-Hans' : code === 'cmn-Hant' ? 'zh-Hant' : SCRIPT[code] ? `${tagOf(code).split('-')[0]}-${SCRIPT[code]}` : tagOf(code))
/** The language alone (Chinese keeps its script: two entries) */
const languageOf = (code: string) => (code.startsWith('cmn') ? askOf(code) : tagOf(code).split('-')[0]!)

const enNames = new Intl.DisplayNames('en', { type: 'language', fallback: 'none' })
const zhNames = new Intl.DisplayNames('zh-Hans', { type: 'language', fallback: 'none' })
/**
 * CLDR's autonym, or nothing: asked of a locale CLDR has no data for, Intl answers in English and says so in its resolved
 * locale. Where the product sends another code than CLDR's for the same language (tgl, run, plt, zyb, pbu), CLDR's own
 * code (its alias data, Intl.getCanonicalLocales) is asked too
 */
function autonym(code: string): string | undefined {
  for (const locale of new Set([askOf(code), Intl.getCanonicalLocales(askOf(code))[0]!])) {
    const names = new Intl.DisplayNames(locale, { type: 'language', fallback: 'none' })
    const language = code.startsWith('cmn') ? locale : locale.split('-')[0]!
    if (names.resolvedOptions().locale.split('-')[0] === language.split('-')[0]) {
      const name = names.of(language)
      if (name) return name
    }
  }
  return undefined
}
/** A menu entry's first letter is a capital (CLDR writes most autonyms in lower case: español), unless the name's own capitals start later (isiZulu, siSwati) */
const ownCase = (name: string, locale: string) => (/^\p{Ll}+\p{Lu}/u.test(name) ? name : name.charAt(0).toLocaleUpperCase(locale) + name.slice(1))

const source: Record<Table, (code: string) => string | undefined> = {
  // CLDR's English name of the entry as offered (a script note as CLDR writes it: Uzbek (Cyrillic))
  en: code => enNames.of(askOf(code)),
  // CLDR's Chinese name; where it has none, the English one, as an interface with no name for a language reads English
  zh: code => zhNames.of(askOf(code)) ?? names.en[code],
  own: code => autonym(code),
}

const missing: string[] = []
const names: Record<Table, Record<string, string>> = { en: {}, zh: {}, own: {} }
for (const table of ['en', 'zh', 'own'] as const) {
  for (const code of CODES) {
    const word = OWN[table][code]?.[0] ?? source[table](code)
    if (word === undefined) { missing.push(`${table} ${code}`); continue }
    names[table][code] = table === 'own' ? ownCase(word, askOf(code)) : word
  }
}
if (missing.length) {
  console.error(`no word for: ${missing.join(', ')} — nothing written`)
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
