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

import { run } from "./index.js";
import * as output from "./output.js";

// Run the CLI
run().catch((error) => {
  output.error("Unexpected error:" + String(error));
  process.exit(2);
});
