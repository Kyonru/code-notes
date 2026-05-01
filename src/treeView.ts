import * as vscode from "vscode";
import * as path from "path";
import { createCommandName } from "./utils";
import { NotesStorage } from "./storage";

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

export class NotesTreeProvider implements vscode.TreeDataProvider<NoteItem> {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly storage: NotesStorage
  ) {}

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
    if (element) {
      return Promise.resolve(this.getNoteSections(element));
    }
    return Promise.resolve(this.getNoteFiles());
  }

  private getNoteFiles(): NoteItem[] {
    const notes = this.storage.getNotes();

    return notes.map((note) => {
      const refCount = this.storage.getReferencesForNote(note.id).length;
      const item = new NoteItem(
        note.name,
        vscode.TreeItemCollapsibleState.Collapsed,
        note.filePath,
        "note"
      );
      item.tooltip = `Updated: ${new Date(note.updatedAt).toLocaleString()}`;
      item.description = refCount === 1 ? "1 ref" : `${refCount} refs`;
      return item;
    });
  }

  private getNoteSections(noteItem: NoteItem): NoteItem[] {
    const noteId = path.basename(noteItem.filePath ?? "", ".md");
    const refs = this.storage.getReferencesForNote(noteId);

    return refs.map((ref) => {
      const baseName = path.basename(ref.file);
      const label = `${baseName}:${ref.line}`;

      const item = new NoteItem(
        label,
        vscode.TreeItemCollapsibleState.None,
        noteItem.filePath,
        "reference",
        ref.file,
        ref.line
      );

      item.tooltip = ref.annotation || ref.file;
      item.description = ref.annotation
        ? ref.annotation.substring(0, 50) +
          (ref.annotation.length > 50 ? "..." : "")
        : "";
      item.command = {
        command: createCommandName("goToReference"),
        title: "Go to Reference",
        arguments: [ref.file, ref.line, noteItem.filePath, ref.id],
      };

      return item;
    });
  }
}
