/**
 * Memory card rendering utilities
 * Export rendering functions and templates
 */

export { renderMemoryCard, renderMemoryCardWithOptions } from './card.js';
export type { RenderOptions } from './card.js';

export {
  DEFAULT_DIMENSIONS,
  DARK_COLOR_SCHEME,
  MONOSPACE_FONT,
  TEXT_LIMITS,
  truncateText,
  wrapText,
  calculateCardHeight,
} from './templates.js';

export type {
  CardDimensions,
  ColorScheme,
  FontConfig,
} from './templates.js';
