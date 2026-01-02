import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { createCommandName, getLineFromOffset, getNotesDir } from "./utils";
import { NoteReference } from "./types";

export class NoteItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly filePath?: string,
    public readonly type?: "note" | "reference",
    public readonly referencePath?: string,
    public readonly lineNumber?: number
  ) {
    super(label, collapsibleState);

    if (type === "note") {
      this.contextValue = "note";
      this.iconPath = new vscode.ThemeIcon("notebook");
    } else if (type === "reference") {
      this.contextValue = "reference";
      this.iconPath = new vscode.ThemeIcon("symbol-method");
    }
  }
}

// Tree view data provider
export class NotesTreeProvider implements vscode.TreeDataProvider<NoteItem> {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private _onDidChangeTreeData: vscode.EventEmitter<
    NoteItem | undefined | null | void
  > = new vscode.EventEmitter<NoteItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    NoteItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: NoteItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: NoteItem): Thenable<NoteItem[]> {
    const NOTES_DIR = getNotesDir(this.context);

    if (!fs.existsSync(NOTES_DIR)) {
      return Promise.resolve([]);
    }

    if (element) {
      // Return sections/references within a note
      return Promise.resolve(this.getNoteSections(element.filePath!));
    } else {
      // Return all note files
      return Promise.resolve(this.getNoteFiles());
    }
  }

  private getNoteFiles(): NoteItem[] {
    const NOTES_DIR = getNotesDir(this.context);

    const files = fs
      .readdirSync(NOTES_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort();

    return files.map((file) => {
      const filePath = path.join(NOTES_DIR, file);
      const stats = fs.statSync(filePath);
      const item = new NoteItem(
        path.basename(file, ".md"),
        vscode.TreeItemCollapsibleState.Collapsed,
        filePath,
        "note"
      );
      item.tooltip = `Modified: ${stats.mtime.toLocaleString()}`;
      item.description = this.getReferencesCount(filePath);
      return item;
    });
  }

  private getNoteSections(filePath: string): NoteItem[] {
    const content = fs.readFileSync(filePath, "utf-8");
    const sections: NoteItem[] = [];

    // Match sections like "## filename.ts:123"
    const sectionRegex = /## (.+?):(\d+)/g;
    let match;

    const noteIndex =
      this.context.workspaceState.get<Record<string, NoteReference>>(
        "noteIndex"
      ) || {};

    while ((match = sectionRegex.exec(content)) !== null) {
      const fileName = match[1];
      const lineNumber = match[2];
      const sectionStart = match.index;

      // Extract the note content for this section
      const nextSection = content.indexOf("\n## ", sectionStart + 1);
      const sectionContent = content.substring(
        sectionStart,
        nextSection === -1 ? content.length : nextSection
      );

      // Extract the path from the section
      const pathMatch = sectionContent.match(/\*\*Path:\*\* `(.+?)`/);
      const relativePath = pathMatch ? pathMatch[1] : "";

      // Extract annotation if exists
      const noteMatch = sectionContent.match(/\*\*Note:\*\* (.+?)(?:\n|$)/);
      const annotation = noteMatch ? noteMatch[1] : "";

      const itemName = `${fileName}:${lineNumber}`;

      const markdownLine = getLineFromOffset(content, sectionStart);

      const item = new NoteItem(
        itemName,
        vscode.TreeItemCollapsibleState.None,
        filePath,
        "reference",
        relativePath,
        parseInt(lineNumber)
      );

      item.tooltip = annotation || relativePath;
      item.description = annotation
        ? annotation.substring(0, 50) + (annotation.length > 50 ? "..." : "")
        : "";
      item.command = {
        command: createCommandName("goToReference"),
        title: "Go to Reference",
        arguments: [relativePath, parseInt(lineNumber), filePath, markdownLine],
      };

      noteIndex[`@${fileName}:${relativePath}:${lineNumber}`] = {
        noteName: fileName,
        notePath: filePath,
        noteLine: markdownLine,
        file: relativePath,
        line: parseInt(lineNumber),
      };

      sections.push(item);
    }

    console.log("kyonru noteIndex", noteIndex);

    this.context.workspaceState.update("noteIndex", noteIndex);

    return sections;
  }

  private getReferencesCount(filePath: string): string {
    const content = fs.readFileSync(filePath, "utf-8");
    const matches = content.match(/## .+?:\d+/g);
    const count = matches ? matches.length : 0;
    return count === 1 ? "1 ref" : `${count} refs`;
  }
}
