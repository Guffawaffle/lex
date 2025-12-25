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
  // Simple check: just look for --verbose anywhere in argv
  // Commander will validate it properly, this is just for early env setup
  const hasVerboseFlag = process.argv.includes("--verbose");
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
void (async () => {
  try {
    const indexModule = await import("./index.js");
    await indexModule.run();
  } catch (error) {
    // Import output module only if needed for error handling
    try {
      const outputModule = await import("./output.js");
      outputModule.error("Unexpected error: " + String(error));
    } catch {
      // If we can't even import the output module, fall back to console.error
      process.stderr.write(`Fatal error: ${String(error)}\n`);
    }
    process.exit(2);
  }
})();
