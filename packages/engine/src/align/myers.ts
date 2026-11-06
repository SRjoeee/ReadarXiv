// The longest common subsequence of two integer sequences by Myers' O(ND) difference algorithm in linear space: the
// middle-snake bisection as Neil Fraser's diff-match-patch writes it (diff_bisect_, diff_bisectSplit_, Apache-2.0),
// transcribed for Int32Arrays and index ranges (spike S1's tools/myers.mjs, held there against the dynamic programme's
// LCS length on 3,000 random cases; here by the same test). Deterministic; no threshold decides a match. `work` bounds the
// steps a call may take: a resource bound, reported, never a decision about content; past it the call stops and says so.

export interface Lcs {
  /** the matched pairs in order: [a0, b0, a1, b1, …] */
  pairs: Int32Array
  steps: number
  stopped: boolean
}

export function lcs(a: Int32Array, b: Int32Array, work = Number.POSITIVE_INFINITY): Lcs {
  const out: number[] = []
  let steps = 0
  let stopped = false
  const cap = a.length + b.length + 2
  const v1 = new Int32Array(cap + 2)
  const v2 = new Int32Array(cap + 2)
  const A = (i: number) => a[i] as number
  const B = (i: number) => b[i] as number

  function rec(a0: number, a1: number, b0: number, b1: number): void {
    if (stopped) return
    // the common prefix, then the common suffix (pushed after the middle)
    while (a0 < a1 && b0 < b1 && A(a0) === B(b0)) {
      out.push(a0, b0)
      a0++
      b0++
    }
    let s = 0
    while (a1 - s > a0 && b1 - s > b0 && A(a1 - s - 1) === B(b1 - s - 1)) s++
    const ae = a1 - s
    const be = b1 - s
    if (a0 < ae && b0 < be) middle(a0, ae, b0, be)
    for (let i = 0; i < s; i++) out.push(ae + i, be + i)
  }

  function middle(a0: number, a1: number, b0: number, b1: number): void {
    const N = a1 - a0
    const M = b1 - b0
    // one side a single element: common at its first occurrence in the other, or nothing is
    if (N === 1) {
      const x = A(a0)
      for (let j = b0; j < b1; j++)
        if (B(j) === x) {
          out.push(a0, j)
          return
        }
      return
    }
    if (M === 1) {
      const y = B(b0)
      for (let i = a0; i < a1; i++)
        if (A(i) === y) {
          out.push(i, b0)
          return
        }
      return
    }
    const split = bisect(a0, a1, b0, b1)
    if (split === null) return
    const [x, y] = split
    rec(a0, a0 + x, b0, b0 + y)
    rec(a0 + x, a1, b0 + y, b1)
  }

  function bisect(a0: number, a1: number, b0: number, b1: number): [number, number] | null {
    const N = a1 - a0
    const M = b1 - b0
    const maxD = Math.ceil((N + M) / 2)
    const off = maxD
    const len = 2 * maxD
    v1.fill(-1, 0, len + 2)
    v2.fill(-1, 0, len + 2)
    v1[off + 1] = 0
    v2[off + 1] = 0
    const delta = N - M
    const front = delta % 2 !== 0
    let k1start = 0
    let k1end = 0
    let k2start = 0
    let k2end = 0
    for (let d = 0; d < maxD; d++) {
      steps += 2 * d + 2
      if (steps > work) {
        stopped = true
        return null
      }
      for (let k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
        const k1o = off + k1
        let x1 =
          k1 === -d || (k1 !== d && (v1[k1o - 1] as number) < (v1[k1o + 1] as number))
            ? (v1[k1o + 1] as number)
            : (v1[k1o - 1] as number) + 1
        let y1 = x1 - k1
        while (x1 < N && y1 < M && A(a0 + x1) === B(b0 + y1)) {
          x1++
          y1++
          steps++
        }
        v1[k1o] = x1
        if (x1 > N) k1end += 2
        else if (y1 > M) k1start += 2
        else if (front) {
          const k2o = off + delta - k1
          if (k2o >= 0 && k2o < len && v2[k2o] !== -1) {
            const x2 = N - (v2[k2o] as number)
            if (x1 >= x2) return [x1, y1]
          }
        }
      }
      for (let k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
        const k2o = off + k2
        let x2 =
          k2 === -d || (k2 !== d && (v2[k2o - 1] as number) < (v2[k2o + 1] as number))
            ? (v2[k2o + 1] as number)
            : (v2[k2o - 1] as number) + 1
        let y2 = x2 - k2
        while (x2 < N && y2 < M && A(a1 - x2 - 1) === B(b1 - y2 - 1)) {
          x2++
          y2++
          steps++
        }
        v2[k2o] = x2
        if (x2 > N) k2end += 2
        else if (y2 > M) k2start += 2
        else if (!front) {
          const k1o = off + delta - k2
          if (k1o >= 0 && k1o < len && v1[k1o] !== -1) {
            const x1 = v1[k1o] as number
            const y1 = off + x1 - k1o
            if (x1 >= N - x2) return [x1, y1]
          }
        }
      }
    }
    return null
  }

  rec(0, a.length, 0, b.length)
  return { pairs: Int32Array.from(out), steps, stopped }
}
