/**
 * Init Command - Initialize .smartergpt/ workspace
 *
 * Zero-to-value onboarding: one command to get from zero to working Lex setup.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import inquirer from "inquirer";
import * as output from "./output.js";
import { discoverModules, generatePolicyFile } from "./policy-generator.js";
import { AXErrorException } from "../errors/ax-error.js";
import { detectProject, describeProject } from "./project-detector.js";
import { wrapWithMarkers } from "../instructions/markers.js";

// ESM compatibility: create __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface InitOptions {
  force?: boolean;
  json?: boolean;
  promptsDir?: string; // Optional: custom prompts directory
  policy?: boolean; // Generate seed policy from directory structure
  instructions?: boolean; // Create canonical instructions file (default: true)
  yes?: boolean; // Non-interactive mode (skip prompts)
  interactive?: boolean; // Interactive mode (prompt for first frame)
}

export interface InitResult {
  success: boolean;
  workspaceDir: string;
  message: string;
  filesCreated: string[];
  modulesDiscovered?: number;
  instructionsCreated?: boolean;
  projectType?: string;
  databaseInitialized?: boolean;
  mcpGuidanceShown?: boolean;
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
  throw new AXErrorException(
    "PACKAGE_ROOT_NOT_FOUND",
    "Could not find package root",
    [
      "Ensure the package is properly installed",
      "Check that package.json exists in the package root",
      "Verify the installation directory structure is intact",
    ],
    { searchPath: __dirname, operation: "init" }
  );
}

/**
 * Initialize .smartergpt/ workspace with prompts and policy
 * Enhanced for zero-to-value onboarding
 */
export async function init(options: InitOptions = {}): Promise<InitResult> {
  const baseDir = process.cwd();
  const workspaceDir = path.join(baseDir, ".smartergpt");
  const promptsDir = options.promptsDir
    ? path.resolve(baseDir, options.promptsDir)
    : path.join(workspaceDir, "prompts");

  // Detect project type
  const projectDetection = detectProject(baseDir);
  const projectDesc = describeProject(projectDetection);

  // Show detection results (unless in JSON mode)
  if (!options.json) {
    output.info("🔍 Detecting project...");
    output.info(`   Found: ${projectDesc}`);
    output.info("");
  }

  // Check if already initialized
  if (fs.existsSync(workspaceDir) && !options.force) {
    const result: InitResult = {
      success: false,
      workspaceDir,
      message: `Workspace already initialized at ${workspaceDir}. Use --force to reinitialize.`,
      filesCreated: [],
      projectType: projectDesc,
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
    let modulesDiscovered = 0;

    if (!fs.existsSync(policyPath) || options.force) {
      if (options.policy) {
        // Generate seed policy from directory structure
        const modules = discoverModules({ rootDir: baseDir });
        modulesDiscovered = modules.length;

        if (modules.length > 0) {
          const policy = generatePolicyFile(modules);
          fs.writeFileSync(policyPath, JSON.stringify(policy, null, 2) + "\n");
          filesCreated.push(path.relative(baseDir, policyPath));
        } else {
          // No modules found, create minimal policy
          const minimalPolicy = {
            schemaVersion: "1.0.0",
            modules: {},
          };
          fs.writeFileSync(policyPath, JSON.stringify(minimalPolicy, null, 2) + "\n");
          filesCreated.push(path.relative(baseDir, policyPath) + " (minimal)");
        }
      } else {
        // Use example policy or create minimal policy
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
            schemaVersion: "1.0.0",
            modules: {},
          };
          fs.writeFileSync(policyPath, JSON.stringify(minimalPolicy, null, 2) + "\n");
          filesCreated.push(path.relative(baseDir, policyPath) + " (minimal)");
        }
      }
    }

    // Create instructions directory and canonical instructions file
    // Default to true unless explicitly set to false
    const shouldCreateInstructions = options.instructions !== false;
    let instructionsCreated = false;

    if (shouldCreateInstructions) {
      const instructionsDir = path.join(workspaceDir, "instructions");
      fs.mkdirSync(instructionsDir, { recursive: true });

      const instructionsPath = path.join(instructionsDir, "lex.md");

      if (!fs.existsSync(instructionsPath) || options.force) {
        const canonInstructionsPath = path.join(canonDir, "instructions", "lex.example.md");

        if (fs.existsSync(canonInstructionsPath)) {
          fs.copyFileSync(canonInstructionsPath, instructionsPath);
          filesCreated.push(path.relative(baseDir, instructionsPath));
          instructionsCreated = true;
        }
      }
    }

    // Generate IDE instruction files (.github/copilot-instructions.md and .cursorrules)
    // if not in JSON mode and instructions were created
    if (!options.json && shouldCreateInstructions) {
      output.info("📝 Creating IDE instruction files...");
    }

    // Create .github/copilot-instructions.md with LEX markers
    const copilotDir = path.join(baseDir, ".github");
    const copilotPath = path.join(copilotDir, "copilot-instructions.md");

    if (!fs.existsSync(copilotPath) || options.force) {
      fs.mkdirSync(copilotDir, { recursive: true });
      const copilotContent = getIDEInstructionContent("copilot");
      const wrappedContent = wrapWithMarkers(copilotContent);
      fs.writeFileSync(copilotPath, wrappedContent, "utf-8");
      filesCreated.push(path.relative(baseDir, copilotPath));
      if (!options.json) {
        output.info(`   ✓ Added Lex instruction block to ${path.relative(baseDir, copilotPath)}`);
      }
    }

    // Create .cursorrules if Cursor is detected
    if (projectDetection.hasCursor || options.force) {
      const cursorPath = path.join(baseDir, ".cursorrules");
      if (!fs.existsSync(cursorPath) || options.force) {
        const cursorContent = getIDEInstructionContent("cursor");
        const wrappedContent = wrapWithMarkers(cursorContent);
        fs.writeFileSync(cursorPath, wrappedContent, "utf-8");
        filesCreated.push(path.relative(baseDir, cursorPath));
        if (!options.json) {
          output.info(`   ✓ Created ${path.relative(baseDir, cursorPath)}`);
        }
      }
    }

    if (!options.json) {
      output.info("");
    }

    // Create lex.yaml with sensible defaults
    if (!options.json) {
      output.info("⚙️  Creating lex.yaml...");
    }

    const lexYamlPath = path.join(baseDir, "lex.yaml");
    if (!fs.existsSync(lexYamlPath) || options.force) {
      const lexYamlContent = getLexYamlContent(projectDetection);
      fs.writeFileSync(lexYamlPath, lexYamlContent, "utf-8");
      filesCreated.push(path.relative(baseDir, lexYamlPath));
      if (!options.json) {
        output.info("   ✓ Default configuration");
        output.info("");
      }
    }

    // Initialize database
    const dbPath = path.join(lexDir, "memory.db");
    const databaseInitialized = !fs.existsSync(dbPath);

    if (!options.json && databaseInitialized) {
      output.info("💾 Initializing database...");
      output.info(`   ✓ ${path.relative(baseDir, dbPath)} ready`);
      output.info("");
    }

    // Show MCP guidance
    let mcpGuidanceShown = false;
    if (!options.json) {
      showMCPGuidance(projectDetection);
      mcpGuidanceShown = true;
    }

    // Interactive first frame (if not --yes and not JSON)
    if (options.interactive && !options.yes && !options.json) {
      await promptFirstFrame(baseDir);
    }

    const result: InitResult = {
      success: true,
      workspaceDir,
      message: "Workspace initialized successfully",
      filesCreated,
      modulesDiscovered: options.policy ? modulesDiscovered : undefined,
      instructionsCreated,
      projectType: projectDesc,
      databaseInitialized,
      mcpGuidanceShown,
    };

    if (options.json) {
      output.json(result);
    } else {
      displaySuccessMessage(result, baseDir, projectDesc, modulesDiscovered, options);
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

/**
 * Get IDE instruction content for a specific host
 */
function getIDEInstructionContent(_host: "copilot" | "cursor"): string {
  return `# Lex Instructions

This content is auto-generated from the canonical source.
Run \`lex instructions generate\` to update.

## Getting Started with Lex

Lex provides work continuity and policy enforcement for this repository.

### Core Commands

\`\`\`bash
lex remember    # Save context after completing work
lex recall      # Retrieve context from previous sessions
lex check       # Validate code against policy
\`\`\`

### Workflow

1. At the end of a session, use \`lex remember\` to capture context
2. At the start of the next session, use \`lex recall\` to restore context
3. Use \`lex check\` to validate changes against project policy

For more information, see the canonical instructions at \`.smartergpt/instructions/lex.md\`.
`;
}

/**
 * Get lex.yaml content with defaults based on project detection
 */
function getLexYamlContent(detection: ReturnType<typeof detectProject>): string {
  const hasCopilot = true; // Always enable Copilot
  const hasCursor = detection.hasCursor;

  return `# Lex Configuration
# See: https://github.com/Guffawaffle/lex

version: 1

instructions:
  # Canonical source of AI instructions
  canonical: .smartergpt/instructions/lex.md

  # Which hosts to project to (auto-detected if omitted)
  projections:
    copilot: ${hasCopilot}
    cursor: ${hasCursor}
`;
}

/**
 * Show MCP server configuration guidance
 */
function showMCPGuidance(detection: ReturnType<typeof detectProject>): void {
  output.info("📡 MCP Setup:");

  if (detection.hasVSCode) {
    output.info("   For VS Code, add to settings.json:");
  } else {
    output.info("   To use with VS Code, add to settings.json:");
  }

  output.info("   {");
  output.info('     "mcp.servers": {');
  output.info('       "lex": {');
  output.info('         "command": "npx",');
  output.info('         "args": ["@smartergpt/lex", "mcp"]');
  output.info("       }");
  output.info("     }");
  output.info("   }");
  output.info("");
}

/**
 * Prompt user to create first frame (interactive mode)
 */
async function promptFirstFrame(_baseDir: string): Promise<void> {
  try {
    const answers = await inquirer.prompt([
      {
        type: "confirm",
        name: "createFirstFrame",
        message: "Would you like to create your first Frame to test Lex?",
        default: false,
      },
    ]);

    if (answers.createFirstFrame) {
      const frameAnswers = await inquirer.prompt([
        {
          type: "input",
          name: "summary",
          message: "What are you working on?",
          validate: (input: string) => input.trim().length > 0 || "Please provide a summary",
        },
      ]);

      output.info("");
      output.info("Creating your first Frame...");
      output.info(`Summary: ${frameAnswers.summary}`);
      output.info("");
      output.info("✓ Frame created! Run 'lex recall' next session to retrieve this context.");
      output.info("");
    }
  } catch (_error) {
    // User cancelled or error occurred - gracefully continue
  }
}

/**
 * Display success message with all created files and next steps
 */
function displaySuccessMessage(
  _result: InitResult,
  _baseDir: string,
  _projectDesc: string,
  _modulesDiscovered: number,
  _options: InitOptions
): void {
  output.info("🎯 Quick start:");
  output.info("   lex remember    # Save context after work");
  output.info("   lex recall      # Retrieve context next session");
  output.info("");
  output.info('✨ Done! Run `lex recall "getting started"` to test.');
}
