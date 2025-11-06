/**
 * Graph rendering for Atlas Frames
 * Generates SVG visualizations showing module nodes, dependency edges,
 * and visual indicators for allowed vs forbidden connections.
 */

// Use inline types to avoid cross-package type dependencies that violate rootDir
export interface AtlasModule {
  id: string;
  coords?: [number, number];
  owns_paths?: string[];
  owns_namespaces?: string[];
  allowed_callers?: string[];
  forbidden_callers?: string[];
  feature_flags?: string[];
  requires_permissions?: string[];
  kill_patterns?: string[];
  notes?: string;
}

export interface AtlasEdge {
  from: string;
  to: string;
  allowed: boolean;
  reason?: string;
}

export interface AtlasFrame {
  atlas_timestamp: string;
  seed_modules: string[];
  fold_radius: number;
  modules: AtlasModule[];
  edges: AtlasEdge[];
  critical_rule: string;
}

import { forceDirectedLayout, hierarchicalLayout, type Layout, type LayoutConfig } from './layouts.js';

export interface GraphRenderOptions {
  width?: number;
  height?: number;
  layout?: 'force-directed' | 'hierarchical';
  layoutConfig?: LayoutConfig;
  showTooltips?: boolean;
  nodeColors?: Record<string, string>;
}

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  radius: number;
  isSeed: boolean;
  module: AtlasModule;
}

export interface GraphEdgeRenderable {
  from: GraphNode;
  to: GraphNode;
  allowed: boolean;
  reason?: string;
}

const DEFAULT_OPTIONS: Required<GraphRenderOptions> = {
  width: 800,
  height: 600,
  layout: 'force-directed',
  layoutConfig: {},
  showTooltips: true,
  nodeColors: {},
};

// Module type detection based on ID patterns
function detectModuleType(moduleId: string): string {
  const lower = moduleId.toLowerCase();
  if (lower.includes('ui/') || lower.includes('component')) return 'component';
  if (lower.includes('api/') || lower.includes('service')) return 'service';
  if (lower.includes('util') || lower.includes('helper')) return 'util';
  if (lower.includes('backend') || lower.includes('core')) return 'core';
  if (lower.includes('database') || lower.includes('db')) return 'database';
  return 'default';
}

// Color mapping for different module types
const MODULE_TYPE_COLORS: Record<string, string> = {
  component: '#4CAF50',
  service: '#2196F3',
  util: '#FF9800',
  core: '#9C27B0',
  database: '#795548',
  default: '#607D8B',
};

// Constants for rendering
const MAX_LABEL_LENGTH = 20;
const LABEL_TRUNCATE_AT = 17;
const MIN_DISTANCE_THRESHOLD = 0.1;
const WARNING_ICON = '\u26A0\uFE0F'; // ⚠️ as Unicode

/**
 * Calculate node size based on number of dependencies
 */
function calculateNodeRadius(module: AtlasModule, edges: AtlasEdge[]): number {
  const minRadius = 20;
  const maxRadius = 50;
  const baseRadius = 30;
  
  // Count incoming and outgoing edges
  const edgeCount = edges.filter(
    e => e.from === module.id || e.to === module.id
  ).length;
  
  // Scale radius based on edge count (logarithmic scaling)
  const scaledRadius = baseRadius + Math.log(edgeCount + 1) * 5;
  return Math.min(maxRadius, Math.max(minRadius, scaledRadius));
}

/**
 * Render Atlas Frame as SVG graph
 */
export function renderAtlasFrameGraph(
  atlasFrame: AtlasFrame,
  options: GraphRenderOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Create graph nodes
  const nodes: GraphNode[] = atlasFrame.modules.map(module => {
    const radius = calculateNodeRadius(module, atlasFrame.edges);
    const isSeed = atlasFrame.seed_modules.includes(module.id);
    
    return {
      id: module.id,
      x: module.coords?.[0] ?? 0,
      y: module.coords?.[1] ?? 0,
      radius,
      isSeed,
      module,
    };
  });
  
  // Apply layout algorithm
  const layout: Layout = opts.layout === 'hierarchical'
    ? hierarchicalLayout(nodes, atlasFrame.edges, opts.layoutConfig)
    : forceDirectedLayout(nodes, atlasFrame.edges, opts.layoutConfig);
  
  // Scale to fit canvas
  scaleToFit(layout.nodes, opts.width, opts.height);
  
  // Build edges with positioned nodes
  const nodeMap = new Map(layout.nodes.map(n => [n.id, n]));
  const edges: GraphEdgeRenderable[] = [];
  for (const edge of atlasFrame.edges) {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (from && to) {
      edges.push({ from, to, allowed: edge.allowed, reason: edge.reason });
    }
  }
  
  // Generate SVG
  return generateSVG(layout.nodes, edges, opts);
}

/**
 * Scale nodes to fit within canvas bounds
 */
function scaleToFit(nodes: GraphNode[], width: number, height: number): void {
  if (nodes.length === 0) return;
  
  const padding = 60;
  const availableWidth = width - 2 * padding;
  const availableHeight = height - 2 * padding;
  
  // Find current bounds
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.radius);
    maxX = Math.max(maxX, node.x + node.radius);
    minY = Math.min(minY, node.y - node.radius);
    maxY = Math.max(maxY, node.y + node.radius);
  }
  
  const currentWidth = maxX - minX;
  const currentHeight = maxY - minY;
  
  // Calculate scale factor
  const scaleX = currentWidth > 0 ? availableWidth / currentWidth : 1;
  const scaleY = currentHeight > 0 ? availableHeight / currentHeight : 1;
  const scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down
  
  // Apply scaling and centering
  for (const node of nodes) {
    node.x = (node.x - minX) * scale + padding;
    node.y = (node.y - minY) * scale + padding;
  }
}

/**
 * Generate SVG markup
 */
function generateSVG(
  nodes: GraphNode[],
  edges: GraphEdgeRenderable[],
  options: Required<GraphRenderOptions>
): string {
  const { width, height, showTooltips, nodeColors } = options;
  
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  
  // Add styles
  svg += `
  <defs>
    <style>
      .node { cursor: pointer; }
      .node:hover { opacity: 0.8; }
      .edge-allowed { stroke: #4CAF50; fill: none; }
      .edge-forbidden { stroke: #F44336; fill: none; stroke-dasharray: 5,5; }
      .node-label { 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        fill: #333;
        text-anchor: middle;
        pointer-events: none;
      }
      .tooltip {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 11px;
        fill: white;
        pointer-events: none;
      }
      .tooltip-bg {
        fill: rgba(0, 0, 0, 0.8);
        rx: 4;
      }
    </style>
    
    <!-- Arrow markers for edges -->
    <marker id="arrow-allowed" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="#4CAF50" />
    </marker>
    <marker id="arrow-forbidden" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="#F44336" />
    </marker>
  </defs>
  `;
  
  // Add background
  svg += `<rect width="${width}" height="${height}" fill="#f5f5f5"/>`;
  
  // Render edges first (so they appear below nodes)
  svg += '<g id="edges">';
  for (const edge of edges) {
    svg += renderEdge(edge);
  }
  svg += '</g>';
  
  // Render nodes
  svg += '<g id="nodes">';
  for (const node of nodes) {
    const color = nodeColors[node.id] || MODULE_TYPE_COLORS[detectModuleType(node.id)];
    svg += renderNode(node, color, showTooltips);
  }
  svg += '</g>';
  
  svg += '</svg>';
  return svg;
}

/**
 * Render a single edge
 */
function renderEdge(edge: GraphEdgeRenderable): string {
  const { from, to, allowed } = edge;
  
  // Calculate edge endpoints at circle boundaries
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance === 0) return '';
  
  // Offset from and to points by node radius
  const offsetX = (dx / distance);
  const offsetY = (dy / distance);
  
  const x1 = from.x + offsetX * from.radius;
  const y1 = from.y + offsetY * from.radius;
  const x2 = to.x - offsetX * to.radius;
  const y2 = to.y - offsetY * to.radius;
  
  const className = allowed ? 'edge-allowed' : 'edge-forbidden';
  const marker = allowed ? 'url(#arrow-allowed)' : 'url(#arrow-forbidden)';
  const strokeWidth = 2;
  
  let svg = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" `;
  svg += `class="${className}" stroke-width="${strokeWidth}" marker-end="${marker}">`;
  
  // Add title for tooltip
  if (edge.reason) {
    svg += `<title>${from.id} → ${to.id} (${edge.reason})</title>`;
  } else {
    svg += `<title>${from.id} → ${to.id}</title>`;
  }
  
  svg += '</line>';
  
  // Add warning icon for forbidden edges
  if (!allowed) {
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    svg += `<text x="${midX}" y="${midY}" font-size="14" fill="#F44336" text-anchor="middle">${WARNING_ICON}</text>`;
  }
  
  return svg;
}

/**
 * Render a single node
 */
function renderNode(node: GraphNode, color: string, showTooltips: boolean): string {
  const { x, y, radius, isSeed, module } = node;
  
  // Seed modules have bold border
  const strokeWidth = isSeed ? 3 : 1;
  const stroke = isSeed ? '#000' : '#666';
  
  let svg = `<g class="node">`;
  
  // Circle
  svg += `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}">`;
  svg += `<title>${module.id}</title>`;
  svg += '</circle>';
  
  // Label (truncate if too long)
  const label = module.id.length > MAX_LABEL_LENGTH 
    ? module.id.substring(0, LABEL_TRUNCATE_AT) + '...' 
    : module.id;
  svg += `<text x="${x}" y="${y + radius + 15}" class="node-label">${escapeXml(label)}</text>`;
  
  // Tooltip (if enabled)
  if (showTooltips) {
    svg += renderTooltip(node);
  }
  
  svg += '</g>';
  return svg;
}

/**
 * Render tooltip content for a node
 * Note: This creates a hidden tooltip that would be shown on hover with JavaScript
 */
function renderTooltip(node: GraphNode): string {
  const { module } = node;
  
  let tooltip = '';
  tooltip += `\n<!-- Tooltip for ${module.id} -->`;
  tooltip += `\n<!-- ID: ${module.id} -->`;
  
  if (module.owns_paths && module.owns_paths.length > 0) {
    tooltip += `\n<!-- Paths: ${module.owns_paths.join(', ')} -->`;
  }
  
  if (module.feature_flags && module.feature_flags.length > 0) {
    tooltip += `\n<!-- Flags: ${module.feature_flags.join(', ')} -->`;
  }
  
  if (module.requires_permissions && module.requires_permissions.length > 0) {
    tooltip += `\n<!-- Permissions: ${module.requires_permissions.join(', ')} -->`;
  }
  
  return tooltip;
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
 * Export graph as PNG using sharp
 * Converts SVG to PNG for embedding in memory cards
 */
export async function exportGraphAsPNG(
  svgContent: string,
  options: { width?: number; height?: number } = {}
): Promise<Buffer> {
  // Import sharp dynamically to avoid issues if not installed
  const sharp = (await import('sharp')).default;
  
  const buffer = Buffer.from(svgContent);
  let image = sharp(buffer);
  
  if (options.width || options.height) {
    image = image.resize(options.width, options.height);
  }
  
  return image.png().toBuffer();
}
