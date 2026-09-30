// Throwaway source/cache preparation; source-native opaque elements never pass through a math renderer.
const group = /^\\(?:emph|textbf|textit|textrm|textsf|texttt|text|mbox)\{$/
const benign = /^(?:~|\\label\{[^}]*\}|\\(?:noindent|bf|bfseries|it|itshape|em|small|par)|\\vspace\*?\{[^}]*\})$/
export function atomKind(src) {
  if (/^\\(?:cite\w*|ref|eqref|pageref|autoref|[cC]ref)\*?(?:\[[^\]]*\])*\{[^{}]+\}$/.test(src)) return /^\\cite/.test(src) ? 'citation' : 'reference'
  if ((/^\$(?!\$)[\s\S]+\$$/.test(src) || /^\\\([\s\S]+\\\)$/.test(src)) && !/\n|\$\$|\\(?:frac|dfrac|tfrac|sqrt|begin|over|under|atop|left|right|text|mbox|hat|tilde|bar|vec|dot|breve|check)/.test(src)) return 'inline-math'
  return null
}

export function preparePieces(source, translated, decodeSource) {
  const opaque = pieces => pieces.filter(p => p.t !== 'text').map(p => [p.t, p.src ?? null])
  const integrity = !!translated && JSON.stringify(opaque(source)) === JSON.stringify(opaque(translated))
  const atoms = [], sourceRuns = [], runs = [], stack = []
  let reason = null, declaration = {}, next = 0
  const text = p => (p.tr ? p.s.replace(/\\(textbackslash|textasciitilde|textasciicircum)\{\}/g, ' ').replace(/\\([#$%&_{}])/g, '$1') : decodeSource(p.s)).replace(/\s+/g, ' ')
  const append = value => {
    const last = sourceRuns.at(-1)
    if (last?.text !== undefined) last.text += value
    else sourceRuns.push({ text: value })
  }
  for (const p of source) {
    if (p.t === 'text') append(text(p))
    else if (p.t === 'ph' && atomKind(p.src)) {
      const atom = { id: atoms.length, kind: atomKind(p.src), source: p.src }
      atoms.push(atom); sourceRuns.push({ atom: atom.id })
    } else if (p.t === 'ph' && benign.test(p.src)) { if (p.src === '~') append(' ') }
    else if (p.t === 'open' && group.test(p.src) || p.t === 'close') { /* formatting has no source-native atom */ }
    else reason ??= p.t === 'nested' ? 'nested-unit' : 'unsupported-source-structure'
  }
  if (!integrity) reason ??= translated ? 'cache-opaque-integrity' : 'no-cached-translation'
  for (const p of translated ?? []) {
    if (p.t === 'open') stack.push({ bold: /textbf/.test(p.src), italic: /emph|textit/.test(p.src), mono: /texttt/.test(p.src), savedDeclaration: declaration })
    else if (p.t === 'close') declaration = stack.pop()?.savedDeclaration ?? declaration
    else if (p.t === 'ph') {
      if (atomKind(p.src)) runs.push({ atom: next++ })
      else {
        if (/^\\(?:bf|bfseries)$/.test(p.src)) declaration = { ...declaration, bold: true }
        if (/^\\(?:it|itshape|em)$/.test(p.src)) declaration = { ...declaration, italic: true }
        if (p.src === '~') runs.push({ text: ' ' })
      }
    } else if (p.t === 'text') runs.push({ text: text(p), bold: declaration.bold || stack.some(s => s.bold), italic: declaration.italic || stack.some(s => s.italic), mono: stack.some(s => s.mono) })
  }
  return { atoms, sourceRuns, runs, integrity, unsupportedReason: reason, protectedContent: !!reason }
}
