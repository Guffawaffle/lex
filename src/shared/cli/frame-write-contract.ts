import { spawnSync } from "node:child_process";
import { minimatch } from "minimatch";
import type { Frame } from "../types/frame.js";
import type { Policy } from "../types/policy.js";

export const UNSCOPED_MODULE_ID = "workspace/unscoped";
const MAX_SUGGESTIONS = 5;
const MAX_EVIDENCE = 8;

export type ModuleAttributionMode = "explicit" | "inferred" | "fallback";
export type ModuleAttributionConfidence = "high" | "medium" | "low";

export interface ModuleAttribution {
  mode: ModuleAttributionMode;
  confidence: ModuleAttributionConfidence;
  evidence: string[];
}

export interface ModuleSuggestion {
  moduleId: string;
  confidence: ModuleAttributionConfidence;
  reasons: string[];
}

export interface FrameWriteContract {
  requiredFields: string[];
  recommendedFields: string[];
  policy: {
    state: "loaded" | "unavailable";
    moduleCount: number;
  };
  inference: {
    available: boolean;
    argument: "--modules auto";
  };
  fallback: {
    available: true;
    moduleId: typeof UNSCOPED_MODULE_ID;
    argument: "--modules unscoped";
  };
  suggestions: ModuleSuggestion[];
  compact: string;
}

interface ContractOptions {
  policy: Policy | null;
  projectRoot: string;
  branch?: string;
  query?: string;
  recentFrames?: Frame[];
}

interface ScoredSuggestion {
  moduleId: string;
  score: number;
  reasons: Set<string>;
}

function changedPaths(projectRoot: string): string[] {
  const result = spawnSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
    cwd: projectRoot,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0 || result.error) return [];

  return (result.stdout || "")
    .split("\0")
    .filter(Boolean)
    .map((entry) => (/^.. /.test(entry) ? entry.slice(3) : entry))
    .map((entry) => entry.replace(/\\/g, "/"));
}

function confidenceFor(score: number): ModuleAttributionConfidence {
  if (score >= 100) return "high";
  if (score >= 30) return "medium";
  return "low";
}

function normalizedTerms(value?: string): string[] {
  return (value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3);
}

function matchesOwnedPath(filePath: string, patterns: string[]): boolean {
  const normalizedPath = filePath.replace(/\\/g, "/");
  return patterns.some((pattern) =>
    minimatch(normalizedPath, pattern.replace(/\\/g, "/"), { dot: true })
  );
}

export function suggestModules(options: ContractOptions): ModuleSuggestion[] {
  if (!options.policy || Object.keys(options.policy.modules).length === 0) {
    return [
      {
        moduleId: UNSCOPED_MODULE_ID,
        confidence: "low",
        reasons: ["policy-unavailable"],
      },
    ];
  }

  const scores = new Map<string, ScoredSuggestion>();
  for (const moduleId of Object.keys(options.policy.modules).sort()) {
    scores.set(moduleId, { moduleId, score: 0, reasons: new Set() });
  }

  for (const filePath of changedPaths(options.projectRoot)) {
    for (const [moduleId, module] of Object.entries(options.policy.modules)) {
      const patterns = module.owns_paths || [];
      if (matchesOwnedPath(filePath, patterns)) {
        const entry = scores.get(moduleId)!;
        entry.score += 100;
        entry.reasons.add(`changed-path:${filePath}`);
      }
    }
  }

  const terms = normalizedTerms(options.query);
  if (terms.length > 0) {
    for (const [moduleId, module] of Object.entries(options.policy.modules)) {
      const searchable = [moduleId, ...(module.owns_paths || [])].join(" ").toLowerCase();
      const matches = terms.filter((term) => searchable.includes(term));
      if (matches.length > 0) {
        const entry = scores.get(moduleId)!;
        entry.score += Math.min(60, matches.length * 20);
        entry.reasons.add(`intent:${matches.slice(0, 3).join(",")}`);
      }
    }
  }

  for (const [index, frame] of (options.recentFrames || []).slice(0, 10).entries()) {
    for (const moduleId of frame.module_scope) {
      const entry = scores.get(moduleId);
      if (!entry) continue;
      const branchMatch = Boolean(options.branch && frame.branch === options.branch);
      entry.score += branchMatch ? 50 : Math.max(5, 20 - index);
      entry.reasons.add(branchMatch ? "recent-frame:branch-match" : "recent-frame");
    }
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score || a.moduleId.localeCompare(b.moduleId))
    .slice(0, MAX_SUGGESTIONS)
    .map((entry) => ({
      moduleId: entry.moduleId,
      confidence: confidenceFor(entry.score),
      reasons:
        entry.reasons.size > 0 ? [...entry.reasons].slice(0, MAX_EVIDENCE) : ["policy-module"],
    }));
}

export function buildFrameWriteContract(options: ContractOptions): FrameWriteContract {
  const suggestions = suggestModules(options);
  const policyLoaded = Boolean(options.policy);
  return {
    requiredFields: ["summary", "modules"],
    recommendedFields: ["referencePoint", "next"],
    policy: {
      state: policyLoaded ? "loaded" : "unavailable",
      moduleCount: options.policy ? Object.keys(options.policy.modules).length : 0,
    },
    inference: {
      available: suggestions.some((item) => item.moduleId !== UNSCOPED_MODULE_ID),
      argument: "--modules auto",
    },
    fallback: {
      available: true,
      moduleId: UNSCOPED_MODULE_ID,
      argument: "--modules unscoped",
    },
    suggestions,
    compact: policyLoaded
      ? "Frame write contract: summary + modules required; use --modules auto or explicit policy IDs; next/reference-point recommended."
      : `Frame write contract: summary + modules required; policy unavailable; use --modules auto or --modules unscoped (${UNSCOPED_MODULE_ID}); next/reference-point recommended.`,
  };
}

export function resolveModuleAttribution(
  requestedModules: string[],
  contract: FrameWriteContract
): { modules: string[]; attribution: ModuleAttribution } {
  const normalized = requestedModules.map((item) => item.trim()).filter(Boolean);
  const requestsAuto = normalized.length === 1 && normalized[0].toLowerCase() === "auto";
  const requestsFallback =
    normalized.length === 1 &&
    ["unscoped", UNSCOPED_MODULE_ID].includes(normalized[0].toLowerCase());

  if (requestsFallback || (requestsAuto && contract.policy.state === "unavailable")) {
    return {
      modules: [UNSCOPED_MODULE_ID],
      attribution: {
        mode: "fallback",
        confidence: "low",
        evidence: [requestsFallback ? "explicit-unscoped-fallback" : "policy-unavailable"],
      },
    };
  }

  if (requestsAuto) {
    const suggestion = contract.suggestions[0];
    if (!suggestion || suggestion.moduleId === UNSCOPED_MODULE_ID) {
      throw new Error(
        "Module inference produced no policy-backed suggestion; use --modules <policy-id> or --modules unscoped."
      );
    }
    return {
      modules: [suggestion.moduleId],
      attribution: {
        mode: "inferred",
        confidence: suggestion.confidence,
        evidence: suggestion.reasons,
      },
    };
  }

  return {
    modules: normalized,
    attribution: {
      mode: "explicit",
      confidence: "high",
      evidence: ["cli:--modules"],
    },
  };
}
