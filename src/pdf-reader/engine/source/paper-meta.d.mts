// paper-meta.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { inMemory } from './latex-front.mjs'
/** what arXiv would compile: the main file (guessed or not), its compiler, whether the package holds the bibliography TeX reads */
export declare function analyze(fsys: ReturnType<typeof inMemory>): { main: string | null; mainGuessed?: boolean; compiler?: string; bbl?: boolean }
