import { describe, expect, it } from 'vitest'
import { sha256Hex } from '../src/sha256.ts'

describe('sha256Hex', () => {
  it("equals Node's digest (recorded) on ASCII, on every block boundary and on multilingual text", () => {
    const cases: [string, string][] = [
      ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
      ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
      ['a'.repeat(55), '9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318'],
      ['a'.repeat(56), 'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a'],
      ['a'.repeat(64), 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb'],
      ['a'.repeat(119), '31eba51c313a5c08226adf18d4a359cfdfd8d2e816b13f4af952f7ea6584dcfb'],
      ['我们固定矩阵 — Ünïcode 𝔸 \ud800 end', '8090c56dd9e487a67c2eecedab2e57d2bf5df6d78472fe1a184e876cf760b01f'],
    ]
    for (const [s, hex] of cases) expect(sha256Hex(s)).toBe(hex)
  })
})
