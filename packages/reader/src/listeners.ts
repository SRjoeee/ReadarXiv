// The `on` of the reader's parts that tell events to listeners of their own (the stack, the composer, the panes): each keeps
// its listeners by event type and tells them itself; a caller subscribes through the function onOf makes over that map.

/** the `on` of a part that tells events of map `E` to `listeners`: `f` added to `type`'s, and a function that takes it off
 *  again */
export function onOf<E>(listeners: Map<keyof E, Set<(e: unknown) => void>>) {
  return <K extends keyof E>(type: K, f: (e: E[K]) => void) => {
    const set = listeners.get(type) ?? new Set()
    listeners.set(type, set)
    set.add(f as (e: unknown) => void)
    return () => set.delete(f as (e: unknown) => void)
  }
}
