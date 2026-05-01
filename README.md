# Codebase Notebook 📝

Codebase Notebook is a VS Code extension that lets you take structured notes across your codebase and quickly jump between code and the notes that describe it.

## ✨ Features

### 📂 Notes Sidebar View

- Browse all notes in a tree view
- Open, preview, and delete notes
- Drag-and-drop reorder references within notes
- Pin/favorite key references to surface them first
- Tag-based filtering and archive toggle
- Inline actions: pin, tag, archive, comment, delete

### 📸 UI Overview

![Example](https://raw.githubusercontent.com/Kyonru/code-notes/main/preview.gif)

- Activity Bar → Codebase Notebook
- Sidebar tree listing all your notes
- Right-click context menu in editor with full command access
- Commands available in the view header & context menu

### 🧭 Code References

- Attach notes to specific files + line numbers
- Jump directly back to referenced code via CodeLens
- Bulk add references — select multiple ranges or files at once
- Auto-update line numbers when code shifts (file change watcher)
- Hover preview — see annotation when hovering over referenced lines

### 🤖 AI-Powered (Chat Participant)

Use `@notebook` in VS Code Chat with these commands:

| Command                   | Description                                                          |
| ------------------------- | -------------------------------------------------------------------- |
| `@notebook /annotate`     | Generate an annotation for the selected code and add it to your note |
| `@notebook /summarize`    | Summarize all references in the current note                         |
| `@notebook /relate`       | Find relationships between references in a note                      |
| `@notebook /diff`         | Compare code at a reference with its current state                   |
| `@notebook /suggest-note` | Suggest which note a code snippet belongs to                         |

Additional AI commands (Command Palette):

| Command                                             | Description                                                |
| --------------------------------------------------- | ---------------------------------------------------------- |
| `Codebase Notebook: Suggest Note`                   | AI suggests which note fits the current code (Cmd+Shift+K) |
| `Codebase Notebook: Auto-Tag Note (AI)`             | Suggest tags for a note based on its references            |
| `Codebase Notebook: Ask Notes (AI)`                 | Ask questions about your notes ("Which note covers auth?") |
| `Codebase Notebook: Refresh Stale Annotations (AI)` | Detect changed code and regenerate annotations             |

### 🏷️ Organization

- **Tags/labels** — Add tags like `#auth`, `#perf`, `#bug` for filtering
- **Archive notes** — Hide completed research without deleting
- **Note templates** — Start from Bug Investigation, Code Review, Feature Exploration, Architecture Decision, or Learning Notes
- **Note comments/threads** — Add conversation threads on any reference

### 📤 Export & Sharing

- **Export to Markdown** — Generate a standalone document with embedded code snippets
- **Import from clipboard** — Paste markdown and auto-detect file references
- **Share via workspace** — Store notes in `.codenotes/` for git-committed team sharing

### 🗺️ Navigation & Discovery

- **Reference graph** — Interactive webview showing how notes connect to files (click to open)
- **References to this file** — See all notes referencing the current file
- **CodeLens** — "View Note" lens on referenced lines
- **Inline completions** — Annotation suggestions as you type

### ✍️ Simple Markdown Notes

- Notes are stored as readable Markdown
- Easy to version, sync, and share
- You own your notes (no database, no vendor lock)

## ⚙️ Configuration

| Setting                             | Description                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `crosscodenotes.notesDirectory`     | Custom directory for storing notes (supports `~`). Leave empty for default.                            |
| `crosscodenotes.useWorkspaceFolder` | Store notes in `.codenotes/` inside the workspace root for team sharing.                               |
| `crosscodenotes.modelFamily`        | Preferred AI model family (e.g., `gpt-4o`, `claude-sonnet`). Leave empty to choose from all available. |

## 🎯 Core Commands

| Command                                        | Description                                     |
| ---------------------------------------------- | ----------------------------------------------- |
| `Codebase Notebook: Create Note`               | Create a new note                               |
| `Codebase Notebook: Create Note from Template` | Create from a predefined template               |
| `Codebase Notebook: Select Note`               | Switch the active note                          |
| `Codebase Notebook: Add Reference`             | Attach a code reference to a note               |
| `Codebase Notebook: Bulk Add References`       | Add multiple references at once                 |
| `Codebase Notebook: Go to Reference`           | Jump to referenced file + line                  |
| `Codebase Notebook: View Note`                 | Open preview of current note                    |
| `Codebase Notebook: Search Notes`              | Search existing notes                           |
| `Codebase Notebook: Export Note`               | Export a note as Markdown or to clipboard       |
| `Codebase Notebook: References to This File`   | Show notes referencing the active file          |
| `Codebase Notebook: Show Reference Graph`      | Open interactive reference graph                |
| `Codebase Notebook: Toggle Workspace Storage`  | Switch between global and `.codenotes/` storage |
| `Codebase Notebook: Add Tag`                   | Add a tag to a note                             |
| `Codebase Notebook: Filter by Tag`             | Filter tree view by tag                         |
| `Codebase Notebook: Archive/Unarchive Note`    | Archive or restore a note                       |
| `Codebase Notebook: Import from Clipboard`     | Import references from clipboard markdown       |
| `Codebase Notebook: Add Comment`               | Add a comment to a reference                    |
| `Codebase Notebook: View Comments`             | View/delete comments on a reference             |
| `Codebase Notebook: Change Notes Directory`    | Select / change the directory used for notes    |
| `Codebase Notebook: Open Notes Directory`      | Open storage folder for notes                   |
| `Codebase Notebook: Delete Note`               | Remove note                                     |
| `Codebase Notebook: Refresh Notes`             | Reload the notes list                           |

You'll find most actions in:

- Command Palette (Cmd/Ctrl + Shift + P)
- Codebase Notebook sidebar
- Editor right-click context menu
- Tree item inline buttons

## ⌨️ Keybindings

| Action                    | Windows / Linux    | macOS             |
| ------------------------- | ------------------ | ----------------- |
| Add Reference to Notebook | `Ctrl + Shift + J` | `Cmd + Shift + J` |
| Suggest Note (AI)         | `Ctrl + Shift + K` | `Cmd + Shift + K` |

## 🗂️ Where are notes stored?

Notes are stored locally in a Markdown directory (managed by the extension). They're human readable and version-control friendly.

With **workspace storage** enabled (`crosscodenotes.useWorkspaceFolder`), notes live in `.codenotes/` at your repo root — commit and share with your team.

## ❤️ Sponsor

If this helps your workflow, consider sponsoring:
👉 <https://github.com/sponsors/kyonru>

## 🏷️ License

MIT — feel free to hack, extend, and share.
