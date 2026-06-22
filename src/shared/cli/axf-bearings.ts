/**
 * CLI Command: lex axf bearings
 *
 * Establish read-only AXF bearings for the current workspace. The command
 * separates observed local facts from conservative inferences.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCallerWorkspaceRoot } from "../config/index.js";
import { createOutput, raw } from "./output.js";

const SCHEMA_VERSION = "1.0.0";
const DEFAULT_MAX_STATUS = 50;
const DEFAULT_GIT_TIMEOUT_MS = 15000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface AxfBearingsOptions {
  json?: boolean;
  maxStatus?: number;
  startPath?: string;
}

export interface BearingFact<T> {
  value: T;
  source: string;
  note?: string;
}

export interface AxfGitRemote {
  name: string;
  url: string;
  direction: "fetch" | "push" | "unknown";
}

export interface AxfGitStatusEntry {
  code: string;
  path: string;
}

export interface AxfGitStatusSummary {
  clean: boolean | null;
  branchLine: string | null;
  total: number;
  counts: {
    added: number;
    modified: number;
    deleted: number;
    renamed: number;
    copied: number;
    untracked: number;
    conflicted: number;
    other: number;
  };
  entries: AxfGitStatusEntry[];
  truncated: boolean;
  source: string;
  error?: string;
}

export interface AxfGuidanceFile {
  path: string;
  kind: "agent-guidance" | "config" | "policy" | "project-doc" | "ax-doc";
  source: "filesystem";
}

export interface AxfBearingsReport {
  schemaVersion: typeof SCHEMA_VERSION;
  generatedAt: string;
  observed: {
    tool: {
      lex: {
        version: BearingFact<string>;
        executable: BearingFact<string | null>;
      };
      axf: {
        surface: BearingFact<"bearings">;
        schemaVersion: BearingFact<typeof SCHEMA_VERSION>;
      };
    };
    cwd: BearingFact<string>;
    workspaceRoot: BearingFact<string>;
    git: {
      root: BearingFact<string | null>;
      branch: BearingFact<string | null>;
      head: BearingFact<string | null>;
      remotes: BearingFact<AxfGitRemote[]>;
      status: AxfGitStatusSummary;
    };
    guidanceFiles: AxfGuidanceFile[];
  };
  inferred: {
    inGitRepository: boolean;
    dirtyWorktree: boolean | null;
    guidanceAvailable: boolean;
    warnings: string[];
  };
}

interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

const GUIDANCE_CANDIDATES: Array<Omit<AxfGuidanceFile, "source">> = [
  { path: "AGENTS.md", kind: "agent-guidance" },
  { path: "CLAUDE.md", kind: "agent-guidance" },
  { path: "GEMINI.md", kind: "agent-guidance" },
  { path: ".github/copilot-instructions.md", kind: "agent-guidance" },
  { path: ".cursor/rules", kind: "agent-guidance" },
  { path: "README.md", kind: "project-doc" },
  { path: "README.mcp.md", kind: "project-doc" },
  { path: "CONTRIBUTING.md", kind: "project-doc" },
  { path: "SECURITY.md", kind: "project-doc" },
  { path: "lex.yaml", kind: "config" },
  { path: ".lex.config.json", kind: "config" },
  { path: ".smartergpt/instructions/lex.md", kind: "agent-guidance" },
  { path: ".smartergpt/lex/lexmap.policy.json", kind: "policy" },
  { path: "canon/policy/lexmap.policy.json", kind: "policy" },
  { path: "docs/specs/AX-CONTRACT.md", kind: "ax-doc" },
  { path: "docs/specs/AX-AI-EXPERIENCE.md", kind: "ax-doc" },
  { path: "docs/specs/LMV-AXF-UPSTREAM-RFC.md", kind: "ax-doc" },
];

export async function axfBearings(options: AxfBearingsOptions = {}): Promise<void> {
  const report = collectAxfBearings(options);

  if (options.json) {
    const out = createOutput({
      scope: "cli:axf:bearings",
      mode: "jsonl",
    });
    out.json({ level: "info", message: "AXF bearings", data: report });
    return;
  }

  raw(formatAxfBearingsText(report));
}

export function collectAxfBearings(options: AxfBearingsOptions = {}): AxfBearingsReport {
  const cwd = resolve(options.startPath ?? process.cwd());
  const maxStatus = normalizeMaxStatus(options.maxStatus);
  const workspaceRoot = resolveCallerWorkspaceRoot({ startPath: cwd });

  const gitRootResult = runGit(["rev-parse", "--show-toplevel"], cwd);
  const gitRoot = gitRootResult.ok ? gitRootResult.stdout : null;
  const gitCwd = gitRoot ?? cwd;

  const branchResult = gitRoot ? runGit(["rev-parse", "--abbrev-ref", "HEAD"], gitCwd) : null;
  const headResult = gitRoot ? runGit(["rev-parse", "--short", "HEAD"], gitCwd) : null;
  const remotesResult = gitRoot ? runGit(["remote", "-v"], gitCwd) : null;
  const statusResult = gitRoot ? runGit(["status", "--porcelain=v1", "--branch"], gitCwd) : null;
  const status = parseStatus(statusResult, maxStatus);

  const guidanceRoot = gitRoot ?? workspaceRoot.path;
  const guidanceFiles = findGuidanceFiles(guidanceRoot);

  const warnings = inferWarnings(gitRoot, statusResult, guidanceFiles);

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    observed: {
      tool: {
        lex: {
          version: {
            value: getLexVersion(),
            source: "package.json",
          },
          executable: {
            value: process.argv[1] ? resolve(process.argv[1]) : null,
            source: "process.argv[1]",
          },
        },
        axf: {
          surface: {
            value: "bearings",
            source: "axf-bearings",
          },
          schemaVersion: {
            value: SCHEMA_VERSION,
            source: "axf-bearings",
          },
        },
      },
      cwd: {
        value: cwd,
        source: "process.cwd",
      },
      workspaceRoot: {
        value: workspaceRoot.path,
        source: workspaceRoot.source,
      },
      git: {
        root: {
          value: gitRoot,
          source: "git rev-parse --show-toplevel",
          ...(gitRootResult.ok ? {} : { note: gitRootResult.stderr || "not a git repository" }),
        },
        branch: {
          value: normalizeBranch(branchResult?.stdout ?? null),
          source: "git rev-parse --abbrev-ref HEAD",
          ...(branchResult?.ok === false ? { note: branchResult.stderr } : {}),
        },
        head: {
          value: headResult?.ok ? headResult.stdout : null,
          source: "git rev-parse --short HEAD",
          ...(headResult?.ok === false ? { note: headResult.stderr } : {}),
        },
        remotes: {
          value: parseRemotes(remotesResult?.stdout ?? ""),
          source: "git remote -v",
          ...(remotesResult?.ok === false ? { note: remotesResult.stderr } : {}),
        },
        status,
      },
      guidanceFiles,
    },
    inferred: {
      inGitRepository: gitRoot !== null,
      dirtyWorktree: status.clean === null ? null : status.clean === false,
      guidanceAvailable: guidanceFiles.length > 0,
      warnings,
    },
  };
}

export function formatAxfBearingsText(report: AxfBearingsReport): string {
  const status = report.observed.git.status;
  const gitRoot = report.observed.git.root.value ?? "not observed";
  const branch = report.observed.git.branch.value ?? "not observed";
  const head = report.observed.git.head.value ?? "not observed";
  const remotes = report.observed.git.remotes.value;
  const guidance = report.observed.guidanceFiles;
  const lexVersion = report.observed.tool.lex.version.value;
  const lexExecutable = report.observed.tool.lex.executable.value ?? "not observed";
  const axfSchema = report.observed.tool.axf.schemaVersion.value;

  const lines = [
    "AXF Bearings",
    "",
    "Observed:",
    `- tool: lex ${lexVersion} via ${lexExecutable}; axf bearings schema ${axfSchema}`,
    `- cwd: ${report.observed.cwd.value}`,
    `- workspace: ${report.observed.workspaceRoot.value} (${report.observed.workspaceRoot.source})`,
    `- git root: ${gitRoot}`,
    `- git: ${formatGitSummary(branch, head, status)}`,
    `- remotes: ${formatRemotesSummary(remotes)}`,
    `- guidance: ${formatGuidanceSummary(guidance)}`,
    "",
    "Inferred:",
    `- ${formatGitInference(report)}`,
  ];

  if (report.inferred.warnings.length > 0) {
    lines.push(`- warnings: ${report.inferred.warnings.join("; ")}`);
  }

  return lines.join("\n");
}

function normalizeMaxStatus(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) {
    return DEFAULT_MAX_STATUS;
  }
  return Math.max(0, Math.floor(value));
}

function getLexVersion(): string {
  try {
    const packagePath = join(__dirname, "..", "..", "..", "package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf-8")) as {
      version?: unknown;
    };
    return typeof packageJson.version === "string" ? packageJson.version : "unknown";
  } catch {
    return "unknown";
  }
}

function runGit(args: string[], cwd: string): GitResult {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf-8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_OPTIONAL_LOCKS: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: getGitTimeoutMs(),
  });

  if (result.error) {
    return {
      ok: false,
      stdout: "",
      stderr: result.error.message,
    };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      stdout: String(result.stdout || "").trim(),
      stderr: String(result.stderr || "").trim(),
    };
  }

  return {
    ok: true,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
  };
}

function getGitTimeoutMs(): number {
  const raw = process.env.LEX_AXF_BEARINGS_GIT_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_GIT_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GIT_TIMEOUT_MS;
}

function normalizeBranch(branch: string | null): string | null {
  if (!branch) {
    return null;
  }
  return branch === "HEAD" ? "detached" : branch;
}

function parseRemotes(raw: string): AxfGitRemote[] {
  if (!raw.trim()) {
    return [];
  }

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", url = "", rawDirection = ""] = line.split(/\s+/);
      const direction: AxfGitRemote["direction"] = rawDirection.includes("fetch")
        ? "fetch"
        : rawDirection.includes("push")
          ? "push"
          : "unknown";
      return { name, url, direction };
    })
    .filter((remote) => remote.name.length > 0 && remote.url.length > 0);
}

function parseStatus(result: GitResult | null, maxEntries: number): AxfGitStatusSummary {
  if (!result || !result.ok) {
    return {
      clean: null,
      branchLine: null,
      total: 0,
      counts: emptyStatusCounts(),
      entries: [],
      truncated: false,
      source: "git status --porcelain=v1 --branch",
      ...(result?.stderr ? { error: result.stderr } : {}),
    };
  }

  const lines = result.stdout ? result.stdout.split(/\r?\n/) : [];
  const branchLine = lines.find((line) => line.startsWith("## ")) ?? null;
  const statusLines = lines.filter((line) => !line.startsWith("## ") && line.length > 0);
  const counts = emptyStatusCounts();

  for (const line of statusLines) {
    const code = line.slice(0, 2);
    if (code.includes("?")) {
      counts.untracked += 1;
    } else if (code.includes("U") || code === "AA" || code === "DD") {
      counts.conflicted += 1;
    } else if (code.includes("R")) {
      counts.renamed += 1;
    } else if (code.includes("C")) {
      counts.copied += 1;
    } else if (code.includes("A")) {
      counts.added += 1;
    } else if (code.includes("D")) {
      counts.deleted += 1;
    } else if (code.includes("M")) {
      counts.modified += 1;
    } else {
      counts.other += 1;
    }
  }

  return {
    clean: statusLines.length === 0,
    branchLine,
    total: statusLines.length,
    counts,
    entries: statusLines.slice(0, maxEntries).map((line) => ({
      code: line.slice(0, 2).trim() || "unknown",
      path: line.slice(3),
    })),
    truncated: statusLines.length > maxEntries,
    source: "git status --porcelain=v1 --branch",
  };
}

function emptyStatusCounts(): AxfGitStatusSummary["counts"] {
  return {
    added: 0,
    modified: 0,
    deleted: 0,
    renamed: 0,
    copied: 0,
    untracked: 0,
    conflicted: 0,
    other: 0,
  };
}

function findGuidanceFiles(root: string): AxfGuidanceFile[] {
  return GUIDANCE_CANDIDATES.filter((candidate) => pathExists(join(root, candidate.path))).map(
    (candidate) => ({
      ...candidate,
      source: "filesystem",
    })
  );
}

function inferWarnings(
  gitRoot: string | null,
  statusResult: GitResult | null,
  guidanceFiles: AxfGuidanceFile[]
): string[] {
  const warnings: string[] = [];
  if (!gitRoot) {
    warnings.push("No git repository root was observed from the current directory.");
  }
  if (statusResult && !statusResult.ok) {
    warnings.push("Git status could not be observed.");
  }
  if (guidanceFiles.length === 0) {
    warnings.push("No common repo-local guidance files were observed.");
  }
  return warnings;
}

function pathExists(path: string): boolean {
  try {
    const stat = statSync(path);
    return stat.isFile() || stat.isDirectory();
  } catch {
    return false;
  }
}

function formatGitSummary(branch: string, head: string, status: AxfGitStatusSummary): string {
  const statusText = formatStatusSummary(status);
  const divergence = parseBranchDivergence(status.branchLine);
  const divergenceText = divergence ? `, ${divergence}` : "";
  return `${branch} @ ${head}, ${statusText}${divergenceText}`;
}

function formatStatusSummary(status: AxfGitStatusSummary): string {
  if (status.clean === null) {
    return status.error ? `not observed (${status.error})` : "not observed";
  }
  if (status.clean) {
    return "clean";
  }

  return `dirty ${status.total} ${status.total === 1 ? "change" : "changes"}`;
}

function parseBranchDivergence(branchLine: string | null): string | null {
  if (!branchLine) {
    return null;
  }

  const match = branchLine.match(/\[(?<divergence>[^\]]+)\]/);
  return match?.groups?.divergence ?? null;
}

function formatRemotesSummary(remotes: AxfGitRemote[]): string {
  if (remotes.length === 0) {
    return "none observed";
  }

  const byName = new Map<string, Set<string>>();
  for (const remote of remotes) {
    const directions = byName.get(remote.name) ?? new Set<string>();
    directions.add(remote.direction);
    byName.set(remote.name, directions);
  }

  return Array.from(byName.entries())
    .map(([name, directions]) => `${name} ${Array.from(directions).sort().join("/")}`)
    .join(", ");
}

function formatGuidanceSummary(guidance: AxfGuidanceFile[]): string {
  if (guidance.length === 0) {
    return "none observed";
  }

  const keyGuidance = selectKeyGuidance(guidance);
  return `${guidance.length} files observed; key: ${keyGuidance.join(", ")}`;
}

function selectKeyGuidance(guidance: AxfGuidanceFile[]): string[] {
  const preferred = [
    "AGENTS.md",
    ".github/copilot-instructions.md",
    "README.md",
    "CONTRIBUTING.md",
    "docs/specs/AX-CONTRACT.md",
  ];
  const observed = new Set(guidance.map((file) => file.path));
  const key = preferred.filter((path) => observed.has(path));
  return key.length > 0 ? key.slice(0, 4) : guidance.slice(0, 4).map((file) => file.path);
}

function formatGitInference(report: AxfBearingsReport): string {
  if (!report.inferred.inGitRepository) {
    return "no git repository was observed from this directory";
  }

  if (report.inferred.dirtyWorktree === true) {
    return "attached to a git repo with a dirty worktree";
  }

  if (report.inferred.dirtyWorktree === false) {
    return "attached to a git repo with a clean worktree";
  }

  return "attached to a git repo; worktree dirtiness was not observed";
}
