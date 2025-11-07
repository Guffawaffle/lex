# Graph Renderer for Atlas Frames

Visual rendering of Atlas Frames as interactive SVG/Canvas graphs showing module dependencies and policy constraints.

## Features

### Graph Elements

**Nodes (Modules)**:
- 🌱 Seed modules: Bold black border (3px) to highlight modules from `module_scope`
- 📦 Neighbor modules: Normal gray border (1px)
- 📏 Node size: Scales based on number of dependencies (20-50px radius)
- 🎨 Node colors: Auto-detected by module type or custom colors
  - `component` (ui/): Green (#4CAF50)
  - `service` (api/): Blue (#2196F3)
  - `util` (util/): Orange (#FF9800)
  - `core` (backend/): Purple (#9C27B0)
  - `database` (db/): Brown (#795548)
  - `default`: Gray (#607D8B)

**Edges (Dependencies)**:
- ✅ Allowed: Green solid arrows (#4CAF50)
- ❌ Forbidden: Red dashed arrows (#F44336) with ⚠️ icon
- Arrow markers at edge endpoints
- Hover tooltips showing edge metadata

**Layout Options**:
- `force-directed` (default): Organic layout using Fruchterman-Reingold algorithm
- `hierarchical`: Top-down tree layout based on dependency structure
- `circular`: Nodes arranged in a circle (fallback for small graphs)

### Interactive Features
- CSS hover effects on nodes (opacity change)
- Tooltips embedded in SVG (as comments and `<title>` elements)
- Responsive scaling to fit canvas bounds

## Usage

### Basic Rendering

```typescript
import { renderAtlasFrameGraph, exportGraphAsPNG } from './graph.js';
import { generateAtlasFrame } from '../../shared/atlas/atlas-frame.js';

// Generate an Atlas Frame
const atlasFrame = generateAtlasFrame(['ui/admin-panel'], 1);

// Render as SVG
const svg = renderAtlasFrameGraph(atlasFrame);

// Export as PNG for embedding in memory cards
const png = await exportGraphAsPNG(svg, { width: 800, height: 600 });
```

### Custom Options

```typescript
const svg = renderAtlasFrameGraph(atlasFrame, {
  width: 1000,
  height: 800,
  layout: 'hierarchical',
  layoutConfig: {
    levelSpacing: 200,
    nodeSpacing: 150,
  },
  showTooltips: true,
  nodeColors: {
    'ui/admin-panel': '#FF6B6B',
    'api/user-service': '#4ECDC4',
  },
});
```

### Layout Configuration

**Force-Directed Layout**:
```typescript
{
  layout: 'force-directed',
  layoutConfig: {
    iterations: 100,      // Number of simulation steps
    repulsion: 2000,      // Repulsive force strength
    attraction: 0.02,     // Attractive force strength (for edges)
    damping: 0.85,        // Velocity damping (0-1)
  },
}
```

**Hierarchical Layout**:
```typescript
{
  layout: 'hierarchical',
  layoutConfig: {
    levelSpacing: 150,    // Vertical spacing between layers
    nodeSpacing: 100,     // Horizontal spacing between nodes
  },
}
```

## Performance

Optimized for production use:
- ✅ **Target**: < 500ms for graphs with < 100 nodes
- ✅ **Actual**: ~28ms for 50 nodes (force-directed, 100 iterations)
- ✅ **Scales well**: O(n²) for force-directed, O(n) for hierarchical

Performance tips:
- Use hierarchical layout for large graphs (> 50 nodes)
- Reduce `iterations` for faster force-directed rendering
- Use custom coordinates if available to skip layout computation

## Examples

See `graph-example.ts` for complete usage examples:

```bash
npx tsx memory/renderer/graph-example.ts
```

This generates:
- `force-directed.svg` - Organic layout
- `hierarchical.svg` - Top-down tree layout  
- `custom-colors.svg` - Custom node colors
- `graph.png` - PNG export for embedding

## Testing

Run comprehensive test suite:

```bash
npm run build
node --test dist/renderer/graph.test.js
```

Tests cover:
- Basic SVG rendering
- Force-directed layout
- Hierarchical layout
- PNG export
- Custom colors
- Large graph performance (50 nodes)
- Edge cases (empty graph, single node)

## Integration with Memory Cards

The graph renderer integrates with the memory card system to provide visual Atlas Frame representations:

```typescript
import { renderMemoryCard } from './card.js';
import { generateAtlasFrame } from '../../shared/atlas/atlas-frame.js';

const frame = {
  id: 'frame-123',
  timestamp: new Date().toISOString(),
  branch: 'feature/new-api',
  module_scope: ['api/user-service'],
  summary_caption: 'Adding new API endpoint',
  reference_point: 'User creation flow',
  status_snapshot: {
    next_action: 'Implement validation',
  },
};

// Generate Atlas Frame for the module scope
const atlasFrame = generateAtlasFrame(frame.module_scope, 1);

// Render memory card with embedded graph
const card = await renderMemoryCard(frame, atlasFrame);
```

## API Reference

### `renderAtlasFrameGraph(atlasFrame, options?): string`

Renders an Atlas Frame as SVG.

**Parameters**:
- `atlasFrame: AtlasFrame` - The Atlas Frame to render
- `options?: GraphRenderOptions` - Rendering options

**Returns**: SVG markup as string

### `exportGraphAsPNG(svgContent, options?): Promise<Buffer>`

Converts SVG to PNG using Sharp.

**Parameters**:
- `svgContent: string` - SVG markup
- `options?: { width?, height? }` - Output dimensions

**Returns**: Promise<Buffer> - PNG image data

### Types

```typescript
interface GraphRenderOptions {
  width?: number;              // Canvas width (default: 800)
  height?: number;             // Canvas height (default: 600)
  layout?: 'force-directed' | 'hierarchical';  // Layout algorithm
  layoutConfig?: LayoutConfig; // Layout-specific settings
  showTooltips?: boolean;      // Embed tooltips (default: true)
  nodeColors?: Record<string, string>;  // Custom node colors
}

interface LayoutConfig {
  iterations?: number;      // Force-directed iterations
  repulsion?: number;       // Repulsive force strength
  attraction?: number;      // Attractive force strength
  damping?: number;         // Velocity damping
  levelSpacing?: number;    // Hierarchical vertical spacing
  nodeSpacing?: number;     // Hierarchical horizontal spacing
}
```

## Technical Details

### Layout Algorithms

**Force-Directed (Fruchterman-Reingold)**:
- Nodes repel each other (Coulomb's law: F = k/r²)
- Connected nodes attract (Hooke's law: F = k·d)
- Iterative simulation with velocity damping
- Only allowed edges contribute to attraction
- Results in organic, aesthetically pleasing layouts

**Hierarchical (Topological)**:
- Assigns layers using BFS from root nodes (no incoming edges)
- Seeds modules prioritized as roots
- Nodes positioned in layers based on dependency depth
- Equal spacing within layers
- Good for understanding dependency hierarchies

### SVG Structure

```xml
<svg width="800" height="600">
  <defs>
    <!-- CSS styles -->
    <!-- Arrow markers for allowed/forbidden edges -->
  </defs>
  
  <!-- Background -->
  <rect fill="#f5f5f5" />
  
  <!-- Edges (drawn first, appear behind nodes) -->
  <g id="edges">
    <line class="edge-allowed" marker-end="url(#arrow-allowed)" />
    <line class="edge-forbidden" marker-end="url(#arrow-forbidden)" />
  </g>
  
  <!-- Nodes -->
  <g id="nodes">
    <g class="node">
      <circle /> <!-- Node circle -->
      <text />   <!-- Node label -->
    </g>
  </g>
</svg>
```

## Future Enhancements

Potential improvements:
- [ ] Interactive pan/zoom with SVG.js or D3.js
- [ ] Real-time layout updates
- [ ] Edge bundling for dense graphs
- [ ] Cluster visualization for large graphs
- [ ] WebGL renderer for 1000+ nodes
- [ ] Export as interactive HTML

## License

MIT
