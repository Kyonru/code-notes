import * as vscode from "vscode";
import * as path from "path";
import { createCommandName } from "./utils";
import { NotesStorage } from "./storage";

export class NotesCodeLensProvider implements vscode.CodeLensProvider {
  constructor(private readonly storage: NotesStorage) {}

  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const refs = this.storage.getReferencesForFile(document.uri.fsPath);

    for (const ref of refs) {
      const note = this.storage.getNote(ref.noteId);
      if (!note) {
        continue;
      }

      const line = ref.line - 1;
      const range = new vscode.Range(line, 0, line, 0);
      const baseName = path.basename(ref.file);

      lenses.push(
        new vscode.CodeLens(range, {
          title: "View Note",
          command: createCommandName("viewNoteAt"),
          arguments: [note.filePath, ref.id, `${baseName}:${ref.line}`],
        })
      );
    }

    return lenses;
  }

  refresh() {
    this._onDidChangeCodeLenses.fire();
  }
}

export async function initCodeLensProvider(
  context: vscode.ExtensionContext,
  provider: NotesCodeLensProvider
) {
  vscode.languages.registerCodeLensProvider({ scheme: "file" }, provider);
}
