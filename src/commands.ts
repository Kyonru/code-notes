import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

import { NoteItem, NotesTreeProvider } from "./treeView";
import { createCommandName } from "./utils";
import { NotesCodeLensProvider } from "./codelens";

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
  notesTreeProvider: NotesTreeProvider
) {
  return vscode.commands.registerCommand(
    createCommandName("createNote"),
    async () => {
      const NOTES_DIR = context.globalStorageUri.fsPath;

      const noteName = await vscode.window.showInputBox({
        prompt: "Enter note name",
        placeHolder: "my-note",
      });

      if (noteName) {
        const fileName = `${noteName}.md`;
        const filePath = path.join(NOTES_DIR, fileName);

        if (fs.existsSync(filePath)) {
          vscode.window.showWarningMessage("Note already exists!");

          context.workspaceState.update("currentNote", filePath);
        } else {
          fs.writeFileSync(filePath, `# ${noteName}\n\n`);
          context.workspaceState.update("currentNote", filePath);
          vscode.window.showInformationMessage(`Created note: ${fileName}`);
        }

        await vscode.commands.executeCommand(createCommandName("refreshTree"));
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
      }
    }
  );
}

export function getSelectNoteCommand(
  context: vscode.ExtensionContext,
  notesTreeProvider: NotesTreeProvider
) {
  // Command: Select existing note
  return vscode.commands.registerCommand(
    createCommandName("selectNote"),
    async () => {
      const NOTES_DIR = context.globalStorageUri.fsPath;
      const files = fs.readdirSync(NOTES_DIR).filter((f) => f.endsWith(".md"));

      if (files.length === 0) {
        vscode.window.showInformationMessage(
          "No notes found. Create one first!"
        );
        return;
      }

      const selected = await vscode.window.showQuickPick(files, {
        placeHolder: "Select a note",
      });

      if (selected) {
        const NOTES_DIR = context.globalStorageUri.fsPath;

        const currentNote = path.join(NOTES_DIR, selected);
        context.workspaceState.update("currentNote", currentNote);
        await vscode.commands.executeCommand(createCommandName("refreshTree"));
        const doc = await vscode.workspace.openTextDocument(currentNote);
        await vscode.window.showTextDocument(doc);
      }
    }
  );
}

export function getAddReferenceCommand(
  context: vscode.ExtensionContext,
  notesTreeProvider: NotesTreeProvider
) {
  return vscode.commands.registerCommand(
    createCommandName("addReference"),
    async () => {
      const currentNote = context.workspaceState.get<string>("currentNote");
      if (!currentNote) {
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
      const fileName = path.basename(document.fileName);

      // Get optional annotation text
      const annotation = await vscode.window.showInputBox({
        prompt: "Add annotation (optional)",
        placeHolder: "Enter your notes about this code...",
      });

      // Build reference entry
      let entry = `\n## ${fileName}:${lineNumber}\n\n`;
      entry += `**Path:** \`${document.fileName}\`\n`;
      entry += `</br>\n`;
      entry += `**Line:** ${lineNumber}\n\n`;

      if (annotation) {
        entry += `**Note:** ${annotation}\n\n`;
      }

      entry += "```" + document.languageId + "\n";
      entry += selectedText || document.lineAt(selection.start.line).text;
      entry += "\n```\n";

      // Append to note
      fs.appendFileSync(currentNote, entry);

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
      relativePath: string,
      lineNumber: number,
      filePath: string,
      markdownLine: number
    ) => {
      if (!fs.existsSync(relativePath)) {
        vscode.window.showErrorMessage(`File not found: ${relativePath}`);
        return;
      }

      const doc = await vscode.workspace.openTextDocument(relativePath);
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

      const previewDoc = await vscode.workspace.openTextDocument(filePath);

      await vscode.commands.executeCommand(
        "markdown.showPreviewToSide",
        previewDoc.uri,
        { preserveFocus: true }
      );

      const preview = await vscode.window.showTextDocument(previewDoc, {
        viewColumn: vscode.ViewColumn.Active,
        preview: false,
        preserveFocus: true,
      });

      const previewPosition = new vscode.Position(markdownLine - 1, 0);
      preview.selection = new vscode.Selection(
        previewPosition,
        previewPosition
      );
      preview.revealRange(
        new vscode.Range(previewPosition, previewPosition),
        vscode.TextEditorRevealType.InCenter
      );
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
      const NOTES_DIR = context.globalStorageUri.fsPath;
      vscode.env.openExternal(vscode.Uri.file(NOTES_DIR));
    }
  );
}

export function getDeleteNoteCommand(
  context: vscode.ExtensionContext,
  notesTreeProvider: NotesTreeProvider,
  callback: Function
) {
  return vscode.commands.registerCommand(
    createCommandName("deleteNote"),
    async (item: NoteItem) => {
      if (!item.filePath) {
        return;
      }

      const currentNote = context.workspaceState.get("currentNote");

      const confirm = await vscode.window.showWarningMessage(
        `Delete note "${item.label}"?`,
        { modal: true },
        "Delete"
      );

      if (confirm === "Delete") {
        fs.unlinkSync(item.filePath);
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
    async (notePath: string, noteLine: number) => {
      const doc = await vscode.workspace.openTextDocument(notePath);
      const editor = await vscode.window.showTextDocument(doc);

      const pos = new vscode.Position(noteLine - 1, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos));
    }
  );
}
