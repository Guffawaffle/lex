/**
 * Epic CLI Command
 *
 * Commands for managing epic/tracking issues.
 */

import { syncEpicStatus } from "../github/epic-sync.js";
import * as output from "./output.js";

export interface EpicSyncOptions {
  json?: boolean;
}

/**
 * Sync epic status with actual sub-issue states
 */
export async function epicSync(epicRef: string, options: EpicSyncOptions = {}): Promise<void> {
  try {
    if (!epicRef) {
      output.error("Error: Epic reference is required (e.g., lexrunner#653)");
      process.exit(1);
    }

    // Show loading message
    if (!options.json) {
      output.info(`Syncing epic ${epicRef}...`);
    }

    // Sync epic
    const result = await syncEpicStatus(epicRef);

    // Output results
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (!result.updated) {
        output.success(`✓ Epic ${epicRef} is already up to date`);
        return;
      }

      output.success(`\nSynced epic ${epicRef}:\n`);

      // Show wave status
      if (result.waveStatus.length > 0) {
        for (const wave of result.waveStatus) {
          const completeIcon = wave.complete ? "✅" : "🔄";
          const status = wave.complete ? "COMPLETE" : "IN PROGRESS";
          output.info(`  ${completeIcon} ${wave.waveId}: ${wave.progress} → ${status}`);
        }
        output.info("");
      }

      // Show changes
      if (result.changes.length > 0) {
        output.info("  Updated status:");
        for (const change of result.changes) {
          const wasIcon = change.was === "open" ? "🔵" : "✅";
          const nowIcon = change.now === "open" ? "🔵" : "✅";
          output.info(`    ${change.issueRef}: ${wasIcon} → ${nowIcon}`);
        }
      }
    }
  } catch (error) {
    if (options.json) {
      console.error(JSON.stringify({ error: String(error) }));
    } else {
      output.error(`Error syncing epic: ${String(error)}`);
    }
    process.exit(1);
  }
}
