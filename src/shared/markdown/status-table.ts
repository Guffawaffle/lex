/**
 * Markdown Status Table Parser and Updater
 *
 * Parses and updates status tables in epic markdown bodies.
 * Supports GitHub issue reference format (org/repo#number or repo#number).
 */

export interface IssueRef {
  org?: string;
  repo: string;
  number: number;
  fullRef: string; // e.g., "lexsona#111" or "Guffawaffle/lex#647"
}

export interface StatusTableRow {
  issueRef: IssueRef;
  title: string;
  status: "open" | "closed";
  rawLine: string;
}

export interface StatusTable {
  rows: StatusTableRow[];
  waveId?: string; // e.g., "Wave 2"
  startLine: number;
  endLine: number;
  rawContent: string;
}

/**
 * Parse issue reference from markdown table cell
 * Supports: "lexsona#111", "lex#647", "Guffawaffle/lex#647"
 */
export function parseIssueRef(ref: string): IssueRef | null {
  const trimmed = ref.trim();

  // Pattern: org/repo#number or repo#number
  const match = trimmed.match(/^(?:([a-zA-Z0-9_-]+)\/)?([a-zA-Z0-9_-]+)#(\d+)$/);
  if (!match) {
    return null;
  }

  const [, org, repo, number] = match;
  return {
    org,
    repo,
    number: parseInt(number, 10),
    fullRef: trimmed,
  };
}

/**
 * Parse status emoji/text from markdown table cell
 * Supports: "🔵 Open", "✅ Closed", "Open", "Closed"
 */
export function parseStatus(statusCell: string): "open" | "closed" | null {
  const trimmed = statusCell.trim().toLowerCase();

  if (trimmed.includes("open") || trimmed.includes("🔵")) {
    return "open";
  }
  if (trimmed.includes("closed") || trimmed.includes("✅")) {
    return "closed";
  }

  return null;
}

/**
 * Format status for markdown table cell
 */
export function formatStatus(status: "open" | "closed"): string {
  return status === "open" ? "🔵 Open" : "✅ Closed";
}

/**
 * Extract all status tables from markdown content
 */
export function extractStatusTables(markdown: string): StatusTable[] {
  const lines = markdown.split("\n");
  const tables: StatusTable[] = [];
  let currentWave: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect wave headers (e.g., "### 🔄 Wave 2 — Ready for Assignment")
    const waveMatch = line.match(/^###\s+.*?(Wave\s+\d+)/i);
    if (waveMatch) {
      currentWave = waveMatch[1];
    }

    // Detect table start (header with |#|Title|Status| pattern)
    if (line.match(/^\s*\|\s*#\s*\|\s*Title\s*\|\s*Status\s*\|/i)) {
      const tableStartLine = i;
      const rows: StatusTableRow[] = [];

      // Skip separator line (|---|-------|--------|)
      i++;
      if (i >= lines.length || !lines[i].match(/^\s*\|[-:\s]+\|[-:\s]+\|[-:\s]+\|/)) {
        continue;
      }
      i++;

      // Parse table rows
      while (i < lines.length) {
        const rowLine = lines[i];

        // Table ends when we hit a non-table line or empty line
        if (!rowLine.match(/^\s*\|/)) {
          break;
        }

        // Parse table cells
        const cells = rowLine
          .split("|")
          .map((cell) => cell.trim())
          .filter((cell) => cell.length > 0);

        if (cells.length >= 3) {
          const [issueRefCell, titleCell, statusCell] = cells;
          const issueRef = parseIssueRef(issueRefCell);
          const status = parseStatus(statusCell);

          if (issueRef && status) {
            rows.push({
              issueRef,
              title: titleCell.trim(),
              status,
              rawLine: rowLine,
            });
          }
        }

        i++;
      }

      if (rows.length > 0) {
        const tableEndLine = i - 1;
        const rawContent = lines.slice(tableStartLine, i).join("\n");

        tables.push({
          rows,
          waveId: currentWave,
          startLine: tableStartLine,
          endLine: tableEndLine,
          rawContent,
        });
      }

      // Move back one line since outer loop will increment
      i--;
    }
  }

  return tables;
}

/**
 * Update status table rows with actual issue states
 */
export function updateTableRows(
  rows: StatusTableRow[],
  issueStates: Map<string, "open" | "closed">
): { row: StatusTableRow; updated: boolean }[] {
  return rows.map((row) => {
    const actualState = issueStates.get(row.issueRef.fullRef);
    if (actualState && actualState !== row.status) {
      // Update the status in the raw line
      const oldStatus = formatStatus(row.status);
      const newStatus = formatStatus(actualState);
      const updatedLine = row.rawLine.replace(oldStatus, newStatus);

      return {
        row: {
          ...row,
          status: actualState,
          rawLine: updatedLine,
        },
        updated: true,
      };
    }

    return { row, updated: false };
  });
}

/**
 * Replace status table in markdown with updated version
 */
export function replaceStatusTable(
  markdown: string,
  table: StatusTable,
  updatedRows: StatusTableRow[]
): string {
  const lines = markdown.split("\n");

  // Reconstruct table
  const headerLine = lines[table.startLine];
  const separatorLine = lines[table.startLine + 1];
  const updatedTableLines = [headerLine, separatorLine, ...updatedRows.map((row) => row.rawLine)];

  // Replace old table with new table
  const before = lines.slice(0, table.startLine);
  const after = lines.slice(table.endLine + 1);

  return [...before, ...updatedTableLines, ...after].join("\n");
}

/**
 * Update all status tables in markdown with actual issue states
 */
export function updateMarkdownTables(
  markdown: string,
  issueStates: Map<string, "open" | "closed">
): { updatedMarkdown: string; changes: Array<{ issueRef: string; was: string; now: string }> } {
  const tables = extractStatusTables(markdown);
  let updatedMarkdown = markdown;
  const changes: Array<{ issueRef: string; was: string; now: string }> = [];

  // Process tables in reverse order to maintain line numbers
  for (let i = tables.length - 1; i >= 0; i--) {
    const table = tables[i];
    const updatedRowResults = updateTableRows(table.rows, issueStates);

    // Track changes
    for (const { row, updated } of updatedRowResults) {
      if (updated) {
        const originalRow = table.rows.find((r) => r.issueRef.fullRef === row.issueRef.fullRef);
        if (originalRow) {
          changes.push({
            issueRef: row.issueRef.fullRef,
            was: originalRow.status,
            now: row.status,
          });
        }
      }
    }

    // Replace table if any rows were updated
    const hasChanges = updatedRowResults.some((r) => r.updated);
    if (hasChanges) {
      const updatedRows = updatedRowResults.map((r) => r.row);
      updatedMarkdown = replaceStatusTable(updatedMarkdown, table, updatedRows);
    }
  }

  return { updatedMarkdown, changes };
}
