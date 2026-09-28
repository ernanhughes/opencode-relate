# RELATE-ACTION E01 — frozen

**Status: FROZEN. Do not tune the scorer against new data without opening E02.**

## Dataset

- `tests/action-battery.json` (`relate-action-v0.1`, 12 designed directed cases, sha256 `cb10052ecf0f33ab…`)
- Working tree on top of `c3cac04` (E01 implementation uncommitted at freeze time)

## Purpose

Prove the state→candidate abstraction and its evaluator — not to establish
generalization. Battery co-developed with the compatibility heuristic.

## Result

```text
random               0.09 top-1
cosine               0.73 top-1  (fails missing-column migration: prefers retry)
relation projection  0.64 top-1  (ties; pairwise ordering 0.48)
compatibility        1.00 top-1
```

```text
abstention accuracy   1.00
confident wrong rate  0.00
mean top1-top2 margin 0.51
```

Full numbers: `eval-actions-report.json`.

## Standing

- Architectural / regression evidence. The abstraction behaves correctly under
  the distinctions it was built for (asymmetry, hard-negative separation,
  abstention on ties, compatibility ≠ permission, thin adapter).
- **NOT external generalization evidence.** The battery was co-developed with
  the heuristic and cannot establish comparative superiority. Never quote the
  `1.00` as a general decision-model result.

## Next

Stage 7: derive RELATE-ACTION v0.2 from real behavioural traces using
`experiments/trace-extraction-protocol.md` and `experiments/replay-schema.json`.
Scorer stays frozen until v0.2 exists.
