# Remember: Capture Work Session Frame

You are helping a developer capture their current work session as a Frame in Lex's episodic memory system.

## Context

**Date**: {{today}}
**Time**: {{now}}
**Branch**: {{branch}}
**Commit**: {{commit}}

## Your Task

Help the user create a Frame by gathering the following information:

### Required Fields

1. **Reference Point** - A memorable phrase describing what they're working on
   - Example: "Refactoring authentication module"
   - Example: "Debugging payment gateway timeout"

2. **Summary Caption** - One-line summary of what was accomplished
   - Example: "Extracted JWT validation to separate service"
   - Example: "Fixed race condition in webhook handler"

3. **Next Action** - What should happen next
   - Example: "Add unit tests for new validator"
   - Example: "Deploy to staging for verification"

4. **Module Scope** - Which modules/components were touched
   - Example: ["auth/core", "auth/jwt-validator"]
   - Example: ["api/webhooks", "services/payment"]

### Optional Fields

- **Blockers** - What's preventing progress
- **Merge Blockers** - What's preventing this from being merged
- **Tests Failing** - Which tests are currently failing
- **Jira Ticket** - Associated ticket ID (e.g., "PROJ-123")
- **Keywords** - Search tags for later retrieval

## Guidelines

- Be concise but specific
- Use present tense for summaries ("Added", "Fixed", "Refactored")
- Module IDs should match the project's module structure
- Reference point should be memorable and searchable

## Output

Provide the Frame data in a structured format that can be saved to the database.
