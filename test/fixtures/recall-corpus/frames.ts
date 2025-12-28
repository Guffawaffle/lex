/**
 * Test corpus for recall quality benchmarks
 *
 * Contains 50+ diverse Frames with known relevance labels for testing
 * recall precision and accuracy.
 */

import type { Frame } from "@app/memory/frames/types.js";

/**
 * Test corpus of Frames for recall quality testing
 */
export const recallCorpusFrames: Frame[] = [
  // Authentication & Security cluster (frames 1-10)
  {
    id: "corpus-001",
    timestamp: "2025-01-15T10:00:00Z",
    branch: "feature/auth-refactor",
    module_scope: ["shared/auth", "api/middleware"],
    summary_caption: "Refactoring authentication middleware to use JWT tokens",
    reference_point: "auth refactor",
    status_snapshot: {
      next_action: "Implement token validation",
      blockers: ["Need to decide on token expiry policy"],
    },
    keywords: ["authentication", "jwt", "security", "middleware"],
  },
  {
    id: "corpus-002",
    timestamp: "2025-01-16T14:30:00Z",
    branch: "feature/password-validation",
    module_scope: ["shared/auth", "validation"],
    summary_caption: "Enhanced password validation with complexity requirements",
    reference_point: "password validation",
    status_snapshot: {
      next_action: "Add unit tests for password rules",
    },
    keywords: ["password", "validation", "security", "credentials"],
  },
  {
    id: "corpus-003",
    timestamp: "2025-01-17T09:15:00Z",
    branch: "fix/session-timeout",
    module_scope: ["shared/auth", "session"],
    summary_caption: "Fixed session timeout not respecting idle time",
    reference_point: "session timeout bug",
    status_snapshot: {
      next_action: "Verify fix in staging",
      tests_failing: ["test/auth/session.test.ts"],
    },
    keywords: ["session", "timeout", "auth", "bugfix"],
  },
  {
    id: "corpus-004",
    timestamp: "2025-01-18T11:00:00Z",
    branch: "feature/oauth-integration",
    module_scope: ["shared/auth", "api/oauth"],
    summary_caption: "Integrating OAuth2 provider for third-party authentication",
    reference_point: "oauth integration",
    status_snapshot: {
      next_action: "Configure OAuth callback URLs",
    },
    keywords: ["oauth", "authentication", "integration", "third-party"],
  },
  {
    id: "corpus-005",
    timestamp: "2025-01-19T16:45:00Z",
    branch: "security/audit-logging",
    module_scope: ["shared/auth", "logging"],
    summary_caption: "Added comprehensive audit logging for authentication events",
    reference_point: "audit logging",
    status_snapshot: {
      next_action: "Review logs with security team",
    },
    keywords: ["audit", "logging", "security", "compliance"],
  },
  {
    id: "corpus-006",
    timestamp: "2025-01-20T08:30:00Z",
    branch: "feature/2fa",
    module_scope: ["shared/auth", "api/2fa"],
    summary_caption: "Implementing two-factor authentication with TOTP",
    reference_point: "2fa implementation",
    status_snapshot: {
      next_action: "Test QR code generation",
    },
    keywords: ["2fa", "totp", "security", "authentication"],
  },
  {
    id: "corpus-007",
    timestamp: "2025-01-21T13:20:00Z",
    branch: "fix/credential-leak",
    module_scope: ["shared/auth", "security"],
    summary_caption: "Patched potential credential leak in error messages",
    reference_point: "credential security",
    status_snapshot: {
      next_action: "Run security scan",
    },
    keywords: ["security", "credentials", "vulnerability", "patch"],
  },
  {
    id: "corpus-008",
    timestamp: "2025-01-22T10:10:00Z",
    branch: "feature/rbac",
    module_scope: ["shared/auth", "permissions"],
    summary_caption: "Role-based access control implementation",
    reference_point: "rbac system",
    status_snapshot: {
      next_action: "Define role hierarchy",
    },
    keywords: ["rbac", "permissions", "authorization", "roles"],
  },
  {
    id: "corpus-009",
    timestamp: "2025-01-23T15:00:00Z",
    branch: "feature/sso",
    module_scope: ["shared/auth", "api/sso"],
    summary_caption: "Single sign-on integration with enterprise IdP",
    reference_point: "sso integration",
    status_snapshot: {
      next_action: "Configure SAML metadata",
    },
    keywords: ["sso", "saml", "enterprise", "authentication"],
  },
  {
    id: "corpus-010",
    timestamp: "2025-01-24T09:45:00Z",
    branch: "fix/login-rate-limit",
    module_scope: ["shared/auth", "api/middleware"],
    summary_caption: "Implemented rate limiting for login attempts",
    reference_point: "login rate limiting",
    status_snapshot: {
      next_action: "Monitor rate limit metrics",
    },
    keywords: ["rate-limiting", "security", "login", "brute-force"],
  },

  // Database & Data Management cluster (frames 11-20)
  {
    id: "corpus-011",
    timestamp: "2025-01-10T10:00:00Z",
    branch: "feature/db-migration",
    module_scope: ["database", "migrations"],
    summary_caption: "Database schema migration for user profiles table",
    reference_point: "database migration",
    status_snapshot: {
      next_action: "Test migration rollback",
    },
    keywords: ["database", "migration", "schema", "sql"],
  },
  {
    id: "corpus-012",
    timestamp: "2025-01-11T14:15:00Z",
    branch: "perf/query-optimization",
    module_scope: ["database", "queries"],
    summary_caption: "Optimized slow queries with proper indexing",
    reference_point: "query performance",
    status_snapshot: {
      next_action: "Benchmark query performance",
    },
    keywords: ["database", "performance", "optimization", "indexing"],
  },
  {
    id: "corpus-013",
    timestamp: "2025-01-12T11:30:00Z",
    branch: "feature/data-backup",
    module_scope: ["database", "backup"],
    summary_caption: "Automated backup system for production database",
    reference_point: "backup automation",
    status_snapshot: {
      next_action: "Schedule backup jobs",
    },
    keywords: ["backup", "database", "automation", "disaster-recovery"],
  },
  {
    id: "corpus-014",
    timestamp: "2025-01-13T16:00:00Z",
    branch: "feature/data-seeding",
    module_scope: ["database", "seeds"],
    summary_caption: "Created data seeding scripts for development environment",
    reference_point: "data seeding",
    status_snapshot: {
      next_action: "Add more seed data",
    },
    keywords: ["database", "seeding", "development", "fixtures"],
  },
  {
    id: "corpus-015",
    timestamp: "2025-01-14T09:00:00Z",
    branch: "fix/connection-pool",
    module_scope: ["database", "connection"],
    summary_caption: "Fixed database connection pool exhaustion",
    reference_point: "connection pooling",
    status_snapshot: {
      next_action: "Monitor connection metrics",
    },
    keywords: ["database", "connection", "pool", "performance"],
  },
  {
    id: "corpus-016",
    timestamp: "2025-01-25T13:00:00Z",
    branch: "feature/data-encryption",
    module_scope: ["database", "security"],
    summary_caption: "Implemented encryption for sensitive data at rest",
    reference_point: "data encryption",
    status_snapshot: {
      next_action: "Key rotation strategy",
    },
    keywords: ["encryption", "security", "database", "pii"],
  },
  {
    id: "corpus-017",
    timestamp: "2025-01-26T10:30:00Z",
    branch: "feature/read-replica",
    module_scope: ["database", "replication"],
    summary_caption: "Set up read replicas for scaling read operations",
    reference_point: "read replicas",
    status_snapshot: {
      next_action: "Configure replication lag monitoring",
    },
    keywords: ["database", "replication", "scaling", "performance"],
  },
  {
    id: "corpus-018",
    timestamp: "2025-01-27T14:45:00Z",
    branch: "fix/transaction-deadlock",
    module_scope: ["database", "transactions"],
    summary_caption: "Resolved transaction deadlock in order processing",
    reference_point: "deadlock fix",
    status_snapshot: {
      next_action: "Add deadlock detection",
    },
    keywords: ["database", "transactions", "deadlock", "concurrency"],
  },
  {
    id: "corpus-019",
    timestamp: "2025-01-28T11:15:00Z",
    branch: "feature/cache-layer",
    module_scope: ["database", "cache"],
    summary_caption: "Redis caching layer for frequently accessed data",
    reference_point: "caching implementation",
    status_snapshot: {
      next_action: "Define cache invalidation strategy",
    },
    keywords: ["cache", "redis", "performance", "optimization"],
  },
  {
    id: "corpus-020",
    timestamp: "2025-01-29T15:30:00Z",
    branch: "feature/data-archival",
    module_scope: ["database", "archival"],
    summary_caption: "Automated archival system for old records",
    reference_point: "data archival",
    status_snapshot: {
      next_action: "Define retention policies",
    },
    keywords: ["archival", "database", "retention", "storage"],
  },

  // UI & Frontend cluster (frames 21-30)
  {
    id: "corpus-021",
    timestamp: "2025-02-01T10:00:00Z",
    branch: "feature/ui-redesign",
    module_scope: ["ui/components", "ui/styles"],
    summary_caption: "Redesigning main dashboard with new component library",
    reference_point: "dashboard redesign",
    status_snapshot: {
      next_action: "Review design mockups",
    },
    keywords: ["ui", "design", "dashboard", "components"],
  },
  {
    id: "corpus-022",
    timestamp: "2025-02-02T14:30:00Z",
    branch: "feature/dark-mode",
    module_scope: ["ui/themes", "ui/styles"],
    summary_caption: "Implemented dark mode theme support",
    reference_point: "dark mode",
    status_snapshot: {
      next_action: "Test theme switching",
    },
    keywords: ["ui", "theme", "dark-mode", "accessibility"],
  },
  {
    id: "corpus-023",
    timestamp: "2025-02-03T09:15:00Z",
    branch: "fix/button-styling",
    module_scope: ["ui/components"],
    summary_caption: "Fixed inconsistent button styling across pages",
    reference_point: "button fix",
    status_snapshot: {
      next_action: "Update style guide",
    },
    keywords: ["ui", "styling", "buttons", "consistency"],
  },
  {
    id: "corpus-024",
    timestamp: "2025-02-04T11:45:00Z",
    branch: "feature/responsive-layout",
    module_scope: ["ui/layout", "ui/styles"],
    summary_caption: "Made layout responsive for mobile devices",
    reference_point: "responsive design",
    status_snapshot: {
      next_action: "Test on various screen sizes",
    },
    keywords: ["ui", "responsive", "mobile", "layout"],
  },
  {
    id: "corpus-025",
    timestamp: "2025-02-05T16:00:00Z",
    branch: "feature/form-validation",
    module_scope: ["ui/forms", "ui/validation"],
    summary_caption: "Enhanced form validation with real-time feedback",
    reference_point: "form validation",
    status_snapshot: {
      next_action: "Add validation error messages",
    },
    keywords: ["ui", "forms", "validation", "ux"],
  },
  {
    id: "corpus-026",
    timestamp: "2025-02-06T13:20:00Z",
    branch: "feature/loading-states",
    module_scope: ["ui/components"],
    summary_caption: "Added loading spinners and skeleton screens",
    reference_point: "loading states",
    status_snapshot: {
      next_action: "Standardize loading patterns",
    },
    keywords: ["ui", "loading", "ux", "feedback"],
  },
  {
    id: "corpus-027",
    timestamp: "2025-02-07T10:30:00Z",
    branch: "feature/accessibility",
    module_scope: ["ui/a11y", "ui/components"],
    summary_caption: "Improved accessibility with ARIA labels and keyboard nav",
    reference_point: "accessibility improvements",
    status_snapshot: {
      next_action: "Run WCAG audit",
    },
    keywords: ["accessibility", "a11y", "ui", "wcag"],
  },
  {
    id: "corpus-028",
    timestamp: "2025-02-08T15:45:00Z",
    branch: "feature/toast-notifications",
    module_scope: ["ui/notifications"],
    summary_caption: "Implemented toast notification system",
    reference_point: "notifications",
    status_snapshot: {
      next_action: "Add notification queue",
    },
    keywords: ["ui", "notifications", "toast", "feedback"],
  },
  {
    id: "corpus-029",
    timestamp: "2025-02-09T11:00:00Z",
    branch: "feature/modal-dialogs",
    module_scope: ["ui/components"],
    summary_caption: "Created reusable modal dialog component",
    reference_point: "modal component",
    status_snapshot: {
      next_action: "Add animation transitions",
    },
    keywords: ["ui", "modal", "dialog", "components"],
  },
  {
    id: "corpus-030",
    timestamp: "2025-02-10T14:15:00Z",
    branch: "fix/layout-shift",
    module_scope: ["ui/layout", "ui/performance"],
    summary_caption: "Fixed cumulative layout shift issues",
    reference_point: "cls optimization",
    status_snapshot: {
      next_action: "Measure CLS metrics",
    },
    keywords: ["ui", "performance", "cls", "optimization"],
  },

  // API & Backend cluster (frames 31-40)
  {
    id: "corpus-031",
    timestamp: "2025-02-11T10:00:00Z",
    branch: "feature/rest-api",
    module_scope: ["api/routes", "api/controllers"],
    summary_caption: "RESTful API endpoints for user management",
    reference_point: "rest api",
    status_snapshot: {
      next_action: "Write API documentation",
    },
    keywords: ["api", "rest", "endpoints", "backend"],
  },
  {
    id: "corpus-032",
    timestamp: "2025-02-12T14:30:00Z",
    branch: "feature/graphql",
    module_scope: ["api/graphql"],
    summary_caption: "GraphQL schema and resolvers for product catalog",
    reference_point: "graphql implementation",
    status_snapshot: {
      next_action: "Set up GraphQL playground",
    },
    keywords: ["graphql", "api", "schema", "resolvers"],
  },
  {
    id: "corpus-033",
    timestamp: "2025-02-13T09:45:00Z",
    branch: "feature/api-versioning",
    module_scope: ["api/versioning"],
    summary_caption: "API versioning strategy with backward compatibility",
    reference_point: "api versioning",
    status_snapshot: {
      next_action: "Document version migration",
    },
    keywords: ["api", "versioning", "compatibility", "migration"],
  },
  {
    id: "corpus-034",
    timestamp: "2025-02-14T11:15:00Z",
    branch: "feature/api-rate-limiting",
    module_scope: ["api/middleware"],
    summary_caption: "Rate limiting middleware for API endpoints",
    reference_point: "rate limiting",
    status_snapshot: {
      next_action: "Configure rate limit tiers",
    },
    keywords: ["api", "rate-limiting", "middleware", "throttling"],
  },
  {
    id: "corpus-035",
    timestamp: "2025-02-15T16:30:00Z",
    branch: "feature/webhooks",
    module_scope: ["api/webhooks"],
    summary_caption: "Webhook delivery system with retry logic",
    reference_point: "webhook system",
    status_snapshot: {
      next_action: "Test webhook delivery",
    },
    keywords: ["webhooks", "api", "events", "integration"],
  },
  {
    id: "corpus-036",
    timestamp: "2025-02-16T13:00:00Z",
    branch: "feature/api-docs",
    module_scope: ["api/documentation"],
    summary_caption: "OpenAPI documentation with Swagger UI",
    reference_point: "api documentation",
    status_snapshot: {
      next_action: "Add example requests",
    },
    keywords: ["api", "documentation", "openapi", "swagger"],
  },
  {
    id: "corpus-037",
    timestamp: "2025-02-17T10:45:00Z",
    branch: "fix/api-timeout",
    module_scope: ["api/middleware"],
    summary_caption: "Fixed API timeout handling for long-running requests",
    reference_point: "timeout handling",
    status_snapshot: {
      next_action: "Add timeout configuration",
    },
    keywords: ["api", "timeout", "performance", "error-handling"],
  },
  {
    id: "corpus-038",
    timestamp: "2025-02-18T15:20:00Z",
    branch: "feature/api-caching",
    module_scope: ["api/cache"],
    summary_caption: "HTTP caching headers for API responses",
    reference_point: "api caching",
    status_snapshot: {
      next_action: "Define cache policies",
    },
    keywords: ["api", "cache", "performance", "http"],
  },
  {
    id: "corpus-039",
    timestamp: "2025-02-19T11:30:00Z",
    branch: "feature/pagination",
    module_scope: ["api/pagination"],
    summary_caption: "Cursor-based pagination for large result sets",
    reference_point: "pagination",
    status_snapshot: {
      next_action: "Test with large datasets",
    },
    keywords: ["api", "pagination", "cursor", "performance"],
  },
  {
    id: "corpus-040",
    timestamp: "2025-02-20T14:00:00Z",
    branch: "feature/api-logging",
    module_scope: ["api/logging"],
    summary_caption: "Structured logging for API requests and responses",
    reference_point: "api logging",
    status_snapshot: {
      next_action: "Set up log aggregation",
    },
    keywords: ["api", "logging", "observability", "monitoring"],
  },

  // Testing & Quality cluster (frames 41-50)
  {
    id: "corpus-041",
    timestamp: "2025-02-21T10:00:00Z",
    branch: "test/unit-tests",
    module_scope: ["test/unit"],
    summary_caption: "Comprehensive unit tests for business logic",
    reference_point: "unit testing",
    status_snapshot: {
      next_action: "Increase test coverage to 80%",
    },
    keywords: ["testing", "unit-tests", "coverage", "quality"],
  },
  {
    id: "corpus-042",
    timestamp: "2025-02-22T14:30:00Z",
    branch: "test/integration",
    module_scope: ["test/integration"],
    summary_caption: "Integration tests for API endpoints",
    reference_point: "integration testing",
    status_snapshot: {
      next_action: "Add database integration tests",
    },
    keywords: ["testing", "integration", "api", "e2e"],
  },
  {
    id: "corpus-043",
    timestamp: "2025-02-23T09:15:00Z",
    branch: "test/e2e",
    module_scope: ["test/e2e"],
    summary_caption: "End-to-end tests with Playwright",
    reference_point: "e2e testing",
    status_snapshot: {
      next_action: "Add critical user flows",
    },
    keywords: ["testing", "e2e", "playwright", "automation"],
  },
  {
    id: "corpus-044",
    timestamp: "2025-02-24T11:45:00Z",
    branch: "test/performance",
    module_scope: ["test/performance"],
    summary_caption: "Load testing with k6 for API performance",
    reference_point: "performance testing",
    status_snapshot: {
      next_action: "Define performance benchmarks",
    },
    keywords: ["testing", "performance", "load-testing", "benchmarks"],
  },
  {
    id: "corpus-045",
    timestamp: "2025-02-25T16:00:00Z",
    branch: "ci/pipeline",
    module_scope: ["ci/github-actions"],
    summary_caption: "GitHub Actions CI pipeline with automated testing",
    reference_point: "ci pipeline",
    status_snapshot: {
      next_action: "Add deployment automation",
    },
    keywords: ["ci", "github-actions", "automation", "pipeline"],
  },
  {
    id: "corpus-046",
    timestamp: "2025-02-26T13:20:00Z",
    branch: "qa/code-review",
    module_scope: ["qa/process"],
    summary_caption: "Established code review guidelines and checklists",
    reference_point: "code review process",
    status_snapshot: {
      next_action: "Train team on guidelines",
    },
    keywords: ["qa", "code-review", "process", "quality"],
  },
  {
    id: "corpus-047",
    timestamp: "2025-02-27T10:30:00Z",
    branch: "qa/static-analysis",
    module_scope: ["qa/tools"],
    summary_caption: "Integrated ESLint and TypeScript strict mode",
    reference_point: "static analysis",
    status_snapshot: {
      next_action: "Fix linting errors",
    },
    keywords: ["qa", "linting", "static-analysis", "typescript"],
  },
  {
    id: "corpus-048",
    timestamp: "2025-02-28T15:45:00Z",
    branch: "qa/security-scan",
    module_scope: ["qa/security"],
    summary_caption: "Automated security scanning with Snyk",
    reference_point: "security scanning",
    status_snapshot: {
      next_action: "Review vulnerability report",
    },
    keywords: ["security", "scanning", "vulnerabilities", "qa"],
  },
  {
    id: "corpus-049",
    timestamp: "2025-03-01T11:00:00Z",
    branch: "qa/test-data",
    module_scope: ["test/fixtures"],
    summary_caption: "Test data factory for consistent test fixtures",
    reference_point: "test fixtures",
    status_snapshot: {
      next_action: "Document fixture usage",
    },
    keywords: ["testing", "fixtures", "test-data", "factory"],
  },
  {
    id: "corpus-050",
    timestamp: "2025-03-02T14:15:00Z",
    branch: "qa/monitoring",
    module_scope: ["monitoring"],
    summary_caption: "Application monitoring with error tracking",
    reference_point: "error monitoring",
    status_snapshot: {
      next_action: "Set up alert notifications",
    },
    keywords: ["monitoring", "errors", "observability", "alerts"],
  },

  // Miscellaneous / Unrelated frames (51-55)
  {
    id: "corpus-051",
    timestamp: "2025-03-03T10:00:00Z",
    branch: "docs/readme",
    module_scope: ["documentation"],
    summary_caption: "Updated README with installation instructions",
    reference_point: "documentation update",
    status_snapshot: {
      next_action: "Add troubleshooting section",
    },
    keywords: ["documentation", "readme", "getting-started"],
  },
  {
    id: "corpus-052",
    timestamp: "2025-03-04T14:30:00Z",
    branch: "chore/dependencies",
    module_scope: ["dependencies"],
    summary_caption: "Updated npm dependencies to latest versions",
    reference_point: "dependency update",
    status_snapshot: {
      next_action: "Test for breaking changes",
    },
    keywords: ["dependencies", "npm", "maintenance", "updates"],
  },
  {
    id: "corpus-053",
    timestamp: "2025-03-05T09:45:00Z",
    branch: "config/environment",
    module_scope: ["config"],
    summary_caption: "Environment configuration for different deployment stages",
    reference_point: "env config",
    status_snapshot: {
      next_action: "Document config variables",
    },
    keywords: ["configuration", "environment", "deployment", "settings"],
  },
  {
    id: "corpus-054",
    timestamp: "2025-03-06T11:15:00Z",
    branch: "infra/docker",
    module_scope: ["infrastructure"],
    summary_caption: "Dockerized application for consistent deployments",
    reference_point: "docker setup",
    status_snapshot: {
      next_action: "Optimize image size",
    },
    keywords: ["docker", "containerization", "infrastructure", "deployment"],
  },
  {
    id: "corpus-055",
    timestamp: "2025-03-07T16:30:00Z",
    branch: "legal/license",
    module_scope: ["legal"],
    summary_caption: "Added MIT license and contributor agreement",
    reference_point: "licensing",
    status_snapshot: {
      next_action: "Review with legal team",
    },
    keywords: ["legal", "license", "compliance", "opensource"],
  },
];

/**
 * Relevance labels for query→Frame pairs
 * Used to calculate precision and recall metrics
 */
export interface RelevanceLabel {
  query: string;
  relevantFrameIds: string[];
  description: string;
}

/**
 * Known relevance labels for testing recall quality
 */
export const relevanceLabels: RelevanceLabel[] = [
  {
    query: "authentication",
    relevantFrameIds: [
      "corpus-001",
      "corpus-002",
      "corpus-003",
      "corpus-004",
      "corpus-005",
      "corpus-006",
      "corpus-009",
    ],
    description: "Frames related to authentication and auth systems",
  },
  {
    query: "auth refactor",
    relevantFrameIds: ["corpus-001"],
    description: "Exact match for auth refactoring work",
  },
  {
    query: "password",
    relevantFrameIds: ["corpus-002"],
    description: "Frames specifically about password handling",
  },
  {
    query: "security",
    relevantFrameIds: [
      "corpus-001",
      "corpus-002",
      "corpus-005",
      "corpus-007",
      "corpus-010",
      "corpus-016",
    ],
    description: "Frames related to security concerns",
  },
  {
    query: "database",
    relevantFrameIds: [
      "corpus-011",
      "corpus-012",
      "corpus-013",
      "corpus-014",
      "corpus-015",
      "corpus-016",
      "corpus-017",
      "corpus-018",
      "corpus-019",
      "corpus-020",
    ],
    description: "All database-related frames",
  },
  {
    query: "ui button styling",
    relevantFrameIds: ["corpus-023"],
    description: "Specific UI button work",
  },
  {
    query: "performance",
    relevantFrameIds: [
      "corpus-012",
      "corpus-015",
      "corpus-017",
      "corpus-019",
      "corpus-030",
      "corpus-037",
      "corpus-038",
      "corpus-039",
      "corpus-044",
    ],
    description: "Performance optimization work",
  },
  {
    query: "testing",
    relevantFrameIds: ["corpus-041", "corpus-042", "corpus-043", "corpus-044", "corpus-049"],
    description: "Testing-related frames",
  },
  {
    query: "api",
    relevantFrameIds: [
      "corpus-031",
      "corpus-032",
      "corpus-033",
      "corpus-034",
      "corpus-035",
      "corpus-036",
      "corpus-037",
      "corpus-038",
      "corpus-039",
      "corpus-040",
    ],
    description: "API development work",
  },
  {
    query: "credential checking",
    relevantFrameIds: ["corpus-002", "corpus-007"],
    description: "Semantic match for password/credential work",
  },
  {
    query: "dark theme",
    relevantFrameIds: ["corpus-022"],
    description: "Semantic match for dark mode",
  },
  {
    query: "oauth",
    relevantFrameIds: ["corpus-004"],
    description: "OAuth-specific frames",
  },
  {
    query: "cache",
    relevantFrameIds: ["corpus-019", "corpus-038"],
    description: "Caching implementations",
  },
  {
    query: "docker deployment",
    relevantFrameIds: ["corpus-054"],
    description: "Docker and deployment related",
  },
  {
    query: "nonexistent topic xyz",
    relevantFrameIds: [],
    description: "Should return no results - irrelevant query",
  },
];
