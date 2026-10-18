// Lucide's icons (ISC, docs/THIRD_PARTY.md) at 16 px with a 1.5 stroke on the 24 grid, one CSS pixel (the reader's
// design, §4.2): the one icon component of every surface
import type { IconNode } from 'lucide'
import { createElement } from 'react'

export function Icon({ node, size = 16, className }: { node: IconNode; size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {node.map(([tag, attrs], index) => createElement(tag, { key: index, ...attrs }))}
    </svg>
  )
}
