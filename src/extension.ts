// extension.ts
import * as vscode from "vscode";
import * as path from "path";
import { createCommandName, getNotesDir } from "./utils";
import { NotesTreeProvider, NotesTreeDragAndDropController } from "./treeView";
import {
  gerRefreshTreeCommand,
  getAddReferenceCommand,
  getAddTagCommand,
  getApplyAnnotatedReferenceCommand,
  getArchiveNoteCommand,
  getBulkAddReferencesCommand,
  getCreateNoteCommand,
  getCreateNoteFromTemplateCommand,
  getDeleteNoteCommand,
  getFilterByTagCommand,
  getGoToReferenceCommand,
  getImportFromClipboardCommand,
  getOpenNoteFromTreeCommand,
  getOpenNotesDirCommand,
  getRemoveTagCommand,
  getSelectNoteCommand,
  getSuggestNoteCommand,
  getTogglePinReferenceCommand,
  getToggleShowArchivedCommand,
  getUnarchiveNoteCommand,
  getViewNoteAtCommand,
  getViewNoteCommand,
  getSearchNotesCommand,
  getChangeNotesDirectoryCommand,
  getReferencesToThisFileCommand,
  getToggleWorkspaceStorageCommand,
  getAddCommentCommand,
  getViewCommentsCommand,
  getExportNoteCommand,
  getAutoTagCommand,
  getAskNotesCommand,
  getRefreshStaleAnnotationsCommand,
} from "./commands";
import { registerChatParticipant } from "./chat";
import { initCodeLensProvider, NotesCodeLensProvider } from "./codelens";
import { initHoverProvider } from "./hoverProvider";
import { getShowReferenceGraphCommand } from "./graphView";
import { initInlineCompletionProvider } from "./inlineCompletion";
import { NotesStorage } from "./storage";
import { migrateIfNeeded } from "./migration";
import { initLineTracker } from "./lineTracker";

export function activate(context: vscode.ExtensionContext) {
  const notesDir = getNotesDir(context);

  const storage = new NotesStorage(notesDir);

  // Run migration then initialize storage (async, but we fire-and-forget with
  // a then-chain so the tree refreshes after both complete)
  migrateIfNeeded(notesDir)
    .then(() => storage.initialize())
    .then(() => {
      vscode.commands.executeCommand(createCommandName("refreshTree"));
    });

  const provider = new NotesCodeLensProvider(storage);
  initCodeLensProvider(context, provider);

  const notesTreeProvider = new NotesTreeProvider(context, storage);
  const dragAndDropController = new NotesTreeDragAndDropController(
    storage,
    notesTreeProvider,
  );
  const treeView = vscode.window.createTreeView("codeNotesView", {
    treeDataProvider: notesTreeProvider,
    dragAndDropController,
  });

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
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

  const createNote = getCreateNoteCommand(context, storage, notesTreeProvider);
  const createNoteFromTemplate = getCreateNoteFromTemplateCommand(context, storage, notesTreeProvider);
  const selectNote = getSelectNoteCommand(context, storage, notesTreeProvider);
  const addReference = getAddReferenceCommand(
    context,
    storage,
    notesTreeProvider,
  );
  const goToReference = getGoToReferenceCommand();
  const viewNote = getViewNoteCommand(context);
  const openNotesDir = getOpenNotesDirCommand(context);
  const refreshTree = gerRefreshTreeCommand(notesTreeProvider, provider);
  const deleteNote = getDeleteNoteCommand(
    context,
    storage,
    notesTreeProvider,
    updateStatusBar,
  );
  const openNoteFromTree = getOpenNoteFromTreeCommand(context, updateStatusBar);
  const viewNoteAt = getViewNoteAtCommand();
  const searchNotes = getSearchNotesCommand(storage);
  const changeNotesDirectory = getChangeNotesDirectoryCommand(
    context,
    storage,
    notesTreeProvider,
    provider,
  );
  const applyAnnotatedReference = getApplyAnnotatedReferenceCommand(
    storage,
    notesTreeProvider,
    provider,
  );
  const suggestNote = getSuggestNoteCommand(
    context,
    storage,
    notesTreeProvider,
    provider,
  );
  const togglePinReference = getTogglePinReferenceCommand(
    storage,
    notesTreeProvider,
  );
  const bulkAddReferences = getBulkAddReferencesCommand(
    context,
    storage,
    notesTreeProvider,
    provider,
  );
  const addTag = getAddTagCommand(storage, notesTreeProvider);
  const removeTag = getRemoveTagCommand(storage, notesTreeProvider);
  const filterByTag = getFilterByTagCommand(context, storage, notesTreeProvider);
  const archiveNote = getArchiveNoteCommand(context, storage, notesTreeProvider);
  const unarchiveNote = getUnarchiveNoteCommand(storage, notesTreeProvider);
  const toggleShowArchived = getToggleShowArchivedCommand(context, notesTreeProvider);
  const importFromClipboard = getImportFromClipboardCommand(
    context,
    storage,
    notesTreeProvider,
    provider,
  );

  registerChatParticipant(context, storage);
  initInlineCompletionProvider(context, storage);
  initLineTracker(context, storage);
  initHoverProvider(context, storage);

  updateStatusBar();

  context.subscriptions.push(
    createNote,
    createNoteFromTemplate,
    selectNote,
    addReference,
    goToReference,
    viewNote,
    openNotesDir,
    refreshTree,
    deleteNote,
    viewNoteAt,
    changeNotesDirectory,
    searchNotes,
    openNoteFromTree,
    applyAnnotatedReference,
    suggestNote,
    togglePinReference,
    bulkAddReferences,
    addTag,
    removeTag,
    filterByTag,
    archiveNote,
    unarchiveNote,
    toggleShowArchived,
    importFromClipboard,
    getShowReferenceGraphCommand(storage),
    getReferencesToThisFileCommand(storage),
    getToggleWorkspaceStorageCommand(context, storage, notesTreeProvider, provider),
    getAddCommentCommand(storage, notesTreeProvider),
    getViewCommentsCommand(storage),
    getExportNoteCommand(context, storage),
    getAutoTagCommand(storage, notesTreeProvider),
    getAskNotesCommand(storage),
    getRefreshStaleAnnotationsCommand(storage, notesTreeProvider, provider),
    treeView,
    statusBarItem,
  );
}

export function deactivate() {}
