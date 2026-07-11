import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export interface StoreCandidate {
  path: string;
  canonicalPath: string;
  source: string;
  selected: boolean;
  exists: boolean;
}

export interface StoreIdentityResolution {
  path: string;
  canonicalPath: string;
  identity: string;
  exists: boolean;
  candidates: StoreCandidate[];
}

export function canonicalizeStorePath(path: string): string {
  const absolute = resolve(path);
  if (!existsSync(absolute)) return absolute;

  try {
    return realpathSync.native(absolute);
  } catch {
    return absolute;
  }
}

function pathKey(path: string): string {
  const canonical = canonicalizeStorePath(path);
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

export function createStoreIdentity(canonicalPath: string): string {
  const key = process.platform === "win32" ? canonicalPath.toLowerCase() : canonicalPath;
  const digest = createHash("sha256").update(key).digest("hex").slice(0, 16);
  return `path-v1:${digest}`;
}

/**
 * Resolve the active store identity and discover existing conventional stores nearby.
 * Ancestor scanning catches shared multi-repo stores such as D:\dev\.smartergpt\lex\memory.db.
 */
export function resolveStoreIdentity(
  selectedPath: string,
  selectedSource: string,
  projectRoot: string
): StoreIdentityResolution {
  const candidates = new Map<string, { path: string; source: string }>();
  const add = (path: string, source: string) => {
    const absolute = resolve(path);
    const key = pathKey(absolute);
    if (!candidates.has(key)) candidates.set(key, { path: absolute, source });
  };

  add(selectedPath, selectedSource);

  let current = resolve(projectRoot);
  while (true) {
    add(join(current, ".smartergpt", "lex", "memory.db"), "ancestor-default");
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  add(join(projectRoot, "lex-memory.db"), "legacy-workspace-default");
  add(join(homedir(), ".smartergpt", "lex", "memory.db"), "user-default");

  const selectedKey = pathKey(selectedPath);
  const resolvedCandidates = [...candidates.entries()]
    .map(([key, candidate]) => ({
      path: candidate.path,
      canonicalPath: canonicalizeStorePath(candidate.path),
      source: candidate.source,
      selected: key === selectedKey,
      exists: existsSync(candidate.path),
    }))
    .filter((candidate) => candidate.selected || candidate.exists)
    .sort((a, b) => Number(b.selected) - Number(a.selected) || a.path.localeCompare(b.path));
  const canonicalPath = canonicalizeStorePath(selectedPath);

  return {
    path: selectedPath,
    canonicalPath,
    identity: createStoreIdentity(canonicalPath),
    exists: existsSync(selectedPath),
    candidates: resolvedCandidates,
  };
}

export function alternateStoreWarning(resolution: StoreIdentityResolution): string | null {
  const alternates = resolution.candidates.filter(
    (candidate) => candidate.exists && !candidate.selected
  );
  if (alternates.length === 0) return null;

  return `Selected ${resolution.canonicalPath}; also found ${alternates
    .slice(0, 3)
    .map((candidate) => candidate.canonicalPath)
    .join(", ")}. Verify LEX_DB_PATH when CLI and MCP counts differ.`;
}
