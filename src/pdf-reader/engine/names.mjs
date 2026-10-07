// Whether a short text — a figure's label, a table's cell — is only a name (a dataset, a model, a method), judged
// against the paper's own prose. The candidate for the extension's shared module: the evidence is an index built
// once from the prose, so a figure of fifty labels costs set lookups, not fifty scans of the paper.

/**
 * The prose's evidence: `lower`, every word the prose writes in lower case; `proper`, every capitalised word it sets
 * as a proper noun — in the middle of a sentence (after a lower-case letter or `, ; : ) ]` and a space), or as the
 * head of a longer name (Beaver in BeaverTails).
 */
export function nameEvidence(prose) {
  const lower = new Set(), proper = new Set()
  for (const m of prose.matchAll(/[A-Za-z]+/g)) {
    const run = m[0], at = m.index
    if (!/[A-Z]/.test(run)) { lower.add(run); continue }
    // the heads of a run at its inner capitals (BeaverTails → Beaver), each a proper noun's evidence
    for (const k of run.slice(1).matchAll(/[A-Z]/g)) proper.add(run.slice(0, k.index + 1))
    if (prose[at - 1] === ' ' && /[a-z,;:)\]]/.test(prose[at - 2] ?? '')) proper.add(run)
  }
  return { lower, proper }
}

/**
 * At most three words, each of them a name: one with a digit (GSM8K, v0, 4x4), a lone letter or punctuation, or a
 * word in capitals (ASR), with an inner capital (WikiText) or with only its first capital (Aegis) that the prose never
 * writes in lower case — the prose writing it so says it is a word set in capitals or title case (INPUT, Score); a
 * word with only its first capital is a name only where the prose also treats it as one (… and Aegis [16]), for a
 * heading's word (Compute) is written in lower case nowhere either.
 */
export function isName(text, { lower, proper }) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  if (words.length > 3) return false
  return words.every(word => {
    const bare = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')
    if (bare.length <= 1 || /[0-9]/.test(bare)) return true
    if (/[a-z]/.test(bare) && !/[A-Z]/.test(bare)) return false
    // every run of letters written in lower case by the prose: a word, whatever case the label sets it in (lone
    // letters say nothing: C(τ)/∑S is no word)
    const runs = (bare.match(/[A-Za-z]+/g) ?? []).filter(r => r.length > 1)
    if (runs.length && runs.every(r => lower.has(r.toLowerCase()))) return false
    if (/^[A-Z][a-z]+$/.test(bare)) return proper.has(bare)
    return true
  })
}
