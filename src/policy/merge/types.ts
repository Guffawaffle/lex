/**
 * Type definitions for scanner output merge logic
 *
 * These types define the structure of scanner outputs and the merged result
 * used by the LexMap merge tool to combine multiple language scanner outputs.
 */

/**
 * Declaration found in a source file (class, function, interface, etc.)
 */
export interface Declaration {
  type: string;
  name: string;
  namespace?: string;
}

/**
 * Import statement found in a source file
 */
export interface Import {
  from: string;
  type: string;
  imported?: string[];
  alias?: string | null;
}

/**
 * File data extracted by a scanner
 */
export interface FileData {
  path: string;
  declarations: Declaration[];
  imports: Import[];
  feature_flags: string[];
  permissions: string[];
  warnings: string[];
}

/**
 * Output from a single language scanner
 */
export interface ScanResult {
  language: string;
  files: FileData[];
}

/**
 * Edge representing a call relationship between modules
 * caller -> callee
 */
export interface ModuleEdge {
  /** Module ID of the caller (source) */
  from: string;
  /** Module ID of the callee (target) */
  to: string;
  /** File path where the call originates */
  source_file?: string;
  /** Import statement that creates this edge */
  import_from?: string;
}

/**
 * Aggregated observations for a module
 */
export interface ModuleObservations {
  /** Module ID */
  module_id: string;
  /** Files owned by this module */
  files: string[];
  /** Feature flags observed in this module's code */
  feature_flags: string[];
  /** Permissions observed in this module's code */
  permissions: string[];
}

/**
 * Result of merging multiple scanner outputs
 */
export interface MergedScanResult {
  /** Version of the merge format */
  version: string;
  /** List of scanner languages that were merged */
  sources: string[];
  /** All files from all scanners (deduplicated by path) */
  files: FileData[];
  /** Module edges (caller -> callee relationships) */
  edges: ModuleEdge[];
  /** Aggregated module observations */
  modules?: ModuleObservations[];
  /** Warnings or conflicts encountered during merge */
  warnings: string[];
}

/**
 * Conflict when multiple scanners claim ownership of the same file
 */
export interface FileConflict {
  file_path: string;
  languages: string[];
}
