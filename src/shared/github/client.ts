/**
 * GitHub API Client for Issue Operations
 *
 * Simple client for fetching issue states. Uses GitHub CLI (gh) or environment
 * variables for authentication.
 */

import { execFileSync } from "child_process";

export interface GitHubIssue {
  number: number;
  state: "open" | "closed";
  title: string;
  url: string;
}

export interface IssueReference {
  owner?: string;
  repo: string;
  number: number;
}

/**
 * Validate issue reference to prevent injection
 */
function validateIssueRef(ref: IssueReference): void {
  // Validate number is actually a number
  if (!Number.isInteger(ref.number) || ref.number < 1) {
    throw new Error(`Invalid issue number: ${ref.number}`);
  }

  // Validate repo name (alphanumeric, hyphens, underscores)
  if (!/^[a-zA-Z0-9_-]+$/.test(ref.repo)) {
    throw new Error(`Invalid repo name: ${ref.repo}`);
  }

  // Validate owner name if present
  if (ref.owner && !/^[a-zA-Z0-9_-]+$/.test(ref.owner)) {
    throw new Error(`Invalid owner name: ${ref.owner}`);
  }
}

/**
 * Fetch issue state from GitHub using gh CLI
 */
export async function getIssue(ref: IssueReference): Promise<GitHubIssue | null> {
  try {
    // Validate input to prevent injection
    validateIssueRef(ref);

    // Use gh CLI to fetch issue with properly escaped arguments
    const repoRef = ref.owner ? `${ref.owner}/${ref.repo}` : ref.repo;
    const args = [
      "issue",
      "view",
      ref.number.toString(),
      "--repo",
      repoRef,
      "--json",
      "number,state,title,url",
    ];

    const output = execFileSync("gh", args, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const data = JSON.parse(output) as {
      number: number;
      state: string;
      title: string;
      url: string;
    };
    return {
      number: data.number,
      state: data.state.toLowerCase() === "open" ? "open" : "closed",
      title: data.title,
      url: data.url,
    };
  } catch (_error) {
    // Issue not found or gh CLI not available
    return null;
  }
}

/**
 * Batch fetch multiple issues
 */
export async function batchGetIssues(
  refs: IssueReference[]
): Promise<Map<string, "open" | "closed">> {
  const results = new Map<string, "open" | "closed">();

  // Fetch issues in parallel (with reasonable concurrency)
  const batchSize = 5;
  for (let i = 0; i < refs.length; i += batchSize) {
    const batch = refs.slice(i, i + batchSize);
    const promises = batch.map(async (ref) => {
      const issue = await getIssue(ref);
      if (issue) {
        const fullRef = ref.owner
          ? `${ref.owner}/${ref.repo}#${ref.number}`
          : `${ref.repo}#${ref.number}`;
        results.set(fullRef, issue.state);
      }
    });

    await Promise.all(promises);
  }

  return results;
}

/**
 * Update issue body
 */
export async function updateIssue(
  ref: IssueReference,
  update: { body?: string }
): Promise<boolean> {
  try {
    // Validate input to prevent injection
    validateIssueRef(ref);

    const repoRef = ref.owner ? `${ref.owner}/${ref.repo}` : ref.repo;

    if (update.body !== undefined) {
      // Write body to temp file to avoid command line length limits
      const fs = await import("fs");

      // Use secure temp file creation
      const tmpDir = await fs.promises.mkdtemp(
        (await import("os")).tmpdir() + (await import("path")).sep + "gh-issue-"
      );
      const tempFile = (await import("path")).join(tmpDir, "body.md");

      try {
        await fs.promises.writeFile(tempFile, update.body);

        // Use execFileSync with argument array to prevent injection
        const args = [
          "issue",
          "edit",
          ref.number.toString(),
          "--repo",
          repoRef,
          "--body-file",
          tempFile,
        ];

        execFileSync("gh", args, {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
      } finally {
        // Clean up temp file and directory
        try {
          await fs.promises.unlink(tempFile);
          await fs.promises.rmdir(tmpDir);
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    return true;
  } catch (_error) {
    return false;
  }
}
