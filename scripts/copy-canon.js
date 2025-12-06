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
      // Copy prompts/ ONLY if user doesn't have them yet (on first install)
      // canon/prompts/ contains built-in examples; prompts/ is user workspace
      try {
        await fs.access("prompts");
        // User already has prompts/ - don't overwrite
        console.log("ℹ User prompts/ exists - not overwriting");
      } catch {
        // No prompts/ yet - copy built-in examples from canon/prompts/
        try {
          await fs.access("canon/prompts");
          await fs.cp("canon/prompts", "prompts", { recursive: true });
          console.log("✓ Initialized prompts/ from canon/prompts/ (built-in examples)");
        } catch {
          console.log("⚠ No canon/prompts/ - prompts/ directory will need manual setup");
        }
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

      // Copy policy/ directory to .smartergpt/lex/ (create if needed)
      try {
        await fs.access("canon/policy");
        await fs.mkdir(".smartergpt/lex", { recursive: true });
        await fs.cp("canon/policy", ".smartergpt/lex", { recursive: true });
        console.log("✓ Copied canon/policy → .smartergpt/lex/");
      } catch {
        console.log("⚠ No canon/policy/ found");
      }

      // Copy config/lex.yaml.example to root (template for user config)
      try {
        await fs.access("canon/config/lex.yaml.example");
        await fs.copyFile("canon/config/lex.yaml.example", "lex.yaml.example");
        console.log("✓ Copied canon/config/lex.yaml.example → lex.yaml.example");
      } catch {
        // Optional - not an error if missing
      }

      // Copy constraints/ directory (baseline behavioral constraints)
      try {
        await fs.access("canon/constraints");
        await fs.mkdir(".smartergpt/constraints", { recursive: true });
        await fs.cp("canon/constraints", ".smartergpt/constraints", { recursive: true });
        console.log("✓ Copied canon/constraints → .smartergpt/constraints/");
      } catch {
        // Optional - constraints are for LexSona integration
      }
    }

    console.log("✓ Canon copy complete");
  } catch (error) {
    console.error("✗ Failed to copy canon:", error.message);
    process.exit(1);
  }
}

copyCanon().catch(console.error);
