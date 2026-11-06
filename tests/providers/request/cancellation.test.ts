// Ported from reference/read-frog/src/utils/request/__tests__/cancellation.test.ts@9b44f82 (GPL-3.0), 2026-09-05, modified:
// import path; 2026-09-12 (DESIGN §8.5) the prefix, TTL and size-cap cases are gone with the registry's rewrite — it no
// longer expires; 2026-11-07 (stage 4b) the error class's cases gone with the class.
import { describe, expect, it } from "vitest"
import { CancelledScopeRegistry } from "@/providers/request/cancellation"

describe("cancelledScopeRegistry", () => {
  it("remembers exact cancelled scopes", () => {
    const registry = new CancelledScopeRegistry()
    registry.markScope("7:session-a")

    expect(registry.has("7:session-a")).toBe(true)
    expect(registry.has("7:session-b")).toBe(false)
    expect(registry.has("8:session-a")).toBe(false)
  })
})
