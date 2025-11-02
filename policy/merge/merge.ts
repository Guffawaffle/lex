/**
 * Scanner output merge logic
 * 
 * Combines multiple language scanner outputs into a single unified view.
 * Handles deduplication, conflict detection, and edge aggregation.
 */

import {
  ScanResult,
  MergedScanResult,
  FileData,
  ModuleEdge,
  FileConflict,
} from './types.js';

/**
 * Merges multiple scanner outputs into a single unified result
 * 
 * @param scanOutputs - Array of scanner outputs to merge
 * @returns Merged scan result with deduplicated files and edges
 * @throws Error if file conflicts are detected (same file claimed by multiple scanners)
 */
export function mergeScans(scanOutputs: ScanResult[]): MergedScanResult {
  const version = '1.0.0';
  const sources: string[] = [];
  const fileMap = new Map<string, { file: FileData; language: string }>();
  const edgeSet = new Set<string>();
  const edges: ModuleEdge[] = [];
  const warnings: string[] = [];
  const conflicts: FileConflict[] = [];

  // Process each scanner output
  for (const scanner of scanOutputs) {
    if (!scanner.language || !Array.isArray(scanner.files)) {
      warnings.push(`Invalid scanner output: missing language or files array`);
      continue;
    }

    sources.push(scanner.language);

    // Process files from this scanner
    for (const file of scanner.files) {
      const existingEntry = fileMap.get(file.path);

      if (existingEntry) {
        // File already seen - check for conflict
        if (existingEntry.language !== scanner.language) {
          // Different scanner claiming same file - this is a conflict
          const existingConflict = conflicts.find(c => c.file_path === file.path);
          if (existingConflict) {
            if (!existingConflict.languages.includes(scanner.language)) {
              existingConflict.languages.push(scanner.language);
            }
          } else {
            conflicts.push({
              file_path: file.path,
              languages: [existingEntry.language, scanner.language],
            });
          }

          // Merge metadata from both files
          const existingFile = existingEntry.file;
          existingFile.feature_flags = [
            ...new Set([...existingFile.feature_flags, ...file.feature_flags]),
          ].sort();
          existingFile.permissions = [
            ...new Set([...existingFile.permissions, ...file.permissions]),
          ].sort();
          existingFile.warnings = [
            ...new Set([...existingFile.warnings, ...file.warnings]),
          ];
          existingFile.declarations = [
            ...existingFile.declarations,
            ...file.declarations,
          ];
          existingFile.imports = [
            ...existingFile.imports,
            ...file.imports,
          ];
        } else {
          // Same scanner reporting same file multiple times - merge metadata
          const existingFile = existingEntry.file;
          existingFile.feature_flags = [
            ...new Set([...existingFile.feature_flags, ...file.feature_flags]),
          ].sort();
          existingFile.permissions = [
            ...new Set([...existingFile.permissions, ...file.permissions]),
          ].sort();
          existingFile.warnings = [
            ...new Set([...existingFile.warnings, ...file.warnings]),
          ];
        }
      } else {
        // New file - add to map
        fileMap.set(file.path, { file: { ...file }, language: scanner.language });
      }

      // Extract edges from imports (these are file-level edges, not module-level yet)
      // Module resolution would happen in a separate step with policy file
      for (const imp of file.imports) {
        // Create a simple edge based on import
        // Note: This creates file-to-file edges, not module-to-module
        // Module resolution requires the policy file (lexmap.policy.json)
        const edgeKey = `${file.path}|||${imp.from}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          edges.push({
            from: file.path,
            to: imp.from,
            source_file: file.path,
            import_from: imp.from,
          });
        }
      }
    }
  }

  // Report conflicts as errors
  if (conflicts.length > 0) {
    const conflictMessages = conflicts.map(
      c => `File "${c.file_path}" claimed by multiple scanners: ${c.languages.join(', ')}`
    );
    throw new Error(
      `File ownership conflicts detected:\n${conflictMessages.join('\n')}\n\n` +
      `Each file should be scanned by exactly one language scanner.`
    );
  }

  // Extract files from map
  const files = Array.from(fileMap.values())
    .map(entry => entry.file)
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    version,
    sources: [...new Set(sources)].sort(),
    files,
    edges,
    warnings,
  };
}

/**
 * Deduplicates edges by creating a canonical key for each edge
 * 
 * @param edges - Array of edges to deduplicate
 * @returns Deduplicated array of edges
 */
export function deduplicateEdges(edges: ModuleEdge[]): ModuleEdge[] {
  const edgeMap = new Map<string, ModuleEdge>();

  for (const edge of edges) {
    // Create canonical key: from -> to
    const key = `${edge.from}|||${edge.to}`;
    
    if (!edgeMap.has(key)) {
      edgeMap.set(key, edge);
    }
    // If edge already exists, we keep the first one (edges are equivalent)
  }

  return Array.from(edgeMap.values());
}

/**
 * Validates that scanner outputs are well-formed
 * 
 * @param scanOutputs - Array of scanner outputs to validate
 * @returns Object with validation result and any errors
 */
export function validateScanOutputs(scanOutputs: ScanResult[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!Array.isArray(scanOutputs)) {
    errors.push('scanOutputs must be an array');
    return { valid: false, errors };
  }

  if (scanOutputs.length === 0) {
    // Empty is valid - return empty merge result
    return { valid: true, errors: [] };
  }

  for (let i = 0; i < scanOutputs.length; i++) {
    const scanner = scanOutputs[i];
    
    if (typeof scanner !== 'object' || scanner === null) {
      errors.push(`Scanner output at index ${i} is not an object`);
      continue;
    }

    if (typeof scanner.language !== 'string' || scanner.language.trim() === '') {
      errors.push(`Scanner output at index ${i} missing or invalid 'language' field`);
    }

    if (!Array.isArray(scanner.files)) {
      errors.push(`Scanner output at index ${i} missing or invalid 'files' array`);
      continue;
    }

    // Validate each file
    for (let j = 0; j < scanner.files.length; j++) {
      const file = scanner.files[j];
      
      if (typeof file.path !== 'string') {
        errors.push(`Scanner ${i}, file ${j}: missing or invalid 'path' field`);
      }

      if (!Array.isArray(file.declarations)) {
        errors.push(`Scanner ${i}, file ${j}: missing or invalid 'declarations' array`);
      }

      if (!Array.isArray(file.imports)) {
        errors.push(`Scanner ${i}, file ${j}: missing or invalid 'imports' array`);
      }

      if (!Array.isArray(file.feature_flags)) {
        errors.push(`Scanner ${i}, file ${j}: missing or invalid 'feature_flags' array`);
      }

      if (!Array.isArray(file.permissions)) {
        errors.push(`Scanner ${i}, file ${j}: missing or invalid 'permissions' array`);
      }

      if (!Array.isArray(file.warnings)) {
        errors.push(`Scanner ${i}, file ${j}: missing or invalid 'warnings' array`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
