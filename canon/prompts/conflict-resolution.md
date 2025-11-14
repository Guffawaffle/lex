---
schemaVersion: 1
id: conflict-resolution
title: Merge Conflict Resolution Guide
description: Step-by-step guide for resolving merge conflicts
variables: [fileName, conflictCount, branch]
tags: [merge, conflict, git]
---

# 🔀 Merge Conflict Resolution

Conflicts detected in {{fileName}}

## Resolution Strategy

1. **Read the conflict context:**
   ```typescript
   read_file({ filePath: '{{fileName}}', startLine: 1, endLine: 100 })
   ```

2. **Use `replace_string_in_file` (NOT sed/awk):**
   ```typescript
   replace_string_in_file({
     filePath: '{{fileName}}',
     oldString: '<<<<<<< HEAD\n...\n=======\n...\n>>>>>>> {{branch}}',
     newString: '// Combined both changes'
   })
   ```

3. **Verify with `get_errors`:**
   ```typescript
   get_errors({ filePaths: ['{{fileName}}'] })
   ```

## Conflict Markers

Found {{conflictCount}} conflict markers in this file.

## Common Patterns

- **Import conflicts:** Combine both import lists, remove duplicates
- **Function signature changes:** Keep newer signature, update call sites
- **Documentation:** Merge both sets of comments
- **Code blocks:** Analyze both versions and integrate the logic

## Best Practices

- Always verify the merged code compiles/runs
- Preserve intent from both branches when possible
- Test the merged code before committing
- Use version control history to understand context
