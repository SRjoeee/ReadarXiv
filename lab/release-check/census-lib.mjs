// lab/release-check/census-lib.mjs: the complexity and debt census's counters (census.mjs runs them on the trees). Generic:
// a repository is described by a profile (its areas, its aliases, its builds' entry points and what its cut-over cuts:
// census-profile.mjs for this repository; the private repository's own profile lives with its tree, never here), and
// every number is defined in one sentence in census.mjs's DEFINITIONS, checkable by hand on a small tree
// (tests/scripts/census.test.ts holds each on a tree of its own). Reads files only: no process but `git ls-files`, no
// network. Not shipped.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'
import { parse } from '@babel/parser'

// ---------------------------------------------------------------- files

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', '.output', '.wxt', 'coverage'])

/** a tree's files, repository-relative: what git tracks where the tree is a checkout, else every file under it but
 *  SKIP_DIRS'; a profile's `exclude` prefixes left out */
export function listFiles(root, exclude = []) {
  let files
  try {
    const top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (top !== root.replace(/\/+$/, '')) throw new Error('not the checkout root')
    files = execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean)
    files = files.filter(f => {
      try {
        return statSync(join(root, f)).isFile()
      } catch {
        return false
      }
    })
  } catch {
    files = []
    const walk = dir => {
      for (const n of readdirSync(join(root, dir)).sort()) {
        if (SKIP_DIRS.has(n)) continue
        const p = dir ? `${dir}/${n}` : n
        if (statSync(join(root, p)).isDirectory()) walk(p)
        else files.push(p)
      }
    }
    walk('')
  }
  return files.filter(f => !exclude.some(x => f.startsWith(x))).sort()
}

const CODE = /\.(?:m|c)?[jt]sx?$/
const DECL = /\.d\.(?:m|c)?ts$/
/** a file's kind: `code` (JavaScript or TypeScript), `decl` (a declaration file), `style`, `data`, `html`, `other` */
export function kindOf(path) {
  if (DECL.test(path)) return 'decl'
  if (CODE.test(path)) return 'code'
  if (path.endsWith('.css')) return 'style'
  if (path.endsWith('.json')) return 'data'
  if (path.endsWith('.html')) return 'html'
  return 'other'
}

const TEST = /(?:^|\/)(?:tests?|e2e|__tests__|fixtures)\/|\.(?:test|spec)\.(?:m|c)?[jt]sx?$/
/** a file's area and role by the profile's areas (the first prefix that matches), a test by its path whatever its area */
export function placeOf(path, profile) {
  const a = profile.areas.find(x => path.startsWith(x.prefix)) ?? { area: 'other', role: 'other' }
  const role = TEST.test(path) ? 'test' : a.role
  return { area: a.area, role }
}

// ---------------------------------------------------------------- lines

/** each line of `text` as `blank`, `comment` (every character that is not white space is inside a comment) or `code`,
 *  given the comments' [start, end) offsets */
export function lineKinds(text, comments) {
  const masked = text.split('')
  for (const [s, e] of comments) for (let i = s; i < e; i++) if (masked[i] !== '\n') masked[i] = ' '
  const original = text.split('\n')
  const without = masked.join('').split('\n')
  // (a file's last newline ends its last line: no line after it)
  if (original.length > 1 && original.at(-1) === '') {
    original.pop()
    without.pop()
  }
  return original.map((l, i) => (l.trim() === '' ? 'blank' : without[i].trim() === '' ? 'comment' : 'code'))
}

/** comments of a source the parser could not read, or of a style sheet: `//` (not in a style sheet) and block comments,
 *  outside quoted strings and template literals (a regular expression literal is not told apart: a fallback) */
export function commentsByScan(text, css = false) {
  const out = []
  let i = 0
  while (i < text.length) {
    const c = text[i]
    const d = text[i + 1]
    if (c === '/' && d === '*') {
      const e = text.indexOf('*/', i + 2)
      const end = e < 0 ? text.length : e + 2
      out.push([i, end])
      i = end
    } else if (!css && c === '/' && d === '/') {
      const e = text.indexOf('\n', i)
      const end = e < 0 ? text.length : e
      out.push([i, end])
      i = end
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < text.length && text[j] !== c) {
        if (text[j] === '\\') j++
        else if (c !== '`' && text[j] === '\n') break
        j++
      }
      i = j + 1
    } else i++
  }
  return out
}

// ---------------------------------------------------------------- one file's facts

const SKIP_KEYS = new Set(['loc', 'start', 'end', 'leadingComments', 'trailingComments', 'innerComments', 'extra', 'range', 'type', 'tokens', 'comments', 'errors'])
const FUNCTION = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ClassMethod', 'ClassPrivateMethod', 'ObjectMethod'])
const RELATIONAL = new Set(['<', '<=', '>', '>='])
/** the calls that match a value against a literal */
const MATCHERS = new Set(['includes', 'has', 'startsWith', 'endsWith', 'test', 'match', 'indexOf', 'get', 'exec', 'search'])
/** the translators' addresses: a literal that holds one is a request to that translator */
export const ENDPOINTS = [
  { kind: 'microsoft', re: /edge\.microsoft\.com\/translate|microsofttranslator\.com/ },
  { kind: 'google', re: /translate-pa\.googleapis\.com|translate\.googleapis\.com/ },
  { kind: 'deepl', re: /api(?:-free)?\.deepl\.com/ },
]
/** a citation of a definition, in a declaration's comment: TeX's, LaTeX's, a file of a TeX distribution named by its
 *  extension (cite.sty, article.cls, latex.ltx: a package's name alone is no citation), the PDF's, Unicode's, a font's, a
 *  standard's; plain.tex by name (`.tex` is every paper's extension) */
export const CITES_DEFINITION = /\b(?:TeX(?:book)?|LaTeX|[\w@-]+\.(?:sty|cls|clo|def|ltx|bst|bbx|cbx|lbx|fd|cfg|dtx)|plain\.tex|PDF(?:'s| spec| reference)|ISO[ -]32000|Unicode|UAX ?#?\d+|UTS ?#?\d+|CLDR|OpenType|TrueType|PostScript|Type ?1|the font's|font's own|JIS ?X ?4051|W3C|clreq|jlreq|klreq|CSS'?s?|ECMA|RFC ?\d+|IEEE ?754|PDF\.js's|Chromium's)\b/
/** a citation of evidence: a paper, the corpus, a measurement */
export const CITES_EVIDENCE = /\b\d{4}\.\d{4,5}(?:v\d+)?\b|\bcorpus\b|\bmeasured\b|\btuned\b|\bempiric|\bon the \d+ papers\b|\bseen on\b/i
/** the exact factors between units and the bounds of a representation: a literal of one of these values whose name or comment
 *  names a unit is a conversion, not a rule */
export const UNIT_FACTORS = new Set([72, 72.27, 65536, 25.4, 2.54, 1000, 1024, 100, 60, 3600, 360, 180, 255, 256, 0.001, 1e6, 1048576, 65535, 65536])
const UNIT_WORDS = /\b(?:pt|bp|sp|in(?:ch(?:es)?)?|mm|cm|em|ems|px|ms|millisecond|second|seconds|minute|hour|degrees?|KiB|MiB|bytes?|per ?cent|percent|%|units? per em|unitsPerEm)\b|%/i
const ARXIV_ID = /\b\d{4}\.\d{4,5}(?:v\d+)?\b/
const TEX_FILE = /^[\w@.-]+\.(?:sty|cls)$/
const PORTED = /\bported\s+from\s+(?:reference\/|@[a-z0-9][\w.-]*\/)/i
const COPIED = /\bCOPIED\b|\bcopied (?:as it is )?from\b/
const GENERATED = /\b(?:Generated by|generated by|@generated|Do not edit|DO NOT EDIT|do not edit by hand)\b/
const VERSION_NAME = /(?:^|_)(?:VERSION|SCHEMA|FORMAT)$/
const NOT_VERSION = /^(?:MAX|MIN)_/
const VERSION_FILE = /(?:^|\/)versions?\.(?:m|c)?[jt]s$/
/** a comment that says its constant is raised by hand: "raised with every change", "rises only if", "bump it when" */
const RAISED = /\b(?:raised|rises|bumped|raise it|bump it)\b(?:\s+\w+){0,2}\s+(?:with|when|whenever|if|only|on|for|every)\b|\ba change to (?:it|them|this) is a change of\b/i
/** a store's schema number (census.mjs DEFINITIONS `versions`): its name says so, or a comment that is its own or names it
 *  says it numbers the form of what is stored */
const SCHEMA_NAME = /(?:^|_)(?:SCHEMA|FORMAT)$/
const STORED_FORM = /\b(?:schema|shape|grammar)\b/i
/** a comment that says what is computed changed: "raised with any change to what the maker writes", "changes what" */
const COMPUTED_CHANGED = /\bchanges? (?:to|of|in) what\b|\bchanges what\b/i
/** a budget's name (census.mjs DEFINITIONS `budgets`): a time, a size or a count the code may spend or hold, by the
 *  name's last or first word (an UPPER_CASE constant's, or a camelCase property's of a table) */
const BUDGET_UPPER = /(?:^|_)(?:MS|SECONDS|TIMEOUT|BYTES|KIB|MIB|PX|PIXELS|MAX|CAP|LIMIT|BUDGET)$|^(?:KEEP|MAX)_/
const BUDGET_CAMEL = /[a-z0-9](?:Ms|Seconds|Timeout|Bytes|KiB|MiB|Px|Pixels|Max|Cap|Limit|Budget)$|^(?:keep|max)[A-Z]/
/** a document's own measures: a bound in one of these is a reading's rule, not a budget */
const TYPE_UNITS = /\b(?:em|ems|pt|bp|sp)\b/
/** a budget's measurement on record: a paper, the corpus, a measurement */
const BUDGET_MEASURED = /\b\d{4}\.\d{4,5}(?:v\d+)?\b|\bcorpus\b|\bmeasured\b|\bmeasurements?\b|\bon the \d+ papers\b|\bseen on\b/i
const BUDGET_UNITS = [
  { unit: 'time', name: /(?:MS|SECONDS|TIMEOUT|Ms|Seconds|Timeout)$/, words: /\b(?:ms|milliseconds?|seconds?|minutes?)\b/i },
  { unit: 'bytes', name: /(?:BYTES|KIB|MIB|Bytes|KiB|MiB)$/, words: /\b(?:bytes?|KiB|MiB|GiB|KB|MB)\b/ },
  { unit: 'pixels', name: /(?:PX|PIXELS|Px|Pixels)$/, words: /\b(?:px|pixels?)\b/i },
]
/** a platform's limit on record: a definition the census already reads (CITES_DEFINITION), or a platform's limit named */
const PLATFORM_LIMIT = /\b(?:Chrome|Chromium|V8|Cloudflare|Workers?|Durable Objects?|R2|D1|KV|Node(?:\.js)?|IndexedDB|PDF\.js|WebGL|the browser|the platform)(?:'s)?\b[^.;]{0,60}\b(?:limits?|caps?|maximum|ceiling|quota|allows?)\b/i
/** a comment line that tells history (census.mjs DEFINITIONS `history`) */
export const HISTORY = {
  todays: /\btoday['’]s\b/i,
  dated: /\b20\d\d-\d\d-\d\d\b/,
  named: /\b(?:Codex|Devin|Copilot|CodeRabbit)\b|\bround (?:[A-Z]{1,2})?\d+\b|\b(?:Plan|Task) \d+[a-z]?\b/,
}
/** a date beside it that names a measurement: the one date a comment keeps */
const MEASUREMENT = /\bmeasured\b|\bmeasurements?\b/i
const UPPER = /^[A-Z][A-Z0-9_]*$/

const pluginsOf = path => {
  if (/\.tsx$/.test(path)) return ['typescript', 'jsx']
  if (/\.(?:m|c)?ts$/.test(path)) return [['typescript', { dts: DECL.test(path) }]]
  return ['jsx']
}
const parseOf = (path, text, tokens) => {
  const base = { sourceType: 'module', errorRecovery: true, tokens, allowReturnOutsideFunction: true, allowImportExportEverywhere: true, allowAwaitOutsideFunction: true, createImportExpressions: false }
  const plugins = [...pluginsOf(path), 'importAttributes', 'explicitResourceManagement', 'decorators-legacy']
  try {
    return parse(text, { ...base, plugins })
  } catch (e) {
    // (a `.js` file is read as JSX first; one whose `<` JSX misreads is read again without it)
    if (plugins.includes('jsx') && !/\.(?:jsx|tsx)$/.test(path)) return parse(text, { ...base, plugins: plugins.filter(p => p !== 'jsx') })
    throw e
  }
}

const numberOf = n => {
  if (!n) return null
  if (n.type === 'NumericLiteral') return n.value
  if (n.type === 'UnaryExpression' && n.operator === '-' && n.argument.type === 'NumericLiteral') return -n.argument.value
  if (n.type === 'BinaryExpression' && ['*', '/', '+', '-', '**'].includes(n.operator)) {
    const a = numberOf(n.left)
    const b = numberOf(n.right)
    if (a == null || b == null) return null
    return n.operator === '*' ? a * b : n.operator === '/' ? a / b : n.operator === '+' ? a + b : n.operator === '-' ? a - b : a ** b
  }
  if (n.type === 'TSAsExpression' || n.type === 'TSSatisfiesExpression' || n.type === 'ParenthesizedExpression') return numberOf(n.expression)
  return null
}
const isNumberLiteral = n => n && (n.type === 'NumericLiteral' || (n.type === 'UnaryExpression' && n.operator === '-' && n.argument.type === 'NumericLiteral'))
const stringOf = n => (n?.type === 'StringLiteral' ? n.value : n?.type === 'TemplateLiteral' && !n.expressions.length ? n.quasis.map(q => q.value.cooked).join('') : null)
const nameOf = n => (n?.type === 'Identifier' ? n.name : n?.type === 'StringLiteral' ? n.value : null)
const textOf = (text, n) => text.slice(n.start, n.end)

/**
 * One file's facts: its lines by kind, what it imports and exports, and what the rule-debt, type and duplication counts read
 * of it. `tokens`: also each function's token digest (the duplication count's). `nodes`: also, not enumerable (census.json
 * never holds them), the file's syntax tree (`ast`) and each threshold's and list's own nodes (`nodes`: the literal, its
 * declaration or the comparison or call it stands in), for the rule ledger's instrument (lab/rules/sites.mjs).
 */
export function factsOf(path, text, { tokens = true, nodes = false } = {}) {
  const kind = kindOf(path)
  const head = text.split('\n').slice(0, 12).join('\n')
  const f = { path, kind, bytes: Buffer.byteLength(text), generated: GENERATED.test(head), ported: PORTED.test(text.split('\n').slice(0, 30).join('\n')), copied: COPIED.test(head), parsed: true }
  if (kind === 'style' || kind === 'html' || kind === 'data' || kind === 'other') {
    const comments = kind === 'style' ? commentsByScan(text, true) : kind === 'html' ? [...text.matchAll(/<!--[\s\S]*?-->/g)].map(m => [m.index, m.index + m[0].length]) : []
    f.lines = countLines(lineKinds(text, comments))
    if (kind === 'style') f.history = historyIn(text, comments.map(([s, e]) => ({ start: s, value: text.slice(s, e) })))
    f.imports = kind === 'html' ? [...text.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => ({ spec: m[1].startsWith('.') || m[1].startsWith('/') ? (m[1].startsWith('/') ? `.${m[1]}` : m[1]) : `./${m[1]}`, names: ['*'], type: false, line: 1 })) : kind === 'style' ? [...withoutRanges(text, comments).matchAll(/@import\s+(?:url\()?["']([^"')]+)["']/g)].map(m => ({ spec: m[1], names: ['*'], type: false, line: 1 })) : []
    return f
  }
  let ast
  try {
    ast = parseOf(path, text, tokens && kind === 'code')
  } catch {
    f.parsed = false
    f.lines = countLines(lineKinds(text, commentsByScan(text)))
    f.imports = []
    f.exports = []
    return f
  }
  const lineAt = []
  {
    let n = 1
    for (let i = 0; i <= text.length; i++) {
      lineAt[i] = n
      if (text[i] === '\n') n++
    }
  }
  const kinds = lineKinds(text, ast.comments.map(c => [c.start, c.end]))
  f.lines = countLines(kinds)
  // (an item's nodes, kept out of every enumeration)
  const keep = (item, n) => (nodes ? Object.defineProperty(item, 'nodes', { value: n }) : item)
  if (nodes) Object.defineProperty(f, 'ast', { value: ast })
  const commentsOnLine = new Map()
  for (const c of ast.comments) for (let l = lineAt[c.start]; l <= lineAt[c.end - 1]; l++) commentsOnLine.set(l, [...(commentsOnLine.get(l) ?? []), c.value])
  f.history = historyIn(text, ast.comments)
  // (a statement's own comments: those that open their line; the parser hands a comment that ends the line before to the
  // next statement too)
  const leading = node =>
    (node?.leadingComments ?? [])
      .filter(c => /^\s*$/.test(text.slice(text.lastIndexOf('\n', c.start - 1) + 1, c.start)))
      .map(c => c.value)
      .join('\n')
  const sameLine = node => (commentsOnLine.get(lineAt[node.start]) ?? []).join('\n')
  // (the comment right before a statement (census.mjs DEFINITIONS `comments`): nothing but white space and no blank line between
  // it and the statement, cut where its kind changes: a block comment there is the statement's alone, else the run of line
  // comments with no blank line inside; a block that opens the file is the file's: `leading` holds every comment before)
  const adjacent = node => {
    const comments = node?.leadingComments ?? []
    const opensLine = c => /^\s*$/.test(text.slice(text.lastIndexOf('\n', c.start - 1) + 1, c.start))
    const tight = (c, end) => /^[ \t]*\n?[ \t]*$/.test(text.slice(c.end, end))
    const last = comments.at(-1)
    if (!last || !tight(last, node.start) || !opensLine(last)) return ''
    const block = [last]
    if (last.type !== 'CommentBlock')
      for (let i = comments.length - 2; i >= 0; i--) {
        const c = comments[i]
        if (c.type === 'CommentBlock' || !tight(c, block[0].start) || !opensLine(c)) break
        block.unshift(c)
      }
    if (/^\s*$/.test(text.slice(0, block[0].start))) return ''
    return block.map(c => c.value).join('\n')
  }

  f.imports = []
  f.exports = []
  f.reexports = []
  f.thresholds = []
  f.lists = []
  f.papers = []
  f.texFiles = []
  f.versions = []
  f.constants = []
  f.calls = new Set()
  f.endpoints = []
  f.any = 0
  f.casts = { cast: [], unsafe: [], nonNull: 0 }
  f.vocabularies = []
  f.nocheck = ast.comments.some(c => /^\s*@ts-nocheck\b/.test(c.value))
  f.suppressionLines = ast.comments.filter(c => /^\s*@ts-(?:ignore|expect-error)\b/.test(c.value)).map(c => lineAt[c.start])
  f.suppressions = f.suppressionLines.length
  f.functions = []
  f.llm = false
  f.barrel = ast.program.body.length > 0 && ast.program.body.every(s => s.type === 'ImportDeclaration' || (s.type === 'ExportNamedDeclaration' && (s.source || !s.declaration)) || s.type === 'ExportAllDeclaration')

  const addImport = (spec, names, type, node) => {
    if (typeof spec === 'string') f.imports.push({ spec, names, type, line: lineAt[node.start] })
  }
  const exportName = (name, type, node) => f.exports.push({ name, type, line: lineAt[node.start] })
  for (const s of ast.program.body) {
    if (s.type === 'ImportDeclaration') {
      const allType = s.importKind === 'type' || (s.specifiers.length > 0 && s.specifiers.every(x => x.importKind === 'type'))
      const names = s.specifiers.map(x => (x.type === 'ImportDefaultSpecifier' ? 'default' : x.type === 'ImportNamespaceSpecifier' ? '*' : nameOf(x.imported)))
      addImport(s.source.value, names, allType, s)
      f.imports.at(-1).locals = s.specifiers.filter(x => x.importKind !== 'type' && x.type !== 'ImportNamespaceSpecifier').map(x => [x.local.name, x.type === 'ImportDefaultSpecifier' ? 'default' : nameOf(x.imported)])
      if (s.source.value === 'ai' && names.some(n => n === 'generateText' || n === 'streamText')) f.llm = true
    } else if (s.type === 'ExportAllDeclaration') {
      if (s.exported) {
        addImport(s.source.value, ['*'], s.exportKind === 'type', s)
        exportName(nameOf(s.exported), s.exportKind === 'type', s)
      } else {
        addImport(s.source.value, ['*'], s.exportKind === 'type', s)
        f.reexports.push({ star: true, spec: s.source.value })
      }
    } else if (s.type === 'ExportNamedDeclaration') {
      const type = s.exportKind === 'type'
      if (s.source) {
        addImport(s.source.value, s.specifiers.map(x => (x.type === 'ExportNamespaceSpecifier' ? '*' : nameOf(x.local))), type || s.specifiers.every(x => x.exportKind === 'type'), s)
        for (const x of s.specifiers) {
          if (x.type === 'ExportNamespaceSpecifier') exportName(nameOf(x.exported), type, s)
          else f.reexports.push({ spec: s.source.value, local: nameOf(x.local), exported: nameOf(x.exported), type: type || x.exportKind === 'type' })
        }
      } else if (s.declaration) {
        const d = s.declaration
        if (d.type === 'VariableDeclaration') for (const v of d.declarations) for (const id of idsOf(v.id)) exportName(id, false, s)
        else if (d.id) exportName(nameOf(d.id), /^TS/.test(d.type) && d.type !== 'TSEnumDeclaration', s)
      } else for (const x of s.specifiers) exportName(nameOf(x.exported), type || x.exportKind === 'type', s)
    } else if (s.type === 'ExportDefaultDeclaration') exportName('default', false, s)
  }

  // version constants and module constants: the module's top level
  const opening = ast.comments.filter(c => c.end <= (ast.program.body[0]?.start ?? text.length))
  const tops = ast.program.body.flatMap(s => (s.type === 'ExportNamedDeclaration' && s.declaration ? [{ s, d: s.declaration }] : [{ s, d: s }]))
  const constNodes = new Set()
  for (const { s, d } of tops) {
    if (d.type !== 'VariableDeclaration' || d.kind !== 'const') continue
    for (const v of d.declarations) {
      const name = v.id?.type === 'Identifier' ? v.id.name : null
      if (!name || !v.init) continue
      // (a rule's comment: the block directly before its declaration, and its own line's; DEFINITIONS.comments)
      const comment = `${adjacent(s)}\n${sameLine(v)}`
      const lit = stringOf(v.init) ?? (v.init.type === 'NumericLiteral' ? v.init.value : v.init.type === 'TSAsExpression' ? (stringOf(v.init.expression) ?? (v.init.expression.type === 'NumericLiteral' ? v.init.expression.value : null)) : null)
      if (lit != null && UPPER.test(name)) f.constants.push({ name, value: lit, line: lineAt[v.start] })
      if (lit != null && UPPER.test(name) && !NOT_VERSION.test(name) && (VERSION_NAME.test(name) || VERSION_FILE.test(path) || RAISED.test(leading(s).replace(/\n\s*\*?\s*/g, ' ')))) {
        // (its own comment's first sentence, or a sentence of the file's opening comment that names it: a version's later
        // sentences, and other comments, are often history, which names the schemas of other things)
        const naming = new RegExp(`(?<![\\w$])${name}(?![\\w$])`)
        const own = sentencesOf(`${adjacent(s)}\n${sameLine(v)}`)[0] ?? ''
        const schema = SCHEMA_NAME.test(name) || (!COMPUTED_CHANGED.test(own) && (STORED_FORM.test(own) || opening.some(c => sentencesOf(c.value).some(t => naming.test(t) && STORED_FORM.test(t)))))
        f.versions.push({ name, value: lit, line: lineAt[v.start], schema })
      }
      if (UPPER.test(name)) {
        const value = numberOf(v.init)
        if (value != null) {
          f.thresholds.push(keep(thresholdOf({ value, raw: textOf(text, v.init), name, comment, line: lineAt[v.start], context: 'constant' }), { literal: v.init, declarator: v, comment }))
          constNodes.add(v.init)
        }
        const obj = v.init.type === 'CallExpression' && v.init.callee?.property?.name === 'freeze' ? v.init.arguments[0] : v.init.type === 'TSAsExpression' ? v.init.expression : v.init
        if (obj?.type === 'ObjectExpression') {
          const props = obj.properties.filter(p => p.type === 'ObjectProperty' && isNumberLiteral(p.value))
          // (three or more distinct integers: an enumeration or a code table, Roman numerals' values, flags: no rule)
          const values = props.map(p => numberOf(p.value))
          const enumeration = props.length >= 3 && values.every(Number.isInteger) && new Set(values).size === values.length
          for (const p of props) {
            const t = thresholdOf({ value: numberOf(p.value), raw: textOf(text, p.value), name: `${name}.${nameOf(p.key) ?? '?'}`, comment: `${comment}\n${adjacent(p)}\n${sameLine(p)}`, line: lineAt[p.start], context: 'table' })
            f.thresholds.push(keep(enumeration ? { ...t, class: 'code' } : t, { literal: p.value, declarator: v, property: p, comment: `${comment}\n${adjacent(p)}\n${sameLine(p)}` }))
            constNodes.add(p.value)
          }
        }
      }
    }
  }

  // the walk: comparisons, lists, literals, functions
  const fnStack = []
  const stmtStack = []
  const walk = (node, parent, test = false) => {
    if (!node || typeof node.type !== 'string') return
    const isStmt = /Statement$|Declaration$/.test(node.type)
    if (isStmt) stmtStack.push(node)
    let fn = null
    if (FUNCTION.has(node.type) && node.body) {
      // (a function's name: its own, else the name it is bound to: a variable, a property, a class field, an assignment's target)
      const bound = parent?.type === 'VariableDeclarator' ? nameOf(parent.id) : /^(?:ObjectProperty|ClassProperty|ClassPrivateProperty)$/.test(parent?.type ?? '') ? (nameOf(parent.key) ?? parent.key?.id?.name ?? null) : parent?.type === 'AssignmentExpression' ? textOf(text, parent.left).slice(0, 40) : null
      fn = { line: lineAt[node.start], endLine: lineAt[node.end - 1], start: node.start, end: node.end, parent: fnStack.at(-1) ?? null, name: nameOf(node.id) ?? nameOf(node.key) ?? node.key?.id?.name ?? bound }
      f.functions.push(fn)
      fnStack.push(fn)
    }
    // (a statement's comment; an exported declaration's is its export statement's, where the parser hangs it)
    const inner = stmtStack.at(-1)
    const outer = stmtStack.at(-2)
    const stmt = (outer?.type === 'ExportNamedDeclaration' || outer?.type === 'ExportDefaultDeclaration') && outer.declaration === inner ? outer : inner
    const near = n => `${adjacent(stmt)}\n${sameLine(n)}`
    switch (node.type) {
      case 'BinaryExpression':
        if (RELATIONAL.has(node.operator))
          for (const side of [node.left, node.right])
            if (isNumberLiteral(side) && !constNodes.has(side)) f.thresholds.push(keep(thresholdOf({ value: numberOf(side), raw: textOf(text, side), name: null, comment: near(node), line: lineAt[side.start], context: 'comparison', other: textOf(text, side === node.left ? node.right : node.left).slice(0, 60) }), { literal: side, site: node, comment: near(node) }))
        break
      case 'CallExpression': {
        const c = node.callee
        if (c?.type === 'Identifier') f.calls.add(c.name)
        if (c?.type === 'MemberExpression' && c.object?.name === 'Math' && ['min', 'max'].includes(c.property?.name))
          for (const a of node.arguments) if (isNumberLiteral(a) && !constNodes.has(a)) f.thresholds.push(keep(thresholdOf({ value: numberOf(a), raw: textOf(text, a), name: null, comment: near(node), line: lineAt[a.start], context: `Math.${c.property.name}` }), { literal: a, site: node, comment: near(node) }))
        if (c?.type === 'Import' || c?.name === 'require') addImport(stringOf(node.arguments[0]), ['*'], false, node)
        if (c?.type === 'MemberExpression' && ((c.object?.name === 'Translator' && c.property?.name === 'create') || c.property?.name === 'createTranslator')) f.endpoints.push({ kind: 'chrome', line: lineAt[node.start] })
        break
      }
      case 'ImportExpression':
        addImport(stringOf(node.source), ['*'], false, node)
        break
      case 'NewExpression':
        if (node.callee?.type === 'Identifier') f.calls.add(node.callee.name)
        if (node.callee?.name === 'URL' && node.arguments[1]?.type === 'MemberExpression' && textOf(text, node.arguments[1]) === 'import.meta.url') {
          const s = stringOf(node.arguments[0])
          if (s) addImport(s.startsWith('.') ? s : `./${s}`, ['*'], false, node)
        }
        break
      case 'TSImportType':
        addImport(stringOf(node.argument?.literal ?? node.argument), ['*'], true, node)
        break
      case 'TSAnyKeyword':
        f.any++
        break
      case 'TSAsExpression':
      case 'TSTypeAssertion': {
        // (a cast: `x as T` or `<T>x`, `as const` apart; a cast of a cast is one, counted on the outer; `as never`, `as any`
        // and a cast through another type are unsafe)
        if (isConst(node.typeAnnotation) || parent?.type === 'TSAsExpression' || parent?.type === 'TSTypeAssertion') break
        const line = lineAt[node.start]
        f.casts.cast.push(line)
        const t = node.typeAnnotation?.type
        if (t === 'TSNeverKeyword' || t === 'TSAnyKeyword' || node.expression?.type === 'TSAsExpression' || node.expression?.type === 'TSTypeAssertion') f.casts.unsafe.push(line)
        break
      }
      case 'TSNonNullExpression':
        f.casts.nonNull++
        break
      case 'ArrayExpression': {
        const strings = node.elements.map(stringOf)
        // (names: strings of 40 characters at most; a list of longer ones is text, TeX code, a message)
        if (strings.length >= 3 && strings.every(s => s != null && s.length <= 40)) {
          const owner = parent?.type === 'VariableDeclarator' ? nameOf(parent.id) : parent?.type === 'NewExpression' ? nameOf(stmtDeclName(stmt)) : nameOf(stmtDeclName(stmt))
          const l = listOf({ entries: strings, line: lineAt[node.start], name: owner, comment: near(node), form: 'list' })
          // (our own vocabulary: declared `as const`, its type the literal's, or a schema's enum: not a name list)
          const vocabulary = ((parent?.type === 'TSAsExpression' || parent?.type === 'TSTypeAssertion') && isConst(parent.typeAnnotation)) || (parent?.type === 'CallExpression' && parent.arguments[0] === node && parent.callee?.type === 'MemberExpression' && nameOf(parent.callee.property) === 'enum')
          if (vocabulary) f.vocabularies.push({ ...l, class: 'vocabulary' })
          else f.lists.push(keep(l, { literal: node, parent, entries: strings, comment: near(node) }))
        }
        break
      }
      case 'RegExpLiteral': {
        const words = alternativesOf(node.pattern)
        if (words.length >= 3) f.lists.push(keep(listOf({ entries: words, line: lineAt[node.start], name: nameOf(stmtDeclName(stmt)), comment: near(node), form: 'regex' }), { literal: node, parent, entries: words, comment: near(node) }))
        if (ARXIV_ID.test(node.pattern.replace(/\\\./g, '.'))) f.papers.push({ id: ARXIV_ID.exec(node.pattern.replace(/\\\./g, '.'))[0], line: lineAt[node.start] })
        break
      }
      case 'StringLiteral':
      case 'TemplateElement': {
        const s = node.type === 'StringLiteral' ? node.value : node.value.cooked ?? ''
        // (an import's specifier and a type's name are no rule)
        if (parent && (parent.type === 'ImportDeclaration' || parent.type === 'ExportNamedDeclaration' || parent.type === 'ExportAllDeclaration' || parent.type === 'TSLiteralType' || parent.type === 'ImportExpression')) break
        const id = ARXIV_ID.exec(s)
        // (a literal that decides: in a branch's test, compared, or matched against)
        if (test && id && !/\d{4}\.\d{4,5}\.\d/.test(s)) f.papers.push({ id: id[0], line: lineAt[node.start] })
        if (test && TEX_FILE.test(s)) f.texFiles.push({ name: s, line: lineAt[node.start] })
        for (const e of ENDPOINTS) if (e.re.test(s)) f.endpoints.push({ kind: e.kind, line: lineAt[node.start] })
        break
      }
    }
    const decides = key =>
      test ||
      (key === 'test' && /^(?:If|While|DoWhile|For)Statement$|^ConditionalExpression$|^SwitchCase$/.test(node.type)) ||
      (node.type === 'BinaryExpression' && ['===', '!==', '==', '!='].includes(node.operator)) ||
      (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression' && MATCHERS.has(node.callee.property?.name) && (key === 'arguments' || key === 'callee'))
    for (const key of Object.keys(node)) {
      if (SKIP_KEYS.has(key)) continue
      const v = node[key]
      if (Array.isArray(v)) for (const x of v) walk(x, node, decides(key))
      else if (v && typeof v.type === 'string') walk(v, node, decides(key))
    }
    if (fn) fnStack.pop()
    if (isStmt) stmtStack.pop()
  }
  walk(ast.program, null)
  if (f.llm) f.endpoints.push({ kind: 'llm', line: 1 })

  // each function's token digest: its tokens, comments and white space aside, names and literals as written
  if (tokens && ast.tokens) {
    const toks = ast.tokens.filter(t => t.type !== 'CommentLine' && t.type !== 'CommentBlock')
    let k = 0
    for (const fn of f.functions.sort((a, b) => a.start - b.start)) {
      while (k < toks.length && toks[k].start < fn.start) k++
      const parts = []
      for (let j = k; j < toks.length && toks[j].end <= fn.end; j++) {
        const t = toks[j]
        const label = typeof t.type === 'string' ? t.type : t.type.label
        parts.push(t.value != null ? `${label}:${typeof t.value === 'object' ? JSON.stringify(t.value) : t.value}` : label)
      }
      fn.tokens = parts.length
      fn.digest = parts.length ? createHash('sha1').update(parts.join('\u0001')).digest('hex').slice(0, 16) : null
    }
  }
  for (const fn of f.functions) {
    // (a function's length: the code lines from its first line to its last, its nested functions' among them)
    let code = 0
    for (let l = fn.line; l <= fn.endLine; l++) if (kinds[l - 1] === 'code') code++
    fn.code = code
    delete fn.start
    delete fn.end
  }
  f.calls = [...f.calls]
  return f
}

/** the comment lines of a text that tell history (HISTORY), by line number: each comment `{ start, value }` cut at its
 *  newlines, so that a line's comment text is the part of a comment that stands on it */
function historyIn(text, comments) {
  const breaks = []
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) breaks.push(i)
  // (a line's number: one more than the line breaks before the offset)
  const lineOf = offset => {
    let lo = 0
    let hi = breaks.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (breaks[mid] < offset) lo = mid + 1
      else hi = mid
    }
    return lo + 1
  }
  const byLine = new Map()
  for (const c of comments) {
    const first = lineOf(c.start)
    c.value.split('\n').forEach((part, i) => byLine.set(first + i, `${byLine.get(first + i) ?? ''} ${part}`))
  }
  const h = { todays: [], dated: [], measuredDates: [], named: [] }
  for (const [line, t] of [...byLine].sort((a, b) => a[0] - b[0])) {
    if (HISTORY.todays.test(t)) h.todays.push(line)
    if (HISTORY.dated.test(t)) (MEASUREMENT.test(t) ? h.measuredDates : h.dated).push(line)
    if (HISTORY.named.test(t)) h.named.push(line)
  }
  return h
}
/** a comment's sentences: its text with JSDoc's stars and line breaks out, cut after a full stop or a semicolon */
const sentencesOf = value =>
  value
    .replace(/^\s*\*+\s?/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.;])\s+/)
    .filter(Boolean)
const isConst = n => n?.type === 'TSTypeReference' && n.typeName?.type === 'Identifier' && n.typeName.name === 'const'
const idsOf = p => (!p ? [] : p.type === 'Identifier' ? [p.name] : p.type === 'ObjectPattern' ? p.properties.flatMap(x => idsOf(x.value ?? x.argument)) : p.type === 'ArrayPattern' ? p.elements.flatMap(idsOf) : p.type === 'AssignmentPattern' ? idsOf(p.left) : p.type === 'RestElement' ? idsOf(p.argument) : [])
const stmtDeclName = s => (s?.type === 'VariableDeclaration' ? s.declarations[0]?.id : (s?.type === 'ExportNamedDeclaration' || s?.type === 'ExportDefaultDeclaration') && s.declaration ? stmtDeclName(s.declaration) : (s?.id ?? null))
const countLines = kinds => ({ code: kinds.filter(k => k === 'code').length, comment: kinds.filter(k => k === 'comment').length, blank: kinds.filter(k => k === 'blank').length })
const withoutRanges = (text, ranges) => {
  const a = text.split('')
  for (const [s, e] of ranges) for (let i = s; i < e; i++) if (a[i] !== '\n') a[i] = ' '
  return a.join('')
}

/** a regular expression's alternatives that are words or TeX names (two letters or more), where it has three or more */
export function alternativesOf(pattern) {
  // (the pattern cut at every `|` outside a character class, whatever group it stands in)
  const parts = []
  let cur = ''
  let inClass = false
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '\\') {
      cur += c + (pattern[i + 1] ?? '')
      i++
    } else if (inClass) {
      cur += c
      if (c === ']') inClass = false
    } else if (c === '[') {
      inClass = true
      cur += c
    } else if (c === '|') {
      parts.push(cur)
      cur = ''
    } else cur += c
  }
  parts.push(cur)
  // the alternatives as words: anchors, word boundaries, a group's opening and closing taken off
  const words = parts.map(p => p.replace(/^\^|\$$/g, '').replace(/\\b/g, '').replace(/^\(\?:|^\(\?<?[=!]|^\(/, '').replace(/\)+[*+?]?$/, '').replace(/^\\\\/, '\\'))
  return words.filter(w => /^\\?[A-Za-z@][A-Za-z@*-]+$/.test(w))
}

/** a numeric literal's class (census.mjs DEFINITIONS `thresholds`, `budgets`): `conversion` (a unit's factor or a
 *  representation's bound, its name or comment naming the unit), `structural` (0, 1 or -1: a sign, an emptiness, the
 *  first), `code` (written in hex, octal or binary: a code point or a mask), `budget` (a whole number named as a time, a
 *  size or a count the code may spend or hold, not in a document's unit: with its `unit` and its `source`, `measured`,
 *  `platform` or null), `borderline` (its comment cites a definition, which the census cannot hold the value to; or a unit
 *  factor whose unit is not named), else `tuned` (`evidence`: its comment cites a paper, the corpus or a measurement;
 *  `reason`: it has a comment at all) */
export function thresholdOf(t) {
  // (its comment kept short: the reason the list prints beside it)
  const why = (t.comment ?? '').replace(/^\s*\*+\s?/gm, '').replace(/\s+/g, ' ').trim().slice(0, 140)
  const out = { ...t, comment: undefined, why }
  const words = `${t.name ?? ''}\n${t.comment ?? ''}`
  const parts = (t.name ?? '').split('.').filter(Boolean)
  if (/^-?0[xXoObB]/.test(t.raw)) out.class = 'code'
  else if (t.value === 0 || t.value === 1 || t.value === -1) out.class = 'structural'
  else if (parts.some(p => (UPPER.test(p) ? BUDGET_UPPER : BUDGET_CAMEL).test(p)) && Number.isInteger(t.value) && !TYPE_UNITS.test(t.comment ?? '')) {
    // a budget: what the code may spend or hold, its unit by its name or comment, its source a measurement or a platform's limit
    out.class = 'budget'
    const first = sentencesOf(t.comment ?? '')[0] ?? ''
    out.unit = (BUDGET_UNITS.find(u => parts.some(p => u.name.test(p))) ?? BUDGET_UNITS.find(u => u.words.test(first)))?.unit ?? 'count'
    out.source = BUDGET_MEASURED.test(t.comment ?? '') ? 'measured' : CITES_DEFINITION.test(t.comment ?? '') || PLATFORM_LIMIT.test(t.comment ?? '') ? 'platform' : null
  } else if (UNIT_FACTORS.has(Math.abs(t.value))) out.class = UNIT_WORDS.test(words) ? 'conversion' : 'borderline'
  else if (CITES_DEFINITION.test(t.comment ?? '') && !CITES_EVIDENCE.test(t.comment ?? '')) out.class = 'borderline'
  else out.class = 'tuned'
  out.evidence = CITES_EVIDENCE.test(t.comment ?? '')
  out.reason = /\S/.test((t.comment ?? '').replace(/\n/g, ''))
  out.cites = CITES_DEFINITION.exec(t.comment ?? '')?.[0] ?? null
  return out
}

/** a list of names (census.mjs DEFINITIONS `lists`): `defined` where its comment cites a definition, `listed` otherwise */
function listOf(l) {
  const cites = CITES_DEFINITION.exec(l.comment ?? '')?.[0] ?? null
  return { line: l.line, name: l.name ?? null, size: l.entries.length, form: l.form, sample: l.entries.slice(0, 4), class: cites ? 'defined' : 'listed', cites }
}

// ---------------------------------------------------------------- resolution

const EXTS = ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.cjs', '.json', '.css', '.d.ts', '.d.mts']
const QUERY = /[?#].*$/

/**
 * A resolver over one repository's files (and, for a repository that holds another as a pin, that one's): `(from, spec)` to
 * `{ repo, path }`, `{ external: name }` for a package outside the trees or a platform module, or null for nothing found.
 * The profile's `aliases` (`{ from, to, importerUnder? }`), `workspaces` (directories of packages, each named by its
 * package.json and reached through its `exports`) and `pin` (`{ prefix, repo }`: a path under it is the other
 * repository's, at the path after it).
 */
export function resolverOf(repo, files, profile, others = {}) {
  const has = new Set(files)
  const pin = profile.pin
  const exists = p => (pin && p.startsWith(pin.prefix) ? others[pin.repo]?.has(p.slice(pin.prefix.length)) : has.has(p))
  const packages = new Map()
  for (const dir of profile.workspaces ?? []) {
    const inPin = pin && dir.startsWith(pin.prefix)
    const list = inPin ? [...(others[`${pin.repo}:packages`] ?? [])] : files.filter(f => f.startsWith(`${dir}/`) && /^[^/]+\/package\.json$/.test(f.slice(dir.length + 1)))
    for (const m of list) {
      const path = inPin ? `${pin.prefix}${m.path}` : m
      const json = inPin ? m.json : JSON.parse(readFileSync(join(profile.root, m), 'utf8'))
      if (json?.name) packages.set(json.name, { dir: posix.dirname(path), exports: json.exports })
    }
  }
  const probe = base => {
    if (exists(base)) return base
    const js = /\.(?:m|c)?jsx?$/.exec(base)
    if (js) {
      const stem = base.slice(0, -js[0].length)
      for (const e of js[0] === '.mjs' ? ['.mts'] : js[0] === '.cjs' ? ['.cts'] : ['.ts', '.tsx']) if (exists(stem + e)) return stem + e
    }
    for (const e of EXTS) if (exists(base + e)) return base + e
    for (const e of EXTS) if (exists(`${base}/index${e}`)) return `${base}/index${e}`
    return null
  }
  const place = p => (pin && p.startsWith(pin.prefix) ? { repo: pin.repo, path: p.slice(pin.prefix.length) } : { repo, path: p })
  return (from, rawSpec) => {
    const spec = rawSpec.replace(QUERY, '')
    if (spec.startsWith('node:') || spec.startsWith('cloudflare:') || spec.startsWith('virtual:') || spec.startsWith('#') || /^[a-z]+:\/\//.test(spec)) return { external: spec }
    let local = null
    if (spec.startsWith('./') || spec.startsWith('../') || spec === '.' || spec === '..') local = posix.normalize(posix.join(posix.dirname(from), spec))
    else {
      for (const a of profile.aliases ?? []) {
        if (a.importerUnder && !from.startsWith(a.importerUnder)) continue
        if (spec === a.from.replace(/\/$/, '') || spec.startsWith(a.from)) {
          local = `${a.to}${spec.slice(a.from.length)}`.replace(/\/$/, '')
          break
        }
      }
      if (local == null) {
        const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
        const pkg = packages.get(name)
        if (!pkg) return { external: name }
        const sub = `.${spec.slice(name.length)}`
        const target = typeof pkg.exports === 'string' ? (sub === '.' ? pkg.exports : null) : pkg.exports?.[sub]
        const t = typeof target === 'object' && target ? (target.import ?? target.default ?? target.types) : target
        local = t ? posix.normalize(posix.join(pkg.dir, t)) : posix.join(pkg.dir, sub)
      }
    }
    if (local.startsWith('../')) return null
    const found = probe(local)
    return found ? place(found) : null
  }
}

// ---------------------------------------------------------------- the graph

/** the edges of the scanned repositories: `id` is `<repo>:<path>`; each edge `{ from, to, names, type, line }` */
export function graphOf(scans) {
  const others = {}
  for (const s of scans) {
    others[s.repo] = new Set(s.files.keys())
    others[`${s.repo}:packages`] = [...s.files.keys()].filter(f => /^packages\/[^/]+\/package\.json$/.test(f)).map(p => ({ path: p, json: JSON.parse(readFileSync(join(s.root, p), 'utf8')) }))
  }
  const edges = []
  const unresolved = []
  for (const s of scans) {
    const resolve = resolverOf(s.repo, [...s.files.keys()], { ...s.profile, root: s.root }, others)
    for (const [path, f] of s.files)
      for (const im of f.imports ?? []) {
        const r = resolve(path, im.spec)
        if (r?.path) edges.push({ from: `${s.repo}:${path}`, to: `${r.repo}:${r.path}`, spec: im.spec, names: im.names, type: im.type, line: im.line })
        else if (!r) unresolved.push({ from: `${s.repo}:${path}`, spec: im.spec })
      }
  }
  const out = new Map()
  const into = new Map()
  for (const e of edges) {
    if (!out.has(e.from)) out.set(e.from, [])
    out.get(e.from).push(e)
    if (!into.has(e.to)) into.set(e.to, [])
    into.get(e.to).push(e)
  }
  return { edges, out, into, unresolved }
}

/** the nodes reached from `roots` by the edges a build keeps (a type-only import is erased: `types` to follow it too),
 *  never entering `cut` nor leaving `alive`; with each node's first parent (a path back) */
export function reach(graph, roots, cut = new Set(), alive = null, { types = false } = {}) {
  const parent = new Map()
  const queue = []
  for (const r of roots) if (!cut.has(r) && !parent.has(r) && (!alive || alive.has(r))) {
    parent.set(r, null)
    queue.push(r)
  }
  for (let i = 0; i < queue.length; i++)
    for (const e of graph.out.get(queue[i]) ?? []) {
      if ((e.type && !types) || cut.has(e.to) || parent.has(e.to) || (alive && !alive.has(e.to))) continue
      parent.set(e.to, queue[i])
      queue.push(e.to)
    }
  return parent
}

/** the path from a root to `node` in a reach's parents */
export function pathTo(parents, node) {
  const p = []
  for (let n = node; n != null; n = parents.get(n)) p.unshift(n)
  return p
}

/** strongly connected components of more than one node among `nodes` (Tarjan's, iterative) */
export function cyclesOf(graph, nodes) {
  const index = new Map()
  const low = new Map()
  const on = new Set()
  const stack = []
  const out = []
  let next = 0
  for (const start of nodes) {
    if (index.has(start)) continue
    const work = [[start, 0]]
    index.set(start, next)
    low.set(start, next++)
    stack.push(start)
    on.add(start)
    while (work.length) {
      const top = work.at(-1)
      const [v, i] = top
      const succ = (graph.out.get(v) ?? []).map(e => e.to).filter(w => nodes.has(w))
      if (i < succ.length) {
        top[1]++
        const w = succ[i]
        if (!index.has(w)) {
          index.set(w, next)
          low.set(w, next++)
          stack.push(w)
          on.add(w)
          work.push([w, 0])
        } else if (on.has(w)) low.set(v, Math.min(low.get(v), index.get(w)))
      } else {
        work.pop()
        if (work.length) {
          const u = work.at(-1)[0]
          low.set(u, Math.min(low.get(u), low.get(v)))
        }
        if (low.get(v) === index.get(v)) {
          const comp = []
          let w
          do {
            w = stack.pop()
            on.delete(w)
            comp.push(w)
          } while (w !== v)
          if (comp.length > 1) out.push(comp.sort())
        }
      }
    }
  }
  return out.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))
}

// ---------------------------------------------------------------- type-checking

/** a tsconfig read as JSON with comments and trailing commas */
function readJsonc(file) {
  const text = readFileSync(file, 'utf8')
  const ranges = commentsByScan(text)
  return JSON.parse(withoutRanges(text, ranges).replace(/,(\s*[}\]])/g, '$1'))
}

/** the projects a repository's `typecheck` script runs: `tsc` alone is its root tsconfig.json; `-p <file>` that one; `-b <dir>`
 *  that one and its references */
export function projectsOf(root) {
  const pkg = existsSync(join(root, 'package.json')) ? JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) : {}
  const script = pkg.scripts?.typecheck ?? ''
  const out = []
  for (const cmd of script.split(/&&|;/)) {
    const m = /\btsc\b(.*)/.exec(cmd)
    if (!m) continue
    const p = /(?:-p|--project)\s+(\S+)/.exec(m[1])
    const b = /(?:-b|--build)\s+(\S+)/.exec(m[1])
    const at = p ? p[1] : b ? b[1] : 'tsconfig.json'
    out.push({ path: at.endsWith('.json') ? at : posix.join(at, 'tsconfig.json'), build: Boolean(b) })
  }
  return out
}

const globRe = (base, pattern) => {
  const full = posix.normalize(posix.join(base, pattern))
  if (!/[*?]/.test(full)) return { prefix: full }
  const re = full
    .split('**/')
    .map(part => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]'))
    .join('(?:.*/)?')
  return { re: new RegExp(`^${re}$`) }
}
const matches = (g, f) => (g.prefix != null ? f === g.prefix || f.startsWith(`${g.prefix === '.' ? '' : `${g.prefix}/`}`) || g.prefix === '.' : g.re.test(f))

/** the files each project of the typecheck reads as TypeScript (its include and files, less its exclude, and every
 *  TypeScript file and declaration their imports reach), and whether any reads JavaScript (`checkJs`) */
export function typeCheckedOf(scan, graph) {
  const files = [...scan.files.keys()]
  const checked = new Set()
  let checkJs = false
  const seen = new Set()
  const project = (path, follow) => {
    if (seen.has(path) || !scan.files.has(path)) return
    seen.add(path)
    let json
    try {
      json = readJsonc(join(scan.root, path))
    } catch {
      return
    }
    let opts = json.compilerOptions ?? {}
    let ext = json.extends
    let from = posix.dirname(path)
    for (let n = 0; ext && n < 5; n++) {
      const p = posix.normalize(posix.join(from, ext))
      if (!existsSync(join(scan.root, p))) break
      const parent = readJsonc(join(scan.root, p))
      opts = { ...(parent.compilerOptions ?? {}), ...opts }
      ext = parent.extends
      from = posix.dirname(p)
    }
    const dir = posix.dirname(path)
    const include = (json.include ?? (json.files ? [] : ['**/*'])).map(i => globRe(dir, i))
    const exclude = (json.exclude ?? ['node_modules']).map(i => globRe(dir, i))
    const js = Boolean(opts.allowJs && opts.checkJs)
    checkJs ||= js
    const readable = f => /\.(?:m|c)?tsx?$/.test(f) || (js && /\.(?:m|c)?jsx?$/.test(f))
    for (const f of [...(json.files ?? []).map(x => posix.normalize(posix.join(dir, x))), ...files.filter(f => include.some(g => matches(g, f)) && !exclude.some(g => matches(g, f)))]) if (readable(f)) checked.add(f)
    if (follow) for (const r of json.references ?? []) project(posix.normalize(posix.join(dir, r.path.endsWith('.json') ? r.path : `${r.path}/tsconfig.json`)), true)
  }
  for (const p of projectsOf(scan.root)) project(p.path, p.build)
  // (what the included files import is read too: a TypeScript file, or a JavaScript module's declaration beside it)
  const queue = [...checked]
  for (let i = 0; i < queue.length; i++)
    for (const e of graph.out.get(`${scan.repo}:${queue[i]}`) ?? []) {
      const [repo, ...rest] = e.to.split(':')
      if (repo !== scan.repo) continue
      let t = rest.join(':')
      if (/\.(?:m|c)?jsx?$/.test(t) && !checkJs) {
        const d = t.replace(/\.(m|c)?jsx?$/, (_, m) => `.d.${m ?? ''}ts`)
        if (!scan.files.has(d)) continue
        t = d
      }
      if (!checked.has(t) && /\.(?:m|c)?tsx?$/.test(t)) {
        checked.add(t)
        queue.push(t)
      }
    }
  return { checked, checkJs, projects: [...seen] }
}

// ---------------------------------------------------------------- scanning a tree

/** a repository's tree read whole: every file's place and facts */
export function scanTree(repo, root, profile, { tokens = true, nodes = null } = {}) {
  const files = new Map()
  for (const path of listFiles(root, profile.exclude ?? [])) {
    const kind = kindOf(path)
    if (kind === 'other' || kind === 'data') {
      if (kind === 'data' && placeOf(path, profile).role === 'product') files.set(path, { path, kind, bytes: statSync(join(root, path)).size, ...placeOf(path, profile), lines: { code: 0, comment: 0, blank: 0 }, imports: [] })
      else if (path.endsWith('package.json') || path.endsWith('tsconfig.json')) files.set(path, { path, kind, ...placeOf(path, profile), lines: { code: 0, comment: 0, blank: 0 }, imports: [] })
      continue
    }
    const text = readFileSync(join(root, path), 'utf8')
    // (`nodes`: a test of a path, the files whose syntax trees and items' nodes are kept; the spread copies what is enumerable)
    const f = factsOf(path, text, { tokens, nodes: Boolean(nodes?.(path)) })
    const kept = { ...f, ...placeOf(path, profile) }
    if (f.ast) Object.defineProperties(kept, { ast: { value: f.ast }, text: { value: text } })
    files.set(path, kept)
  }
  return { repo, root, profile, files }
}
