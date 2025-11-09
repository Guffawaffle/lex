# chore(config): relocate working paths to .smartergpt.local/lex

This change begins the relocation of local working paths per #154. It includes a description and a short `setup-local` outline.

Acceptance Criteria:
- Draft PR opened and linked to #154
- Local validation: `npm run setup-local && npm test`

Loader precedence (snippet):
1. .smartergpt.local/lex/
2. $XDG_CONFIG_HOME/lex/
3. repo defaults

Notes:
- This is a small preparatory commit so reviewers can see the intent and CI can exercise the setup-local flow.
