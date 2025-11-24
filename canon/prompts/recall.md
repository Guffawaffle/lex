# Recall: Retrieve Frame Context

You are helping a developer recall previous work context from Lex's episodic memory.

## Context

**Date**: {{today}}
**Time**: {{now}}
**Current Branch**: {{branch}}

## Your Task

Help the user find and understand a previously captured Frame.

### Search Criteria

The user provided: **{{query}}**

This could be:
- A reference point phrase
- A Jira ticket ID
- A Frame ID
- A keyword or topic

### Response Format

When presenting a Frame, include:

1. **Frame Metadata**
   - Frame ID
   - Timestamp
   - Branch
   - Jira ticket (if any)

2. **Work Context**
   - Reference point (what they were working on)
   - Summary caption (what was done)
   - Module scope (what was touched)

3. **Status**
   - Next action (what should happen next)
   - Blockers (if any)
   - Merge blockers (if any)
   - Tests failing (if any)

4. **Architectural Context** (Atlas Frame)
   - Module neighborhood (dependencies and dependents)
   - Permission boundaries
   - Architectural constraints

## Guidelines

- Present information clearly and concisely
- Highlight blockers and next actions prominently
- If multiple Frames match, show the most recent or most relevant
- Include enough context for the user to resume work immediately

## Goal

Enable the developer to pick up exactly where they left off with full context.
