/**
 * Project Detection Module
 *
 * Detects project type and framework based on configuration files and directory structure.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

export interface ProjectDetection {
  type: ProjectType[];
  frameworks: string[];
  hasGit: boolean;
  hasVSCode: boolean;
  hasCursor: boolean;
}

export type ProjectType =
  | "nodejs"
  | "python"
  | "rust"
  | "go"
  | "java"
  | "dotnet"
  | "ruby"
  | "unknown";

/**
 * Detect project type(s) and frameworks in the given directory
 */
export function detectProject(projectRoot: string): ProjectDetection {
  const types: ProjectType[] = [];
  const frameworks: string[] = [];

  // Node.js detection
  if (existsSync(join(projectRoot, "package.json"))) {
    types.push("nodejs");

    try {
      const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf-8"));

      // Detect frameworks
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      if (deps.react || deps["@types/react"]) frameworks.push("React");
      if (deps.next) frameworks.push("Next.js");
      if (deps.express) frameworks.push("Express");
      if (deps.vue) frameworks.push("Vue");
      if (deps["@angular/core"]) frameworks.push("Angular");
      if (deps.svelte) frameworks.push("Svelte");
      if (deps.vitest) frameworks.push("Vitest");
      if (deps.jest) frameworks.push("Jest");
      if (deps.typescript) frameworks.push("TypeScript");
    } catch {
      // Ignore JSON parse errors
    }
  }

  // Python detection
  if (
    existsSync(join(projectRoot, "pyproject.toml")) ||
    existsSync(join(projectRoot, "setup.py")) ||
    existsSync(join(projectRoot, "requirements.txt"))
  ) {
    types.push("python");

    if (existsSync(join(projectRoot, "pyproject.toml"))) {
      try {
        const content = readFileSync(join(projectRoot, "pyproject.toml"), "utf-8");
        if (content.includes("django")) frameworks.push("Django");
        if (content.includes("flask")) frameworks.push("Flask");
        if (content.includes("fastapi")) frameworks.push("FastAPI");
      } catch {
        // Ignore read errors
      }
    }
  }

  // Rust detection
  if (existsSync(join(projectRoot, "Cargo.toml"))) {
    types.push("rust");
  }

  // Go detection
  if (existsSync(join(projectRoot, "go.mod"))) {
    types.push("go");
  }

  // Java detection
  if (
    existsSync(join(projectRoot, "pom.xml")) ||
    existsSync(join(projectRoot, "build.gradle")) ||
    existsSync(join(projectRoot, "build.gradle.kts"))
  ) {
    types.push("java");
  }

  // .NET detection
  if (existsSync(join(projectRoot, "*.csproj")) || existsSync(join(projectRoot, "*.sln"))) {
    types.push("dotnet");
  }

  // Ruby detection
  if (existsSync(join(projectRoot, "Gemfile"))) {
    types.push("ruby");

    try {
      const gemfile = readFileSync(join(projectRoot, "Gemfile"), "utf-8");
      if (gemfile.includes("rails")) frameworks.push("Rails");
    } catch {
      // Ignore read errors
    }
  }

  // IDE detection
  const hasVSCode = existsSync(join(projectRoot, ".vscode"));
  const hasCursor = existsSync(join(projectRoot, ".cursor"));
  const hasGit = existsSync(join(projectRoot, ".git"));

  return {
    type: types.length > 0 ? types : ["unknown"],
    frameworks,
    hasGit,
    hasVSCode,
    hasCursor,
  };
}

/**
 * Get human-readable project description
 */
export function describeProject(detection: ProjectDetection): string {
  const parts: string[] = [];

  if (detection.type.includes("nodejs")) {
    parts.push(detection.frameworks.includes("TypeScript") ? "TypeScript" : "JavaScript");
  }

  if (detection.type.includes("python")) parts.push("Python");
  if (detection.type.includes("rust")) parts.push("Rust");
  if (detection.type.includes("go")) parts.push("Go");
  if (detection.type.includes("java")) parts.push("Java");
  if (detection.type.includes("dotnet")) parts.push(".NET");
  if (detection.type.includes("ruby")) parts.push("Ruby");

  const frameworks = detection.frameworks.filter((f) => !["TypeScript"].includes(f));
  if (frameworks.length > 0) {
    parts.push(...frameworks);
  }

  return parts.length > 0 ? parts.join(", ") : "Unknown project type";
}
