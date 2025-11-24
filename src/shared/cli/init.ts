/**
 * Init Command - Initialize .smartergpt/ workspace
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as output from "./output.js";

// ESM compatibility: create __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface InitOptions {
  force?: boolean;
  json?: boolean;
  promptsDir?: string; // Optional: custom prompts directory
}

export interface InitResult {
  success: boolean;
  workspaceDir: string;
  message: string;
  filesCreated: string[];
}

/**
 * Resolve path to canon directory in package
 */
function resolveCanonDir(): string {
  // Walk up from dist/shared/cli/ to package root
  let pkgRoot = path.dirname(__dirname);
  while (pkgRoot !== path.dirname(pkgRoot)) {
    const pkgJsonPath = path.join(pkgRoot, "package.json");
    if (fs.existsSync(pkgJsonPath)) {
      return path.join(pkgRoot, "canon");
    }
    pkgRoot = path.dirname(pkgRoot);
  }
  throw new Error("Could not find package root");
}

/**
 * Initialize .smartergpt/ workspace with prompts and policy
 */
export async function init(options: InitOptions = {}): Promise<InitResult> {
  const baseDir = process.cwd();
  const workspaceDir = path.join(baseDir, ".smartergpt");
  const promptsDir = options.promptsDir
    ? path.resolve(baseDir, options.promptsDir)
    : path.join(workspaceDir, "prompts");

  // Check if already initialized
  if (fs.existsSync(workspaceDir) && !options.force) {
    const result: InitResult = {
      success: false,
      workspaceDir,
      message: `Workspace already initialized at ${workspaceDir}. Use --force to reinitialize.`,
      filesCreated: [],
    };

    if (options.json) {
      output.json(result);
    } else {
      output.warn(`Workspace already initialized at ${workspaceDir}. Use --force to reinitialize.`);
    }

    return result;
  }

  const filesCreated: string[] = [];

  try {
    // Create .smartergpt/ directory
    fs.mkdirSync(workspaceDir, { recursive: true });

    // Create prompts directory
    fs.mkdirSync(promptsDir, { recursive: true });

    // Copy canon/prompts to .smartergpt/prompts (or custom location)
    const canonDir = resolveCanonDir();
    const canonPromptsDir = path.join(canonDir, "prompts");

    if (fs.existsSync(canonPromptsDir)) {
      const promptFiles = fs.readdirSync(canonPromptsDir);
      for (const file of promptFiles) {
        const srcPath = path.join(canonPromptsDir, file);
        const destPath = path.join(promptsDir, file);

        // Skip if file exists and not force
        if (fs.existsSync(destPath) && !options.force) {
          continue;
        }

        // Copy only files, not subdirectories
        if (fs.statSync(srcPath).isFile()) {
          fs.copyFileSync(srcPath, destPath);
          filesCreated.push(path.relative(baseDir, destPath));
        }
      }
    } else {
      // Create .gitkeep if no canon prompts found
      const gitkeepPath = path.join(promptsDir, ".gitkeep");
      fs.writeFileSync(gitkeepPath, "");
      filesCreated.push(path.relative(baseDir, gitkeepPath));
    }

    // Create lexmap.policy.json template in .smartergpt/lex/ subdirectory
    const lexDir = path.join(workspaceDir, "lex");
    fs.mkdirSync(lexDir, { recursive: true });
    const policyPath = path.join(lexDir, "lexmap.policy.json");
    if (!fs.existsSync(policyPath) || options.force) {
      const packageRoot = resolveCanonDir().replace("/canon", "");
      const examplePath = path.join(
        packageRoot,
        "src/policy/policy_spec/lexmap.policy.json.example"
      );

      if (fs.existsSync(examplePath)) {
        fs.copyFileSync(examplePath, policyPath);
        filesCreated.push(path.relative(baseDir, policyPath));
      } else {
        // Create minimal policy if no template found
        const minimalPolicy = {
          version: "1.0.0",
          modules: {},
        };
        fs.writeFileSync(policyPath, JSON.stringify(minimalPolicy, null, 2));
        filesCreated.push(path.relative(baseDir, policyPath) + " (minimal)");
      }
    }

    const result: InitResult = {
      success: true,
      workspaceDir,
      message: "Workspace initialized successfully",
      filesCreated,
    };

    if (options.json) {
      output.json(result);
    } else {
      output.success("✓ Workspace initialized successfully");
      output.info("");
      output.info("Created:");
      output.info(`  ${path.relative(baseDir, workspaceDir)}/`);
      output.info(
        `  ├── prompts/ (${filesCreated.filter((f) => f.includes("prompts/")).length} files from canon)`
      );
      output.info(`  └── lex/lexmap.policy.json (optional module policy)`);
      output.info("");
      output.info("Prompts resolution order:");
      output.info("  1. LEX_PROMPTS_DIR (env var override)");
      output.info("  2. .smartergpt/prompts/ (workspace - just created)");
      output.info("  3. prompts/ (legacy location)");
      output.info("  4. canon/prompts/ (package built-in)");
      output.info("");
      output.info("Next steps:");
      output.info("  • Customize prompts in .smartergpt/prompts/");
      output.info("  • Run 'lex remember' to create your first frame");
      output.info("  • Database will be created at .smartergpt/lex/memory.db");
    }

    return result;
  } catch (error) {
    const result: InitResult = {
      success: false,
      workspaceDir,
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
