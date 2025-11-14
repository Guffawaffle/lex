---
schemaVersion: 1
id: post-plan
title: Post-Plan Creation Guide
description: Next steps after creating an execution plan
variables: [itemCount, planPath]
tags: [planning, workflow, gates]
---

# ✓ Plan Created

Successfully created execution plan with {{itemCount}} items in dependency order.

## Plan Location

- File: `{{planPath}}`
- Review the plan to verify item ordering
- Check dependency relationships

## Next Steps

### 1. Run Gates
Execute all quality gates for plan validation:
```bash
gates_run({ outDir: './artifacts' })
```

### 2. Review Results
- Check `artifacts/` directory for gate outputs
- Review any failures or warnings
- Verify all required gates passed

### 3. Proceed to Merge
If all required gates pass:
- Merge items in dependency order
- Monitor for issues during merge
- Verify final state

## Common Issues

### Gate Failures
- **Location:** `artifacts/PR-XXX/gateName/`
- **Action:** Review logs, fix issues, re-run gates
- **See:** `gate-failure.md` for recovery options

### Missing Dependencies
- **Symptom:** Items fail due to missing prerequisites
- **Action:** Review `plan.json` dependency graph
- **Fix:** Update dependencies or item order

### Circular Dependencies
- **Symptom:** Plan creation should have failed
- **Action:** Should not occur if planner is working correctly
- **Fix:** Review item dependencies and break cycles

## Plan Validation

Verify the plan includes:
- All expected items
- Correct dependency ordering
- No cycles in the dependency graph
- Proper metadata for each item

## Policy Compliance

Ensure the plan adheres to:
- Organizational policies
- Security requirements
- Quality standards
- Approval workflows
