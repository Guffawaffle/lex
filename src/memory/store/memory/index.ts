/**
 * Memory-based store implementations.
 *
 * Provides in-memory implementations of store interfaces for testing.
 */

export { MemoryFrameStore } from "./frame-store.js";

// Lex 3.0 scope-bound reference backend. The legacy MemoryFrameStore export
// remains temporarily available until trusted CLI/MCP bootstrap is integrated.
export { MemoryScopedFrameStoreBackend } from "./scoped-frame-store.js";
export type { MemoryScopedFrameStoreOptions } from "./scoped-frame-store.js";
