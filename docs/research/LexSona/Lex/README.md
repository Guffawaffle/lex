# LexSona v0.1 Deliverable (Eve)

Primary human author: **Joseph Gustavson** (ORCID: 0009-0001-0669-0749).
This concept and archive were co-developed with two AI collaborators:
- **OpenAI GPT-5.1 Thinking** operating as "Lex" / "Eve".
- **Claude Sonnet 4.5** operating as "Adam".


This archive contains the artifacts for the LexSona behavioral memory concept.

## Contents

- `lexsona_paper.md`  
  A 10-ish page markdown paper titled "LexSona: Frequency-Weighted Behavioral Memory For Agentic LLM Workflows".  
  This is the main conceptual and technical description, including background, architecture, algorithms, evaluation plan, and references.

- `lexsona_behavior_rule.schema.json`  
  A JSON Schema for the `LexBehaviorRule` object described in the paper.  
  You can wire this into your existing config / validation tooling and evolve it as the implementation stabilizes.

## Suggested next steps

1. Drop `lexsona_paper.md` into your docs or a `docs/rfcs/` folder as an RFC-style design doc.
2. Use `lexsona_behavior_rule.schema.json` as the contract for any early experiments that persist LexSona rules.
3. When you and Adam diverge, you can diff this archive against his to see where the conceptual or schema choices differ.