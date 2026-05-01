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

const NOTE_TEMPLATES: Array<{
  label: string;
  description: string;
  content: (name: string) => string;
}> = [
    {
      label: "Bug Investigation",
      description: "Track a bug from symptoms to root cause",
      content: (name) =>
        `# ${name}\n\n## Symptoms\n\n\n\n## Steps to Reproduce\n\n1. \n\n## Root Cause\n\n\n\n## Fix\n\n\n`,
    },
    {
      label: "Code Review",
      description: "Notes for reviewing a PR or module",
      content: (name) =>
        `# ${name}\n\n## Overview\n\n\n\n## Key Changes\n\n\n\n## Concerns\n\n\n\n## Suggestions\n\n\n`,
    },
    {
      label: "Feature Exploration",
      description: "Research and plan a new feature",
      content: (name) =>
        `# ${name}\n\n## Goal\n\n\n\n## Relevant Code\n\n\n\n## Approach\n\n\n\n## Open Questions\n\n\n`,
    },
    {
      label: "Architecture Decision",
      description: "Document a technical decision (ADR-style)",
      content: (name) =>
        `# ${name}\n\n## Context\n\n\n\n## Decision\n\n\n\n## Alternatives Considered\n\n\n\n## Consequences\n\n\n`,
    },
    {
      label: "Learning Notes",
      description: "Capture learnings about a codebase area",
      content: (name) =>
        `# ${name}\n\n## Summary\n\n\n\n## Key Concepts\n\n\n\n## Code Patterns\n\n\n\n## Questions\n\n\n`,
    },
  ];

export function getCreateNoteFromTemplateCommand(
  context: vscode.ExtensionContext,
  storage: NotesStorage,
  _notesTreeProvider: NotesTreeProvider
) {
  return vscode.commands.registerCommand(
    createCommandName("createNoteFromTemplate"),
    async () => {
      const selected = await vscode.window.showQuickPick(
        NOTE_TEMPLATES.map((t) => ({
          label: t.label,
          description: t.description,
        })),
        { placeHolder: "Select a template" }
      );

      if (!selected) {
        return;
      }

      const template = NOTE_TEMPLATES.find((t) => t.label === selected.label)!;

      const noteName = await vscode.window.showInputBox({
        prompt: "Enter note name",
        placeHolder: `my-${selected.label.toLowerCase().replace(/\s+/g, "-")}`,
      });

      if (!noteName) {
        return;
      }

      const slugId = noteName.replace(/[^a-z0-9-_]/gi, "-").toLowerCase();
      const alreadyExists = storage.noteExists(slugId);

      if (alreadyExists) {
        vscode.window.showInformationMessage(
          `Note "${noteName}" already exists.`
        );
        return;
      }

      const note = await storage.createNote(noteName, template.content(noteName));

      vscode.window.showInformationMessage(
        `Created note from "${selected.label}" template: ${note.name}`
      );

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

export function getImportFromClipboardCommand(
  context: vscode.ExtensionContext,
  storage: NotesStorage,
  notesTreeProvider: NotesTreeProvider,
  provider: NotesCodeLensProvider
) {
  return vscode.commands.registerCommand(
    createCommandName("importFromClipboard"),
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

      const noteId = path.basename(currentNotePath, ".md");
      const clipboard = await vscode.env.clipboard.readText();

      if (!clipboard || !clipboard.trim()) {
        vscode.window.showWarningMessage("Clipboard is empty.");
        return;
      }

      // Detect file references: patterns like path/file.ext:line or path/file.ext#L10
      const refPattern = /(?:^|\s|`)((?:[\w./-]+\/)?[\w.-]+\.\w+)(?::(\d+)|#L(\d+))/gm;
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const workspaceRoot = workspaceFolders?.[0]?.uri.fsPath ?? "";

      interface DetectedRef {
        file: string;
        line: number;
        resolvedPath: string;
      }

      const detected: DetectedRef[] = [];
      let match: RegExpExecArray | null;

      while ((match = refPattern.exec(clipboard)) !== null) {
        const filePart = match[1];
        const line = parseInt(match[2] || match[3], 10);

        // Try to resolve the file path
        let resolvedPath = "";
        if (path.isAbsolute(filePart) && fs.existsSync(filePart)) {
          resolvedPath = filePart;
        } else if (workspaceRoot) {
          const candidate = path.resolve(workspaceRoot, filePart);
          if (fs.existsSync(candidate)) {
            resolvedPath = candidate;
          }
        }

        if (resolvedPath && line > 0) {
          detected.push({ file: filePart, line, resolvedPath });
        }
      }

      if (detected.length === 0) {
        // No file refs detected — append clipboard content as raw markdown to the note
        const confirm = await vscode.window.showInformationMessage(
          "No file references detected. Append clipboard content to the note as text?",
          "Append",
          "Cancel"
        );
        if (confirm === "Append") {
          fs.appendFileSync(currentNotePath, `\n---\n\n${clipboard}\n`);
          vscode.window.showInformationMessage("Clipboard content appended to note.");
          const doc = await vscode.workspace.openTextDocument(currentNotePath);
          await vscode.window.showTextDocument(doc);
        }
        return;
      }

      // Show detected references and let user confirm
      const items = detected.map((d) => ({
        label: `${d.file}:${d.line}`,
        description: d.resolvedPath,
        picked: true,
        ref: d,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `Found ${detected.length} reference(s) in clipboard. Select which to add.`,
        canPickMany: true,
      });

      if (!selected || selected.length === 0) {
        return;
      }

      let added = 0;
      for (const item of selected) {
        const { resolvedPath, line } = item.ref;

        // Read the code snippet from the file
        let snippet = "";
        let language = "";
        try {
          const fileContent = fs.readFileSync(resolvedPath, "utf-8");
          const lines = fileContent.split("\n");
          snippet = lines[line - 1] ?? "";
          // Detect language from extension
          const ext = path.extname(resolvedPath).slice(1);
          language = ext || "plaintext";
        } catch {
          snippet = "";
          language = "plaintext";
        }

        await storage.addReference(
          noteId,
          resolvedPath,
          line,
          snippet,
          language,
          ""
        );
        added++;
      }

      notesTreeProvider.refresh();
      provider.refresh();

      const result = await vscode.window.showInformationMessage(
        `Imported ${added} reference(s) from clipboard!`,
        "View Note"
      );

      if (result === "View Note") {
        vscode.commands.executeCommand(createCommandName("viewNote"));
      }
    }
  );
}

export function getArchiveNoteCommand(
  context: vscode.ExtensionContext,
  storage: NotesStorage,
  notesTreeProvider: NotesTreeProvider
) {
  return vscode.commands.registerCommand(
    createCommandName("archiveNote"),
    async (item?: NoteItem) => {
      let noteId: string | undefined;

      if (item?.filePath) {
        noteId = path.basename(item.filePath, ".md");
      } else {
        const notes = storage.getNotes();
        if (notes.length === 0) {
          vscode.window.showInformationMessage("No notes to archive.");
          return;
        }
        const selected = await vscode.window.showQuickPick(
          notes.map((n) => ({ label: n.name, noteId: n.id })),
          { placeHolder: "Select a note to archive" }
        );
        if (!selected) { return; }
        noteId = selected.noteId;
      }

      await storage.archiveNote(noteId!);

      // Clear current note if it was archived
      const currentNotePath = context.workspaceState.get<string>("currentNote");
      if (currentNotePath && path.basename(currentNotePath, ".md") === noteId) {
        context.workspaceState.update("currentNote", undefined);
      }

      notesTreeProvider.refresh();
      vscode.window.showInformationMessage("Note archived.");
    }
  );
}

export function getUnarchiveNoteCommand(
  storage: NotesStorage,
  notesTreeProvider: NotesTreeProvider
) {
  return vscode.commands.registerCommand(
    createCommandName("unarchiveNote"),
    async (item?: NoteItem) => {
      let noteId: string | undefined;

      if (item?.filePath) {
        noteId = path.basename(item.filePath, ".md");
      } else {
        const archived = storage.getArchivedNotes();
        if (archived.length === 0) {
          vscode.window.showInformationMessage("No archived notes.");
          return;
        }
        const selected = await vscode.window.showQuickPick(
          archived.map((n) => ({ label: n.name, noteId: n.id })),
          { placeHolder: "Select a note to unarchive" }
        );
        if (!selected) { return; }
        noteId = selected.noteId;
      }

      await storage.unarchiveNote(noteId!);
      notesTreeProvider.refresh();
      vscode.window.showInformationMessage("Note unarchived.");
    }
  );
}

export function getToggleShowArchivedCommand(
  context: vscode.ExtensionContext,
  notesTreeProvider: NotesTreeProvider
) {
  return vscode.commands.registerCommand(
    createCommandName("toggleShowArchived"),
    async () => {
      const current = context.workspaceState.get<boolean>("showArchived") ?? false;
      await context.workspaceState.update("showArchived", !current);
      notesTreeProvider.refresh();
      vscode.window.showInformationMessage(
        !current ? "Showing archived notes." : "Hiding archived notes."
      );
    }
  );
}

export function getAddTagCommand(
  storage: NotesStorage,
  notesTreeProvider: NotesTreeProvider
) {
  return vscode.commands.registerCommand(
    createCommandName("addTag"),
    async (item?: NoteItem) => {
      let noteId: string | undefined;

      if (item?.filePath) {
        noteId = path.basename(item.filePath, ".md");
      } else {
        // Pick a note
        const notes = storage.getNotes();
        if (notes.length === 0) {
          vscode.window.showInformationMessage("No notes found.");
          return;
        }
        const selected = await vscode.window.showQuickPick(
          notes.map((n) => ({
            label: n.name,
            noteId: n.id,
          })),
          { placeHolder: "Select a note to tag" }
        );
        if (!selected) { return; }
        noteId = selected.noteId;
      }

      const existingTags = storage.getAllTags();
      const input = await vscode.window.showInputBox({
        prompt: "Enter tag (without #)",
        placeHolder: existingTags.length > 0
          ? `Existing: ${existingTags.join(", ")}`
          : "e.g. auth, perf, bug",
      });

      if (!input || !input.trim()) { return; }

      // Support comma-separated tags
      const tags = input.split(",").map((t) => t.trim()).filter(Boolean);
      for (const tag of tags) {
        await storage.addTag(noteId!, tag);
      }

      notesTreeProvider.refresh();
      vscode.window.showInformationMessage(
        `Tag${tags.length > 1 ? "s" : ""} added: ${tags.map((t) => `#${t}`).join(", ")}`
      );
    }
  );
}

export function getRemoveTagCommand(
  storage: NotesStorage,
  notesTreeProvider: NotesTreeProvider
) {
  return vscode.commands.registerCommand(
    createCommandName("removeTag"),
    async (item?: NoteItem) => {
      let noteId: string | undefined;

      if (item?.filePath) {
        noteId = path.basename(item.filePath, ".md");
      } else {
        const notes = storage.getNotes().filter((n) => n.tags && n.tags.length > 0);
        if (notes.length === 0) {
          vscode.window.showInformationMessage("No tagged notes found.");
          return;
        }
        const selected = await vscode.window.showQuickPick(
          notes.map((n) => ({
            label: n.name,
            description: (n.tags ?? []).map((t) => `#${t}`).join(" "),
            noteId: n.id,
          })),
          { placeHolder: "Select a note to remove tag from" }
        );
        if (!selected) { return; }
        noteId = selected.noteId;
      }

      const note = storage.getNote(noteId!);
      if (!note || !note.tags || note.tags.length === 0) {
        vscode.window.showInformationMessage("This note has no tags.");
        return;
      }

      const selected = await vscode.window.showQuickPick(
        note.tags.map((t) => ({ label: `#${t}`, tag: t })),
        { placeHolder: "Select tag to remove", canPickMany: true }
      );

      if (!selected || selected.length === 0) { return; }

      for (const item of selected) {
        await storage.removeTag(noteId!, item.tag);
      }

      notesTreeProvider.refresh();
      vscode.window.showInformationMessage("Tag(s) removed.");
    }
  );
}

export function getFilterByTagCommand(
  context: vscode.ExtensionContext,
  storage: NotesStorage,
  notesTreeProvider: NotesTreeProvider
) {
  return vscode.commands.registerCommand(
    createCommandName("filterByTag"),
    async () => {
      const allTags = storage.getAllTags();

      if (allTags.length === 0) {
        vscode.window.showInformationMessage("No tags found. Add tags to notes first.");
        return;
      }

      const items = [
        { label: "$(close) Clear filter", tag: "" },
        ...allTags.map((t) => ({
          label: `#${t}`,
          description: `${storage.getNotesByTag(t).length} note(s)`,
          tag: t,
        })),
      ];

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "Filter notes by tag",
      });

      if (!selected) { return; }

      context.workspaceState.update("tagFilter", selected.tag || undefined);
      notesTreeProvider.refresh();

      if (selected.tag) {
        vscode.window.showInformationMessage(`Filtering by #${selected.tag}`);
      } else {
        vscode.window.showInformationMessage("Tag filter cleared.");
      }
    }
  );
}

export function getBulkAddReferencesCommand(
  context: vscode.ExtensionContext,
  storage: NotesStorage,
  notesTreeProvider: NotesTreeProvider,
  provider: NotesCodeLensProvider
) {
  return vscode.commands.registerCommand(
    createCommandName("bulkAddReferences"),
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

      const noteId = path.basename(currentNotePath, ".md");
      const editor = vscode.window.activeTextEditor;

      if (!editor) {
        vscode.window.showErrorMessage("No active editor!");
        return;
      }

      const document = editor.document;
      const selections = editor.selections;

      // Use all multi-cursor selections
      if (selections.length < 2) {
        vscode.window.showInformationMessage(
          "Use multiple cursors/selections (Cmd+D or Alt+Click) to select multiple code ranges, then run this command."
        );
        return;
      }

      const annotation = await vscode.window.showInputBox({
        prompt: `Add annotation for all ${selections.length} references (optional)`,
        placeHolder: "Enter shared annotation for these references...",
      });

      if (annotation === undefined) {
        return; // User cancelled
      }

      let added = 0;
      for (const sel of selections) {
        const selectedText = document.getText(sel);
        const lineNumber = sel.start.line + 1;
        const snippet =
          selectedText || document.lineAt(sel.start.line).text;

        await storage.addReference(
          noteId,
          document.fileName,
          lineNumber,
          snippet,
          document.languageId,
          annotation
        );
        added++;
      }

      notesTreeProvider.refresh();
      provider.refresh();

      const result = await vscode.window.showInformationMessage(
        `Added ${added} references to note!`,
        "View Note"
      );

      if (result === "View Note") {
        vscode.commands.executeCommand(createCommandName("viewNote"));
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

export function getReferencesToThisFileCommand(storage: NotesStorage) {
  return vscode.commands.registerCommand(
    createCommandName("referencesToThisFile"),
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active file.");
        return;
      }

      const filePath = editor.document.uri.fsPath;
      const refs = storage.getReferencesForFile(filePath);

      if (refs.length === 0) {
        vscode.window.showInformationMessage(
          "No notes reference this file."
        );
        return;
      }

      // Group by note
      const noteMap = new Map<string, { note: NoteEntry; lines: number[] }>();
      for (const ref of refs) {
        const note = storage.getNote(ref.noteId);
        if (!note) { continue; }
        if (!noteMap.has(ref.noteId)) {
          noteMap.set(ref.noteId, { note, lines: [] });
        }
        noteMap.get(ref.noteId)!.lines.push(ref.line);
      }

      const items = Array.from(noteMap.values()).map(({ note, lines }) => ({
        label: note.name,
        description: `Lines: ${lines.sort((a, b) => a - b).join(", ")}`,
        noteId: note.id,
        lines,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "Notes referencing this file",
        matchOnDescription: true,
      });

      if (picked) {
        const notePath = path.join(
          storage.getNotesDirectory(),
          `${picked.noteId}.md`
        );
        const doc = await vscode.workspace.openTextDocument(notePath);
        await vscode.window.showTextDocument(doc);
      }
    }
  );
}

export function getToggleWorkspaceStorageCommand(
  context: vscode.ExtensionContext,
  storage: NotesStorage,
  notesTreeProvider: NotesTreeProvider,
  provider: NotesCodeLensProvider
) {
  return vscode.commands.registerCommand(
    createCommandName("toggleWorkspaceStorage"),
    async () => {
      const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
      const current = config.get<boolean>("useWorkspaceFolder") ?? false;

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showWarningMessage(
          "No workspace folder open. Cannot use workspace storage."
        );
        return;
      }

      const newValue = !current;
      const label = newValue
        ? "Enable workspace storage (.codenotes/)"
        : "Disable workspace storage (use global)";

      const confirm = await vscode.window.showInformationMessage(
        `${label}?\n\nExisting notes will remain in their current location.`,
        { modal: true },
        "Confirm"
      );

      if (confirm !== "Confirm") {
        return;
      }

      await config.update(
        "useWorkspaceFolder",
        newValue,
        vscode.ConfigurationTarget.Workspace
      );

      const resolvedDir = getNotesDir(context);

      // Ensure the directory exists
      if (!fs.existsSync(resolvedDir)) {
        fs.mkdirSync(resolvedDir, { recursive: true });
      }

      await storage.reload(resolvedDir);
      notesTreeProvider.refresh();
      provider.refresh();

      const location = newValue
        ? `.codenotes/ (workspace-relative)`
        : "global storage";
      vscode.window.showInformationMessage(
        `Notes directory switched to ${location}.`
      );
    }
  );
}
