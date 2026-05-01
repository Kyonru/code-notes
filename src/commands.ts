import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

import { NoteItem, NotesTreeProvider } from "./treeView";
import { createCommandName, getDefaultNotesDir, getNotesDir } from "./utils";
import { NotesCodeLensProvider } from "./codelens";
import { EXTENSION_NAME } from "./constants";
import { NotesStorage } from "./storage";
import { NoteEntry } from "./types";

export function gerRefreshTreeCommand(
  notesTreeProvider: NotesTreeProvider,
  provider: NotesCodeLensProvider
) {
  return vscode.commands.registerCommand(
    createCommandName("refreshTree"),
    () => {
      notesTreeProvider.refresh();
      provider.refresh();
    }
  );
}

export function getCreateNoteCommand(
  context: vscode.ExtensionContext,
  storage: NotesStorage,
  _notesTreeProvider: NotesTreeProvider
) {
  return vscode.commands.registerCommand(
    createCommandName("createNote"),
    async () => {
      const noteName = await vscode.window.showInputBox({
        prompt: "Enter note name",
        placeHolder: "my-note",
      });

      if (!noteName) {
        return;
      }

      const slugId = noteName.replace(/[^a-z0-9-_]/gi, "-").toLowerCase();
      const alreadyExists = storage.noteExists(slugId);
      const note = await storage.createNote(noteName);

      if (alreadyExists) {
        vscode.window.showInformationMessage(
          `Switched to existing note: ${note.name}`
        );
      } else {
        vscode.window.showInformationMessage(`Created note: ${note.name}`);
      }

      context.workspaceState.update("currentNote", note.filePath);
      await vscode.commands.executeCommand(createCommandName("refreshTree"));
      const doc = await vscode.workspace.openTextDocument(note.filePath);
      await vscode.window.showTextDocument(doc);
    }
  );
}

export function getSelectNoteCommand(
  context: vscode.ExtensionContext,
  storage: NotesStorage,
  _notesTreeProvider: NotesTreeProvider
) {
  return vscode.commands.registerCommand(
    createCommandName("selectNote"),
    async () => {
      const notes = storage.getNotes();

      if (notes.length === 0) {
        vscode.window.showInformationMessage(
          "No notes found. Create one first!"
        );
        return;
      }

      const items = notes.map((n) => ({
        label: n.name,
        description: `${storage.getReferencesForNote(n.id).length} refs`,
        noteId: n.id,
        filePath: n.filePath,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "Select a note",
      });

      if (selected) {
        context.workspaceState.update("currentNote", selected.filePath);
        await vscode.commands.executeCommand(createCommandName("refreshTree"));
        const doc = await vscode.workspace.openTextDocument(selected.filePath);
        await vscode.window.showTextDocument(doc);
      }
    }
  );
}

export function getAddReferenceCommand(
  context: vscode.ExtensionContext,
  storage: NotesStorage,
  _notesTreeProvider: NotesTreeProvider
) {
  return vscode.commands.registerCommand(
    createCommandName("addReference"),
    async () => {
      const currentNotePath = context.workspaceState.get<string>("currentNote");

      if (!currentNotePath) {
        const action = await vscode.window.showWarningMessage(
          "No note selected. Would you like to select one?",
          "Select Note",
          "Create Note"
        );

        if (action === "Select Note") {
          await vscode.commands.executeCommand(createCommandName("selectNote"));
        } else if (action === "Create Note") {
          await vscode.commands.executeCommand(createCommandName("createNote"));
        }
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor!");
        return;
      }

      const document = editor.document;
      const selection = editor.selection;
      const selectedText = document.getText(selection);
      const lineNumber = selection.start.line + 1;

      const annotation = await vscode.window.showInputBox({
        prompt: "Add annotation (optional)",
        placeHolder: "Enter your notes about this code...",
      });

      // Derive noteId from the stored file path
      const noteId = path.basename(currentNotePath, ".md");

      await storage.addReference(
        noteId,
        document.fileName,
        lineNumber,
        selectedText || document.lineAt(selection.start.line).text,
        document.languageId,
        annotation ?? ""
      );

      await vscode.commands.executeCommand(createCommandName("refreshTree"));
      const result = await vscode.window.showInformationMessage(
        "Reference added to note!",
        "View Note"
      );

      if (result === "View Note") {
        vscode.commands.executeCommand(createCommandName("viewNote"));
      }
    }
  );
}

export function getOpenNoteFromTreeCommand(
  context: vscode.ExtensionContext,
  callback: Function
) {
  return vscode.commands.registerCommand(
    createCommandName("openNoteFromTree"),
    async (item: NoteItem) => {
      if (item.filePath) {
        context.workspaceState.update("currentNote", item.filePath);
        callback();
        const doc = await vscode.workspace.openTextDocument(item.filePath);
        await vscode.window.showTextDocument(doc);
      }
    }
  );
}

export function getGoToReferenceCommand() {
  return vscode.commands.registerCommand(
    createCommandName("goToReference"),
    async (
      referencePath: string,
      lineNumber: number,
      notePath: string,
      _referenceId: string
    ) => {
      if (!fs.existsSync(referencePath)) {
        vscode.window.showErrorMessage(`File not found: ${referencePath}`);
        return;
      }

      const doc = await vscode.workspace.openTextDocument(referencePath);
      const editor = await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.One,
        preview: false,
      });

      const position = new vscode.Position(lineNumber - 1, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenter
      );

      const noteDoc = await vscode.workspace.openTextDocument(notePath);

      await vscode.commands.executeCommand(
        "markdown.showPreviewToSide",
        noteDoc.uri,
        { preserveFocus: true }
      );

      // Find the reference heading in the note
      const baseName = path.basename(referencePath);
      const anchor = `## ${baseName}:${lineNumber}`;
      const noteText = noteDoc.getText();
      const anchorIdx = noteText.indexOf(anchor);

      const noteEditor = await vscode.window.showTextDocument(noteDoc, {
        viewColumn: vscode.ViewColumn.Active,
        preview: false,
        preserveFocus: true,
      });

      if (anchorIdx !== -1) {
        const anchorLine = noteDoc.positionAt(anchorIdx).line;
        const notePos = new vscode.Position(anchorLine, 0);
        noteEditor.selection = new vscode.Selection(notePos, notePos);
        noteEditor.revealRange(
          new vscode.Range(notePos, notePos),
          vscode.TextEditorRevealType.InCenter
        );
      }

      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor"
      );
    }
  );
}

export function getViewNoteCommand(context: vscode.ExtensionContext) {
  return vscode.commands.registerCommand(
    createCommandName("viewNote"),
    async () => {
      const currentNote = context.workspaceState.get("currentNote");
      if (!currentNote) {
        vscode.window.showWarningMessage("No note selected!");
        return;
      }

      const doc = await vscode.workspace.openTextDocument(currentNote);
      await vscode.window.showTextDocument(doc);
    }
  );
}

export function getOpenNotesDirCommand(context: vscode.ExtensionContext) {
  return vscode.commands.registerCommand(
    createCommandName("openNotesDir"),
    () => {
      const NOTES_DIR = getNotesDir(context);
      vscode.env.openExternal(vscode.Uri.file(NOTES_DIR));
    }
  );
}

export function getDeleteNoteCommand(
  context: vscode.ExtensionContext,
  storage: NotesStorage,
  _notesTreeProvider: NotesTreeProvider,
  callback: Function
) {
  return vscode.commands.registerCommand(
    createCommandName("deleteNote"),
    async (item: NoteItem) => {
      if (!item.filePath) {
        return;
      }

      const currentNote = context.workspaceState.get("currentNote");
      const noteId = path.basename(item.filePath, ".md");

      const confirm = await vscode.window.showWarningMessage(
        `Delete note "${item.label}"?`,
        { modal: true },
        "Delete"
      );

      if (confirm === "Delete") {
        await storage.deleteNote(noteId);

        if (currentNote === item.filePath) {
          context.workspaceState.update("currentNote", undefined);
          callback();
        }

        await vscode.commands.executeCommand(createCommandName("refreshTree"));
        vscode.window.showInformationMessage("Note deleted");
      }
    }
  );
}

export function getViewNoteAtCommand() {
  return vscode.commands.registerCommand(
    createCommandName("viewNoteAt"),
    // notePath: absolute path to the .md file (passed from codelens/treeView)
    // anchor: "basename:line" heading to scroll to, e.g. "auth.ts:42"
    async (notePath: string, _referenceId: string, anchor: string) => {
      if (!fs.existsSync(notePath)) {
        return;
      }

      const doc = await vscode.workspace.openTextDocument(notePath);
      const editor = await vscode.window.showTextDocument(doc);

      if (anchor) {
        const text = doc.getText();
        const idx = text.indexOf(`## ${anchor}`);
        if (idx !== -1) {
          const pos = doc.positionAt(idx);
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(new vscode.Range(pos, pos));
        }
      }
    }
  );
}

export function getApplyAnnotatedReferenceCommand(
  storage: NotesStorage,
  notesTreeProvider: NotesTreeProvider,
  provider: NotesCodeLensProvider
) {
  return vscode.commands.registerCommand(
    createCommandName("applyAnnotatedReference"),
    async (args: {
      noteId: string;
      file: string;
      line: number;
      codeSnippet: string;
      language: string;
      annotation: string;
    }) => {
      if (!args || !args.noteId) {
        vscode.window.showErrorMessage("Invalid reference data.");
        return;
      }

      try {
        await storage.addReference(
          args.noteId,
          args.file,
          args.line,
          args.codeSnippet,
          args.language,
          args.annotation
        );

        notesTreeProvider.refresh();
        provider.refresh();

        const result = await vscode.window.showInformationMessage(
          "Reference added to note!",
          "View Note"
        );

        if (result === "View Note") {
          vscode.commands.executeCommand(createCommandName("viewNote"));
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to add reference: ${err.message}`);
      }
    }
  );
}

export function getSearchNotesCommand(storage: NotesStorage) {
  return vscode.commands.registerCommand(
    createCommandName("searchNotes"),
    async () => {
      const searchQuery = await vscode.window.showInputBox({
        prompt: "Search in notes (annotations, file names, code)",
        placeHolder: "Enter search term...",
      });

      if (!searchQuery || searchQuery.trim() === "") {
        return;
      }

      const query = searchQuery.toLowerCase();

      const items: Array<{
        label: string;
        description: string;
        detail?: string;
        notePath: string;
      }> = [];

      for (const note of storage.getNotes()) {
        if (note.name.toLowerCase().includes(query)) {
          items.push({
            label: `$(notebook) ${note.name}`,
            description: `Note title: ${note.name}`,
            notePath: note.filePath,
          });
        }

        for (const ref of storage.getReferencesForNote(note.id)) {
          const baseName = path.basename(ref.file);

          if (ref.annotation.toLowerCase().includes(query)) {
            items.push({
              label: `$(note) ${note.name}`,
              description: `${baseName}:${ref.line} - ${ref.annotation}`,
              notePath: note.filePath,
            });
          } else if (ref.codeSnippet.toLowerCase().includes(query)) {
            items.push({
              label: `$(code) ${note.name}`,
              description: `${baseName}:${ref.line} - Code snippet`,
              detail: ref.codeSnippet.substring(0, 100),
              notePath: note.filePath,
            });
          }
        }
      }

      if (items.length === 0) {
        vscode.window.showInformationMessage(
          `No results found for "${searchQuery}"`
        );
        return;
      }

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `Found ${items.length} result${items.length === 1 ? "" : "s"} for "${searchQuery}"`,
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (selected) {
        const doc = await vscode.workspace.openTextDocument(selected.notePath);
        await vscode.window.showTextDocument(doc);
      }
    }
  );
}

export function getChangeNotesDirectoryCommand(
  context: vscode.ExtensionContext,
  storage: NotesStorage,
  notesTreeProvider: NotesTreeProvider,
  provider: NotesCodeLensProvider
) {
  return vscode.commands.registerCommand(
    createCommandName("changeNotesDirectory"),
    async () => {
      const options = await vscode.window.showQuickPick(
        [
          {
            label: "$(folder) Browse for Directory",
            description: "Choose a custom location",
            value: "browse",
          },
          {
            label: "$(home) Use Default Directory",
            description: getDefaultNotesDir(context),
            value: "default",
          },
          {
            label: "$(edit) Enter Path Manually",
            description: "Type a custom path",
            value: "manual",
          },
        ],
        {
          placeHolder: "How would you like to set the notes directory?",
        }
      );

      if (!options) {
        return;
      }

      let newPath: string | undefined;

      if (options.value === "browse") {
        const selected = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: "Select Notes Directory",
          title: "Choose Notes Directory",
        });

        if (selected && selected[0]) {
          newPath = selected[0].fsPath;
        }
      } else if (options.value === "default") {
        newPath = "";
      } else if (options.value === "manual") {
        const NOTES_DIR = getNotesDir(context);
        const input = await vscode.window.showInputBox({
          prompt: "Enter notes directory path",
          placeHolder: "~/Documents/code-notes or /absolute/path",
          value: NOTES_DIR,
          validateInput: (value) => {
            if (!value || value.trim() === "") {
              return "Path cannot be empty";
            }
            return null;
          },
        });

        if (input) {
          newPath = input;
        }
      }

      if (newPath !== undefined) {
        const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
        await config.update(
          "notesDirectory",
          newPath,
          vscode.ConfigurationTarget.Global
        );

        const resolvedDir = getNotesDir(context);
        await storage.reload(resolvedDir);
        notesTreeProvider.refresh();
        provider.refresh();
      }
    }
  );
}

export function getTogglePinReferenceCommand(
  storage: NotesStorage,
  notesTreeProvider: NotesTreeProvider
) {
  return vscode.commands.registerCommand(
    createCommandName("togglePinReference"),
    async (item: NoteItem) => {
      if (!item.referenceId) {
        return;
      }

      const pinned = await storage.togglePinReference(item.referenceId);
      notesTreeProvider.refresh();

      vscode.window.showInformationMessage(
        pinned ? "Reference pinned" : "Reference unpinned"
      );
    }
  );
}

export function getSuggestNoteCommand(
  context: vscode.ExtensionContext,
  storage: NotesStorage,
  notesTreeProvider: NotesTreeProvider,
  provider: NotesCodeLensProvider
) {
  return vscode.commands.registerCommand(
    createCommandName("suggestNote"),
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor!");
        return;
      }

      const notes = storage.getNotes();
      if (notes.length === 0) {
        const action = await vscode.window.showWarningMessage(
          "No notes found. Create one first!",
          "Create Note"
        );
        if (action === "Create Note") {
          await vscode.commands.executeCommand(createCommandName("createNote"));
        }
        return;
      }

      const document = editor.document;
      const selection = editor.selection;
      const codeSnippet =
        document.getText(selection) ||
        document.lineAt(selection.start.line).text;
      const file = document.fileName;
      const lineNumber = selection.start.line + 1;
      const language = document.languageId;
      const baseName = path.basename(file);

      // Build notes context for the LLM
      const notesSummary = notes
        .map((n) => {
          const refs = storage.getReferencesForNote(n.id);
          const refLines = refs
            .map(
              (r) =>
                `  - ${path.basename(r.file)}:${r.line}${r.annotation ? ` — ${r.annotation}` : ""}`
            )
            .join("\n");
          return `Note "${n.name}" (id: ${n.id}), ${refs.length} ref(s):\n${refLines}`;
        })
        .join("\n\n");

      const noteIds = notes.map((n) => `"${n.id}"`).join(", ");

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Suggesting note for ${baseName}:${lineNumber}…`,
          cancellable: true,
        },
        async (_progress, cancelToken) => {
          const models = await vscode.lm.selectChatModels({
            vendor: "copilot",
            family: "gpt-4o",
          });

          if (models.length === 0) {
            vscode.window.showErrorMessage(
              "No language model available. Make sure GitHub Copilot is active."
            );
            return;
          }

          const model = models[0];

          const messages = [
            vscode.LanguageModelChatMessage.User(
              `You are helping a developer file a code reference into the right note.\n\n` +
              `## Existing notes\n${notesSummary}\n\n` +
              `## Code to file\nFile: ${baseName}, Line: ${lineNumber}\n` +
              `\`\`\`${language}\n${codeSnippet}\n\`\`\`\n\n` +
              `## Instructions\nAvailable note IDs: ${noteIds}\n` +
              `Respond in exactly this format with no preamble or extra text:\n` +
              `NOTE: <best-matching note-id>\n` +
              `ANNOTATION: <1–2 sentence annotation for this code>\n` +
              `REASON: <1 sentence explaining why this note fits best>`
            ),
          ];

          let raw = "";
          try {
            const response = await model.sendRequest(messages, {}, cancelToken);
            for await (const chunk of response.stream) {
              if (chunk instanceof vscode.LanguageModelTextPart) {
                raw += chunk.value;
              }
            }
          } catch (err: any) {
            if (err instanceof vscode.CancellationError) {
              return;
            }
            vscode.window.showErrorMessage(
              `Language model error: ${err.message}`
            );
            return;
          }

          // Parse structured fields
          const get = (field: string) =>
            raw.match(new RegExp(`^${field}:\\s*(.+)$`, "m"))?.[1]?.trim() ??
            "";

          const primaryId = get("NOTE");
          const annotation = get("ANNOTATION");
          const reason = get("REASON");

          const resolveNote = (id: string): NoteEntry | null =>
            storage.getNote(id) ??
            notes.find(
              (n) => n.name.toLowerCase() === id.toLowerCase()
            ) ??
            null;

          const suggestedNote = resolveNote(primaryId);

          if (!suggestedNote) {
            vscode.window.showWarningMessage(
              "Could not determine a suggestion. Try the chat command instead."
            );
            return;
          }

          // Build quick-pick items
          const items: Array<
            vscode.QuickPickItem & { noteId?: string; annotation?: string }
          > = [
              {
                label: `$(sparkle) ${suggestedNote.name}`,
                description: "Suggested",
                detail: reason || undefined,
                noteId: suggestedNote.id,
                annotation,
              },
              { label: "", kind: vscode.QuickPickItemKind.Separator },
              ...notes
                .filter((n) => n.id !== suggestedNote.id)
                .map((n) => ({
                  label: n.name,
                  description: `${storage.getReferencesForNote(n.id).length} refs`,
                  noteId: n.id,
                  annotation,
                })),
            ];

          const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Add to "${suggestedNote.name}"? (AI annotation: ${annotation})`,
          });

          if (!selected || !selected.noteId) {
            return;
          }

          await storage.addReference(
            selected.noteId,
            file,
            lineNumber,
            codeSnippet,
            language,
            selected.annotation ?? ""
          );

          notesTreeProvider.refresh();
          provider.refresh();

          const result = await vscode.window.showInformationMessage(
            `Reference added to "${notes.find((n) => n.id === selected.noteId)?.name}"!`,
            "View Note"
          );

          if (result === "View Note") {
            const noteEntry = storage.getNote(selected.noteId);
            if (noteEntry) {
              context.workspaceState.update("currentNote", noteEntry.filePath);
              const doc = await vscode.workspace.openTextDocument(
                noteEntry.filePath
              );
              await vscode.window.showTextDocument(doc);
            }
          }
        }
      );
    }
  );
}
