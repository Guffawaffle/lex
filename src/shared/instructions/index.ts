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
  LEX_BEGIN,
  LEX_END,
  wrapWithMarkers,
  extractMarkedContent,
  replaceMarkedContent,
  type ExtractedContent,
} from "./markers.js";
