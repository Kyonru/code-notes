// extension.ts
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { createCommandName, getNotesDir } from "./utils";
import { NotesTreeProvider } from "./treeView";
import {
  gerRefreshTreeCommand,
  getAddReferenceCommand,
  getCreateNoteCommand,
  getDeleteNoteCommand,
  getGoToReferenceCommand,
  getOpenNoteFromTreeCommand,
  getOpenNotesDirCommand,
  getSelectNoteCommand,
  getViewNoteAtCommand,
  getViewNoteCommand,
  getSearchNotesCommand,
} from "./commands";
import { NoteReference } from "./types";
import { initCodeLensProvider, NotesCodeLensProvider } from "./codelens";

const init = async (context: vscode.ExtensionContext) => {
  if (!fs.existsSync(getNotesDir(context))) {
    fs.mkdirSync(getNotesDir(context), { recursive: true });
  }

  const noteIndex: Record<string, NoteReference> = {};
  await context.workspaceState.update("noteIndex", noteIndex);
};

export function activate(context: vscode.ExtensionContext) {
  init(context);

  const provider = new NotesCodeLensProvider(context);

  initCodeLensProvider(context, provider);

  // Initialize tree view
  const notesTreeProvider = new NotesTreeProvider(context);
  const treeView = vscode.window.createTreeView("codeNotesView", {
    treeDataProvider: notesTreeProvider,
  });

  // Status bar item showing current note
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = createCommandName("selectNote");

  const updateStatusBar = () => {
    const currentNote = context.workspaceState.get<string>("currentNote");
    if (currentNote) {
      statusBarItem.text = `$(note) ${path.basename(currentNote)}`;
      statusBarItem.tooltip = "Click to change note";
    } else {
      statusBarItem.text = "$(note) No note selected";
      statusBarItem.tooltip = "Click to select a note";
    }
    statusBarItem.show();
  };

  const createNote = getCreateNoteCommand(context, notesTreeProvider);
  const selectNote = getSelectNoteCommand(context, notesTreeProvider);
  const addReference = getAddReferenceCommand(context, notesTreeProvider);
  const goToReference = getGoToReferenceCommand();
  const viewNote = getViewNoteCommand(context);
  const openNotesDir = getOpenNotesDirCommand(context);
  const refreshTree = gerRefreshTreeCommand(notesTreeProvider, provider);
  const deleteNote = getDeleteNoteCommand(
    context,
    notesTreeProvider,
    updateStatusBar
  );
  const openNoteFromTree = getOpenNoteFromTreeCommand(context, updateStatusBar);
  const viewNoteAt = getViewNoteAtCommand();
  const searchNotes = getSearchNotesCommand(context);

  updateStatusBar();

  context.subscriptions.push(
    createNote,
    selectNote,
    addReference,
    goToReference,
    viewNote,
    openNotesDir,
    refreshTree,
    deleteNote,
    viewNoteAt,
    searchNotes,
    openNoteFromTree,
    treeView,
    statusBarItem
  );

  vscode.commands.executeCommand(createCommandName("refreshTree"));
}

export function deactivate() {}
