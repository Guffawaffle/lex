/**
 * Timeline Renderer - Visual timeline showing Frame evolution
 * 
 * Renders Frames for a ticket/branch as a timeline with:
 * - Module scope evolution (what modules were touched when)
 * - Blocker introduction and resolution tracking
 * - Status updates over time
 */

import type { Frame } from '../../shared/types/frame.js';

/**
 * Timeline entry representing a single Frame in the timeline
 */
export interface TimelineEntry {
  frame: Frame;
  modulesAdded: string[];
  modulesRemoved: string[];
  blockersAdded: string[];
  blockersRemoved: string[];
}

/**
 * Timeline filter options
 */
export interface TimelineOptions {
  since?: Date;
  until?: Date;
  format?: 'text' | 'json' | 'html';
}

/**
 * Build timeline from frames (chronologically ordered)
 */
export function buildTimeline(frames: Frame[]): TimelineEntry[] {
  if (frames.length === 0) {
    return [];
  }

  // Sort frames chronologically (oldest first)
  const sortedFrames = [...frames].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const timeline: TimelineEntry[] = [];
  let previousModules = new Set<string>();
  let previousBlockers = new Set<string>();

  for (const frame of sortedFrames) {
    const currentModules = new Set(frame.module_scope);
    const currentBlockers = new Set([
      ...(frame.status_snapshot.blockers || []),
      ...(frame.status_snapshot.merge_blockers || []),
    ]);

    // Calculate changes
    const modulesAdded = Array.from(currentModules).filter(m => !previousModules.has(m));
    const modulesRemoved = Array.from(previousModules).filter(m => !currentModules.has(m));
    const blockersAdded = Array.from(currentBlockers).filter(b => !previousBlockers.has(b));
    const blockersRemoved = Array.from(previousBlockers).filter(b => !currentBlockers.has(b));

    timeline.push({
      frame,
      modulesAdded,
      modulesRemoved,
      blockersAdded,
      blockersRemoved,
    });

    previousModules = currentModules;
    previousBlockers = currentBlockers;
  }

  return timeline;
}

/**
 * Filter timeline by date range
 */
export function filterTimeline(
  timeline: TimelineEntry[],
  options: TimelineOptions
): TimelineEntry[] {
  let filtered = timeline;

  if (options.since) {
    filtered = filtered.filter(
      entry => new Date(entry.frame.timestamp) >= options.since!
    );
  }

  if (options.until) {
    filtered = filtered.filter(
      entry => new Date(entry.frame.timestamp) <= options.until!
    );
  }

  return filtered;
}

/**
 * Render timeline as text
 */
export function renderTimelineText(
  timeline: TimelineEntry[],
  title: string
): string {
  if (timeline.length === 0) {
    return `\n${title}\nNo frames found.\n`;
  }

  const lines: string[] = [];
  lines.push('');
  lines.push(title);
  lines.push('═'.repeat(title.length));
  lines.push('');

  for (let i = 0; i < timeline.length; i++) {
    const entry = timeline[i];
    const frame = entry.frame;
    const date = new Date(frame.timestamp);
    const dateStr = date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // Frame header
    lines.push(`${dateStr}  [Frame #${frame.id.slice(0, 8)}]  ${frame.summary_caption}`);

    // Consistent indentation for all frame details
    const modulePrefix = '              ';

    // Modules
    if (frame.module_scope.length > 0) {
      lines.push(`${modulePrefix}Modules: ${frame.module_scope.join(', ')}`);
      
      // Show module changes
      if (entry.modulesAdded.length > 0) {
        lines.push(`${modulePrefix}         + Added: ${entry.modulesAdded.join(', ')}`);
      }
      if (entry.modulesRemoved.length > 0) {
        lines.push(`${modulePrefix}         - Removed: ${entry.modulesRemoved.join(', ')}`);
      }
    }

    // Status indicator
    const statusIndicator = getStatusIndicator(frame);
    lines.push(`${modulePrefix}Status: ${statusIndicator}`);

    // Blockers
    const allBlockers = [
      ...(frame.status_snapshot.blockers || []),
      ...(frame.status_snapshot.merge_blockers || []),
    ];
    
    if (allBlockers.length > 0) {
      for (const blocker of allBlockers) {
        const isNew = entry.blockersAdded.includes(blocker);
        const marker = isNew ? '+ ' : '  ';
        lines.push(`${modulePrefix}         ${marker}⚠️  ${blocker}`);
      }
    }
    
    if (entry.blockersRemoved.length > 0) {
      for (const blocker of entry.blockersRemoved) {
        lines.push(`${modulePrefix}         - ✅ Resolved: ${blocker}`);
      }
    }

    // Tests failing
    if (frame.status_snapshot.tests_failing && frame.status_snapshot.tests_failing.length > 0) {
      for (const test of frame.status_snapshot.tests_failing) {
        lines.push(`${modulePrefix}         ❌ ${test}`);
      }
    }

    lines.push('');
  }

  lines.push('═'.repeat(title.length));
  lines.push('');

  return lines.join('\n');
}

/**
 * Get status indicator emoji for a frame
 */
function getStatusIndicator(frame: Frame): string {
  const hasBlockers = (frame.status_snapshot.blockers?.length || 0) > 0 ||
                      (frame.status_snapshot.merge_blockers?.length || 0) > 0;
  const hasTestFailures = (frame.status_snapshot.tests_failing?.length || 0) > 0;

  if (hasBlockers) {
    return '⚠️  Blocked';
  } else if (hasTestFailures) {
    return '❌ Tests failing';
  } else {
    return '✅ In progress';
  }
}

/**
 * Render module scope evolution graph
 */
export function renderModuleScopeEvolution(timeline: TimelineEntry[]): string {
  if (timeline.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('');
  lines.push('Module Scope Evolution:');
  lines.push('');

  // Collect all modules that appear in any frame
  const moduleAppearances = new Map<string, Set<number>>();
  
  timeline.forEach((entry, index) => {
    entry.frame.module_scope.forEach(module => {
      if (!moduleAppearances.has(module)) {
        moduleAppearances.set(module, new Set());
      }
      moduleAppearances.get(module)!.add(index);
    });
  });

  // Render each module with a visual representation
  const maxModuleNameLength = Math.max(...Array.from(moduleAppearances.keys()).map(m => m.length));
  
  for (const [module, appearances] of Array.from(moduleAppearances.entries()).sort()) {
    const paddedModule = module.padEnd(maxModuleNameLength);
    const graph = Array.from({ length: timeline.length }, (_, i) => 
      appearances.has(i) ? '█' : ' '
    ).join('');
    
    const frameCount = `(${appearances.size}/${timeline.length} frames)`;
    lines.push(`${paddedModule}  ${graph}  ${frameCount}`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Render blocker tracking summary
 */
export function renderBlockerTracking(timeline: TimelineEntry[]): string {
  if (timeline.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('');
  lines.push('Blocker Tracking:');
  lines.push('');

  for (let i = 0; i < timeline.length; i++) {
    const entry = timeline[i];
    const frame = entry.frame;
    const allBlockers = [
      ...(frame.status_snapshot.blockers || []),
      ...(frame.status_snapshot.merge_blockers || []),
    ];

    lines.push(`Frame ${i + 1}:`);
    
    if (entry.blockersAdded.length > 0) {
      for (const blocker of entry.blockersAdded) {
        lines.push(`  + ${blocker}`);
      }
    }
    
    if (entry.blockersRemoved.length > 0) {
      for (const blocker of entry.blockersRemoved) {
        lines.push(`  - ${blocker} (resolved)`);
      }
    }
    
    if (allBlockers.length === 0 && entry.blockersAdded.length === 0 && entry.blockersRemoved.length === 0) {
      lines.push(`  No blockers`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Render timeline as JSON
 */
export function renderTimelineJSON(timeline: TimelineEntry[]): string {
  return JSON.stringify(timeline, null, 2);
}

/**
 * Render timeline as HTML (basic implementation)
 */
export function renderTimelineHTML(timeline: TimelineEntry[], title: string): string {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      max-width: 1200px;
      margin: 40px auto;
      padding: 0 20px;
      background: #f5f5f5;
    }
    h1 {
      border-bottom: 3px solid #333;
      padding-bottom: 10px;
    }
    .timeline {
      position: relative;
      padding-left: 40px;
    }
    .timeline::before {
      content: '';
      position: absolute;
      left: 10px;
      top: 0;
      bottom: 0;
      width: 2px;
      background: #ccc;
    }
    .entry {
      position: relative;
      margin-bottom: 30px;
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .entry::before {
      content: '';
      position: absolute;
      left: -30px;
      top: 20px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #4CAF50;
      border: 2px solid white;
    }
    .date {
      color: #666;
      font-size: 0.9em;
      margin-bottom: 5px;
    }
    .frame-id {
      color: #999;
      font-size: 0.85em;
      font-family: monospace;
    }
    .summary {
      font-weight: 600;
      font-size: 1.1em;
      margin: 10px 0;
    }
    .modules {
      margin: 10px 0;
      padding: 10px;
      background: #f8f8f8;
      border-radius: 4px;
    }
    .status {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.9em;
      margin: 5px 0;
    }
    .status.progress { background: #e3f2fd; color: #1976d2; }
    .status.blocked { background: #fff3e0; color: #f57c00; }
    .status.failing { background: #ffebee; color: #c62828; }
    .blockers {
      margin: 10px 0;
    }
    .blocker {
      padding: 8px;
      margin: 5px 0;
      background: #fff3e0;
      border-left: 3px solid #ff9800;
      border-radius: 4px;
    }
    .change {
      font-size: 0.9em;
      color: #666;
      margin-left: 10px;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="timeline">
    ${timeline.map(entry => renderEntryHTML(entry)).join('\n')}
  </div>
</body>
</html>
`;
  return html;
}

/**
 * Render a single timeline entry as HTML
 */
function renderEntryHTML(entry: TimelineEntry): string {
  const frame = entry.frame;
  const date = new Date(frame.timestamp);
  const dateStr = date.toLocaleString();
  
  const statusClass = getStatusClass(frame);
  const statusText = getStatusIndicator(frame);
  
  const allBlockers = [
    ...(frame.status_snapshot.blockers || []),
    ...(frame.status_snapshot.merge_blockers || []),
  ];

  return `
    <div class="entry">
      <div class="date">${dateStr}</div>
      <div class="frame-id">Frame #${frame.id.slice(0, 8)}</div>
      <div class="summary">${escapeHtml(frame.summary_caption)}</div>
      <div class="modules">
        <strong>Modules:</strong> ${frame.module_scope.join(', ')}
        ${entry.modulesAdded.length > 0 ? `<span class="change">+ ${entry.modulesAdded.join(', ')}</span>` : ''}
        ${entry.modulesRemoved.length > 0 ? `<span class="change">- ${entry.modulesRemoved.join(', ')}</span>` : ''}
      </div>
      <div class="status ${statusClass}">${statusText}</div>
      ${allBlockers.length > 0 ? `
        <div class="blockers">
          ${allBlockers.map(b => `<div class="blocker">${escapeHtml(b)}</div>`).join('')}
        </div>
      ` : ''}
      ${entry.blockersRemoved.length > 0 ? `
        <div style="color: #4CAF50; margin-top: 10px;">
          ✅ Resolved: ${entry.blockersRemoved.join(', ')}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Get status CSS class for a frame
 */
function getStatusClass(frame: Frame): string {
  const hasBlockers = (frame.status_snapshot.blockers?.length || 0) > 0 ||
                      (frame.status_snapshot.merge_blockers?.length || 0) > 0;
  const hasTestFailures = (frame.status_snapshot.tests_failing?.length || 0) > 0;

  if (hasBlockers) return 'blocked';
  if (hasTestFailures) return 'failing';
  return 'progress';
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
