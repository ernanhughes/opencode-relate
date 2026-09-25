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
