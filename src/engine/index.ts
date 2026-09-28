export { classifyPair, TAXONOMY_V1, RELATE_VERSION } from "./classify.ts";
export { rankCandidates, compatibilityScore, cosineScore, pseudoRandomScore, RANK_RELATIONS, RANK_VERSION } from "./compatibility.ts";
export { RelateError } from "./types.ts";
export type { Direction, EvidenceSpan, RelateFailureCode, Relation, RelationObservation, SourceRef } from "./types.ts";
export type {
  CalibrationRef,
  CandidateRelation,
  ProducerRef,
  RankCandidatesInput,
  RankingStatus,
  RelationCandidateInput,
  RelationRanking,
} from "./ranking-types.ts";
