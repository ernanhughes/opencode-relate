// PEX-A1 instrument: RELATE-ACTION bake-off.
// Baselines: random (hash), cosine (token, no embeddings), projection
// (existing RelationProjection mapped to a score), candidate: compatibility.
// Metrics: top-1, MRR, pairwise hard-negative ordering, margin,
// abstention accuracy, accuracy-at-coverage, per-relation accuracy,
// confident-wrong rate. Run: node scripts/eval-actions.ts
import { readFileSync, writeFileSync } from "node:fs";
import { classifyPair, compatibilityScore, cosineScore, pseudoRandomScore, rankCandidates } from "../src/engine/index.ts";

interface BatteryCandidate {
  id: string;
  text: string;
  trap?: string;
}
interface ActionCase {
  id: string;
  relation: string;
  subject: string;
  subject_kind: string;
  candidate_kind: string;
  positive: BatteryCandidate | null;
  acceptable?: string[];
  extra_acceptable?: BatteryCandidate[];
  abstain?: boolean;
  negatives: BatteryCandidate[];
}

const battery = JSON.parse(readFileSync(new URL("../tests/action-battery.json", import.meta.url), "utf-8")) as { battery: string; cases: ActionCase[] };

function projectionScore(subject: string, candidate: string): number {
  const o = classifyPair(subject, candidate, { id: "eval-s", kind: "text" }, { id: "eval-c", kind: "text" });
  if (o.relation === "UNKNOWN") return 0.1;
  if (o.relation === "RELATED") return 0.3;
  return o.confidence;
}

type Baseline = "random" | "cosine" | "projection" | "compatibility";

function scoreMap(baseline: Baseline, c: ActionCase, all: BatteryCandidate[]): Map<string, number> {
  const m = new Map<string, number>();
  if (baseline === "random") for (const x of all) m.set(x.id, pseudoRandomScore(`${c.id}|${x.id}|${x.text}`));
  if (baseline === "cosine") for (const x of all) m.set(x.id, cosineScore(c.subject, x.text));
  if (baseline === "projection") for (const x of all) m.set(x.id, projectionScore(c.subject, x.text));
  if (baseline === "compatibility") {
    const r = rankCandidates(
      c.subject,
      all.map((x) => ({ id: x.id, text: x.text })),
      c.relation,
      { subject_kind: c.subject_kind, candidate_kind: c.candidate_kind },
    );
    for (const cr of r.candidates) m.set(cr.candidate_id, cr.score);
  }
  return m;
}

function orderOf(scores: Map<string, number>): string[] {
  return [...scores.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([id]) => id);
}

const baselines: Baseline[] = ["random", "cosine", "projection", "compatibility"];
const judged = battery.cases.filter((c) => !c.abstain);
const abstainCases = battery.cases.filter((c) => c.abstain);

interface BaselineReport {
  top1_accuracy: number;
  mrr: number;
  pairwise_ordering: number;
  per_relation: Record<string, { n: number; correct: number }>;
  misses: Array<{ case: string; top: string; expected: string }>;
}

const report: Record<string, unknown> = { battery: battery.battery, n: battery.cases.length, baselines: {} };

// Compatibility-only calibration metrics.
let covered = 0;
let correctAtCoverage = 0;
let confidentWrong = 0;
let abstainCorrect = 0;
const margins: number[] = [];

for (const b of baselines) {
  let top1 = 0;
  let rrSum = 0;
  let pairOk = 0;
  let pairN = 0;
  const perRelation: Record<string, { n: number; correct: number }> = {};
  const misses: BaselineReport["misses"] = [];
  for (const c of judged) {
    const good = [c.positive, ...(c.extra_acceptable ?? [])].filter((x) => x !== null) as BatteryCandidate[];
    const goodIds = new Set([...good.map((g) => g.id), ...(c.acceptable ?? [])]);
    const all: BatteryCandidate[] = [...good, ...c.negatives];
    const scores = scoreMap(b, c, all);
    const order = orderOf(scores);
    const expected = c.positive || good[0]!;
    perRelation[c.relation] ??= { n: 0, correct: 0 };
    perRelation[c.relation].n++;
    if (goodIds.has(order[0]!)) {
      top1++;
      perRelation[c.relation].correct++;
    } else {
      misses.push({ case: c.id, top: order[0]!, expected: [...goodIds].join("|") });
    }
    const firstGood = order.findIndex((id) => goodIds.has(id));
    rrSum += 1 / (firstGood + 1);
    for (const g of goodIds) {
      for (const n of c.negatives) {
        pairN++;
        if ((scores.get(g) ?? -1) > (scores.get(n.id) ?? -1)) pairOk++;
      }
    }
    if (b === "compatibility") {
      const r = rankCandidates(c.subject, all.map((x) => ({ id: x.id, text: x.text })), c.relation);
      if (r.margin !== undefined) margins.push(r.margin);
      if (r.status !== "unknown") {
        covered++;
        if (r.top_candidate !== undefined && goodIds.has(r.top_candidate)) correctAtCoverage++;
        else if (r.status === "observed") confidentWrong++;
      }
    }
  }
  (report.baselines as Record<string, BaselineReport>)[b] = {
    top1_accuracy: Math.round((top1 / judged.length) * 1000) / 1000,
    mrr: Math.round((rrSum / judged.length) * 1000) / 1000,
    pairwise_ordering: pairN > 0 ? Math.round((pairOk / pairN) * 1000) / 1000 : 0,
    per_relation: perRelation,
    misses,
  };
}

for (const c of abstainCases) {
  const all = c.negatives;
  const r = rankCandidates(c.subject, all.map((x) => ({ id: x.id, text: x.text })), c.relation);
  if (r.status === "unknown") abstainCorrect++;
}

report["compatibility_calibration"] = {
  coverage: Math.round((covered / judged.length) * 1000) / 1000,
  accuracy_at_coverage: covered > 0 ? Math.round((correctAtCoverage / covered) * 1000) / 1000 : 0,
  confident_wrong_rate: Math.round((confidentWrong / judged.length) * 1000) / 1000,
  abstention_accuracy: abstainCases.length > 0 ? Math.round((abstainCorrect / abstainCases.length) * 1000) / 1000 : 0,
  mean_top1_top2_margin: margins.length > 0 ? Math.round((margins.reduce((a, x) => a + x, 0) / margins.length) * 1000) / 1000 : 0,
};
report["warning"] = "heuristic-v0.1 self-evaluation on authored fixtures; NOT a retrieval-utility result. Scores are uncalibrated ordering evidence, never probabilities.";

writeFileSync(new URL("../eval-actions-report.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
