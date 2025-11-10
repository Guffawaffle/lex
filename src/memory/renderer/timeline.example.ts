import { getLogger } from "lex/logger";
import {
  buildTimeline,
  renderTimelineText,
  renderModuleScopeEvolution,
  renderBlockerTracking,
  renderTimelineHTML,
} from "./timeline.js";
import type { Frame } from "./types.js";
import { writeFileSync } from "fs";

const logger = getLogger("memory:renderer:timeline.example");

// Example frames for TICKET-123: Add user authentication
const frames: Frame[] = [
  {
    id: "frame-abc123",
    timestamp: "2025-11-01T14:00:00-05:00",
    branch: "feature/user-auth",
    jira: "TICKET-123",
    module_scope: ["ui/login-form"],
    summary_caption: "Started implementation",
    reference_point: "auth login start",
    status_snapshot: {
      next_action: "Build login form UI components",
    },
  },
  {
    id: "frame-def456",
    timestamp: "2025-11-02T09:30:00-05:00",
    branch: "feature/user-auth",
    jira: "TICKET-123",
    module_scope: ["ui/login-form", "services/auth-core"],
    summary_caption: "Auth API integration",
    reference_point: "auth api integration",
    status_snapshot: {
      next_action: "Configure CORS headers for auth endpoint",
      blockers: ["CORS configuration issue"],
    },
  },
  {
    id: "frame-ghi789",
    timestamp: "2025-11-02T16:45:00-05:00",
    branch: "feature/user-auth",
    jira: "TICKET-123",
    module_scope: ["ui/login-form", "services/auth-core"],
    summary_caption: "Fixed CORS, tests failing",
    reference_point: "cors fixed but tests failing",
    status_snapshot: {
      next_action: "Debug and fix test_login_flow failure",
      tests_failing: ["test_login_flow"],
    },
  },
  {
    id: "frame-jkl012",
    timestamp: "2025-11-03T11:20:00-05:00",
    branch: "feature/user-auth",
    jira: "TICKET-123",
    module_scope: ["ui/login-form", "services/auth-core"],
    summary_caption: "All tests passing",
    reference_point: "tests passing ready for review",
    status_snapshot: {
      next_action: "Submit PR and request code review",
    },
  },
];

// Build timeline
const timeline = buildTimeline(frames);

// Render text output
logger.info("=".repeat(80));
logger.info("TIMELINE TEXT OUTPUT");
logger.info("=".repeat(80));
logger.info("TIMELINE TEXT OUTPUT");
logger.info("=".repeat(80));
logger.info("");
const textOutput = renderTimelineText(timeline, "TICKET-123: Add user authentication");
logger.info(textOutput);

// Module scope evolution
logger.info("=".repeat(80));
logger.info("MODULE SCOPE EVOLUTION");
logger.info("=".repeat(80));
const evolutionGraph = renderModuleScopeEvolution(timeline);
logger.info(evolutionGraph);

// Blocker tracking
logger.info("=".repeat(80));
logger.info("BLOCKER TRACKING");
logger.info("=".repeat(80));
const blockerTracking = renderBlockerTracking(timeline);
logger.info(blockerTracking);

// Generate HTML output (optional)
const htmlOutput = renderTimelineHTML(timeline, "TICKET-123: Add user authentication");
logger.info("=".repeat(80));
logger.info("HTML OUTPUT (preview)");
logger.info("=".repeat(80));
logger.info("HTML file would be written to disk.");
logger.info(`Length: ${htmlOutput.length} characters`);
logger.info(`Contains title: ${htmlOutput.includes("TICKET-123")}`);
logger.info("");

// Uncomment to write HTML to file:
// writeFileSync('/tmp/timeline-example.html', htmlOutput, 'utf-8');
// logger.info('✓ HTML timeline written to /tmp/timeline-example.html');
