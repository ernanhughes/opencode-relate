# OpenCode Relate — Design Contract

## Invariants

1. Similarity is not a relationship label.
2. Relationship is not truth.
3. Relationship is not authority.
4. Direction matters.
5. `UNKNOWN` is a successful result when evidence is insufficient.
6. Evidence/provenance accompany non-trivial observations.
7. Forced classification is distinguishable from genuine coverage.
8. Core classification/evaluation is testable without OpenCode.
9. OpenCode integration is a thin adapter.
10. No direct dependency on the other Language plugins.

## Seed adjudication order

```text
EQUIVALENT
→ NEGATES / CONTRADICTS
→ TEMPORAL_MISMATCH
→ SUPERSEDES / UPDATES
→ DEPENDS_ON / IMPLEMENTS / EXPLAINS
→ SUPPORTS / PARTIAL_SUPPORT
→ PARAPHRASE
→ TOPIC_RELATED / ENTITY_RELATED
→ UNRELATED
→ UNKNOWN when evidence is insufficient
```

Treat this as a hypothesis to refine against cases.

## v0.1

- ordered text pairs;
- 4–6 relation classes plus `UNKNOWN`;
- direction;
- source refs;
- evidence spans/excerpts;
- explicit abstention;
- per-class fixtures;
- near misses;
- lexical-overlap strata;
- no embedding database required.

## Evaluation

Report class-specific measures, `UNKNOWN` coverage, accuracy-at-coverage, confusion matrix, hard-negative results, and lexical-overlap strata. A single aggregate accuracy is insufficient.

## Early failures

Include same entities/opposite claim, same topic/unrelated proposition, reversed direction, negation, stale/current mismatch, implementation vs discussion, missing qualifier, and low lexical overlap with a real relationship.

## Non-goals

No global graph database, general retrieval, truth arbitration, source rewriting, attention ranking, or action permission.

## Acceptance test

"The migration completed successfully" and "The migration failed for tenant 1847" must not be flattened to "similar". Emit a typed relation or `UNKNOWN`, with evidence and source identity.
