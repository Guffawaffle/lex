/**
 * Memory card image rendering
 * Generates high-contrast visual panels with Frame state for vision-token compression
 */

import { createCanvas, Canvas, CanvasRenderingContext2D } from 'canvas';
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

/**
 * Render a memory card image for a Frame
 * @param frame - The Frame to render
 * @param rawContext - Optional raw context (logs, diff snippets)
 * @returns PNG image buffer
 */
export async function renderMemoryCard(
  frame: Frame,
  rawContext?: string
): Promise<Buffer> {
  const options: RenderOptions = {
    dimensions: DEFAULT_DIMENSIONS,
    colorScheme: DARK_COLOR_SCHEME,
    fontConfig: MONOSPACE_FONT,
    rawContext,
  };

  return renderMemoryCardWithOptions(frame, options);
}

/**
 * Render a memory card with custom options
 */
export async function renderMemoryCardWithOptions(
  frame: Frame,
  options: RenderOptions
): Promise<Buffer> {
  const dimensions = options.dimensions || DEFAULT_DIMENSIONS;
  const colors = options.colorScheme || DARK_COLOR_SCHEME;
  const fonts = options.fontConfig || MONOSPACE_FONT;

  // Calculate dynamic height based on content
  const height = calculateCardHeight(frame, dimensions);
  const canvas = createCanvas(dimensions.width, height);
  const ctx = canvas.getContext('2d');

  // Fill background
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, dimensions.width, height);

  let y = dimensions.padding;

  // Render title
  y = renderTitle(ctx, frame, y, dimensions, colors, fonts);

  // Render metadata (timestamp, branch, jira)
  y = renderMetadata(ctx, frame, y, dimensions, colors, fonts);

  // Render summary caption
  y = renderSection(
    ctx,
    'SUMMARY',
    truncateText(frame.summary_caption, TEXT_LIMITS.summaryCaption),
    y,
    dimensions,
    colors,
    fonts
  );

  // Render reference point
  y = renderSection(
    ctx,
    'REFERENCE',
    truncateText(frame.reference_point, TEXT_LIMITS.referencePoint),
    y,
    dimensions,
    colors,
    fonts
  );

  // Render status snapshot
  y = renderStatusSnapshot(ctx, frame, y, dimensions, colors, fonts);

  // Render module scope
  y = renderModuleScope(ctx, frame, y, dimensions, colors, fonts);

  // Render keywords
  if (frame.keywords && frame.keywords.length > 0) {
    y = renderKeywords(ctx, frame, y, dimensions, colors, fonts);
  }

  // Render optional fields
  if (frame.atlas_frame_id) {
    y = renderSection(
      ctx,
      'ATLAS FRAME',
      frame.atlas_frame_id,
      y,
      dimensions,
      colors,
      fonts
    );
  }

  // Render raw context if provided
  if (options.rawContext) {
    y = renderRawContext(
      ctx,
      options.rawContext,
      y,
      dimensions,
      colors,
      fonts
    );
  }

  return canvas.toBuffer('image/png');
}

/**
 * Render the card title (Frame ID)
 */
function renderTitle(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  y: number,
  dimensions: CardDimensions,
  colors: ColorScheme,
  fonts: FontConfig
): number {
  ctx.font = `bold ${fonts.sizeTitle}px ${fonts.family}`;
  ctx.fillStyle = colors.heading;
  ctx.fillText(`FRAME: ${frame.id}`, dimensions.padding, y);
  return y + fonts.sizeTitle + dimensions.lineHeight;
}

/**
 * Render metadata section
 */
function renderMetadata(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  y: number,
  dimensions: CardDimensions,
  colors: ColorScheme,
  fonts: FontConfig
): number {
  ctx.font = `${fonts.sizeSmall}px ${fonts.family}`;
  ctx.fillStyle = colors.muted;

  const timestamp = new Date(frame.timestamp).toISOString();
  ctx.fillText(`Timestamp: ${timestamp}`, dimensions.padding, y);
  y += dimensions.lineHeight;

  ctx.fillText(`Branch: ${frame.branch}`, dimensions.padding, y);
  y += dimensions.lineHeight;

  if (frame.jira) {
    ctx.fillText(`Jira: ${frame.jira}`, dimensions.padding, y);
    y += dimensions.lineHeight;
  }

  // Divider
  y += dimensions.lineHeight / 2;
  ctx.strokeStyle = colors.muted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(dimensions.padding, y);
  ctx.lineTo(dimensions.width - dimensions.padding, y);
  ctx.stroke();
  y += dimensions.lineHeight;

  return y;
}

/**
 * Render a section with heading and content
 */
function renderSection(
  ctx: CanvasRenderingContext2D,
  heading: string,
  content: string,
  y: number,
  dimensions: CardDimensions,
  colors: ColorScheme,
  fonts: FontConfig
): number {
  // Heading
  ctx.font = `bold ${fonts.sizeHeading}px ${fonts.family}`;
  ctx.fillStyle = colors.accent;
  ctx.fillText(heading, dimensions.padding, y);
  y += fonts.sizeHeading + 8;

  // Content
  ctx.font = `${fonts.sizeBody}px ${fonts.family}`;
  ctx.fillStyle = colors.text;

  const maxWidth = dimensions.width - dimensions.padding * 2;
  const charWidth = fonts.sizeBody * 0.6; // Approximate monospace char width
  const lines = wrapText(content, maxWidth, charWidth);

  for (const line of lines) {
    ctx.fillText(line, dimensions.padding, y);
    y += dimensions.lineHeight;
  }

  y += dimensions.lineHeight / 2;
  return y;
}

/**
 * Render status snapshot section
 */
function renderStatusSnapshot(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  y: number,
  dimensions: CardDimensions,
  colors: ColorScheme,
  fonts: FontConfig
): number {
  // Section heading
  ctx.font = `bold ${fonts.sizeHeading}px ${fonts.family}`;
  ctx.fillStyle = colors.accent;
  ctx.fillText('STATUS', dimensions.padding, y);
  y += fonts.sizeHeading + 8;

  // Next action
  ctx.font = `${fonts.sizeBody}px ${fonts.family}`;
  ctx.fillStyle = colors.text;
  ctx.fillText('Next Action:', dimensions.padding, y);
  y += dimensions.lineHeight;

  const nextAction = truncateText(
    frame.status_snapshot.next_action,
    TEXT_LIMITS.nextAction
  );
  const maxWidth = dimensions.width - dimensions.padding * 2 - 20;
  const charWidth = fonts.sizeBody * 0.6;
  const lines = wrapText(nextAction, maxWidth, charWidth);

  for (const line of lines) {
    ctx.fillText(`  ${line}`, dimensions.padding, y);
    y += dimensions.lineHeight;
  }

  // Blockers
  if (
    frame.status_snapshot.blockers &&
    frame.status_snapshot.blockers.length > 0
  ) {
    y += dimensions.lineHeight / 2;
    ctx.fillStyle = colors.warning;
    ctx.fillText('Blockers:', dimensions.padding, y);
    y += dimensions.lineHeight;

    ctx.fillStyle = colors.text;
    const blockers = frame.status_snapshot.blockers.slice(
      0,
      TEXT_LIMITS.maxBlockers
    );
    for (const blocker of blockers) {
      const truncated = truncateText(blocker, TEXT_LIMITS.blockerItem);
      ctx.fillText(`  • ${truncated}`, dimensions.padding, y);
      y += dimensions.lineHeight;
    }
  }

  // Merge blockers
  if (
    frame.status_snapshot.merge_blockers &&
    frame.status_snapshot.merge_blockers.length > 0
  ) {
    y += dimensions.lineHeight / 2;
    ctx.fillStyle = colors.error;
    ctx.fillText('Merge Blockers:', dimensions.padding, y);
    y += dimensions.lineHeight;

    ctx.fillStyle = colors.text;
    const mergeBlockers = frame.status_snapshot.merge_blockers.slice(
      0,
      TEXT_LIMITS.maxBlockers
    );
    for (const blocker of mergeBlockers) {
      const truncated = truncateText(blocker, TEXT_LIMITS.blockerItem);
      ctx.fillText(`  • ${truncated}`, dimensions.padding, y);
      y += dimensions.lineHeight;
    }
  }

  // Tests failing
  if (
    frame.status_snapshot.tests_failing &&
    frame.status_snapshot.tests_failing.length > 0
  ) {
    y += dimensions.lineHeight / 2;
    ctx.fillStyle = colors.error;
    ctx.fillText('Tests Failing:', dimensions.padding, y);
    y += dimensions.lineHeight;

    ctx.fillStyle = colors.text;
    const tests = frame.status_snapshot.tests_failing.slice(
      0,
      TEXT_LIMITS.maxBlockers
    );
    for (const test of tests) {
      const truncated = truncateText(test, TEXT_LIMITS.blockerItem);
      ctx.fillText(`  • ${truncated}`, dimensions.padding, y);
      y += dimensions.lineHeight;
    }
  }

  y += dimensions.lineHeight / 2;
  return y;
}

/**
 * Render module scope section
 */
function renderModuleScope(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  y: number,
  dimensions: CardDimensions,
  colors: ColorScheme,
  fonts: FontConfig
): number {
  ctx.font = `bold ${fonts.sizeHeading}px ${fonts.family}`;
  ctx.fillStyle = colors.accent;
  ctx.fillText('MODULE SCOPE', dimensions.padding, y);
  y += fonts.sizeHeading + 8;

  ctx.font = `${fonts.sizeBody}px ${fonts.family}`;
  ctx.fillStyle = colors.text;

  const modules = frame.module_scope.join(', ');
  const maxWidth = dimensions.width - dimensions.padding * 2;
  const charWidth = fonts.sizeBody * 0.6;
  const lines = wrapText(modules, maxWidth, charWidth);

  for (const line of lines) {
    ctx.fillText(line, dimensions.padding, y);
    y += dimensions.lineHeight;
  }

  y += dimensions.lineHeight / 2;
  return y;
}

/**
 * Render keywords section
 */
function renderKeywords(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  y: number,
  dimensions: CardDimensions,
  colors: ColorScheme,
  fonts: FontConfig
): number {
  ctx.font = `bold ${fonts.sizeHeading}px ${fonts.family}`;
  ctx.fillStyle = colors.accent;
  ctx.fillText('KEYWORDS', dimensions.padding, y);
  y += fonts.sizeHeading + 8;

  ctx.font = `${fonts.sizeBody}px ${fonts.family}`;
  ctx.fillStyle = colors.muted;

  const keywords = frame.keywords!.slice(0, TEXT_LIMITS.maxKeywords).join(', ');
  ctx.fillText(keywords, dimensions.padding, y);
  y += dimensions.lineHeight * 1.5;

  return y;
}

/**
 * Render raw context section
 */
function renderRawContext(
  ctx: CanvasRenderingContext2D,
  rawContext: string,
  y: number,
  dimensions: CardDimensions,
  colors: ColorScheme,
  fonts: FontConfig
): number {
  y += dimensions.lineHeight;

  ctx.font = `bold ${fonts.sizeHeading}px ${fonts.family}`;
  ctx.fillStyle = colors.accent;
  ctx.fillText('RAW CONTEXT', dimensions.padding, y);
  y += fonts.sizeHeading + 8;

  ctx.font = `${fonts.sizeSmall}px ${fonts.family}`;
  ctx.fillStyle = colors.muted;

  const maxWidth = dimensions.width - dimensions.padding * 2;
  const charWidth = fonts.sizeSmall * 0.6;
  const lines = wrapText(truncateText(rawContext, 500), maxWidth, charWidth);

  for (const line of lines.slice(0, 10)) {
    // Max 10 lines of context
    ctx.fillText(line, dimensions.padding, y);
    y += dimensions.lineHeight * 0.8;
  }

  return y;
}
