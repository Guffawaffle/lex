/**
 * GitHub API Client for Issue Operations
 *
 * Simple client for fetching issue states. Uses GitHub CLI (gh) or environment
 * variables for authentication.
 */

import { execSync } from "child_process";

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
 * Fetch issue state from GitHub using gh CLI
 */
export async function getIssue(ref: IssueReference): Promise<GitHubIssue | null> {
  try {
    // Use gh CLI to fetch issue
    const repoRef = ref.owner ? `${ref.owner}/${ref.repo}` : ref.repo;
    const command = `gh issue view ${ref.number} --repo ${repoRef} --json number,state,title,url`;

    const output = execSync(command, {
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
    const repoRef = ref.owner ? `${ref.owner}/${ref.repo}` : ref.repo;
    const command = `gh issue edit ${ref.number} --repo ${repoRef}`;

    const args: string[] = [];
    if (update.body !== undefined) {
      // Write body to temp file to avoid command line length limits
      const fs = await import("fs");
      const os = await import("os");
      const path = await import("path");

      const tempFile = path.join(os.tmpdir(), `gh-issue-body-${Date.now()}.md`);
      fs.writeFileSync(tempFile, update.body);

      args.push(`--body-file ${tempFile}`);

      execSync(`${command} ${args.join(" ")}`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Clean up temp file
      fs.unlinkSync(tempFile);
    }

    return true;
  } catch (_error) {
    return false;
  }
}
