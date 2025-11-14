---
schemaVersion: 1
id: error-recovery
title: Error Recovery Strategies
description: General strategies for recovering from errors
variables: [errorType, errorMessage, context]
tags: [error, recovery, debugging]
---

# ⚙ Error Recovery

**Error Type:** {{errorType}}

{{#if errorMessage}}
**Message:** {{errorMessage}}
{{/if}}

{{#if context}}
**Context:** {{context}}
{{/if}}

## General Recovery Steps

### 1. Understand the Error
- Read the full error message carefully
- Check stack traces for root cause
- Review recent changes that might have caused it

### 2. Gather Information
- Check logs and artifacts
- Review system state before the error
- Identify affected components

### 3. Attempt Recovery
Choose appropriate strategy based on error type:

#### For Build Errors
- Clean build artifacts
- Update dependencies
- Check for syntax errors
- Verify build configuration

#### For Test Failures
- Run tests individually to isolate failures
- Check test environment setup
- Review test data and fixtures
- Verify test assertions

#### For Runtime Errors
- Check application logs
- Verify configuration
- Review environment variables
- Check external service availability

#### For Integration Errors
- Verify API endpoints
- Check authentication/authorization
- Review data formats and schemas
- Test with minimal integration first

### 4. Validate Fix
- Re-run the failed operation
- Verify no side effects
- Check dependent operations still work
- Update documentation if needed

## Escalation

Escalate if:
- Error persists after multiple attempts
- Root cause is unclear
- Fix requires system-level changes
- Error affects production systems

## Prevention

- Add tests for error conditions
- Improve error messages
- Document common failure modes
- Monitor for similar patterns

## Resources

- Log files and artifacts
- Stack traces and debug info
- System monitoring dashboards
- Team knowledge base
