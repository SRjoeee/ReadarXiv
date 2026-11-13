// lab/rules/sites.mjs: the rule ledger's instrument, its static half (design-reduction-2026-11-13.md §3c, R4). The rules are
// the census's own (lab/release-check/census-lib.mjs factsOf, read with its `nodes` option): every threshold of class tuned
// or borderline and every name list of a product file in RULE_AREAS. For each rule, the places where it decides at run time
// (its sites), and for each file the edits that wrap them in a call of the recorder (recorder.mjs), applied at load time by
// the Node hook (hook.mjs) and the vitest plugin (vitest.mjs): product code is never edited on disk.
//
// A site is one of: `cmp`, a relational comparison whose operand is the rule's literal, or holds the rule's constant (or
// table entry) as the whole operand or inside it; `eq`, an equality against the constant; `mm`, a Math.min or Math.max
// whose argument is the literal or holds the constant; `val`, any other read of a constant (an argument, a factor, a
// property's value: counted, not judged); `list`, `set`, `re`, a list's literal wrapped where it is made, so that every
// membership test of it (has, includes, indexOf, some, find, filter, a regular expression's every match) is seen wherever
// it is made, in this module or another. `newset`: every `new Set(x)` of an instrumented file, so that a set made from a
// list keeps the list's sites. Not shipped.
import { createHash } from 'node:crypto'
import { scanTree, graphOf } from '../release-check/census-lib.mjs'
import { entriesOf } from './pattern.mjs'

export const SITES_FORMAT = 'readarxiv/rule-sites 1'
/** the areas whose rules the ledger holds: the census's debt areas (the prepare, today's and the packages', and the
 *  typesetter) and the translate package (R5d's area, outside the census's headline) */
export const RULE_AREAS = ['today-engine', 'pkg:engine', 'pkg:typeset', 'pkg:translate']
/** the threshold classes the ledger records: a budget (R5e's), a conversion, a structural number and a code are not rules */
const RULE_CLASSES = new Set(['tuned', 'borderline'])
const REL = { '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge' }
const EQ = { '===': 'eq', '!==': 'ne', '==': 'leq', '!=': 'lne' }
const SKIP_KEYS = new Set(['loc', 'start', 'end', 'leadingComments', 'trailingComments', 'innerComments', 'extra', 'range', 'type', 'tokens', 'comments', 'errors'])
const FUNCTION = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ClassMethod', 'ClassPrivateMethod', 'ObjectMethod'])
// (TypeScript's nodes that hold an expression; every other TS node is a type, never run)
const TS_EXPRESSION = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TSTypeAssertion', 'TSInstantiationExpression', 'TSParameterProperty', 'TSEnumDeclaration', 'TSEnumMember', 'TSExportAssignment'])
// (what an operand may pass through between the constant and its comparison while the comparison still reads the constant's
// value: arithmetic, a sign, a cast, parentheses)
const ARITH = new Set(['+', '-', '*', '/', '%', '**'])

/** a file's key: its path without the extension (a module typed from .mjs to .ts keeps its rules' keys) */
export const fileKeyOf = path => path.replace(/\.(?:m|c)?[jt]sx?$/, '')

const walk = (node, visit, parents = []) => {
  if (!node || typeof node.type !== 'string') return
  if (node.type.startsWith('TS') && !TS_EXPRESSION.has(node.type)) return
  if (visit(node, parents) === false) return
  parents.push(node)
  for (const k of Object.keys(node)) {
    if (SKIP_KEYS.has(k) || k === 'typeAnnotation' || k === 'returnType' || k === 'typeParameters' || k === 'superTypeParameters') continue
    const v = node[k]
    if (Array.isArray(v)) for (const x of v) walk(x, visit, parents)
    else if (v && typeof v.type === 'string') walk(v, visit, parents)
  }
  parents.pop()
}

/** a function's name as the census names it: its own, else what it is bound to */
const fnNameOf = (fn, parent) => {
  const own = fn.id?.name ?? (fn.key?.type === 'Identifier' ? fn.key.name : fn.key?.type === 'StringLiteral' ? fn.key.value : fn.key?.id?.name)
  if (own) return own
  if (parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier') return parent.id.name
  if (/^(?:ObjectProperty|ClassProperty|ClassPrivateProperty)$/.test(parent?.type ?? '') && parent.key) return parent.key.name ?? parent.key.value ?? parent.key.id?.name ?? '(anonymous)'
  if (parent?.type === 'AssignmentExpression' && parent.left.type === 'MemberExpression' && !parent.left.computed) return parent.left.property.name
  return '(anonymous)'
}
/** the enclosing function's path, outermost first, '/'-joined; '' at the module's top */
const fnPathOf = parents => {
  const names = []
  for (let i = 0; i < parents.length; i++) if (FUNCTION.has(parents[i].type)) names.push(fnNameOf(parents[i], parents[i - 1]))
  return names.join('/')
}

/** the names a function or the module declares (its parameters, its var, let, const, function and class names, its
 *  imports), nested functions apart: a reference whose name one of these holds is not the module's constant */
const declaredIn = scope => {
  const out = new Set()
  const ids = p => {
    if (!p) return
    if (p.type === 'Identifier') out.add(p.name)
    else if (p.type === 'ObjectPattern') for (const x of p.properties) ids(x.value ?? x.argument)
    else if (p.type === 'ArrayPattern') for (const x of p.elements) ids(x)
    else if (p.type === 'AssignmentPattern') ids(p.left)
    else if (p.type === 'RestElement') ids(p.argument)
    else if (p.type === 'TSParameterProperty') ids(p.parameter)
  }
  if (FUNCTION.has(scope.type)) for (const p of scope.params) ids(p)
  walk(scope.body ?? scope, (n, ps) => {
    if (n !== (scope.body ?? scope) && FUNCTION.has(n.type)) {
      if (n.type === 'FunctionDeclaration') ids(n.id)
      return false
    }
    if (n.type === 'VariableDeclarator') ids(n.id)
    else if (n.type === 'ClassDeclaration') ids(n.id)
    else if (n.type === 'CatchClause') ids(n.param)
  })
  return out
}

/** a comment as one line of text: JSDoc's stars and the line breaks out */
const commentText = c => (c ?? '').replace(/^\s*\*+\s?/gm, '').replace(/\s+/g, ' ').trim()

/** the comment directly before a node, as the census reads a statement's (census-lib.mjs `adjacent`, DEFINITIONS.comments):
 *  nothing but white space and no blank line between, cut where its kind changes (a block comment is the node's alone, else
 *  the run of line comments), a block that opens the file the file's */
const adjacentOf = (text, node) => {
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
const HOLDERS = new Set(['VariableDeclarator', 'FunctionDeclaration', 'ClassMethod', 'ClassPrivateMethod', 'ClassProperty', 'ClassPrivateProperty', 'ObjectMethod', 'ObjectProperty'])
/** the comment on the declaration that holds a rule (its nearest enclosing declaration: a variable's, a function's, a class
 *  member's, an object's property), where that is not the statement the rule stands in (whose comment the census reads):
 *  a pattern inside a predicate declared `const LOOKS_AHEAD = p => { … return … /…/.test(…) }` is held by LOOKS_AHEAD.
 *  `ps`: the rule's node's parents, outermost first */
const holderCommentOf = (text, ps) => {
  const own = ps.findLastIndex(p => /Statement$|Declaration$/.test(p.type))
  for (let i = ps.length - 1; i >= 0; i--) {
    if (!HOLDERS.has(ps[i].type)) continue
    let at = ps[i].type === 'VariableDeclarator' ? i - 1 : i
    if (/^Export(?:Named|Default)Declaration$/.test(ps[at - 1]?.type ?? '')) at -= 1
    if (at <= own && own <= i) return null
    const comment = adjacentOf(text, ps[at])
    // (the holder named, with its lines: the report shows which declaration's comment a citation was read from)
    const n = ps[i]
    const name = n.id?.name ?? n.key?.name ?? n.key?.value ?? '(anonymous)'
    return comment ? { comment, name, lines: (n.loc?.end.line ?? 0) - (n.loc?.start.line ?? 0) + 1 } : null
  }
  return null
}
/** a definition a comment names, more than the words TeX or LaTeX: a file of a TeX distribution, the TeXbook, a standard or
 *  a format (PDF's, ISO's, Unicode's, a font format's), a section (`§7.9.4`); census-lib.mjs CITES_DEFINITION less its bare
 *  `TeX` and `LaTeX` */
const NAMES_DEFINITION = /\bTeXbook\b|[\w@-]+\.(?:sty|cls|clo|def|ltx|bst|bbx|cbx|lbx|fd|cfg|dtx|map|enc|tfm)\b|\bplain\.tex\b|\bPDF(?:'s| spec| reference| \d{5})|\bISO[ -]?\d+|\bUnicode\b|\bUAX ?#?\d+|\bUTS ?#?\d+|\bCLDR\b|\bOpenType\b|\bTrueType\b|\bPostScript\b|\bType ?1\b|\bthe font's\b|\bfont's own\b|\bJIS ?X ?4051\b|\bW3C\b|\b[ckj]lreq\b|\bCSS'?s?\b|\bECMA\b|\bRFC ?\d+|\bIEEE ?754\b|\bPDF\.js's|\bChromium's\b|§\s?\d/
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** whether a holder's comment speaks for the rule (the coordinator's ruling of 2026-11-14, the design's 8.9 condition): it
 *  states the rule's value (a threshold's literal as written, a list's entry as a word) or names the definition the value
 *  comes from; a header that merely mentions TeX or LaTeX speaks for nothing in its body. 'states its value', 'names the
 *  definition', or null */
const holderSpeaks = (comment, { raw = null, entries = null }) => {
  const text = commentText(comment)
  if (raw != null && new RegExp(`(?<![\\w.])${escapeRe(String(raw))}(?![\\w])`).test(text)) return 'states its value'
  if (entries?.some(e => new RegExp(`(?<![A-Za-z@])${escapeRe(e.replace(/^\\/, ''))}(?![A-Za-z@])`).test(text))) return 'states its value'
  return NAMES_DEFINITION.test(text) ? 'names the definition' : null
}
/** a rule's holder as its row shows it, and the comment it adds: none where the holder does not speak for the rule */
const heldBy = (held, value) => {
  if (!held) return { holder: null, adds: '' }
  const read = holderSpeaks(held.comment, value)
  return { holder: { name: held.name, lines: held.lines, read }, adds: read ? held.comment : '' }
}

// ---- budgets (the coordinator's ruling of 2026-11-14). A BUDGET SITE is a comparison of a quantity the code grows itself
// against the rule's bound, where passing the bound only STOPS the work:
// - the quantity: a variable, or its `.length` / `.size` / `.byteLength`, that the scope declaring it grows (`++`, `+=`, an
//   assignment whose value holds it plus a number, `.push`, `.add`, `.set`, `.unshift`, a call handed it plus a number (a
//   depth passed on increased), an assignment inside the loop the comparison guards); or an expression holding a clock's
//   reading (`performance.now()`, `Date.now()`);
// - the stop: the comparison (alone, or a conjunct) is the test of a loop that runs while the quantity is under the bound;
//   or (alone, or a disjunct) the test of an `if` with no `else`, the quantity past the bound, whose branch ends in return,
//   throw, break or continue; or the test, the quantity under the bound, of an `if` with no `else` whose branch adds to that
//   same quantity. A clamp, a floor, a flush, or a branch that computes something else is none.
const LOOPS = new Set(['WhileStatement', 'DoWhileStatement', 'ForStatement'])
const EXITS = new Set(['ReturnStatement', 'ThrowStatement', 'BreakStatement', 'ContinueStatement'])
const APPENDS = ['push', 'add', 'set', 'unshift']
const bare = n => {
  while (n && (n.type === 'ParenthesizedExpression' || TS_EXPRESSION.has(n.type))) n = n.expression
  return n
}
const quantityOf = q => {
  q = bare(q)
  if (q?.type === 'Identifier') return q.name
  if (q?.type === 'MemberExpression' && !q.computed && ['length', 'size', 'byteLength'].includes(q.property.name) && bare(q.object)?.type === 'Identifier') return bare(q.object).name
  return null
}
const holds = (root, test) => {
  let yes = false
  walk(root, n => {
    if (!yes && test(n)) yes = true
  })
  return yes
}
const isClock = n => n.type === 'CallExpression' && n.callee?.type === 'MemberExpression' && ((n.callee.object?.name === 'performance' && n.callee.property?.name === 'now') || (n.callee.object?.name === 'Date' && n.callee.property?.name === 'now'))
const plusOf = (e, name) => holds(e, n => n.type === 'BinaryExpression' && n.operator === '+' && bare(n.left)?.name === name && n.right.type === 'NumericLiteral')
const appendsTo = (root, name) => holds(root, n => n.type === 'CallExpression' && n.callee?.type === 'MemberExpression' && APPENDS.includes(n.callee.property?.name) && bare(n.callee.object)?.name === name)
/** whether `scope` grows `name` itself (`loop`: an assignment inside it counts) */
const grows = (scope, name, loop) => {
  let yes = false
  walk(scope, (n, ps) => {
    if (yes) return false
    if (n.type === 'UpdateExpression' && bare(n.argument)?.name === name) yes = true
    else if (n.type === 'AssignmentExpression' && bare(n.left)?.name === name && (n.operator !== '=' || plusOf(n.right, name) || (loop && ps.includes(loop)))) yes = true
    else if ((n.type === 'CallExpression' || n.type === 'NewExpression') && n.arguments.some(a => a.type === 'BinaryExpression' && a.operator === '+' && bare(a.left)?.name === name && a.right.type === 'NumericLiteral')) yes = true
  })
  return yes || appendsTo(scope, name)
}
/** the scope that declares `name`, from the comparison outward: a function whose parameters or body declare it, else the module */
const declaringScope = (ps, name, program) => {
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i]
    if (!FUNCTION.has(p.type)) continue
    if (p.params.some(x => bare(x.type === 'AssignmentPattern' ? x.left : x)?.name === name) || holds(p.body, n => n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === name)) return p
  }
  return program
}
/** a comparison `node` (its parents `ps`, the rule's operand at `at`) as a budget site: `{ quantity, stops }`, or null */
const budgetOf = (f, node, ps, at) => {
  if (node.type !== 'BinaryExpression' || !REL[node.operator]) return null
  const q = at === 'left' ? node.right : node.left
  const under = (node.operator === '<' || node.operator === '<=') === (at !== 'left')
  let child = node
  let i = ps.length - 1
  const ops = new Set()
  while (i >= 0 && (ps[i].type === 'LogicalExpression' || ps[i].type === 'ParenthesizedExpression')) {
    if (ps[i].type === 'LogicalExpression') ops.add(ps[i].operator)
    child = ps[i--]
  }
  const p = ps[i]
  const name = quantityOf(q)
  const clock = !name && holds(q, isClock)
  if (!name && !clock) return null
  const scope = name ? declaringScope(ps, name, f.ast.program) : null
  const quantity = f.text.slice(q.start, q.end)
  if (p && LOOPS.has(p.type) && p.test === child && !ops.has('||') && under && (clock || grows(scope, name, p))) return { quantity, stops: 'a loop' }
  if (p?.type !== 'IfStatement' || p.test !== child || p.alternate) return null
  const body = p.consequent
  const exits = body?.type === 'BlockStatement' ? EXITS.has(body.body.at(-1)?.type) : EXITS.has(body?.type)
  if (!under && !ops.has('&&') && exits && (clock || grows(scope, name, null))) return { quantity, stops: 'an exit' }
  if (under && !ops.has('||') && name && appendsTo(body, name)) return { quantity, stops: 'adding to it' }
  return null
}

/** the sites of a tree: `scan` a census scan read with `nodes` for these files (census-lib scanTree), `graph` its import
 *  graph (graphOf), `alive` the ids AFTER keeps (or null: unknown). Returns `{ rules, sites, files, keyOfItem }`: rules
 *  keyed as `keyed` says, sites numbered across the tree, each file's edits, and (not for JSON) each census item's key by
 *  the item. `keysOnly`: the rules and their keys alone (the census's reading of the ledger) */
export function sitesOf(scan, graph, { alive = null, areas = RULE_AREAS, keysOnly = false } = {}) {
  // (a package's test support, `packages/<name>/src/testing/` (translate's: fake translators, a scripted fetch), exported
  // only as the package's `./testing` entry and imported by tests and the lab, never by a product module: no product rule)
  const inScope = (p, f) => f.role === 'product' && f.kind === 'code' && !f.generated && areas.includes(f.area) && f.ast && !/^packages\/[^/]+\/src\/testing\//.test(p)
  const files = [...scan.files].filter(([p, f]) => inScope(p, f)).sort((a, b) => a[0].localeCompare(b[0]))
  const rules = {}
  const sites = []
  const edits = new Map(files.map(([p]) => [p, []]))
  const fileOf = p => scan.files.get(p)
  const id = p => `${scan.repo}:${p}`

  // ---- the rules: the census's items, keyed
  const ordinals = new Map()
  // (a key: the file without its extension, the enclosing function's path ('(top)' at the module's top), the rule's
  // signature, and for any rule but a module constant the ordinal among its file's and function's rules of that signature)
  const keyed = (fk, fn, sig) => {
    const k = `${fk}::${fn || '(top)'}::${sig}`
    const n = (ordinals.get(k) ?? 0) + 1
    ordinals.set(k, n)
    return `${k}#${n}`
  }
  /** a module constant's rule (or a table entry's): by name; everything else by function, signature and ordinal */
  const constants = new Map() // `${path}\u0000${name}` -> [rule] (a table: one rule a property)
  const literalRules = new Map() // the literal node -> rule
  const listRules = []
  const keyOfItem = new Map() // a census item (factsOf's object) -> its rule's key
  const parentsOf = new Map()
  for (const [path, f] of files) {
    const fk = fileKeyOf(path)
    // (the parents of the nodes the rules stand in: for the function path)
    const wanted = new Set([...(f.thresholds ?? []).map(t => t.nodes?.site).filter(Boolean), ...(f.lists ?? []).map(l => l.nodes?.literal).filter(Boolean)])
    if (wanted.size)
      walk(f.ast.program, (n, ps) => {
        if (wanted.has(n)) parentsOf.set(n, ps.slice())
      })
    for (const t of f.thresholds ?? []) {
      if (!RULE_CLASSES.has(t.class) || !t.nodes) continue
      const base = { kind: 'threshold', file: path, line: t.line, value: t.value, raw: t.raw, class: t.class, context: t.context, name: t.name ?? null, other: t.other ?? null, comment: commentText(t.nodes.comment), reason: t.reason, evidence: t.evidence, cites: t.cites, area: f.area, after: alive ? alive.has(id(path)) : null, sites: [] }
      if (t.context === 'constant' || t.context === 'table') {
        const key = `${fk}::(top)::${t.name}`
        rules[key] = { key, ...base, fn: '' }
        keyOfItem.set(t, key)
        const bind = t.name.split('.')[0]
        const k = `${path}\u0000${bind}`
        constants.set(k, [...(constants.get(k) ?? []), rules[key]])
      } else {
        const ps = parentsOf.get(t.nodes.site) ?? []
        const op = t.context === 'comparison' ? t.nodes.site.operator : t.context.slice(5)
        const key = keyed(fk, fnPathOf(ps), `${op}${t.raw}`)
        // (its citation read from its statement's comment and the comment on the declaration that holds it)
        const held = heldBy(holderCommentOf(f.text, ps), { raw: t.raw })
        rules[key] = { key, ...base, comment: commentText(`${t.nodes.comment ?? ''}\n${held.adds}`), ...(held.holder ? { holder: held.holder } : {}), fn: fnPathOf(ps) }
        literalRules.set(t.nodes.literal, rules[key])
        keyOfItem.set(t, key)
      }
    }
    for (const l of f.lists ?? []) {
      if (!l.nodes) continue
      const ps = parentsOf.get(l.nodes.literal) ?? []
      const fnPath = fnPathOf(ps)
      const held = heldBy(holderCommentOf(f.text, ps), { entries: l.nodes.entries })
      // (a list by the name of the declaration it stands in, else by its first two entries)
      const key = keyed(fk, fnPath, l.name ?? `${l.form}[${l.nodes.entries.slice(0, 2).join(',')}]`)
      rules[key] = { key, kind: 'list', file: path, line: l.line, form: l.form, name: l.name ?? null, size: l.size, entries: l.nodes.entries, class: l.class, comment: commentText(`${l.nodes.comment ?? ''}\n${held.adds}`), ...(held.holder ? { holder: held.holder } : {}), area: f.area, after: alive ? alive.has(id(path)) : null, fn: fnPath, sites: [] }
      keyOfItem.set(l, key)
      listRules.push({ path, rule: rules[key], node: l.nodes.literal, parent: l.nodes.parent })
    }
  }

  if (keysOnly) return { rules, sites, files: {}, keyOfItem }

  // ---- what each file's names import: local name -> { path, name } of its definer, through re-exports
  const edgeOf = (fromPath, spec) => (graph.out.get(id(fromPath)) ?? []).find(e => e.spec === spec)
  const definerOf = (path, name, depth = 0) => {
    const f = fileOf(path)
    if (!f || depth > 20) return null
    if ((f.exports ?? []).some(e => e.name === name)) return { path, name }
    for (const r of f.reexports ?? []) {
      if (r.star || r.exported !== name) continue
      const e = edgeOf(path, r.spec)
      return e?.to.startsWith(`${scan.repo}:`) ? definerOf(e.to.slice(scan.repo.length + 1), r.local, depth + 1) : null
    }
    for (const r of f.reexports ?? []) {
      if (!r.star) continue
      const e = edgeOf(path, r.spec)
      if (!e?.to.startsWith(`${scan.repo}:`)) continue
      const d = definerOf(e.to.slice(scan.repo.length + 1), name, depth + 1)
      if (d) return d
    }
    return null
  }
  const importsOf = (path, f) => {
    const named = new Map()
    const spaces = new Map()
    for (const s of f.ast.program.body) {
      if (s.type !== 'ImportDeclaration' || s.importKind === 'type') continue
      const e = edgeOf(path, s.source.value)
      if (!e?.to.startsWith(`${scan.repo}:`)) continue
      const to = e.to.slice(scan.repo.length + 1)
      for (const x of s.specifiers) {
        if (x.importKind === 'type') continue
        if (x.type === 'ImportNamespaceSpecifier') spaces.set(x.local.name, to)
        else {
          const d = definerOf(to, x.type === 'ImportDefaultSpecifier' ? 'default' : (x.imported.name ?? x.imported.value))
          if (d) named.set(x.local.name, d)
        }
      }
    }
    return { named, spaces }
  }

  // ---- sites
  const add = (path, site) => {
    site.id = sites.length
    site.file = path
    sites.push(site)
    for (const r of site.rules) rules[r].sites.push(site.id)
    return site.id
  }
  // (a token between two offsets: the first whose start is at or past `from`, by halving)
  const tokenAt = (f, from, to, ops) => {
    const ts = f.ast.tokens ?? []
    let lo = 0
    let hi = ts.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (ts[mid].start < from) lo = mid + 1
      else hi = mid
    }
    for (let i = lo; i < ts.length && ts[i].end <= to; i++) {
      const t = ts[i]
      const label = typeof t.type === 'string' ? t.type : t.type?.label
      if (ops.includes(t.value) || ops.includes(label)) return t
    }
    return null
  }
  const lineOf = n => n.loc?.start.line ?? null
  /** a comparison's or call's site, made once and shared by every rule it holds; its edits written once */
  const siteByNode = new Map()
  const decisionSite = (path, f, node, ps, kind) => {
    if (siteByNode.has(node)) return siteByNode.get(node)
    let site
    if (kind === 'cmp' || kind === 'eq') {
      const table = kind === 'cmp' ? REL : EQ
      const tok = tokenAt(f, node.left.end, node.right.start, [node.operator])
      if (!tok) return null
      site = { kind, op: node.operator, call: table[node.operator], line: lineOf(node), fn: fnPathOf(ps), rules: [], bounds: [] }
      add(path, site)
      edits.get(path).push({ at: node.start, end: node.end, pre: `__axtRules.${site.call}(${site.id}, `, post: ')' }, { replace: [tok.start, tok.end], text: ',' })
    } else {
      // (Math.min / Math.max: the callee and its opening parenthesis replaced by the recorder's call)
      const open = tokenAt(f, node.callee.end, node.arguments[0]?.start ?? node.end, ['('])
      if (!open || node.optional || node.arguments.some(a => a.type === 'SpreadElement')) return null
      site = { kind: 'mm', op: node.callee.property.name, call: node.callee.property.name === 'min' ? 'mn' : 'mx', args: node.arguments.length, line: lineOf(node), fn: fnPathOf(ps), rules: [], bounds: [] }
      add(path, site)
      edits.get(path).push({ replace: [node.callee.start, open.end], text: `__axtRules.${site.call}(${site.id}, ` })
    }
    siteByNode.set(node, site)
    return site
  }
  const bind = (site, rule, bound) => {
    if (!site.rules.includes(rule.key)) {
      site.rules.push(rule.key)
      rule.sites.push(site.id)
    }
    site.bounds.push({ rule: rule.key, ...bound })
  }

  // (1) the literals of comparisons and of Math.min / Math.max
  for (const [path, f] of files)
    for (const t of f.thresholds ?? []) {
      const rule = literalRules.get(t.nodes?.literal)
      if (!rule) continue
      const ps = parentsOf.get(t.nodes.site) ?? []
      const site = decisionSite(path, f, t.nodes.site, ps, t.context === 'comparison' ? 'cmp' : 'mm')
      if (!site) {
        rule.unsited = 'a form the instrument does not wrap (a spread argument, an optional call)'
        continue
      }
      const at = t.context === 'comparison' ? (t.nodes.site.left === t.nodes.literal ? 'left' : 'right') : t.nodes.site.arguments.indexOf(t.nodes.literal)
      const budget = site.kind === 'cmp' ? budgetOf(f, t.nodes.site, ps, at) : null
      bind(site, rule, { at, shape: 'direct', value: t.value, ...(budget ? { budget } : {}) })
    }

  // (2) the constants' references, in their module and in every module that imports them
  /** what a reference's value meets on its way up: a comparison, an equality, a Math.min / max, or a plain read; the
   *  operand's shape between the reference and the comparison (`direct`, `scale`, `inverse`, `shift+`, `shift-`, `other`) */
  const usageOf = (ref, ps) => {
    let child = ref
    let shape = 'direct'
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]
      if (p.type === 'BinaryExpression' && REL[p.operator]) return { kind: 'cmp', node: p, at: p.left === child ? 'left' : 'right', shape, ps: ps.slice(0, i) }
      if (p.type === 'BinaryExpression' && EQ[p.operator]) return shape === 'direct' ? { kind: 'eq', node: p, at: p.left === child ? 'left' : 'right', shape, ps: ps.slice(0, i) } : { kind: 'val' }
      if (p.type === 'CallExpression' && p.callee?.type === 'MemberExpression' && p.callee.object?.name === 'Math' && ['min', 'max'].includes(p.callee.property?.name) && p.arguments.includes(child)) return { kind: 'mm', node: p, at: p.arguments.indexOf(child), shape, ps: ps.slice(0, i) }
      if (p.type === 'ParenthesizedExpression' || TS_EXPRESSION.has(p.type)) {
        child = p
        continue
      }
      if (p.type === 'UnaryExpression' && (p.operator === '-' || p.operator === '+')) {
        shape = 'other'
        child = p
        continue
      }
      if (p.type === 'BinaryExpression' && ARITH.has(p.operator)) {
        const left = p.left === child
        // (one step's shape: a factor keeps a scale, a divisor inverts it; a term shifts; anything else, or a mix, is other)
        const step = p.operator === '*' ? 'scale' : p.operator === '/' ? (left ? 'scale' : 'inverse') : p.operator === '+' ? 'shift+' : p.operator === '-' ? (left ? 'shift+' : 'shift-') : 'other'
        shape = shape === 'direct' ? step : shape === step && (step === 'scale' || step === 'shift+') ? step : (shape === 'scale' && step === 'inverse') || (shape === 'inverse' && step === 'scale') ? 'inverse' : 'other'
        child = p
        continue
      }
      return { kind: 'val' }
    }
    return { kind: 'val' }
  }
  // (a table read by a key known at run time: one `key` site for every entry of the table, recording each key read (the
  // entry it read is that entry's hit), or each key tested (`Object.hasOwn`: found, the entry's hit). A member written,
  // deleted or called is no read the instrument may wrap)
  const keySite = (path, rs, node, ps) => {
    const site = { kind: 'key', line: lineOf(node), fn: fnPathOf(ps), rules: [], bounds: [] }
    add(path, site)
    for (const r of rs) bind(site, r, { shape: 'key', key: r.name.slice(r.name.indexOf('.') + 1) })
    return site
  }
  const keyRead = (path, f, rs, member, ps) => {
    const up = ps.at(-2)
    if ((up?.type === 'AssignmentExpression' && up.left === member) || up?.type === 'UpdateExpression' || (up?.type === 'UnaryExpression' && up.operator === 'delete') || ((up?.type === 'CallExpression' || up?.type === 'OptionalCallExpression' || up?.type === 'NewExpression') && up.callee === member)) {
      for (const r of rs) r.unwrapped = (r.unwrapped ?? 0) + 1
      return false
    }
    const site = keySite(path, rs, member, ps.slice(0, -1))
    edits.get(path).push({ at: member.start, end: member.end, pre: `__axtRules.tk(${site.id}, `, post: '' }, { replace: [member.object.end, member.property.start], text: ', ' }, { replace: [member.property.end, member.end], text: ')' })
    return false
  }
  const keyTest = (path, f, rs, call, ps) => {
    const open = tokenAt(f, call.callee.end, call.arguments[0].start, ['('])
    if (!open) return false
    const site = keySite(path, rs, call, ps.slice(0, -1))
    edits.get(path).push({ replace: [call.callee.start, open.end], text: `__axtRules.th(${site.id}, ` })
    return false
  }
  for (const [path, f] of files) {
    const { named, spaces } = importsOf(path, f)
    // (the constants this file may name: its own, and those its imports bind, by local name)
    const local = new Map()
    for (const [k, rs] of constants) {
      const [p, name] = k.split('\u0000')
      if (p === path) local.set(name, rs)
    }
    for (const [loc, d] of named) {
      const rs = constants.get(`${d.path}\u0000${d.name}`)
      if (rs) local.set(loc, rs)
    }
    const spaceRules = new Map()
    for (const [ns, to] of spaces) for (const [k, rs] of constants) if (k.startsWith(`${to}\u0000`)) spaceRules.set(`${ns}.${k.split('\u0000')[1]}`, rs)
    if (!local.size && !spaceRules.size) continue
    const shadowed = new Map()
    const seen = new WeakSet()
    const isShadowed = (name, ps) =>
      ps.some(p => {
        if (p.type === 'CatchClause') return p.param?.type === 'Identifier' && p.param.name === name
        if (!FUNCTION.has(p.type)) return false
        if (!shadowed.has(p)) shadowed.set(p, declaredIn(p))
        return shadowed.get(p).has(name)
      })
    walk(f.ast.program, (n, ps) => {
      let rs = null
      let ref = n
      let entry = null
      if (n.type === 'Identifier' && local.has(n.name)) {
        const par = ps.at(-1)
        // (a name that is not a read: a declaration, an import or export's name, a property's key, a member's name)
        if (par?.type === 'VariableDeclarator' && par.id === n) return
        if (/^(?:Import|Export)(?:Default|Namespace)?Specifier$/.test(par?.type ?? '')) return
        if ((par?.type === 'MemberExpression' || par?.type === 'OptionalMemberExpression') && par.property === n && !par.computed) return
        if (/^(?:ObjectProperty|ClassProperty|ObjectMethod|ClassMethod)$/.test(par?.type ?? '') && par.key === n && !par.computed && !par.shorthand) return
        // (a shorthand property `{ GAP }`: its key and its value are two nodes at one place; the value is the read, once)
        if (par?.type === 'ObjectProperty' && par.shorthand && par.key === n && par.value !== n) return
        if (seen.has(n)) return
        seen.add(n)
        if (isShadowed(n.name, ps)) return
        rs = local.get(n.name)
        // (a table's entry: its member read; read by a key known at run time (`T[x]`, `Object.hasOwn(T, x)`), a `key`
        // site of every entry, which records the key; the table read whole is a read of every entry)
        if (rs.length > 1 || rs[0].name.includes('.')) {
          const member = (par?.type === 'MemberExpression' || par?.type === 'OptionalMemberExpression') && par.object === n
          if (member && par.computed && par.property.type !== 'StringLiteral') return keyRead(path, f, rs, par, ps)
          if (par?.type === 'CallExpression' && !par.optional && par.arguments[0] === n && par.arguments.length === 2 && par.callee?.type === 'MemberExpression' && !par.callee.computed && par.callee.object?.name === 'Object' && par.callee.property?.name === 'hasOwn') return keyTest(path, f, rs, par, ps)
          if (member) {
            const prop = par.computed ? par.property.value : par.property.name
            entry = rs.find(r => r.name.endsWith(`.${prop}`))
            if (!entry) return
            ref = par
            rs = [entry]
          } else {
            for (const r of rs) r.wholeReads = (r.wholeReads ?? 0) + 1
            return
          }
        }
      } else if (n.type === 'MemberExpression' && !n.computed && n.object.type === 'Identifier' && spaceRules.has(`${n.object.name}.${n.property.name}`)) {
        rs = spaceRules.get(`${n.object.name}.${n.property.name}`)
        if (rs.length > 1) return
      } else return
      const rule = rs[0]
      const rps = ref === n ? ps : ps.slice(0, -1)
      const use = usageOf(ref, rps)
      if (use.kind === 'val') {
        const par = rps.at(-1)
        // (a member written, deleted or called is no read the instrument may wrap)
        if ((par?.type === 'AssignmentExpression' && par.left === ref) || par?.type === 'UpdateExpression' || (par?.type === 'UnaryExpression' && par.operator === 'delete') || ((par?.type === 'CallExpression' || par?.type === 'NewExpression') && par.callee === ref)) {
          rule.unwrapped = (rule.unwrapped ?? 0) + 1
          return false
        }
        const site = { kind: 'val', line: lineOf(ref), fn: fnPathOf(rps), rules: [], bounds: [] }
        add(path, site)
        bind(site, rule, { shape: 'read' })
        const src = f.text.slice(ref.start, ref.end)
        if (par?.type === 'ObjectProperty' && par.shorthand && par.value === ref) edits.get(path).push({ at: ref.start, end: ref.end, pre: `${src}: __axtRules.v(${site.id}, `, post: ')' })
        else edits.get(path).push({ at: ref.start, end: ref.end, pre: `__axtRules.v(${site.id}, `, post: ')' })
        return false
      }
      const site = decisionSite(path, f, use.node, use.ps, use.kind)
      if (!site) {
        rule.unsited = 'a form the instrument does not wrap (a spread argument, an optional call)'
        return false
      }
      const budget = use.kind === 'cmp' ? budgetOf(f, use.node, use.ps, use.at) : null
      bind(site, rule, { at: use.at, shape: use.shape, value: rule.value, ...(budget ? { budget } : {}) })
      return false
    })
  }

  // (3) the lists: each literal wrapped where it is made; a Set made of one, the Set
  for (const { path, rule, node, parent } of listRules) {
    if (node.type === 'RegExpLiteral') {
      // (its entries read from its structure, and its shadow: pattern.mjs)
      const e = entriesOf(node.pattern, node.flags)
      const alts = { words: e.words.map(w => ({ w: w.word, ...(w.look ? { look: w.look } : {}), ...(w.repeated ? { rep: true } : {}) })), shadow: e.shadow, marks: e.marks, ...(e.why ? { why: e.why } : {}) }
      const site = { kind: 're', line: lineOf(node), fn: fnPathOf(parentsOf.get(node) ?? []), rules: [], bounds: [], entries: rule.entries, flags: node.flags, alts }
      add(path, site)
      bind(site, rule, { shape: 'list' })
      edits.get(path).push({ at: node.start, end: node.end, pre: `__axtRules.re(${site.id}, `, post: ')' })
      continue
    }
    const inSet = parent?.type === 'NewExpression' && parent.callee?.type === 'Identifier' && parent.callee.name === 'Set' && parent.arguments[0] === node
    const target = inSet ? parent : node
    const site = { kind: inSet ? 'set' : 'list', line: lineOf(node), fn: fnPathOf(parentsOf.get(node) ?? []), rules: [], bounds: [], entries: rule.entries }
    add(path, site)
    bind(site, rule, { shape: 'list' })
    edits.get(path).push({ at: target.start, end: target.end, pre: `__axtRules.${inSet ? 'st' : 'ls'}(${site.id}, `, post: ')', listNode: inSet })
  }
  // (4) every other `new Set(x)` of an instrumented file: a Set made from a list (or from lists spread) keeps their sites
  for (const [path, f] of files) {
    const text = f.text
    walk(f.ast.program, n => {
      if (n.type !== 'NewExpression' || n.callee?.type !== 'Identifier' || n.callee.name !== 'Set' || !n.arguments.length) return
      if (edits.get(path).some(e => e.listNode && e.at === n.start)) return
      const a = n.arguments[0]
      const sources = a.type === 'ArrayExpression' ? a.elements.filter(e => e?.type === 'SpreadElement').map(e => e.argument) : [a]
      const plain = sources.filter(s => s.type === 'Identifier' || (s.type === 'MemberExpression' && !s.computed && s.object.type === 'Identifier'))
      if (!plain.length) return
      // (the making iterates each list it is made of once: hushed, so that a list copied into a Set reads as the Set's
      // membership tests, not as iterated)
      const named = plain.map(s => text.slice(s.start, s.end)).join(', ')
      edits.get(path).push({ at: n.start, end: n.end, pre: `__axtRules.ns((__axtRules.hush(${named}), `, post: `), ${named})` })
    })
  }

  // (5) the lists' reads the recorder cannot see. The recorder sees a list through its object: every method of an array, a
  // Set or a pattern, its iteration, a string's methods that consume a pattern, wherever the object is handed. What reads the
  // entries without the object's methods is not seen: an entry read by its index (`L[i]`), the platform copying the entries
  // (`JSON.stringify(L)`, `structuredClone(L)`, `Object.values(L)` and Object's and Reflect's other readers but freeze,
  // `X.concat(L)`, a method borrowed onto it (`Array.prototype.includes.call(L, x)`, `.apply(L, …)`), a pattern made of it
  // (`new RegExp(L)`). Each such read of a list's binding (its module's, and through every import of it) or of the literal
  // itself is noted on the rule (`unseen`): its entries cannot be judged by their hits (ledger.mjs: not judged)
  const unseenOf = (ref, ps) => {
    let child = ref
    let i = ps.length - 1
    while (i >= 0 && (ps[i].type === 'ParenthesizedExpression' || TS_EXPRESSION.has(ps[i].type))) child = ps[i--]
    const p = ps[i]
    if (!p) return null
    if ((p.type === 'MemberExpression' || p.type === 'OptionalMemberExpression') && p.object === child && p.computed && p.property.type !== 'StringLiteral') return 'index'
    if (!/^(?:Call|OptionalCall|New)Expression$/.test(p.type) || !p.arguments.includes(child)) return null
    const c = p.callee
    if (c.type === 'Identifier' && (c.name === 'RegExp' || c.name === 'structuredClone')) return c.name
    if (c.type !== 'MemberExpression' || c.computed) return null
    const m = c.property.name
    const o = c.object.type === 'Identifier' ? c.object.name : null
    if (o === 'JSON' || o === 'Reflect' || (o === 'Object' && m !== 'freeze' && m !== 'isFrozen')) return `${o}.${m}`
    if (m === 'concat' || ((m === 'call' || m === 'apply') && p.arguments[0] === child)) return m
    return null
  }
  // (a list's binding: `const NAME = <literal>`, through `new Set(…)`, `Object.freeze(…)`, a cast or parentheses)
  const bindingOf = (node, ps) => {
    let holder = node
    let i = ps.length - 1
    const through = () => {
      while (i >= 0 && (ps[i].type === 'ParenthesizedExpression' || TS_EXPRESSION.has(ps[i].type))) holder = ps[i--]
    }
    through()
    if (ps[i]?.type === 'NewExpression' && ps[i].callee?.name === 'Set' && ps[i].arguments[0] === holder) holder = ps[i--]
    through()
    if (ps[i]?.type === 'CallExpression' && ps[i].callee?.type === 'MemberExpression' && ps[i].callee.object?.name === 'Object' && ps[i].callee.property?.name === 'freeze' && ps[i].arguments[0] === holder) holder = ps[i--]
    through()
    const d = ps[i]
    if (d?.type !== 'VariableDeclarator' || d.init !== holder || d.id.type !== 'Identifier') return { holder, at: i }
    const scope = ps.slice(0, i).findLast(p => FUNCTION.has(p.type)) ?? null
    return { holder, at: i, name: d.id.name, decl: d, scope }
  }
  const readsOfName = (root, name, decl, note) => {
    const shadowed = new Map()
    walk(root, (n, ps) => {
      if (n.type !== 'Identifier' || n.name !== name || n === decl?.id) return
      const par = ps.at(-1)
      if ((par?.type === 'MemberExpression' || par?.type === 'OptionalMemberExpression') && par.property === n && !par.computed) return
      if (/^(?:ObjectProperty|ClassProperty|ObjectMethod|ClassMethod)$/.test(par?.type ?? '') && par.key === n && !par.computed && !par.shorthand) return
      if (/Specifier$/.test(par?.type ?? '') || (par?.type === 'VariableDeclarator' && par.id === n)) return
      const inner = ps.filter(p => FUNCTION.has(p.type) && p !== root)
      if (
        inner.some(p => {
          if (!shadowed.has(p)) shadowed.set(p, declaredIn(p))
          return shadowed.get(p).has(name)
        })
      )
        return
      note(n, ps)
    })
  }
  for (const { path, rule, node } of listRules) {
    const f = fileOf(path)
    const ps = parentsOf.get(node) ?? []
    const found = []
    const note = file => (n, nps) => {
      const form = unseenOf(n, nps)
      if (form) found.push(`${form} ${file}:${lineOf(n)}`)
    }
    const b = bindingOf(node, ps)
    if (!b.name) {
      const form = unseenOf(b.holder, ps.slice(0, b.at + 1))
      if (form) found.push(`${form} ${path}:${lineOf(b.holder)}`)
    } else {
      readsOfName(b.scope ?? f.ast.program, b.name, b.decl, note(path))
      // (a module's own binding, read where it is imported: by name, or as a namespace's member)
      if (!b.scope)
        for (const [p2, f2] of files) {
          if (p2 === path) continue
          const { named, spaces } = importsOf(p2, f2)
          for (const [local, d] of named) if (d.path === path && d.name === b.name) readsOfName(f2.ast.program, local, null, note(p2))
          for (const [ns, to] of spaces)
            if (to === path)
              walk(f2.ast.program, (n, nps) => {
                if (n.type === 'MemberExpression' && !n.computed && n.object.type === 'Identifier' && n.object.name === ns && n.property.name === b.name) note(p2)(n, nps)
              })
        }
    }
    if (found.length) rule.unseen = [...new Set(found)].sort()
  }

  const out = { rules, sites, files: {} }
  Object.defineProperty(out, 'keyOfItem', { value: keyOfItem })
  // (each module's importers among the product files: what would exercise a module no input loads)
  const importersOf = path => [...new Set((graph.into?.get(id(path)) ?? []).map(e => e.from).filter(f => f.startsWith(`${scan.repo}:`) && scan.files.get(f.slice(scan.repo.length + 1))?.role === 'product').map(f => f.slice(scan.repo.length + 1)))].sort()
  for (const [path, f] of files) out.files[path] = { sha256: createHash('sha256').update(f.text).digest('hex'), edits: edits.get(path), sites: sites.filter(s => s.file === path).map(s => s.id), importers: importersOf(path) }
  return out
}

/** the sites of a checkout: its scan with the nodes of the rule areas' files kept, its graph, AFTER's ids where `alive`
 *  is given (a set of ids) */
export function sitesOfTree(root, profile, { alive = null, areas = RULE_AREAS } = {}) {
  const inArea = p => profile.areas.find(a => p.startsWith(a.prefix))
  const scan = scanTree('engine', root, profile, { tokens: true, nodes: p => areas.includes(inArea(p)?.area) && inArea(p)?.role === 'product' })
  const graph = graphOf([scan])
  return { scan, graph, ...sitesOf(scan, graph, { alive, areas }) }
}

/** the site map as written to sites.json: everything but the scan. Its digest is of what a record indexes (the sites and
 *  each module's edits): a rule's description may change and the records made over the map still read */
export function siteMapOf(s, { commit = null } = {}) {
  const map = { format: SITES_FORMAT, commit, rules: s.rules, sites: s.sites, files: s.files }
  const indexed = Object.fromEntries(Object.entries(map.files).map(([p, f]) => [p, { sha256: f.sha256, edits: f.edits, sites: f.sites }]))
  map.digest = createHash('sha256').update(JSON.stringify([map.sites, indexed])).digest('hex').slice(0, 16)
  return map
}
