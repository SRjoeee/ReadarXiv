// The frame after the popup's first: what waits for it is what the reader cannot reach before it — the menus' rows, the
// language list's 179 among them — so that the popup paints as fast as it did (the redesign's design, §12)
import { useEffect, useState } from 'react'

export function usePainted(): boolean {
  const [painted, setPainted] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setPainted(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  return painted
}
