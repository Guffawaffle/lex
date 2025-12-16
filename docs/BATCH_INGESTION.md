# Batch Frame Ingestion API

**Status:** Stable (v1.0.0)  
**Issue:** L-EXE-003  
**Module:** `@smartergpt/lex/memory`

## Overview

The batch Frame ingestion API provides external orchestrators with a high-level entrypoint for submitting multiple Frames atomically. This API ensures transactional guarantees: either all Frames in a batch are persisted, or none are.

## When to Use

Use `insertFramesBatch()` when:

- **Multi-step workflows**: You have multiple sequential steps that logically belong together
- **Parallel work units**: Multiple agents work concurrently and their results should be recorded atomically
- **Bulk imports**: You need to load a set of historical Frames into the system
- **External orchestrators**: You're building a tool that coordinates AI agent workflows

## Quick Start

```typescript
import { insertFramesBatch } from '@smartergpt/lex/memory';
import { createFrameStore } from '@smartergpt/lex/store';

const store = createFrameStore();

const frames = [
  {
    id: 'step-1',
    timestamp: new Date().toISOString(),
    branch: 'main',
    module_scope: ['workflow-engine'],
    summary_caption: 'Completed step 1',
    reference_point: 'step 1 done',
    status_snapshot: { next_action: 'Proceed to step 2' }
  },
  {
    id: 'step-2',
    timestamp: new Date().toISOString(),
    branch: 'main',
    module_scope: ['workflow-engine'],
    summary_caption: 'Completed step 2',
    reference_point: 'step 2 done',
    status_snapshot: { next_action: 'Workflow complete' }
  }
];

const result = await insertFramesBatch(store, frames);

if (result.success) {
  console.log(`Successfully ingested ${result.count} frames`);
} else {
  console.error('Batch failed:', result.validationErrors);
}

await store.close();
```

## API Reference

### `insertFramesBatch(store, frames, options?)`

Insert a batch of Frames with transactional guarantees.

**Parameters:**

- `store: FrameStore` - The FrameStore instance to use for persistence
- `frames: FrameInput[]` - Array of Frames to insert
- `options?: BatchOptions` - Optional configuration

**Returns:** `Promise<BatchIngestionResult>`

**Options:**

```typescript
interface BatchOptions {
  /**
   * If true (default), stop validation on the first error.
   * If false, collect all validation errors before rejecting.
   */
  failFast?: boolean;

  /**
   * If true (default), use pre-validation before submitting to the store.
   * Set to false only if you've already validated the Frames externally.
   */
  preValidate?: boolean;

  /**
   * Optional callback to trigger after successful batch ingestion.
   * This is commonly used to schedule Atlas rebuilds after external writes.
   * The callback receives the batch result and is only called on success.
   */
  onSuccess?: (result: BatchIngestionResult) => void | Promise<void>;
}
```

**Result:**

```typescript
interface BatchIngestionResult {
  /** Whether the batch was successfully ingested */
  success: boolean;
  
  /** Number of Frames successfully ingested */
  count: number;
  
  /** Validation errors (if any) */
  validationErrors: BatchValidationError[];
  
  /** Store-level errors (if any) */
  storeError?: string;
  
  /** Individual Frame results from the store */
  results: SaveResult[];
}
```

## Usage Patterns

### Pattern 1: Multi-Step Workflow

Capture all steps of a workflow atomically:

```typescript
import { insertFramesBatch } from '@smartergpt/lex/memory';
import { createFrameStore } from '@smartergpt/lex/store';

async function recordWorkflow(workflowId: string, steps: string[]) {
  const store = createFrameStore();
  const frames = steps.map((step, i) => ({
    id: `${workflowId}-step-${i + 1}`,
    timestamp: new Date(Date.now() + i * 1000).toISOString(),
    branch: 'main',
    module_scope: ['workflow'],
    summary_caption: `Completed ${step}`,
    reference_point: step,
    status_snapshot: {
      next_action: i < steps.length - 1 ? steps[i + 1] : 'Complete'
    }
  }));

  const result = await insertFramesBatch(store, frames);
  
  if (!result.success) {
    throw new Error(`Workflow recording failed: ${result.validationErrors}`);
  }
  
  await store.close();
  return result.count;
}

// Usage
await recordWorkflow('wf-001', [
  'Initialize project',
  'Install dependencies',
  'Run tests',
  'Deploy to staging'
]);
```

### Pattern 2: Parallel Work Units

Record parallel processing results atomically:

```typescript
import { insertFramesBatch } from '@smartergpt/lex/memory';
import { createFrameStore } from '@smartergpt/lex/store';

async function recordParallelWork(taskId: string, results: any[]) {
  const store = createFrameStore();
  const frames = results.map((result, i) => ({
    id: `${taskId}-unit-${result.unitId}`,
    timestamp: new Date().toISOString(),
    branch: 'main',
    module_scope: ['data-processor'],
    summary_caption: `Processed ${result.description}`,
    reference_point: `unit ${result.unitId} complete`,
    status_snapshot: {
      next_action: 'Aggregate results'
    },
    runId: taskId
  }));

  const result = await insertFramesBatch(store, frames);
  
  if (!result.success) {
    throw new Error('Parallel work recording failed');
  }
  
  await store.close();
}

// Usage
const results = await Promise.all([
  processDataSet('A'),
  processDataSet('B'),
  processDataSet('C')
]);

await recordParallelWork('task-123', results);
```

### Pattern 3: Error Collection (Fail-Slow)

Collect all validation errors before rejecting:

```typescript
import { insertFramesBatch } from '@smartergpt/lex/memory';
import { createFrameStore } from '@smartergpt/lex/store';

async function importFramesWithValidation(frames: any[]) {
  const store = createFrameStore();
  
  // Collect all errors instead of failing fast
  const result = await insertFramesBatch(store, frames, {
    failFast: false
  });
  
  if (!result.success) {
    // Report all validation errors to the user
    console.error('Import failed with errors:');
    for (const error of result.validationErrors) {
      console.error(`Frame ${error.frameId} (index ${error.index}):`);
      for (const err of error.validation.errors) {
        console.error(`  - ${err.path}: ${err.message}`);
      }
    }
    throw new Error(`Import failed with ${result.validationErrors.length} errors`);
  }
  
  await store.close();
  return result.count;
}
```

## Error Handling

### Validation Errors

When pre-validation is enabled (default), the API validates each Frame before submitting to the store:

```typescript
const result = await insertFramesBatch(store, frames);

if (!result.success && result.validationErrors.length > 0) {
  for (const error of result.validationErrors) {
    console.error(`Frame ${error.frameId}:`);
    for (const err of error.validation.errors) {
      console.error(`  ${err.path}: ${err.message} (${err.code})`);
    }
  }
}
```

### Store Errors

If validation passes but the store operation fails:

```typescript
const result = await insertFramesBatch(store, frames);

if (!result.success && result.storeError) {
  console.error('Store operation failed:', result.storeError);
}
```

### Transaction Rollback

The batch API guarantees atomicity. If any Frame fails validation or persistence, **no Frames from the batch are persisted**:

```typescript
const frames = [
  validFrame1,
  invalidFrame,  // This will cause the batch to fail
  validFrame2
];

const result = await insertFramesBatch(store, frames);

// result.success === false
// Neither validFrame1 nor validFrame2 will be persisted
```

## Performance Characteristics

The batch API is optimized for modest batch sizes:

- **10 Frames**: Typically completes in <100ms
- **100 Frames**: Typically completes in <500ms
- **Larger batches**: Performance degrades linearly; consider splitting into smaller batches

Performance is measured on SQLite with an in-memory database. Disk-based databases may be slower.

## Best Practices

### 1. Keep Batches Reasonably Sized

```typescript
// Good: Batch size 10-100
const frames = generateFrames(50);
await insertFramesBatch(store, frames);

// Avoid: Very large batches
const frames = generateFrames(10000);  // Consider splitting
```

### 2. Use Fail-Fast for Interactive Workflows

```typescript
// For interactive tools, fail fast to provide quick feedback
const result = await insertFramesBatch(store, frames, {
  failFast: true  // Default
});
```

### 3. Use Fail-Slow for Batch Imports

```typescript
// For bulk imports, collect all errors for comprehensive reporting
const result = await insertFramesBatch(store, frames, {
  failFast: false
});
```

### 4. Disable Pre-Validation If Already Validated

```typescript
// If you've already validated frames externally
const validatedFrames = await externalValidator.validate(frames);
const result = await insertFramesBatch(store, validatedFrames, {
  preValidate: false  // Skip redundant validation
});
```

### 5. Trigger Atlas Rebuild After Batch Ingestion (L-EXE-004)

Use the `onSuccess` callback to schedule Atlas rebuilds after successful batch writes:

```typescript
import { insertFramesBatch } from '@smartergpt/lex/memory';
import { triggerAtlasRebuild } from '@smartergpt/lex/atlas';

const result = await insertFramesBatch(store, frames, {
  onSuccess: async (batchResult) => {
    console.log(`Batch ingested ${batchResult.count} frames, triggering Atlas rebuild...`);
    
    // Schedule Atlas rebuild (non-blocking, debounced)
    await triggerAtlasRebuild();
  }
});
```

**Key points:**
- The callback is **only called on successful ingestion** (not on validation or store errors)
- The callback receives the full `BatchIngestionResult`
- Supports both sync and async callbacks
- The batch operation waits for the callback to complete

**When to use:**
- After bulk Frame imports that should update derived views
- When external orchestrators need to trigger downstream processing
- For high-volume data ingestion that requires periodic Atlas updates

**When NOT to use:**
- For individual Frame writes (use `notifyFrameIngested()` instead)
- When Atlas rebuild should happen independently of Frame writes

### 6. Always Close the Store

```typescript
const store = createFrameStore();
try {
  const result = await insertFramesBatch(store, frames);
  // ... handle result
} finally {
  await store.close();
}
```

## Relationship to Other APIs

### vs. `saveFrame()`

- `saveFrame()`: Low-level, single-Frame persistence (no batch support)
- `insertFramesBatch()`: High-level, batch ingestion with validation and transactional guarantees

### vs. `saveFrames()` (FrameStore)

- `saveFrames()`: Mid-level store API, transactional but no pre-validation
- `insertFramesBatch()`: High-level wrapper that adds pre-validation and better error reporting

### vs. `validateFramePayload()`

- `validateFramePayload()`: Standalone validation (no persistence)
- `insertFramesBatch()`: Combines validation + persistence in one call

### vs. Atlas Rebuild APIs

Batch ingestion writes Frames to storage. Atlas rebuilding creates derived views from those Frames:

- **Writing Frames**: Use `insertFramesBatch()` to persist Frame data
- **Rebuilding Atlas**: Use `triggerAtlasRebuild()` to update derived views from Frames
- **Integration**: Use `onSuccess` callback to automatically trigger rebuilds after batch writes

**Key distinction:**
```typescript
// Writing Frames (primary data)
const result = await insertFramesBatch(store, frames);

// Rebuilding Atlas (derived views from all Frames in store)
await triggerAtlasRebuild();

// Combined: Write Frames + trigger rebuild
const result = await insertFramesBatch(store, frames, {
  onSuccess: async () => {
    await triggerAtlasRebuild();
  }
});
```

See the [Atlas Rebuild documentation](./ATLAS_REBUILD.md) for details on rebuild scheduling and debouncing.

## Migration Guide

If you're currently using individual `saveFrame()` calls:

```typescript
// Before: Individual saves (no transaction)
for (const frame of frames) {
  await saveFrame(db, frame);
}

// After: Batch with transactional guarantees
const store = createFrameStore();
const result = await insertFramesBatch(store, frames);
await store.close();
```

## Related Documentation

- [Frame Validation API](./VALIDATION.md) - Pre-validation helpers
- [FrameStore Interface](./FRAMESTORE.md) - Low-level persistence API
- [Frame Schema](../../schemas/frame.schema.json) - Frame data structure

## Support

For issues or questions:
- GitHub Issues: https://github.com/Guffawaffle/lex/issues
- Documentation: https://github.com/Guffawaffle/lex/tree/main/docs
