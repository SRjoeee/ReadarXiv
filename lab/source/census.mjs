// lab/source/census.mjs: the decisions the source reader holds as data, counted as the dossier counted today's
// (engine-source-front.md §6: 85 table-like constants in latex-front.mjs, 15 look-ahead windows): name lists (a Set, a Map
// or an array of names, a name regex), regex tables (any other regular expression), and look-ahead windows (a slice of the
// text a fixed number of characters long). Each with where it stands and the first line of the comment above it, its
// reason. The generated tables (tables.ts), the copies awaiting packages/format (id.ts, types.ts) are not the reader's.
//   node lab/source/census.mjs [--list]
import { readdirSync, readFileSync } from 'node:fs'

const DIR = new URL('../../packages/engine/src/source/', import.meta.url)
const SKIP = new Set(['tables.ts', 'id.ts', 'types.ts'])
const rows = []
for (const file of readdirSync(DIR).filter(f => f.endsWith('.ts') && !SKIP.has(f)).sort()) {
  const lines = readFileSync(new URL(file, DIR), 'utf8').split('\n')
  const reason = at => {
    // the doc comment or line comment right above `at`
    for (let k = at - 1; k >= Math.max(0, at - 12); k--) {
      const l = lines[k].trim()
      if (l.startsWith('/**')) return l.replace(/^\/\*\*\s*/, '').replace(/\*\/$/, '').slice(0, 110)
      if (l.startsWith('//')) {
        let j = k
        while (j > 0 && lines[j - 1].trim().startsWith('//')) j--
        return lines[j].trim().replace(/^\/\/\s*/, '').slice(0, 110)
      }
      if (!l.startsWith('*') && l !== '') break
    }
    return ''
  }
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '')
    const top = /^(?:export )?const ([A-Z_][A-Za-z_0-9]*)\b/.exec(line)
    // (a constant derived from a generated table or another constant, or an object that holds no names, is no hand table)
    const init = line + (lines[i + 1] ?? '')
    if (top && /new (?:Set|Map)\((?:[A-Z_]+|\[[^'"]*\]\))|NO_DEFINITIONS|= \(name/.test(init)) return
    if (top && /new (?:Set|Map)\(|^\S.*= \[|: Readonly(?:Set|Map)|new RegExp|= \//.test(init)) {
      const kind = /RegExp|= \/|^\s*\//.test(line + (lines[i + 1] ?? '')) ? (/[A-Za-z]{3,}\|[A-Za-z]{3,}/.test(line + lines[i + 1]) ? 'name regex' : 'regex') : 'name list'
      rows.push({ kind, name: top[1], at: `${file}:${i + 1}`, reason: reason(i) })
      return
    }
    // a regular expression written inside a function
    if (!top && /(?:^|[=(,:!&|?]\s*)\/(?![/*])(?:\\.|\[[^\]]*\]|[^/\n])+\/[gimsuy]*(?:\.(?:test|exec)|\s*[,)]|\.source)/.test(code) && !/^\s*(?:\*|\/\/)/.test(line))
      if (/[A-Za-z@]{3,}\|[A-Za-z@]{3,}/.test(code)) rows.push({ kind: 'name regex', name: '(inline)', at: `${file}:${i + 1}`, reason: reason(i) || code.trim().slice(0, 90) })
    // (a fixed look-ahead: eight characters or more; a slice one past an index is none, nor TeX's ^^ notation's two digits)
    for (const m of code.matchAll(/\.slice\(([^,()]+), *(?:Math\.min\([^)]*?\+ *(\d+)\)|[^,()]*?\+ *(\d+))\)/g))
      if (Number(m[2] ?? m[3]) >= 8) rows.push({ kind: 'window', name: `${m[2] ?? m[3]} chars`, at: `${file}:${i + 1}`, reason: reason(i) || code.trim().slice(0, 90) })
  })
}
const by = k => rows.filter(r => r.kind === k)
console.log(`name lists ${by('name list').length}, name regexes ${by('name regex').length}, other regexes ${by('regex').length}, windows ${by('window').length}`)
if (process.argv.includes('--list')) for (const r of rows) console.log(`${r.kind.padEnd(10)} ${r.name.padEnd(22)} ${r.at.padEnd(18)} ${r.reason}`)
