import fs from "fs/promises";

async function copyCanon() {
  try {
    // Canon directory removed - IP-sensitive prompts no longer in repo
    // Only copy schemas/ and rules/ if canon/ exists
    try {
      await fs.access("canon/schemas");
    } catch {
      console.log("ℹ Canon directory not present (removed in cleanup) - skipping copy");
      return;
    }

    // Copy schemas/ directory
    await fs.cp("canon/schemas", "schemas", { recursive: true });
    console.log("✓ Copied canon/schemas → schemas/");

    // Copy rules/ directory
    await fs.cp("canon/rules", "rules", { recursive: true });
    console.log("✓ Copied canon/rules → rules/");

    console.log("✓ Canon copy complete (prompts removed - no longer copied)");
  } catch (error) {
    console.error("✗ Failed to copy canon:", error.message);
    process.exit(1);
  }
}

copyCanon().catch(console.error);
