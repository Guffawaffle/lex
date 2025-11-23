import fs from "fs/promises";

async function copyCanon() {
  try {
    // Check if canon/ directory exists (it was removed in chore/canon-cleanup)
    try {
      await fs.access("canon/prompts");
    } catch {
      console.log("ℹ Canon directory not present (removed in cleanup) - skipping copy");
      return;
    }

    // Copy prompts/ directory
    await fs.cp("canon/prompts", "prompts", { recursive: true });
    console.log("✓ Copied canon/prompts → prompts/");

    // Copy schemas/ directory
    await fs.cp("canon/schemas", "schemas", { recursive: true });
    console.log("✓ Copied canon/schemas → schemas/");

    // Copy rules/ directory
    await fs.cp("canon/rules", "rules", { recursive: true });
    console.log("✓ Copied canon/rules → rules/");

    console.log("✓ Canon copy complete");
  } catch (error) {
    console.error("✗ Failed to copy canon:", error.message);
    process.exit(1);
  }
}

copyCanon().catch(console.error);
