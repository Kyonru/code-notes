import * as vscode from "vscode";
import * as path from "path";
import { NotesStorage } from "./storage";
import { createCommandName } from "./utils";

export function getShowReferenceGraphCommand(storage: NotesStorage) {
  return vscode.commands.registerCommand(
    createCommandName("showReferenceGraph"),
    () => {
      const panel = vscode.window.createWebviewPanel(
        "crosscodenotes.referenceGraph",
        "Reference Graph",
        vscode.ViewColumn.One,
        { enableScripts: true }
      );

      panel.webview.html = getGraphHtml(storage);

      panel.webview.onDidReceiveMessage(async (message) => {
        if (message.type === "openNote") {
          const notePath = path.join(storage.getNotesDirectory(), `${message.noteId}.md`);
          const uri = vscode.Uri.file(notePath);
          const doc = await vscode.workspace.openTextDocument(uri);
          await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        } else if (message.type === "openFile") {
          const uri = vscode.Uri.file(message.filePath);
          const doc = await vscode.workspace.openTextDocument(uri);
          await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        } else if (message.type === "openReference") {
          const uri = vscode.Uri.file(message.filePath);
          const doc = await vscode.workspace.openTextDocument(uri);
          const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
          const line = Math.max(0, message.line - 1);
          const range = new vscode.Range(line, 0, line, 0);
          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
          editor.selection = new vscode.Selection(range.start, range.start);
        }
      });
    }
  );
}

function getGraphHtml(storage: NotesStorage): string {
  const notes = storage.getAllNotesIncludingArchived();
  const allRefs = storage.getAllReferences();

  // Build graph data: nodes = notes + files, edges = note->file references
  interface GraphNode {
    id: string;
    label: string;
    type: "note" | "file";
    size: number;
    noteId?: string;
    filePath?: string;
  }

  interface GraphEdge {
    source: string;
    target: string;
    label: string;
    filePath: string;
    line: number;
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const fileNodeIds = new Set<string>();

  for (const note of notes) {
    nodes.push({
      id: `note:${note.id}`,
      label: note.name,
      type: "note",
      size: storage.getReferencesForNote(note.id).length,
      noteId: note.id,
    });
  }

  for (const ref of allRefs) {
    const fileId = `file:${ref.file}`;
    if (!fileNodeIds.has(fileId)) {
      fileNodeIds.add(fileId);
      nodes.push({
        id: fileId,
        label: path.basename(ref.file),
        type: "file",
        size: 1,
        filePath: ref.file,
      });
    }

    edges.push({
      source: `note:${ref.noteId}`,
      target: fileId,
      label: `:${ref.line}`,
      filePath: ref.file,
      line: ref.line,
    });
  }

  const graphData = JSON.stringify({ nodes, edges });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reference Graph</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; background: var(--vscode-editor-background, #1e1e1e); }
    canvas { display: block; }
    #tooltip {
      position: absolute;
      display: none;
      background: var(--vscode-editorHoverWidget-background, #252526);
      border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
      color: var(--vscode-editorHoverWidget-foreground, #cccccc);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-family: var(--vscode-font-family, sans-serif);
      pointer-events: none;
      z-index: 100;
    }
    #legend {
      position: absolute;
      top: 10px;
      right: 10px;
      background: var(--vscode-editorHoverWidget-background, #252526);
      border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
      color: var(--vscode-editorHoverWidget-foreground, #cccccc);
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-family: var(--vscode-font-family, sans-serif);
    }
    #legend div { margin: 4px 0; display: flex; align-items: center; gap: 6px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .dot-note { background: #569cd6; }
    .dot-file { background: #4ec9b0; }
  </style>
</head>
<body>
  <canvas id="graph"></canvas>
  <div id="tooltip"></div>
  <div id="legend">
    <div><span class="dot dot-note"></span> Notes</div>
    <div><span class="dot dot-file"></span> Files</div>
  </div>
  <script>
    const data = ${graphData};
    const canvas = document.getElementById('graph');
    const ctx = canvas.getContext('2d');
    const tooltip = document.getElementById('tooltip');

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    // Simple force-directed layout
    const nodeMap = {};
    const simNodes = data.nodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / data.nodes.length;
      const radius = Math.min(width, height) * 0.35;
      const node = {
        ...n,
        x: width / 2 + radius * Math.cos(angle) + (Math.random() - 0.5) * 50,
        y: height / 2 + radius * Math.sin(angle) + (Math.random() - 0.5) * 50,
        vx: 0,
        vy: 0,
      };
      nodeMap[n.id] = node;
      return node;
    });

    const simEdges = data.edges.map(e => ({
      source: nodeMap[e.source],
      target: nodeMap[e.target],
      label: e.label,
      filePath: e.filePath,
      line: e.line,
    }));

    function simulate() {
      // Repulsion
      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          const a = simNodes[i], b = simNodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 800 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx -= fx; a.vy -= fy;
          b.vx += fx; b.vy += fy;
        }
      }

      // Attraction (edges)
      for (const e of simEdges) {
        const dx = e.target.x - e.source.x;
        const dy = e.target.y - e.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 120) * 0.01;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        e.source.vx += fx; e.source.vy += fy;
        e.target.vx -= fx; e.target.vy -= fy;
      }

      // Center gravity
      for (const n of simNodes) {
        n.vx += (width / 2 - n.x) * 0.001;
        n.vy += (height / 2 - n.y) * 0.001;
        n.x += n.vx;
        n.y += n.vy;
        n.vx *= 0.9;
        n.vy *= 0.9;
        // Keep in bounds
        n.x = Math.max(30, Math.min(width - 30, n.x));
        n.y = Math.max(30, Math.min(height - 30, n.y));
      }
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);

      // Edges
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1;
      for (const e of simEdges) {
        ctx.beginPath();
        ctx.moveTo(e.source.x, e.source.y);
        ctx.lineTo(e.target.x, e.target.y);
        ctx.stroke();
      }

      // Nodes
      for (const n of simNodes) {
        const radius = n.type === 'note' ? 8 + Math.min(n.size, 10) : 6;
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = n.type === 'note' ? '#569cd6' : '#4ec9b0';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Label
        ctx.fillStyle = '#ccc';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(n.label, n.x, n.y + radius + 14);
      }
    }

    let running = true;
    let frames = 0;
    function tick() {
      if (!running) return;
      simulate();
      draw();
      frames++;
      if (frames < 300) {
        requestAnimationFrame(tick);
      } else {
        draw(); // final frame
      }
    }
    tick();

    // Click to open
    const vscode = acquireVsCodeApi();
    canvas.style.cursor = 'default';
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Check nodes first
      for (const n of simNodes) {
        const dx = n.x - mx, dy = n.y - my;
        if (dx * dx + dy * dy < 225) {
          if (n.type === 'note' && n.noteId) {
            vscode.postMessage({ type: 'openNote', noteId: n.noteId });
          } else if (n.type === 'file' && n.filePath) {
            vscode.postMessage({ type: 'openFile', filePath: n.filePath });
          }
          return;
        }
      }

      // Check edges (click near midpoint)
      for (const edge of simEdges) {
        const midX = (edge.source.x + edge.target.x) / 2;
        const midY = (edge.source.y + edge.target.y) / 2;
        const dx = midX - mx, dy = midY - my;
        if (dx * dx + dy * dy < 225) {
          vscode.postMessage({ type: 'openReference', filePath: edge.filePath, line: edge.line });
          return;
        }
      }
    });

    // Tooltip + pointer cursor on hover
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let found = null;
      for (const n of simNodes) {
        const dx = n.x - mx, dy = n.y - my;
        if (dx * dx + dy * dy < 225) {
          found = n;
          break;
        }
      }
      if (found) {
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 12) + 'px';
        tooltip.style.top = (e.clientY + 12) + 'px';
        const typeLabel = found.type === 'note' ? 'Note' : 'File';
        const extra = found.type === 'note' ? ' (' + found.size + ' refs)' : '';
        tooltip.textContent = typeLabel + ': ' + found.label + extra;
        canvas.style.cursor = 'pointer';
      } else {
        tooltip.style.display = 'none';
        // Check edges for pointer cursor
        let onEdge = false;
        for (const edge of simEdges) {
          const midX = (edge.source.x + edge.target.x) / 2;
          const midY = (edge.source.y + edge.target.y) / 2;
          const dx = midX - mx, dy = midY - my;
          if (dx * dx + dy * dy < 225) { onEdge = true; break; }
        }
        canvas.style.cursor = onEdge ? 'pointer' : 'default';
      }
    });

    window.addEventListener('resize', () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      draw();
    });
  </script>
</body>
</html>`;
}
