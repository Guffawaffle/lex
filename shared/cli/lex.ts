#!/usr/bin/env node
/**
 * Lex CLI - Main Executable Entry Point
 * 
 * Usage:
 *   lex remember --jira TICKET-123 --summary "..." --next "..." --modules "..."
 *   lex recall "auth deadlock"
 *   lex recall TICKET-123
 *   lex check merged.json lexmap.policy.json
 */

import { run } from './index.js';

// Run the CLI
run().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(2);
});
