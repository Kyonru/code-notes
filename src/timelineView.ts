import * as vscode from "vscode";
import * as path from "path";
import { NotesStorage } from "./storage";
import { createCommandName } from "./utils";

export function getShowTimelineCommand(storage: NotesStorage) {
  return vscode.commands.registerCommand(
    createCommandName("showTimeline"),
    () => {
      const panel = vscode.window.createWebviewPanel(
        "crosscodenotes.timeline",
        "Annotation Timeline",
        vscode.ViewColumn.One,
        { enableScripts: true }
      );

      panel.webview.html = getTimelineHtml(storage);

      panel.webview.onDidReceiveMessage(async (message) => {
        if (message.type === "openReference") {
          const uri = vscode.Uri.file(message.filePath);
          const doc = await vscode.workspace.openTextDocument(uri);
          const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
          const line = Math.max(0, message.line - 1);
          const range = new vscode.Range(line, 0, line, 0);
          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
          editor.selection = new vscode.Selection(range.start, range.start);
        } else if (message.type === "openNote") {
          const notePath = path.join(storage.getNotesDirectory(), `${message.noteId}.md`);
          const uri = vscode.Uri.file(notePath);
          const doc = await vscode.workspace.openTextDocument(uri);
          await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        }
      });
    }
  );
}

function getTimelineHtml(storage: NotesStorage): string {
  const allRefs = storage.getAllReferences();
  const notes = storage.getAllNotesIncludingArchived();
  const noteMap = new Map(notes.map((n) => [n.id, n.name]));

  // Sort by addedAt descending (newest first)
  const sorted = [...allRefs].sort(
    (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
  );

  // Group by date
  const grouped: Record<string, typeof sorted> = {};
  for (const ref of sorted) {
    const date = new Date(ref.addedAt).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    if (!grouped[date]) {
      grouped[date] = [];
    }
    grouped[date].push(ref);
  }

  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  let timelineHtml = "";
  for (const [date, refs] of Object.entries(grouped)) {
    timelineHtml += `<div class="date-group"><h2 class="date-header">${escapeHtml(date)}</h2>`;
    for (const ref of refs) {
      const noteName = noteMap.get(ref.noteId) || ref.noteId;
      const fileName = path.basename(ref.file);
      const time = new Date(ref.addedAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const snippet = ref.codeSnippet
        ? escapeHtml(ref.codeSnippet.substring(0, 120))
        : "";

      timelineHtml += `
        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-content">
            <div class="timeline-meta">
              <span class="time">${time}</span>
              <span class="note-badge" data-note-id="${escapeHtml(ref.noteId)}">${escapeHtml(noteName)}</span>
            </div>
            <div class="timeline-annotation">${escapeHtml(ref.annotation || "(no annotation)")}</div>
            <div class="timeline-file" data-file="${escapeHtml(ref.file)}" data-line="${ref.line}">
              ${escapeHtml(fileName)}:${ref.line}
            </div>
            ${snippet ? `<pre class="timeline-code"><code>${snippet}</code></pre>` : ""}
          </div>
        </div>`;
    }
    timelineHtml += `</div>`;
  }

  if (sorted.length === 0) {
    timelineHtml = `<div class="empty">No annotations yet. Add references to see them here.</div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Annotation Timeline</title>
  <style>
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 20px 30px;
      line-height: 1.5;
    }
    h1 {
      font-size: 1.4em;
      margin-bottom: 24px;
      font-weight: 600;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 12px;
    }
    .stats {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 20px;
    }
    .date-group {
      margin-bottom: 24px;
    }
    .date-header {
      font-size: 0.9em;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      margin: 0 0 12px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .timeline-item {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
      padding-left: 8px;
      position: relative;
    }
    .timeline-item::before {
      content: '';
      position: absolute;
      left: 13px;
      top: 20px;
      bottom: -16px;
      width: 1px;
      background: var(--vscode-panel-border);
    }
    .timeline-item:last-child::before {
      display: none;
    }
    .timeline-dot {
      width: 10px;
      height: 10px;
      min-width: 10px;
      border-radius: 50%;
      background: var(--vscode-textLink-foreground);
      margin-top: 6px;
      z-index: 1;
    }
    .timeline-content {
      flex: 1;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 6px;
      padding: 10px 14px;
    }
    .timeline-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }
    .time {
      font-size: 0.8em;
      color: var(--vscode-descriptionForeground);
    }
    .note-badge {
      font-size: 0.75em;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 1px 6px;
      border-radius: 3px;
      cursor: pointer;
    }
    .note-badge:hover {
      opacity: 0.8;
    }
    .timeline-annotation {
      font-size: 0.9em;
      margin-bottom: 4px;
    }
    .timeline-file {
      font-size: 0.8em;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
    }
    .timeline-file:hover {
      text-decoration: underline;
    }
    .timeline-code {
      margin: 6px 0 0 0;
      padding: 6px 10px;
      background: var(--vscode-textCodeBlock-background);
      border-radius: 4px;
      font-size: 0.8em;
      overflow: hidden;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .timeline-code code {
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .empty {
      text-align: center;
      color: var(--vscode-descriptionForeground);
      margin-top: 60px;
      font-size: 0.95em;
    }
  </style>
</head>
<body>
  <h1>📅 Annotation Timeline</h1>
  <div class="stats">${sorted.length} annotation${sorted.length !== 1 ? "s" : ""} across ${notes.length} note${notes.length !== 1 ? "s" : ""}</div>
  ${timelineHtml}
  <script>
    const vscode = acquireVsCodeApi();

    document.querySelectorAll('.timeline-file').forEach(el => {
      el.addEventListener('click', () => {
        vscode.postMessage({
          type: 'openReference',
          filePath: el.dataset.file,
          line: parseInt(el.dataset.line, 10)
        });
      });
    });

    document.querySelectorAll('.note-badge').forEach(el => {
      el.addEventListener('click', () => {
        vscode.postMessage({
          type: 'openNote',
          noteId: el.dataset.noteId
        });
      });
    });
  </script>
</body>
</html>`;
}
