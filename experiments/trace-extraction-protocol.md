# Stage 7 — trace-extraction protocol (RELATE-ACTION v0.2)

Goal: derive evaluation cases from real behaviour, never designed around the
classifier. Scorer stays frozen (see `E01-freeze.md`) until v0.2 exists.

## 1. Source

OpenCode session logs containing a visible transition:

```text
s_t (state_before) → a_t (action_chosen) → s_{t+1} (state_after) + eventual outcome
```

## 2. Segmentation

- One file per transition, conforming to `replay-schema.json`.
- `state_before`: the situation the decision faced (error text, task text, tool output). Quote, don't paraphrase.
- `candidates_available`: actions actually on the table. Prefer `logged`
  (verbatim in-session); `reconstructed` candidates must record their method
  and count against a quota (≤ 1 in 3 traces) so we don't smuggle in synthetic
  hard negatives dressed as real ones.
- `action_chosen`: historical fact, or `null`. **Never the target label.**

## 3. Outcome annotation (per candidate, answered separately)

```text
Was it selected?          selected
Did execution succeed?    exec_succeeded
Did it reduce the problem? reduced_problem
Did it enable a later necessary step? enabled_later_step
Did it create a new failure? created_new_failure
```

Each field admits `unknown`. Appropriateness (`NECESSARY / HELPFUL /
HARMFUL / IRRELEVANT / UNKNOWN`) is judged from downstream evidence only.
Execution success without problem reduction is `IRRELEVANT`, not positive —
see `replay-example.json`, where the chosen retry executed cleanly and
changed nothing.

## 4. Decontamination rules

1. Annotator is blind to compatibility scores (`annotator_blind_to_scores: true`).
2. No editing candidate wording to help or hurt the frozen scorer.
3. No discarding traces because the scorer ranks them well or badly.
4. `CHOSEN` never appears as an appropriateness value — by schema design.

## 5. Acceptance for v0.2

- 50–100 traces before any scorer comparison.
- Each of the five rank relations represented; per-relation counts recorded.
- Natural trap coverage logged (how many traces contain a chosen-but-harmful
  or chosen-but-irrelevant action) — these are the real hard negatives.
- Derivation rule published alongside: NECESSARY/HELPFUL → positive pool,
  HARMFUL/IRRELEVANT-chosen → hard negatives, UNKNOWN → excluded or
  abstention cases.

## 6. Stage 8 comparison (when v0.2 is frozen)

All systems on the same frozen traces: cosine, Projection, Compatibility,
CLM, cheap LLM, strong LLM. Question: how much machinery is necessary to
recover useful state→action relations — including whether generative judging
is only needed inside the ambiguity band (the cascade in E01 discussion).
