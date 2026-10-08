// rules-panel.mjs's types: the layer lab's rules panel
import type * as RulesModule from '../../../src/pdf-reader/engine/rules/layout.mjs'
import type { RuleSet, TargetRules } from '../../../src/pdf-reader/engine/rules/layout.mjs'

export interface RulesPanelOptions {
  /** the element the panel is drawn into */
  root: HTMLElement
  /** the page's element builder */
  h: (tag: string, attrs?: Record<string, unknown>, ...kids: (Node | string | null | undefined)[]) => HTMLElement
  /** the page's icon builder */
  icon: (name: string) => Element
  /** the page's words, by key */
  t: (key: string, ...args: unknown[]) => string
  /** the engine's rules module */
  R: Pick<typeof RulesModule, 'RULES_FIELDS' | 'readRules' | 'parseRules' | 'resolveRules' | 'BUILTIN_RULES' | 'RULES_CAP'>
  /** a target's own name by tag */
  names: Record<string, string>
  /** the face catalog's CJK groups, its faces and the English designs */
  catalog: { groups: string[]; faces: string[]; families: string[] }
  /** told, once an edit has rested or a set was loaded, to draw the quick view again */
  onChange: () => void
}
export interface RulesPanel {
  /** the set the quick view draws with (a copy), null before one is loaded */
  set(): RuleSet | null
  /** whether the working set differs from the one last loaded or saved */
  dirty(): boolean
  /** where the set came from */
  from(): { kind: string; label: string; ref?: string } | null
  /** the working set's rules for the target shown */
  resolved(): TargetRules | null
  /** the target a fixture shows */
  setTarget(target: string): void
  /** drawn again, in the interface's language */
  render(): void
  /** the set at start: the git ref the address names, else the worktree's file */
  start(ref?: string): Promise<void>
}
export declare function createRulesPanel(o: RulesPanelOptions): RulesPanel
