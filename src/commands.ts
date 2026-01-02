import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

import { NoteItem, NotesTreeProvider } from "./treeView";
import { createCommandName, getNotesDir } from "./utils";
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
      const NOTES_DIR = getNotesDir(context);

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
      const NOTES_DIR = getNotesDir(context);
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
        const NOTES_DIR = getNotesDir(context);

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
      const NOTES_DIR = getNotesDir(context);
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

export function getSearchNotesCommand(context: vscode.ExtensionContext) {
  // Command: Search notes
  return vscode.commands.registerCommand(
    createCommandName("searchNotes"),
    async () => {
      const NOTES_DIR = getNotesDir(context);

      const searchQuery = await vscode.window.showInputBox({
        prompt: "Search in notes (annotations, file names, code)",
        placeHolder: "Enter search term...",
      });

      if (!searchQuery || searchQuery.trim() === "") {
        return;
      }

      const query = searchQuery.toLowerCase();
      const results: Array<{
        noteName: string;
        notePath: string;
        matches: Array<{
          type: "title" | "annotation" | "code" | "filename";
          line: number;
          fileName?: string;
          content: string;
          preview: string;
        }>;
      }> = [];

      // Search through all notes
      const noteFiles = fs
        .readdirSync(NOTES_DIR)
        .filter((f) => f.endsWith(".md"));

      for (const noteFile of noteFiles) {
        const notePath = path.join(NOTES_DIR, noteFile);
        const content = fs.readFileSync(notePath, "utf-8");
        const lines = content.split("\n");
        const noteName = path.basename(noteFile, ".md");
        const noteMatches: (typeof results)[0]["matches"] = [];

        // Check note title
        if (noteName.toLowerCase().includes(query)) {
          noteMatches.push({
            type: "title",
            line: 1,
            content: noteName,
            preview: `Note title: ${noteName}`,
          });
        }

        // Parse sections and search
        let currentSection: {
          fileName?: string;
          lineNum?: number;
          annotation?: string;
          code?: string;
        } = {};
        let inCodeBlock = false;
        let codeLines: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineNum = i + 1;

          // Detect section headers (## filename:line)
          const sectionMatch = line.match(/^## (.+?):(\d+)/);
          if (sectionMatch) {
            // Process previous section if it had matches
            if (currentSection.fileName) {
              const sectionContent = [
                currentSection.annotation,
                currentSection.code,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

              if (sectionContent.includes(query)) {
                if (currentSection.annotation?.toLowerCase().includes(query)) {
                  noteMatches.push({
                    type: "annotation",
                    line: lineNum,
                    fileName: currentSection.fileName,
                    content: currentSection.annotation!,
                    preview: `${currentSection.fileName}:${currentSection.lineNum} - ${currentSection.annotation}`,
                  });
                }
                if (currentSection.code?.toLowerCase().includes(query)) {
                  noteMatches.push({
                    type: "code",
                    line: lineNum,
                    fileName: currentSection.fileName,
                    content: currentSection.code!,
                    preview: `${currentSection.fileName}:${currentSection.lineNum} - Code snippet`,
                  });
                }
              }
            }

            // Start new section
            currentSection = {
              fileName: sectionMatch[1],
              lineNum: parseInt(sectionMatch[2]),
              annotation: undefined,
              code: undefined,
            };
            codeLines = [];
            inCodeBlock = false;
          }

          // Extract annotation
          const noteMatch = line.match(/\*\*Note:\*\* (.+)/);
          if (noteMatch) {
            currentSection.annotation = noteMatch[1];
          }

          // Track code blocks
          if (line.startsWith("```")) {
            inCodeBlock = !inCodeBlock;
            continue;
          }

          if (inCodeBlock) {
            codeLines.push(line);
          }
        }

        // Process last section
        if (currentSection.fileName) {
          currentSection.code = codeLines.join("\n");
          const sectionContent = [
            currentSection.annotation,
            currentSection.code,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          if (sectionContent.includes(query)) {
            if (currentSection.annotation?.toLowerCase().includes(query)) {
              noteMatches.push({
                type: "annotation",
                line: lines.length,
                fileName: currentSection.fileName,
                content: currentSection.annotation!,
                preview: `${currentSection.fileName}:${currentSection.lineNum} - ${currentSection.annotation}`,
              });
            }
            if (currentSection.code?.toLowerCase().includes(query)) {
              noteMatches.push({
                type: "code",
                line: lines.length,
                fileName: currentSection.fileName,
                content: currentSection.code!,
                preview: `${currentSection.fileName}:${currentSection.lineNum} - Code snippet`,
              });
            }
          }
        }

        if (noteMatches.length > 0) {
          results.push({
            noteName,
            notePath,
            matches: noteMatches,
          });
        }
      }

      // Display results
      if (results.length === 0) {
        vscode.window.showInformationMessage(
          `No results found for "${searchQuery}"`
        );
        return;
      }

      // Create quick pick items
      const items = results.flatMap((result) => {
        return result.matches.map((match) => {
          let icon = "$(file)";
          if (match.type === "title") {
            icon = "$(notebook)";
          } else if (match.type === "annotation") {
            icon = "$(note)";
          } else if (match.type === "code") {
            icon = "$(code)";
          }

          return {
            label: `${icon} ${result.noteName}`,
            description: match.preview,
            detail:
              match.type === "code"
                ? match.content.substring(0, 100) +
                  (match.content.length > 100 ? "..." : "")
                : undefined,
            notePath: result.notePath,
          };
        });
      });

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `Found ${items.length} result${
          items.length === 1 ? "" : "s"
        } for "${searchQuery}"`,
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
