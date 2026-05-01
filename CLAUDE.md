# CLAUDE.md

## Project Overview

**Codebase Notebook** (`crosscodenotes`) is a VS Code extension that lets developers take structured, markdown-based notes anchored to specific lines of code across a codebase. Notes are stored as JSON index + individual `.md` files.

- **Publisher:** SolenodonteLabs
- **Repository:** https://github.com/Kyonru/code-notes.git
- **Engine:** VS Code `^1.107.0`
- **Language:** TypeScript (strict mode, ES2022 target)

## Build & Development

```bash
npm run compile       # tsc -p ./
npm run watch         # tsc -watch -p ./ (use for development)
npm run lint          # eslint src
npm run test          # vscode-test (requires VS Code test runner)
npx tsc --noEmit     # type-check without emitting
```

The compiled output goes to `out/`. Entry point is `out/extension.js`.

## Project Structure

```
src/
  extension.ts        # Activation, registers all commands/providers
  commands.ts         # All command implementations (~2000+ lines)
  storage.ts          # NotesStorage class (CRUD, comments, references)
  treeView.ts         # TreeDataProvider + DragAndDropController
  types.ts            # NoteEntry, ReferenceEntry, ReferenceComment, NoteIndex
  codelens.ts         # CodeLensProvider for annotated lines
  inlineCompletion.ts # InlineCompletionProvider
  chat.ts             # ChatParticipant (@notebook) with slash commands
  utils.ts            # Shared utilities
  constants.ts        # Constant values
  migration.ts        # Schema migration logic
  test/
    extension.test.ts # Tests (mocha)
```

## Key Architecture

- **Storage:** JSON index file (`notes.index.json`) + one `.md` file per note. Storage location is configurable (global, custom dir, or `.codenotes/` in workspace).
- **TreeView:** Hierarchical (notes → references). Context values: `note`, `note-archived`, `reference`, `reference-pinned`, `reference-commented`, `reference-pinned-commented`.
- **AI Features:** Uses VS Code Language Model API (`vscode.lm`). Model selection is configurable via `crosscodenotes.modelFamily` setting with fallback QuickPick. Shared `selectModel()` helper in commands.ts.
- **Chat Participant:** `@notebook` with commands: `/annotate`, `/summarize`, `/relate`, `/diff`, `/suggest-note`.
- **Graph View:** WebviewPanel with HTML5 Canvas force-directed graph showing reference relationships.

## Settings

| Setting                             | Purpose                               |
| ----------------------------------- | ------------------------------------- |
| `crosscodenotes.notesDirectory`     | Custom storage directory              |
| `crosscodenotes.useWorkspaceFolder` | Store in `.codenotes/` (git-friendly) |
| `crosscodenotes.modelFamily`        | Preferred AI model family             |

## Data Types

```typescript
NoteEntry { id, name, filePath, createdAt, updatedAt, tags?, archived? }
ReferenceEntry { id, noteId, file, line, annotation, codeSnippet, language, addedAt, pinned?, sortOrder?, comments? }
ReferenceComment { id, text, createdAt }
NoteIndex { schemaVersion, notes: Record<string, NoteEntry>, references: Record<string, ReferenceEntry> }
```

## Conventions

- All commands are factory functions (`getXxxCommand`) in `commands.ts` that return the handler function.
- Commands are registered in `extension.ts` via `vscode.commands.registerCommand`.
- Command IDs follow pattern: `crosscodenotes.commandName`.
- Tree item context values drive conditional menu visibility in `package.json` `when` clauses.
- ESLint config uses typescript-eslint with camelCase/PascalCase imports, curly braces, eqeqeq, no-throw-literal, semi.

## Important Workflow Rules

- **Always update README.md** when adding new commands, settings, or features. The README contains a commands table and features list that must stay in sync.
- **Always update package.json** `contributes.commands` and relevant menus when adding new commands.
- **Always register commands** in `extension.ts` after creating them in `commands.ts`.
- **Validate before committing:** Run `npx tsc --noEmit` to type-check and verify `package.json` is valid JSON.
- **Test contextValue changes:** When modifying tree item context values, update all `when` clauses in `package.json` menus.
