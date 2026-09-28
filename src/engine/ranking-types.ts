import type { EvidenceSpan, SourceRef } from "./types.ts";

/** Kinds are explicit and boring by design: no agent concepts leak into core. */
export type SubjectKind = string;
export type CandidateKind = string;

export interface RelationCandidateInput {
  id: string;
  text: string;
  kind?: string;
}

export interface RankCandidatesInput {
  relation: string;
  subject: string;
  subject_id?: string;
  subject_kind?: string;
  candidate_kind?: string;
  candidates: RelationCandidateInput[];
}

export interface CandidateRelation {
  candidate_id: string;
  score: number;
  rank: number;
}

export type RankingStatus = "observed" | "ambiguous" | "unknown";

export interface CalibrationRef {
  method: string;
  top_threshold: number;
  margin_threshold: number;
  note: string;
}

export interface ProducerRef {
  plugin: "opencode-relate";
  version: string;
  model?: string;
}

export interface RelationRanking {
  observation_id: string;
  relation: string;
  subject: SourceRef;
  subject_kind: string;
  candidate_kind: string;
  candidates: CandidateRelation[];
  top_candidate?: string;
  top_score?: number;
  runner_up_score?: number;
  margin?: number;
  calibration: CalibrationRef;
  status: RankingStatus;
  unknown_reason?: string;
  evidence: EvidenceSpan[];
  producer: ProducerRef;
  notes: string[];
}

/**
 * COMPATIBILITY != USABILITY.
 * A ranking never carries permission to execute. There is intentionally
 * no `permission_to_execute`, `authorized`, or `should_execute` field.
 */
