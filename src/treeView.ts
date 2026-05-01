import * as vscode from "vscode";
import * as path from "path";
import { createCommandName } from "./utils";
import { NotesStorage } from "./storage";

const MIME_TYPE = "application/vnd.code.tree.codenotesview";

export class NoteItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly filePath?: string,
    public readonly type?: "note" | "reference",
    public readonly referencePath?: string,
    public readonly lineNumber?: number,
    public readonly referenceId?: string
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
    const tagFilter = this.context.workspaceState.get<string>("tagFilter");
    const showArchived = this.context.workspaceState.get<boolean>("showArchived") ?? false;
    let notes = tagFilter
      ? this.storage.getNotesByTag(tagFilter)
      : showArchived
        ? this.storage.getAllNotesIncludingArchived()
        : this.storage.getNotes();

    return notes.map((note) => {
      const refCount = this.storage.getReferencesForNote(note.id).length;
      const tags = note.tags && note.tags.length > 0
        ? note.tags.map((t) => `#${t}`).join(" ")
        : "";
      const archivedLabel = note.archived ? " $(archive)" : "";
      const item = new NoteItem(
        note.name,
        vscode.TreeItemCollapsibleState.Collapsed,
        note.filePath,
        "note"
      );
      if (note.archived) {
        item.iconPath = new vscode.ThemeIcon("archive");
        item.contextValue = "note-archived";
      }
      item.tooltip = `Updated: ${new Date(note.updatedAt).toLocaleString()}${tags ? `\nTags: ${tags}` : ""}${note.archived ? "\n(Archived)" : ""}`;
      item.description = `${refCount === 1 ? "1 ref" : `${refCount} refs`}${tags ? `  ${tags}` : ""}${archivedLabel}`;
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
        ref.line,
        ref.id
      );

      if (ref.pinned) {
        item.iconPath = new vscode.ThemeIcon("pin");
        item.contextValue = "reference-pinned";
      }

      item.tooltip = ref.annotation || ref.file;
      item.description = (ref.pinned ? "$(pin) " : "") +
        (ref.annotation
          ? ref.annotation.substring(0, 50) +
          (ref.annotation.length > 50 ? "..." : "")
          : "");
      item.command = {
        command: createCommandName("goToReference"),
        title: "Go to Reference",
        arguments: [ref.file, ref.line, noteItem.filePath, ref.id],
      };

      return item;
    });
  }
}

export class NotesTreeDragAndDropController
  implements vscode.TreeDragAndDropController<NoteItem> {
  readonly dropMimeTypes = [MIME_TYPE];
  readonly dragMimeTypes = [MIME_TYPE];

  constructor(
    private readonly storage: NotesStorage,
    private readonly treeProvider: NotesTreeProvider
  ) { }

  handleDrag(
    source: readonly NoteItem[],
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): void {
    const item = source[0];
    if (item?.type === "reference" && item.referenceId) {
      dataTransfer.set(
        MIME_TYPE,
        new vscode.DataTransferItem(item.referenceId)
      );
    }
  }

  async handleDrop(
    target: NoteItem | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const draggedRefId = dataTransfer.get(MIME_TYPE)?.value as
      | string
      | undefined;
    if (!draggedRefId || !target) {
      return;
    }

    // Determine the note we're reordering within
    let noteId: string | undefined;
    if (target.type === "note") {
      // Dropped on a note — move to end of that note
      noteId = path.basename(target.filePath ?? "", ".md");
    } else if (target.type === "reference") {
      // Dropped on a reference — reorder within the same note
      noteId = path.basename(target.filePath ?? "", ".md");
    }

    if (!noteId) {
      return;
    }

    const refs = this.storage.getReferencesForNote(noteId);
    const orderedIds = refs.map((r) => r.id);

    // Remove the dragged item from its current position
    const fromIdx = orderedIds.indexOf(draggedRefId);
    if (fromIdx === -1) {
      return;
    }
    orderedIds.splice(fromIdx, 1);

    // Insert at the target position
    if (target.type === "reference" && target.referenceId) {
      const toIdx = orderedIds.indexOf(target.referenceId);
      if (toIdx !== -1) {
        orderedIds.splice(toIdx, 0, draggedRefId);
      } else {
        orderedIds.push(draggedRefId);
      }
    } else {
      // Dropped on the note itself — append at end
      orderedIds.push(draggedRefId);
    }

    await this.storage.reorderReferences(noteId, orderedIds);
    this.treeProvider.refresh();
  }
}
