// The pages' base (Part 3, Task 14): a link and a bare field in a `ui` root — the keyboard's ring on each, and none for
// the pointer on the field
import { O, S } from '@/ui/strings'

export function Base() {
  return (
    <div data-row>
      <a href="#base">{S.settings}</a>
      <input aria-label={O.services.baseURL} placeholder="https://…/v1" className="bare" />
    </div>
  )
}
