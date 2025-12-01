/**
 * Instructions module
 *
 * Provides host detection, projection engine, and file writing utilities
 * for generating IDE-specific instruction files from canonical source.
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
  writeProjections,
  type FileProjection,
  type WriteOptions,
  type WriteResult,
  type WriteError,
} from "./file-writer.js";

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
