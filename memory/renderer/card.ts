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
import { highlightDiff } from './syntax.js';
import { renderDiff, getDiffStats, type TruncationOptions } from './diff.js';
import type { BundledLanguage } from 'shiki';

export interface RenderOptions {
  dimensions?: CardDimensions;
  colorScheme?: ColorScheme;
  fontConfig?: FontConfig;
  rawContext?: string;
}

/**
 * Extract code diffs from raw context string
 * Looks for diff blocks in the context
 */
function extractDiffs(rawContext: string): Array<{
  diff: string;
  language: BundledLanguage;
}> {
  const diffs: Array<{ diff: string; language: BundledLanguage }> = [];
  
  // Detect unified diff format: lines starting with +, -, or space (for context)
  // Must have at least one + or - line to be considered a diff
  const lines = rawContext.split('\n');
  let currentDiff: string[] = [];
  let inDiff = false;
  let hasChanges = false; // Track if current block has actual changes
  
  for (const line of lines) {
    const firstChar = line[0];
    
    // Check for diff markers at the start of the line (not trimmed)
    const isDiffLine = firstChar === '+' || firstChar === '-' || 
                       (firstChar === ' ' && inDiff); // Space only counts if already in diff
    
    if (isDiffLine) {
      if (!inDiff) {
        inDiff = true;
        currentDiff = [];
        hasChanges = false;
      }
      
      // Track if we have actual changes (not just context)
      if (firstChar === '+' || firstChar === '-') {
        hasChanges = true;
      }
      
      currentDiff.push(line);
    } else if (inDiff && currentDiff.length > 0) {
      // End of diff block - only add if it has actual changes
      if (hasChanges) {
        diffs.push({
          diff: currentDiff.join('\n'),
          language: 'typescript', // Default to TypeScript
        });
      }
      currentDiff = [];
      inDiff = false;
      hasChanges = false;
    }
  }
  
  // Add remaining diff if any and has changes
  if (currentDiff.length > 0 && hasChanges) {
    diffs.push({
      diff: currentDiff.join('\n'),
      language: 'typescript',
    });
  }
  
  return diffs;
}

/**
 * Generate SVG content for the memory card
 */
async function generateSVG(
  frame: Frame,
  options: Required<RenderOptions>
): Promise<string> {
  const { dimensions, colorScheme, fontConfig, rawContext } = options;
  const dynamicHeight = calculateCardHeight(frame, dimensions);
  
  let yOffset = dimensions.padding;
  const lineHeight = dimensions.lineHeight;
  
  const svgParts: string[] = [];
  
  // SVG header
  svgParts.push(
    `<svg width="${dimensions.width}" height="${dynamicHeight}" xmlns="http://www.w3.org/2000/svg">`
  );
  
  // Background
  svgParts.push(
    `<rect width="100%" height="100%" fill="${colorScheme.background}"/>`
  );
  
  // Title
  svgParts.push(
    `<text x="${dimensions.padding}" y="${yOffset}" font-family="${fontConfig.family}" font-size="${fontConfig.sizeTitle}" fill="${colorScheme.heading}" font-weight="bold">Memory Card: ${escapeXml(frame.id.substring(0, 20))}</text>`
  );
  yOffset += lineHeight * 1.5;
  
  // Timestamp and Branch
  svgParts.push(
    `<text x="${dimensions.padding}" y="${yOffset}" font-family="${fontConfig.family}" font-size="${fontConfig.sizeSmall}" fill="${colorScheme.muted}">${escapeXml(new Date(frame.timestamp).toLocaleString())}</text>`
  );
  yOffset += lineHeight;
  
  svgParts.push(
    `<text x="${dimensions.padding}" y="${yOffset}" font-family="${fontConfig.family}" font-size="${fontConfig.sizeBody}" fill="${colorScheme.accent}">Branch: ${escapeXml(frame.branch)}</text>`
  );
  yOffset += lineHeight * 1.5;
  
  // Divider
  svgParts.push(
    `<line x1="${dimensions.padding}" y1="${yOffset}" x2="${dimensions.width - dimensions.padding}" y2="${yOffset}" stroke="${colorScheme.muted}" stroke-width="1"/>`
  );
  yOffset += lineHeight;
  
  // Summary Caption
  const summaryText = truncateText(frame.summary_caption, TEXT_LIMITS.summaryCaption);
  svgParts.push(
    `<text x="${dimensions.padding}" y="${yOffset}" font-family="${fontConfig.family}" font-size="${fontConfig.sizeBody}" fill="${colorScheme.text}">${escapeXml(summaryText)}</text>`
  );
  yOffset += lineHeight * 1.5;
  
  // Reference Point
  svgParts.push(
    `<text x="${dimensions.padding}" y="${yOffset}" font-family="${fontConfig.family}" font-size="${fontConfig.sizeSmall}" fill="${colorScheme.muted}">Ref: ${escapeXml(truncateText(frame.reference_point, TEXT_LIMITS.referencePoint))}</text>`
  );
  yOffset += lineHeight * 1.5;
  
  // Status Snapshot
  svgParts.push(
    `<text x="${dimensions.padding}" y="${yOffset}" font-family="${fontConfig.family}" font-size="${fontConfig.sizeHeading}" fill="${colorScheme.heading}" font-weight="bold">Status</text>`
  );
  yOffset += lineHeight;
  
  const nextAction = truncateText(frame.status_snapshot.next_action, TEXT_LIMITS.nextAction);
  svgParts.push(
    `<text x="${dimensions.padding}" y="${yOffset}" font-family="${fontConfig.family}" font-size="${fontConfig.sizeBody}" fill="${colorScheme.text}">Next: ${escapeXml(nextAction)}</text>`
  );
  yOffset += lineHeight * 1.5;
  
  // Code Diffs (if present in raw context)
  if (rawContext) {
    const diffs = extractDiffs(rawContext);
    
    if (diffs.length > 0) {
      svgParts.push(
        `<text x="${dimensions.padding}" y="${yOffset}" font-family="${fontConfig.family}" font-size="${fontConfig.sizeHeading}" fill="${colorScheme.heading}" font-weight="bold">Recent Changes</text>`
      );
      yOffset += lineHeight;
      
      for (const { diff, language } of diffs.slice(0, 2)) { // Limit to 2 diffs
        // Apply smart truncation
        const truncatedDiff = renderDiff(diff, { maxLines: 20, contextLines: 2 });
        const stats = getDiffStats(diff);
        
        // Show diff stats
        svgParts.push(
          `<text x="${dimensions.padding}" y="${yOffset}" font-family="${fontConfig.family}" font-size="${fontConfig.sizeSmall}" fill="${colorScheme.muted}">+${stats.additions} -${stats.deletions}</text>`
        );
        yOffset += lineHeight;
        
        // Render diff lines (simplified for SVG - no full syntax highlighting in SVG)
        const diffLines = truncatedDiff.split('\n').slice(0, 15); // Limit lines
        for (const line of diffLines) {
          let color = colorScheme.text;
          if (line.startsWith('+')) {
            color = colorScheme.diffAddition;
          } else if (line.startsWith('-')) {
            color = colorScheme.diffDeletion;
          } else if (line.includes('lines omitted') || line.includes('more lines')) {
            color = colorScheme.diffContext;
          }
          
          svgParts.push(
            `<text x="${dimensions.padding + 10}" y="${yOffset}" font-family="${fontConfig.family}" font-size="${fontConfig.sizeSmall}" fill="${color}">${escapeXml(line.substring(0, 80))}</text>`
          );
          yOffset += lineHeight * 0.8;
        }
        
        yOffset += lineHeight * 0.5;
      }
    }
  }
  
  // Close SVG
  svgParts.push('</svg>');
  
  return svgParts.join('\n');
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Render memory card as PNG image
 */
export async function renderMemoryCard(
  frame: Frame,
  rawContext?: string
): Promise<Buffer> {
  return renderMemoryCardWithOptions(frame, { rawContext });
}

/**
 * Render memory card with custom options
 */
export async function renderMemoryCardWithOptions(
  frame: Frame,
  options: RenderOptions
): Promise<Buffer> {
  // Merge with defaults
  const fullOptions: Required<RenderOptions> = {
    dimensions: options.dimensions || DEFAULT_DIMENSIONS,
    colorScheme: options.colorScheme || DARK_COLOR_SCHEME,
    fontConfig: options.fontConfig || MONOSPACE_FONT,
    rawContext: options.rawContext || '',
  };
  
  // Generate SVG
  const svg = await generateSVG(frame, fullOptions);
  
  // Convert SVG to PNG using Sharp
  const buffer = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();
  
  return buffer;
}
