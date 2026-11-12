// lab/rules/transform.mjs: a file's text with the site map's edits applied (sites.mjs): each wrap's opening before its
// node and its closing after it, each replacement in place. Refuses a text whose digest is not the one the map was made
// from: a site map is of one tree. Pure. Not shipped.
import { createHash } from 'node:crypto'

/** the instrumented text of `path`, or null where the map does not name it; throws where the text is not the map's. Every
 *  module the map names first tells the recorder it was loaded (its line numbers kept: the call stands on line 1), so that
 *  a module no input loads is told from one whose rules never ran */
export function instrument(map, path, text) {
  const entry = map.files[path]
  if (!entry) return null
  const sha = createHash('sha256').update(text).digest('hex')
  if (sha !== entry.sha256) throw new Error(`lab/rules: ${path} is not the text the site map was made from (sites.json at ${map.commit ?? 'an unknown commit'}, digest ${map.digest}); make the map again`)
  return `__axtRules.loaded(${JSON.stringify(path)});${entry.edits.length ? applyEdits(text, entry.edits) : text}`
}

/** edits applied: at each offset the closings of the wraps that end there (the innermost first), then the openings of
 *  those that begin there (the outermost first), then a replacement that begins there */
export function applyEdits(text, edits) {
  const wraps = edits.map((e, i) => ({ ...e, i })).filter(e => e.pre != null)
  const replaces = edits.filter(e => e.replace).sort((a, b) => a.replace[0] - b.replace[0])
  const pres = new Map()
  const posts = new Map()
  for (const w of wraps) {
    ;(pres.get(w.at) ?? pres.set(w.at, []).get(w.at)).push(w)
    ;(posts.get(w.end) ?? posts.set(w.end, []).get(w.end)).push(w)
  }
  // (two wraps at one offset: the longer is outside; of two of one range, the one made first)
  for (const ws of pres.values()) ws.sort((a, b) => b.end - a.end || a.i - b.i)
  for (const ws of posts.values()) ws.sort((a, b) => b.at - a.at || b.i - a.i)
  const points = [...new Set([...pres.keys(), ...posts.keys(), ...replaces.map(r => r.replace[0])])].sort((a, b) => a - b)
  let out = ''
  let from = 0
  let r = 0
  for (const p of points) {
    if (p < from) throw new Error(`lab/rules: an edit at ${p} falls inside a replacement ending at ${from}`)
    out += text.slice(from, p)
    from = p
    for (const w of posts.get(p) ?? []) out += w.post
    for (const w of pres.get(p) ?? []) out += w.pre
    while (r < replaces.length && replaces[r].replace[0] === p) {
      out += replaces[r].text
      from = replaces[r].replace[1]
      r++
    }
  }
  return out + text.slice(from)
}
