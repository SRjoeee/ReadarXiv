// tex-names.mjs's types: the names TeX's packages give a theorem-like head and a generated reference in a target
/** a theorem-like head's name in the target (translator's dictionary; ctex's for Chinese), or null */
export declare function headName(english: string, to: string, names?: ReadonlyMap<string, string> | null): string | null
/** a generated reference's English name in the target: its head's, else cleveref's or hyperref's (ctex's for Chinese), else
 *  babel's name of its counter type (`labels`, the layout rules' labels: every form in a target whose names do not inflect,
 *  the singular alone in one that does), or null */
export declare function refName(english: string, to: string, labels?: Readonly<Record<string, string>> | null, names?: ReadonlyMap<string, string> | null): string | null
/** a generated reference's text in the target's names: the replacements [start, end, word] in order, an empty list where it holds
 *  no name, null where any part has no word in the target */
export declare function refInTarget(text: string, to: string, labels?: Readonly<Record<string, string>> | null, names?: ReadonlyMap<string, string> | null): [start: number, end: number, word: string][] | null
/** a theorem-like head as TeX set it in the target: its name in translator's word, its number and punctuation kept, or null */
export declare function headInTarget(text: string, to: string, names?: ReadonlyMap<string, string> | null): string | null
/** the words no package names in some target the readers offer (cleveref's types' English singulars), which a paper that generates
 *  references sends to the translator as name units */
export declare const NAME_GAPS: readonly string[]
/** the commands whose text a cross-referencing package generates (cleveref's, \autoref) */
export declare const GENERATED_COMMANDS: readonly string[]
/** the conjunctions' words no package names in some target ("and", "to") */
export declare const CONJUNCTION_GAPS: readonly string[]
