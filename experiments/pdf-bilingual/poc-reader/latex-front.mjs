// C1 front end, spike: a LaTeX project → prose units with byte ranges and placeholders → the same project with each unit's
// range replaced by its translation, everything else byte for byte. The approach the evidence favours (REPORT §4 and the
// second addendum): patch source ranges in place, mask math, citations, references and unknown commands, send whole
// paragraphs. Not a parser: a scanner that knows which constructs carry prose and treats everything else as opaque.
// Runs the same in Node (the spikes) and in the browser (the reader): a project's files come as a file system of two
// operations (`folder` for a directory under Node, `inMemory` for an unpacked source), and bytes are Uint8Arrays.

// ---------------------------------------------------------------- files and bytes
const nodeFs = typeof process !== 'undefined' && process.versions?.node ? await import('node:fs') : null
/** a directory under Node, as a project's file system: { list(): relative paths, read(path): bytes or null } */
export function folder(dir) {
  const { readdirSync, readFileSync } = nodeFs
  const walk = rel => readdirSync(rel ? `${dir}/${rel}` : dir, { withFileTypes: true }).flatMap(e => { const p = rel ? `${rel}/${e.name}` : e.name; return e.isDirectory() ? walk(p) : [p] })
  let names = null
  return { list: () => (names ??= walk('')), read: p => { try { return readFileSync(`${dir}/${p}`) } catch { return null } } }
}
/** unpacked files (a Map of relative path → bytes) as a project's file system */
export function inMemory(map) { return { list: () => [...map.keys()], read: p => map.get(p) ?? null } }
const asFiles = root => (typeof root === 'string' ? folder(root) : root)
/** a/./b/../c → a/c */
export const normalizePath = p => { const out = []; for (const seg of p.split('/')) { if (!seg || seg === '.') continue; if (seg === '..') out.pop(); else out.push(seg) } return out.join('/') }
/** bytes as a string of the same code units (latin1, byte for byte): the scanner's view of a source */
export const latin1 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return s }
export const latin1Bytes = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff; return b }
const utf8Bytes = s => new TextEncoder().encode(s)
const bytesOf = (s, enc) => (enc === 'utf8' ? utf8Bytes(s) : latin1Bytes(s))
const concat = parts => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out }

// ---------------------------------------------------------------- what carries prose
const HEADINGS = new Set(['part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph', 'title'])
const OWN_UNIT_ARG = new Set(['caption', 'subcaption', 'subcaptionbox', 'footnote', 'thanks', 'abstract', 'keywords']) // the argument is a unit of its own
const CAPTIONS = new Set(['caption', 'subcaption', 'subcaptionbox'])
const INLINE_TEXT = new Set(['textbf', 'textit', 'emph', 'textsl', 'textsc', 'underline', 'textup', 'textrm', 'textsf', 'textmd', 'uline'])
// commands whose last required argument is typeset as it stands — a scaled table, a boxed or coloured phrase, a TikZ
// picture fitted to the column — by how many required arguments they take, that one included. The others (a width,
// an angle, a colour) stay as they are
const CONTENT_BOX = new Map([['resizebox', 3], ['scalebox', 2], ['adjustbox', 2], ['rotatebox', 2], ['raisebox', 2], ['fbox', 1], ['mbox', 1], ['framebox', 1], ['makebox', 1], ['parbox', 2], ['colorbox', 2], ['fcolorbox', 3], ['textcolor', 2]])
const MATH_ENVS = /^(equation|align|alignat|gather|multline|flalign|eqnarray|math|displaymath|dmath|IEEEeqnarray|subequations)\*?$/
const SKIP_ENVS = /^(verbatim|Verbatim|lstlisting|minted|comment|tcblisting|tcboutputlisting|alltt|BVerbatim|LVerbatim|tikzpicture|pgfpicture|forest|array|algorithmic|algorithm2e|thebibliography|bibdiv|biblist|filecontents|picture|asy|pspicture|axis|circuitikz|dot2tex|pythontex|sagesilent)\*?$/
const ACCENTS = new Set(["'", '`', '"', '^', '~', '=', '.', 'u', 'v', 'H', 'c', 'd', 'b', 't', 'r', 'k'])
// a number with an optional unit; spaces and tabs only, never a line end — the next line is not the command's
const DIMEN = String.raw`[-+]?[ \t]*(?:\d+(?:\.\d*)?|\.\d+)[ \t]*(?:true[ \t]*)?(?:pt|em|ex|cm|mm|in|bp|sp|pc|dd|cc|mu|fill?l?|\\[A-Za-z@]+)?`
// \looseness=-1, \parindent=\z@, \vskip 3pt plus 1fil, \penalty-100: a number, or = followed by a value; and the
// relation of a comparison, \ifdim\lastskip>0pt, \ifnum\value{x}<3
const ASSIGNMENT = new RegExp(String.raw`^[ \t]*(?:[=<>][ \t]*(?:${DIMEN}|\\[A-Za-z@]+)|${DIMEN})(?:[ \t]*(?:plus|minus)[ \t]*${DIMEN})*(?![A-Za-z])`)
// \hrule height 0.9pt, \vrule width .4pt depth 2pt: a rule's own keywords and sizes
const RULE_SPEC = new RegExp(String.raw`^(?:[ \t]*(?:height|depth|width)[ \t]*${DIMEN})+(?![A-Za-z])`)
const TABLE_ENVS = /^(tabular|tabularx|tabular\*|longtable|tabu|tabulary|supertabular|xtabular)\*?$/

// ---------------------------------------------------------------- scanning primitives
const isLetter = c => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '@'
function commandAt(s, i) { // s[i] === '\\'
  let j = i + 1
  if (j < s.length && isLetter(s[j])) { while (j < s.length && isLetter(s[j])) j++; if (s[j] === '*') j++; return { name: s.slice(i + 1, j).replace(/\*$/, ''), end: j } }
  return { name: s[j] ?? '', end: j + 1 }
}
function skipComment(s, i) { while (i < s.length && s[i] !== '\n') i++; return i }
function matchGroup(s, i, open = '{', close = '}') { // s[i] === open; returns index after the matching close, or -1
  let depth = 0
  for (let j = i; j < s.length; j++) {
    const c = s[j]
    if (c === '\\') { j++; continue }
    if (c === '%') { j = skipComment(s, j); continue }
    if (c === open) depth++
    else if (c === close && --depth === 0) return j + 1
  }
  return -1
}
/** spaces and tabs, and at most one line end: TeX lets an argument follow on the next line, but a blank line is \par */
function skipSpaces(s, i) {
  let lines = 0
  while (i < s.length) {
    if (s[i] === ' ' || s[i] === '\t') i++
    else if (s[i] === '\n' && lines === 0) { lines++; i++ }
    else break
  }
  return i
}
/** the arguments right after a command: [..] and {..} groups, optional spaces between, no blank line */
function argsAfter(s, i, max = 9) {
  const args = []
  for (let n = 0; n < max; n++) {
    let k = skipSpaces(s, i)
    if (s[k] === '*' && (s[k + 1] === '{' || s[k + 1] === '[')) k++
    if (s[k] === '[') { const e = matchGroup(s, k, '[', ']'); if (e < 0) break; args.push({ kind: 'opt', start: k, end: e }); i = e; continue }
    if (s[k] === '{') { const e = matchGroup(s, k); if (e < 0) break; args.push({ kind: 'req', start: k, end: e }); i = e; continue }
    break
  }
  return { args, end: i }
}
function endOfEnv(s, i, name) { // i just after \begin{name}; returns [bodyEnd, afterEnd]
  const re = new RegExp(`\\\\(begin|end)\\s*\\{${name.replace(/[*]/g, '\\*')}\\}`, 'g')
  re.lastIndex = i
  let depth = 1, m
  while ((m = re.exec(s))) {
    // a match inside a comment does not count
    const lineStart = s.lastIndexOf('\n', m.index) + 1
    if (/(^|[^\\])%/.test(s.slice(lineStart, m.index))) continue
    if (m[1] === 'begin') depth++
    else if (--depth === 0) return [m.index, m.index + m[0].length]
  }
  return [s.length, s.length]
}
function mathEnd(s, i) { // s[i] is '$' or starts \( \[ ; returns index after the closing delimiter
  if (s.startsWith('$$', i)) { const e = s.indexOf('$$', i + 2); return e < 0 ? -1 : e + 2 }
  if (s[i] === '$') { for (let j = i + 1; j < s.length; j++) { if (s[j] === '\\') { j++; continue } if (s[j] === '$') return j + 1 } return -1 }
  const close = s[i + 1] === '(' ? '\\)' : '\\]'
  const e = s.indexOf(close, i + 2)
  return e < 0 ? -1 : e + 2
}

// ---------------------------------------------------------------- units
// A unit: { file, kind, start, end, pieces: [{t:'text', s} | {t:'ph', src} | {t:'open', id, src} | {t:'close', id, src}] }
class Builder {
  constructor(file, units) { this.file = file; this.units = units; this.cur = null; this.pairId = 0 }
  text(s, start, end) { if (!this.cur) { if (!s.trim()) return; this.cur = { file: this.file, kind: this.kind ?? 'para', start, end, pieces: [] } } this.cur.pieces.push({ t: 'text', s }); this.cur.end = end }
  ph(src, start, end) { if (!this.cur) this.cur = { file: this.file, kind: this.kind ?? 'para', start, end, pieces: [] }; this.cur.pieces.push({ t: 'ph', src }); this.cur.end = end; return true }
  open(src, start) { if (!this.cur) this.cur = { file: this.file, kind: this.kind ?? 'para', start, end: start, pieces: [] }; const id = ++this.pairId; this.cur.pieces.push({ t: 'open', id, src }); return id }
  close(id, src, end) { if (this.cur) { this.cur.pieces.push({ t: 'close', id, src }); this.cur.end = end } }
  flush() {
    const u = this.cur; this.cur = null
    if (!u) return
    // trim placeholders and whitespace at both ends out of the unit: they stay in the source untouched
    const letters = u.pieces.filter(p => p.t === 'text').map(p => p.s).join('')
    if ((letters.match(/\p{L}/gu) ?? []).length < 2) return
    this.units.push(u)
  }
}

/**
 * The texts of a TikZ picture, each a unit of kind 'figure': a node's brace group (\\node … {text}, … node[…] (name) at
 * (x, y) {text}, in TikZ's own syntax whatever the picture draws), a pgfplots legend entry (\\addlegendentry{text}) and
 * an axis label or title in braces (xlabel={text}, ylabel=, zlabel=, title=). TeX sets them, so a translation is set in
 * the translation's fonts and a node grows to fit it. Everything else in the picture stays byte for byte.
 */
function tikzText(s, from, to, b, ctx) {
  const re = /\\node\b|\bnode\b|\\addlegendentry\b|\b(?:xlabel|ylabel|zlabel|title)\s*=\s*(?=\{)/g
  const ws = k => { while (k < to && /\s/.test(s[k])) k++; return k }
  re.lastIndex = from
  let m
  while ((m = re.exec(s)) && m.index < to) {
    const lineStart = s.lastIndexOf('\n', m.index) + 1
    if (/(^|[^\\])%/.test(s.slice(lineStart, m.index))) continue
    let k = m.index + m[0].length
    if (/node$/.test(m[0])) {
      // between `node` and its text TikZ allows options, a name and a position, in any order
      for (;;) {
        k = ws(k)
        if (s[k] === '[') { const e = matchGroup(s, k, '[', ']'); if (e < 0) break; k = e; continue }
        if (s[k] === '(') { const e = matchGroup(s, k, '(', ')'); if (e < 0 || e > to) break; k = e; continue }
        if (s.startsWith('at', k) && /[\s(]/.test(s[k + 2])) { k += 2; continue }
        break
      }
    } else if (m[0].startsWith('\\addlegendentry')) { k = ws(k); if (s[k] === '[') { const e = matchGroup(s, k, '[', ']'); if (e > 0) k = ws(e) } }
    if (s[k] !== '{') continue
    const e = matchGroup(s, k)
    if (e < 0 || e > to) continue
    const saved = b.kind
    b.flush(); b.kind = 'figure'
    walk(s, k + 1, e - 1, b, ctx); b.flush(); b.kind = saved
    re.lastIndex = e
  }
}

/** walk a span of body text; every prose run becomes a unit */
// TeX's own conditionals: each is closed by a \\fi (etoolbox's \\ifdef, \\ifbool … are macros that take braces instead)
const TEX_IFS = new Set(['if', 'ifx', 'ifnum', 'ifdim', 'ifodd', 'ifcase', 'ifcat', 'iftrue', 'iffalse', 'ifvmode', 'ifhmode', 'ifmmode', 'ifinner', 'ifvoid', 'ifhbox', 'ifvbox', 'ifeof', 'ifdefined', 'ifcsname', 'iffontchar', 'ifincsname', 'ifpdfprimitive'])
/** where a skipped conditional branch ends: after its \\fi, or at an \\else of the same depth (that branch is typeset) */
function branchEnd(s, from, to, ifs) {
  let depth = 0
  for (let k = from; k < to; k++) {
    if (s[k] === '%') { k = skipComment(s, k); continue }
    if (s[k] !== '\\') continue
    const { name, end } = commandAt(s, k)
    if (TEX_IFS.has(name) || ifs.has(name)) depth++
    else if (name === 'fi') { if (depth-- === 0) return end }
    else if ((name === 'else' || name === 'or') && depth === 0) return end
    k = end - 1
  }
  return -1
}

function walk(s, from, to, b, ctx) {
  let i = from, textStart = -1
  const endText = () => { if (textStart >= 0 && textStart < i) b.text(s.slice(textStart, i), textStart, i); textStart = -1 }
  const startText = () => { if (textStart < 0) textStart = i }
  while (i < to) {
    const c = s[i]
    if (c === '%') { endText(); i = skipComment(s, i) + 1; continue }
    if (c === '\n') {
      // blank line: paragraph break
      let k = i + 1; while (k < to && (s[k] === ' ' || s[k] === '\t')) k++
      if (s[k] === '\n') { endText(); b.flush(); i = k + 1; continue }
      startText(); i++; continue
    }
    if (c === '$') { const e = mathEnd(s, i); if (e < 0 || e > to) { i++; continue } endText(); if (!b.ph(s.slice(i, e), i, e)) { /* display math alone: nothing to do */ } i = e; continue }
    if (c === '~') { endText(); b.ph('~', i, i + 1); i++; continue }
    if (c === '{') {
      const e = matchGroup(s, i); if (e < 0 || e > to) { i++; continue }
      endText(); const id = b.open('{', i); walk(s, i + 1, e - 1, b, ctx); b.close(id, '}', e); i = e; continue
    }
    if (c === '&' && b.cellMode) { endText(); b.flush(); i++; continue }
    if (c === '}' || c === '&' || c === '#' || c === '^' || c === '_') { endText(); b.ph(c, i, i + 1); i++; continue }
    if (c !== '\\') { startText(); i++; continue }
    // a command
    const { name, end } = commandAt(s, i)
    // \\iffalse … \\fi, and \\if followed by words (an author's way of commenting a passage out): nothing there is typeset,
    // so nothing there is a unit — and a mark or a translated first word would change what \\if compares
    if (name === 'iffalse' || (name === 'if' && /^[ \t]*\n?[ \t]*[A-Za-z]{2}/.test(s.slice(end, end + 8)))) {
      const stop = branchEnd(s, end, to, ctx.ifs)
      if (stop > 0) { endText(); b.flush(); ctx.skipped[name] = (ctx.skipped[name] ?? 0) + 1; i = stop; continue }
    }
    if (name === '(' || name === '[') { const e = mathEnd(s, i); if (e > 0 && e <= to) { endText(); b.ph(s.slice(i, e), i, e); i = e; continue } }
    const shorthand = ctx.envMacros.get(name)
    if (shorthand?.side === 'begin' && (MATH_ENVS.test(shorthand.env) || SKIP_ENVS.test(shorthand.env))) {
      // the block ends at the partner macro or at a literal \end{env}
      const ends = [...ctx.envMacros].filter(([, v]) => v.side === 'end' && v.env === shorthand.env).map(([k]) => k)
      const re = new RegExp(`\\\\(?:${ends.map(e => e.replace(/[@*]/g, m => `\\${m}`)).join('|') || '(?!)'})(?![A-Za-z@])|\\\\end\\s*\\{${shorthand.env.replace(/\*/g, '\\*')}\\}`, 'g')
      re.lastIndex = end
      const m = re.exec(s)
      const stop = m && m.index < to ? m.index + m[0].length : end
      endText(); b.ph(s.slice(i, stop), i, stop); i = stop; continue
    }
    if (name === 'begin') {
      const m = s.slice(end).match(/^\s*\{([^}]+)\}/); if (!m) { i = end; continue }
      const env = m[1].trim(), afterBegin = end + m[0].length
      const [bodyEnd, afterEnd] = endOfEnv(s, afterBegin, env)
      if (MATH_ENVS.test(env)) { endText(); if (!b.ph(s.slice(i, afterEnd), i, afterEnd)) b.flush(); i = afterEnd; continue }
      endText(); b.flush()
      // a TikZ picture: only its texts are prose (tikzText); the drawing stays as it is
      if (env === 'tikzpicture') { tikzText(s, afterBegin, bodyEnd, b, ctx); i = afterEnd; continue }
      if (SKIP_ENVS.test(env) || ctx.skipEnvs.has(env)) { ctx.skipped[env] = (ctx.skipped[env] ?? 0) + 1; i = afterEnd; continue }
      if (TABLE_ENVS.test(env)) {
        if (!ctx.tables) { ctx.skipped[env] = (ctx.skipped[env] ?? 0) + 1; i = afterEnd; continue }
        // a table: each cell is a unit of its own; & and \\ end it. The column specification and width stay as they are
        const { end: argsEnd } = argsAfter(s, afterBegin, env.startsWith('tabularx') || env === 'tabular*' || env === 'tabulary' ? 3 : 2)
        const saved = b.kind, savedCell = b.cellMode; b.kind = 'cell'; b.cellMode = true
        walk(s, argsEnd, bodyEnd, b, ctx); b.flush(); b.kind = saved; b.cellMode = savedCell
        i = afterEnd; continue
      }
      // everything else is a container: its body is walked, its own arguments ([Name] of a theorem, {width} of a minipage) stay
      const { end: argsEnd } = argsAfter(s, afterBegin)
      const saved = b.kind; b.kind = env === 'abstract' ? 'abstract' : ctx.theorems.has(env) ? 'theorem' : saved
      walk(s, argsEnd, bodyEnd, b, ctx); b.flush(); b.kind = saved
      i = afterEnd; continue
    }
    if (name === 'end') { endText(); b.flush(); const m = s.slice(end).match(/^\s*\{[^}]+\}/); i = end + (m ? m[0].length : 0); continue }
    if (name === 'item') { endText(); b.flush(); const { args, end: e } = argsAfter(s, end, 1); i = args.length && args[0].kind === 'opt' ? e : end; continue }
    if (name === 'input' || name === 'include' || name === 'subfile') {
      endText(); b.flush(); const { args, end: e } = argsAfter(s, end, 1)
      if (args[0]) ctx.visit(s.slice(args[0].start + 1, args[0].end - 1).trim())
      i = e; continue
    }
    if (HEADINGS.has(name) || OWN_UNIT_ARG.has(name)) {
      const { args, end: e } = argsAfter(s, end, 2)
      const req = args.find(a => a.kind === 'req')
      if (!req) { endText(); b.ph(s.slice(i, end), i, end); i = end; continue }
      const saved = b.kind
      if (name === 'footnote' || name === 'thanks') {
        // the footnote's text is a unit of its own, rendered inside its paragraph's unit so the two ranges never overlap
        endText()
        const parent = b.cur, before = b.units.length
        b.cur = null; b.kind = 'footnote'; walk(s, req.start + 1, req.end - 1, b, ctx); b.flush(); b.kind = saved
        const made = b.units.length - before
        b.cur = parent
        if (parent && made === 1) { const inner = b.units[b.units.length - 1]; inner.nested = true; parent.pieces.push({ t: 'nested', pre: s.slice(i, inner.start), unit: inner, post: s.slice(inner.end, e) }); parent.end = e }
        else if (parent && made === 0) { parent.pieces.push({ t: 'ph', src: s.slice(i, e) }); parent.end = e }
        else if (parent) b.flush() // a footnote of several paragraphs: the paragraph ends before it
        i = e; continue
      }
      endText(); b.flush()
      b.kind = CAPTIONS.has(name) ? 'caption' : 'heading'; walk(s, req.start + 1, req.end - 1, b, ctx); b.flush(); b.kind = saved
      i = e; continue
    }
    // \multicolumn{n}{spec}{text}, \multirow{n}{width}{text}, \makecell{text}: only the last argument is prose
    if ((name === 'multicolumn' || name === 'multirow' || name === 'makecell' || name === 'shortstack') && b.cellMode) {
      const want = name === 'multicolumn' || name === 'multirow' ? 3 : 1
      const { args, end: e } = argsAfter(s, end, want + 1)
      const reqs = args.filter(a => a.kind === 'req'), last = reqs.at(-1)
      if (last && reqs.length >= want) { endText(); const id = b.open(s.slice(i, last.start + 1), i); walk(s, last.start + 1, last.end - 1, b, ctx); b.close(id, '}', e); i = e; continue }
    }
    // subfig's \subfloat[caption]{content}: the caption in the optional argument, the content walked
    if (name === 'subfloat') {
      const { args } = argsAfter(s, end, 3)
      const opt = args[0]?.kind === 'opt' ? args[0] : null, content = args.find(a => a.kind === 'req')
      if (content) {
        endText(); b.flush()
        if (opt) { const saved = b.kind; b.kind = 'caption'; walk(s, opt.start + 1, opt.end - 1, b, ctx); b.flush(); b.kind = saved }
        walk(s, content.start + 1, content.end - 1, b, ctx); b.flush()
        i = content.end; continue
      }
    }
    if (CONTENT_BOX.has(name)) {
      const { args } = argsAfter(s, end, 8)
      const content = args.filter(a => a.kind === 'req')[CONTENT_BOX.get(name) - 1]
      if (content) { endText(); const id = b.open(s.slice(i, content.start + 1), i); walk(s, content.start + 1, content.end - 1, b, ctx); b.close(id, '}', content.end); i = content.end; continue }
    }
    if (INLINE_TEXT.has(name)) {
      const { args, end: e } = argsAfter(s, end, 1)
      if (args[0]?.kind === 'req') { endText(); const id = b.open(s.slice(i, args[0].start + 1), i); walk(s, args[0].start + 1, args[0].end - 1, b, ctx); b.close(id, '}', e); i = e; continue }
    }
    if (name === 'verb') { const d = s[end]; const e = s.indexOf(d, end + 1); const stop = e < 0 ? end : e + 1; endText(); b.ph(s.slice(i, stop), i, stop); i = stop; continue }
    if (name === 'par') { endText(); b.flush(); i = end; continue }
    // an accent and the letter it sits on are one opaque piece: \'o, \'{o}, \"\i, \v c. Left as text, the letter would be
    // translated away and the accent put on whatever comes next — pdfTeX stops at a CJK character there
    if (ACCENTS.has(name)) {
      let k = /^[A-Za-z]$/.test(name) ? skipSpaces(s, end) : end
      if (s[k] === '{') k = matchGroup(s, k)
      else if (s[k] === '\\') k = commandAt(s, k).end
      else k = k + 1
      if (k > 0 && k <= to) { endText(); if (!b.ph(s.slice(i, k), i, k)) startText(); i = k; continue }
    }
    if (name === '\\') { const { args, end: e } = argsAfter(s, end, 1); const stop = args[0]?.kind === 'opt' ? e : end; endText(); if (b.cellMode) { b.flush(); i = stop; continue } b.ph(s.slice(i, stop), i, stop); i = stop; continue }
    // any other command: opaque together with its adjacent arguments
    // (unknown arity: every adjacent argument goes with it — some prose stays untranslated, nothing breaks)
    // booktabs' \cmidrule(lr){2-5} and \cmidrule[w](lr){2-5}: a trim argument in parentheses
    let from = end
    if (name === 'cmidrule') { const k0 = skipSpaces(s, argsAfter(s, end, 1).end); if (s[k0] === '(') { const c0 = s.indexOf(')', k0); if (c0 > 0 && c0 < to) from = c0 + 1 } }
    let { end: e } = /^[A-Za-z@]+$/.test(name) ? argsAfter(s, from) : { end }
    // TeX's own assignment and glue syntax belongs to the command: \looseness=-1, \parindent=0pt, \vskip 3pt plus 1fil, \penalty-100
    if (e === end && /^[A-Za-z@]+$/.test(name)) { const m = s.slice(e, Math.min(to, e + 120)).match(name === 'hrule' || name === 'vrule' ? RULE_SPEC : ASSIGNMENT); if (m) e += m[0].length }
    endText(); b.ph(s.slice(i, e), i, e)
    // a command with a letter name eats the following spaces in TeX; keep them with it
    i = e
  }
  endText()
}

// ---------------------------------------------------------------- project
const listSources = fsys => fsys.list().filter(f => /\.(tex|sty)$/i.test(f))

/** `root`: a directory (Node) or a file system (folder, inMemory) */
export function loadProject(root, main, { tables = false } = {}) {
  const fsys = asFiles(root)
  const sourceText = f => latin1(fsys.read(f))
  const read = rel => { for (const cand of [rel, `${rel}.tex`]) { const bytes = fsys.read(normalizePath(cand)); if (bytes) return { rel: cand, text: latin1(bytes) } } return null }
  const units = [], files = new Map(), seen = new Set()
  const mainFile = read(main)
  if (!mainFile) throw new Error(`main file ${main} not found`)
  const all = mainFile.text
  const theorems = new Set([...all.matchAll(/\\newtheorem\*?\s*\{([^}]+)\}/g)].map(m => m[1].trim()).concat(['proof', 'theorem', 'lemma', 'corollary', 'proposition', 'definition', 'remark', 'example']))
  const macroArgs = new Map([...all.matchAll(/\\(?:re)?newcommand\*?\s*\{?\\([A-Za-z@]+)\}?\s*\[(\d)\]/g)].map(m => [m[1], Number(m[2])]))
  const skipped = {}
  // \newcommand{\be}{\begin{equation}}, \def\ee{\end{equation}} and the like, in any .tex or .sty of the package
  const envMacros = new Map()
  const sources = listSources(fsys)
  for (const f of sources) {
    const t = sourceText(f)
    for (const m of t.matchAll(/\\(?:(?:re|provide)?newcommand\*?\s*\{?\\([A-Za-z@]+)\}?|def\\([A-Za-z@]+))\s*\{\s*\\(begin|end)\s*\{([^}]+)\}\s*\}/g)) envMacros.set(m[1] ?? m[2], { side: m[3], env: m[4].trim() })
  }
  const ctx = { tables, theorems, macroArgs, envMacros, ifs: new Set([...sources.map(sourceText).join('\n').matchAll(/\\newif\s*\\(if[A-Za-z@]+)/g)].map(m => m[1])), skipEnvs: new Set([...sources.map(sourceText).join('\n').matchAll(/\\(?:lstnewenvironment|newtcblisting|DeclareTCBListing|NewTCBListing|DefineVerbatimEnvironment|newminted)\s*\*?\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)].map(m => m[1].trim())), skipped, visit: rel => visit(rel) }
  function visit(rel) {
    const f = read(rel); if (!f || seen.has(f.rel)) return
    seen.add(f.rel); files.set(f.rel, f.text)
    const b = new Builder(f.rel, units)
    let from = 0, to = f.text.length
    if (f.rel === mainFile.rel) {
      const m = f.text.match(/\\begin\s*\{document\}/)
      // the preamble: only the title is prose
      const pre = m ? f.text.slice(0, m.index) : ''
      const t = pre.match(/\\title\s*(\[[^\]]*\])?\s*\{/)
      if (t) { const s0 = t.index + t[0].length - 1, e0 = matchGroup(f.text, s0); if (e0 > 0) { b.kind = 'heading'; walk(f.text, s0 + 1, e0 - 1, b, ctx); b.flush(); b.kind = undefined } }
      from = m ? m.index + m[0].length : 0
      const e = f.text.match(/\\end\s*\{document\}/); to = e ? e.index : to
    }
    walk(f.text, from, to, b, ctx); b.flush()
  }
  visit(mainFile.rel)
  // a source declared in a Latin-1 family encoding: its bytes read as latin1 are already the right characters
  const enc = all.match(/\\usepackage\s*\[([^\]]*)\]\s*\{inputenc\}/)?.[1]?.split(',').map(x => x.trim()).find(x => /^(latin1|latin9|ansinew|cp1252|cp1250|latin2|applemac|decmulti)$/.test(x))
  const isUtf8 = t => { try { new TextDecoder('utf-8', { fatal: true }).decode(latin1Bytes(t)); return true } catch { return false } }
  const transcode = enc ? new Set([...files].filter(([, t]) => !isUtf8(t)).map(([f]) => f)) : new Set()
  return { main: mainFile.rel, files, units, skipped, inputenc: enc ?? null, transcode }
}

/** the unit as the translator sees it: text with ⟦n⟧ for opaque pieces and ⟦n⟧…⟦/n⟧ for formatting pairs */
export function unitText(u) {
  let n = 0
  return u.pieces.map(p => p.t === 'text' ? p.s : p.t === 'ph' ? `⟦${++n}⟧` : p.t === 'open' ? `⟦b${p.id}⟧` : p.t === 'close' ? `⟦/b${p.id}⟧` : `⟦f${++n}⟧`).join('')
}

// ---------------------------------------------------------------- pseudo-translation
const SAMPLES = {
  zh: '本文提出一种新的方法用于分析数据并在多个基准上验证其有效性实验结果表明该方法在准确率与效率方面均优于现有工作',
  ja: '本研究では新しい手法を提案し複数のベンチマークでその有効性を検証する実験の結果この手法は精度と効率の両面で既存の研究を上回ることが示された',
  de: 'Wir schlagen eine neue Methode zur Analyse der Daten vor und prüfen ihre Wirksamkeit an mehreren Vergleichsmaßstäben; die Ergebnisse zeigen Vorzüge bei Genauigkeit und Effizienz gegenüber früheren Arbeiten ',
}
const RATIO = { zh: 0.45, ja: 0.55, de: 1.15 } // characters of translation per letter of English, roughly
/** the same pieces, text replaced by target-language text of similar length; placeholders in the same order */
export function pseudoTranslate(u, lang) {
  const sample = SAMPLES[lang]
  let k = 0
  return u.pieces.map(p => {
    if (p.t !== 'text') return p
    const letters = (p.s.match(/\p{L}/gu) ?? []).length
    if (!letters) return p
    const n = Math.max(1, Math.round(letters * RATIO[lang]))
    let out = ''
    while (out.length < n) { out += sample[k % sample.length]; k++ }
    // keep the piece's leading and trailing whitespace: it separates the text from commands next to it
    return { t: 'text', tr: true, s: (p.s.match(/^\s*/)[0]) + out + (p.s.match(/\s*$/)[0]) }
  })
}

/** the patched files as bytes (Map path → Uint8Array): each top-level unit's range replaced by its translated pieces, the rest untouched.
 *  Source text keeps its bytes (read as latin1); translated text is written as UTF-8.
 *  `mark(u)` → { start, end } or null: TeX inserted before the unit's first word and after the last character of
 *  its last text (before trailing space), so a PDF destination can record where the unit begins and ends on the page.
 *  Both sit in running text on purpose: after a display (\\]) a mark would open a line of its own, and after an
 *  environment it would stand in the vertical list, where \\addvspace no longer sees the skip before it. The start
 *  mark comes with \\leavevmode, which starts the paragraph just as the word would; after the word it would come
 *  between the word and its comma, and a lost kern there respaces the whole line. */
export function patch(project, translated /* Map unit -> pieces */, { guardControlWords = true, mark } = {}) {
  const out = new Map()
  const render = u => {
    const srcEnc = project.transcode?.has(u.file) ? 'utf8' : 'latin1'
    const pieces = translated.get(u) ?? u.pieces
    const m = mark?.(u)
    // before the first word, inside any font command's group (nothing precedes it there to kern with); before an
    // inline formula or citation that comes first; before the macro when the word is glued to one (\\name's: between
    // the two the mark would cost the kern, and a macro that looks ahead, as \\xspace does, would see the mark). Any
    // other command at the head of the paragraph is passed over — \\noindent, \\vspace, a run-in heading macro — since
    // \\leavevmode ahead of it would start the paragraph early and indent or move it. A text piece is cut after its
    // leading space, which is ASCII, so the cut never falls inside a UTF-8 sequence of source text read as latin1
    let startAt = -1, startCut = 0
    if (m) for (let k = 0; k < pieces.length; k++) {
      const p = pieces[k]
      if (p.t === 'text') {
        const w = /^[ \t\r\n]*(?=[^ \t\r\n])/.exec(p.s)
        if (!w) continue
        const prev = pieces[k - 1]
        if (w[0].length === 0 && prev?.t === 'ph' && /\\[A-Za-z@]+\*?$/.test(prev.src)) { startAt = k - 1; startCut = -1 } else { startAt = k; startCut = w[0].length }
        break
      }
      if (p.t === 'open') continue
      if (p.t === 'ph' && INLINE.test(p.src)) { startAt = k; startCut = -1; break }
      if (p.t !== 'ph') break
    }
    let endAt = -1
    if (m) for (let k = pieces.length - 1; k >= 0; k--) if (pieces[k].t === 'text' && /[^ \t\r\n]/.test(pieces[k].s)) { endAt = k; break }
    const parts = []
    for (let k = 0; k < pieces.length; k++) {
      const p = pieces[k]
      if (p.t === 'nested') { parts.push(bytesOf(p.pre, srcEnc), render(p.unit), bytesOf(p.post, srcEnc)); continue }
      if (p.t === 'text') {
        const enc = p.tr ? 'utf8' : srcEnc
        if (!m || (k !== startAt && k !== endAt)) { parts.push(bytesOf(p.s, enc)); continue }
        const cuts = []
        if (k === startAt) cuts.push([startCut, m.start])
        if (k === endAt) cuts.push([Math.max(startAt === k ? startCut : 0, p.s.replace(/[ \t\r\n]*$/, '').length), m.end])
        let at = 0
        for (const [c, tex] of cuts) { parts.push(bytesOf(p.s.slice(at, c), enc), utf8Bytes(tex)); at = c }
        parts.push(bytesOf(p.s.slice(at), enc))
        continue
      }
      if (k === startAt && startCut === -1) parts.push(utf8Bytes(m.start))
      parts.push(bytesOf(p.src, srcEnc))
      // XeTeX reads CJK characters as letters: \method后 would be one control word. {} ends the name
      const next = pieces[k + 1]
      if (guardControlWords && /\\[A-Za-z@]+\*?$/.test(p.src) && next?.t === 'text' && next.tr && /^[^\s{[]/.test(next.s)) parts.push(utf8Bytes('{}'))
    }
    return concat(parts)
  }
  const byFile = new Map()
  for (const u of project.units) if (!u.nested) (byFile.get(u.file) ?? byFile.set(u.file, []).get(u.file)).push(u)
  for (const [file, text] of project.files) {
    const us = (byFile.get(file) ?? []).sort((a, b) => a.start - b.start)
    const parts = []
    const enc = project.transcode?.has(file) ? 'utf8' : 'latin1'
    let at = 0
    for (const u of us) { if (u.start < at) continue; parts.push(bytesOf(text.slice(at, u.start), enc), render(u)); at = u.end }
    parts.push(bytesOf(text.slice(at), enc))
    out.set(file, concat(parts))
  }
  return out
}

/** \\axtmark{name}: a PDF destination named axt-<name> at the current point, in each engine's own way. Protected, so
 *  it survives being written to the .aux and moving arguments unexpanded. Goes first in the main file */
export const MARK_DEF = [
  '\\ifdefined\\XeTeXrevision\\protected\\def\\axtmark#1{\\special{pdf:dest (axt-#1) [@thispage /XYZ @xpos @ypos null]}}',
  '\\else\\ifdefined\\pdfextension\\protected\\def\\axtmark#1{\\pdfextension dest name{axt-#1} xyz\\relax}',
  '\\else\\ifdefined\\pdfdest\\protected\\def\\axtmark#1{\\ifnum\\pdfoutput>0 \\pdfdest name{axt-#1} xyz\\relax\\fi}',
  '\\else\\protected\\def\\axtmark#1{}\\fi\\fi\\fi',
].join('\n') + '\n'
// pieces that are always set on the line: inline formulas and references
const INLINE = /^(?:\$|\\\(|\\ensuremath|\\(?:cite[a-z]*|ref|eqref|autoref|[cC]ref)(?![A-Za-z]))/
/** marks for the units whose place a reader shows: not headings (their text is also typeset in running heads and
 *  tables of contents), not table cells, not the texts of a TikZ picture (set through the picture's own transformation,
 *  which a destination's position does not follow) */
export const markUnits = units => { const id = new Map(units.map((u, i) => [u, i])); return u => (u.kind === 'heading' || u.kind === 'cell' || u.kind === 'figure' ? null : { start: `\\leavevmode\\axtmark{${id.get(u)}s}`, end: `\\axtmark{${id.get(u)}e}` }) }

/** Goes before \\begin{document} of the original's own compile: the log then says which font families the document set
 *  for its roles, however it set them (its class, a package, a conference style) */
export const FONT_PROBE = '\\AtEndDocument{\\typeout{AXT-FONTS rm=\\rmdefault;sf=\\sfdefault;tt=\\ttdefault;body=\\familydefault;}}\n'
/** the roles' families from a log written with FONT_PROBE, or null */
export function readFontProbe(log) {
  const m = /AXT-FONTS rm=([^;]*);sf=([^;]*);tt=([^;]*);body=([^;]*);/.exec(log.replace(/\n/g, ''))
  return m ? { rm: m[1], sf: m[2], tt: m[3], body: m[4] } : null
}
// the URW base-35 families by their NFSS names, and the OpenType fonts TeX Gyre made of them (the same designs and
// metrics), by file name: XeTeX finds a font by name through fontconfig, which the browser's TeX does not have, and by
// file name through its own file search. Computer Modern needs nothing: fontspec's default, Latin Modern, is its
// OpenType form
// (NFSS names of the same designs from other packages too: newtx and txfonts for Times, mathpazo and newpx for
// Palatino)
const GYRE = [
  [/^(ptm|qtm|ntx|txr|Tempora)/, 'texgyretermes'], [/^(phv|qhv|txss)/, 'texgyreheros'], [/^(pcr|qcr|txtt)/, 'texgyrecursor'],
  [/^(ppl|qpl|npx|zpl)/, 'texgyrepagella'], [/^(pbk|qbk)/, 'texgyrebonum'], [/^(pnc|qcs)/, 'texgyreschola'], [/^(pag|qag)/, 'texgyreadventor'],
]
const GYRE_FACES = '[Extension=.otf,UprightFont=*-regular,BoldFont=*-bold,ItalicFont=*-italic,BoldItalicFont=*-bolditalic]'
/** Goes after xeCJK (which loads fontspec, whose default face is Latin Modern): each role back in the document's own
 *  face where it has an OpenType form, so widths, line breaks and pages stay the original's */
export function latinFontsFor(probe) {
  if (!probe) return ''
  const face = f => GYRE.find(([re]) => re.test(String(f)))?.[1]
  const out = []
  if (face(probe.rm)) out.push(`\\setmainfont{${face(probe.rm)}}${GYRE_FACES}`)
  if (face(probe.sf)) out.push(`\\setsansfont{${face(probe.sf)}}${GYRE_FACES}`)
  if (face(probe.tt)) out.push(`\\setmonofont{${face(probe.tt)}}${GYRE_FACES}`)
  return out.length ? out.join('\n') + '\n' : ''
}

/** pdfTeX-only primitives that arXiv sources use outside any \\ifpdf, made harmless under XeTeX. Goes first in the main file */
export const XETEX_SHIM = [
  '\\ifdefined\\pdfoutput\\else\\newcount\\pdfoutput\\fi',
  '\\ifdefined\\pdfminorversion\\else\\newcount\\pdfminorversion\\fi',
  '\\ifdefined\\pdfcompresslevel\\else\\newcount\\pdfcompresslevel\\fi',
  '\\ifdefined\\pdfobjcompresslevel\\else\\newcount\\pdfobjcompresslevel\\fi',
  '\\ifdefined\\pdfsuppresswarningpagegroup\\else\\newcount\\pdfsuppresswarningpagegroup\\fi',
  '\\ifdefined\\pdfinfo\\else\\long\\def\\pdfinfo#1{}\\fi',
  '\\ifdefined\\pdfglyphtounicode\\else\\def\\pdfglyphtounicode#1#2{}\\fi',
  '\\ifdefined\\pdfgentounicode\\else\\newcount\\pdfgentounicode\\fi',
].join('\n') + '\n'

// ---------------------------------------------------------------- engine adaptation: rules for known incompatibilities
/** R1, before \documentclass under XeTeX: what pdfTeX papers use that XeLaTeX lacks, and the engine guard of some templates */
export const XETEX_SHIM_R1 = [
  '\\providecommand\\DeclareUnicodeCharacter[2]{}',            // inputenc's, not loaded under XeLaTeX
  '\\RequirePackage{iftex}\\let\\RequirePDFTeX\\relax',         // a template's "pdfTeX only" guard (AAAI 2027)
].join('\n') + '\n'
/** R2, under XeTeX: a pdftex driver option names the wrong backend for hyperref, graphicx, color */
export function stripPdftexOption(text) {
  return text.replace(/\\(documentclass|usepackage|RequirePackage)\s*\[([^\]]*)\]/g, (m, cmd, opts) => {
    const kept = opts.split(',').filter(o => o.trim() !== 'pdftex')
    return kept.length === opts.split(',').length ? m : `\\${cmd}[${kept.join(',')}]`
  })
}
/** R3, before \begin{document}, any engine: a template's "package X is forbidden" errors become warnings */
export const FORBIDDEN_TO_WARNING = [
  '\\makeatletter',
  '\\let\\axt@PackageError\\PackageError',
  '\\long\\def\\PackageError#1#2#3{\\in@{forbid}{#2}\\ifin@\\PackageWarning{#1}{#2}\\else\\in@{must not use}{#2}\\ifin@\\PackageWarning{#1}{#2}\\else\\axt@PackageError{#1}{#2}{#3}\\fi\\fi}',
  '\\makeatother',
].join('\n') + '\n'
