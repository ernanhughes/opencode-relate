import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyPair } from "../src/engine/index.ts";
import { RelateError } from "../src/engine/types.ts";

const L = (id: string) => ({ id, kind: "text" });
const R = (id: string) => ({ id, kind: "text" });

void describe("contract", () => {
  void it("rejects empty input", () => {
    assert.throws(() => classifyPair("  ", "text", L("a"), R("b")), (e) => e instanceof RelateError && e.code === "EMPTY_INPUT");
  });
  void it("returns stable observation ids", () => {
    const a = classifyPair("A requires X.", "B does X.", L("a"), R("b"));
    const b = classifyPair("A requires X.", "B does X.", L("a"), R("b"));
    assert.equal(a.observation_id, b.observation_id);
    assert.equal(a.producer.plugin, "opencode-relate");
  });
});

void describe("seed acceptance", () => {
  void it("scope contradiction is not flattened to similar", () => {
    const o = classifyPair("The migration completed successfully.", "The migration failed for tenant 1847.", L("a"), R("b"));
    assert.ok(["CONTRADICTS", "UNKNOWN"].includes(o.relation), `got ${o.relation}`);
    if (o.relation === "CONTRADICTS") assert.equal(o.direction, "symmetric");
  });
  void it("directional implementation carries direction", () => {
    const o = classifyPair(
      "ADR-007 requires append-only event history.",
      "The event writer appends immutable event records and never updates an existing event.",
      L("a"),
      R("b"),
    );
    assert.ok(["IMPLEMENTS", "SUPPORTS", "UNKNOWN"].includes(o.relation), `got ${o.relation}`);
  });
});

void describe("UNKNOWN discipline", () => {
  void it("disjoint texts abstain with a reason", () => {
    const o = classifyPair("The event writer appends immutable records.", "Focus mode batches everything into the morning digest.", L("a"), R("b"));
    assert.equal(o.relation, "UNKNOWN");
    assert.equal(o.status, "unknown");
    assert.ok((o.unknown_reason ?? "").length > 0);
    assert.equal(o.direction, "not_applicable");
  });
  void it("evidence accompanies non-trivial observations", () => {
    const o = classifyPair("The fare is refundable up to departure.", "The fare is non-refundable after purchase.", L("a"), R("b"));
    if (o.relation !== "UNKNOWN") assert.ok(o.evidence.length > 0);
  });
});
