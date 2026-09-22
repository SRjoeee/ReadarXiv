// Whether a short text — a label in a figure — is only a name: a dataset, a model, a method (DESIGN §15.1). A free
// engine translates each of a figure's boxes on its own, and a name alone comes back as other words — Mooncake →
// 月饼, HellaSwag → 地狱之战, (a) Llama3 → （a） 呼叫3. Judged against the paper's own prose, the one authority on what
// the paper names; the evidence is an index built once from it, so a figure of fifty labels costs set lookups, not
// fifty scans of the paper.

export interface NameEvidence {
  /** Every word the prose writes in lower case */
  lower: ReadonlySet<string>
  /**
   * Every capitalised word the prose sets as a proper noun: in the middle of a sentence (after a lower-case letter or
   * `, ; : ) ]` and a space), or as the head of a longer name (Beaver in BeaverTails)
   */
  proper: ReadonlySet<string>
}

/** One pass over the prose's runs of Latin letters: arXiv's prose is English, and a word with an accent is never asked about */
export function nameEvidence(prose: string): NameEvidence {
  const lower = new Set<string>()
  const proper = new Set<string>()
  for (const m of prose.matchAll(/[A-Za-z]+/g)) {
    const run = m[0]
    const at = m.index
    if (!/[A-Z]/.test(run)) {
      lower.add(run)
      continue
    }
    // The heads of a run at its inner capitals (BeaverTails → Beaver)
    for (const k of run.slice(1).matchAll(/[A-Z]/g)) proper.add(run.slice(0, k.index + 1))
    if (prose[at - 1] === ' ' && /[a-z,;:)\]]/.test(prose[at - 2] ?? '')) proper.add(run)
  }
  return { lower, proper }
}

/**
 * At most three words, each of them a name: one with a digit (GSM8K, v0, 4x4), a lone letter or punctuation (the
 * `(a)` of a panel), or a word in capitals (ASR), with an inner capital (WikiText) or with only its first capital
 * (Aegis) whose letters the prose never writes in lower case — written so, it is a word set in capitals or title case
 * (INPUT, TimeStep, Score). A word with only its first capital is a name only where the prose also treats it as one
 * (… and Aegis [16]): a heading's word (Compute) is written in lower case nowhere either.
 *
 * Measured on the vector figures of 112 papers, their boxes sent one by one to Microsoft's engine, each box this
 * keeps that the engine changed read by hand as a name or a word: 319 names and 70 words of 3 366 boxes into Chinese,
 * 329 and 64 into Japanese, 116 and 38 into German. The words it keeps are mostly ones a reader takes in English as
 * well — a country, EEG, `Table` in a paper that never writes the word in lower case; the names it keeps had been
 * turned into other words.
 */
export function isName(text: string, { lower, proper }: NameEvidence): boolean {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  if (words.length > 3) return false
  return words.every(word => {
    const bare = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')
    if (bare.length <= 1 || /[0-9]/.test(bare)) return true
    if (!/[A-Z]/.test(bare)) return false
    // Lone letters say nothing: C(τ)/∑S is no word
    const runs = (bare.match(/[A-Za-z]+/g) ?? []).filter(run => run.length > 1)
    if (runs.length > 0 && runs.every(run => lower.has(run.toLowerCase()))) return false
    return /^[A-Z][a-z]+$/.test(bare) ? proper.has(bare) : true
  })
}
