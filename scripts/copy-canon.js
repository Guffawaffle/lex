import fs from "fs/promises";

async function copyCanon() {
  try {
    // Copy prompts/ directory
    await fs.cp("canon/prompts", "prompts", { recursive: true });
    console.log("✓ Copied canon/prompts → prompts/");

    // Copy schemas/ directory
    await fs.cp("canon/schemas", "schemas", { recursive: true });
    console.log("✓ Copied canon/schemas → schemas/");

    console.log("✓ Canon copy complete");
  } catch (error) {
    console.error("✗ Failed to copy canon:", error.message);
    process.exit(1);
  }
}

copyCanon().catch(console.error);
