#!/usr/bin/env node
/**
 * Documentation Audit Script
 *
 * Validates that documentation matches implementation:
 * - CLI commands and options exist
 * - MCP tool names follow conventions
 * - Version numbers are consistent
 * - No outdated terminology (e.g., "lexbrain")
 */

import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const CLI_PATH = join(ROOT, "dist/shared/cli/lex.js");

// ANSI colors
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

let errorCount = 0;
let warningCount = 0;
let passCount = 0;
let cliAvailable = false;

function error(msg) {
  console.error(`${RED}✗${RESET} ${msg}`);
  errorCount++;
}

function warn(msg) {
  console.warn(`${YELLOW}⚠${RESET} ${msg}`);
  warningCount++;
}

function pass(msg) {
  console.log(`${GREEN}✓${RESET} ${msg}`);
  passCount++;
}

function info(msg) {
  console.log(`${BLUE}ℹ${RESET} ${msg}`);
}

function section(title) {
  console.log(`\n${BLUE}═══ ${title} ═══${RESET}`);
}

// Read files
function readFile(path) {
  const fullPath = join(ROOT, path);
  if (!existsSync(fullPath)) {
    error(`File not found: ${path}`);
    return null;
  }
  return readFileSync(fullPath, "utf-8");
}

// Check if CLI is built
function checkCliAvailable() {
  return existsSync(CLI_PATH);
}

// Get CLI help output
function getCliHelp(command = "") {
  try {
    if (!existsSync(CLI_PATH)) {
      return null;
    }
    const cmd = command ? `node "${CLI_PATH}" ${command} --help` : `node "${CLI_PATH}" --help`;
    return execSync(cmd, { encoding: "utf-8", cwd: ROOT });
  } catch (e) {
    return e.stdout || "";
  }
}

// Check version consistency
section("Version Consistency");
const packageJson = JSON.parse(readFile("package.json"));
const readme = readFile("README.md");
const currentVersion = packageJson.version;

if (readme.includes(`**Current Version:** \`${currentVersion}\``)) {
  pass(`Version ${currentVersion} matches in README.md`);
} else {
  const match = readme.match(/\*\*Current Version:\*\* `([^`]+)`/);
  if (match) {
    error(`README.md shows version ${match[1]} but package.json has ${currentVersion}`);
  } else {
    error("Could not find version in README.md");
  }
}

// Check if CLI is available for later validation
cliAvailable = checkCliAvailable();
if (!cliAvailable) {
  warn("CLI not built - CLI validation will be skipped");
  info('Run "npm run build" to enable full validation');
}

// Check for outdated terminology
section("Outdated Terminology Check");
const docsToCheck = [
  "README.md",
  "QUICK_START.md",
  "docs/ADOPTION_GUIDE.md",
  "docs/FAQ.md",
  "docs/MIND_PALACE.md",
  "docs/CONTRACT_SURFACE.md",
];

let foundLexbrain = false;
for (const docPath of docsToCheck) {
  const content = readFile(docPath);
  if (!content) continue;

  const matches = content.match(/lexbrain/gi);
  if (matches && matches.length > 0) {
    error(`${docPath} contains ${matches.length} references to "lexbrain" (should be "lex")`);
    foundLexbrain = true;
  }
}

if (!foundLexbrain) {
  pass('No outdated "lexbrain" references found');
}

// Check MCP tool naming conventions
section("MCP Tool Naming Conventions");
const toolsFile = readFile("src/memory/mcp_server/tools.ts");
if (toolsFile) {
  const toolNames = [...toolsFile.matchAll(/name: "([^"]+)"/g)].map((m) => m[1]);

  // Check naming convention compliance
  for (const name of toolNames) {
    // Should be snake_case
    if (name.includes("-")) {
      error(`MCP tool "${name}" uses hyphens (should be snake_case)`);
    } else if (/[A-Z]/.test(name)) {
      error(`MCP tool "${name}" uses uppercase (should be lowercase)`);
    } else if (name.startsWith("mcp_") || name.startsWith("lex_")) {
      error(`MCP tool "${name}" has namespace prefix (VS Code adds this automatically)`);
    } else {
      pass(`MCP tool "${name}" follows naming conventions`);
    }
  }

  info(`Found ${toolNames.length} MCP tools: ${toolNames.join(", ")}`);
}

// Check CLI commands match documentation
section("CLI Commands Validation");

if (!cliAvailable) {
  warn("Skipping CLI validation - CLI not built");
  info("CLI validation requires: npm run build");
} else {
  const mainHelp = getCliHelp();
  if (mainHelp === null || mainHelp === "") {
    error("CLI binary exists but failed to execute");
  } else {
    const cliCommands = [...mainHelp.matchAll(/^  (\S+)/gm)]
      .map((m) => m[1])
      .filter((cmd) => !cmd.startsWith("-") && cmd !== "help");

    info(`Found CLI commands: ${cliCommands.join(", ")}`);

    // Verify each command's help works
    for (const cmd of cliCommands) {
      const help = getCliHelp(cmd);
      if (help === null || help === "") {
        error(`CLI command "${cmd}" failed to execute`);
      } else if (help.includes("Usage:")) {
        pass(`CLI command "${cmd}" has help output`);
      } else {
        error(`CLI command "${cmd}" missing help output`);
      }
    }

    // Check specific commands mentioned in README
    const readmeCommands = [
      "init",
      "remember",
      "recall",
      "check",
      "timeline",
      "db",
      "policy",
      "instructions",
      "code-atlas",
    ];

    for (const cmd of readmeCommands) {
      if (cliCommands.includes(cmd)) {
        pass(`README command "${cmd}" exists in CLI`);
      } else {
        error(`README mentions command "${cmd}" but it doesn't exist in CLI`);
      }
    }

    // Check db subcommands
    const dbHelp = getCliHelp("db");
    if (dbHelp === null || dbHelp === "") {
      error("Failed to get help for db command");
    } else {
      const dbSubcommands = ["vacuum", "backup", "repair", "encrypt", "stats"];
      for (const subcmd of dbSubcommands) {
        if (dbHelp.includes(subcmd)) {
          pass(`db subcommand "${subcmd}" exists`);
        } else {
          warn(`db subcommand "${subcmd}" mentioned but not found`);
        }
      }
    }
  }
}

// Check README example commands are valid
section("README Example Validation");
const rememberExample =
  readme.includes("--reference-point") &&
  readme.includes("--summary") &&
  readme.includes("--next") &&
  readme.includes("--modules");
if (rememberExample) {
  pass("README remember examples use correct flags");
} else {
  warn("README remember examples may have incorrect flags");
}

// Check for required environment variables in README
section("Environment Variables Documentation");
const envVars = [
  "LEX_LOG_LEVEL",
  "LEX_LOG_PRETTY",
  "LEX_POLICY_PATH",
  "LEX_DB_PATH",
  "LEX_DB_KEY",
  "LEX_GIT_MODE",
];

for (const envVar of envVars) {
  if (readme.includes(envVar)) {
    pass(`Environment variable ${envVar} documented in README`);
  } else {
    warn(`Environment variable ${envVar} not documented in README`);
  }
}

section("Frame Contract Alignment");
const frameVersionSources = [
  "src/shared/types/frame.ts",
  "src/shared/types/frame-schema.ts",
  "src/memory/frames/types.ts",
];
const frameVersions = new Map();
const frameSourceContents = new Map();

for (const sourcePath of frameVersionSources) {
  const source = readFile(sourcePath);
  frameSourceContents.set(sourcePath, source);
  const match = source?.match(/export const FRAME_SCHEMA_VERSION = (\d+);/);
  if (!match) {
    error(`${sourcePath} does not export a numeric FRAME_SCHEMA_VERSION`);
  } else {
    frameVersions.set(sourcePath, Number(match[1]));
  }
}

const frameContractFields = [
  "module_attribution",
  "image_ids",
  "superseded_by",
  "merged_from",
  "contradiction_resolution",
];
for (const field of frameContractFields) {
  for (const [sourcePath, source] of frameSourceContents) {
    if (source?.includes(field)) pass(`${sourcePath} exposes Frame field ${field}`);
    else error(`${sourcePath} is missing current Frame field ${field}`);
  }
}

const frameAlignmentTest = readFile("test/shared/types/frame-contract-alignment.test.ts");
if (
  frameAlignmentTest?.includes("Object.keys(FrameSchema.shape)") &&
  frameAlignmentTest.includes("validateFramePayload(completeFrame)")
) {
  pass("Frame contract alignment has executable shape and validation coverage");
} else {
  error("Frame contract alignment test must compare schema fields and validation surfaces");
}

const distinctFrameVersions = new Set(frameVersions.values());
if (frameVersions.size === frameVersionSources.length && distinctFrameVersions.size === 1) {
  pass(`Frame runtime/type validators agree on schema v${[...distinctFrameVersions][0]}`);
} else if (distinctFrameVersions.size > 1) {
  error(
    `Frame schema version drift: ${[...frameVersions.entries()]
      .map(([path, version]) => `${path}=${version}`)
      .join(", ")}`
  );
}

const frameVersion = [...distinctFrameVersions][0];
const contractSurface = readFile("docs/CONTRACT_SURFACE.md");
const frameSourceGuide = readFile("src/shared/types/FRAME.md");
const storeContract = readFile("src/memory/store/CONTRACT.md");
const storeContractGuide = readFile("docs/STORE_CONTRACTS.md");
const storeInterface = readFile("src/memory/store/frame-store.ts");
const persistenceFrame = readFile("src/memory/frames/types.ts");

if (frameVersion !== undefined) {
  for (const [path, content, expected] of [
    ["README.md", readme, `Frame Schema v${frameVersion}`],
    ["docs/CONTRACT_SURFACE.md", contractSurface, `FRAME_SCHEMA_VERSION = ${frameVersion}`],
    ["src/memory/store/CONTRACT.md", storeContract, `FRAME_SCHEMA_VERSION = ${frameVersion}`],
    ["src/shared/types/FRAME.md", frameSourceGuide, `FRAME_SCHEMA_VERSION = ${frameVersion}`],
  ]) {
    if (content?.includes(expected)) pass(`${path} identifies Frame schema v${frameVersion}`);
    else error(`${path} must identify the implemented Frame schema as v${frameVersion}`);
  }
}

const staleNormativeClaims = [
  "Frames are immutable once written",
  "Every Frame has a unique `id` (UUID v4)",
  "Frames have a `schemaVersion` field (currently `v3`)",
  "Frames may reference other Frames via `parent_id`",
  "**Type:** ULID",
  "| `id` | ULID |",
  "created → active → archived",
];

for (const [path, content] of [
  ["docs/CONTRACT_SURFACE.md", contractSurface],
  ["src/memory/store/CONTRACT.md", storeContract],
  ["docs/STORE_CONTRACTS.md", storeContractGuide],
]) {
  for (const claim of staleNormativeClaims) {
    if (content?.includes(claim)) error(`${path} repeats stale normative Frame claim: ${claim}`);
  }
}

if (
  storeContractGuide?.includes("trusted hosts do not select a backend from ambient environment")
) {
  pass("Store guide keeps ambient environment out of Lex 3.0 trusted composition");
} else {
  error(
    "Store guide must distinguish trusted composition from the environment-selected 2.x factory"
  );
}

for (const required of [
  "opaque string",
  "saveFrame` is idempotent",
  "updateFrame",
  "superseded_by",
  "no normative `parent_id`",
]) {
  if (storeContract?.includes(required)) pass(`FrameStore contract documents ${required}`);
  else error(`FrameStore contract must document ${required}`);
}

if (storeInterface?.includes("updateFrame(")) pass("FrameStore source exposes targeted updates");
else error("FrameStore source no longer exposes the documented updateFrame operation");

if (persistenceFrame?.includes("superseded_by: z.string().optional()")) {
  pass("Persistence Frame schema exposes supersession metadata");
} else {
  error("Persistence Frame schema no longer exposes documented superseded_by metadata");
}

for (const historicalPath of ["docs/1.0.0-vertical-slice.md", "docs/specs/FRAME-SCHEMA-V3.md"]) {
  const historical = readFile(historicalPath);
  if (historical?.includes("**Status:** Historical")) pass(`${historicalPath} is non-normative`);
  else error(`${historicalPath} must be marked Historical before retaining superseded contracts`);
}

// Summary
section("Summary");
console.log(`${GREEN}Passed:${RESET} ${passCount}`);
if (warningCount > 0) {
  console.log(`${YELLOW}Warnings:${RESET} ${warningCount}`);
}
if (errorCount > 0) {
  console.log(`${RED}Errors:${RESET} ${errorCount}`);
  console.log(`\n${RED}✗ Documentation audit failed${RESET}`);
  console.log(`\nFix the errors above and run: npm run validate-docs`);
  process.exit(1);
} else {
  console.log(`\n${GREEN}✓ Documentation audit passed${RESET}`);
  process.exit(0);
}
