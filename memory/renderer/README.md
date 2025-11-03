# memory/renderer

**Memory card image generation for visual Frame summaries**

This module provides functionality to render Frame metadata as high-contrast visual images, optimized for LLM vision input. Based on research showing 7-20× token reduction through vision-token compression (see `docs/research/adjacency-constrained-episodic-memory.pdf`, Section 3.1).

## Features

- **High-contrast rendering**: Dark background with light text for optimal readability
- **Monospace font**: Technical content displayed in monospace for clarity
- **Smart text handling**: Automatic truncation and wrapping for long text
- **Dynamic sizing**: Card height adjusts based on content
- **PNG output**: Standard PNG format for broad compatibility
- **Customizable**: Template system for different layouts and color schemes

## Usage

### Basic rendering

```typescript
import { renderMemoryCard } from '@lex/renderer';
import type { Frame } from '@lex/frames/types';

const frame: Frame = {
  id: 'frame-001',
  timestamp: new Date().toISOString(),
  branch: 'main',
  module_scope: ['memory/renderer'],
  summary_caption: 'Implementing memory card rendering',
  reference_point: 'Visual compression for LLM context',
  status_snapshot: {
    next_action: 'Complete implementation and testing',
  },
};

// Render to PNG buffer
const pngBuffer = await renderMemoryCard(frame);

// Save to file
import { writeFileSync } from 'fs';
writeFileSync('memory-card.png', pngBuffer);
```

### Rendering with raw context

```typescript
import { renderMemoryCard } from '@lex/renderer';

const rawContext = `
Recent logs:
[2024-11-02 17:00:00] Starting task
[2024-11-02 17:00:01] Processing...

Diff snippet:
+++ src/example.ts
@@ -1,0 +1,5 @@
+export function newFeature() {
+  return "implemented";
+}
`;

const pngBuffer = await renderMemoryCard(frame, rawContext);
```

### Custom rendering options

```typescript
import { renderMemoryCardWithOptions } from '@lex/renderer';

const pngBuffer = await renderMemoryCardWithOptions(frame, {
  dimensions: {
    width: 1000,
    height: 1200,
    padding: 50,
    lineHeight: 28,
  },
  colorScheme: {
    background: '#000000',
    text: '#ffffff',
    heading: '#00ff00',
    accent: '#00aaff',
    muted: '#666666',
    warning: '#ffaa00',
    error: '#ff0000',
  },
  fontConfig: {
    family: 'monospace',
    sizeTitle: 32,
    sizeHeading: 24,
    sizeBody: 18,
    sizeSmall: 16,
  },
});
```

## Card Layout

Each rendered memory card includes:

1. **Header**
   - Frame ID
   - Timestamp
   - Branch name
   - Jira ticket (if present)

2. **Summary Section**
   - Summary caption (main description)
   - Reference point (human-memorable anchor)

3. **Status Snapshot**
   - Next action
   - Blockers (if any)
   - Merge blockers (if any)
   - Failing tests (if any)

4. **Module Scope**
   - List of touched modules

5. **Keywords** (if present)

6. **Optional Fields**
   - Atlas Frame ID (if present)
   - Raw context (logs, diffs, etc.)

## Default Dimensions

- **Width**: 800px
- **Height**: 1000px (minimum, adjusts based on content)
- **Padding**: 40px
- **Line height**: 24px

These dimensions are optimized for vision model input based on research.

## Text Limits

To maintain readability and prevent overflow:

- Summary caption: 120 characters
- Reference point: 80 characters
- Next action: 200 characters
- Blocker item: 100 characters
- Max blockers shown: 5
- Max keywords shown: 8

Long text is automatically truncated with ellipsis (...) or wrapped to multiple lines.

## Testing

Run the test suite to verify rendering:

```bash
npx tsx memory/renderer/card.test.ts
```

This generates sample images in `/tmp/memory-card-tests/` for visual inspection.

## Dependencies

- **canvas** (^2.11.2): Node.js Canvas implementation for image generation
- **@types/node** (^20.0.0): TypeScript types for Node.js

## API Reference

### Functions

#### `renderMemoryCard(frame: Frame, rawContext?: string): Promise<Buffer>`

Render a Frame to PNG with default options.

- **Parameters:**
  - `frame`: Frame object to render
  - `rawContext`: Optional raw context (logs, diffs, etc.)
- **Returns:** PNG image buffer

#### `renderMemoryCardWithOptions(frame: Frame, options: RenderOptions): Promise<Buffer>`

Render a Frame with custom options.

- **Parameters:**
  - `frame`: Frame object to render
  - `options`: Custom rendering options
- **Returns:** PNG image buffer

### Types

#### `RenderOptions`

```typescript
interface RenderOptions {
  dimensions?: CardDimensions;
  colorScheme?: ColorScheme;
  fontConfig?: FontConfig;
  rawContext?: string;
}
```

#### `CardDimensions`

```typescript
interface CardDimensions {
  width: number;
  height: number;
  padding: number;
  lineHeight: number;
}
```

#### `ColorScheme`

```typescript
interface ColorScheme {
  background: string;
  text: string;
  heading: string;
  accent: string;
  muted: string;
  warning: string;
  error: string;
}
```

#### `FontConfig`

```typescript
interface FontConfig {
  family: string;
  sizeTitle: number;
  sizeHeading: number;
  sizeBody: number;
  sizeSmall: number;
}
```

## Integration

This module integrates with:

- **memory/frames**: Uses Frame type definitions
- **memory/store**: Can render stored Frames
- **memory/mcp_server**: Vision-optimized context for MCP tools

## Performance

Image generation is fast (~10-50ms per card) and memory-efficient. The canvas library uses native code for rendering.

## Future Enhancements

- [ ] SVG output option for scalable graphics
- [ ] Additional color schemes (light mode, high-contrast)
- [ ] Template variations for different Frame types
- [ ] Syntax highlighting for code snippets in raw context
- [ ] Configurable DPI for different display targets
