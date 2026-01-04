/**
 * Unit tests for wave completion frame generation
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import {
  WaveCompleteContent,
  WaveIssue,
  WaveDuration,
  WaveMetrics,
  NextWave,
  formatElapsedTime,
  generateSummaryCaption,
  generateWaveKeywords,
} from "../../../src/memory/frames/wave-complete.js";

describe("Wave Completion Frame Schema Validation", () => {
  test("should validate WaveIssue schema", () => {
    const issue = {
      ref: "lexsona#111",
      title: "Explain Constraint Derivation",
      closedAt: "2026-01-02T06:00:00Z",
      pr: "lexsona#115",
    };

    const result = WaveIssue.safeParse(issue);
    assert.ok(result.success, "WaveIssue should validate successfully");
    assert.deepStrictEqual(result.data, issue);
  });

  test("should validate WaveIssue without PR", () => {
    const issue = {
      ref: "lex#647",
      title: "Contradiction Detection",
      closedAt: "2026-01-02T05:30:00Z",
    };

    const result = WaveIssue.safeParse(issue);
    assert.ok(result.success, "WaveIssue without PR should validate");
    assert.strictEqual(result.data?.pr, undefined);
  });

  test("should validate WaveDuration schema", () => {
    const duration = {
      started: "2026-01-02T03:00:00Z",
      completed: "2026-01-02T06:45:00Z",
      elapsed: "3h 45m",
    };

    const result = WaveDuration.safeParse(duration);
    assert.ok(result.success, "WaveDuration should validate successfully");
    assert.deepStrictEqual(result.data, duration);
  });

  test("should validate WaveMetrics schema", () => {
    const metrics = {
      issueCount: 6,
      prCount: 6,
      linesAdded: 7500,
      linesRemoved: 200,
      testsAdded: 169,
    };

    const result = WaveMetrics.safeParse(metrics);
    assert.ok(result.success, "WaveMetrics should validate successfully");
    assert.deepStrictEqual(result.data, metrics);
  });

  test("should validate NextWave schema", () => {
    const nextWave = {
      suggested: ["lex#660", "lex#661"],
      rationale: "Based on remaining issues in lexrunner#653",
    };

    const result = NextWave.safeParse(nextWave);
    assert.ok(result.success, "NextWave should validate successfully");
    assert.deepStrictEqual(result.data, nextWave);
  });

  test("should validate WaveCompleteContent schema", () => {
    const content = {
      waveId: "wave-2",
      epicRef: "lexrunner#653",
      issues: [
        {
          ref: "lexsona#111",
          title: "Explain Constraint Derivation",
          closedAt: "2026-01-02T06:00:00Z",
          pr: "lexsona#115",
        },
        {
          ref: "lex#647",
          title: "Contradiction Detection",
          closedAt: "2026-01-02T05:30:00Z",
          pr: "lex#650",
        },
      ],
      duration: {
        started: "2026-01-02T03:00:00Z",
        completed: "2026-01-02T06:45:00Z",
        elapsed: "3h 45m",
      },
      metrics: {
        issueCount: 6,
        prCount: 6,
        linesAdded: 7500,
        linesRemoved: 200,
        testsAdded: 169,
      },
      nextWave: {
        suggested: ["lex#660", "lex#661"],
        rationale: "Based on remaining issues in lexrunner#653",
      },
    };

    const result = WaveCompleteContent.safeParse(content);
    assert.ok(result.success, "WaveCompleteContent should validate successfully");
    assert.deepStrictEqual(result.data, content);
  });

  test("should validate WaveCompleteContent without nextWave", () => {
    const content = {
      waveId: "wave-1",
      epicRef: "lexrunner#653",
      issues: [],
      duration: {
        started: "2026-01-02T03:00:00Z",
        completed: "2026-01-02T03:00:00Z",
        elapsed: "0m",
      },
      metrics: {
        issueCount: 0,
        prCount: 0,
        linesAdded: 0,
        linesRemoved: 0,
        testsAdded: 0,
      },
    };

    const result = WaveCompleteContent.safeParse(content);
    assert.ok(result.success, "WaveCompleteContent without nextWave should validate");
    assert.strictEqual(result.data?.nextWave, undefined);
  });
});

describe("formatElapsedTime", () => {
  test("should format minutes correctly", () => {
    const start = "2026-01-02T03:00:00Z";
    const end = "2026-01-02T03:15:00Z";
    const elapsed = formatElapsedTime(start, end);
    assert.strictEqual(elapsed, "15m");
  });

  test("should format hours and minutes correctly", () => {
    const start = "2026-01-02T03:00:00Z";
    const end = "2026-01-02T06:45:00Z";
    const elapsed = formatElapsedTime(start, end);
    assert.strictEqual(elapsed, "3h 45m");
  });

  test("should format days, hours, and minutes correctly", () => {
    const start = "2026-01-02T03:00:00Z";
    const end = "2026-01-04T05:30:00Z";
    const elapsed = formatElapsedTime(start, end);
    assert.strictEqual(elapsed, "2d 2h 30m");
  });

  test("should handle exact hours", () => {
    const start = "2026-01-02T03:00:00Z";
    const end = "2026-01-02T06:00:00Z";
    const elapsed = formatElapsedTime(start, end);
    assert.strictEqual(elapsed, "3h");
  });

  test("should handle exact days", () => {
    const start = "2026-01-02T00:00:00Z";
    const end = "2026-01-04T00:00:00Z";
    const elapsed = formatElapsedTime(start, end);
    assert.strictEqual(elapsed, "2d");
  });

  test("should handle zero duration", () => {
    const start = "2026-01-02T03:00:00Z";
    const end = "2026-01-02T03:00:00Z";
    const elapsed = formatElapsedTime(start, end);
    assert.strictEqual(elapsed, "0m");
  });

  test("should handle negative duration (end before start)", () => {
    const start = "2026-01-02T06:00:00Z";
    const end = "2026-01-02T03:00:00Z";
    const elapsed = formatElapsedTime(start, end);
    assert.strictEqual(elapsed, "0m");
  });

  test("should omit zero components", () => {
    const start = "2026-01-02T03:00:00Z";
    const end = "2026-01-02T03:45:00Z";
    const elapsed = formatElapsedTime(start, end);
    assert.strictEqual(elapsed, "45m");
  });
});

describe("generateSummaryCaption", () => {
  test("should generate caption with positive net lines", () => {
    const content: WaveCompleteContent = {
      waveId: "wave-2",
      epicRef: "lexrunner#653",
      issues: [],
      duration: {
        started: "2026-01-02T03:00:00Z",
        completed: "2026-01-02T06:45:00Z",
        elapsed: "3h 45m",
      },
      metrics: {
        issueCount: 6,
        prCount: 6,
        linesAdded: 7500,
        linesRemoved: 200,
        testsAdded: 169,
      },
    };

    const caption = generateSummaryCaption(content);
    assert.strictEqual(
      caption,
      "wave-2 complete: 6 issues closed, +7300 lines, 169 tests added (3h 45m)"
    );
  });

  test("should generate caption with negative net lines", () => {
    const content: WaveCompleteContent = {
      waveId: "wave-1",
      epicRef: "lexrunner#653",
      issues: [],
      duration: {
        started: "2026-01-02T03:00:00Z",
        completed: "2026-01-02T04:00:00Z",
        elapsed: "1h",
      },
      metrics: {
        issueCount: 3,
        prCount: 3,
        linesAdded: 500,
        linesRemoved: 1000,
        testsAdded: 10,
      },
    };

    const caption = generateSummaryCaption(content);
    assert.strictEqual(
      caption,
      "wave-1 complete: 3 issues closed, -500 lines, 10 tests added (1h)"
    );
  });

  test("should generate caption with zero net lines", () => {
    const content: WaveCompleteContent = {
      waveId: "wave-3",
      epicRef: "lexrunner#653",
      issues: [],
      duration: {
        started: "2026-01-02T03:00:00Z",
        completed: "2026-01-02T03:30:00Z",
        elapsed: "30m",
      },
      metrics: {
        issueCount: 2,
        prCount: 2,
        linesAdded: 1000,
        linesRemoved: 1000,
        testsAdded: 5,
      },
    };

    const caption = generateSummaryCaption(content);
    assert.strictEqual(caption, "wave-3 complete: 2 issues closed, +0 lines, 5 tests added (30m)");
  });
});

describe("generateWaveKeywords", () => {
  test("should generate keywords with epic labels", () => {
    const content: WaveCompleteContent = {
      waveId: "wave-2",
      epicRef: "lexrunner#653",
      issues: [],
      duration: {
        started: "2026-01-02T03:00:00Z",
        completed: "2026-01-02T06:45:00Z",
        elapsed: "3h 45m",
      },
      metrics: {
        issueCount: 6,
        prCount: 6,
        linesAdded: 7500,
        linesRemoved: 200,
        testsAdded: 169,
      },
    };

    const keywords = generateWaveKeywords(content, ["tailored-suite", "governance"]);
    assert.deepStrictEqual(keywords, [
      "wave",
      "fanout",
      "complete",
      "wave-2",
      "tailored-suite",
      "governance",
    ]);
  });

  test("should generate keywords without epic labels", () => {
    const content: WaveCompleteContent = {
      waveId: "wave-1",
      epicRef: "lexrunner#653",
      issues: [],
      duration: {
        started: "2026-01-02T03:00:00Z",
        completed: "2026-01-02T03:00:00Z",
        elapsed: "0m",
      },
      metrics: {
        issueCount: 0,
        prCount: 0,
        linesAdded: 0,
        linesRemoved: 0,
        testsAdded: 0,
      },
    };

    const keywords = generateWaveKeywords(content);
    assert.deepStrictEqual(keywords, ["wave", "fanout", "complete", "wave-1"]);
  });

  test("should include all provided epic labels", () => {
    const content: WaveCompleteContent = {
      waveId: "wave-3",
      epicRef: "lexrunner#653",
      issues: [],
      duration: {
        started: "2026-01-02T03:00:00Z",
        completed: "2026-01-02T03:00:00Z",
        elapsed: "0m",
      },
      metrics: {
        issueCount: 0,
        prCount: 0,
        linesAdded: 0,
        linesRemoved: 0,
        testsAdded: 0,
      },
    };

    const keywords = generateWaveKeywords(content, ["label1", "label2", "label3"]);
    assert.deepStrictEqual(keywords, [
      "wave",
      "fanout",
      "complete",
      "wave-3",
      "label1",
      "label2",
      "label3",
    ]);
  });
});
