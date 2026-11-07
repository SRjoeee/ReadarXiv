// lab/typeset/parity/hook.mjs: a Node module hook (registered by v2.mjs after ../checkpoint/items-hook.mjs) that makes the
// entry's lay in packages/typeset/tests/replay/gate-l1.ts read the reader's choices: design-a's `Choices.leave` (the unit kinds
// the reader shows untranslated), which the runner's entry call leaves out (it lays every kind). The parity check lays as a
// reader who has toggled nothing: the reader's defaults (packages/reader/src/compose/classes.ts CLASS_DEFAULTS, leftKinds),
// which are today's door's defaults (content-classes.mjs TOGGLE_DEFAULTS, the door opened with no `classes`), so that both
// sides translate the same units. Nothing else of any module is touched.
const CALL = '{ ...rulesFor(L.target as never), set: R, hyph: patternsSeen ?? {} }'

export async function load(url, context, nextLoad) {
  const r = await nextLoad(url, context)
  if (!url.endsWith('/packages/typeset/tests/replay/gate-l1.ts')) return r
  const source = String(r.source)
  if (source.split(CALL).length !== 2) throw new Error(`parity hook: gate-l1.ts no longer holds its anchor once: ${CALL}`)
  return {
    ...r,
    source: source.replace(
      CALL,
      '{ ...rulesFor(L.target as never, (globalThis as any).__parityChoices ?? {}), set: R, hyph: patternsSeen ?? {} }',
    ),
  }
}
