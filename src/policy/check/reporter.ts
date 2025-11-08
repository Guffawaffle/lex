/**
 * Policy Violation Reporting
 *
 * Formats and outputs policy violations for human reading and CI/CD integration.
 */

import { Violation } from "./violations.js";
// @ts-ignore - importing from compiled dist directories
import type { Policy } from "../../shared/types/policy.js";
// @ts-ignore - importing from compiled dist directories
import { generateAtlasFrame, formatAtlasFrame } from "../../shared/atlas/atlas-frame.js";

/**
 * Report format options
 */
export type ReportFormat = "text" | "json" | "markdown";

/**
 * Report result with exit code
 */
export interface ReportResult {
  /** Exit code: 0=clean, 1=violations */
  exitCode: 0 | 1;
  /** Formatted report content */
  content: string;
}

// Backward-compatible generateReport supporting legacy signature:
//   generateReport(violations, policy, format)
// New preferred signature:
//   generateReport(violations, { policy, format, strict })
export function generateReport(
  violations: Violation[],
  policyOrOpts: Policy | { policy?: Policy; format?: ReportFormat; strict?: boolean } = {},
  legacyFormat?: ReportFormat
): ReportResult {
  let policy: Policy | undefined;
  let format: ReportFormat = "text";

  const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null;
  const isPolicyObject = (val: unknown): val is Policy =>
    isPlainObject(val) &&
    Object.prototype.hasOwnProperty.call(val, "modules") &&
    !Object.prototype.hasOwnProperty.call(val, "policy");

  if (isPolicyObject(policyOrOpts) && legacyFormat) {
    policy = policyOrOpts as Policy;
    format = legacyFormat;
  } else if (isPolicyObject(policyOrOpts) && !legacyFormat) {
    policy = policyOrOpts as Policy;
  } else {
    const opts = policyOrOpts as { policy?: Policy; format?: ReportFormat; strict?: boolean };
    policy = opts.policy;
    format = opts.format ?? "text";
  }

  const exitCode = violations.length > 0 ? 1 : 0;

  let content: string;
  switch (format) {
    case "json":
      content = formatAsJson(violations);
      break;
    case "markdown":
      content = formatAsMarkdown(violations, policy);
      break;
    case "text":
    default:
      content = formatAsText(violations, policy);
      break;
  }

  return { exitCode, content };
}

/**
 * Format policy header for text output
 */
function formatPolicyHeaderText(policy: Policy, count: number): string {
  // Attempt to derive an identifier (fallback to 'policy')
  const id = derivePolicyId(policy);
  return `Policy: ${id} (violations: ${count})`;
}

/**
 * Format policy header for markdown output
 */
function formatPolicyHeaderMarkdown(policy: Policy, count: number): string {
  const id = derivePolicyId(policy);
  return `**Policy:** ${id} • **Violations:** ${count}`;
}

/**
 * Derive a human-friendly policy identifier.
 * Currently uses number of modules; can evolve to use explicit metadata.
 */
function derivePolicyId(policy: Policy): string {
  try {
    const moduleCount = Object.keys(policy.modules || {}).length;
    return moduleCount > 0 ? `${moduleCount} modules` : "policy";
  } catch {
    return "policy";
  }
}

/**
 * Format violations as human-readable text
 */
function formatAsText(violations: Violation[], policy?: Policy): string {
  if (violations.length === 0) {
    const header = policy ? formatPolicyHeaderText(policy, 0) + "\n" : "";
    return header + "✅ No violations found\n";
  }

  let output = "";
  if (policy) {
    output += formatPolicyHeaderText(policy, violations.length) + "\n";
  }
  output += `❌ Found ${violations.length} violation(s):\n\n`;

  // Group violations by module for better context
  const byModule = groupViolationsByModule(violations);

  for (const [moduleId, moduleViolations] of Object.entries(byModule)) {
    output += `📦 Module: ${moduleId}\n`;

    // Include Atlas Frame context with error handling
    try {
      const atlasFrame = generateAtlasFrame([moduleId], 1);
      const atlasContext = formatAtlasFrame(atlasFrame);
      output += atlasContext;
    } catch {
      // If Atlas Frame generation fails, continue without it
      output += `\n⚠️  Atlas Frame context unavailable\n`;
    }

    for (const violation of moduleViolations) {
      output += `\n  ❌ ${formatViolationType(violation.type)}\n`;
      output += `     File: ${violation.file}\n`;
      output += `     ${violation.message}\n`;
      if (violation.details) {
        output += `     Details: ${violation.details}\n`;
      }
      if (violation.target_module) {
        output += `     Target: ${violation.target_module}\n`;
      }
      if (violation.import_from) {
        output += `     Import: ${violation.import_from}\n`;
      }
    }

    output += "\n";
  }

  return output;
}

/**
 * Format violations as JSON
 */
function formatAsJson(violations: Violation[]): string {
  return JSON.stringify(
    {
      violations,
      count: violations.length,
      status: violations.length === 0 ? "clean" : "violations_found",
    },
    null,
    2
  );
}

/**
 * Format violations as Markdown
 */
function formatAsMarkdown(violations: Violation[], policy?: Policy): string {
  if (violations.length === 0) {
    let clean = "# Policy Check Report\n\n";
    if (policy) clean += formatPolicyHeaderMarkdown(policy, 0) + "\n\n";
    return clean + "✅ **No violations found**\n";
  }

  let output = "# Policy Check Report\n\n";
  if (policy) {
    output += formatPolicyHeaderMarkdown(policy, violations.length) + "\n\n";
  }
  output += `**Status:** ❌ ${violations.length} violation(s) found\n\n`;

  // Group violations by type
  const byType = groupViolationsByType(violations);

  output += "## Summary\n\n";
  output += "| Violation Type | Count |\n";
  output += "|----------------|-------|\n";
  for (const [type, typeViolations] of Object.entries(byType)) {
    output += `| ${formatViolationType(type)} | ${typeViolations.length} |\n`;
  }
  output += "\n";

  // Detailed violations by module
  output += "## Violations by Module\n\n";
  const byModule = groupViolationsByModule(violations);

  for (const [moduleId, moduleViolations] of Object.entries(byModule)) {
    output += `### 📦 Module: \`${moduleId}\`\n\n`;

    // Include Atlas Frame context with error handling
    try {
      const atlasFrame = generateAtlasFrame([moduleId], 1);
      output += "**Atlas Frame Context:**\n";
      output += "```\n";
      output += formatAtlasFrame(atlasFrame);
      output += "```\n\n";
    } catch {
      output += "**Atlas Frame Context:** ⚠️ Unavailable\n\n";
    }

    // List violations
    for (const violation of moduleViolations) {
      output += `- **${formatViolationType(violation.type)}**\n`;
      output += `  - File: \`${violation.file}\`\n`;
      output += `  - ${violation.message}\n`;
      if (violation.details) {
        output += `  - Details: ${violation.details}\n`;
      }
      if (violation.target_module) {
        output += `  - Target Module: \`${violation.target_module}\`\n`;
      }
      if (violation.import_from) {
        output += `  - Import: \`${violation.import_from}\`\n`;
      }
      output += "\n";
    }
  }

  output += "## Recommendations\n\n";
  output += "1. Review each violation and update code to comply with policy\n";
  output += "2. Update `lexmap.policy.json` if architectural boundaries have changed\n";
  output += "3. Run `lexmap check` again after fixes\n";
  output += "\n";

  return output;
}

/**
 * Group violations by module
 */
function groupViolationsByModule(violations: Violation[]): Record<string, Violation[]> {
  const groups: Record<string, Violation[]> = {};

  for (const violation of violations) {
    if (!groups[violation.module]) {
      groups[violation.module] = [];
    }
    groups[violation.module].push(violation);
  }

  return groups;
}

/**
 * Group violations by type
 */
function groupViolationsByType(violations: Violation[]): Record<string, Violation[]> {
  const groups: Record<string, Violation[]> = {};

  for (const violation of violations) {
    if (!groups[violation.type]) {
      groups[violation.type] = [];
    }
    groups[violation.type].push(violation);
  }

  return groups;
}

/**
 * Format violation type as human-readable string
 */
function formatViolationType(type: string): string {
  const typeMap: Record<string, string> = {
    forbidden_caller: "Forbidden Caller",
    missing_allowed_caller: "Missing Allowed Caller",
    feature_flag: "Feature Flag Violation",
    permission: "Permission Violation",
    kill_pattern: "Kill Pattern Violation",
  };

  return typeMap[type] || type;
}

/**
 * Print a report to console
 *
 * @param violations - List of violations
 * @param policy - Policy for context
 * @param format - Output format
 */
export function printReport(
  violations: Violation[],
  policy: Policy,
  format: ReportFormat = "text"
): void {
  const report = generateReport(violations, { policy, format });
  // eslint-disable-next-line no-console -- intentional CLI output
  console.log(report.content);
}

/**
 * Get exit code for violations
 *
 * @param violations - List of violations
 * @returns Exit code: 0=clean, 1=violations
 */
export function getExitCode(violations: Violation[]): 0 | 1 {
  return violations.length > 0 ? 1 : 0;
}
