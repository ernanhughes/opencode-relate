// PEX-R1 instrument: battery evaluation with coverage-gated scoring.
// Run: node scripts/eval.ts — reads tests/battery.json, writes eval-report.json to stdout + file.
import { readFileSync, writeFileSync } from "node:fs";
import { classifyPair } from "../src/engine/index.ts";

interface Case {
  id: string;
  left: string;
  right: string;
  gold: string;
  acceptable: string[];
  overlap: string;
}

const battery = JSON.parse(readFileSync(new URL("../tests/battery.json", import.meta.url), "utf-8")) as { cases: Case[] };
const leftRef = { id: "battery-left", kind: "text" };
const rightRef = { id: "battery-right", kind: "text" };

let covered = 0;
let correctAtCoverage = 0;
let unknown = 0;
const confusion: Record<string, Record<string, number>> = {};
const misses: Array<{ id: string; gold: string; got: string; overlap: string }> = [];
const byOverlap: Record<string, { n: number; correct: number }> = {};

for (const c of battery.cases) {
  const o = classifyPair(c.left, c.right, leftRef, rightRef);
  confusion[c.gold] ??= {};
  confusion[c.gold][o.relation] = (confusion[c.gold][o.relation] ?? 0) + 1;
  byOverlap[c.overlap] ??= { n: 0, correct: 0 };
  byOverlap[c.overlap].n++;
  if (o.relation === "UNKNOWN") {
    unknown++;
    continue;
  }
  covered++;
  if (o.relation === c.gold || c.acceptable.includes(o.relation)) {
    correctAtCoverage++;
    byOverlap[c.overlap].correct++;
  } else {
    misses.push({ id: c.id, gold: c.gold, got: o.relation, overlap: c.overlap });
  }
}

const report = {
  battery: "relate-v0.1",
  n: battery.cases.length,
  unknown_coverage: unknown / battery.cases.length,
  accuracy_at_coverage: covered > 0 ? correctAtCoverage / covered : 0,
  strict_accuracy: (correctAtCoverage + 0) / battery.cases.length,
  by_overlap_stratum: byOverlap,
  confusion,
  misses,
  warning: "heuristic-v0.1 self-evaluation on authored fixtures; NOT a retrieval-utility result. Win-over-cosine untested (PEX-R2).",
};
writeFileSync(new URL("../eval-report.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
