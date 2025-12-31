import * as vscode from "vscode";
import { createCommandName } from "./utils";
import { NoteReference } from "./types";

export class NotesCodeLensProvider implements vscode.CodeLensProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  provideCodeLenses(document: vscode.TextDocument) {
    const lenses: vscode.CodeLens[] = [];

    const noteIndex =
      this.context.workspaceState.get<Record<string, NoteReference>>(
        "noteIndex"
      );

    if (!noteIndex) {
      return lenses;
    }

    for (const [key, ref] of Object.entries(noteIndex)) {
      const refLine = ref.line;
      if (ref.file !== document.uri.fsPath) {
        continue;
      }

      const line = Number(refLine) - 1;
      const range = new vscode.Range(line, 0, line, 0);

      console.log("kyonru lens", ref.notePath, refLine);

      lenses.push(
        new vscode.CodeLens(range, {
          title: "View Note",
          command: createCommandName("viewNoteAt"),
          arguments: [ref.notePath, ref.noteLine],
        })
      );
    }

    return lenses;
  }

  // Call this whenever notes change
  refresh() {
    this._onDidChangeCodeLenses.fire();
    console.log("kyonru refresh");
  }
}

export async function initCodeLensProvider(
  context: vscode.ExtensionContext,
  provider: NotesCodeLensProvider
) {
  vscode.languages.registerCodeLensProvider(
    { scheme: "file" }, // or restrict to certain languages
    provider
  );

  vscode.EventEmitter;
}
