/**
 * Epic Status Synchronization
 *
 * Syncs epic issue bodies with actual sub-issue states from GitHub.
 */

import {
  parseIssueRef,
  extractStatusTables,
  updateMarkdownTables,
} from "../markdown/status-table.js";
import { getIssue, batchGetIssues, updateIssue, type IssueReference } from "./client.js";

export interface EpicSyncChange {
  issueRef: string;
  was: "open" | "closed";
  now: "open" | "closed";
}

export interface WaveStatus {
  waveId: string;
  complete: boolean;
  progress: string; // e.g., "6/6"
  completedCount: number;
  totalCount: number;
}

export interface EpicSyncResult {
  updated: boolean;
  changes: EpicSyncChange[];
  waveStatus: WaveStatus[];
  originalBody: string;
  updatedBody: string;
}

/**
 * Parse epic reference (e.g., "lexrunner#653" or "Guffawaffle/lexrunner#653")
 */
export function parseEpicRef(epicRef: string): IssueReference | null {
  const parsed = parseIssueRef(epicRef);
  if (!parsed) {
    return null;
  }

  return {
    owner: parsed.org,
    repo: parsed.repo,
    number: parsed.number,
  };
}

/**
 * Sync epic status with actual sub-issue states
 */
export async function syncEpicStatus(epicRef: string): Promise<EpicSyncResult> {
  // Parse epic reference
  const issueRef = parseEpicRef(epicRef);
  if (!issueRef) {
    throw new Error(`Invalid epic reference: ${epicRef}`);
  }

  // Fetch epic issue
  const epic = await getIssue(issueRef);
  if (!epic) {
    throw new Error(`Epic not found: ${epicRef}`);
  }

  // Get current body (would need to fetch full issue with body)
  // For now, we'll use gh CLI to get the body
  const { execSync } = await import("child_process");
  const repoRef = issueRef.owner ? `${issueRef.owner}/${issueRef.repo}` : issueRef.repo;
  const bodyOutput = execSync(`gh issue view ${issueRef.number} --repo ${repoRef} --json body`, {
    encoding: "utf-8",
  });
  const bodyData = JSON.parse(bodyOutput);
  const originalBody = bodyData.body || "";

  // Extract status tables
  const tables = extractStatusTables(originalBody);
  if (tables.length === 0) {
    return {
      updated: false,
      changes: [],
      waveStatus: [],
      originalBody,
      updatedBody: originalBody,
    };
  }

  // Collect all sub-issue references
  const subIssueRefs: IssueReference[] = [];
  for (const table of tables) {
    for (const row of table.rows) {
      subIssueRefs.push({
        owner: row.issueRef.org,
        repo: row.issueRef.repo,
        number: row.issueRef.number,
      });
    }
  }

  // Batch fetch sub-issue states
  const issueStates = await batchGetIssues(subIssueRefs);

  // Update markdown tables
  const { updatedMarkdown, changes } = updateMarkdownTables(originalBody, issueStates);

  // Calculate wave status
  const waveStatus: WaveStatus[] = [];
  for (const table of tables) {
    if (table.waveId) {
      const totalCount = table.rows.length;
      const completedCount = table.rows.filter((row) => {
        const state = issueStates.get(row.issueRef.fullRef);
        return state === "closed";
      }).length;

      waveStatus.push({
        waveId: table.waveId,
        complete: completedCount === totalCount,
        progress: `${completedCount}/${totalCount}`,
        completedCount,
        totalCount,
      });
    }
  }

  // Update epic if changed
  const updated = updatedMarkdown !== originalBody;
  if (updated) {
    await updateIssue(issueRef, { body: updatedMarkdown });
  }

  return {
    updated,
    changes: changes.map((c) => ({
      issueRef: c.issueRef,
      was: c.was as "open" | "closed",
      now: c.now as "open" | "closed",
    })),
    waveStatus,
    originalBody,
    updatedBody: updatedMarkdown,
  };
}
