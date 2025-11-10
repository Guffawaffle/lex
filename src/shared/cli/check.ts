/**
 * CLI Command: lex check
 *
 * Wrapper around policy/check for user-friendly policy violation reporting.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import * as output from "./output.js";

export interface CheckOptions {
  json?: boolean;
  ticket?: string;
}

interface PolicyModule {
  owns_namespaces?: string[];
  owns_paths?: string[];
  exposes?: string[];
  allowed_callers?: string[];
  forbidden_callers?: string[];
  feature_flags?: string[];
  requires_permissions?: string[];
  kill_patterns?: string[];
}

interface Policy {
  modules: Record<string, PolicyModule>;
  global_kill_patterns?: Array<{
    pattern: string;
    description: string;
  }>;
}

interface FileData {
  path: string;
  module_scope?: string;
  declarations: Array<{ type: string; name: string; namespace?: string }>;
  imports: Array<{ from: string; type: string }>;
  feature_flags: string[];
  permissions: string[];
  warnings: string[];
}

interface ModuleEdge {
  from_module: string;
  to_module: string;
  from_file: string;
  import_statement: string;
}

interface MergedScannerOutput {
  sources: string[];
  files: FileData[];
  module_edges?: ModuleEdge[];
}

interface Violation {
  file: string;
  module: string;
  type: "forbidden_caller" | "kill_pattern" | "missing_permission";
  message: string;
  details: string;
}

/**
 * Execute the 'lex check' command
 * Checks scanner output against policy and reports violations
 */
export async function check(
  mergedJsonPath: string,
  policyJsonPath: string,
  options: CheckOptions = {}
): Promise<void> {
  try {
    // Validate file paths
    const resolvedMergedPath = resolve(mergedJsonPath);
    const resolvedPolicyPath = resolve(policyJsonPath);

    if (!existsSync(resolvedMergedPath)) {
      output.error(`\n❌ Scanner output not found: ${mergedJsonPath}\n`);
      process.exit(2);
    }

    if (!existsSync(resolvedPolicyPath)) {
      output.error(`\n❌ Policy file not found: ${policyJsonPath}\n`);
      process.exit(2);
    }

    // Load files
    const scannerContent = readFileSync(resolvedMergedPath, "utf-8");
    const scannerOutput: MergedScannerOutput = JSON.parse(scannerContent);

    const policyContent = readFileSync(resolvedPolicyPath, "utf-8");
    const policy: Policy = JSON.parse(policyContent);

    // Run policy check
    const violations = checkPolicy(scannerOutput, policy);

    // Output results
    if (options.json) {
      output.json({
        violations,
        count: violations.length,
        ticket: options.ticket,
      });
    } else {
      displayViolations(violations, options.ticket);
    }

    // Exit with appropriate code
    if (violations.length > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error: any) {
    output.error(`\n❌ Error: ${error.message}\n`);
    process.exit(2);
  }
}

/**
 * Check scanner output against policy
 */
function checkPolicy(scannerOutput: MergedScannerOutput, policy: Policy): Violation[] {
  const violations: Violation[] = [];

  for (const file of scannerOutput.files) {
    // Use module_scope from scanner if available, otherwise resolve
    const moduleId = file.module_scope || resolveFileToModule(file.path, policy);

    if (!moduleId) {
      // File doesn't belong to any known module - skip
      continue;
    }

    // Check imports against forbidden_callers
    for (const imp of file.imports) {
      const importedModuleId = resolveImportToModule(imp.from, policy);

      if (importedModuleId) {
        const importedModule = policy.modules[importedModuleId];

        if (importedModule && importedModule.forbidden_callers) {
          // Check if current module matches any forbidden_caller pattern
          for (const forbidden of importedModule.forbidden_callers) {
            if (matchPattern(moduleId, forbidden)) {
              violations.push({
                file: file.path,
                module: moduleId,
                type: "forbidden_caller",
                message: `Module ${moduleId} imports ${importedModuleId} but is forbidden`,
                details: `Policy forbids: ${forbidden}`,
              });
            }
          }
        }
      }
    }

    // Check for kill patterns
    for (const warning of file.warnings) {
      violations.push({
        file: file.path,
        module: moduleId,
        type: "kill_pattern",
        message: `Kill pattern detected: ${warning}`,
        details: "",
      });
    }
  }

  // Check module_edges if available
  if (scannerOutput.module_edges) {
    for (const edge of scannerOutput.module_edges) {
      const toModule = policy.modules[edge.to_module];

      if (toModule && toModule.forbidden_callers) {
        for (const forbidden of toModule.forbidden_callers) {
          if (matchPattern(edge.from_module, forbidden)) {
            violations.push({
              file: edge.from_file,
              module: edge.from_module,
              type: "forbidden_caller",
              message: `Module ${edge.from_module} calls ${edge.to_module} but is forbidden`,
              details: `Import: ${edge.import_statement}, Policy forbids: ${forbidden}`,
            });
          }
        }
      }
    }
  }

  return violations;
}

/**
 * Resolve file path to module ID
 */
function resolveFileToModule(filePath: string, policy: Policy): string | null {
  for (const [moduleId, module] of Object.entries(policy.modules)) {
    if (module.owns_paths) {
      for (const pathPattern of module.owns_paths) {
        if (matchPath(filePath, pathPattern)) {
          return moduleId;
        }
      }
    }
  }
  return null;
}

/**
 * Resolve import path to module ID
 */
function resolveImportToModule(importPath: string, policy: Policy): string | null {
  // Try exact module ID match first (for test compatibility)
  if (policy.modules[importPath]) {
    return importPath;
  }

  // Try to match by namespace first (PHP style)
  for (const [moduleId, module] of Object.entries(policy.modules)) {
    if (module.owns_namespaces) {
      for (const namespace of module.owns_namespaces) {
        if (importPath.startsWith(namespace)) {
          return moduleId;
        }
      }
    }
  }

  // Try to match by file path pattern (TypeScript/JS style)
  for (const [moduleId, module] of Object.entries(policy.modules)) {
    if (module.owns_paths) {
      for (const pathPattern of module.owns_paths) {
        if (matchPath(importPath, pathPattern)) {
          return moduleId;
        }
      }
    }
  }

  return null;
}

/**
 * Match file path against pattern with glob support
 */
function matchPath(filePath: string, pattern: string): boolean {
  const regexPattern = pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\//g, "\\/");
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

/**
 * Match value against pattern
 */
function matchPattern(value: string, pattern: string): boolean {
  const regexPattern = pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(value);
}

/**
 * Display violations in user-friendly format
 */
function displayViolations(violations: Violation[], ticket?: string): void {
  if (violations.length === 0) {
    output.success("\n✅ No policy violations found\n");
    return;
  }

  output.error(
    `\n❌ Found ${violations.length} policy violation(s)${ticket ? ` (ticket: ${ticket})` : ""}:\n`
  );

  for (let i = 0; i < violations.length; i++) {
    const v = violations[i];
    output.info(`${i + 1}. ${v.file}`);
    output.info(`   Module: ${v.module}`);
    output.info(`   Type: ${v.type}`);
    output.info(`   ${v.message}`);
    if (v.details) {
      output.info(`   ${v.details}`);
    }
    output.info("");
  }

  output.info(`Exit code: 1 (violations found)\n`);
}
