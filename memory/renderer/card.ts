/**
 * Memory card image rendering (Sharp + SVG)
 * Generates high-contrast visual panels with Frame state for vision-token compression
 *
 * Uses SVG for layout/styling and Sharp for PNG conversion (no system dependencies)
 */

import sharp from 'sharp';
import type { Frame } from '../frames/types.js';
import {
  DEFAULT_DIMENSIONS,
  DARK_COLOR_SCHEME,
  MONOSPACE_FONT,
  TEXT_LIMITS,
  truncateText,
  wrapText,
  calculateCardHeight,
  type CardDimensions,
  type ColorScheme,
  type FontConfig,
} from './templates.js';

export interface RenderOptions {
  dimensions?: CardDimensions;
  colorScheme?: ColorScheme;
  fontConfig?: FontConfig;
  rawContext?: string;
}

// Stub implementation - real implementation in dist/renderer/card.js
export async function renderMemoryCard(
  frame: Frame,
  rawContext?: string
): Promise<Buffer> {
  throw new Error('Not implemented - use compiled version in dist/');
}

export async function renderMemoryCardWithOptions(
  frame: Frame,
  options: RenderOptions
): Promise<Buffer> {
  throw new Error('Not implemented - use compiled version in dist/');
}
