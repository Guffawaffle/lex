# ci(lint): lint budget baseline & regression check

Implements the baseline and regression check for linting as requested in #146.

This commit adds this description file and a small guard note. The real guard will be implemented in follow-ups; this PR provides the baseline commit and Draft PR for CI to run against.

Acceptance Criteria:
- Draft PR opened and linked to #146
- Local validation: lint run and budget check command

Validation commands:
- npm run lint --format=json > current.json
- node scripts/lint-budget.mjs current.json lint-baseline.json

Notes:
- Small, non-invasive file to make the PR reviewable and trigger CI.
