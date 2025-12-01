/**
 * Instructions module
 *
 * Provides host detection and instructions generation utilities
 */

export {
  detectAvailableHosts,
  type HostDetectionResult,
  type HostTarget,
} from "./host-detection.js";

export {
  writeProjections,
  type ProjectionResult,
  type WriteOptions,
  type WriteResult,
  type WriteError,
} from "./file-writer.js";
