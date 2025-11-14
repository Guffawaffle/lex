/**
 * Types for prompt templates and rendering
 */

/**
 * API version for prompt utilities (semver stability)
 */
export const PROMPTS_API_VERSION = 1;

/**
 * Context for rendering prompt templates
 */
export interface RenderContext {
  [key: string]: unknown;
}

/**
 * Options for rendering prompts
 */
export interface RenderOptions {
  /**
   * Throw on unknown variables (default: true)
   */
  strict?: boolean;

  /**
   * Escape HTML by default (default: true)
   */
  escapeHtml?: boolean;
}

/**
 * Metadata for a prompt template
 */
export interface PromptMetadata {
  /**
   * Unique identifier for the prompt
   */
  id: string;

  /**
   * Human-readable title
   */
  title: string;

  /**
   * Optional description of the prompt's purpose
   */
  description?: string;

  /**
   * List of template variable names used in the prompt
   */
  variables?: string[];

  /**
   * Tags for categorization
   */
  tags?: string[];

  /**
   * Optional dependencies on other prompts
   */
  requires?: string[];

  /**
   * Schema version for frontmatter validation
   */
  schemaVersion?: number;
}

/**
 * A prompt template with content and metadata
 */
export interface PromptTemplate {
  /**
   * Unique identifier
   */
  id: string;

  /**
   * Raw template content (pre-render)
   */
  content: string;

  /**
   * Parsed metadata from frontmatter
   */
  metadata: PromptMetadata;

  /**
   * SHA256 hash of content (pre-render) for reproducibility
   */
  contentHash: string;
}

/**
 * A rendered prompt with its original template and context
 */
export interface RenderedPrompt {
  /**
   * Original template that was rendered
   */
  template: PromptTemplate;

  /**
   * Rendered output
   */
  rendered: string;

  /**
   * Context used for rendering
   */
  context: RenderContext;

  /**
   * SHA256 hash of rendered output
   */
  hash: string;
}

/**
 * Error thrown during prompt rendering
 */
export class RenderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "RenderError";
  }
}

/**
 * Validation result for render context
 */
export interface ValidationResult {
  /**
   * Whether all required variables are present
   */
  valid: boolean;

  /**
   * List of missing variables (if any)
   */
  missing?: string[];

  /**
   * List of unknown variables referenced but not in context
   */
  unknown?: string[];
}
