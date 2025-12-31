// extension.ts
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { NOTES_DIR } from "./constants";
import { createCommandName } from "./utils";
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
} from "./commands";
import { NoteReference } from "./types";
import { initCodeLensProvider } from "./codelens";

export function activate(context: vscode.ExtensionContext) {
  // Ensure notes directory exists
  if (!fs.existsSync(NOTES_DIR)) {
    fs.mkdirSync(NOTES_DIR, { recursive: true });
  }

  const noteIndex: Record<string, NoteReference> = {};
  context.workspaceState.update("noteIndex", noteIndex);

  initCodeLensProvider(context);

  // Initialize tree view
  const notesTreeProvider = new NotesTreeProvider();
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
  const openNotesDir = getOpenNotesDirCommand();
  const refreshTree = gerRefreshTreeCommand(notesTreeProvider);
  const deleteNote = getDeleteNoteCommand(
    context,
    notesTreeProvider,
    updateStatusBar
  );
  const openNoteFromTree = getOpenNoteFromTreeCommand(context, updateStatusBar);
  const viewNoteAt = getViewNoteAtCommand();

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
    openNoteFromTree,
    treeView,
    statusBarItem
  );
}

export function deactivate() {}
