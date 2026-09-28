// No-inference load check: tool surface constructs without OpenCode, models, or network.
import { relateTools } from "../src/tools.ts";

const names = relateTools().map((t) => t.name).sort();
const expected = ["relate", "relate_health", "relate_many", "relate_rank"];
if (JSON.stringify(names) !== JSON.stringify(expected)) {
  console.error(`tool surface mismatch: ${names.join(",")}`);
  process.exit(1);
}
const health = relateTools().find((t) => t.name === "relate_health")!;
const result = (await health.execute({}, undefined as never)) as { content: string };
const parsed = JSON.parse(result.content) as { ok: boolean };
if (parsed.ok !== true) {
  console.error(`health check failed: ${result.content}`);
  process.exit(1);
}
const rank = relateTools().find((t) => t.name === "relate_rank")!;
const rankResult = (await rank.execute(
  {
    subject_text: "The migration failed because the destination schema doesn't contain column customer_type.",
    relation: "appropriate_next_action",
    candidates: [{ id: "a", text: "Inspect the destination schema" }],
  },
  undefined as never,
)) as { content: string };
const rankParsed = JSON.parse(rankResult.content) as { ranking?: { relation: string } };
if (rankParsed.ranking?.relation !== "appropriate_next_action") {
  console.error(`rank smoke failed: ${rankResult.content}`);
  process.exit(1);
}
console.log("relate load check ok: relate, relate_many, relate_rank, relate_health");
