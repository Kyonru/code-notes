import * as vscode from "vscode";
import * as path from "path";
import { NotesStorage } from "./storage";

export class NotesHoverProvider implements vscode.HoverProvider {
  constructor(private readonly storage: NotesStorage) { }

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.Hover | undefined {
    const refs = this.storage.getReferencesForFile(document.uri.fsPath);
    const lineRefs = refs.filter((r) => r.line - 1 === position.line);

    if (lineRefs.length === 0) {
      return undefined;
    }

    const contents = new vscode.MarkdownString("", true);
    contents.isTrusted = true;
    contents.supportThemeIcons = true;

    for (const ref of lineRefs) {
      const note = this.storage.getNote(ref.noteId);
      if (!note) {
        continue;
      }

      contents.appendMarkdown(
        `$(notebook) **${note.name}**\n\n`
      );

      if (ref.annotation) {
        contents.appendMarkdown(`> ${ref.annotation}\n\n`);
      }

      if (ref.pinned) {
        contents.appendMarkdown(`$(pin) Pinned\n\n`);
      }

      const baseName = path.basename(note.filePath);
      contents.appendMarkdown(
        `[Open note](command:crosscodenotes.viewNoteAt?${encodeURIComponent(
          JSON.stringify([note.filePath, ref.id, `${path.basename(ref.file)}:${ref.line}`])
        )} "Open ${baseName}")\n\n`
      );

      if (lineRefs.indexOf(ref) < lineRefs.length - 1) {
        contents.appendMarkdown(`---\n\n`);
      }
    }

    const range = new vscode.Range(position.line, 0, position.line, document.lineAt(position.line).text.length);
    return new vscode.Hover(contents, range);
  }
}

export function initHoverProvider(
  context: vscode.ExtensionContext,
  storage: NotesStorage
): void {
  const provider = new NotesHoverProvider(storage);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider({ scheme: "file" }, provider)
  );
}
