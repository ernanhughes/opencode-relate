import { createHash } from "node:crypto";
import {
  RelateError,
  type Direction,
  type EvidenceSpan,
  type Relation,
  type RelationObservation,
  type SourceRef,
} from "./types.ts";

export const RELATE_VERSION = "0.1.0";
export const TAXONOMY_V1: readonly Relation[] = ["SUPPORTS", "CONTRADICTS", "UPDATES", "IMPLEMENTS", "RELATED", "UNKNOWN"];

const NEG_RE = /\b(not|no|never|n't|non|cannot|can't|unable|fails?|failed|failure|violates?|rejects?|denies|denied|prohibits?|forbids?|forbidden|without|except|refutes?)\b/gi;
const TEMPORAL_RE = /\b(20\d\d[-./]\d\d?[-./]\d\d?|20\d\d|v\d+(?:\.\d+)+|version\s+\d+|firmware\s+(?:below|above|<|>|<=|>=)?\s*\d[\d.]*)\b/gi;
const REQUIRE_RE = /\b(requires?|must|shall|should|mandat\w*|policy|prohibit\w*|forbid\w*|never\s+\w+\s+in\s+place)\b/gi;
const MECHANISM_RE = /\b(appends?|implements?|enforces?|performs?|executes?|writes?|immutable|never\s+updates?|redirects?|batches?|queues?)\b/gi;
const ENTITY_RE = /\b([A-Z][A-Za-z0-9_]*(?:[._-][A-Za-z0-9_]+)+|[A-Z]{2,}[A-Za-z0-9_]*|\b\d[\d.,_-]*\b)\b/g;
const QUALIFIER_RE = /\b(only|except|unless|only\s+if|solely|merely|just|but|however|although|subgroup|allow-list\w*|internal\s+callers?)\b/gi;

function stableId(parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 16);
}

const STOPWORDS = new Set(
  "the,a,an,is,are,was,were,to,for,of,on,in,and,or,with,by,at,from,as,it,this,that,these,those,be,been,has,have,had,will,would,can,may,should,shall,must,its,their,our,your,his,her,which,who,what,when,where,how,than,then,also,into,over,under,between,through,per,via,each,other,more,most,such,only,just,very,too".split(","),
);

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9_]+/g) ?? []);
}

/** Content overlap: stopword-filtered, so function words cannot create relatedness. */
function overlap(a: string, b: string): number {
  const content = (text: string): Set<string> => {
    const out = new Set<string>();
    for (const t of tokens(text)) if (!STOPWORDS.has(t)) out.add(t);
    return out;
  };
  const ta = content(a);
  const tb = content(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

function spans(text: string, re: RegExp, role: EvidenceSpan["role"], limit = 4): EvidenceSpan[] {
  const out: EvidenceSpan[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && out.length < limit) {
    out.push({ excerpt: m[0], role });
    if (m[0].length === 0) re.lastIndex++;
  }
  re.lastIndex = 0;
  return out;
}

function entities(text: string): Set<string> {
  const out = new Set<string>();
  ENTITY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ENTITY_RE.exec(text)) !== null) out.add(m[0].toLowerCase());
  ENTITY_RE.lastIndex = 0;
  return out;
}

/** Shared content referents: identifiers/entities plus non-stopword content tokens.
 *  Heuristic entity detection alone misses common-noun referents ("migration",
 *  "fare"), so contradiction/support gates use this broader set. Documented weakness:
 *  no stemming, no synonymy, no antonymy (improve/deprecate unseen). */
function sharedContent(leftText: string, rightText: string): string[] {
  const content = (text: string): Set<string> => {
    const out = new Set<string>();
    for (const t of tokens(text)) {
      if (STOPWORDS.has(t)) continue;
      if (t.length >= 4 || /\d/.test(t)) out.add(t);
    }
    return out;
  };
  const l = content(leftText);
  return [...content(rightText)].filter((t) => l.has(t));
}

function contentTokens(text: string): string[] {
  const out: string[] = [];
  for (const t of tokens(text)) {
    if (STOPWORDS.has(t)) continue;
    if (t.length >= 4 || /\d/.test(t)) out.push(t);
  }
  return out;
}

/** True when a negation cue sits within ±2 tokens of the target token. */
function cueNear(text: string, target: string): boolean {
  const toks = [...tokens(text)];
  for (let i = 0; i < toks.length; i++) {
    if (toks[i] !== target) continue;
    for (let j = Math.max(0, i - 2); j <= Math.min(toks.length - 1, i + 2); j++) {
      if (j === i) continue;
      NEG_RE.lastIndex = 0;
      if (NEG_RE.test(toks[j])) {
        NEG_RE.lastIndex = 0;
        return true;
      }
      NEG_RE.lastIndex = 0;
    }
  }
  return false;
}

function polarity(text: string): boolean {
  NEG_RE.lastIndex = 0;
  const hits = text.match(NEG_RE) ?? [];
  NEG_RE.lastIndex = 0;
  return hits.length > 0;
}

/** Shared content token negated on exactly one side (e.g. "may read" /
 *  "may not read", "refundable" / "non-refundable"). Strongest signal:
 *  same predicate, opposite polarity. Documented gap: antonymy without
 *  shared stems (improve/deprecate) is invisible to this check. */
function sharedPredicateNegation(leftText: string, rightText: string, shared: string[]): string | null {
  const lct = new Set(contentTokens(leftText));
  const rct = new Set(contentTokens(rightText));
  for (const t of shared) {
    if (!lct.has(t) || !rct.has(t)) continue;
    const ln = cueNear(leftText, t);
    const rn = cueNear(rightText, t);
    if (ln !== rn) return t;
  }
  return null;
}

export interface ClassifyOptions {
  model?: string;
}

export function classifyPair(leftText: string, rightText: string, left: SourceRef, right: SourceRef, options: ClassifyOptions = {}): RelationObservation {
  if (!leftText || leftText.trim().length === 0 || !rightText || rightText.trim().length === 0) {
    throw new RelateError("EMPTY_INPUT", "both sides must be non-empty strings");
  }
  const base = {
    observation_id: "",
    left,
    right,
    producer: { plugin: "opencode-relate" as const, version: RELATE_VERSION, ...(options.model ? { model: options.model } : {}) },
    notes: ["method:heuristic-v0.1 — cue-based, uncalibrated; UNKNOWN is success, not failure."],
  };
  const finish = (relation: Relation, direction: Direction, confidence: number, evidence: EvidenceSpan[], unknown_reason?: string): RelationObservation => ({
    ...base,
    observation_id: stableId(["relate", RELATE_VERSION, left.id, right.id, leftText, rightText, relation, direction]),
    relation,
    direction,
    confidence,
    evidence,
    status: relation === "UNKNOWN" ? "unknown" : "observed",
    ...(unknown_reason ? { unknown_reason } : {}),
  });

  const ov = overlap(leftText, rightText);
  const le = entities(leftText);
  const re = entities(rightText);
  const sharedEntities = [...le].filter((e) => re.has(e));
  const shared = [...new Set([...sharedEntities, ...sharedContent(leftText, rightText)])];
  const entityEvidence: EvidenceSpan[] = shared.slice(0, 4).map((e) => ({ excerpt: e, role: "entity" as const }));
  const negatedPredicate = sharedPredicateNegation(leftText, rightText, shared);
  const lp = polarity(leftText);
  const rp = polarity(rightText);

  // Gate: no shared referents and low overlap → insufficient evidence.
  if (shared.length === 0 && ov < 0.15) {
    return finish("UNKNOWN", "not_applicable", 0.1, [], "no shared entities and lexical overlap below 0.15");
  }

  // 1a. Shared-predicate negation: same predicate, opposite polarity.
  // Strongest signal; checked before implements so "never updates" style
  // mechanism language is not mistaken for opposition without a shared target.
  if (negatedPredicate !== null) {
    const evidence = [...entityEvidence, { excerpt: negatedPredicate, role: "negation" as const }];
    return finish("CONTRADICTS", "symmetric", 0.6, evidence);
  }

  // 1b. Generic polarity mismatch: one side negated, the other not, with
  // shared referents — but only after the implements check below has had its
  // chance (mechanism language like "never updates" must not read as opposition).
  const genericMismatch = shared.length > 0 && lp !== rp;
  // 2. Update: shared referents + differing temporal/version markers.
  // (Placed before implements: a dated revision claim outranks mechanism reading.)
  const lt = [...leftText.matchAll(TEMPORAL_RE)].map((m) => m[0].toLowerCase());
  const rt = [...rightText.matchAll(TEMPORAL_RE)].map((m) => m[0].toLowerCase());
  const temporalDiff = lt.filter((t) => !rt.includes(t)).length > 0 || rt.filter((t) => !lt.includes(t)).length > 0;
  if (shared.length > 0 && (lt.length > 0 || rt.length > 0) && temporalDiff) {
    const evidence = [
      ...entityEvidence,
      ...spans(leftText, TEMPORAL_RE, "temporal", 2),
      ...spans(rightText, TEMPORAL_RE, "temporal", 2),
    ];
    // Direction: side carrying the newer/superseding marker updates the other.
    // Heuristic cannot order markers reliably → point from the side with MORE
    // temporal markers, else record direction uncertainty in notes.
    const direction: Direction = rt.length !== lt.length ? (rt.length > lt.length ? "right_to_left" : "left_to_right") : "symmetric";
    return finish("UPDATES", direction, 0.45, evidence);
  }

  // 3. Implements: requirement language on one side, mechanism on the other.
  const lReq = REQUIRE_RE.test(leftText);
  REQUIRE_RE.lastIndex = 0;
  const rReq = REQUIRE_RE.test(rightText);
  REQUIRE_RE.lastIndex = 0;
  const lMech = MECHANISM_RE.test(leftText);
  MECHANISM_RE.lastIndex = 0;
  const rMech = MECHANISM_RE.test(rightText);
  MECHANISM_RE.lastIndex = 0;
  if (shared.length > 0 && ((lReq && rMech) || (rReq && lMech))) {
    const reqSide = lReq && !rReq ? leftText : rReq && !lReq ? rightText : null;
    const mechSide = lMech && !rMech ? leftText : rMech && !lMech ? rightText : null;
    const evidence = [
      ...entityEvidence,
      ...(reqSide ? spans(reqSide, REQUIRE_RE, "requirement", 2) : []),
      ...(mechSide ? spans(mechSide, MECHANISM_RE, "mechanism", 2) : []),
    ];
    const direction: Direction = mechSide === leftText ? "left_to_right" : mechSide === rightText ? "right_to_left" : "symmetric";
    return finish("IMPLEMENTS", direction, 0.5, evidence);
  }

  // 3b. Generic polarity mismatch (evaluated after implements so mechanism
  // language like "never updates" is not mistaken for opposition).
  if (genericMismatch) {
    const evidence = [...entityEvidence, ...spans(lp ? leftText : rightText, NEG_RE, "negation")];
    return finish("CONTRADICTS", "symmetric", 0.5, evidence);
  }

  // 4. Supports: shared referents + same polarity + substantive overlap.
  if (shared.length > 0 && lp === rp && ov >= 0.3) {
    const evidence = [...entityEvidence, ...spans(leftText, QUALIFIER_RE, "qualifier", 2), ...spans(rightText, QUALIFIER_RE, "qualifier", 2)];
    const direction: Direction = rightText.length !== leftText.length ? (rightText.length > leftText.length ? "right_to_left" : "left_to_right") : "symmetric";
    return finish("SUPPORTS", direction, 0.4, evidence);
  }

  // 5. Related: shared topic/referents, nothing stronger established.
  if (shared.length > 0 || ov >= 0.15) {
    const overlapEvidence: EvidenceSpan[] = [
      ...entityEvidence,
      ...shared.slice(0, 2).map((e) => ({ excerpt: e, role: "overlap" as const })),
    ];
    return finish("RELATED", "symmetric", 0.3, overlapEvidence.slice(0, 4));
  }

  return finish("UNKNOWN", "not_applicable", 0.1, [], "no relation cue met its threshold");
}
