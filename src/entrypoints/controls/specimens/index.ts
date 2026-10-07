// The controls sheet's specimens, in the order it shows them: the pages' base, then one per control of Part 3, each
// added by the task that builds the control
import type { FC } from 'react'
import { Base } from './base'
import { Buttons } from './buttons'
import { Forms } from './forms'
import { Menus } from './menus'
import { Segments } from './segmented'

export const SPECIMENS: { name: string; Specimen: FC }[] = [
  { name: 'base', Specimen: Base },
  { name: 'buttons', Specimen: Buttons },
  { name: 'forms', Specimen: Forms },
  { name: 'segmented', Specimen: Segments },
  { name: 'menus', Specimen: Menus },
]
