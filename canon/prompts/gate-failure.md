---
schemaVersion: 1
id: gate-failure
title: Gate Failure Recovery
description: Options and strategies for handling gate failures
variables: [gateName, itemId]
tags: [gates, failure, recovery]
---

# ⚠ Gate Failure: {{gateName}}

Failed for: {{itemId}}

## Recovery Options

### 1. Fix and Retry
- Check logs: `artifacts/{{itemId}}/{{gateName}}/`
- Identify the root cause
- Apply the necessary fix
- Re-run: `gates_run({ onlyItem: '{{itemId}}', onlyGate: '{{gateName}}' })`

### 2. Exclude from Merge
- Remove the item from the execution plan
- Continue with remaining items
- Document why this item was excluded

### 3. Override (if policy allows)
- Document the reason for override
- Requires admin approval
- Add to policy exceptions if recurring

## Diagnostic Steps

1. **Review gate output:**
   ```bash
   cat artifacts/{{itemId}}/{{gateName}}/output.log
   ```

2. **Check for common issues:**
   - Build failures
   - Test failures
   - Linting errors
   - Security vulnerabilities

3. **Analyze dependencies:**
   - Does this item depend on others?
   - Are dependencies in the correct order?

## When to Override

Override gates only when:
- The failure is a false positive
- The issue is acknowledged and tracked separately
- Emergency deployment is required (with proper documentation)
- Policy explicitly allows the exception

## Prevention

- Keep gates up-to-date
- Review gate configurations regularly
- Ensure test coverage is adequate
- Monitor gate performance metrics
