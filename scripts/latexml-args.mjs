// Generates src/pdf-reader/engine/latexml-args.mjs: each control sequence's and environment's arguments as LaTeXML's
// bindings declare them, by type (its prototypes: \rule[Dimension]{Dimension}{Dimension}, \setlength{Variable}{Dimension},
// \IfFileExists{}{}{}), and the front matter's commands, by the hook their expansion hands their text to
// (\lx@add@affiliation, \lx@add@contact[role=dedicatory]{#1} …). The engine reads it through arg-roles.mjs.
//
//   node scripts/latexml-args.mjs <LaTeXML checkout> [out]
//
// The checkout is brucemiller/LaTeXML (public domain; docs/THIRD_PARTY.md), cloned into reference/LaTeXML, which the
// repository does not hold. Only names a paper may write are kept: none with an @, none LaTeXML defines for math alone
// (DefMath), none built at run time ("\\$name"). Where bindings declare one name differently, the engine pools' wins (the
// kernel's, which every paper has); otherwise a name the bindings disagree on keeps every form, and the reader takes none
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve as resolvePath } from 'node:path'

const root = process.argv[2]
if (!root) { console.error('usage: node scripts/latexml-args.mjs <LaTeXML checkout> [out]'); process.exit(2) }
const out = process.argv[3] ?? new URL('../src/pdf-reader/engine/latexml-args.mjs', import.meta.url).pathname
const lib = join(root, 'lib/LaTeXML')
let commit = 'unknown'
try { commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD']).toString().trim() } catch {}

// ---------------------------------------------------------------- a small Perl lexer: strings and code, comments out
/** the file as tokens: { s } a string's decoded value (quotes, q{}, heredocs), { c } one character of code */
function lex(text) {
  const toks = [], n = text.length
  let i = 0, pending = []
  const code = c => toks.push({ c })
  while (i < n) {
    const c = text[i]
    if (c === '\n' && pending.length) {
      let j = i + 1
      for (const tag of pending) {
        const lines = []
        while (j < n) { let e = text.indexOf('\n', j); if (e < 0) e = n; const line = text.slice(j, e); j = e + 1; if (line.trim() === tag) break; lines.push(line) }
        toks.push({ s: lines.join('\n') })
      }
      pending = []; i = j; code(';'); continue
    }
    if (c === '#') { if (text[i - 1] === '$') { code(c); i++; continue } const e = text.indexOf('\n', i); i = e < 0 ? n : e; continue }
    if (c === '=' && (i === 0 || text[i - 1] === '\n') && /^=(?:pod|head\d|over|item|begin|for)\b/.test(text.slice(i, i + 8))) { const e = text.indexOf('\n=cut', i); i = e < 0 ? n : (text.indexOf('\n', e + 1) + 1 || n); continue }
    if (c === '<' && text[i + 1] === '<') {
      const m = /^<<\s*(?:'([A-Za-z_]\w*)'|"([A-Za-z_]\w*)"|([A-Za-z_]\w*))/.exec(text.slice(i, i + 40))
      if (m) { pending.push(m[1] ?? m[2] ?? m[3]); i += m[0].length; continue }
    }
    if (c === "'" || c === '"') {
      let j = i + 1, buf = ''
      while (j < n && text[j] !== c) {
        if (text[j] === '\\' && j + 1 < n) {
          const x = text[j + 1]
          if (c === "'") { buf += x === '\\' || x === "'" ? x : `\\${x}`; j += 2; continue }
          buf += { n: '\n', t: '\t' }[x] ?? x; j += 2; continue
        }
        buf += text[j++]
      }
      toks.push({ s: buf }); i = j + 1; continue
    }
    if (c === 'q' && !/[\w$@%]/.test(text[i - 1] ?? '')) {
      const m = /^(qq|qw|q)\s*([{([<|/!])/.exec(text.slice(i, i + 6))
      if (m) {
        const open = m[2], close = { '{': '}', '(': ')', '[': ']', '<': '>' }[open] ?? open
        let j = i + m[0].length, depth = 1
        const start = j
        while (j < n && depth) { if (text[j] === '\\') { j += 2; continue } if (text[j] === open && open !== close) depth++; else if (text[j] === close) depth--; j++ }
        toks.push({ s: text.slice(start, j - 1) }); i = j; continue
      }
    }
    if ((c === '=' || c === '!') && text[i + 1] === '~') {
      code(c); code('~')
      let j = i + 2
      while (j < n && /[ \t]/.test(text[j])) j++
      const m = /^(s|tr|y|m|qr)?\s*([/{|#!([])/.exec(text.slice(j, j + 5))
      if (m) {
        const d = m[2], cl = { '{': '}', '(': ')', '[': ']' }[d] ?? d
        let k = j + m[0].length
        const parts = ['s', 'tr', 'y'].includes(m[1]) ? 2 : 1
        for (let p = 0; p < parts; p++) {
          let depth = 1
          while (k < n && depth) { if (text[k] === '\\') { k += 2; continue } if (text[k] === d && d !== cl) depth++; else if (text[k] === cl) depth--; k++ }
          if (parts === 2 && cl !== d) { while (k < n && /\s/.test(text[k])) k++; if (text[k] === d) k++ }
        }
        while (k < n && /[a-z]/.test(text[k])) k++
        i = k; continue
      }
      i = j; continue
    }
    code(c); i++
  }
  return toks
}

// ---------------------------------------------------------------- definition calls
const CALLS = ['DefMacro', 'DefMacroI', 'DefConstructor', 'DefConstructorI', 'DefPrimitive', 'DefPrimitiveI', 'DefEnvironment', 'DefEnvironmentI', 'DefRegister', 'DefRegisterI', 'DefMath', 'DefMathI']
/** each call's arguments up to its closing parenthesis, split at the commas (and =>) outside any bracket: an argument
 *  is its tokens */
function calls(toks) {
  const found = []
  for (let k = 0; k < toks.length; k++) {
    if (!toks[k].c || !/[A-Z]/.test(toks[k].c) || /[\w$]/.test(toks[k - 1]?.c ?? '')) continue
    let name = '', j = k
    while (j < toks.length && toks[j].c && /\w/.test(toks[j].c)) name += toks[j++].c
    if (!CALLS.includes(name)) { k = j - 1; continue }
    while (j < toks.length && toks[j].c && /\s/.test(toks[j].c)) j++
    if (toks[j]?.c !== '(') continue
    const args = [[]]
    let depth = 0
    for (j++; j < toks.length; j++) {
      const t = toks[j]
      if (t.c === '(' || t.c === '[' || t.c === '{') depth++
      else if (t.c === ')' || t.c === ']' || t.c === '}') { if (depth === 0) break; depth-- }
      if (depth === 0 && (t.c === ',' || (t.c === '=' && toks[j + 1]?.c === '>'))) { if (t.c === '=') j++; args.push([]); continue }
      args.at(-1).push(t)
    }
    found.push({ call: name, args })
    k = j
  }
  return found
}
const strOf = arg => { const ts = arg.filter(t => !(t.c && /\s/.test(t.c))); return ts.length === 1 && ts[0].s !== undefined ? ts[0].s : null }
/** T_CS('\name') or a plain string: the control sequence an I-form call defines */
const csOf = arg => {
  const s = strOf(arg)
  if (s !== null) return s
  const ts = arg.filter(t => !(t.c && /\s/.test(t.c)))
  const code = ts.map(t => t.c ?? '\0').join('')
  return /^T_CS\(\0\)$/.test(code) ? ts.find(t => t.s !== undefined).s : null
}
const isUndef = arg => arg.filter(t => t.c && /\S/.test(t.c)).map(t => t.c).join('') === 'undef'

// ---------------------------------------------------------------- parameters
/**
 * A parameter's role and how it is read, by its type. Roles: `a` an argument LaTeXML leaves untyped (text or a name,
 * it does not say; a digested one is not always typeset where it stands), `c` a box's content, set where it stands,
 * `d` a dimension, glue or number, `k` keys and values, `n` a name (a
 * label, a file, a URL, verbatim), `r` a register or a control sequence, `x` code (a definition's body, tokens read
 * unexpanded), `m` a math style's argument, `s` a literal or nothing (=, *, spaces). Shapes: `{` a brace group or a
 * single token, `[` optional brackets, `*` an optional star, `_` TeX's own syntax for the type (a number, a dimension,
 * glue with plus and minus, one token, a keyword's value), `u` tokens up to a delimiter, `b` up to a brace
 */
const TYPE_ROLE = {
  Plain: 'a', Digested: 'a', DigestedBody: 'a', TextStyle: 'a', DigestUntil: 'a', GeneralText: 'x', XGeneralText: 'x',
  HBoxContents: 'c', VBoxContents: 'c', PBoxContents: 'c', MoveableBox: 'c', SVGMoveableBox: 'c',
  Dimension: 'd', Glue: 'd', MuDimension: 'd', MuGlue: 'd', Number: 'd', Float: 'd', NumExpr: 'd', DimExpr: 'd', GlueExpr: 'd', MuExpr: 'd', Length: 'd', Pair: 'd', RoundParenFloat: 'd', pgfNumber: 'd', pgfNumbers: 'd', Intarray: 'd', GraphixDimension: 'd', GraphixDimensions: 'd', PSCoord: 'd', PSDimension: 'd', PSAngle: 'd', PSDimFloat: 'd', PSDimDim: 'd', PSOrigin: 'd', OptionalPSCoord: 'd', ZeroPSCoord: 'd', BracketedPSAngle: 'd', BracketedPSDimension: 'd', OptionalPair: 'd', BoxSpecification: 'd', RuleSpecification: 'd',
  RequiredKeyVals: 'k', OptionalKeyVals: 'k', CommaList: 'k', XKV: 'k',
  Semiverbatim: 'n', OptionalSemiverbatim: 'n', HyperVerbatim: 'n', SanitizedVerbatim: 'n', Verbatim: 'n', TeXFileName: 'n', DirectoryList: 'n', UndigestedKey: 'n', UndigestedDefKey: 'n', BibURL: 'n', CSName: 'n', FontDef: 'n', Color: 'n', AlignmentTemplate: 'n',
  Variable: 'r', Token: 'r', DefToken: 'r', XToken: 'r', Register: 'r',
  Undigested: 'x', OptionalUndigested: 'x', DefPlain: 'x', DefExpanded: 'x', Expanded: 'x', ExpandedPartially: 'x', ExpandedIfToken: 'x', Until: 'x', XUntil: 'x', UntilBrace: 'x', Balanced: 'x', LiteralBalanced: 'x', BalancedParen: 'x', I: 'a',
  TeXDelimiter: 'm', Relation: 'm', InScriptStyle: 'm', ScriptStyle: 'm', ScriptscriptStyle: 'm', DisplayStyle: 'm', InFractionStyle: 'm', OptionalInScriptStyle: 'm', ScriptStyleUntil: 'm', XMath: 'm',
  Optional: 'a', OptionalBracketed: 'a', OptionalAngle: 'a', BeamerAngled: 'a', OptionalBeamerAngled: 'a', BeamerSquared: 'a', XArgsOptional: 'a', alignsafeOptional: 'a', RequireBrace: 'a',
}
/** types read in brackets when written bare (Optional…) */
const BRACKETED = /^(?:Optional|alignsafeOptional|XArgsOptional|OptionalBracketed)/
/** types read in TeX's own syntax when written bare: numbers, dimensions, glue, one token */
const TEX_SYNTAX = new Set(['Dimension', 'Glue', 'MuDimension', 'MuGlue', 'Number', 'Float', 'NumExpr', 'DimExpr', 'GlueExpr', 'MuExpr', 'Variable', 'Token', 'DefToken', 'XToken', 'Register', 'BoxSpecification', 'RuleSpecification', 'Length'])
/** types that read nothing a paper writes as an argument, or a literal: skipped spaces, an expected `=` */
const LITERAL = /^(?:SkipSpaces|Skip1Space|SkipMatch|Match|Literal|Keyword|SkipKeyword|Skip)$/
/** LaTeXML's prototype parameters (Package.pm parseParameters) as `shape role` pairs; null where a type is not known */
function parseParams(p) {
  const out = []
  p = p.trim()
  while (p) {
    const braced = /^\{([^}]*)\}\s*/.exec(p), bracketed = !braced && /^\[([^\]]*)\]\s*/.exec(p), bare = !braced && !bracketed && /^(\w*)(?::([^\s{[]*))?\s*/.exec(p)
    if (braced) {
      const inner = braced[1].trim(), type = inner.split(':')[0]
      out.push(`{${inner ? TYPE_ROLE[type] ?? (LITERAL.test(type) ? 's' : null) : 'a'}`)
      p = p.slice(braced[0].length); continue
    }
    if (bracketed) {
      const inner = bracketed[1].trim(), type = inner.split(':')[0]
      out.push(`[${!inner || type === 'Default' ? 'a' : TYPE_ROLE[type] ?? null}`)
      p = p.slice(bracketed[0].length); continue
    }
    if (!bare?.[0]) return null
    const type = bare[1], extra = bare[2]
    if (type === 'OptionalMatch') out.push(extra === '*' ? '*s' : '?s')
    else if (LITERAL.test(type)) { if (/^(?:Match|SkipMatch|Literal|Keyword|SkipKeyword)$/.test(type) && extra) out.push('=s') }
    else if (type === 'UntilBrace') out.push('bx')
    else if (/^(?:Until|XUntil|DigestUntil|ScriptStyleUntil)$/.test(type)) out.push(`u${TYPE_ROLE[type]}`)
    else if (BRACKETED.test(type)) out.push(`[${TYPE_ROLE[type] ?? 'a'}`)
    else if (TEX_SYNTAX.has(type)) out.push(`_${TYPE_ROLE[type]}`)
    else out.push(`{${TYPE_ROLE[type] ?? null}`)
    p = p.slice(bare[0].length)
  }
  return out.some(x => x.endsWith('null')) ? null : out.join('')
}

// ---------------------------------------------------------------- the front matter's hooks
/** LaTeXML's front matter hooks (Base_Utility.pool.ltxml), each by what our front end makes of its text: a title, a
 *  block of names and places, a note, an abstract, keywords, a line of prose; and the contact roles (\lx@add@contact's
 *  role=…) by the same. Not addresses written out: e-mail, URL, ORCID, a phone, a first or family name; nor a
 *  publication's data (\lx@add@pubnote: a journal, a volume, a DOI), which a class may test as a key (Optica's
 *  \journal{opticajournal}) */
const HOOKS = {
  'lx@add@title': 'title', 'lx@add@subtitle': 'title', 'lx@add@author': 'author', 'lx@add@authors': 'author', 'lx@add@creator': 'author', 'lx@add@editor': 'author', 'lx@add@translator': 'author',
  'lx@add@affiliation': 'author', 'lx@add@affiliations': 'author', 'lx@add@altaffiliation': 'author', 'lx@add@address': 'author', 'lx@add@altaddress': 'author', 'lx@add@currentaddress': 'author',
  'lx@add@thanks': 'note', 'lx@add@note': 'note', 'lx@add@pubnote@thanks': 'note',
  'lx@add@abstract': 'abstract', 'lx@begin@abstract': 'abstract', 'lx@add@keywords': 'keywords', 'lx@begin@keywords': 'keywords', 'lx@add@classification': 'keywords',
  'lx@add@date': 'prose', 'lx@add@copyright': 'prose',
}
const CONTACT = { affiliation: 'author', altaffiliation: 'author', address: 'author', altaddress: 'author', current_address: 'author', collaboration: 'author', thanks: 'note', note: 'note', dedicatory: 'prose', correspondent: 'note' }
/** a replacement's hook, and which of the definition's parameters it hands its text: [role, n] or null */
function hookOf(replacement) {
  for (const m of replacement.matchAll(/\\(lx@(?:add|begin)@[A-Za-z@]+)(?![A-Za-z@])((?:\s*(?:\[[^\]]*\]|\{(?:[^{}]|\{[^{}]*\})*\}))*)/g)) {
    let role = HOOKS[m[1]]
    if (m[1] === 'lx@add@contact') role = CONTACT[/role\s*=\s*([a-z_]+)/.exec(m[2])?.[1]]
    if (!role) continue
    if (m[1].startsWith('lx@begin@')) return [role, 0]
    const n = /\{\s*#(\d)\s*\}\s*$/.exec(m[2])
    if (n) return [role, Number(n[1])]
  }
  return null
}

// ---------------------------------------------------------------- the bindings
/** the engine pools a LaTeX document has, by rank: LaTeX's over plain's over TeX's (LaTeX.pool loads them so). AmSTeX's
 *  and BibTeX's are other formats', and LaTeXML's own Base pools hold its internals */
const RANK = f => (/^(?:latex_|LaTeX\.)/.test(f) ? 3 : /^plain_/.test(f) ? 2 : /^(?:TeX|eTeX|pdfTeX)/.test(f) ? 1 : 0)
const LOAD_ORDER = ['TeX', 'eTeX', 'pdfTeX', 'plain_bootstrap', 'plain_base', 'plain_constructs', 'LaTeX', 'latex_bootstrap', 'latex_base', 'latex_constructs']
const files = [
  ...readdirSync(join(lib, 'Engine')).filter(f => f.endsWith('.ltxml') && RANK(f) > 0).sort((a, b) => LOAD_ORDER.findIndex(x => a.startsWith(x)) - LOAD_ORDER.findIndex(x => b.startsWith(x)) || (a < b ? -1 : 1)).map(f => ['Engine', f]),
  ...readdirSync(join(lib, 'Package')).filter(f => f.endsWith('.ltxml')).sort().map(f => ['Package', f]),
]
/** every definition read: name (with its @s, which a delegation may name) → { spec, binding, rank, order, replacement } */
const defs = { cs: new Map(), env: new Map() }, front = new Map()
const READS = /\$(?:gullet|_\[0\])\s*->\s*(?:read|skip)|\bRead(?:Arg|Optional|Until|Token|XToken|KeyVals|Number|Dimension|Glue|Balanced)|\breadArg\b/
let definitions = 0, untyped = 0, order = 0
for (const [dir, f] of files) {
  const binding = f.replace(/\.ltxml$/, ''), rank = dir === 'Engine' ? RANK(f) : 0
  for (const { call, args } of calls(lex(readFileSync(join(lib, dir, f), 'utf8')))) {
    const I = call.endsWith('I'), base = call.replace(/I$/, '')
    if (base === 'DefMath') continue
    definitions++
    let proto, params
    if (I) { proto = csOf(args[0] ?? []); params = isUndef(args[1] ?? []) ? '' : strOf(args[1] ?? []); if (proto === null || params === null) { untyped++; continue } }
    else { proto = strOf(args[0] ?? []); if (proto === null) { untyped++; continue } params = null }
    let kind = 'cs', name
    if (base === 'DefEnvironment') {
      const m = /^\{([^}]+)\}\s*([\s\S]*)$/.exec(proto.trim())
      if (!m) continue
      kind = 'env'; name = m[1].trim(); params ??= m[2]
    } else {
      const begin = /^\\begin\{([^}]+)\}\s*([\s\S]*)$/.exec(proto.trim())
      if (begin) { kind = 'env'; name = begin[1].trim(); params ??= begin[2] }
      else {
        const m = /^\\([A-Za-z@]+\*?|.)\s*([\s\S]*)$/.exec(proto.trim())
        if (!m) continue
        name = m[1]; params ??= m[2]
      }
    }
    const body = args[1 + (I ? 1 : 0)] ?? []
    const replacement = strOf(body)
    let spec
    if (base === 'DefRegister') spec = '='
    else {
      spec = parseParams(params)
      if (spec === null) continue
      // no parameters: a definition of nothing tells nothing (LaTeXML drops what it does not render: its
      // \IEEEauthorrefmark is '', which IEEEtran's takes an argument), a macro reads what its expansion reads (resolved
      // below), code that reads tokens itself is not known
      if (spec === '' && (replacement === '' || isUndef(body))) spec = '?'
      else if (spec === '' && base === 'DefMacro') spec = replacement === null ? '?' : { delegate: replacement }
      else if (spec === '' && READS.test(body.map(t => (t.s !== undefined ? '""' : t.c)).join(''))) spec = '?'
    }
    const all = defs[kind].get(name) ?? defs[kind].set(name, []).get(name)
    all.push({ spec, binding, rank, order: order++ })
    const hook = replacement && hookOf(replacement)
    if (hook && !/@/.test(name)) front.set(`${kind === 'env' ? 'env:' : ''}${name}`, hook)
  }
}

// ---------------------------------------------------------------- a macro that hands its arguments on
/** one argument of a replacement at r[i] as TeX takes it: a group or a token; its end */
const argEnd = (r, i) => {
  while (/\s/.test(r[i] ?? '')) i++
  if (r[i] === '{') { let d = 0; for (let k = i; k < r.length; k++) { if (r[k] === '\\') { k++; continue } if (r[k] === '{') d++; else if (r[k] === '}' && --d === 0) return k + 1 } return -1 }
  if (r[i] === '\\') { const m = /^\\(?:[A-Za-z@]+|.)/.exec(r.slice(i)); return m ? i + m[0].length : -1 }
  return i < r.length ? i + 1 : -1
}
/** what a macro defined with no parameters takes, by its replacement: a call of another (\lx@note{footnote}: the
 *  parameters \lx@note has left once given {footnote}), \@ifstar{\a}{\b} (a star, then \b's), \@ifnextchar[{\a}{\b}
 *  (\a's, whose first is the optional one), a leading \leavevmode, \relax or \protect passed over; text alone takes
 *  none. Anything else is not known: '?' */
function delegated(r, depth) {
  r = r.replace(/^(?:\s|\\(?:leavevmode|relax|protect)(?![A-Za-z@]))+/, '').trim()
  // a look ahead: \@ifstar{a}{b} is a star then b's, \@ifnextchar[{a}{b} a's (whose first is the optional one), any
  // other character b's; each branch a call of its own, read as one
  const ahead = /^\\(@ifstar|@ifnextchar|kernel@ifnextchar|@ifnch)(?![A-Za-z@])/.exec(r)
  if (ahead) {
    let at = ahead[0].length, ch = null
    if (ahead[1] !== '@ifstar') { while (/\s/.test(r[at] ?? '')) at++; ch = r[at]; at++ }
    const e1 = argEnd(r, at), e2 = e1 < 0 ? -1 : argEnd(r, e1)
    if (e2 < 0 || r.slice(e2).trim()) return '?'
    const branch = (a, b) => { const x = r.slice(a, b).trim(); return delegated(x.startsWith('{') && x.endsWith('}') ? x.slice(1, -1) : x, depth + 1) }
    if (ahead[1] === '@ifstar') { const b = branch(e1, e2); return b === '?' ? '?' : `*s${b}` }
    return ch === '[' ? branch(at, e1) : branch(e1, e2)
  }
  const call = /^\\([A-Za-z@]+)(?![A-Za-z@])/.exec(r)
  if (call) {
    const spec = formOf('cs', call[1], depth + 1)
    if (typeof spec !== 'string' || spec === '?') return '?'
    // the parameters the call leaves: each one the replacement gives taken off, an optional one where it gives [
    let at = call[0].length, k = 0
    const params = spec.match(/../g) ?? []
    for (; k < params.length; k++) {
      while (/\s/.test(r[at] ?? '')) at++
      if (at >= r.length) break
      const [shape] = params[k]
      if (shape === '[') { if (r[at] === '[') { const e = r.indexOf(']', at); if (e < 0) return '?'; at = e + 1 } continue }
      if (shape === '*' || shape === '?') { if (r[at] === '*') at++; continue }
      // TeX's own syntax for a value (a box's `to 3cm`) is never a brace group: one there is the next parameter's
      if (shape === '_' && params[k][1] === 'd' && r[at] === '{') continue
      if (shape !== '{' && shape !== '_') return '?'
      const e = argEnd(r, at)
      if (e < 0) return '?'
      at = e
    }
    // the call given all it takes and more after it: what follows may read on, not known
    if (r.slice(at).trim()) return '?'
    return params.slice(k).join('')
  }
  return /\\/.test(r) ? '?' : ''
}
/** forms several bindings give one name, made one: '?' ones and an amsppt-style one read up to a delimiter
 *  (Until:\endtitle) dropped where others exist; the rest merged where they require the same arguments in the same order
 *  (an optional one any has taken, a role where they differ `a`); else all of them, which the reader takes as none */
function merge(specs) {
  specs = [...new Set(specs)].filter(s => s !== '?')
  if (specs.length > 1 && specs.some(s => !s.includes('u'))) specs = specs.filter(s => !s.includes('u'))
  if (specs.length <= 1) return specs[0] ?? '?'
  const parts = specs.map(s => s.match(/../g) ?? []), isOpt = p => '[*?'.includes(p[0])
  const required = parts.map(p => p.filter(x => !isOpt(x)).map(x => x[0]).join(''))
  if (required.some(r => r !== required[0])) return specs
  const merged = [], idx = parts.map(() => 0)
  for (;;) {
    const opts = []
    parts.forEach((p, j) => { const run = []; while (idx[j] < p.length && isOpt(p[idx[j]])) run.push(p[idx[j]++]); if (run.length > opts.length) opts.splice(0, opts.length, ...run) })
    merged.push(...opts)
    if (parts.every((p, j) => idx[j] >= p.length)) break
    const req = parts.map((p, j) => p[idx[j]++])
    const roles = new Set(req.map(x => x[1]))
    merged.push(req[0][0] + (roles.size === 1 ? req[0][1] : 'a'))
  }
  return merged.join('')
}
const settled = { cs: new Map(), env: new Map() }
/** a name's arguments: the highest-ranked engine pool's form, the last it defines, where a pool defines it (the
 *  kernel's, which every document has), else the bindings' forms merged; a delegating macro's resolved. An environment
 *  that LaTeXML defines as a command pair (\X, \endX) is read as its command is. A string, '?' or a list of forms */
function formOf(kind, name, depth = 0) {
  if (settled[kind].has(name)) return settled[kind].get(name)
  if (depth > 8) return '?'
  const forms = defs[kind].get(name) ?? (kind === 'env' ? null : null)
  if (!forms) return kind === 'env' && defs.cs.has(name) ? formOf('cs', name, depth) : '?'
  settled[kind].set(name, '?')
  const spec = x => (typeof x.spec === 'object' ? delegated(x.spec.delegate, depth) : x.spec)
  const top = Math.max(...forms.map(x => x.rank))
  const out = top > 0 ? spec(forms.filter(x => x.rank === top).at(-1)) : merge(forms.flatMap(spec))
  settled[kind].set(name, out)
  return out
}

/** each binding's index in BINDINGS, and the bindings it loads (RequirePackage, LoadClass, InputDefinitions) */
const bindingNames = files.filter(([dir]) => dir === 'Package').map(([, f]) => f.replace(/\.ltxml$/, ''))
const bindingIndex = new Map(bindingNames.map((n, k) => [n, k]))
const requires = bindingNames.map(n => {
  const text = readFileSync(join(lib, 'Package', `${n}.ltxml`), 'utf8'), out = new Set()
  for (const m of text.matchAll(/\b(RequirePackage|LoadClass|InputDefinitions)\s*\(\s*['"]([A-Za-z0-9_@.-]+)['"]([^)]*)\)/g)) {
    const cls = m[1] === 'LoadClass' || /type\s*=>\s*['"]cls/.test(m[3])
    const k = bindingIndex.get(`${m[2]}.${cls ? 'cls' : 'sty'}`) ?? bindingIndex.get(`${m[2]}.sty`) ?? bindingIndex.get(`${m[2]}.cls`)
    if (k !== undefined) out.add(k)
  }
  return [...out].sort((x, y) => x - y)
})
/** a name's forms: the engine pools' (every document has them), and each package's or class's, by the bindings that
 *  define it so; a delegating macro's resolved, a form not known left out */
const reduce = kind => {
  const pools = {}, packages = {}
  let known = 0, unknown = 0, packaged = 0
  for (const name of [...defs[kind].keys()].sort()) {
    if (!/^[A-Za-z]+\*?$/.test(name)) continue
    const forms = defs[kind].get(name), spec = x => (typeof x.spec === 'object' ? delegated(x.spec.delegate, 0) : x.spec)
    const top = Math.max(...forms.map(x => x.rank))
    if (top > 0) { const s0 = spec(forms.filter(x => x.rank === top).at(-1)); pools[name] = s0; if (s0 === '?') unknown++; else known++ }
    const bySpec = new Map()
    for (const x of forms.filter(f => f.rank === 0)) { const s0 = spec(x); if (typeof s0 !== 'string' || s0 === '?' || s0.includes('u')) continue; (bySpec.get(s0) ?? bySpec.set(s0, new Set()).get(s0)).add(bindingIndex.get(x.binding)) }
    if (bySpec.size) { packages[name] = [...bySpec].map(([s0, bs]) => [s0, ...[...bs].sort((x, y) => x - y)]); packaged++ }
  }
  return { pools, packages, known, unknown, packaged }
}
const cs = reduce('cs'), env = reduce('env')
const frontOut = Object.fromEntries([...front].sort((a, b) => (a[0] < b[0] ? -1 : 1)))
const lines = [
  '// Generated by scripts/latexml-args.mjs from LaTeXML (brucemiller/LaTeXML, public domain; docs/THIRD_PARTY.md) at',
  `// ${commit}. Do not edit: run the script again. Each control sequence's and environment's parameters as the`,
  "// bindings' prototypes declare them, a pair of characters each (the script's TYPE_ROLE: shape, then role): COMMANDS",
  "// and ENVIRONMENTS the engine pools' (every LaTeX document has them, '?' where LaTeXML reads them in code),",
  "// PACKAGE_COMMANDS and PACKAGE_ENVIRONMENTS each package's or class's ([form, binding…] by BINDINGS' index, a binding",
  "// loading those REQUIRES names); FRONT the front matter's commands by the hook their text goes to and the parameter it",
  '// is. Read through arg-roles.mjs',
  `export const LATEXML_COMMIT = '${commit}'`,
  `export const BINDINGS = ${JSON.stringify(bindingNames)}`,
  `export const REQUIRES = ${JSON.stringify(requires)}`,
  `export const COMMANDS = ${JSON.stringify(cs.pools)}`,
  `export const PACKAGE_COMMANDS = ${JSON.stringify(cs.packages)}`,
  `export const ENVIRONMENTS = ${JSON.stringify(env.pools)}`,
  `export const PACKAGE_ENVIRONMENTS = ${JSON.stringify(env.packages)}`,
  `export const FRONT = ${JSON.stringify(frontOut)}`,
  '',
]
writeFileSync(resolvePath(out), lines.join('\n'))
console.log(`${definitions} definitions read (${untyped} with a name or parameters built at run time); ${bindingNames.length} bindings; commands of the engine pools ${cs.known + cs.unknown} (arguments known ${cs.known}, read in code ${cs.unknown}), of packages ${cs.packaged}; environments of the pools ${env.known + env.unknown}, of packages ${env.packaged}; front matter ${front.size}`)
