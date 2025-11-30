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
  loadCanonicalInstructions,
  DEFAULT_CANONICAL_PATH,
  type CanonicalResult,
} from "./canonical-loader.js";
