/**
 * Init Command - Initialize .smartergpt.local/ workspace
 */

import * as fs from "fs";
import * as path from "path";
import * as output from "./output.js";

export interface InitOptions {
  force?: boolean;
  json?: boolean;
}

export interface InitResult {
  success: boolean;
  profileDir: string;
  message: string;
  filesCreated: string[];
}

/**
 * Initialize .smartergpt.local/ workspace with proper subdirectory structure
 */
export async function init(options: InitOptions = {}): Promise<InitResult> {
  const baseDir = process.cwd();
  const profileDir = path.join(baseDir, ".smartergpt.local");

  // Check if already initialized
  if (fs.existsSync(profileDir) && !options.force) {
    const result: InitResult = {
      success: false,
      profileDir,
      message: `Workspace already initialized at ${profileDir}. Use --force to reinitialize.`,
      filesCreated: [],
    };

    if (options.json) {
      output.json(result);
    } else {
      output.warn(`Workspace already initialized at ${profileDir}. Use --force to reinitialize.`);
    }

    return result;
  }

  const filesCreated: string[] = [];

  try {
    // Create main profile directory
    fs.mkdirSync(profileDir, { recursive: true });

    // Create subdirectories
    const lexDir = path.join(profileDir, "lex");
    const runnerDir = path.join(profileDir, "runner");
    const promptsDir = path.join(profileDir, "prompts");

    fs.mkdirSync(lexDir, { recursive: true });
    fs.mkdirSync(runnerDir, { recursive: true });
    fs.mkdirSync(promptsDir, { recursive: true });

    // Create profile.yml
    const profilePath = path.join(profileDir, "profile.yml");
    if (!fs.existsSync(profilePath) || options.force) {
      const profileContent = `role: local
name: Local Development Profile
description: Auto-generated workspace for local Lex development
`;
      fs.writeFileSync(profilePath, profileContent);
      filesCreated.push("profile.yml");
    }

    // Copy lexmap.policy.json template
    const policyPath = path.join(lexDir, "lexmap.policy.json");
    if (!fs.existsSync(policyPath) || options.force) {
      // Use __dirname to find template relative to dist/ (works in published package)
      const packageRoot = path.join(__dirname, "../../..");
      const examplePath = path.join(
        packageRoot,
        "src/policy/policy_spec/lexmap.policy.json.example"
      );
      const fallbackPath = path.join(packageRoot, "src/policy/policy_spec/lexmap.policy.json");

      if (fs.existsSync(examplePath)) {
        fs.copyFileSync(examplePath, policyPath);
        filesCreated.push("lex/lexmap.policy.json");
      } else if (fs.existsSync(fallbackPath)) {
        fs.copyFileSync(fallbackPath, policyPath);
        filesCreated.push("lex/lexmap.policy.json");
      } else {
        // Create minimal policy if no template found (modules is an object, not array)
        const minimalPolicy = {
          version: "1.0.0",
          modules: {},
        };
        fs.writeFileSync(policyPath, JSON.stringify(minimalPolicy, null, 2));
        filesCreated.push("lex/lexmap.policy.json (minimal)");
      }
    }

    // Create README in prompts directory
    const promptsReadmePath = path.join(promptsDir, "README.md");
    if (!fs.existsSync(promptsReadmePath) || options.force) {
      const promptsReadme = `# Local Prompt Overlays

This directory contains local prompt customizations that override canonical prompts.

## Precedence

Prompts are resolved in this order:
1. \`LEX_CANON_DIR/prompts/\` (if set) — Environment variable pointing to a custom canonical prompt directory
2. \`.smartergpt.local/prompts/\` (this directory)
3. \`prompts/\` (canonical, from npm package or build)

## Usage

Copy prompts from canonical directory and customize:

\`\`\`bash
cp prompts/some-prompt.md .smartergpt.local/prompts/
vim .smartergpt.local/prompts/some-prompt.md
\`\`\`

Your local version will now take precedence.
`;
      fs.writeFileSync(promptsReadmePath, promptsReadme);
      filesCreated.push("prompts/README.md");
    }

    const result: InitResult = {
      success: true,
      profileDir,
      message: "Workspace initialized successfully",
      filesCreated,
    };

    if (options.json) {
      output.json(result);
    } else {
      output.success("Workspace initialized successfully");
      output.info(`Profile directory: ${profileDir}`);
      output.info("");
      output.info("Created structure:");
      output.info("  - profile.yml (workspace metadata)");
      output.info("  - lex/ (working files: policy, database)");
      output.info("  - runner/ (lex-pr-runner artifacts)");
      output.info("  - prompts/ (local prompt overlays)");
      output.info("");
      output.info("Files created:");
      filesCreated.forEach((file) => output.info(`  - ${file}`));
      output.info("");
      output.info("Next steps:");
      output.info("  1. Customize .smartergpt.local/lex/lexmap.policy.json");
      output.info("  2. Run 'npx lex remember' to create your first frame");
      output.info("  3. Database will be created automatically at .smartergpt.local/lex/memory.db");
    }

    return result;
  } catch (error) {
    const result: InitResult = {
      success: false,
      profileDir,
      message: `Failed to initialize workspace: ${error instanceof Error ? error.message : String(error)}`,
      filesCreated,
    };

    if (options.json) {
      output.json(result);
    } else {
      output.error(
        `Failed to initialize workspace: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return result;
  }
}
