// No-inference load check: tool surface constructs without OpenCode, models, or network.
import { relateTools } from "../src/tools.ts";

const names = relateTools().map((t) => t.name).sort();
const expected = ["relate", "relate_health", "relate_many"];
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
console.log("relate load check ok: relate, relate_many, relate_health");
