export type Relation = "SUPPORTS" | "CONTRADICTS" | "UPDATES" | "IMPLEMENTS" | "RELATED" | "UNKNOWN";

export type Direction = "left_to_right" | "right_to_left" | "symmetric" | "not_applicable";

export interface SourceRef {
  id: string;
  kind: string;
  uri?: string;
  version?: string;
  scope?: string;
  observed_at?: string;
}

export interface EvidenceSpan {
  excerpt: string;
  role: "negation" | "temporal" | "requirement" | "mechanism" | "entity" | "qualifier" | "overlap";
}

export interface RelationObservation {
  observation_id: string;
  left: SourceRef;
  right: SourceRef;
  relation: Relation;
  direction: Direction;
  /** Uncalibrated heuristic strength. Never a substitute for evidence or a reason to skip UNKNOWN. */
  confidence: number;
  evidence: EvidenceSpan[];
  status: "observed" | "unknown";
  unknown_reason?: string;
  producer: { plugin: "opencode-relate"; version: string; model?: string };
  notes: string[];
}

export type RelateFailureCode = "EMPTY_INPUT" | "CONFIG_INVALID";

export class RelateError extends Error {
  readonly code: RelateFailureCode;
  constructor(code: RelateFailureCode, message: string) {
    super(message);
    this.name = "RelateError";
    this.code = code;
  }
}
