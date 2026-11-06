// lab/typeset/hook.mjs: a Node module hook (register it with `node --import ./lab/typeset/register.mjs …`) that lets lane L3's
// derivation tools call today's typesetting functions the engine does not export, without changing a file: as the engine at
// 065c1d973 (`AXT_TODAY`, default the read-only worktree `.worktrees/refactor-read`) is loaded, one export line is appended to
// the source of each module named below (EXPOSE), and a function named in WATCH reports its answers to the tool. Nothing else
// of any module is touched; resolution is Node's own.
const TODAY = process.env.AXT_TODAY ?? '/Users/cheongzhiyan/Developer/ArxivTranslate/.worktrees/refactor-read'
/** the private functions exposed, by module under the engine's layer-proto/ */
const EXPOSE = {
  'layer2.mjs': ['drawnAs', 'unbracketed', 'unbracketedParts', 'displayLines', 'leadMark', 'bracketed', 'renderingClass', 'symbolDrawn', 'resolvePlaceholders', 'finishUnit'],
}
const BASE = `file://${TODAY}/src/pdf-reader/engine/layer-proto/`

/** a function whose every answer is handed to `globalThis.__axtWatch(name, args, answer)` where a tool sets one, by module: its
 *  declaration renamed and a function of its own name put in its place that calls it */
const WATCH = { 'fonts.mjs': ['faceOf'] }

export async function load(url, context, nextLoad) {
  const r = await nextLoad(url, context)
  if (!url.startsWith(BASE)) return r
  const file = url.slice(BASE.length), names = EXPOSE[file], watched = WATCH[file]
  if (!names && !watched) return r
  let source = String(r.source)
  for (const f of watched ?? []) {
    const decl = `export function ${f}(`
    if (source.split(decl).length !== 2) throw new Error(`hook: ${file} does not declare ${f} once`)
    source = source.replace(decl, `function ${f}__today(`) + `\n;export function ${f}(...a) { const v = ${f}__today(...a); globalThis.__axtWatch?.('${f}', a, v); return v }\n`
  }
  if (names) source += `\n;export { ${names.join(', ')} }\n`
  return { ...r, source }
}
