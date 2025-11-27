/**
 * CLI Command: lex code-atlas
 *
 * Extract code units from a repository using static analysis.
 * Outputs CodeAtlasOutput JSON with run metadata and extracted code units.
 *
 * Part of Code Atlas Epic (CA-001) - Layer 3: CLI
 */

import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";
import { createHash } from "crypto";
import * as output from "./output.js";
import type { CodeUnit } from "../../atlas/schemas/code-unit.js";
import type { CodeAtlasRun } from "../../atlas/schemas/code-atlas-run.js";
import { generatePolicySeed } from "../../atlas/policy-seed-generator.js";
import type { PolicySeed } from "../../atlas/schemas/policy-seed.js";

/**
 * Convert PolicySeed to YAML format
 *
 * Uses a simple YAML serialization that is clear and human-readable.
 * This is a seed file, not a final policy.
 */
function policySeedToYaml(seed: PolicySeed): string {
  const lines: string[] = [
    "# Policy Seed - Auto-generated from Code Atlas",
    "# This is a SEED for human refinement, not a final policy.",
    "# Review and customize before using.",
    "",
    `version: ${seed.version}`,
    `generatedBy: "${seed.generatedBy}"`,
    `repoId: "${seed.repoId}"`,
    `generatedAt: "${seed.generatedAt}"`,
    "",
    "modules:",
  ];

  for (const module of seed.modules) {
    lines.push(`  - id: "${module.id}"`);
    lines.push("    match:");
    for (const pattern of module.match) {
      lines.push(`      - "${pattern}"`);
    }
    lines.push(`    unitCount: ${module.unitCount}`);
    lines.push(`    kinds: [${module.kinds.map((k) => `"${k}"`).join(", ")}]`);
    if (module.notes) {
      lines.push(`    notes: "${module.notes}"`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export interface CodeAtlasOptions {
  repo?: string;
  include?: string;
  exclude?: string;
  maxFiles?: number;
  out?: string;
  strategy?: "static" | "llm-assisted" | "mixed";
  json?: boolean;
  policySeed?: string;
}

export interface CodeAtlasOutput {
  run: CodeAtlasRun;
  units: CodeUnit[];
}

export interface CodeAtlasResult {
  success: boolean;
  output?: CodeAtlasOutput;
  outputPath?: string;
  policySeedPath?: string;
  error?: string;
}

/**
 * Default patterns for file discovery
 */
const DEFAULT_INCLUDE = "**/*.{ts,tsx,js,jsx,py}";
const DEFAULT_EXCLUDE = "**/node_modules/**";
const DEFAULT_MAX_FILES = 500;

/**
 * Generate a stable hash for a code unit
 */
function generateCodeUnitId(repoId: string, filePath: string, symbol: string, kind: string): string {
  const hash = createHash("sha256");
  hash.update(`${repoId}:${filePath}:${symbol}:${kind}`);
  return hash.digest("hex").substring(0, 16);
}

/**
 * Generate a unique run ID
 */
function generateRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Get repository ID from directory path
 */
function getRepoId(repoDir: string): string {
  // Try to get from package.json name or use directory name
  const packageJsonPath = path.join(repoDir, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      if (pkg.name) {
        return pkg.name;
      }
    } catch {
      // Fall through to directory name
    }
  }
  return path.basename(path.resolve(repoDir));
}

/**
 * Detect language from file extension
 */
function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".ts":
    case ".tsx":
      return "ts";
    case ".js":
    case ".jsx":
      return "js";
    case ".py":
      return "py";
    default:
      return ext.slice(1) || "unknown";
  }
}

/**
 * Parse .gitignore patterns from a directory
 */
/**
 * Parse .gitignore patterns from a directory
 * 
 * NOTE: This is a simplified implementation for v0. It handles common patterns
 * but may not cover all gitignore edge cases (negation, escaping, etc.).
 * Consider using a dedicated gitignore parsing library for more robust handling.
 */
function parseGitignore(repoDir: string): string[] {
  const gitignorePath = path.join(repoDir, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(gitignorePath, "utf-8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && !line.startsWith("!"))
      .map((pattern) => {
        // Convert gitignore patterns to glob patterns (simplified)
        if (pattern.startsWith("/")) {
          return pattern.substring(1) + "/**";
        }
        if (!pattern.includes("/")) {
          return "**/" + pattern + "/**";
        }
        return "**/" + pattern;
      });
  } catch {
    return [];
  }
}

/**
 * Extract JSDoc comment from a node
 * 
 * NOTE: This uses TypeScript's getJSDocTags API for type-safe extraction.
 * May return undefined if no JSDoc is present or if the structure is unexpected.
 */
function extractJSDocComment(node: ts.Node, _sourceFile: ts.SourceFile): string | undefined {
  try {
    // Use getJSDocTags for type-safe JSDoc extraction
    const jsDocTags = ts.getJSDocTags(node);
    if (jsDocTags && jsDocTags.length > 0) {
      // Get the parent JSDoc node
      const jsDoc = jsDocTags[0].parent;
      if (jsDoc && ts.isJSDoc(jsDoc) && jsDoc.comment) {
        if (typeof jsDoc.comment === "string") {
          return jsDoc.comment;
        }
        // Handle NodeArray<JSDocComment>
        return (jsDoc.comment as readonly ts.JSDocText[])
          .filter((part): part is ts.JSDocText => "text" in part && typeof part.text === "string")
          .map((part) => part.text)
          .join("")
          .trim();
      }
    }
  } catch {
    // If JSDoc extraction fails, return undefined
  }
  return undefined;
}

/**
 * Extract code units from a TypeScript/JavaScript file
 */
function extractTypeScriptUnits(
  filePath: string,
  content: string,
  repoId: string,
  relativePath: string
): CodeUnit[] {
  const units: CodeUnit[] = [];
  const language = detectLanguage(filePath);
  const now = new Date().toISOString();

  try {
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith(".tsx") || filePath.endsWith(".jsx")
        ? ts.ScriptKind.TSX
        : ts.ScriptKind.TS
    );

    const visit = (node: ts.Node, containerName?: string) => {
      // Extract classes
      if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.text;
        const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
        const symbolPath = `${relativePath}::${className}`;

        units.push({
          id: generateCodeUnitId(repoId, relativePath, className, "class"),
          repoId,
          filePath: relativePath,
          language,
          kind: "class",
          symbolPath,
          name: className,
          span: { startLine, endLine },
          docComment: extractJSDocComment(node, sourceFile),
          discoveredAt: now,
          schemaVersion: "code-unit-v0",
        });

        // Extract methods from class
        node.members.forEach((member) => {
          if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
            const methodName = member.name.text;
            const methodStartLine =
              sourceFile.getLineAndCharacterOfPosition(member.getStart()).line + 1;
            const methodEndLine =
              sourceFile.getLineAndCharacterOfPosition(member.getEnd()).line + 1;
            const methodSymbolPath = `${relativePath}::${className}.${methodName}`;

            units.push({
              id: generateCodeUnitId(repoId, relativePath, `${className}.${methodName}`, "method"),
              repoId,
              filePath: relativePath,
              language,
              kind: "method",
              symbolPath: methodSymbolPath,
              name: methodName,
              span: { startLine: methodStartLine, endLine: methodEndLine },
              docComment: extractJSDocComment(member, sourceFile),
              discoveredAt: now,
              schemaVersion: "code-unit-v0",
            });
          }
        });
      }

      // Extract standalone functions
      if (ts.isFunctionDeclaration(node) && node.name) {
        const funcName = node.name.text;
        const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
        const symbolPath = containerName
          ? `${relativePath}::${containerName}.${funcName}`
          : `${relativePath}::${funcName}`;

        units.push({
          id: generateCodeUnitId(repoId, relativePath, funcName, "function"),
          repoId,
          filePath: relativePath,
          language,
          kind: "function",
          symbolPath,
          name: funcName,
          span: { startLine, endLine },
          docComment: extractJSDocComment(node, sourceFile),
          discoveredAt: now,
          schemaVersion: "code-unit-v0",
        });
      }

      // Extract arrow functions assigned to const
      if (ts.isVariableStatement(node)) {
        const modifiers = node.modifiers;
        const isExported = modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

        if (isExported) {
          node.declarationList.declarations.forEach((decl) => {
            if (
              ts.isIdentifier(decl.name) &&
              decl.initializer &&
              ts.isArrowFunction(decl.initializer)
            ) {
              const funcName = decl.name.text;
              const startLine =
                sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
              const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
              const symbolPath = `${relativePath}::${funcName}`;

              units.push({
                id: generateCodeUnitId(repoId, relativePath, funcName, "function"),
                repoId,
                filePath: relativePath,
                language,
                kind: "function",
                symbolPath,
                name: funcName,
                span: { startLine, endLine },
                docComment: extractJSDocComment(node, sourceFile),
                discoveredAt: now,
                schemaVersion: "code-unit-v0",
              });
            }
          });
        }
      }

      ts.forEachChild(node, (child) => visit(child, containerName));
    };

    visit(sourceFile);
  } catch {
    // Skip files that can't be parsed
  }

  return units;
}

/**
 * Extract code units from a Python file using regex patterns
 * 
 * NOTE: This is a simplified v0 implementation using regex patterns.
 * Limitations:
 * - Assumes 4-space indentation for method detection
 * - May not handle all edge cases (nested classes, decorators, etc.)
 * - For more robust extraction, consider using Python AST via subprocess
 */
function extractPythonUnits(
  filePath: string,
  content: string,
  repoId: string,
  relativePath: string
): CodeUnit[] {
  const units: CodeUnit[] = [];
  const language = "py";
  const now = new Date().toISOString();
  const lines = content.split("\n");

  // Pattern for class definitions
  const classPattern = /^class\s+(\w+)(?:\s*\([^)]*\))?\s*:/;
  // Pattern for function definitions (top-level, no indentation)
  const functionPattern = /^def\s+(\w+)\s*\([^)]*\)\s*(?:->.*)?:/;
  // Pattern for method definitions (assumes 4-space indentation)
  const methodPattern = /^\s{4}def\s+(\w+)\s*\([^)]*\)\s*(?:->.*)?:/;

  let currentClass: { name: string; startLine: number } | null = null;
  let inDocstring = false;
  let docstringQuote = "";
  let pendingDocComment: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Handle multiline docstrings
    if (inDocstring) {
      pendingDocComment.push(line);
      if (line.includes(docstringQuote)) {
        inDocstring = false;
      }
      continue;
    }

    // Check for docstring start
    if (line.trim().startsWith('"""') || line.trim().startsWith("'''")) {
      docstringQuote = line.trim().startsWith('"""') ? '"""' : "'''";
      if (line.trim().endsWith(docstringQuote) && line.trim().length > 6) {
        pendingDocComment = [line.trim().slice(3, -3)];
      } else {
        inDocstring = true;
        pendingDocComment = [line];
      }
      continue;
    }

    // Match class definitions
    const classMatch = line.match(classPattern);
    if (classMatch) {
      // Find end of class (look for next non-indented line or end of file)
      let endLine = lineNum;
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        if (nextLine.trim() && !nextLine.startsWith(" ") && !nextLine.startsWith("\t")) {
          break;
        }
        endLine = j + 1;
      }

      const className = classMatch[1];
      const symbolPath = `${relativePath}::${className}`;
      const docComment = pendingDocComment.length > 0 ? pendingDocComment.join("\n").trim() : undefined;

      units.push({
        id: generateCodeUnitId(repoId, relativePath, className, "class"),
        repoId,
        filePath: relativePath,
        language,
        kind: "class",
        symbolPath,
        name: className,
        span: { startLine: lineNum, endLine },
        docComment,
        discoveredAt: now,
        schemaVersion: "code-unit-v0",
      });

      currentClass = { name: className, startLine: lineNum };
      pendingDocComment = [];
      continue;
    }

    // Match method definitions (inside class)
    const methodMatch = line.match(methodPattern);
    if (methodMatch && currentClass) {
      // Find end of method
      let endLine = lineNum;
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        // Method ends when we see a line with less or equal indentation (class level or less)
        if (nextLine.trim() && !nextLine.startsWith("        ") && !nextLine.startsWith("\t\t")) {
          break;
        }
        endLine = j + 1;
      }

      const methodName = methodMatch[1];
      const symbolPath = `${relativePath}::${currentClass.name}.${methodName}`;
      const docComment = pendingDocComment.length > 0 ? pendingDocComment.join("\n").trim() : undefined;

      units.push({
        id: generateCodeUnitId(repoId, relativePath, `${currentClass.name}.${methodName}`, "method"),
        repoId,
        filePath: relativePath,
        language,
        kind: "method",
        symbolPath,
        name: methodName,
        span: { startLine: lineNum, endLine },
        docComment,
        discoveredAt: now,
        schemaVersion: "code-unit-v0",
      });

      pendingDocComment = [];
      continue;
    }

    // Match top-level function definitions
    const functionMatch = line.match(functionPattern);
    if (functionMatch) {
      // Reset current class when we see a top-level function
      currentClass = null;

      // Find end of function
      let endLine = lineNum;
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        if (nextLine.trim() && !nextLine.startsWith(" ") && !nextLine.startsWith("\t")) {
          break;
        }
        endLine = j + 1;
      }

      const funcName = functionMatch[1];
      const symbolPath = `${relativePath}::${funcName}`;
      const docComment = pendingDocComment.length > 0 ? pendingDocComment.join("\n").trim() : undefined;

      units.push({
        id: generateCodeUnitId(repoId, relativePath, funcName, "function"),
        repoId,
        filePath: relativePath,
        language,
        kind: "function",
        symbolPath,
        name: funcName,
        span: { startLine: lineNum, endLine },
        docComment,
        discoveredAt: now,
        schemaVersion: "code-unit-v0",
      });

      pendingDocComment = [];
      continue;
    }

    // Check if we've left the current class
    if (currentClass && line.trim() && !line.startsWith(" ") && !line.startsWith("\t")) {
      currentClass = null;
    }

    // Reset pending doc comment if we hit a non-docstring, non-empty line
    if (line.trim() && !line.trim().startsWith("#")) {
      pendingDocComment = [];
    }
  }

  return units;
}

/**
 * Extract code units from a file based on its language
 */
function extractUnits(
  filePath: string,
  content: string,
  repoId: string,
  relativePath: string
): CodeUnit[] {
  const language = detectLanguage(filePath);

  switch (language) {
    case "ts":
    case "js":
      return extractTypeScriptUnits(filePath, content, repoId, relativePath);
    case "py":
      return extractPythonUnits(filePath, content, repoId, relativePath);
    default:
      return [];
  }
}

/**
 * Execute the 'lex code-atlas' command
 */
export async function codeAtlas(options: CodeAtlasOptions = {}): Promise<CodeAtlasResult> {
  const repoDir = path.resolve(options.repo || ".");
  const includePattern = options.include || DEFAULT_INCLUDE;
  const excludePattern = options.exclude || DEFAULT_EXCLUDE;
  const maxFiles = options.maxFiles || DEFAULT_MAX_FILES;
  const strategy = options.strategy || "static";

  // Validate repository directory
  if (!fs.existsSync(repoDir)) {
    const errorMsg = `Repository directory not found: ${repoDir}`;
    if (options.json) {
      output.json({ success: false, error: errorMsg });
    } else {
      output.error(errorMsg);
    }
    return { success: false, error: errorMsg };
  }

  const repoId = getRepoId(repoDir);
  const runId = generateRunId();
  const startTime = Date.now();

  // Parse .gitignore patterns
  const gitignorePatterns = parseGitignore(repoDir);

  // Build ignore patterns
  const ignorePatterns = [
    excludePattern,
    ...gitignorePatterns,
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/__pycache__/**",
    "**/*.d.ts",
  ];

  if (!options.json) {
    output.info(`Scanning repository: ${repoDir}`);
    output.info(`Include pattern: ${includePattern}`);
    output.info(`Max files: ${maxFiles}`);
  }

  try {
    // Preprocess ignore patterns for efficiency
    const resolvedIgnorePatterns = ignorePatterns.map((p) => 
      p.startsWith("**/") ? p : path.join(repoDir, p)
    );

    // Discover files
    const pattern = path.join(repoDir, includePattern);
    const allFiles = await glob(pattern, {
      ignore: resolvedIgnorePatterns,
      nodir: true,
    });

    // Apply file limit
    const truncated = allFiles.length > maxFiles;
    const filesToScan = truncated ? allFiles.slice(0, maxFiles) : allFiles;

    if (!options.json) {
      output.info(`Found ${allFiles.length} files, scanning ${filesToScan.length}...`);
    }

    const units: CodeUnit[] = [];
    let filesProcessed = 0;

    // Process files
    for (const filePath of filesToScan) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const relativePath = path.relative(repoDir, filePath).replace(/\\/g, "/");
        const fileUnits = extractUnits(filePath, content, repoId, relativePath);
        units.push(...fileUnits);
        filesProcessed++;

        // Progress indicator for large repos
        if (!options.json && filesProcessed % 50 === 0) {
          output.info(`Processed ${filesProcessed}/${filesToScan.length} files (${units.length} units)...`);
        }
      } catch {
        // Skip files that can't be read
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Create run metadata
    const run: CodeAtlasRun = {
      runId,
      repoId,
      filesRequested: allFiles.map((f) => path.relative(repoDir, f).replace(/\\/g, "/")),
      filesScanned: filesToScan.map((f) => path.relative(repoDir, f).replace(/\\/g, "/")),
      unitsEmitted: units.length,
      limits: {
        maxFiles,
      },
      truncated,
      strategy,
      createdAt: new Date().toISOString(),
      schemaVersion: "code-atlas-run-v0",
    };

    const atlasOutput: CodeAtlasOutput = {
      run,
      units,
    };

    // Generate policy seed if requested
    let policySeedPath: string | undefined;
    if (options.policySeed) {
      const policySeed = generatePolicySeed(units, repoId);
      policySeedPath = path.resolve(options.policySeed);
      const seedDir = path.dirname(policySeedPath);
      if (!fs.existsSync(seedDir)) {
        fs.mkdirSync(seedDir, { recursive: true });
      }
      // Convert to YAML-like format
      const yamlContent = policySeedToYaml(policySeed);
      fs.writeFileSync(policySeedPath, yamlContent);

      if (!options.json) {
        output.info(`Policy seed written to: ${policySeedPath}`);
      }
    }

    // Output results
    if (options.out) {
      // Write to file
      const outPath = path.resolve(options.out);
      const outDir = path.dirname(outPath);
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }
      fs.writeFileSync(outPath, JSON.stringify(atlasOutput, null, 2));

      if (options.json) {
        output.json({
          success: true,
          outputPath: outPath,
          ...(policySeedPath && { policySeedPath }),
          filesScanned: filesToScan.length,
          unitsEmitted: units.length,
          truncated,
          durationSeconds: parseFloat(duration),
        });
      } else {
        output.success(`\n✅ Code Atlas extraction complete`);
        output.info(`Output written to: ${outPath}`);
        output.info(`Files scanned: ${filesToScan.length}${truncated ? ` (limited from ${allFiles.length})` : ""}`);
        output.info(`Units extracted: ${units.length}`);
        output.info(`Duration: ${duration}s`);
      }

      return {
        success: true,
        output: atlasOutput,
        outputPath: outPath,
        ...(policySeedPath && { policySeedPath }),
      };
    } else {
      // Output to stdout
      if (options.json) {
        output.raw(JSON.stringify(atlasOutput, null, 2));
      } else {
        // Human-readable summary first, then JSON
        output.success(`\n✅ Code Atlas extraction complete`);
        output.info(`Files scanned: ${filesToScan.length}${truncated ? ` (limited from ${allFiles.length})` : ""}`);
        output.info(`Units extracted: ${units.length}`);
        output.info(`Duration: ${duration}s`);
        output.info(`\nOutput:`);
        output.raw(JSON.stringify(atlasOutput, null, 2));
      }

      return {
        success: true,
        output: atlasOutput,
        ...(policySeedPath && { policySeedPath }),
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (options.json) {
      output.json({ success: false, error: errorMsg });
    } else {
      output.error(`\n❌ Code Atlas extraction failed: ${errorMsg}`);
    }
    return { success: false, error: errorMsg };
  }
}
