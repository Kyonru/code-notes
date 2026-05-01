import * as vscode from "vscode";
import { NotesStorage } from "./storage";

/**
 * Watches for text document changes and adjusts reference line numbers
 * so they stay in sync with code edits.
 */
export function initLineTracker(
  context: vscode.ExtensionContext,
  storage: NotesStorage
): void {
  const disposable = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.contentChanges.length === 0) {
      return;
    }

    const filePath = event.document.uri.fsPath;
    const refs = storage.getReferencesForFile(filePath);

    if (refs.length === 0) {
      return;
    }

    // Compute line shifts from all content changes (process in reverse order
    // so earlier changes don't affect the positions of later ones)
    const changes = [...event.contentChanges].sort(
      (a, b) => b.range.start.line - a.range.start.line
    );

    let updated = false;

    for (const change of changes) {
      const startLine = change.range.start.line;
      const endLine = change.range.end.line;
      const linesRemoved = endLine - startLine;
      const linesAdded = change.text.split("\n").length - 1;
      const lineDelta = linesAdded - linesRemoved;

      if (lineDelta === 0) {
        continue;
      }

      for (const ref of refs) {
        const refLine = ref.line - 1; // convert to 0-based

        if (refLine > endLine) {
          // Reference is below the change — shift it
          ref.line += lineDelta;
          updated = true;
        } else if (refLine >= startLine && refLine <= endLine && linesRemoved > 0) {
          // Reference is inside a deleted region — clamp to change start
          ref.line = startLine + 1; // back to 1-based
          updated = true;
        }
      }
    }

    if (updated) {
      storage.updateReferences(refs);
    }
  });

  context.subscriptions.push(disposable);
}
