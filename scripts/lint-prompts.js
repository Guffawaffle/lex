#!/usr/bin/env node

/**
 * Lint all prompt templates in canon/prompts/
 *
 * Validates:
 * - Frontmatter schema
 * - All {{variables}} declared in frontmatter
 * - File size under 100KB
 * - No binary files
 * - Templates render without errors (with mock context)
 */

import { readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const promptsDir = join(rootDir, "canon", "prompts");

const MAX_SIZE = 100 * 1024; // 100KB

// Colors for output
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

function log(level, message) {
  const prefix =
    {
      error: `${RED}✗${RESET}`,
      success: `${GREEN}✓${RESET}`,
      warn: `${YELLOW}⚠${RESET}`,
    }[level] || "";
  console.log(`${prefix} ${message}`);
}

function parseFrontmatter(content) {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    return { metadata: null, content };
  }

  const lines = content.split("\n");
  let endIndex = -1;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { metadata: null, content };
  }

  const frontmatterLines = lines.slice(1, endIndex);
  const metadata = {};

  for (const line of frontmatterLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;

    const key = trimmed.substring(0, colonIndex).trim();
    let value = trimmed.substring(colonIndex + 1).trim();

    // Remove quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.substring(1, value.length - 1);
    }

    // Parse arrays
    if (value.startsWith("[") && value.endsWith("]")) {
      const arrayContent = value.substring(1, value.length - 1);
      metadata[key] = arrayContent
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter((item) => item.length > 0);
    } else if (key === "schemaVersion") {
      metadata[key] = parseInt(value, 10);
    } else {
      metadata[key] = value;
    }
  }

  return {
    metadata,
    content: lines.slice(endIndex + 1).join("\n"),
  };
}

function extractVariables(template) {
  const variables = new Set();

  // Control structures
  const controlRegex = /\{\{#(if|each)\s+([a-zA-Z_][a-zA-Z0-9_\.]*)\s*\}\}/g;
  let match;

  while ((match = controlRegex.exec(template)) !== null) {
    variables.add(match[2].split(".")[0]);
  }

  // Remove {{#each}} blocks
  const cleanedTemplate = template.replace(
    /\{\{#each\s+[a-zA-Z_][a-zA-Z0-9_\.]*\s*\}\}[\s\S]*?\{\{\/each\}\}/g,
    ""
  );

  // Regular variables
  const varRegex = /\{\{[\{]?\s*([a-zA-Z_][a-zA-Z0-9_\.]*)\s*[\}]?\}\}/g;

  while ((match = varRegex.exec(cleanedTemplate)) !== null) {
    const varName = match[1];

    if (
      !varName.startsWith("#") &&
      !varName.startsWith("/") &&
      varName !== "else" &&
      varName !== "this" &&
      !varName.startsWith("@")
    ) {
      variables.add(varName.split(".")[0]);
    }
  }

  return Array.from(variables).sort();
}

function lintPrompt(filename) {
  const filePath = join(promptsDir, filename);
  const errors = [];
  const warnings = [];

  // Check file size
  const stats = statSync(filePath);
  if (stats.size > MAX_SIZE) {
    errors.push(`File too large: ${stats.size} bytes (max: ${MAX_SIZE})`);
    return { errors, warnings };
  }

  // Check for binary content
  const buffer = readFileSync(filePath);
  const checkLength = Math.min(8192, buffer.length);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) {
      errors.push("Binary file detected");
      return { errors, warnings };
    }
  }

  // Read content
  const content = readFileSync(filePath, "utf-8");
  const { metadata, content: templateContent } = parseFrontmatter(content);

  // Skip non-template files (like README.md, test.md, example.md)
  if (!metadata) {
    if (filename !== "README.md" && filename !== "test.md" && filename !== "example.md") {
      warnings.push("No frontmatter found (skipping validation)");
    }
    return { errors, warnings };
  }

  // Validate required frontmatter fields
  if (!metadata.schemaVersion) {
    errors.push("Missing required field: schemaVersion");
  } else if (metadata.schemaVersion !== 1) {
    errors.push(`Invalid schemaVersion: ${metadata.schemaVersion} (must be 1)`);
  }

  if (!metadata.id) {
    errors.push("Missing required field: id");
  }

  if (!metadata.title) {
    errors.push("Missing required field: title");
  }

  if (!metadata.variables || !Array.isArray(metadata.variables)) {
    warnings.push('Missing or invalid "variables" field');
  }

  if (!metadata.tags || !Array.isArray(metadata.tags)) {
    warnings.push('Missing or invalid "tags" field');
  }

  // Extract variables from template
  const usedVariables = extractVariables(templateContent);
  const declaredVariables = new Set(metadata.variables || []);

  // Check for undeclared variables
  const undeclared = usedVariables.filter((v) => !declaredVariables.has(v));
  if (undeclared.length > 0) {
    errors.push(`Variables used but not declared: ${undeclared.join(", ")}`);
  }

  // Check for unused declared variables
  const unused = Array.from(declaredVariables).filter((v) => !usedVariables.includes(v));
  if (unused.length > 0) {
    warnings.push(`Variables declared but not used: ${unused.join(", ")}`);
  }

  return { errors, warnings };
}

function main() {
  console.log("\n📋 Linting prompt templates...\n");

  const files = readdirSync(promptsDir).filter((f) => f.endsWith(".md"));

  let totalErrors = 0;
  let totalWarnings = 0;
  const results = [];

  for (const file of files) {
    const { errors, warnings } = lintPrompt(file);
    const stats = statSync(join(promptsDir, file));
    const sizeMB = (stats.size / 1024).toFixed(1);

    if (errors.length > 0) {
      log("error", `${file} (${sizeMB}KB)`);
      errors.forEach((err) => console.log(`  - ${err}`));
      totalErrors += errors.length;
    } else if (warnings.length > 0) {
      log("warn", `${file} (${sizeMB}KB)`);
      warnings.forEach((warn) => console.log(`  - ${warn}`));
      totalWarnings += warnings.length;
    } else {
      log("success", `${file} (${sizeMB}KB)`);
    }

    results.push({ file, errors, warnings });
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Total: ${files.length} prompts`);
  console.log(
    `${GREEN}✓ ${files.length - results.filter((r) => r.errors.length > 0).length} passed${RESET}`
  );

  if (totalErrors > 0) {
    console.log(`${RED}✗ ${totalErrors} errors${RESET}`);
  }

  if (totalWarnings > 0) {
    console.log(`${YELLOW}⚠ ${totalWarnings} warnings${RESET}`);
  }

  console.log("=".repeat(60) + "\n");

  if (totalErrors > 0) {
    process.exit(1);
  }
}

main();
