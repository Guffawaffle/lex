/**
 * Memory card rendering utilities
 * Export rendering functions and templates
 */

export { renderMemoryCard, renderMemoryCardWithOptions } from "./card.js";
export type { RenderOptions } from "./card.js";

export {
  DEFAULT_DIMENSIONS,
  DARK_COLOR_SCHEME,
  MONOSPACE_FONT,
  TEXT_LIMITS,
  truncateText,
  wrapText,
  calculateCardHeight,
} from "./templates.js";

export type { CardDimensions, ColorScheme, FontConfig } from "./templates.js";

export { renderAtlasFrameGraph, exportGraphAsPNG } from "./graph.js";
export type { GraphRenderOptions, GraphNode, GraphEdgeRenderable } from "./graph.js";

export { forceDirectedLayout, hierarchicalLayout, circularLayout } from "./layouts.js";
export type { Layout, LayoutConfig } from "./layouts.js";

export {
  highlightCode,
  highlightDiff,
  detectLanguageFromExtension,
  isLanguageSupported,
  SUPPORTED_LANGUAGES,
} from "./syntax.js";

export type { SupportedLanguage } from "./syntax.js";

export { parseDiff, truncateDiff, formatDiff, renderDiff, getDiffStats } from "./diff.js";

export type { DiffLine, DiffBlock, TruncationOptions, DiffStats } from "./diff.js";
