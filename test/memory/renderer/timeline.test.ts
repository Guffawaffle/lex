/**
 * Unit test for timeline renderer
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  buildTimeline,
  renderTimelineText,
  renderModuleScopeEvolution,
  renderBlockerTracking,
  filterTimeline,
} from "../../../src/memory/renderer/timeline.js";

test("buildTimeline: creates timeline entries with module changes", () => {
  const frames = [
    {
      id: "frame-001",
      timestamp: "2025-11-01T14:00:00Z",
      branch: "feature/test",
      jira: "TICKET-1",
      module_scope: ["ui/login"],
      summary_caption: "First frame",
      reference_point: "test 1",
      status_snapshot: {
        next_action: "Do something",
      },
    },
    {
      id: "frame-002",
      timestamp: "2025-11-02T14:00:00Z",
      branch: "feature/test",
      jira: "TICKET-1",
      module_scope: ["ui/login", "services/auth"],
      summary_caption: "Second frame",
      reference_point: "test 2",
      status_snapshot: {
        next_action: "Do more",
      },
    },
  ];

  const timeline = buildTimeline(frames);

  assert.strictEqual(timeline.length, 2);
  assert.strictEqual(timeline[0].modulesAdded.length, 1);
  assert.strictEqual(timeline[0].modulesAdded[0], "ui/login");
  assert.strictEqual(timeline[1].modulesAdded.length, 1);
  assert.strictEqual(timeline[1].modulesAdded[0], "services/auth");
});

test("buildTimeline: tracks blocker changes", () => {
  const frames = [
    {
      id: "frame-001",
      timestamp: "2025-11-01T14:00:00Z",
      branch: "feature/test",
      module_scope: ["ui/test"],
      summary_caption: "No blockers",
      reference_point: "test 1",
      status_snapshot: {
        next_action: "Do something",
      },
    },
    {
      id: "frame-002",
      timestamp: "2025-11-02T14:00:00Z",
      branch: "feature/test",
      module_scope: ["ui/test"],
      summary_caption: "Blocker added",
      reference_point: "test 2",
      status_snapshot: {
        next_action: "Fix blocker",
        blockers: ["CORS issue"],
      },
    },
    {
      id: "frame-003",
      timestamp: "2025-11-03T14:00:00Z",
      branch: "feature/test",
      module_scope: ["ui/test"],
      summary_caption: "Blocker resolved",
      reference_point: "test 3",
      status_snapshot: {
        next_action: "Continue work",
      },
    },
  ];

  const timeline = buildTimeline(frames);

  assert.strictEqual(timeline[0].blockersAdded.length, 0);
  assert.strictEqual(timeline[1].blockersAdded.length, 1);
  assert.strictEqual(timeline[1].blockersAdded[0], "CORS issue");
  assert.strictEqual(timeline[2].blockersRemoved.length, 1);
  assert.strictEqual(timeline[2].blockersRemoved[0], "CORS issue");
});

test("filterTimeline: filters by date range", () => {
  const frames = [
    {
      id: "frame-001",
      timestamp: "2025-11-01T14:00:00Z",
      branch: "feature/test",
      module_scope: ["ui/test"],
      summary_caption: "Frame 1",
      reference_point: "test 1",
      status_snapshot: { next_action: "Do something" },
    },
    {
      id: "frame-002",
      timestamp: "2025-11-02T14:00:00Z",
      branch: "feature/test",
      module_scope: ["ui/test"],
      summary_caption: "Frame 2",
      reference_point: "test 2",
      status_snapshot: { next_action: "Do more" },
    },
    {
      id: "frame-003",
      timestamp: "2025-11-03T14:00:00Z",
      branch: "feature/test",
      module_scope: ["ui/test"],
      summary_caption: "Frame 3",
      reference_point: "test 3",
      status_snapshot: { next_action: "Do even more" },
    },
  ];

  const timeline = buildTimeline(frames);
  const filtered = filterTimeline(timeline, {
    since: new Date("2025-11-02T00:00:00Z"),
  });

  assert.strictEqual(filtered.length, 2);
  assert.strictEqual(filtered[0].frame.id, "frame-002");
  assert.strictEqual(filtered[1].frame.id, "frame-003");
});

test("renderTimelineText: produces valid text output", () => {
  const frames = [
    {
      id: "frame-001",
      timestamp: "2025-11-01T14:00:00Z",
      branch: "feature/test",
      module_scope: ["ui/test"],
      summary_caption: "Test frame",
      reference_point: "test",
      status_snapshot: {
        next_action: "Do something",
      },
    },
  ];

  const timeline = buildTimeline(frames);
  const text = renderTimelineText(timeline, "Test Timeline");

  assert.ok(text.includes("Test Timeline"));
  assert.ok(text.includes("Test frame"));
  assert.ok(text.includes("ui/test"));
});

test("renderModuleScopeEvolution: shows module usage over time", () => {
  const frames = [
    {
      id: "frame-001",
      timestamp: "2025-11-01T14:00:00Z",
      branch: "feature/test",
      module_scope: ["ui/login"],
      summary_caption: "Frame 1",
      reference_point: "test 1",
      status_snapshot: { next_action: "Do something" },
    },
    {
      id: "frame-002",
      timestamp: "2025-11-02T14:00:00Z",
      branch: "feature/test",
      module_scope: ["ui/login", "services/auth"],
      summary_caption: "Frame 2",
      reference_point: "test 2",
      status_snapshot: { next_action: "Do more" },
    },
  ];

  const timeline = buildTimeline(frames);
  const graph = renderModuleScopeEvolution(timeline);

  assert.ok(graph.includes("Module Scope Evolution"));
  assert.ok(graph.includes("ui/login"));
  assert.ok(graph.includes("services/auth"));
  assert.ok(graph.includes("(2/2 frames)"));
  assert.ok(graph.includes("(1/2 frames)"));
});

test("renderBlockerTracking: shows blocker changes", () => {
  const frames = [
    {
      id: "frame-001",
      timestamp: "2025-11-01T14:00:00Z",
      branch: "feature/test",
      module_scope: ["ui/test"],
      summary_caption: "No blockers",
      reference_point: "test 1",
      status_snapshot: {
        next_action: "Do something",
      },
    },
    {
      id: "frame-002",
      timestamp: "2025-11-02T14:00:00Z",
      branch: "feature/test",
      module_scope: ["ui/test"],
      summary_caption: "Blocker added",
      reference_point: "test 2",
      status_snapshot: {
        next_action: "Fix blocker",
        blockers: ["CORS issue"],
      },
    },
  ];

  const timeline = buildTimeline(frames);
  const tracking = renderBlockerTracking(timeline);

  assert.ok(tracking.includes("Blocker Tracking"));
  assert.ok(tracking.includes("No blockers"));
  assert.ok(tracking.includes("CORS issue"));
});
