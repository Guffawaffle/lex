import fs from "fs/promises";

async function copyCanon() {
  try {
    // Check if canon/ directory exists
    let canonExists = false;
    try {
      await fs.access("canon");
      canonExists = true;
    } catch {
      console.log("ℹ Canon directory not present - using package defaults only");
    }

    // Copy from canon/ if it exists (user may have custom canon/)
    if (canonExists) {
      // Try copying prompts/ (optional - user may not have custom prompts)
      try {
        await fs.access("canon/prompts");
        await fs.cp("canon/prompts", "prompts", { recursive: true });
        console.log("✓ Copied canon/prompts → prompts/");
      } catch {
        console.log("ℹ No canon/prompts/ - using package default prompts");
      }

      // Copy schemas/ directory
      try {
        await fs.access("canon/schemas");
        await fs.cp("canon/schemas", "schemas", { recursive: true });
        console.log("✓ Copied canon/schemas → schemas/");
      } catch {
        console.log("⚠ No canon/schemas/ found");
      }

      // Copy rules/ directory
      try {
        await fs.access("canon/rules");
        await fs.cp("canon/rules", "rules", { recursive: true });
        console.log("✓ Copied canon/rules → rules/");
      } catch {
        console.log("⚠ No canon/rules/ found");
      }
    }

    console.log("✓ Canon copy complete");
  } catch (error) {
    console.error("✗ Failed to copy canon:", error.message);
    process.exit(1);
  }
}

copyCanon().catch(console.error);
