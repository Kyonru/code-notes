import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { createCommandName } from "./utils";
import { NoteReference } from "./types";
import { NOTES_DIR } from "./constants";

function isNotesFile(uri: vscode.Uri) {
  return uri.fsPath.startsWith(NOTES_DIR);
}

export async function initCodeLensProvider(context: vscode.ExtensionContext) {
  const buildNoteIndex = async () => {
    const noteIndex: Record<string, NoteReference> = {};

    const files = fs
      .readdirSync(NOTES_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort();

    for (const file of files) {
      const content = fs.readFileSync(path.join(NOTES_DIR, file), "utf-8");
      const lines = content.toString().split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^## (.*?):(\d+)/);

        if (match) {
          const filePathLine = lines[i + 2];

          if (!filePathLine) {
            continue;
          }

          const filePathMatch = filePathLine.match(/^\**Path:\*\* `(.*?)`/);
          if (!filePathMatch) {
            continue;
          }

          let line = 1;

          const fileNumberLine = lines[i + 4];
          if (!fileNumberLine) {
            continue;
          }

          const fileNumberMatch = fileNumberLine.match(
            /(?:<br\s*\/?>\s*)?\*\*Line:\*\*\s*([0-9]+)/i
          );

          if (fileNumberMatch) {
            line = Number(fileNumberMatch[1]);
          }

          const filePath = filePathMatch[1];

          const [, noteName, lineNumber] = match;

          const indexName = `${noteName}:${filePath}:${i}`;

          noteIndex[indexName] = {
            noteName: noteName,
            noteFile: path.join(NOTES_DIR, file),
            notePath: filePath,
            noteLine: i + 1,
            line,
          };
        }
      }
    }

    await context.workspaceState.update("noteIndex", noteIndex);
  };

  await buildNoteIndex(); // parse markdown & fill noteIndex

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (isNotesFile(doc.uri)) {
        buildNoteIndex();
      }
    })
  );

  vscode.languages.registerCodeLensProvider(
    { scheme: "file" }, // or restrict to certain languages
    {
      provideCodeLenses(document) {
        const lenses: vscode.CodeLens[] = [];

        const noteIndex =
          context.workspaceState.get<Record<string, NoteReference>>(
            "noteIndex"
          );

        if (!noteIndex) {
          return lenses;
        }

        for (const [key, ref] of Object.entries(noteIndex)) {
          const refLine = ref.line;
          if (ref.notePath !== document.uri.fsPath) {
            continue;
          }

          const line = Number(refLine) - 1;
          const range = new vscode.Range(line, 0, line, 0);

          lenses.push(
            new vscode.CodeLens(range, {
              title: "View Note",
              command: createCommandName("viewNoteAt"),
              arguments: [ref.noteFile, ref.noteLine],
            })
          );
        }

        return lenses;
      },
    }
  );

  const watcher = vscode.workspace.createFileSystemWatcher(
    `${NOTES_DIR}/**/*.md`
  );

  watcher.onDidChange(buildNoteIndex);
  watcher.onDidCreate(buildNoteIndex);
  watcher.onDidDelete((uri) => {
    const noteIndex =
      context.workspaceState.get<Record<string, NoteReference>>("noteIndex");
    if (noteIndex) {
      delete noteIndex[uri.fsPath];
      context.workspaceState.update("noteIndex", noteIndex);
    }
  });
}
