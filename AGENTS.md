# Build Brief for AI Agents

Implement **OpenCode Relate**.

Read first:

1. `README.md`
2. `DESIGN.md`
3. https://github.com/ernanhughes/relate
4. https://github.com/ernanhughes/project-context-opencode
5. https://github.com/ernanhughes/opencode-remembering

## Priorities

First-class `UNKNOWN`, direction, provenance/evidence, hard negatives, class-specific evaluation, small relation set, pure core, thin plugin adapter.

## Do not

- require pgvector/embeddings for v0.1;
- force every pair into a label;
- treat cosine similarity as the answer;
- silently turn confidence into truth;
- call sibling Language plugins;
- build a graph database before pairwise behaviour is earned.

Deliver the relation-set rationale, fixtures, core, OpenCode tools, evaluator, class-specific report, load check, and smoke procedure before expansion.
