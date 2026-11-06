// lab/typeset/hook.mjs: a Node module hook (register it with `node --import ./lab/typeset/register.mjs …`) that lets lane L3's
// derivation tools call today's typesetting functions the engine does not export, without changing a file: as the engine at
// 065c1d973 (`AXT_TODAY`, default the read-only worktree `.worktrees/refactor-read`) is loaded, one export line is appended to
// the source of each module named below. Nothing else of any module is touched; resolution is Node's own.
const TODAY = process.env.AXT_TODAY ?? '/Users/cheongzhiyan/Developer/ArxivTranslate/.worktrees/refactor-read'
/** the private functions exposed, by module under the engine's layer-proto/ */
const EXPOSE = {
  'layer2.mjs': ['drawnAs', 'unbracketed', 'unbracketedParts', 'displayLines', 'leadMark', 'bracketed', 'renderingClass', 'symbolDrawn', 'resolvePlaceholders', 'finishUnit'],
}
const BASE = `file://${TODAY}/src/pdf-reader/engine/layer-proto/`

export async function load(url, context, nextLoad) {
  const r = await nextLoad(url, context)
  if (!url.startsWith(BASE)) return r
  const names = EXPOSE[url.slice(BASE.length)]
  if (!names) return r
  return { ...r, source: `${String(r.source)}\n;export { ${names.join(', ')} }\n` }
}
