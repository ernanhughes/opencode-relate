# OpenCode Relate

OpenCode Relate is a small OpenCode plugin for answering a question similarity alone cannot answer:

> **How does this piece of information relate to that one?**

It emits typed, directional relationship observations with evidence and a first-class `UNKNOWN` path.

## One job

```text
item A + item B + relation vocabulary
        ↓
      RELATE
        ↓
RelationObservation
```

Relate is **not** a vector database, general retriever, truth engine, memory system, attention ranker, or authority gate.

## Proposed OpenCode tools

- `relate` — judge one ordered pair.
- `relate_many` — compare one focal item against a bounded candidate set.
- `relate_rank` — rank up to 16 candidates by directed compatibility with a subject state for one relation. Returns `RelationRanking` (scores, ranks, margin, calibration, `observed`/`ambiguous`/`unknown`). Measurement only, never permission to execute.
- `relate_health` — readiness/configuration without inference.

## Seed relation vocabulary

`EQUIVALENT`, `PARAPHRASE`, `SUPPORTS`, `PARTIAL_SUPPORT`, `CONTRADICTS`, `NEGATES`, `UPDATES`, `SUPERSEDES`, `DEPENDS_ON`, `IMPLEMENTS`, `EXPLAINS`, `TEMPORAL_MISMATCH`, `TOPIC_RELATED`, `ENTITY_RELATED`, `UNRELATED`, `UNKNOWN`.

The v0.1 implementation should probably use a smaller earned subset.

## Core result

```ts
type RelationObservation = {
  observation_id: string
  left: SourceRef
  right: SourceRef
  relation: string
  direction: "left_to_right" | "right_to_left" | "symmetric" | "not_applicable"
  confidence?: number
  evidence: EvidenceSpan[]
  status: "observed" | "unknown"
  unknown_reason?: string
  producer: { plugin: "opencode-relate"; version: string; model?: string }
}
```

A confidence number never substitutes for evidence or `UNKNOWN`.

## Subject → candidate compatibility (v0.2-experimental)

`relate` asks "how are these two items related?" `relate_rank` asks
"which candidate fits this subject?" for a named relation:

```text
subject state + candidates + relation ("appropriate_next_action")
        ↓
RelationCompatibility (asymmetric need→action affinity + directional grounding)
        ↓
RelationRanking { ranks, margin, calibration, observed|ambiguous|unknown }
```

Rank relations: `appropriate_next_action`, `appropriate_remediation`,
`appropriate_tool`, `appropriate_model`, `appropriate_context_operation`.
Kinds (`state`→`action`, `task`→`tool`, …) are explicit labels, not agent
concepts — core stays boring and general.

Architecture preserved:

```text
RELATE
 ├── Projection (classifyPair)   X ↔ Y  "how are these related?"
 └── Compatibility (rankCandidates) X → candidates  "which candidate fits?"
```

Invariants: scores are uncalibrated ordering evidence, not probabilities;
`COMPATIBILITY != USABILITY` — a ranking carries no `permission_to_execute`
and never authorizes action; `UNKNOWN`/small-margin `ambiguous` is success.

Bake-off on `tests/action-battery.json` (12 directed cases with hard
negatives): random top-1 0.09, cosine 0.73, projection 0.64, compatibility
1.00 with confident-wrong rate 0 and abstention accuracy 1. Cosine picks the
same-vocabulary trap (retry) on the missing-column migration; projection
ties and cannot discriminate. Circularity warning: fixtures were authored
against the heuristic, so this is a regression battery, not a
win-over-cosine claim — see `eval-actions-report.json`.

## Core distinctions

```text
similarity != relationship
relationship != truth
relationship != authority
```

## Composition

Relate never calls Lens, Radar, or Authority. An orchestrator may pass Lens artifacts into Relate or RelationObservations into Radar.

## Prior work

Inspect https://github.com/ernanhughes/relate for taxonomy/test ideas. It is prior art and evidence, not an automatic runtime dependency.

Also inspect:

- https://github.com/ernanhughes/project-context-opencode
- https://github.com/ernanhughes/opencode-remembering

## Status

**v0.1 implemented.** Deterministic cue-based classifier (6 relations + first-class UNKNOWN), OpenCode tools (`relate`, `relate_many`, `relate_health`), 24-case frozen battery with hard negatives, coverage-gated evaluator, unit tests, no-inference load check. No embedding model, no LLM judge, no retrieval. Heuristic limits documented in code; win-over-cosine untested (PEX-R2).

**E01 frozen (experiments/E01-freeze.md).** Directed state→action compatibility (`relate_rank`, 5 rank relations), 12-case RELATE-ACTION battery, four-way bake-off in `eval-actions-report.json`. Regression/architectural evidence only — not a generalization claim. Scorer frozen until real-trace v0.2 exists (protocol: `experiments/trace-extraction-protocol.md`, schema: `experiments/replay-schema.json`).
