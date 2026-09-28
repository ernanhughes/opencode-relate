import { createHash } from "node:crypto";
import { RELATE_VERSION } from "./classify.ts";
import { RelateError, type EvidenceSpan, type SourceRef } from "./types.ts";
import type {
  CalibrationRef,
  RelationCandidateInput,
  RelationRanking,
} from "./ranking-types.ts";

export const RANK_VERSION = RELATE_VERSION;

/** Ranked action/tool relations with tuned need↔action affinity. Anything else uses the generic fallback. */
export const RANK_RELATIONS = [
  "appropriate_next_action",
  "appropriate_remediation",
  "appropriate_tool",
  "appropriate_model",
  "appropriate_context_operation",
] as const;

const CALIBRATION: CalibrationRef = {
  method: "heuristic-v0.1 — uncalibrated cue affinity; scores are ordering evidence, not probabilities.",
  top_threshold: 0.55,
  margin_threshold: 0.15,
  note: "Status observed/ambiguous/unknown follows explicit thresholds. COMPATIBILITY != USABILITY: never execute from a ranking alone.",
};

const STOPWORDS = new Set(
  "the,a,an,is,are,was,were,to,for,of,on,in,and,or,with,by,at,from,as,it,this,that,these,those,be,been,has,have,had,will,would,can,may,should,shall,must,its,their,our,your,his,her,which,who,what,when,where,how,than,then,also,into,over,under,between,through,per,via,each,other,more,most,such,only,just,very,too,does,do,did,not,no".split(","),
);

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
}

function contentSet(text: string): Set<string> {
  const out = new Set<string>();
  for (const t of tokens(text)) {
    if (STOPWORDS.has(t)) continue;
    if (t.length >= 3 || /\d/.test(t)) out.add(t);
  }
  return out;
}

function stableId(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, Math.round(x * 100) / 100));
}

interface NeedHit {
  need: string;
  excerpt: string;
}

interface ActionHit {
  action: string;
  excerpt: string;
}

// --- subject need detectors (ordered, first match wins per group but all groups apply) ---

const NEED_PATTERNS: Array<{ need: string; re: RegExp }> = [
  { need: "missing_schema", re: /doesn.?t contain|missing column|no such column|unknown column|schema mismatch|destination schema/i },
  { need: "timeout", re: /timed?\s?out|timeout|deadline exceeded|took too long/i },
  { need: "credentials", re: /credential|unauthorized|forbidden|401|403|token expired|invalid api key|access denied/i },
  { need: "state_conflict", re: /migration state|state lock|already applied|dirty state|state conflict/i },
  { need: "failure", re: /failed|failure|error|exception|violates?|uniqueviolation|traceback/i },
  { need: "stale_output", re: /stale|out of date|superseded|rescheduled|old revision/i },
  { need: "search_need", re: /where is|find|locate|which file|search/i },
  { need: "read_need", re: /read|show me|display|contents of|open the file/i },
  { need: "exec_need", re: /run|execute|build|compile|test failure|run the/i },
  { need: "context_overflow", re: /context (is )?(too (long|large)|overflow|exceeds)|too many tokens|context limit/i },
  { need: "trivial_task", re: /trivial|formatting|rename|simple task|typo/i },
  { need: "hard_reasoning", re: /deep reasoning|novel|complex|distributed|hard bug/i },
  { need: "code_task", re: /bug|codebase|compile|stack trace|test failure/i },
  { need: "vague_task", re: /.*/ }, // catch-all so generic overlap still yields a need label
];

const ACTION_PATTERNS: Array<{ action: string; re: RegExp }> = [
  // Destructive / state-changing actions first: a candidate that proposes one
  // keeps that label even when it mentions inspection or search terms.
  { action: "delete_state", re: /delete .*state|reset .*state|drop .*state|clear .*state/i },
  { action: "regen_creds", re: /regenerat|rotat.*(key|credential|secret)|new api key|refresh token/i },
  { action: "increase_timeout", re: /increase.*timeout|longer timeout|raise.*deadline|extend.*timeout/i },
  { action: "rollback", re: /\brollback|revert|downgrade|undo/i },
  { action: "retry", re: /\bretry|rerun|reattempt|run .*again/i },
  { action: "escalate", re: /escalate|page .*human|ask .*maintainer|human review/i },
  { action: "inspect", re: /\binspect|describe|show .*schema|examine|check .*schema|list columns|diagnose/i },
  { action: "read", re: /\bread\b|open .*file|show .*contents|display file/i },
  { action: "search", re: /\b(grep|search|find|locate|ripgrep)\b/i },
  { action: "compress", re: /compress|summarize|condense|truncate/i },
  { action: "expand", re: /expand|retrieve more|fetch more context|elaborate/i },
  { action: "discard", re: /discard|drop .*context|evict/i },
  { action: "cheap_model", re: /cheap|fast model|haiku|mini|small model/i },
  { action: "frontier_model", re: /frontier|strongest model|opus|o1|expert model/i },
  { action: "code_model", re: /coding model|code model|sonnet/i },
  { action: "generic_action", re: /.*/ },
];

/**
 * Asymmetric need→action affinity in [-0.4, +0.7].
 * Positive: the action addresses the need. Negative: same-vocabulary trap
 * (e.g. retry-before-inspect, timeout bump for a schema error).
 * Unknown pairs default to 0 so generic grounding decides.
 */
const AFFINITY: Record<string, Record<string, number>> = {
  missing_schema: { inspect: 0.65, retry: -0.2, increase_timeout: -0.25, regen_creds: -0.25, delete_state: -0.3, rollback: -0.1, escalate: 0.05 },
  timeout: { increase_timeout: 0.6, retry: 0.25, inspect: 0.0, regen_creds: -0.25, delete_state: -0.3, rollback: -0.15 },
  credentials: { regen_creds: 0.65, retry: -0.15, increase_timeout: -0.25, inspect: 0.05, delete_state: -0.25 },
  state_conflict: { inspect: 0.3, rollback: 0.35, delete_state: -0.15, retry: -0.2, increase_timeout: -0.25, regen_creds: -0.25 },
  failure: { inspect: 0.25, retry: 0.05, rollback: 0.05, escalate: 0.1, increase_timeout: -0.1, regen_creds: -0.1, delete_state: -0.2 },
  stale_output: { inspect: 0.15, retry: 0.1, rollback: 0.05 },
  search_need: { search: 0.6, read: 0.1, inspect: 0.05, delete_state: -0.3, regen_creds: -0.25 },
  read_need: { read: 0.6, search: 0.15, inspect: 0.1, delete_state: -0.3 },
  exec_need: { retry: 0.2, inspect: 0.2, rollback: 0.0 },
  context_overflow: { compress: 0.6, discard: 0.25, expand: -0.3, inspect: -0.1 },
  trivial_task: { cheap_model: 0.6, frontier_model: -0.2, code_model: -0.1 },
  hard_reasoning: { frontier_model: 0.6, cheap_model: -0.2, code_model: 0.1 },
  code_task: { code_model: 0.5, frontier_model: 0.2, cheap_model: -0.1 },
  vague_task: {},
};

function detectNeeds(subject: string): NeedHit[] {
  const hits: NeedHit[] = [];
  for (const { need, re } of NEED_PATTERNS) {
    if (need === "vague_task") continue;
    const m = subject.match(re);
    if (m) hits.push({ need, excerpt: m[0] });
  }
  if (hits.length === 0) hits.push({ need: "vague_task", excerpt: subject.slice(0, 80) });
  return hits.slice(0, 3);
}

function detectAction(candidate: string): ActionHit {
  // The proposal verb leads: pick the earliest match in the text, so a
  // candidate that MENTIONS another action ("grep ... for retry policy")
  // keeps the label of what it PROPOSES. Ties fall back to list order,
  // which ranks destructive/state-changing actions first.
  let best: ActionHit | null = null;
  let bestIndex = Infinity;
  for (const { action, re } of ACTION_PATTERNS) {
    if (action === "generic_action") continue;
    // Fresh regex per test: global-flag state is reset by construction below.
    const m = candidate.match(new RegExp(re.source, "i"));
    if (m && m.index !== undefined && m.index < bestIndex) {
      bestIndex = m.index;
      best = { action, excerpt: m[0] };
    }
  }
  return best ?? { action: "generic_action", excerpt: candidate.slice(0, 60) };
}

function affinityScore(needs: NeedHit[], action: string): number {
  let best = 0;
  let hasNegative = false;
  for (const n of needs) {
    const row = AFFINITY[n.need] ?? {};
    const v = row[action] ?? 0;
    if (v < 0) hasNegative = true;
    if (v > best) best = v;
  }
  // A trap on ANY detected need drags the score down even if another need matches weakly.
  if (best <= 0 && hasNegative) return -0.2;
  if (hasNegative && best > 0) return best - 0.1;
  return best;
}

/** Directional grounding: how much of the candidate is anchored in the subject (asymmetric). */
function groundingScore(subject: string, candidate: string): number {
  const s = contentSet(subject);
  const c = contentSet(candidate);
  if (s.size === 0 || c.size === 0) return 0;
  let inter = 0;
  for (const t of c) if (s.has(t)) inter++;
  return inter / Math.max(1, Math.min(c.size, 5));
}

/** Deterministic pseudo-random baseline hook (hash of text). Exported for the evaluator. */
export function pseudoRandomScore(seed: string): number {
  const h = createHash("sha256").update(`random-baseline|${seed}`).digest();
  return (h[0] + h[1] / 256) / 256;
}

/** Symmetric token cosine baseline (no embeddings). Exported for the evaluator. */
export function cosineScore(a: string, b: string): number {
  const ta = tokens(a).filter((t) => !STOPWORDS.has(t));
  const tb = tokens(b).filter((t) => !STOPWORDS.has(t));
  if (ta.length === 0 || tb.length === 0) return 0;
  const fa = new Map<string, number>();
  const fb = new Map<string, number>();
  for (const t of ta) fa.set(t, (fa.get(t) ?? 0) + 1);
  for (const t of tb) fb.set(t, (fb.get(t) ?? 0) + 1);
  let dot = 0;
  for (const [t, ca] of fa) dot += ca * (fb.get(t) ?? 0);
  const na = Math.sqrt([...fa.values()].reduce((s, c) => s + c * c, 0));
  const nb = Math.sqrt([...fb.values()].reduce((s, c) => s + c * c, 0));
  if (na === 0 || nb === 0) return 0;
  return Math.round((dot / (na * nb)) * 100) / 100;
}

export function compatibilityScore(subject: string, candidate: string, relation: string): { score: number; evidence: EvidenceSpan[]; detail: string } {
  const needs = detectNeeds(subject);
  const act = detectAction(candidate);
  const aff = affinityScore(needs, act.action);
  const ground = groundingScore(subject, candidate);
  const knownRelation = (RANK_RELATIONS as readonly string[]).includes(relation);
  // Asymmetric by construction: affinity(needs(subject) → action(candidate)) + grounding(subject ⊃ candidate).
  const raw = knownRelation ? 0.35 + aff + 0.3 * ground : 0.25 + 0.35 * ground + 0.2 * cosineScore(subject, candidate);
  const score = clamp01(raw);
  const evidence: EvidenceSpan[] = [
    ...needs.slice(0, 2).map((n) => ({ excerpt: n.excerpt.slice(0, 120), role: "overlap" as const })),
    { excerpt: act.excerpt.slice(0, 120), role: "mechanism" as const },
  ];
  const detail = `needs=[${needs.map((n) => n.need).join(",")}] action=${act.action} affinity=${aff.toFixed(2)} grounding=${ground.toFixed(2)}`;
  return { score, evidence, detail };
}

export interface RankOptions {
  model?: string;
}

export function rankCandidates(
  subject: string,
  candidates: RelationCandidateInput[],
  relation: string,
  opts: { subjectRef?: SourceRef; subject_kind?: string; candidate_kind?: string } & RankOptions = {},
): RelationRanking {
  if (!subject || subject.trim().length === 0) throw new RelateError("EMPTY_INPUT", "subject must be a non-empty string");
  if (!relation || relation.trim().length === 0) throw new RelateError("EMPTY_INPUT", "relation must be a non-empty string");
  if (!Array.isArray(candidates) || candidates.length === 0) throw new RelateError("EMPTY_INPUT", "candidates must be a non-empty array");
  if (candidates.length > 16) throw new RelateError("CONFIG_INVALID", "candidates bounded at 16");
  const seen = new Set<string>();
  for (const c of candidates) {
    if (!c || !c.text || c.text.trim().length === 0) throw new RelateError("EMPTY_INPUT", "every candidate needs non-empty text");
    if (!c.id) throw new RelateError("EMPTY_INPUT", "every candidate needs an id");
    if (seen.has(c.id)) throw new RelateError("CONFIG_INVALID", `duplicate candidate id: ${c.id}`);
    seen.add(c.id);
  }

  const subjectRef: SourceRef = opts.subjectRef ?? { id: "relate-subject", kind: opts.subject_kind ?? "state" };
  const subject_kind = opts.subject_kind ?? subjectRef.kind ?? "state";
  const candidate_kind = opts.candidate_kind ?? candidates[0]?.kind ?? "action";

  const scored = candidates.map((c) => {
    const { score, evidence, detail } = compatibilityScore(subject, c.text, relation);
    return { c, score, evidence, detail };
  });
  // Stable deterministic order: score desc, then candidate id asc.
  scored.sort((a, b) => b.score - a.score || (a.c.id < b.c.id ? -1 : 1));

  const ranked = scored.map((s, i) => ({ candidate_id: s.c.id, score: s.score, rank: i + 1 }));
  const top = scored[0]!;
  const runner = scored[1];
  const margin = runner ? Math.round((top.score - runner.score) * 100) / 100 : undefined;

  let status: RelationRanking["status"] = "unknown";
  let unknown_reason: string | undefined;
  if (top.score >= CALIBRATION.top_threshold && (margin === undefined || margin >= CALIBRATION.margin_threshold)) {
    status = "observed";
  } else if (top.score >= 0.4) {
    status = "ambiguous";
    unknown_reason = margin !== undefined && margin < CALIBRATION.margin_threshold ? `top-two margin ${margin} below ${CALIBRATION.margin_threshold}` : `top score ${top.score} below ${CALIBRATION.top_threshold}`;
  } else {
    status = "unknown";
    unknown_reason = `top score ${top.score} below abstention floor 0.40`;
  }

  // Evidence: subject-need span + winning-candidate action span (never the full text).
  const evidence: EvidenceSpan[] = top.evidence.slice(0, 4);

  const observation_id = stableId(["relate-rank", RANK_VERSION, subject, relation, ...candidates.map((c) => `${c.id}|${c.text}`), JSON.stringify(ranked)]);
  return {
    observation_id,
    relation,
    subject: subjectRef,
    subject_kind,
    candidate_kind,
    candidates: ranked,
    top_candidate: status === "unknown" ? undefined : top.c.id,
    top_score: top.score,
    runner_up_score: runner?.score,
    margin,
    calibration: CALIBRATION,
    status,
    ...(unknown_reason ? { unknown_reason } : {}),
    evidence,
    producer: { plugin: "opencode-relate", version: RANK_VERSION, ...(opts.model ? { model: opts.model } : {}) },
    notes: [
      "method:compatibility-heuristic-v0.1 — asymmetric need→action affinity + directional grounding; uncalibrated.",
      "COMPATIBILITY != USABILITY: ranking is measurement evidence, never permission to execute.",
      top.detail,
    ],
  };
}
