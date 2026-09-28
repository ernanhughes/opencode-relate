import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rankCandidates, compatibilityScore } from "../src/engine/index.ts";
import { RelateError } from "../src/engine/index.ts";

const C = (id: string, text: string) => ({ id, text });

void describe("rank contract", () => {
  void it("rejects empty subject / relation / candidates", () => {
    assert.throws(() => rankCandidates("  ", [C("a", "do x")], "appropriate_next_action"), (e) => e instanceof RelateError);
    assert.throws(() => rankCandidates("state", [C("a", "do x")], "  "), (e) => e instanceof RelateError);
    assert.throws(() => rankCandidates("state", [], "appropriate_next_action"), (e) => e instanceof RelateError);
    assert.throws(() => rankCandidates("state", [{ id: "a", text: "  " }], "appropriate_next_action"), (e) => e instanceof RelateError);
  });
  void it("rejects duplicate candidate ids and oversized sets", () => {
    assert.throws(() => rankCandidates("s", [C("a", "x"), C("a", "y")], "r"), (e) => e instanceof RelateError && e.code === "CONFIG_INVALID");
    const many = Array.from({ length: 17 }, (_, i) => C(`c${i}`, `action ${i}`));
    assert.throws(() => rankCandidates("s", many, "r"), (e) => e instanceof RelateError && e.code === "CONFIG_INVALID");
  });
  void it("is deterministic with stable observation ids", () => {
    const a = rankCandidates("state text", [C("a", "do x"), C("b", "do y")], "appropriate_next_action");
    const b = rankCandidates("state text", [C("a", "do x"), C("b", "do y")], "appropriate_next_action");
    assert.equal(a.observation_id, b.observation_id);
    assert.equal(a.producer.plugin, "opencode-relate");
  });
  void it("is asymmetric: subject and candidate are not interchangeable", () => {
    const fwd = compatibilityScore("The migration failed: missing column customer_type.", "Inspect the destination schema", "appropriate_next_action");
    const rev = compatibilityScore("Inspect the destination schema", "The migration failed: missing column customer_type.", "appropriate_next_action");
    assert.notEqual(fwd.score, rev.score);
  });
  void it("never carries permission to execute", () => {
    const r = rankCandidates("state", [C("a", "do x")], "appropriate_next_action");
    assert.ok(!("permission_to_execute" in r));
    assert.ok(!("should_execute" in r));
    assert.ok(!("authorized" in r));
  });
});

void describe("migration acceptance", () => {
  void it("ranks inspect above retry/timeout for a missing-column failure", () => {
    const r = rankCandidates(
      "The migration failed because the destination schema doesn't contain column customer_type.",
      [
        C("inspect-schema", "Inspect the destination schema and list columns to confirm customer_type is absent"),
        C("retry-migration", "Retry the migration against the same destination schema"),
        C("increase-timeout", "Increase the migration timeout and retry with a longer deadline"),
      ],
      "appropriate_next_action",
    );
    assert.equal(r.candidates[0]!.candidate_id, "inspect-schema");
    assert.equal(r.status, "observed");
    assert.ok((r.margin ?? 0) >= 0.15, `margin ${r.margin}`);
    assert.ok(r.evidence.length > 0);
  });
  void it("abstains on vague state with a reason", () => {
    const r = rankCandidates("Something feels off about the system lately.", [C("a", "Retry the migration"), C("b", "Regenerate credentials")], "appropriate_next_action");
    assert.equal(r.status, "unknown");
    assert.ok((r.unknown_reason ?? "").length > 0);
    assert.equal(r.top_candidate, undefined);
  });
});
