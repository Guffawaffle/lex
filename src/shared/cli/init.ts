/**
 * Init Command - Initialize .smartergpt.local/ workspace
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

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
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n⚠️  ${result.message}\n`);
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
      const examplePath = path.join(baseDir, "src/policy/policy_spec/lexmap.policy.json.example");
      const fallbackPath = path.join(baseDir, "src/policy/policy_spec/lexmap.policy.json");

      if (fs.existsSync(examplePath)) {
        fs.copyFileSync(examplePath, policyPath);
        filesCreated.push("lex/lexmap.policy.json");
      } else if (fs.existsSync(fallbackPath)) {
        fs.copyFileSync(fallbackPath, policyPath);
        filesCreated.push("lex/lexmap.policy.json");
      } else {
        // Create minimal policy if no template found
        const minimalPolicy = {
          version: "1.0.0",
          modules: [],
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
1. \`LEX_CANON_DIR/prompts/\` (if set)
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
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n✅ Workspace initialized successfully!\n`);
      console.log(`📂 Profile directory: ${profileDir}\n`);
      console.log(`📝 Created structure:`);
      console.log(`   - profile.yml (workspace metadata)`);
      console.log(`   - lex/ (working files: policy, database)`);
      console.log(`   - runner/ (lex-pr-runner artifacts)`);
      console.log(`   - prompts/ (local prompt overlays)\n`);
      console.log(`📚 Files created:`);
      filesCreated.forEach((file) => console.log(`   - ${file}`));
      console.log(`\n💡 Next steps:`);
      console.log(`   1. Customize .smartergpt.local/lex/lexmap.policy.json`);
      console.log(`   2. Run 'npx lex remember' to create your first frame`);
      console.log(
        `   3. Database will be created automatically at .smartergpt.local/lex/memory.db\n`
      );
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
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error(`\n❌ ${result.message}\n`);
    }

    return result;
  }
}

/**
 * Helper to parse comma-separated lists
 */
function parseList(value: string): string[] {
  return value.split(",").map((v) => v.trim());
}
