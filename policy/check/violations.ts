/**
 * Policy Violation Detection
 * 
 * Detects various types of architectural policy violations by comparing
 * merged scanner output against the policy file.
 */

import { Policy, PolicyModule } from '@lex/types/policy';
import { MergedScanResult, FileData } from '@lex/merge/types';

/**
 * Types of policy violations that can be detected
 */
export type ViolationType = 
  | 'forbidden_caller'
  | 'missing_allowed_caller'
  | 'feature_flag'
  | 'permission'
  | 'kill_pattern';

/**
 * A single policy violation
 */
export interface Violation {
  /** File where the violation occurred */
  file: string;
  
  /** Module that owns the violating file */
  module: string;
  
  /** Type of violation */
  type: ViolationType;
  
  /** Human-readable message describing the violation */
  message: string;
  
  /** Additional context and details */
  details: string;
  
  /** Module involved in the violation (e.g., the module being called) */
  target_module?: string;
  
  /** Import statement or pattern that caused the violation */
  import_from?: string;
}

/**
 * Detect all policy violations in the merged scanner output
 * 
 * @param merged - Merged scanner output from lexmap merge
 * @param policy - Policy definitions from lexmap.policy.json
 * @returns Array of detected violations
 */
export function detectViolations(
  merged: MergedScanResult,
  policy: Policy
): Violation[] {
  const violations: Violation[] = [];
  
  for (const file of merged.files) {
    const moduleId = resolveFileToModule(file.path, policy);
    
    if (!moduleId) {
      // File doesn't belong to any known module - skip
      continue;
    }
    
    const module = policy.modules[moduleId];
    
    // Check for forbidden caller violations
    violations.push(...detectForbiddenCallerViolations(file, moduleId, policy));
    
    // Check for missing allowed caller violations
    violations.push(...detectMissingAllowedCallerViolations(file, moduleId, policy));
    
    // Check for feature flag violations
    violations.push(...detectFeatureFlagViolations(file, moduleId, module));
    
    // Check for permission violations
    violations.push(...detectPermissionViolations(file, moduleId, module));
    
    // Check for kill pattern violations
    violations.push(...detectKillPatternViolations(file, moduleId, module, policy));
  }
  
  return violations;
}

/**
 * Detect violations where a module calls another module that has forbidden the caller
 */
function detectForbiddenCallerViolations(
  file: FileData,
  moduleId: string,
  policy: Policy
): Violation[] {
  const violations: Violation[] = [];
  
  for (const imp of file.imports) {
    const importedModuleId = resolveImportToModule(imp.from, policy);
    
    if (!importedModuleId) {
      continue;
    }
    
    const importedModule = policy.modules[importedModuleId];
    
    if (!importedModule || !importedModule.forbidden_callers) {
      continue;
    }
    
    // Check if current module matches any forbidden_caller pattern
    for (const forbidden of importedModule.forbidden_callers) {
      if (matchPattern(moduleId, forbidden)) {
        violations.push({
          file: file.path,
          module: moduleId,
          type: 'forbidden_caller',
          message: `Module ${moduleId} calls ${importedModuleId} but is forbidden`,
          details: `Policy forbids: ${forbidden}`,
          target_module: importedModuleId,
          import_from: imp.from,
        });
      }
    }
  }
  
  return violations;
}

/**
 * Detect violations where a module calls another module without being in allowed_callers
 */
function detectMissingAllowedCallerViolations(
  file: FileData,
  moduleId: string,
  policy: Policy
): Violation[] {
  const violations: Violation[] = [];
  
  for (const imp of file.imports) {
    const importedModuleId = resolveImportToModule(imp.from, policy);
    
    if (!importedModuleId) {
      continue;
    }
    
    const importedModule = policy.modules[importedModuleId];
    
    if (!importedModule || !importedModule.allowed_callers) {
      continue;
    }
    
    // If allowed_callers is defined and non-empty, check if current module is allowed
    if (importedModule.allowed_callers.length > 0) {
      const isAllowed = importedModule.allowed_callers.some((allowed: string) =>
        matchPattern(moduleId, allowed)
      );
      
      if (!isAllowed) {
        violations.push({
          file: file.path,
          module: moduleId,
          type: 'missing_allowed_caller',
          message: `Module ${moduleId} calls ${importedModuleId} but is not in allowed_callers`,
          details: `Allowed callers: ${importedModule.allowed_callers.join(', ')}`,
          target_module: importedModuleId,
          import_from: imp.from,
        });
      }
    }
  }
  
  return violations;
}

/**
 * Detect violations where code accesses a gated module without the required feature flag
 */
function detectFeatureFlagViolations(
  file: FileData,
  moduleId: string,
  module: PolicyModule
): Violation[] {
  const violations: Violation[] = [];
  
  if (!module.feature_flags || module.feature_flags.length === 0) {
    return violations;
  }
  
  // Check if all required feature flags are present in the file
  for (const requiredFlag of module.feature_flags) {
    if (!file.feature_flags.includes(requiredFlag)) {
      violations.push({
        file: file.path,
        module: moduleId,
        type: 'feature_flag',
        message: `Module ${moduleId} requires feature flag '${requiredFlag}' but file does not check it`,
        details: `Required flags: ${module.feature_flags.join(', ')}`,
      });
    }
  }
  
  return violations;
}

/**
 * Detect violations where code accesses a protected module without the required permission
 */
function detectPermissionViolations(
  file: FileData,
  moduleId: string,
  module: PolicyModule
): Violation[] {
  const violations: Violation[] = [];
  
  if (!module.requires_permissions || module.requires_permissions.length === 0) {
    return violations;
  }
  
  // Check if all required permissions are present in the file
  for (const requiredPerm of module.requires_permissions) {
    if (!file.permissions.includes(requiredPerm)) {
      violations.push({
        file: file.path,
        module: moduleId,
        type: 'permission',
        message: `Module ${moduleId} requires permission '${requiredPerm}' but file does not check it`,
        details: `Required permissions: ${module.requires_permissions.join(', ')}`,
      });
    }
  }
  
  return violations;
}

/**
 * Detect kill pattern violations (anti-patterns being removed)
 */
function detectKillPatternViolations(
  file: FileData,
  moduleId: string,
  module: PolicyModule,
  policy: Policy
): Violation[] {
  const violations: Violation[] = [];
  
  // Check module-specific kill patterns
  if (module.kill_patterns) {
    for (const pattern of module.kill_patterns) {
      // Check if pattern appears in file warnings
      for (const warning of file.warnings) {
        if (warning.includes(pattern)) {
          violations.push({
            file: file.path,
            module: moduleId,
            type: 'kill_pattern',
            message: `Anti-pattern '${pattern}' found in module (scheduled for removal)`,
            details: warning,
          });
        }
      }
    }
  }
  
  // Check global kill patterns
  if (policy.global_kill_patterns) {
    for (const killPattern of policy.global_kill_patterns) {
      for (const warning of file.warnings) {
        if (warning.includes(killPattern.pattern)) {
          violations.push({
            file: file.path,
            module: moduleId,
            type: 'kill_pattern',
            message: `Global anti-pattern '${killPattern.pattern}' found`,
            details: `${killPattern.description}: ${warning}`,
          });
        }
      }
    }
  }
  
  return violations;
}

/**
 * Resolve a file path to its owning module ID
 */
function resolveFileToModule(filePath: string, policy: Policy): string | null {
  for (const [moduleId, module] of Object.entries(policy.modules) as [string, PolicyModule][]) {
    // Check owns_paths
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
 * Resolve an import path to its target module ID
 */
function resolveImportToModule(importPath: string, policy: Policy): string | null {
  // Try to match by namespace first (PHP style)
  for (const [moduleId, module] of Object.entries(policy.modules) as [string, PolicyModule][]) {
    if (module.owns_namespaces) {
      for (const namespace of module.owns_namespaces) {
        if (importPath.startsWith(namespace)) {
          return moduleId;
        }
      }
    }
  }
  
  // Try to match by file path pattern (TypeScript/JS style)
  for (const [moduleId, module] of Object.entries(policy.modules) as [string, PolicyModule][]) {
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
 * Match a value against a pattern (supports wildcards)
 * 
 * @param value - Value to match
 * @param pattern - Pattern with wildcards (* and **)
 * @param escapePaths - Whether to escape path separators (/)
 */
function matchPattern(value: string, pattern: string, escapePaths: boolean = false): boolean {
  // Simple pattern matching (supports ** and * wildcards)
  let regexPattern = pattern
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');
  
  if (escapePaths) {
    regexPattern = regexPattern.replace(/\//g, '\\/');
  }
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(value);
}

/**
 * Match a file path against a glob pattern
 */
function matchPath(filePath: string, pattern: string): boolean {
  return matchPattern(filePath, pattern, true);
}
