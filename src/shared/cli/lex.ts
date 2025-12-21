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

// Configure logger level before importing modules
// Suppress Pino logs by default unless --verbose or LEX_DEBUG=1
if (!process.env.LEX_LOG_LEVEL) {
  // Check if --verbose appears as a top-level flag (not as a value for another option)
  // This is a simple check that works for the global --verbose flag position
  const hasVerboseFlag = process.argv.slice(2).some((arg, idx, arr) => {
    // Check if this is the --verbose flag itself
    if (arg === "--verbose") {
      // Make sure it's not a value for a previous option
      const prevArg = arr[idx - 1];
      return !prevArg || !prevArg.startsWith("--");
    }
    return false;
  });
  const hasDebugEnv = process.env.LEX_DEBUG === "1";
  
  if (hasVerboseFlag || hasDebugEnv) {
    // Enable verbose logging
    process.env.LEX_VERBOSE = "1";
  } else {
    // Suppress Pino logs
    process.env.LEX_LOG_LEVEL = "silent";
  }
}

// Use dynamic import to ensure environment variables are set before modules load
import("./index.js").then((indexModule) => {
  return indexModule.run();
}).catch((error) => {
  // Import output module only if needed for error handling
  import("./output.js").then((outputModule) => {
    outputModule.error("Unexpected error: " + String(error));
    process.exit(2);
  });
});
