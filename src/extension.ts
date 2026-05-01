// extension.ts
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
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
  getDeleteAnnotationCommand,
  getSetAiApiKeyCommand,
  getClearAiApiKeyCommand,
  getQuickAddCommand,
  getDetectBrokenReferencesCommand,
  detectBrokenReferences,
  getViewHistoryCommand,
  getSemanticSearchCommand,
  getAutoAnnotateCommand,
  getSmartLinkingCommand,
  getAnnotationQualityCommand,
  getCodeReviewAssistantCommand,
} from "./commands";
import { registerChatParticipant } from "./chat";
import { initCodeLensProvider, NotesCodeLensProvider } from "./codelens";
import { initHoverProvider } from "./hoverProvider";
import { getShowReferenceGraphCommand } from "./graphView";
import { getShowTimelineCommand } from "./timelineView";
import { initInlineCompletionProvider } from "./inlineCompletion";
import { NotesStorage } from "./storage";
import { migrateIfNeeded } from "./migration";
import { initLineTracker } from "./lineTracker";
import { initLMProvider } from "./lm";

export function activate(context: vscode.ExtensionContext) {
  const notesDir = getNotesDir(context);

  initLMProvider(context);

  const storage = new NotesStorage(notesDir);

  // Run migration then initialize storage (async, but we fire-and-forget with
  // a then-chain so the tree refreshes after both complete)
  migrateIfNeeded(notesDir)
    .then(() => storage.initialize())
    .then(() => {
      vscode.commands.executeCommand(createCommandName("refreshTree"));
      // Scan for broken references silently on workspace open
      detectBrokenReferences(storage, notesTreeProvider, provider, true);
      // Update stale/broken badge
      updateBadge();
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

  // Stale/broken annotation badge
  const badgeItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    99,
  );
  badgeItem.command = createCommandName("refreshStaleAnnotations");

  const updateBadge = () => {
    const allRefs = storage.getAllReferences();
    let staleCount = 0;
    let brokenCount = 0;

    for (const ref of allRefs) {
      if (!fs.existsSync(ref.file)) {
        brokenCount++;
        continue;
      }
      if (!ref.codeSnippet) {
        continue;
      }
      try {
        const content = fs.readFileSync(ref.file, "utf-8");
        const lines = content.split(/\r?\n/);
        const lineIdx = ref.line - 1;
        if (lineIdx < 0 || lineIdx >= lines.length) {
          continue;
        }
        const snippetLines = ref.codeSnippet.split(/\r?\n/).length;
        const start = Math.max(0, lineIdx);
        const end = Math.min(lines.length, lineIdx + snippetLines);
        const currentCode = lines.slice(start, end).join("\n");
        if (currentCode.trim() !== ref.codeSnippet.trim()) {
          staleCount++;
        }
      } catch {
        continue;
      }
    }

    const total = staleCount + brokenCount;
    if (total > 0) {
      const parts: string[] = [];
      if (staleCount > 0) {
        parts.push(`${staleCount} stale`);
      }
      if (brokenCount > 0) {
        parts.push(`${brokenCount} broken`);
      }
      badgeItem.text = `$(alert) ${total}`;
      badgeItem.tooltip = `Annotations: ${parts.join(", ")}. Click to fix.`;
      badgeItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      badgeItem.show();
    } else {
      badgeItem.hide();
    }
  };

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
    getShowTimelineCommand(storage),
    getReferencesToThisFileCommand(storage),
    getToggleWorkspaceStorageCommand(context, storage, notesTreeProvider, provider),
    getAddCommentCommand(storage, notesTreeProvider),
    getViewCommentsCommand(storage),
    getExportNoteCommand(context, storage),
    getAutoTagCommand(storage, notesTreeProvider),
    getAskNotesCommand(storage),
    getRefreshStaleAnnotationsCommand(storage, notesTreeProvider, provider),
    getDeleteAnnotationCommand(storage, notesTreeProvider, provider),
    getSetAiApiKeyCommand(),
    getClearAiApiKeyCommand(),
    getQuickAddCommand(context, storage, notesTreeProvider, provider),
    getDetectBrokenReferencesCommand(storage, notesTreeProvider, provider),
    getViewHistoryCommand(storage),
    getSemanticSearchCommand(storage),
    getAutoAnnotateCommand(context, storage, notesTreeProvider, provider),
    getSmartLinkingCommand(storage, notesTreeProvider),
    getAnnotationQualityCommand(storage, notesTreeProvider),
    getCodeReviewAssistantCommand(storage),
    treeView,
    statusBarItem,
    badgeItem,
  );
}

export function deactivate() {}
