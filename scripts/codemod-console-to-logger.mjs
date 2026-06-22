#!/usr/bin/env node
/**
 * Codemod: console.* → logger.*
 *
 * Usage:
 *   node scripts/codemod-console-to-logger.mjs <directory>
 *
 * Example:
 *   node scripts/codemod-console-to-logger.mjs src/shared/cli
 *
 * Transforms:
 * - console.error → logger.error
 * - console.warn → logger.warn
 * - console.info/log → logger.info
 * - console.debug → logger.debug
 * - console.trace → logger.trace
 *
 * Adds import at top of file:
 * import { getLogger } from "<relative path to src/shared/logger/index.js>";
 * const logger = getLogger("<scope>");
 *
 * Where <scope> is derived from file path (e.g., "shared:cli:lex" from "src/shared/cli/lex.ts")
 */

import { Project, SyntaxKind } from "ts-morph";
import { readdir } from "node:fs/promises";
import { dirname, join, relative, sep, parse } from "node:path";

// Map console methods to logger methods
const METHOD_MAP = {
  error: "error",
  warn: "warn",
  info: "info",
  log: "info", // console.log → logger.info
  debug: "debug",
  trace: "trace",
};

/**
 * Derive scope from file path
 * src/shared/cli/lex.ts → "shared:cli:lex"
 * src/memory/store/framestore.ts → "memory:store:framestore"
 */
function deriveScope(filePath) {
  const rel = relative(process.cwd(), filePath);
  const parts = rel.split(sep);

  // Remove "src/" prefix if present
  if (parts[0] === "src") {
    parts.shift();
  }

  // Remove file extension and use filename as last component
  const { name } = parse(parts[parts.length - 1]);
  parts[parts.length - 1] = name;

  return parts.join(":");
}

/**
 * Derive a NodeNext-compatible relative import to the shared logger module.
 */
function deriveLoggerImport(filePath) {
  const loggerPath = join(process.cwd(), "src", "shared", "logger", "index.js");
  let importPath = relative(dirname(filePath), loggerPath).split(sep).join("/");
  if (!importPath.startsWith(".")) {
    importPath = `./${importPath}`;
  }
  return importPath;
}

/**
 * Find all .ts files in directory (excluding .d.ts, .test.ts)
 */
async function findTsFiles(dir) {
  const files = [];

  async function walk(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".d.ts") &&
        !entry.name.endsWith(".test.ts") &&
        !entry.name.endsWith(".spec.ts")
      ) {
        files.push(fullPath);
      }
    }
  }

  await walk(dir);
  return files;
}

/**
 * Transform a single file
 */
function transformFile(project, filePath) {
  const sourceFile = project.addSourceFileAtPath(filePath);
  let hasConsole = false;
  let methodsUsed = new Set();

  // Find all console.* calls
  sourceFile.forEachDescendant((node) => {
    if (node.getKind() === SyntaxKind.PropertyAccessExpression) {
      const propAccess = node;
      const expr = propAccess.getExpression();

      // Check if it's console.<method>
      if (expr.getKind() === SyntaxKind.Identifier && expr.getText() === "console") {
        const methodName = propAccess.getName();
        if (METHOD_MAP[methodName]) {
          hasConsole = true;
          methodsUsed.add(methodName);
        }
      }
    }
  });

  if (!hasConsole) {
    // No console usage, skip this file
    project.removeSourceFile(sourceFile);
    return false;
  }

  // Derive scope from file path
  const scope = deriveScope(filePath);
  const loggerImport = deriveLoggerImport(filePath);

  // Add import if not present
  const existingImport = sourceFile.getImportDeclarations().find((imp) => {
    const specifier = imp.getModuleSpecifierValue();
    const hasGetLogger = imp.getNamedImports().some((named) => named.getName() === "getLogger");
    return (
      hasGetLogger &&
      (specifier === loggerImport ||
        specifier.endsWith("/shared/logger/index.js") ||
        specifier.endsWith("/logger/index.js"))
    );
  });

  if (!existingImport) {
    // Add import at the top
    const firstStatement = sourceFile.getStatements()[0];
    if (firstStatement) {
      firstStatement.replaceWithText(
        `import { getLogger } from "${loggerImport}";\n${firstStatement.getText()}`
      );
    } else {
      sourceFile.addImportDeclaration({
        moduleSpecifier: loggerImport,
        namedImports: ["getLogger"],
      });
    }
  }

  // Add logger constant after imports
  const hasLoggerConst = sourceFile.getVariableDeclarations().some((v) => v.getName() === "logger");

  if (!hasLoggerConst) {
    // Find last import
    const imports = sourceFile.getImportDeclarations();
    if (imports.length > 0) {
      const lastImport = imports[imports.length - 1];
      const nextStatement = lastImport.getNextSibling();

      if (nextStatement) {
        nextStatement.replaceWithText(
          `\nconst logger = getLogger("${scope}");\n\n${nextStatement.getText()}`
        );
      } else {
        // No statements after imports
        sourceFile.addStatements(`\nconst logger = getLogger("${scope}");\n`);
      }
    } else {
      // No imports at all (shouldn't happen since we just added one)
      sourceFile.insertStatements(0, [
        `import { getLogger } from "${loggerImport}";`,
        `const logger = getLogger("${scope}");`,
      ]);
    }
  }

  // Transform console.* → logger.*
  sourceFile.forEachDescendant((node) => {
    if (node.getKind() === SyntaxKind.PropertyAccessExpression) {
      const propAccess = node;
      const expr = propAccess.getExpression();

      if (expr.getKind() === SyntaxKind.Identifier && expr.getText() === "console") {
        const methodName = propAccess.getName();
        const loggerMethod = METHOD_MAP[methodName];

        if (loggerMethod) {
          // Replace console with logger
          expr.replaceWithText("logger");

          // Update method name if needed (e.g., log → info)
          if (methodName !== loggerMethod) {
            propAccess.getNameNode().replaceWithText(loggerMethod);
          }
        }
      }
    }
  });

  return true;
}

// Main
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: node scripts/codemod-console-to-logger.mjs <directory>");
    console.error("\nExample:");
    console.error("  node scripts/codemod-console-to-logger.mjs src/shared/cli");
    process.exit(1);
  }

  const targetDir = args[0];
  console.log(`🔍 Scanning ${targetDir} for TypeScript files...`);

  const files = await findTsFiles(targetDir);
  console.log(`📝 Found ${files.length} TypeScript files`);

  if (files.length === 0) {
    console.log("✅ No files to transform");
    return;
  }

  const project = new Project({
    tsConfigFilePath: join(process.cwd(), "tsconfig.json"),
  });

  let transformedCount = 0;

  for (const file of files) {
    const relPath = relative(process.cwd(), file);
    const wasTransformed = transformFile(project, file);

    if (wasTransformed) {
      transformedCount++;
      console.log(`  ✓ ${relPath}`);
    }
  }

  if (transformedCount > 0) {
    console.log(`\n💾 Saving ${transformedCount} transformed files...`);
    await project.save();
    console.log(`✅ Done! Transformed ${transformedCount} files`);
  } else {
    console.log("✅ No console.* usage found, nothing to transform");
  }
}

main().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});
