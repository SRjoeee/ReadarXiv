// Small builders for test units
import type { Piece, UnitIn } from '../src/contract.ts'

export const t = (s: string): Piece => ({ t: 'text', s })
export const el = (id: string, kind = 'math', stop?: string): Piece =>
  stop ? { t: 'el', id, kind, stop } : { t: 'el', id, kind }
/** an element that sets nothing where it stands (`silent`: a key written to a file, `\noindent`, `\-`, a declaration) */
export const quiet = (id: string): Piece => ({ t: 'el', id, kind: 'other', silent: true })
export const span = (id: string, style: string, content: Piece[], must = false): Piece =>
  must ? { t: 'span', id, style, must: true, content } : { t: 'span', id, style, content }
export const unit = (id: string, content: Piece[], sentences = false): UnitIn =>
  sentences ? { id, content, sentences: true } : { id, content }
