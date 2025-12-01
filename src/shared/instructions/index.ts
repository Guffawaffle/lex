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
  generateProjections,
  defaultFileReader,
  type ProjectionConfig,
  type ProjectionResult,
  type ProjectionAction,
  type HostType,
} from "./projection-engine.js";

export {
  loadCanonicalInstructions,
  computeHash,
  getDefaultCanonicalPath,
  type CanonicalResult,
} from "./canonical-loader.js";

export {
  wrapWithMarkers,
  extractMarkedContent,
  replaceMarkedContent,
  hasValidMarkers,
  LEX_BEGIN,
  LEX_END,
  type ExtractResult,
} from "./markers.js";
