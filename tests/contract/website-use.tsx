// The website's use of what it imports (CLAUDE.md hard rule 7), held at compile time: `pnpm typecheck` compiles this file,
// and nothing runs it. website-imports.test.ts holds that every path the website imports resolves and exports every name
// it takes; a module can do that and still have changed what a call passes or gets back (5a.4 changed createController's
// arguments and the state's shape at the same path), and the website, which types the pin by its own declarations
// (readarxiv-web types/vendor.d.ts) and never compiles these sources, would build and break at run time. So each call
// below is the website's, made here against this tree: its arguments in the website's shapes, the members it reads of
// what comes back. A comment names the website's file and line (readarxiv-web c4e17876; its `@vendor/<path>` is `@/<path>`
// here). Where the website's value has a type of its own, the stand-in says so. A call is removed only when the website
// stops making it, as a path or a name is removed from website-imports.test.ts.
// At the cut-over (package C1) the calls into the 32 paths that went with today's engine went with them (the website's own
// cut-over stops making them); the calls below are the website's into the paths it may still take.
import { BUILT_IN_HIGHLIGHTS, DEFAULT_APPEARANCE, HL_OPACITY_MAX, HL_OPACITY_MIN, lookOf } from '@/config/appearance'
import { appearanceRule } from '@/core/renderer/style-preset'
import { RULES_VERSION } from '@/core/rules/latexml'
import { readerRuns } from '@/pdf-reader/support'
import { languageName, profileName, R, S, setLocale } from '@/ui/strings'

/** the reader's calls into the kept paths: its locale, its view's words, its entry, its bar's words, its highlights' names */
export function websiteReader(chosen: Parameters<typeof setLocale>[0]) {
  // main.tsx:55
  setLocale(chosen)
  // run.mjs:156 the view's words
  const view: { pageName: (side: 'left' | 'right', n: number) => string; sideName: (side: 'left' | 'right') => string } = {
    pageName: (side, n) => R.pageName(side === 'left' ? 'original' : 'translation', n),
    sideName: side => R.display[side === 'left' ? 'original' : 'translation'],
  }
  // pdfjs.ts:51
  const build = readerRuns(globalThis) ? 'modern' : 'legacy'
  // the words the web's bar and its cards read (types/vendor.d.ts @vendor/ui/strings)
  const read: string[] = [R.status.noPdf, R.status.useHtml, R.status.translating, S.rows.language, R.options.color, R.options.appearance, R.options.light, R.options.dark, R.options.system]
  // web/tests/seams.test.ts:62
  const names = ['jpn', 'cmn-Hant', 'deu'].map(code => languageName(code as Parameters<typeof languageName>[0]))
  // ReadingOptions.tsx:71, :72
  const highlights = BUILT_IN_HIGHLIGHTS.map(h => profileName(h, 'highlights'))
  return { view, build, read, names, highlights }
}

/** the website's tests of the pin's appearance and versions (web/tests/highlights.test.ts, tests/vendor-engine.test.ts) */
export function websiteAppearanceTests(): unknown[] {
  // highlights.test.ts:9, :12, :18, :26
  const keys = BUILT_IN_HIGHLIGHTS.map(h => Object.keys(h).sort())
  const rule: string = appearanceRule(lookOf({ appearance: { ...DEFAULT_APPEARANCE, activeHighlight: DEFAULT_APPEARANCE.activeHighlight } }))
  const bounds = [HL_OPACITY_MIN * 100, HL_OPACITY_MAX * 100]
  // vendor-engine.test.ts:24
  const rules: string = RULES_VERSION
  return [keys, rule, bounds, rules]
}
